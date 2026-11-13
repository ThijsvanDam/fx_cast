import https from "https";


/**
 * Pure helpers for the YouTube Lounge API (the remote-control protocol
 * the YouTube app on Cast devices uses for its queue).
 */

export type LoungeAction = "add" | "playNext" | "remove";

export interface LoungeQueueItem {
    videoId: string;
    title: string;
}

const COMMANDS: Record<LoungeAction, string> = {
    add: "addVideo",
    playNext: "insertVideo",
    remove: "removeVideo"
};

/** Extracts session IDs and the current queue's list ID from a bind reply. */
export function parseBindResponse(text: string): {
    sid?: string;
    gsessionid?: string;
    listId?: string;
} {
    return {
        sid: text.match(/"c","(.*?)","/)?.[1],
        gsessionid: text.match(/"S","(.*?)"]/)?.[1],
        listId: text.match(/"listId":"([^"]+)"/)?.[1]
    };
}

/** Form body for a single queue command. */
export function buildCommandBody(
    action: LoungeAction,
    videoId: string
): Record<string, string> {
    return {
        count: "1",
        ofs: "0",
        req0__sc: COMMANDS[action],
        req0_videoId: videoId
    };
}

/**
 * Remembers which videos fx_cast queued per device. The YouTube queue
 * itself can't be read, so this is all fx_cast can show. A different
 * list ID means a new queue, which clears the memory.
 */
export class LoungeQueueMemory {
    private queues = new Map<
        string,
        { listId?: string; items: LoungeQueueItem[] }
    >();

    apply(
        deviceId: string,
        listId: string | undefined,
        action: LoungeAction,
        item: LoungeQueueItem
    ): LoungeQueueItem[] {
        let queue = this.queues.get(deviceId);
        if (!queue || (listId && queue.listId && queue.listId !== listId)) {
            queue = { listId, items: [] };
            this.queues.set(deviceId, queue);
        }
        queue.listId = listId ?? queue.listId;

        const isQueued = queue.items.some(i => i.videoId === item.videoId);
        switch (action) {
            case "add":
                if (!isQueued) queue.items.push(item);
                break;
            case "playNext":
                if (!isQueued) queue.items.unshift(item);
                break;
            case "remove":
                queue.items = queue.items.filter(
                    i => i.videoId !== item.videoId
                );
                break;
        }

        return [...queue.items];
    }

    get(deviceId: string): LoungeQueueItem[] {
        return [...(this.queues.get(deviceId)?.items ?? [])];
    }

    clear(deviceId: string) {
        this.queues.delete(deviceId);
    }
}

/**
 * Client for the YouTube Lounge API: queue commands for the YouTube app
 * running on a Cast device. Unofficial API — errors must stay clear.
 */

export type PostFn = (
    url: string,
    headers: Record<string, string>,
    body: Record<string, string>
) => Promise<{ status: number; text: string }>;

const YOUTUBE_APP_ID = "233637DE";
const MDX_NAMESPACE = "urn:x-cast:com.google.youtube.mdx";
const LOUNGE_BASE = "https://www.youtube.com/api/lounge";
const LOUNGE_TOKEN_HEADER = "X-YouTube-LoungeId-Token";
/** Used when YouTube doesn't say when a token expires. */
const DEFAULT_TOKEN_LIFETIME_MS = 5 * 60 * 1000;

const BIND_DEVICE = {
    device: "REMOTE_CONTROL",
    id: "fxcastcosyremote0000000000",
    name: "fx_cast",
    "mdx-version": "3",
    pairing_type: "cast",
    app: "android-phone-13.14.55"
};

/** Posts a form via Node's https module (no fetch in pkg's Node 16). */
export const httpsPost: PostFn = (url, headers, body) =>
    new Promise((resolve, reject) => {
        const data = new URLSearchParams(body).toString();
        const req = https.request(
            url,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(data),
                    Origin: "https://www.youtube.com/",
                    ...headers
                },
                timeout: 15000
            },
            res => {
                let text = "";
                res.setEncoding("utf8");
                res.on("data", chunk => (text += chunk));
                res.on("end", () =>
                    resolve({ status: res.statusCode ?? 0, text })
                );
            }
        );
        req.on("timeout", () => req.destroy(new Error("YouTube timed out")));
        req.on("error", reject);
        req.end(data);
    });

/** Asks the YouTube app on a Cast device for its lounge screen ID. */
export async function castScreenId(host: string): Promise<string> {
    const { Client } = await import("castv2");

    return new Promise((resolve, reject) => {
        const client = new Client();
        const finish = (fn: () => void) => {
            clearTimeout(timeoutId);
            client.close();
            fn();
        };
        const timeoutId = setTimeout(
            () => finish(() => reject(new Error("Device didn't answer"))),
            10000
        );

        client.on("error", err => finish(() => reject(err)));
        client.connect(host, () => {
            const channel = (destination: string, namespace: string) =>
                client.createChannel(
                    "sender-fxcast-lounge",
                    destination,
                    namespace,
                    "JSON"
                );

            channel(
                "receiver-0",
                "urn:x-cast:com.google.cast.tp.connection"
            ).send({ type: "CONNECT" });
            const receiver = channel(
                "receiver-0",
                "urn:x-cast:com.google.cast.receiver"
            );

            receiver.once("message", (message: any) => {
                const app = message.status?.applications?.[0];
                if (app?.appId !== YOUTUBE_APP_ID) {
                    finish(() =>
                        reject(new Error("YouTube isn't running on this device"))
                    );
                    return;
                }

                channel(
                    app.transportId,
                    "urn:x-cast:com.google.cast.tp.connection"
                ).send({ type: "CONNECT" });
                const mdx = channel(app.transportId, MDX_NAMESPACE);
                mdx.on("message", (reply: any) => {
                    if (reply.type !== "mdxSessionStatus") return;
                    finish(() => resolve(reply.data.screenId));
                });
                mdx.send({ type: "getMdxSessionStatus" });
            });
            receiver.send({ type: "GET_STATUS", requestId: 1 });
        });
    });
}

export class YouTubeLounge {
    private post: PostFn;
    private getScreenId: (host: string) => Promise<string>;
    private now: () => number;

    private tokens = new Map<string, { token: string; expiresAt: number }>();
    private memory = new LoungeQueueMemory();

    constructor(deps: {
        post?: PostFn;
        getScreenId?: (host: string) => Promise<string>;
        now?: () => number;
    } = {}) {
        this.post = deps.post ?? httpsPost;
        this.getScreenId = deps.getScreenId ?? castScreenId;
        this.now = deps.now ?? Date.now;
    }

    /** Sends a queue command; returns what fx_cast has queued there. */
    async queueCommand(opts: {
        deviceId: string;
        host: string;
        action: LoungeAction;
        videoId: string;
        title: string;
    }): Promise<LoungeQueueItem[]> {
        const screenId = await this.getScreenId(opts.host);
        const token = await this.getLoungeToken(screenId);

        // Re-bind for every command; lounge sessions go stale quickly
        const bind = await this.post(
            `${LOUNGE_BASE}/bc/bind?RID=0&VER=8&CVER=1`,
            { [LOUNGE_TOKEN_HEADER]: token },
            BIND_DEVICE
        );
        if (bind.status !== 200) throw rejected(bind.status);

        const { sid, gsessionid, listId } = parseBindResponse(bind.text);
        if (!sid || !gsessionid) {
            throw new Error("Couldn't connect to YouTube on this device");
        }

        const command = await this.post(
            `${LOUNGE_BASE}/bc/bind?${new URLSearchParams({
                SID: sid,
                gsessionid,
                RID: "1",
                VER: "8",
                CVER: "1"
            })}`,
            { [LOUNGE_TOKEN_HEADER]: token },
            buildCommandBody(opts.action, opts.videoId)
        );
        if (command.status !== 200) throw rejected(command.status);

        return this.memory.apply(opts.deviceId, listId, opts.action, {
            videoId: opts.videoId,
            title: opts.title
        });
    }

    /** What fx_cast has queued on a device (YouTube's queue is unreadable). */
    getQueue(deviceId: string) {
        return this.memory.get(deviceId);
    }

    private async getLoungeToken(screenId: string): Promise<string> {
        const cached = this.tokens.get(screenId);
        if (cached && cached.expiresAt > this.now()) return cached.token;

        const res = await this.post(
            `${LOUNGE_BASE}/pairing/get_lounge_token_batch`,
            {},
            { screen_ids: screenId }
        );
        if (res.status !== 200) throw rejected(res.status);

        const screen = JSON.parse(res.text).screens?.[0];
        if (!screen?.loungeToken) {
            throw new Error("Couldn't connect to YouTube on this device");
        }

        this.tokens.set(screenId, {
            token: screen.loungeToken,
            expiresAt: screen.expiration
                ? Number(screen.expiration)
                : this.now() + DEFAULT_TOKEN_LIFETIME_MS
        });
        return screen.loungeToken;
    }
}

function rejected(status: number) {
    return new Error(`YouTube rejected the request (HTTP ${status})`);
}

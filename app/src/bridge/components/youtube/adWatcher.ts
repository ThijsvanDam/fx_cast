import https from "https";

import { parseLoungeChunks, YouTubeAd, YouTubeAdTracker } from "./adTracker";
import {
    AuthError,
    httpsPost,
    LOUNGE_BASE,
    LOUNGE_TOKEN_HEADER,
    parseBindResponse,
    rejected
} from "./lounge";

/** Own remote ID so this session doesn't replace the queue client's. */
const WATCH_DEVICE = {
    device: "REMOTE_CONTROL",
    id: "fxcastadwatch0000000000000",
    name: "fx_cast",
    "mdx-version": "3",
    pairing_type: "cast",
    app: "android-phone-13.14.55"
};

const MIN_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;
/** YouTube ends a long-poll on its own; this only catches dead sockets. */
const POLL_TIMEOUT_MS = 5 * 60_000;

interface Session {
    token: string;
    sid: string;
    gsessionid: string;
    /** Last event ID seen (AID). */
    lastId: number;
    /** Next request ID and command offset. */
    rid: number;
    ofs: number;
}

/**
 * Follows the YouTube app on one device through a long-lived Lounge
 * session: reports ads and skips them once allowed (if auto-skip is on).
 */
export class YouTubeAdWatcher {
    private tracker = new YouTubeAdTracker();
    private session?: Session;
    private request?: ReturnType<typeof https.get>;
    private isStopped = false;
    private wakeUp?: () => void;

    constructor(
        private host: string,
        private opts: {
            getToken: (host: string, refresh: boolean) => Promise<string>;
            onAd: (ad: YouTubeAd | null) => void;
            autoSkip: boolean;
        }
    ) {
        this.tracker.autoSkip = opts.autoSkip;
    }

    set autoSkip(enabled: boolean) {
        this.tracker.autoSkip = enabled;
    }

    start() {
        this.run().catch(err =>
            console.error("YouTube ad watcher stopped:", err)
        );
    }

    stop() {
        this.isStopped = true;
        this.request?.destroy();
        this.wakeUp?.();
        if (this.tracker.ad) this.opts.onAd(null);
    }

    /** Skips the ad playing now (YouTube ignores it if not allowed). */
    async skip() {
        const session = this.session;
        if (!session) throw new Error("Not connected to YouTube on this device");

        const res = await httpsPost(
            `${LOUNGE_BASE}/bc/bind?${new URLSearchParams({
                SID: session.sid,
                gsessionid: session.gsessionid,
                RID: String(session.rid++),
                VER: "8",
                CVER: "1"
            })}`,
            { [LOUNGE_TOKEN_HEADER]: session.token },
            { count: "1", ofs: String(session.ofs++), req0__sc: "skipAd" }
        );
        if (res.status !== 200) throw rejected(res.status);
    }

    private async run() {
        let backoff = MIN_BACKOFF_MS;
        let refreshToken = false;

        while (!this.isStopped) {
            try {
                await this.bind(refreshToken);
                refreshToken = false;
                backoff = MIN_BACKOFF_MS;

                // Long-poll until YouTube drops the session
                while (!this.isStopped) await this.poll();
            } catch (err) {
                if (this.isStopped) break;
                this.session = undefined;
                refreshToken = err instanceof AuthError;

                // Can't see the TV: an old ad state would be a lie
                if (this.tracker.ad) {
                    this.tracker.apply(["nowPlaying", {}]);
                    this.opts.onAd(null);
                }

                await this.sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
            }
        }
    }

    private async bind(refreshToken: boolean) {
        const token = await this.opts.getToken(this.host, refreshToken);
        const res = await httpsPost(
            `${LOUNGE_BASE}/bc/bind?RID=0&VER=8&CVER=1`,
            { [LOUNGE_TOKEN_HEADER]: token },
            WATCH_DEVICE
        );
        if (res.status !== 200) throw rejected(res.status);

        const { sid, gsessionid } = parseBindResponse(res.text);
        if (!sid || !gsessionid) {
            throw new Error("Couldn't connect to YouTube on this device");
        }

        const { events, lastId } = parseLoungeChunks(res.text);
        this.session = { token, sid, gsessionid, lastId, rid: 1, ofs: 0 };
        this.handle(events);
    }

    /** One long-poll request; resolves when YouTube ends it. */
    private poll(): Promise<void> {
        const session = this.session;
        if (!session) return Promise.reject(new Error("No session"));

        const url = `${LOUNGE_BASE}/bc/bind?${new URLSearchParams({
            SID: session.sid,
            gsessionid: session.gsessionid,
            RID: "rpc",
            VER: "8",
            CVER: "1",
            TYPE: "xmlhttp",
            CI: "0",
            AID: String(session.lastId)
        })}`;

        return new Promise((resolve, reject) => {
            const req = https.get(
                url,
                {
                    headers: {
                        [LOUNGE_TOKEN_HEADER]: session.token,
                        Origin: "https://www.youtube.com/"
                    },
                    timeout: POLL_TIMEOUT_MS
                },
                res => {
                    if (res.statusCode !== 200) {
                        res.resume();
                        reject(rejected(res.statusCode ?? 0));
                        return;
                    }

                    let buf = "";
                    res.setEncoding("utf8");
                    res.on("data", (data: string) => {
                        const parsed = parseLoungeChunks(buf + data);
                        buf = parsed.rest;
                        if (parsed.lastId > session.lastId) {
                            session.lastId = parsed.lastId;
                        }
                        this.handle(parsed.events);
                    });
                    res.on("end", resolve);
                    res.on("error", reject);
                }
            );
            req.on("timeout", () => req.destroy(new Error("Poll timed out")));
            req.on("error", reject);
            this.request = req;
        });
    }

    private handle(events: [string, any][]) {
        for (const event of events) {
            const { changed, shouldSkip } = this.tracker.apply(event);
            if (changed) this.opts.onAd(this.tracker.ad);
            if (shouldSkip) {
                this.skip().catch(err =>
                    console.error("YouTube auto-skip failed:", err)
                );
            }
        }
    }

    private sleep(ms: number) {
        return new Promise<void>(resolve => {
            const timeoutId = setTimeout(resolve, ms);
            this.wakeUp = () => {
                clearTimeout(timeoutId);
                resolve();
            };
        });
    }
}

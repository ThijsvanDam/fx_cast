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

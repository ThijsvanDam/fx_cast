/**
 * Receivers only report a window of queue items around the current
 * one in `MEDIA_STATUS`. This tracks a full-queue refresh
 * (`QUEUE_GET_ITEM_IDS` → `QUEUE_GET_ITEMS`) so the extension sees
 * every queued item.
 */

/** Item details requested per `QUEUE_GET_ITEMS` message. */
export const MAX_ITEMS_PER_REQUEST = 20;

interface QueueItemLike {
    itemId?: number;
}

export class QueueTracker {
    private pendingIds: number[] = [];
    private received = new Map<number, QueueItemLike>();
    /** Item IDs of the last complete full queue. */
    private knownIds = new Set<number>();
    private mediaSessionId?: number;
    private isRefreshing = false;

    /**
     * Removes the (windowed) `items` from a media status so it can't
     * overwrite the full queue, and says whether to refresh the queue.
     * Only refreshes for a new media session or unknown items: some
     * receivers answer every queue request with a windowed status,
     * which would otherwise loop.
     */
    handleMediaStatus<
        T extends { items?: QueueItemLike[]; mediaSessionId?: number }
    >(status: T): { status: Omit<T, "items">; shouldRefresh: boolean } {
        const { items, ...rest } = status;

        const isNewSession = status.mediaSessionId !== this.mediaSessionId;
        this.mediaSessionId = status.mediaSessionId;

        const hasUnknownItems = !!items?.some(
            item => item.itemId !== undefined && !this.knownIds.has(item.itemId)
        );

        const shouldRefresh =
            items !== undefined &&
            !this.isRefreshing &&
            (isNewSession || hasUnknownItems);
        if (shouldRefresh) this.isRefreshing = true;

        return { status: rest, shouldRefresh };
    }

    /**
     * Starts collecting a new full queue. Returns the item ID chunks to
     * request, or the (empty) queue if there is nothing to request.
     */
    handleItemIds(itemIds: number[]): {
        requests: number[][];
        items?: QueueItemLike[];
    } {
        this.pendingIds = itemIds;
        this.received.clear();

        if (!itemIds.length) {
            this.knownIds = new Set();
            this.isRefreshing = false;
            return { requests: [], items: [] };
        }

        const requests: number[][] = [];
        for (let i = 0; i < itemIds.length; i += MAX_ITEMS_PER_REQUEST) {
            requests.push(itemIds.slice(i, i + MAX_ITEMS_PER_REQUEST));
        }
        return { requests };
    }

    /**
     * Stores received item details. Returns the full queue in item ID
     * order once every pending item has arrived, otherwise null.
     */
    handleItems<T extends QueueItemLike>(items: T[]): T[] | null {
        for (const item of items) {
            if (item.itemId !== undefined && this.pendingIds.includes(item.itemId)) {
                this.received.set(item.itemId, item);
            }
        }

        if (
            !this.pendingIds.length ||
            this.pendingIds.some(id => !this.received.has(id))
        ) {
            return null;
        }

        this.knownIds = new Set(this.pendingIds);
        this.isRefreshing = false;
        return this.pendingIds.map(id => this.received.get(id) as T);
    }
}

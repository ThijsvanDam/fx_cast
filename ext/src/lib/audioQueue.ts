/** Default Media Receiver; the only app with a standard Cast queue. */
const DEFAULT_MEDIA_RECEIVER_APP_ID = "CC1AD845";

interface QueueableAudio {
    url: string;
    title: string;
    thumbnail?: string;
    contentType: string;
}

/**
 * Whether audio can be added to a receiver's queue: only when casting
 * audio only onto a live (playing, paused or buffering) Default Media
 * Receiver media session. A finished (IDLE) session rejects queue
 * requests.
 */
export function canQueueAudio(opts: {
    isAudioOnly: boolean;
    appId?: string;
    mediaSessionId?: number;
    playerState?: string;
}): boolean {
    return (
        opts.isAudioOnly &&
        opts.appId === DEFAULT_MEDIA_RECEIVER_APP_ID &&
        opts.mediaSessionId !== undefined &&
        opts.playerState !== undefined &&
        opts.playerState !== "IDLE"
    );
}

/** Builds a Cast `QUEUE_INSERT` media message appending the audio. */
export function createQueueInsertMessage(
    audio: QueueableAudio,
    mediaSessionId: number
) {
    const metadata: Record<string, unknown> = {
        metadataType: 0,
        title: audio.title
    };
    if (audio.thumbnail) {
        metadata.images = [{ url: audio.thumbnail }];
    }

    return {
        type: "QUEUE_INSERT" as const,
        requestId: 0 as const,
        mediaSessionId,
        items: [
            {
                media: {
                    contentId: audio.url,
                    contentType: audio.contentType,
                    streamType:
                        audio.contentType === "application/x-mpegURL"
                            ? "LIVE"
                            : "BUFFERED",
                    metadata
                },
                autoplay: true
            }
        ] as object[]
    };
}

interface QueueStatus {
    currentItemId?: number;
    items?: {
        itemId?: number;
        media?: { metadata?: { title?: string } };
    }[];
}

/** Queue items after the currently playing one, in play order. */
export function getUpNext(
    status?: QueueStatus
): { itemId: number; title: string }[] {
    const items = status?.items ?? [];
    const currentIndex = items.findIndex(
        item => item.itemId === status?.currentItemId
    );
    if (status?.currentItemId === undefined || currentIndex === -1) return [];

    return items
        .slice(currentIndex + 1)
        .filter(item => item.itemId !== undefined)
        .map(item => ({
            itemId: item.itemId as number,
            title: item.media?.metadata?.title || "Untitled"
        }));
}

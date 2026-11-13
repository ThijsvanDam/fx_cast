import CastClient from "./client";
import { QueueTracker } from "./queueTracker";

import type {
    MediaStatus,
    ReceiverMessage,
    ReceiverMediaMessage,
    ReceiverStatus,
    SenderMediaMessage
} from "./types";

const NS_MEDIA = "urn:x-cast:com.google.cast.media";

interface CastRemoteOptions {
    onApplicationFound?: () => void;
    onApplicationClose?: () => void;
    onReceiverStatusUpdate?: (status: ReceiverStatus) => void;
    onMediaStatusUpdate?: (status?: MediaStatus) => void;
}

/**
 * castv2 client for receiver tracking.
 */
export default class Remote extends CastClient {
    private transportClient?: RemoteTransport;
    /** Transport ID of the app `transportClient` is connected to. */
    private transportId?: string;
    private queueTracker = new QueueTracker();
    private mediaSessionId?: number;

    constructor(private host: string, private options?: CastRemoteOptions) {
        super();
        super
            .connect(host, {
                onReceiverMessage: message => {
                    this.onReceiverMessage(message);
                }
            })
            .then(() => {
                this.sendReceiverMessage({ type: "GET_STATUS" });
            })
            .catch(err => {
                // An unreachable receiver must not crash the bridge
                console.error(`Failed to connect to receiver (${host}):`, err);
            });
    }

    disconnect() {
        super.disconnect();
        this.transportClient?.disconnect();
    }

    sendMediaMessage(message: SenderMediaMessage) {
        this.transportClient?.sendMediaMessage(message);

        // Keep the full queue current after queue commands
        if (message.type.startsWith("QUEUE_")) {
            this.requestQueue();
        }
    }

    /** Fetches the full queue (status only reports a window of it). */
    private requestQueue() {
        if (this.mediaSessionId === undefined) return;
        this.transportClient?.sendMediaMessage({
            type: "QUEUE_GET_ITEM_IDS",
            requestId: 0,
            mediaSessionId: this.mediaSessionId
        } as unknown as SenderMediaMessage);
    }

    /**
     * Handle `NS_RECEIVER` messages from the receiver device.
     * On initial connection, a `GET_STATUS` message is sent that
     * results in a `RECEIVER_STATUS` response. If an application
     * is running, get the transport ID and make a connection to
     * receive media status updates.
     */
    private onReceiverMessage(message: ReceiverMessage) {
        if (message.type !== "RECEIVER_STATUS") {
            return;
        }

        const application = message.status.applications?.[0];

        // Another app replaced the tracked one: drop the stale transport
        if (
            application &&
            this.transportClient &&
            this.transportId !== application.transportId
        ) {
            this.transportClient.disconnect();
            this.transportClient = undefined;
        }
        if (!application || application.isIdleScreen) {
            // Handle app close
            if (this.transportClient) {
                this.transportClient = undefined;
                this.options?.onApplicationClose?.();
            }
        }

        // Update status before possible transport init
        this.options?.onReceiverStatusUpdate?.(message.status);

        // Handle app creation/discovery
        if (application && !this.transportClient) {
            this.transportId = application.transportId;
            this.transportClient = new RemoteTransport(
                application.transportId,
                message => this.onMediaMessage(message)
            );

            this.transportClient.connect(this.host).then(() => {
                this.transportClient?.sendMediaMessage({
                    type: "GET_STATUS",
                    requestId: 0
                });
            })
            .catch(err => {
                console.error(`Failed to connect to transport (${this.host}):`, err);
            });

            this.options?.onApplicationFound?.();
        }
    }

    /**
     * Handle `NS_MEDIA` messages from the receiver application.
     * On initial connection. a `GET_STATUS` message is sent that
     * results in a `MEDIA_STATUS` response.
     */
    private onMediaMessage(message: ReceiverMediaMessage) {
        // Queue messages aren't part of the typed media message union
        const queueMessage = message as unknown as {
            type: string;
            itemIds?: number[];
            items?: unknown[];
        };

        switch (queueMessage.type) {
            // Receiver announces queue changes separately
            case "QUEUE_CHANGE":
                this.requestQueue();
                return;

            case "QUEUE_ITEM_IDS": {
                const { requests, items } = this.queueTracker.handleItemIds(
                    queueMessage.itemIds ?? []
                );
                for (const itemIds of requests) {
                    this.transportClient?.sendMediaMessage({
                        type: "QUEUE_GET_ITEMS",
                        requestId: 0,
                        mediaSessionId: this.mediaSessionId,
                        itemIds
                    } as unknown as SenderMediaMessage);
                }
                if (items) this.sendQueue(items);
                return;
            }

            case "QUEUE_ITEMS": {
                const items = this.queueTracker.handleItems(
                    (queueMessage.items ?? []) as { itemId?: number }[]
                );
                if (items) this.sendQueue(items);
                return;
            }
        }

        if (message.type !== "MEDIA_STATUS") {
            return;
        }

        const status = message.status[0];
        if (!status) return;
        this.mediaSessionId = status.mediaSessionId;

        // Forward without the windowed items; the full queue follows
        const { status: forwarded, shouldRefresh } =
            this.queueTracker.handleMediaStatus(
                status as unknown as {
                    items?: { itemId?: number }[];
                    mediaSessionId?: number;
                }
            );
        this.options?.onMediaStatusUpdate?.(forwarded as MediaStatus);
        if (shouldRefresh) this.requestQueue();
    }

    /** Forwards the full queue as a partial media status update. */
    private sendQueue(items: unknown[]) {
        if (this.mediaSessionId === undefined) return;
        this.options?.onMediaStatusUpdate?.({
            mediaSessionId: this.mediaSessionId,
            items
        } as unknown as MediaStatus);
    }
}

/**
 * castv2 client for receiver application tracking.
 */
class RemoteTransport extends CastClient {
    private mediaChannel = this.createChannel(NS_MEDIA);

    constructor(
        transportId: string,
        onMediaMessage: (message: ReceiverMediaMessage) => void
    ) {
        super(undefined, transportId);
        this.mediaChannel.on("message", message => onMediaMessage(message));
    }

    sendMediaMessage(message: SenderMediaMessage) {
        this.mediaChannel.send(message);
    }
}

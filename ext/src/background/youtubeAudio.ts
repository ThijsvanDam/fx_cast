import bridge from "../lib/bridge";
import { stringify } from "../lib/utils";
import type { Message } from "../messaging";
import type { ReceiverDevice } from "../types";

export interface ResolvedAudio {
    url: string;
    title: string;
    thumbnail?: string;
    contentType: string;
}

/** yt-dlp itself times out after 30s; leave room for bridge startup. */
const RESOLVE_TIMEOUT_MS = 35000;

/**
 * Resolves the audio-only stream of a YouTube page and plays it on the
 * given device with the media sender, skipping receiver selection.
 * Rejects with the resolve error.
 */
export async function startAudioOnlyCast(
    tabId: number,
    pageUrl: string,
    device: ReceiverDevice,
    shouldContinue: () => boolean = () => true
): Promise<void> {
    const audio = await resolveYouTubeAudio(pageUrl);

    // User may have closed the selector (cancelled) while resolving
    if (!shouldContinue()) return;

    await browser.tabs.executeScript(tabId, {
        code: stringify`
                window.mediaUrl = ${audio.url};
                window.mediaTitle = ${audio.title};
                window.mediaImageUrl = ${audio.thumbnail};
                window.mediaContentType = ${audio.contentType};
                window.pauseVideosOnLoad = true;
                window.receiverDevice = ${device};
                window.targetElementId = undefined;
            `,
        frameId: 0
    });
    await browser.tabs.executeScript(tabId, {
        file: "cast/senders/media.js",
        frameId: 0
    });
}

/**
 * Sent from the media sender (content script) when an audio-only cast
 * fails after injection, so the selector can show the error.
 */
export const AUDIO_ONLY_CAST_FAILED = "main:audioOnlyCastFailed";

/**
 * Asks a temporary bridge instance to resolve the audio-only stream
 * of a YouTube page via yt-dlp.
 */
export async function resolveYouTubeAudio(
    pageUrl: string
): Promise<ResolvedAudio> {
    const port = await bridge.connect();

    return new Promise<ResolvedAudio>((resolve, reject) => {
        const timeoutId = setTimeout(
            () => finish(() => reject(new Error("Bridge timed out"))),
            RESOLVE_TIMEOUT_MS
        );

        let isFinished = false;
        function finish(settle: () => void) {
            if (isFinished) return;
            isFinished = true;

            clearTimeout(timeoutId);
            port.disconnect();
            settle();
        }

        port.onMessage.addListener((message: Message) => {
            switch (message.subject) {
                case "main:youTubeAudioResolved":
                    finish(() => resolve(message.data));
                    break;
                case "main:youTubeAudioError":
                    finish(() => reject(new Error(message.data)));
                    break;
            }
        });

        port.onDisconnect.addListener(() => {
            finish(() => reject(new Error("Bridge disconnected")));
        });

        port.postMessage({
            subject: "bridge:resolveYouTubeAudio",
            data: { pageUrl }
        });
    });
}

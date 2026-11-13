import bridge from "../lib/bridge";
import type { Message } from "../messaging";

export interface ResolvedAudio {
    url: string;
    title: string;
    thumbnail?: string;
    contentType: string;
}

/** yt-dlp itself times out after 30s; leave room for bridge startup. */
const RESOLVE_TIMEOUT_MS = 35000;

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

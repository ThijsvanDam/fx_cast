/**
 * Pure helpers for following ads in a YouTube Lounge event stream.
 * Kept free of imports so node:test can load them directly.
 */

export type LoungeEvent = [string, any];

/** An ad playing in the YouTube app on a TV. */
export interface YouTubeAd {
    adVideoId: string;
    /** Seconds. */
    duration: number;
    /** When the ad should end (ms since epoch; ignores pausing). */
    endsAt: number;
    /** The ad will (at some point) let you skip it. */
    isSkippable: boolean;
    /** Skipping is allowed right now. */
    isSkipEnabled: boolean;
}

/**
 * Parses the Lounge long-poll body: repeated `<length>\n<json array>`
 * chunks of `[id, [eventName, data]]`. An incomplete chunk at the end is
 * returned as `rest` to prepend to the next read.
 */
export function parseLoungeChunks(buf: string): {
    events: LoungeEvent[];
    rest: string;
    lastId: number;
} {
    const events: LoungeEvent[] = [];
    let lastId = -1;
    let i = 0;

    while (i < buf.length) {
        const newline = buf.indexOf("\n", i);
        if (newline === -1) break;

        const lengthText = buf.slice(i, newline).trim();
        if (!lengthText) {
            i = newline + 1;
            continue;
        }
        const length = Number(lengthText);
        if (!Number.isFinite(length)) {
            // Not a chunk header: skip the line
            i = newline + 1;
            continue;
        }
        if (newline + 1 + length > buf.length) break;

        const chunk = buf.slice(newline + 1, newline + 1 + length);
        i = newline + 1 + length;
        try {
            for (const [id, event] of JSON.parse(chunk)) {
                lastId = Math.max(lastId, id);
                events.push(event);
            }
        } catch {
            // Malformed chunk: ignore it
        }
    }

    return { events, rest: buf.slice(i), lastId };
}

/** Follows ad events and decides when to auto-skip (once per ad). */
export class YouTubeAdTracker {
    autoSkip = true;

    private current: YouTubeAd | null = null;
    private hasSkipped = false;
    private now: () => number;

    constructor(now: () => number = Date.now) {
        this.now = now;
    }

    get ad(): YouTubeAd | null {
        return this.current ? { ...this.current } : null;
    }

    apply([name, data]: LoungeEvent): {
        changed: boolean;
        shouldSkip: boolean;
    } {
        const before = JSON.stringify(this.current);

        switch (name) {
            case "adPlaying":
                // Every ad (even a repeat of the same video) starts fresh
                this.hasSkipped = false;
                this.current = {
                    adVideoId: String(data.adVideoId ?? ""),
                    duration: Number(data.duration) || 0,
                    endsAt: this.endsAt(data),
                    isSkippable: data.isSkippable === "true",
                    isSkipEnabled: data.isSkipEnabled === "true"
                };
                break;

            case "onAdStateChange":
                if (data.adState === "0") {
                    this.current = null;
                } else if (this.current) {
                    this.current.isSkipEnabled = data.isSkipEnabled === "true";
                    if (data.isSkipEnabled === "true") {
                        this.current.isSkippable = true;
                    }
                }
                break;

            case "nowPlaying":
                if (data.adState === undefined) {
                    this.current = null;
                } else if (data.adVideoId) {
                    // Joined mid-ad: skippability arrives with adPlaying
                    this.current = {
                        adVideoId: String(data.adVideoId),
                        duration: Number(data.duration) || 0,
                        endsAt: this.endsAt(data),
                        isSkippable: this.current?.isSkippable ?? false,
                        isSkipEnabled: this.current?.isSkipEnabled ?? false
                    };
                }
                break;

            default:
                return { changed: false, shouldSkip: false };
        }

        if (!this.current) this.hasSkipped = false;

        const shouldSkip =
            this.autoSkip &&
            !!this.current?.isSkipEnabled &&
            !this.hasSkipped;
        if (shouldSkip) this.hasSkipped = true;

        return {
            changed: JSON.stringify(this.current) !== before,
            shouldSkip
        };
    }

    private endsAt(data: { duration?: string; currentTime?: string }) {
        const left =
            (Number(data.duration) || 0) - (Number(data.currentTime) || 0);
        return this.now() + Math.round(Math.max(0, left) * 1000);
    }
}

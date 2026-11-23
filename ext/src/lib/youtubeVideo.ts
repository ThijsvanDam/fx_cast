const VIDEO_HOSTS = ["www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube.com"];

/** Video ID of a YouTube watch, Shorts or youtu.be URL (else null). */
export function getYouTubeVideoId(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    if (parsed.hostname === "youtu.be") {
        return parsed.pathname.slice(1).split("/")[0] || null;
    }
    if (!VIDEO_HOSTS.includes(parsed.hostname)) return null;

    if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v") || null;
    }
    if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
    }
    return null;
}

/** Tab title without YouTube's suffix and notification count. */
export function cleanYouTubeTitle(title?: string): string {
    const cleaned = (title ?? "")
        .replace(/^\(\d+\)\s*/, "")
        .replace(/\s*-\s*YouTube$/, "")
        .trim();
    return cleaned || "YouTube video";
}

/**
 * Cast app IDs of the YouTube receiver. Some TVs (e.g. Google TV)
 * run YouTube as 2C6A6E3D; both speak the Lounge API.
 */
export const YOUTUBE_APP_IDS = ["233637DE", "2C6A6E3D"];

export function isYouTubeAppId(appId?: string): boolean {
    return !!appId && YOUTUBE_APP_IDS.includes(appId);
}

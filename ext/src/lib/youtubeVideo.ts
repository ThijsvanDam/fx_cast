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

/** YouTube's remote-control (Lounge) channel on a Cast receiver app. */
export const YOUTUBE_MDX_NAMESPACE = "urn:x-cast:com.google.youtube.mdx";

/**
 * Whether a receiver app is YouTube. Matched by its remote-control
 * channel, not its ID: the TV runs YouTube under different app IDs.
 */
export function isYouTubeApp(app?: {
    namespaces?: Array<{ name: string }>;
}): boolean {
    return !!app?.namespaces?.some(ns => ns.name === YOUTUBE_MDX_NAMESPACE);
}

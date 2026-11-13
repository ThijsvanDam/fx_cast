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

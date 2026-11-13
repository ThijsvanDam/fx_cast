const WATCH_HOSTS = ["www.youtube.com", "m.youtube.com", "music.youtube.com"];
const SHORTS_HOSTS = ["www.youtube.com", "m.youtube.com"];

/**
 * Whether a page URL is a single YouTube video that can be cast as
 * audio only (watch pages and Shorts).
 */
export function isYouTubeAudioOnlyUrl(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    if (WATCH_HOSTS.includes(parsed.hostname) && parsed.pathname === "/watch") {
        return true;
    }

    return (
        SHORTS_HOSTS.includes(parsed.hostname) &&
        parsed.pathname.startsWith("/shorts/")
    );
}

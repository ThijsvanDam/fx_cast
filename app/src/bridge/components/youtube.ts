import { execFile } from "child_process";
import fs from "fs";
import path from "path";

export interface ResolvedAudio {
    url: string;
    title: string;
    thumbnail?: string;
    contentType: string;
}

/**
 * Runs an executable and resolves with its stdout. Rejects with an
 * `Error` whose message is stderr, or `"timeout"` if it was killed
 * for taking too long.
 */
export type RunFn = (
    file: string,
    args: string[],
    timeoutMs: number
) => Promise<string>;

export const YT_DLP_TIMEOUT_MS = 30000;

const YT_DLP_FALLBACK_PATHS = [
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp"
];

const YOUTUBE_HOSTS = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be"
];

const CONTENT_TYPES: Record<string, string> = {
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    webm: "audio/webm"
};

/**
 * Finds the yt-dlp executable. Browser-launched processes get a
 * minimal PATH, so common Homebrew locations are checked too.
 */
export function findYtDlp(
    exists: (p: string) => boolean = p => fs.existsSync(p),
    pathEnv: string = process.env.PATH ?? ""
): string | null {
    const candidates = [
        ...pathEnv
            .split(path.delimiter)
            .filter(Boolean)
            .map(dir => path.join(dir, "yt-dlp")),
        ...YT_DLP_FALLBACK_PATHS
    ];

    return candidates.find(candidate => exists(candidate)) ?? null;
}

const defaultRun: RunFn = (file, args, timeoutMs) =>
    new Promise((resolve, reject) => {
        execFile(
            file,
            args,
            { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) {
                    reject(
                        new Error(
                            err.killed ? "timeout" : stderr || err.message
                        )
                    );
                    return;
                }
                resolve(stdout);
            }
        );
    });

function isYouTubeUrl(pageUrl: string) {
    try {
        return YOUTUBE_HOSTS.includes(new URL(pageUrl).hostname);
    } catch {
        return false;
    }
}

function toErrorMessage(message: string) {
    if (message === "timeout") return "yt-dlp timed out";

    const errorLine = message
        .split("\n")
        .reverse()
        .find(line => line.startsWith("ERROR:"));

    return errorLine ?? message.trim();
}

/**
 * Resolves the direct audio-only stream URL (plus metadata) for a
 * YouTube page URL using yt-dlp.
 */
export async function resolveYouTubeAudio(
    pageUrl: string,
    deps: { run?: RunFn; ytDlpPath?: string | null } = {}
): Promise<ResolvedAudio> {
    if (!isYouTubeUrl(pageUrl)) {
        throw new Error("Not a YouTube URL");
    }

    const ytDlpPath =
        deps.ytDlpPath === undefined ? findYtDlp() : deps.ytDlpPath;
    if (!ytDlpPath) {
        throw new Error("yt-dlp not found (install with `brew install yt-dlp`)");
    }

    const run = deps.run ?? defaultRun;

    let stdout: string;
    try {
        stdout = await run(
            ytDlpPath,
            [
                "-f",
                "bestaudio[ext=m4a]/bestaudio",
                "--no-playlist",
                "--no-warnings",
                "--print",
                "urls",
                "--print",
                "title",
                "--print",
                "thumbnail",
                "--print",
                "ext",
                "--print",
                "protocol",
                pageUrl
            ],
            YT_DLP_TIMEOUT_MS
        );
    } catch (err) {
        throw new Error(toErrorMessage((err as Error).message));
    }

    const [url, title, thumbnail, ext, protocol] = stdout.trim().split("\n");

    if (!url?.startsWith("http")) {
        throw new Error("yt-dlp returned no audio URL");
    }

    // Live streams come back as HLS playlists
    const contentType = protocol?.includes("m3u8")
        ? "application/x-mpegURL"
        : CONTENT_TYPES[ext] ?? "audio/mp4";

    return {
        url,
        title,
        thumbnail: thumbnail && thumbnail !== "NA" ? thumbnail : undefined,
        contentType
    };
}

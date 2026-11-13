import { test } from "node:test";
import assert from "node:assert/strict";

import {
    findYtDlp,
    resolveYouTubeAudio,
    YT_DLP_TIMEOUT_MS
} from "../src/bridge/components/youtube.ts";
import type { RunFn } from "../src/bridge/components/youtube.ts";

const PAGE_URL = "https://www.youtube.com/watch?v=abc&list=PL123";
const YT_DLP = "/opt/homebrew/bin/yt-dlp";
const AUDIO_URL = "https://rr1.googlevideo.com/x";
const THUMBNAIL = "https://i.ytimg.com/t.jpg";

function fakeRun(stdout: string) {
    const calls: { file: string; args: string[]; timeoutMs: number }[] = [];
    const run: RunFn = async (file, args, timeoutMs) => {
        calls.push({ file, args, timeoutMs });
        return stdout;
    };
    return { run, calls };
}

function failingRun(message: string) {
    const calls: unknown[] = [];
    const run: RunFn = async (...args) => {
        calls.push(args);
        throw new Error(message);
    };
    return { run, calls };
}

test("resolves m4a audio", async () => {
    // Given
    const { run, calls } = fakeRun(
        `${AUDIO_URL}\nMy Video\n${THUMBNAIL}\nm4a\n`
    );

    // When
    const result = await resolveYouTubeAudio(PAGE_URL, {
        run,
        ytDlpPath: YT_DLP
    });

    // Then
    assert.deepEqual(result, {
        url: AUDIO_URL,
        title: "My Video",
        thumbnail: THUMBNAIL,
        contentType: "audio/mp4"
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, YT_DLP);
    const args = calls[0].args;
    assert.equal(args[args.indexOf("-f") + 1], "bestaudio[ext=m4a]/bestaudio");
    assert.ok(args.includes("--no-playlist"));
    assert.equal(args[args.length - 1], PAGE_URL);
});

test("maps webm to audio/webm", async () => {
    const { run } = fakeRun(`${AUDIO_URL}\nMy Video\n${THUMBNAIL}\nwebm\n`);

    const result = await resolveYouTubeAudio(PAGE_URL, {
        run,
        ytDlpPath: YT_DLP
    });

    assert.equal(result.contentType, "audio/webm");
});

test("missing thumbnail", async () => {
    const { run } = fakeRun(`${AUDIO_URL}\nMy Video\nNA\nm4a\n`);

    const result = await resolveYouTubeAudio(PAGE_URL, {
        run,
        ytDlpPath: YT_DLP
    });

    assert.equal(result.thumbnail, undefined);
});

test("yt-dlp not found", async () => {
    const { run, calls } = fakeRun("");

    await assert.rejects(
        resolveYouTubeAudio(PAGE_URL, { run, ytDlpPath: null }),
        { message: "yt-dlp not found (install with `brew install yt-dlp`)" }
    );
    assert.equal(calls.length, 0);
});

test("surfaces yt-dlp error line", async () => {
    const { run } = failingRun(
        "WARNING: x\nERROR: [youtube] abc: Private video\n"
    );

    await assert.rejects(
        resolveYouTubeAudio(PAGE_URL, { run, ytDlpPath: YT_DLP }),
        { message: "ERROR: [youtube] abc: Private video" }
    );
});

test("timeout", async () => {
    let timeoutUsed = -1;
    const run: RunFn = async (_file, _args, timeoutMs) => {
        timeoutUsed = timeoutMs;
        throw new Error("timeout");
    };

    await assert.rejects(
        resolveYouTubeAudio(PAGE_URL, { run, ytDlpPath: YT_DLP }),
        { message: "yt-dlp timed out" }
    );
    assert.equal(timeoutUsed, 30000);
    assert.equal(YT_DLP_TIMEOUT_MS, 30000);
});

test("rejects non-YouTube URL", async () => {
    const { run, calls } = fakeRun("");

    await assert.rejects(
        resolveYouTubeAudio("https://example.com/watch?v=1", {
            run,
            ytDlpPath: YT_DLP
        }),
        { message: "Not a YouTube URL" }
    );
    assert.equal(calls.length, 0);
});

test("findYtDlp prefers PATH, then Homebrew, else null", () => {
    const pathEnv = "/a:/b";

    assert.equal(
        findYtDlp(p => p === "/opt/homebrew/bin/yt-dlp", pathEnv),
        "/opt/homebrew/bin/yt-dlp"
    );
    assert.equal(
        findYtDlp(() => false, pathEnv),
        null
    );
    assert.equal(
        findYtDlp(p => p === "/b/yt-dlp" || p === "/opt/homebrew/bin/yt-dlp", pathEnv),
        "/b/yt-dlp"
    );
});

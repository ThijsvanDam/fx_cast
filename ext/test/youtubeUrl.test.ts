import { test } from "node:test";
import assert from "node:assert/strict";

import { isYouTubeAudioOnlyUrl } from "../src/lib/youtubeUrl.ts";

const SUPPORTED_URLS = [
    "https://www.youtube.com/watch?v=abc",
    "https://m.youtube.com/watch?v=abc&list=x",
    "https://music.youtube.com/watch?v=abc",
    "https://www.youtube.com/shorts/abc",
    "https://m.youtube.com/shorts/abc"
];

const UNSUPPORTED_URLS = [
    "https://www.youtube.com/",
    "https://www.youtube.com/@LofiGirl",
    "https://example.com/watch?v=abc",
    "not a url"
];

for (const url of SUPPORTED_URLS) {
    test(`offers audio only for ${url}`, () => {
        assert.equal(isYouTubeAudioOnlyUrl(url), true);
    });
}

for (const url of UNSUPPORTED_URLS) {
    test(`does not offer audio only for ${url}`, () => {
        assert.equal(isYouTubeAudioOnlyUrl(url), false);
    });
}

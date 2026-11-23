import { test } from "node:test";
import assert from "node:assert/strict";

import { getYouTubeVideoId, cleanYouTubeTitle, isYouTubeApp } from "../src/lib/youtubeVideo.ts";

test("video id from watch, shorts and short links", () => {
    assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=abc123&list=x"), "abc123");
    assert.equal(getYouTubeVideoId("https://m.youtube.com/watch?v=abc123"), "abc123");
    assert.equal(getYouTubeVideoId("https://music.youtube.com/watch?v=abc123"), "abc123");
    assert.equal(getYouTubeVideoId("https://www.youtube.com/shorts/abc123"), "abc123");
    assert.equal(getYouTubeVideoId("https://youtu.be/abc123?t=5"), "abc123");
});

test("no video id for non-video pages", () => {
    assert.equal(getYouTubeVideoId("https://www.youtube.com/"), null);
    assert.equal(getYouTubeVideoId("https://www.youtube.com/@LofiGirl"), null);
    assert.equal(getYouTubeVideoId("https://example.com/watch?v=abc123"), null);
    assert.equal(getYouTubeVideoId("not a url"), null);
});

test("cleans tab titles", () => {
    assert.equal(cleanYouTubeTitle("Me at the zoo - YouTube"), "Me at the zoo");
    assert.equal(cleanYouTubeTitle("(3) Me at the zoo - YouTube"), "Me at the zoo");
    assert.equal(cleanYouTubeTitle("Plain title"), "Plain title");
    assert.equal(cleanYouTubeTitle(""), "YouTube video");
    assert.equal(cleanYouTubeTitle(undefined), "YouTube video");
});

test("an app with YouTube's remote-control channel counts as YouTube, whatever its ID", () => {
    const app = (appId: string, ...names: string[]) => ({
        appId,
        namespaces: names.map(name => ({ name }))
    });
    const MDX = "urn:x-cast:com.google.youtube.mdx";
    const MEDIA = "urn:x-cast:com.google.cast.media";

    assert.equal(isYouTubeApp(app("233637DE", MEDIA, MDX)), true);
    assert.equal(isYouTubeApp(app("SOMENEWID", MDX)), true);
    assert.equal(isYouTubeApp(app("CC1AD845", MEDIA)), false);
    assert.equal(isYouTubeApp(undefined), false);
});

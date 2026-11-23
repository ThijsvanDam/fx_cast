import { test } from "node:test";
import assert from "node:assert/strict";

import { getYouTubeVideoId, cleanYouTubeTitle, isYouTubeAppId } from "../src/lib/youtubeVideo.ts";

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

test("both YouTube receiver apps count as YouTube", () => {
    assert.equal(isYouTubeAppId("233637DE"), true);
    assert.equal(isYouTubeAppId("2C6A6E3D"), true);
    assert.equal(isYouTubeAppId("CC1AD845"), false);
    assert.equal(isYouTubeAppId(undefined), false);
});

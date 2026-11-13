import { test } from "node:test";
import assert from "node:assert/strict";

import { YouTubeLounge } from "../src/bridge/components/youtube/lounge.ts";
import type { PostFn } from "../src/bridge/components/youtube/lounge.ts";

const DEVICE_ID = "tv-1";
const HOST = "192.168.1.10";
const SCREEN_ID = "screen-123";
const LOUNGE_TOKEN = "token-abc";
const VIDEO_ID = "vid1";
const TITLE = "First video";
const HOUR_MS = 60 * 60 * 1000;

const BIND_TEXT =
    '[[0,["c","SID1","",8]],[1,["S","GS1"]],[2,["playlistModified",{"listId":"RQ1"}]]]';

function happyPost(overrides: { commandStatus?: number } = {}) {
    const calls: { url: string; headers: Record<string, string>; body: Record<string, string> }[] = [];
    const post: PostFn = async (url, headers, body) => {
        calls.push({ url, headers, body });
        if (url.includes("get_lounge_token_batch")) {
            return {
                status: 200,
                text: JSON.stringify({
                    screens: [{ screenId: SCREEN_ID, loungeToken: LOUNGE_TOKEN, expiration: HOUR_MS }]
                })
            };
        }
        if (url.includes("SID=")) {
            return { status: overrides.commandStatus ?? 200, text: "" };
        }
        return { status: 200, text: BIND_TEXT };
    };
    return { post, calls };
}

function happyLounge(post: PostFn, now = () => 0) {
    return new YouTubeLounge({
        post,
        getScreenId: async () => SCREEN_ID,
        now
    });
}

test("fetches token, binds, then sends the command", async () => {
    // Given
    const { post, calls } = happyPost();
    const lounge = happyLounge(post);

    // When
    const items = await lounge.queueCommand({
        deviceId: DEVICE_ID, host: HOST, action: "add", videoId: VIDEO_ID, title: TITLE
    });

    // Then
    assert.deepEqual(items, [{ videoId: VIDEO_ID, title: TITLE }]);
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /pairing\/get_lounge_token_batch/);
    assert.equal(calls[0].body.screen_ids, SCREEN_ID);
    assert.match(calls[1].url, /bc\/bind\?RID=0&VER=8&CVER=1/);
    assert.equal(calls[1].headers["X-YouTube-LoungeId-Token"], LOUNGE_TOKEN);
    assert.match(calls[2].url, /SID=SID1/);
    assert.match(calls[2].url, /gsessionid=GS1/);
    assert.equal(calls[2].body.req0__sc, "addVideo");
    assert.equal(calls[2].body.req0_videoId, VIDEO_ID);
});

test("reuses the lounge token until it expires", async () => {
    // Given
    let time = 0;
    const { post, calls } = happyPost();
    const lounge = happyLounge(post, () => time);
    const command = { deviceId: DEVICE_ID, host: HOST, action: "add" as const, videoId: VIDEO_ID, title: TITLE };

    // When
    await lounge.queueCommand(command);
    await lounge.queueCommand(command);
    time = HOUR_MS + 1;
    await lounge.queueCommand(command);

    // Then
    const tokenCalls = calls.filter(c => c.url.includes("get_lounge_token_batch"));
    assert.equal(tokenCalls.length, 2);
});

test("a rejected command becomes a clear error", async () => {
    const { post } = happyPost({ commandStatus: 400 });
    const lounge = happyLounge(post);

    await assert.rejects(
        lounge.queueCommand({ deviceId: DEVICE_ID, host: HOST, action: "add", videoId: VIDEO_ID, title: TITLE }),
        { message: "YouTube rejected the request (HTTP 400)" }
    );
});

test("YouTube not running: error and no HTTP calls", async () => {
    const { post, calls } = happyPost();
    const lounge = new YouTubeLounge({
        post,
        getScreenId: async () => {
            throw new Error("YouTube isn't running on this device");
        }
    });

    await assert.rejects(
        lounge.queueCommand({ deviceId: DEVICE_ID, host: HOST, action: "add", videoId: VIDEO_ID, title: TITLE }),
        { message: "YouTube isn't running on this device" }
    );
    assert.equal(calls.length, 0);
});

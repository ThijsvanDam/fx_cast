import { test } from "node:test";
import assert from "node:assert/strict";

import {
    parseBindResponse,
    buildCommandBody,
    LoungeQueueMemory
} from "../src/bridge/components/youtube/lounge.ts";

const DEVICE_ID = "tv-1";
const LIST_ID = "RQabc";
const OTHER_LIST_ID = "RQdef";

function happyItem(videoId = "vid1", title = "First video") {
    return { videoId, title };
}

const BIND_TEXT = `225
[[0,["c","SID123","",8]],[1,["S","GSESSION456"]],[2,["loungeStatus",{}]],[3,["playlistModified",{"listId":"${LIST_ID}","firstVideoId":"x"}]]]
`;

test("parses sid, gsessionid and listId from a bind reply", () => {
    assert.deepEqual(parseBindResponse(BIND_TEXT), {
        sid: "SID123",
        gsessionid: "GSESSION456",
        listId: LIST_ID
    });
});

test("bind reply without queue has no listId", () => {
    assert.equal(parseBindResponse('[[0,["c","S1","",8]],[1,["S","G1"]]]').listId, undefined);
});

test("maps actions to lounge commands", () => {
    assert.deepEqual(buildCommandBody("add", "vid1"), {
        count: "1",
        ofs: "0",
        req0__sc: "addVideo",
        req0_videoId: "vid1"
    });
    assert.equal(buildCommandBody("playNext", "vid1").req0__sc, "insertVideo");
    assert.equal(buildCommandBody("remove", "vid1").req0__sc, "removeVideo");
});

test("add appends, play next goes first, duplicates are ignored", () => {
    const memory = new LoungeQueueMemory();

    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));
    const items = memory.apply(DEVICE_ID, LIST_ID, "playNext", happyItem("b", "B"));

    assert.deepEqual(items, [happyItem("b", "B"), happyItem("a", "A")]);
});

test("remove deletes the item", () => {
    const memory = new LoungeQueueMemory();
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));

    assert.deepEqual(memory.apply(DEVICE_ID, LIST_ID, "remove", happyItem("a", "A")), []);
});

test("removing an unknown item leaves memory unchanged", () => {
    const memory = new LoungeQueueMemory();
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));

    assert.deepEqual(memory.apply(DEVICE_ID, LIST_ID, "remove", happyItem("zzz", "Z")), [
        happyItem("a", "A")
    ]);
});

test("a new queue (different listId) clears what fx_cast added before", () => {
    const memory = new LoungeQueueMemory();
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));

    const items = memory.apply(DEVICE_ID, OTHER_LIST_ID, "add", happyItem("b", "B"));

    assert.deepEqual(items, [happyItem("b", "B")]);
});

test("memory is kept per device", () => {
    const memory = new LoungeQueueMemory();
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));
    memory.apply("tv-2", LIST_ID, "add", happyItem("b", "B"));

    assert.deepEqual(memory.get(DEVICE_ID), [happyItem("a", "A")]);
    memory.clear(DEVICE_ID);
    assert.deepEqual(memory.get(DEVICE_ID), []);
    assert.deepEqual(memory.get("tv-2"), [happyItem("b", "B")]);
});

test("no listId (no queue) clears what fx_cast added before", () => {
    const memory = new LoungeQueueMemory();
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));

    assert.deepEqual(memory.apply(DEVICE_ID, undefined, "add", happyItem("b", "B")), [happyItem("b", "B")]);
});

test("playing an added video drops it and everything before it", () => {
    const memory = new LoungeQueueMemory();
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("b", "B"));
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("c", "C"));

    assert.equal(memory.markPlaying(DEVICE_ID, "b"), true);
    assert.deepEqual(memory.get(DEVICE_ID), [happyItem("c", "C")]);
});

test("playing a video fx_cast didn't add changes nothing", () => {
    const memory = new LoungeQueueMemory();
    memory.apply(DEVICE_ID, LIST_ID, "add", happyItem("a", "A"));

    assert.equal(memory.markPlaying(DEVICE_ID, "zzz"), false);
    assert.deepEqual(memory.get(DEVICE_ID), [happyItem("a", "A")]);
});

test("marking a device without memory changes nothing", () => {
    const memory = new LoungeQueueMemory();

    assert.equal(memory.markPlaying(DEVICE_ID, "a"), false);
});

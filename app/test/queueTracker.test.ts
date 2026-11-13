import { test } from "node:test";
import assert from "node:assert/strict";

import {
    QueueTracker,
    MAX_ITEMS_PER_REQUEST
} from "../src/bridge/components/cast/queueTracker.ts";

function happyItem(itemId: number) {
    return { itemId, media: { metadata: { title: `Item ${itemId}` } } };
}

test("strips windowed items and asks for a refresh", () => {
    const tracker = new QueueTracker();

    const result = tracker.handleMediaStatus({
        mediaSessionId: 1,
        currentItemId: 1,
        items: [happyItem(1), happyItem(2)]
    });

    assert.deepEqual(result.status, { mediaSessionId: 1, currentItemId: 1 });
    assert.equal(result.shouldRefresh, true);
});

test("status without items needs no refresh", () => {
    const tracker = new QueueTracker();

    const result = tracker.handleMediaStatus({
        mediaSessionId: 1,
        playerState: "PLAYING"
    });

    assert.deepEqual(result.status, { mediaSessionId: 1, playerState: "PLAYING" });
    assert.equal(result.shouldRefresh, false);
});

test("requests item details in chunks", () => {
    const tracker = new QueueTracker();
    const ids = Array.from({ length: MAX_ITEMS_PER_REQUEST + 5 }, (_, i) => i + 1);

    const result = tracker.handleItemIds(ids);

    assert.equal(result.requests.length, 2);
    assert.equal(result.requests[0].length, MAX_ITEMS_PER_REQUEST);
    assert.deepEqual(result.requests[1], ids.slice(MAX_ITEMS_PER_REQUEST));
    assert.equal(result.items, undefined);
});

test("empty queue resolves to an empty list immediately", () => {
    const tracker = new QueueTracker();

    const result = tracker.handleItemIds([]);

    assert.deepEqual(result.requests, []);
    assert.deepEqual(result.items, []);
});

test("returns the full queue in item id order once all items arrived", () => {
    const tracker = new QueueTracker();
    tracker.handleItemIds([1, 2, 3]);

    assert.equal(tracker.handleItems([happyItem(3), happyItem(1)]), null);
    assert.deepEqual(tracker.handleItems([happyItem(2)]), [
        happyItem(1),
        happyItem(2),
        happyItem(3)
    ]);
});

test("a newer id list discards items of the previous request", () => {
    const tracker = new QueueTracker();
    tracker.handleItemIds([1, 2]);
    tracker.handleItems([happyItem(1)]);

    tracker.handleItemIds([1, 3]);

    assert.equal(tracker.handleItems([happyItem(2)]), null);
    assert.deepEqual(tracker.handleItems([happyItem(1), happyItem(3)]), [
        happyItem(1),
        happyItem(3)
    ]);
});

test("known windowed items need no refresh (no request loop)", () => {
    const tracker = new QueueTracker();
    tracker.handleMediaStatus({ mediaSessionId: 1, items: [happyItem(1)] });
    tracker.handleItemIds([1, 2]);
    tracker.handleItems([happyItem(1), happyItem(2)]);

    const result = tracker.handleMediaStatus({
        mediaSessionId: 1,
        items: [happyItem(1), happyItem(2)]
    });

    assert.equal(result.shouldRefresh, false);
});

test("unknown windowed item triggers a refresh", () => {
    const tracker = new QueueTracker();
    tracker.handleMediaStatus({ mediaSessionId: 1, items: [happyItem(1)] });
    tracker.handleItemIds([1]);
    tracker.handleItems([happyItem(1)]);

    const result = tracker.handleMediaStatus({
        mediaSessionId: 1,
        items: [happyItem(1), happyItem(7)]
    });

    assert.equal(result.shouldRefresh, true);
});

test("new media session triggers a refresh", () => {
    const tracker = new QueueTracker();
    tracker.handleMediaStatus({ mediaSessionId: 1, items: [happyItem(1)] });
    tracker.handleItemIds([1]);
    tracker.handleItems([happyItem(1)]);

    const result = tracker.handleMediaStatus({
        mediaSessionId: 2,
        items: [happyItem(1)]
    });

    assert.equal(result.shouldRefresh, true);
});

test("refresh is not repeated while one is in flight", () => {
    const tracker = new QueueTracker();
    tracker.handleMediaStatus({ mediaSessionId: 1, items: [happyItem(1)] });

    const result = tracker.handleMediaStatus({
        mediaSessionId: 1,
        items: [happyItem(1)]
    });

    assert.equal(result.shouldRefresh, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    parseLoungeChunks,
    YouTubeAdTracker
} from "../src/bridge/components/youtube/adTracker.ts";

const NOW = 1_000_000;
const AD_1 = "adOne";
const AD_2 = "adTwo";

function happyAdPlaying(overrides: Record<string, string> = {}): [string, any] {
    return [
        "adPlaying",
        {
            adVideoId: AD_1,
            duration: "20.021",
            currentTime: "0",
            adState: "-1",
            isSkippable: "true",
            isSkipEnabled: "false",
            ...overrides
        }
    ];
}

function skipEnabled(currentTime = "5.3"): [string, any] {
    return ["onAdStateChange", { adState: "1", currentTime, isSkipEnabled: "true" }];
}

const AD_ENDED: [string, any] = [
    "onAdStateChange",
    { adState: "0", currentTime: "0", isSkipEnabled: "false" }
];

function chunk(events: [number, [string, any]][]) {
    const json = JSON.stringify(events);
    return `${json.length}\n${json}`;
}

test("parses length-prefixed chunks and remembers the last event id", () => {
    // Given
    const text =
        chunk([[3, ["noop"]]]) + chunk([[4, happyAdPlaying()], [5, AD_ENDED]]);

    // When
    const result = parseLoungeChunks(text);

    // Then
    assert.deepEqual(result.events.map(e => e[0]), ["noop", "adPlaying", "onAdStateChange"]);
    assert.equal(result.lastId, 5);
    assert.equal(result.rest, "");
});

test("keeps a chunk split across reads for the next read", () => {
    // Given
    const full = chunk([[7, happyAdPlaying()]]);
    const firstPart = full.slice(0, 20);

    // When
    const first = parseLoungeChunks(firstPart);
    const second = parseLoungeChunks(first.rest + full.slice(20));

    // Then
    assert.equal(first.events.length, 0);
    assert.equal(first.rest, firstPart);
    assert.equal(second.events.length, 1);
    assert.equal(second.lastId, 7);
});

test("adPlaying starts an ad with its end time and skippability", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);

    // When
    const result = tracker.apply(happyAdPlaying({ currentTime: "5" }));

    // Then
    assert.equal(result.changed, true);
    assert.deepEqual(tracker.ad, {
        adVideoId: AD_1,
        duration: 20.021,
        endsAt: NOW + 15_021,
        isSkippable: true,
        isSkipEnabled: false
    });
});

test("auto-skips once when skipping becomes allowed", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);
    tracker.apply(happyAdPlaying());

    // When
    const first = tracker.apply(skipEnabled());
    const repeat = tracker.apply(skipEnabled("6"));

    // Then
    assert.equal(first.shouldSkip, true);
    assert.equal(tracker.ad?.isSkipEnabled, true);
    assert.equal(repeat.shouldSkip, false);
});

test("does not auto-skip when auto-skip is off", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);
    tracker.autoSkip = false;
    tracker.apply(happyAdPlaying());

    // When
    const result = tracker.apply(skipEnabled());

    // Then
    assert.equal(result.shouldSkip, false);
    assert.equal(tracker.ad?.isSkipEnabled, true);
});

test("an ad ending clears the state", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);
    tracker.apply(happyAdPlaying());

    // When
    const result = tracker.apply(AD_ENDED);

    // Then
    assert.equal(result.changed, true);
    assert.equal(tracker.ad, null);
});

test("back-to-back ads: the second ad can be auto-skipped too", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);
    tracker.apply(happyAdPlaying());
    tracker.apply(skipEnabled());
    tracker.apply(AD_ENDED);

    // When
    tracker.apply(happyAdPlaying({ adVideoId: AD_2, duration: "10.021" }));
    const result = tracker.apply(skipEnabled());

    // Then
    assert.equal(tracker.ad?.adVideoId, AD_2);
    assert.equal(result.shouldSkip, true);
});

test("the same ad video playing twice in a row can be skipped both times", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);
    tracker.apply(happyAdPlaying());
    tracker.apply(skipEnabled());
    tracker.apply(AD_ENDED);

    // When
    tracker.apply(happyAdPlaying());
    const result = tracker.apply(skipEnabled());

    // Then
    assert.equal(result.shouldSkip, true);
});

test("nowPlaying mid-ad (bind snapshot) sets the ad; without adState it clears", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);

    // When
    tracker.apply([
        "nowPlaying",
        { adState: "1", adVideoId: AD_1, duration: "20.021", currentTime: "7.039", videoId: "content" }
    ]);
    const midAd = tracker.ad;
    tracker.apply(["nowPlaying", { videoId: "content", duration: "1791.5", currentTime: "30", state: "1" }]);

    // Then
    assert.equal(midAd?.adVideoId, AD_1);
    assert.equal(midAd?.endsAt, NOW + 12_982);
    assert.equal(tracker.ad, null);
});

test("unrelated events change nothing", () => {
    // Given
    const tracker = new YouTubeAdTracker(() => NOW);

    // When
    const result = tracker.apply(["onVolumeChanged", { volume: "100" }]);

    // Then
    assert.deepEqual(result, { changed: false, shouldSkip: false });
    assert.equal(tracker.ad, null);
});

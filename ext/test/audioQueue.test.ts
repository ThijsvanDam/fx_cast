import { test } from "node:test";
import assert from "node:assert/strict";

import {
    canQueueAudio,
    createQueueInsertMessage,
    getUpNext
} from "../src/lib/audioQueue.ts";

const DEFAULT_MEDIA_RECEIVER = "CC1AD845";
const YOUTUBE_APP = "233637DE";
const MEDIA_SESSION_ID = 1;
const AUDIO_URL = "https://rr1.googlevideo.com/x";
const THUMBNAIL = "https://i.ytimg.com/t.jpg";

function happyAudio(
    overrides: Partial<{
        url: string;
        title: string;
        thumbnail?: string;
        contentType: string;
    }> = {}
) {
    return {
        url: AUDIO_URL,
        title: "My Video",
        thumbnail: THUMBNAIL,
        contentType: "audio/mp4",
        ...overrides
    };
}

test("can queue audio onto default media receiver session", () => {
    assert.equal(
        canQueueAudio({
            isAudioOnly: true,
            appId: DEFAULT_MEDIA_RECEIVER,
            mediaSessionId: MEDIA_SESSION_ID,
            playerState: "PLAYING"
        }),
        true
    );
});

test("cannot queue when not casting audio only", () => {
    assert.equal(
        canQueueAudio({
            isAudioOnly: false,
            appId: DEFAULT_MEDIA_RECEIVER,
            mediaSessionId: MEDIA_SESSION_ID
        }),
        false
    );
});

test("cannot queue onto the YouTube app", () => {
    assert.equal(
        canQueueAudio({
            isAudioOnly: true,
            appId: YOUTUBE_APP,
            mediaSessionId: MEDIA_SESSION_ID
        }),
        false
    );
});

test("cannot queue without a media session", () => {
    assert.equal(
        canQueueAudio({
            isAudioOnly: true,
            appId: DEFAULT_MEDIA_RECEIVER,
            mediaSessionId: undefined
        }),
        false
    );
});

test("builds QUEUE_INSERT message with thumbnail", () => {
    assert.deepEqual(
        createQueueInsertMessage(happyAudio(), MEDIA_SESSION_ID),
        {
            type: "QUEUE_INSERT",
            requestId: 0,
            mediaSessionId: MEDIA_SESSION_ID,
            items: [
                {
                    media: {
                        contentId: AUDIO_URL,
                        contentType: "audio/mp4",
                        streamType: "BUFFERED",
                        metadata: {
                            metadataType: 0,
                            title: "My Video",
                            images: [{ url: THUMBNAIL }]
                        }
                    },
                    autoplay: true
                }
            ]
        }
    );
});

test("omits images without thumbnail", () => {
    const message = createQueueInsertMessage(
        happyAudio({ thumbnail: undefined }),
        MEDIA_SESSION_ID
    );

    assert.equal("images" in (message.items[0] as any).media.metadata, false);
});

test("marks HLS live streams as LIVE", () => {
    const message = createQueueInsertMessage(
        happyAudio({ contentType: "application/x-mpegURL" }),
        MEDIA_SESSION_ID
    );

    assert.equal((message.items[0] as any).media.streamType, "LIVE");
});

test("cannot queue after the media has finished", () => {
    assert.equal(
        canQueueAudio({
            isAudioOnly: true,
            appId: DEFAULT_MEDIA_RECEIVER,
            mediaSessionId: MEDIA_SESSION_ID,
            playerState: "IDLE"
        }),
        false
    );
});

test("can queue while paused", () => {
    assert.equal(
        canQueueAudio({
            isAudioOnly: true,
            appId: DEFAULT_MEDIA_RECEIVER,
            mediaSessionId: MEDIA_SESSION_ID,
            playerState: "PAUSED"
        }),
        true
    );
});

function happyQueueItem(itemId: number, title?: string) {
    return { itemId, media: { metadata: { title } } };
}

function happyQueueStatus(
    currentItemId: number | undefined = 1,
    items = [
        happyQueueItem(1, "First"),
        happyQueueItem(2, "Second"),
        happyQueueItem(3, "Third")
    ]
) {
    return { currentItemId, items };
}

test("up next lists items after the current one", () => {
    assert.deepEqual(getUpNext(happyQueueStatus(1)), [
        { itemId: 2, title: "Second" },
        { itemId: 3, title: "Third" }
    ]);
});

test("up next is empty on the last item", () => {
    assert.deepEqual(getUpNext(happyQueueStatus(3)), []);
});

test("up next is empty without a current item", () => {
    assert.deepEqual(
        getUpNext({ ...happyQueueStatus(), currentItemId: undefined }),
        []
    );
});

test("up next is empty when the current item is not in the queue", () => {
    assert.deepEqual(getUpNext(happyQueueStatus(99)), []);
});

test("up next names items without a title Untitled", () => {
    assert.deepEqual(
        getUpNext(
            happyQueueStatus(1, [happyQueueItem(1, "First"), happyQueueItem(2)])
        ),
        [{ itemId: 2, title: "Untitled" }]
    );
});

test("up next is empty without a status", () => {
    assert.deepEqual(getUpNext(undefined), []);
});

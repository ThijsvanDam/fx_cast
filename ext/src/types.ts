import type { SessionRequest } from "./cast/sdk/classes";
import type { MediaStatus, ReceiverStatus } from "./cast/sdk/types";

export enum ReceiverDeviceCapabilities {
    NONE = 0,
    VIDEO_OUT = 1,
    VIDEO_IN = 2,
    AUDIO_OUT = 4,
    AUDIO_IN = 8,
    MULTIZONE_GROUP = 32
}

export interface ReceiverDevice {
    id: string;
    friendlyName: string;
    modelName: string;
    capabilities: ReceiverDeviceCapabilities;
    host: string;
    port: number;
    status?: ReceiverStatus;
    mediaStatus?: MediaStatus;
    /** Videos fx_cast queued on the YouTube app (its queue is unreadable). */
    youtubeQueue?: { videoId: string; title: string }[];
    /** Ad playing in the YouTube app (reported by the bridge). */
    youtubeAd?: YouTubeAd;
}

export interface YouTubeAd {
    adVideoId: string;
    /** Seconds. */
    duration: number;
    /** When the ad should end (ms since epoch). */
    endsAt: number;
    /** The ad will let you skip it at some point. */
    isSkippable: boolean;
    /** Skipping is allowed right now. */
    isSkipEnabled: boolean;
}

export enum ReceiverSelectorMediaType {
    None = 0,
    App = 1,
    Tab = 2,
    Screen = 4,
    AudioOnly = 8
}

export interface ReceiverSelectorAppInfo {
    sessionRequest: SessionRequest;
    isRequestAppAudioCompatible?: boolean;
}

/** Info about sender page context. */
export interface ReceiverSelectorPageInfo {
    url: string;
    tabId: number;
    frameId: number;
}

<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import type { ReceiverDevice } from "../../types";

    import { MediaStatus, _MediaCommand } from "../../cast/sdk/types";
    import type { Volume } from "../../cast/sdk/classes";
    import {
        MetadataType,
        PlayerState,
        StreamType
    } from "../../cast/sdk/media/enums";
    import type { Track } from "../../cast/sdk/media/classes";
    import { getEstimatedTime } from "../../cast/utils";

    const _ = browser.i18n.getMessage;

    const dispatch = createEventDispatcher<{
        togglePlayback: void;
        seek: { position: number };
        previous: void;
        next: void;
        trackChanged: { activeTrackIds: number[] };
        volumeChanged: Partial<Volume>;
    }>();

    /** Seek step, like YouTube's 10-second skip. */
    const SEEK_SECONDS = 10;

    export let status: MediaStatus;
    export let device: ReceiverDevice;
    export let textTracks: Track[] = [];
    export let showImage = false;

    $: isPlayingOrPaused =
        status.playerState === PlayerState.PLAYING ||
        status.playerState === PlayerState.PAUSED;

    $: hasDuration = status.media?.duration && status.media?.duration > 0;
    $: isSeekable = status.supportedMediaCommands & _MediaCommand.SEEK;
    $: isLive = status.media?.streamType === StreamType.LIVE;

    let mediaTitle: Optional<string>;
    let mediaSubtitle: Optional<string>;
    let mediaImageSet: Optional<string>;

    // Choose subset of metadata depending on metadata type
    $: {
        const metadata = status?.media?.metadata;

        mediaTitle = metadata?.title;
        mediaSubtitle = undefined;

        if (metadata) {
            switch (metadata.metadataType) {
                case MetadataType.AUDIOBOOK_CHAPTER:
                    if (metadata.bookTitle) {
                        metadata.title = metadata.bookTitle;
                    }
                    metadata.subtitle = metadata.chapterTitle;
                    break;
                case MetadataType.MUSIC_TRACK:
                    mediaSubtitle = metadata.artist;
                    break;
                case MetadataType.TV_SHOW:
                    if (metadata.seriesTitle) {
                        mediaTitle = metadata.seriesTitle;
                        mediaSubtitle = metadata.title;
                    }
                    break;

                case MetadataType.MOVIE:
                case MetadataType.GENERIC:
                    mediaSubtitle = metadata.subtitle;
            }
        }

        if (showImage && metadata?.images?.length) {
            let imageSet: string[] = [];
            for (const image of metadata.images) {
                let sizeString = image.url;
                if (image.width) sizeString += ` ${image.width}w`;
                imageSet.push(sizeString);
            }
            mediaImageSet = imageSet.join(",");
        } else {
            mediaImageSet = undefined;
        }
    }

    // Keep track of update times for currentTime estimations
    let lastUpdateTime = 0;
    let lastCurrentTime = 0;
    let currentTime = getEstimatedMediaTime();

    $: if (
        device.mediaStatus?.currentTime &&
        device.mediaStatus.currentTime !== lastCurrentTime
    ) {
        lastUpdateTime = Date.now();
        currentTime = device.mediaStatus.currentTime;
        lastCurrentTime = currentTime;
    }

    // Update estimated time every second
    onMount(() => {
        const intervalId = window.setInterval(() => {
            if (currentTime !== getEstimatedMediaTime()) {
                currentTime = getEstimatedMediaTime();
            }
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    });

    /**
     * Estimates the current playback position based on the last status
     * update.
     */
    function getEstimatedMediaTime() {
        if (!status.currentTime || !lastUpdateTime) return 0;

        if (status.playerState === PlayerState.PLAYING) {
            return getEstimatedTime({
                currentTime: status.currentTime,
                lastUpdateTime,
                duration: status.media?.duration
            });
        }

        return status.currentTime;
    }

    /** Formats seconds into HH:MM:SS */
    function formatTime(seconds: number) {
        const date = new Date(seconds * 1000);
        const hours = date.getUTCHours();

        let ret = "";
        if (hours) ret += `${hours}:`;
        ret += `${date
            .getUTCMinutes()
            .toString()
            .padStart(hours ? 2 : 1, "0")}:`;
        ret += date.getUTCSeconds().toString().padStart(2, "0");
        return ret;
    }

    let seekHoverPosition: Nullable<number> = null;
    function onSeekMouseMove(node: HTMLInputElement) {
        if (node.type !== "range") {
            throw new Error("Wrong type of input!");
        }

        function onMouseMove(ev: MouseEvent) {
            const clientRect = node.getBoundingClientRect();
            seekHoverPosition =
                ((ev.clientX - clientRect.left) / clientRect.width) * 100;
        }

        const onMouseLeave = () => (seekHoverPosition = null);

        node.addEventListener("mousemove", onMouseMove);
        node.addEventListener("mouseleave", onMouseLeave);

        return {
            destroy() {
                seekHoverPosition = null;
                node.removeEventListener("mousemove", onMouseMove);
                node.removeEventListener("mouseleave", onMouseLeave);
            }
        };
    }
</script>

<div class="media">
    {#if mediaTitle}
        <div class="media__metadata">
            {#if mediaImageSet}
                <img class="media__image" srcset={mediaImageSet} alt="" />
            {/if}
            <div class="media__metadata-text">
                <div class="media__title" title={mediaTitle}>
                    {mediaTitle}
                </div>
                {#if mediaSubtitle}
                    <div class="media__subtitle">
                        {mediaSubtitle}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <div class="media__controls">
        <!-- Seek bar -->
        {#if status.media && status.media?.duration && hasDuration && isSeekable}
            <div class="media__seek">
                {#if isLive}
                    <span class="media__live">
                        {_("popupMediaLive")}
                    </span>
                {/if}
                <span class="media__current-time">
                    {formatTime(currentTime)}
                </span>
                <div class="media__seek-bar-container">
                    <input
                        type="range"
                        class="slider media__seek-bar"
                        class:slider--indeterminate={status.playerState ===
                            PlayerState.BUFFERING}
                        aria-label={_("popupMediaSeek")}
                        max={status.media.duration ?? currentTime}
                        value={currentTime}
                        on:change={ev => {
                            if (seekHoverPosition) {
                                ev.preventDefault();
                                return;
                            }
                            dispatch("seek", {
                                position: ev.currentTarget.valueAsNumber
                            });
                        }}
                        on:click={() => {
                            if (seekHoverPosition && status.media?.duration) {
                                dispatch("seek", {
                                    position:
                                        status.media.duration *
                                        (seekHoverPosition / 100)
                                });
                            }
                        }}
                        use:onSeekMouseMove
                    />
                    {#if seekHoverPosition}
                        <div
                            class="media__seek-tooltip"
                            style:--seek-hover-position="{seekHoverPosition}%"
                        >
                            {formatTime(
                                status.media.duration *
                                    (seekHoverPosition / 100)
                            )}
                        </div>
                    {/if}
                </div>
                <span class="media__remaining-time">
                    -{formatTime(status.media.duration - currentTime)}
                </span>
            </div>
        {/if}

        <div class="media__buttons">
            {#if status.supportedMediaCommands & _MediaCommand.QUEUE_PREV}
                <button
                    class="media__previous-button ghost"
                    title={_("popupMediaSkipPrevious")}
                    on:click={() => dispatch("previous")}
                />
            {/if}
            {#if status.supportedMediaCommands & _MediaCommand.SEEK}
                <button
                    class="media__backward-button media__seek-icon-button ghost"
                    title={_("popupMediaSeekBackward", String(SEEK_SECONDS))}
                    aria-label={_("popupMediaSeekBackward", String(SEEK_SECONDS))}
                    disabled={status.playerState === PlayerState.IDLE}
                    on:click={() =>
                        dispatch("seek", {
                            position: Math.max(0, currentTime - SEEK_SECONDS)
                        })}
                >
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <g transform="translate(24 0) scale(-1 1)">
                            <path
                                d="M12 4.5A7.5 7.5 0 1 1 5.5 8.25"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                            />
                            <path d="M11 1.75 14.75 4.5 11 7.25Z" fill="currentColor" />
                        </g>
                        <text x="12" y="15.4" text-anchor="middle">{SEEK_SECONDS}</text>
                    </svg>
                </button>
            {/if}

            {#if status.supportedMediaCommands & _MediaCommand.PAUSE}
                <button
                    class={`ghost ${
                        status.playerState === PlayerState.PLAYING ||
                        status.playerState === PlayerState.BUFFERING
                            ? "media__pause-button"
                            : "media__play-button"
                    }`}
                    title={isPlayingOrPaused &&
                    status.playerState === PlayerState.PLAYING
                        ? _("popupMediaPause")
                        : _("popupMediaPlay")}
                    on:click={() => dispatch("togglePlayback")}
                />
            {/if}

            {#if status.supportedMediaCommands & _MediaCommand.SEEK}
                <button
                    class="media__forward-button media__seek-icon-button ghost"
                    disabled={status.playerState === PlayerState.IDLE}
                    title={_("popupMediaSeekForward", String(SEEK_SECONDS))}
                    aria-label={_("popupMediaSeekForward", String(SEEK_SECONDS))}
                    on:click={() =>
                        dispatch("seek", { position: currentTime + SEEK_SECONDS })}
                >
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <g>
                            <path
                                d="M12 4.5A7.5 7.5 0 1 1 5.5 8.25"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                            />
                            <path d="M11 1.75 14.75 4.5 11 7.25Z" fill="currentColor" />
                        </g>
                        <text x="12" y="15.4" text-anchor="middle">{SEEK_SECONDS}</text>
                    </svg>
                </button>
            {/if}
            {#if status.supportedMediaCommands & _MediaCommand.QUEUE_NEXT}
                <button
                    class="media__next-button ghost"
                    title={_("popupMediaSkipNext")}
                    on:click={() => dispatch("next")}
                />
            {/if}

            {#if textTracks?.length && status.supportedMediaCommands & _MediaCommand.EDIT_TRACKS}
                {@const activeTextTrackId = status.activeTrackIds?.find(
                    trackId =>
                        textTracks?.find(track => track.trackId === trackId)
                )}

                <select
                    class="media__cc-button ghost"
                    class:media__cc-button--off={activeTextTrackId ===
                        undefined}
                    title={_("popupMediaSubtitlesCaptions")}
                    value={activeTextTrackId}
                    on:change={ev => {
                        if (!status.activeTrackIds) return;

                        let activeTrackIds = status.activeTrackIds.filter(
                            trackId => trackId !== activeTextTrackId
                        );

                        const trackId = parseInt(ev.currentTarget.value);
                        if (!Number.isNaN(trackId)) {
                            activeTrackIds.push(trackId);
                        }

                        dispatch("trackChanged", { activeTrackIds });
                    }}
                >
                    <option value={undefined}>
                        {_("popupMediaSubtitlesCaptionsOff")}
                    </option>
                    {#each textTracks as track}
                        <option value={track.trackId}>
                            {track.name ?? track.trackId}
                        </option>
                    {/each}
                </select>
            {/if}

            {#if isLive && !isSeekable}
                <span class="media__live">
                    {_("popupMediaLive")}
                </span>
            {/if}

            {#if device.status?.volume}
                {@const volume = device.status?.volume}
                {@const isMuted = volume.muted || volume.level === 0}

                <div class="media__volume">
                    <button
                        class="media__mute-button ghost"
                        class:media__mute-button--muted={isMuted}
                        disabled={!("muted" in volume)}
                        title={isMuted
                            ? _("popupMediaUnmute")
                            : _("popupMediaMute")}
                        on:click={() => {
                            /**
                             * If not muted and volume is at 0, max out
                             * volume instead of flipping mute value.
                             */
                            if (!volume.muted && volume.level === 0) {
                                dispatch("volumeChanged", {
                                    level: 1
                                });
                            } else {
                                dispatch("volumeChanged", {
                                    muted: !volume.muted
                                });
                            }
                        }}
                    />
                    <input
                        type="range"
                        class="slider media__volume-slider"
                        aria-label={_("popupMediaVolume")}
                        disabled={!("level" in volume)}
                        step="0.05"
                        max={1}
                        value={volume.muted ? 0 : volume.level}
                        on:change={ev => {
                            dispatch("volumeChanged", {
                                level: ev.currentTarget.valueAsNumber
                            });
                        }}
                    />
                </div>
            {/if}
        </div>
    </div>
</div>

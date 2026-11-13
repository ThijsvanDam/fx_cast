# YouTube listen mode — design

## Intent
Play the audio of a YouTube video on a speaker without watching the video.
Main use: Nest Audio ("Bedroom speaker"), which YouTube itself hides because it
has no screen. Later: Sonos speakers, which don't speak Cast at all.

## Goals
- Context-menu entry on YouTube watch pages: **Listen on…** → pick a speaker.
- Speaker plays the video's audio directly from YouTube, full quality, no lag.
- Tab is paused once the speaker starts, so audio doesn't play twice.
- Play/pause/stop via fx_cast's existing media controls.

## Non-goals
- Watching along / tab audio capture (lip-sync lag; dropped for now).
- Sites other than YouTube.
- Playlists/autoplay-next (one video per action).

## Anti-goals
- Must not break normal casting or the existing "Cast media" feature.
- A failing `yt-dlp` must show an error, never crash the bridge.

## Approaches considered
1. **yt-dlp resolves audio URL, speaker fetches it (chosen).** No lag, best quality,
   reuses the existing media sender. Depends on yt-dlp keeping up with YouTube.
2. Tab audio capture streamed via bridge. Works on any site, but lag + lower
   quality, much more code. Rejected for listen-only use.
3. Launch the YouTube Music receiver app on the Nest. Undocumented protocol,
   fragile, Cast-only. Rejected.

## Design
**Step 1 — Nest / Cast speakers**
- Bridge: new message `bridge:resolveAudioUrl { pageUrl }` → runs
  `yt-dlp -f "bestaudio[ext=m4a]/bestaudio" -g --no-playlist <pageUrl>` (also
  title + thumbnail via `--print`) → returns `{ url, title, thumbnail, contentType }`
  or an error. Finds yt-dlp on PATH plus `/opt/homebrew/bin` (browser-launched
  processes have a minimal PATH).
- Extension: menu item "Listen on…" shown on `*.youtube.com/watch*`. On click:
  resolve via bridge → open existing receiver selector → load URL on the chosen
  device with the existing media sender (Default Media Receiver, audio content
  type, title/artwork metadata) → pause the page's video.

**Step 2 — Sonos** (separate follow-up, own small design check)
- Bridge discovers Sonos via mDNS `_sonos._tcp`, controls via local UPnP
  (`SetAVTransportURI` + `Play` on port 1400).
- Sonos shown as extra devices in the selector for "Listen on…" only.
- If Sonos rejects YouTube's long signed URL, proxy it via the bridge's existing
  media server.

## Revision 2026-11-13: "Audio only" in the receiver selector
Feedback after trying step 1: start listen mode from the normal cast popup, not
a separate context menu, and show progress inside the popup, not as a notification.

- Receiver selector media-type dropdown gets a new option **Audio only**
  (new `ReceiverSelectorMediaType` flag), listed between the app option and
  Screen. Only offered when the tab is a YouTube watch/shorts page.
- With Audio only selected, the device list shows every device with
  `AUDIO_OUT` capability (Nest Audio *and* TVs).
- Clicking a device's Cast button: the button shows the existing connecting
  state while the bridge resolves the audio via yt-dlp, then the existing
  media sender plays it (resume position, page pause as in step 1).
- Errors (yt-dlp missing, private video, timeout, speaker load failure) are
  shown inside the popup; no browser notifications or alerts.
- The "Listen on..." context menu and its notifications are removed.
- Considered: an "Audio only" checkbox. Rejected because the dropdown already
  selects *what* to cast, and a checkbox would sit beside Screen where it means
  nothing.

## Constraints
- Must stay compatible with extension 0.3.1 (bridge version 0.3.x).
- Builds against the existing node16 `dns_sd_bindings.node` (see earlier build).
- Requires `yt-dlp` installed (Homebrew).

## Left to the builder
- Exact menu wording/placement, error message text, metadata field mapping.

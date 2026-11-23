# YouTube ads on the TV: status, Skip button, auto-skip — design

## Intent
Ads on the TV's YouTube app are annoying; skippable ones often only become
skippable late. fx_cast should show when an ad plays, offer a Skip button
when YouTube allows skipping, and (on by default) skip automatically the
moment it's allowed — for any YouTube session on the TV, not only ones
fx_cast started.

## What the spike showed (2026-11-23, Living Room TV)
Lounge event stream (long-poll `GET bc/bind?RID=rpc&TYPE=xmlhttp&CI=0&AID=<last>`):
- `adPlaying {duration, currentTime, adVideoId, isSkippable, isSkipEnabled, adState}`
  starts each ad. "Double ads" are separate ads (20 s + 10 s), each with its
  own `adPlaying`.
- `onAdStateChange {adState, currentTime, isSkipEnabled}`: `isSkipEnabled`
  flips to `"true"` when skipping is allowed (seen at 5.3 s); `adState "0"`
  = ad ended (YouTube player states: -1 unstarted, 0 ended, 1 playing,
  2 paused).
- `nowPlaying` in the bind snapshot carries `adState`/`adVideoId` mid-ad.
- The TV runs YouTube as `233637DE` or `2C6A6E3D`; detect it by the
  `urn:x-cast:com.google.youtube.mdx` namespace.
- Not yet proven: `req0__sc=skipAd` is accepted. First real skippable ad
  after the build is the test.

## Goals
- TV panel: "Ad · 0:14 left · Skippable soon" / "· Can't skip"; a
  **Skip ad** button, disabled until `isSkipEnabled`, shown only for
  skippable ads.
- Auto-skip option, **on by default** (user's call), works with the picker
  closed.

## Non-goals / anti-goals
- No ad blocking, no skipping ads YouTube doesn't allow.
- Must not break queue commands or the bridge on network loss.

## Approaches
1. **Long-lived watcher in the bridge (chosen).** Bridge already sees which
   devices run YouTube; works without the popup; one place for the
   unofficial protocol.
2. Watch from the popup only. Rejected: no auto-skip when it's closed.
3. Separate launchd service. Deferred: runs with Zen closed, but extra
   install; the watcher is a standalone module so this can come later.

## Design
**Bridge** `app/src/bridge/components/youtube/adWatcher.ts`:
- Pure `parseLoungeChunks(buffer)` and `YouTubeAdTracker` (events → ad
  state, decides when to auto-skip, once per ad).
- `YouTubeAdWatcher` per device: bind (own device id), long-poll, send
  `skipAd` on its own session; rebinds on stale session, backs off on
  errors; started/stopped from receiver status (mdx namespace present).
- Messages: `main:youtubeAdUpdated {deviceId, ad | null}`,
  `bridge:youtubeSkipAd {deviceId}`, `bridge:setYouTubeAutoSkip {enabled}`.
- Ad state: `{ adVideoId, duration, endsAt (ms epoch), isSkippable,
  isSkipEnabled }`.

**Extension**: option `youtubeAutoSkipAds` (default true) sent to the
bridge on connect and change; `device.youtubeAd`; popup line + button;
`main:youtubeSkipAdSelected {deviceId}` from popup.

## Left to the builder
Wording, countdown styling, backoff timings.

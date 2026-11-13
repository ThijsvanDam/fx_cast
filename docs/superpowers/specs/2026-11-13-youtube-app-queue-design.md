# YouTube app queue (step 2) — design

## Intent
While the YouTube app plays on a TV, add the current page's video to that TV's
YouTube queue (or play it next) from the receiver selector, and remove items
fx_cast added — like the audio-only queue, but for YouTube's own queue.

## What the spike proved (2026-11-13, Living Room TV)
- Screen ID via Cast namespace `urn:x-cast:com.google.youtube.mdx`
  (`getMdxSessionStatus` → `mdxSessionStatus.data.screenId`).
- Lounge token via `POST /api/lounge/pairing/get_lounge_token_batch`.
- Bind via `POST /api/lounge/bc/bind` → SID + gsessionid; `addVideo` and
  `removeVideo` accepted (HTTP 200); TV confirmed "video was added".
- The TV's queue **cannot be read**: the session only reports `listId` and the
  first video; the `RQ…` playlist is "unviewable". So fx_cast can only list
  what it added itself.

## Goals
- On a YouTube video page with **Video and audio** selected, a receiver
  running the YouTube app (`233637DE`) shows **Replace · Add to queue · Play
  next · Stop** (icon + text, cosy style). Add/Play next also pause the tab.
- The receiver's panel shows **Added from fx_cast** (title + ✕ remove).
- Errors show in the selector banner.

## Non-goals
- Showing items added from other devices (impossible, see above).
- Spotify or other apps' queues.
- Reordering.

## Anti-goals
- Must not disturb the audio-only queue, normal casting or the cosy UI.
- A YouTube-side failure must surface as an error, never crash the bridge.

## Approaches
1. **All Lounge logic in the bridge (chosen).** Bridge already has the Cast
   connection; one place to fix when YouTube changes something.
2. Split: bridge fetches the screen ID, extension does HTTPS + memory.
   Rejected: extension fetches may carry the user's YouTube cookies (ties the
   lounge session to their account) and spreads the unofficial part over two
   places.

## Design
**Bridge** (`app/src/bridge/components/youtube/lounge.ts` + pure helpers):
- `getScreenId(host)`: Cast connect → YouTube app transport → mdx channel.
- Lounge token cached per screen ID until its expiry.
- Every command re-binds first (as casttube does; sessions go stale), then
  posts `__sc=addVideo|insertVideo|removeVideo` with `videoId`.
- Remembers fx_cast-added items per device `{ videoId, title }[]`, cleared when
  the bind reports a different `listId` (a new queue) or the app changes.
- Messages, via the long-lived device-manager bridge (so memory persists):
  `bridge:youtubeQueue { deviceId, action: "add"|"playNext"|"remove", videoId, title }`
  → `main:youtubeQueueUpdated { deviceId, items }` or
  `main:youtubeQueueError { deviceId, message }`.
- HTTP via `node-fetch` (pkg's Node 16 has no global fetch).

**Extension**
- deviceManager stores `items` as `device.youtubeQueue`; it reaches the popup
  with the normal device updates.
- Popup → `main:youtubeQueueSelected { device, action, videoId? }`;
  background derives `videoId` from the page URL (watch `v=` / `shorts/<id>`)
  and `title` from the tab title (minus " - YouTube"), sends the bridge
  message, pauses the tab on add/play next, closes the selector on success,
  shows the error otherwise.

## Constraints
- Bridge stays 0.3.x (extension 0.3.2); new extension version for release.
- Unofficial API: expect breakage; errors must be clear.

## Left to the builder
- Exact icons for Play next, error wording, title fallback ("YouTube video").

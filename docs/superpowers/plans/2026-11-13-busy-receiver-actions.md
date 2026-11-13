# Busy Receiver Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Busy receivers show what is playing and offer Replace / Add to queue / Stop as icon + text buttons; Add to queue appends audio-only YouTube audio to a Default Media Receiver session.

**Architecture:** Pure helpers in `ext/src/lib/audioQueue.ts` decide queue eligibility and build the `QUEUE_INSERT` message (unit-tested with `node:test`). The popup emits a new `main:receiverQueueSelected`; `ReceiverSelector` re-dispatches it; `castManager` resolves the audio (existing `resolveYouTubeAudio`) and sends the message through the existing `deviceManager.sendMediaMessage`.

**Tech Stack:** TypeScript, Svelte 3, WebExtension APIs, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-13-youtube-listen-mode-design.md` (section "Revision 2026-11-13 (b)")

## Global Constraints

- Default Media Receiver app ID: `CC1AD845` (`DEFAULT_MEDIA_RECEIVER_APP_ID` in `ext/src/cast/sdk/media/index.ts`).
- Labels: `Replace`, `Add to queue`, `Stop`, `Cast`; each button shows a 16×16 icon before the label, icons in `ext/src/ui/popup/icons/` matching the existing light/dark SVG style.
- No notifications/alerts; errors via `ReceiverSelector#showError`.
- `ext/src/lib/*` helpers import nothing browser-specific (runnable under `node --test`).

## Review Focus

1. Receiver playing YouTube app (not `CC1AD845`) while Audio only is selected → no Add to queue. (Task 1 test)
2. Default Media Receiver idle (no media session) → no Add to queue; Replace/Cast only. (Task 1 test)
3. Video and audio selected on a receiver playing audio-only → no Add to queue. (Task 1 test: `isAudioOnly=false`)
4. Queue item without thumbnail → message has no `images`, not `[{url: undefined}]`. (Task 1 test)
5. Queue error (yt-dlp failure) → banner in selector, buttons usable again. (Task 3 manual)

---

### Task 1: Queue helpers

**Files:** Create `ext/src/lib/audioQueue.ts`, `ext/test/audioQueue.test.ts`

**Interfaces — Produces:**
- `canQueueAudio(opts: { isAudioOnly: boolean; appId?: string; mediaSessionId?: number }): boolean`
- `createQueueInsertMessage(audio: { url: string; title: string; thumbnail?: string; contentType: string }, mediaSessionId: number): { type: "QUEUE_INSERT"; requestId: 0; mediaSessionId: number; items: object[] }`
  — one item: `{ media: { contentId: url, contentType, streamType: "BUFFERED" | "LIVE", metadata: { metadataType: 0, title, images? } }, autoplay: true }`; `streamType` is `"LIVE"` for `application/x-mpegURL`.

- [ ] **Step 1: Failing tests:** `canQueueAudio` true only for `{isAudioOnly: true, appId: "CC1AD845", mediaSessionId: 1}`; false when `isAudioOnly` false, when appId `"233637DE"` (YouTube), when `mediaSessionId` undefined. `createQueueInsertMessage` deep-equals the expected message for an m4a item with thumbnail (`images: [{ url }]`), omits `images` without thumbnail, uses `streamType: "LIVE"` for `application/x-mpegURL`.
- [ ] **Step 2:** `cd ext && npm test` → FAIL (module not found).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `cd ext && npm test` → PASS.
- [ ] **Step 5: Commit** `feat(ext): audio queue helpers`

### Task 2: Background queue flow

**Files:** Modify `ext/src/messaging.ts` (`"main:receiverQueueSelected": { device: ReceiverDevice }`), `ext/src/background/ReceiverSelector.ts` (event `queue` re-dispatch), `ext/src/background/castManager.ts`

**Interfaces — Consumes:** Task 1 helpers; `resolveYouTubeAudio`; `deviceManager.sendMediaMessage(deviceId, message)`; `ReceiverSelector#showError`.

- [ ] **Step 1:** In `createSelector`, listen for `queue`: get the tab URL from `selector.pageInfo`, `resolveYouTubeAudio(url)`, read `mediaSessionId` from `deviceManager.getDevices()` for that device, send `createQueueInsertMessage(...)` via `deviceManager.sendMediaMessage`, then `selector.close()`. Any error → `selector.showError(message)`.
- [ ] **Step 2:** `cd ext && npm test && npx tsc --noEmit -p .` → pass; still exactly 6 pre-existing tsc errors.
- [ ] **Step 3: Commit** `feat(ext): add audio to receiver queue`

### Task 3: Popup buttons with icons

**Files:** Modify `ext/src/ui/popup/Receiver.svelte`, `ext/src/ui/popup/Popup.svelte`, `ext/src/ui/popup/styles/index.css`, `ext/src/_locales/en/messages.json` (`popupReplaceButtonTitle`, `popupQueueButtonTitle`); Create `ext/src/ui/popup/icons/{cast,replace,queue,stop}.svg`

- [ ] **Step 1:** Popup passes `isAudioOnly={effectiveMediaType === AudioOnly}` to `Receiver`, forwards `on:queue` as `main:receiverQueueSelected` (sets `isConnecting`, clears error).
- [ ] **Step 2:** Receiver status line: `device.mediaStatus?.media?.metadata?.title` (with app name before a `·`), else existing text.
- [ ] **Step 3:** Busy: Replace (dispatch `cast`), Add to queue (dispatch `queue`; only if `canQueueAudio({ isAudioOnly, appId: application.appId, mediaSessionId: device.mediaStatus?.mediaSessionId })`), Stop. Idle: Cast. Icon + label in each; connecting state on the clicked button.
- [ ] **Step 4:** Build ext → exit 0; manual check in Zen: audio-only to Bedroom speaker, then on another video Audio only → Bedroom speaker row shows the title + Replace / Add to queue / Stop; Add to queue → second item plays after the first; TV playing YouTube shows Replace / Stop only.
- [ ] **Step 5: Commit** `feat(ext): now playing and Replace / Add to queue / Stop buttons`, push.

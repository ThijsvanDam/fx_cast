# YouTube App Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add to queue / Play next / Remove on a receiver running the YouTube app, via the YouTube Lounge API in the bridge.

**Architecture:** Pure Lounge helpers + a `YouTubeLounge` client (injected HTTP + screen-ID lookup) in `app/src/bridge/components/youtube/`. The long-lived device-manager bridge handles `bridge:youtubeQueue` and replies with the fx_cast-added items, stored on `ReceiverDevice.youtubeQueue` and shown by the popup.

**Tech Stack:** TypeScript, Node `https` (pkg Node 16; `node-fetch` v3 is ESM-only and the bridge is CommonJS), castv2, Svelte 3, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-13-youtube-app-queue-design.md`

## Global Constraints
- YouTube app ID `233637DE`; mdx namespace `urn:x-cast:com.google.youtube.mdx`.
- Lounge base `https://www.youtube.com/api/lounge`; header `X-YouTube-LoungeId-Token`; bind params `RID`, `VER=8`, `CVER=1`; bind device body `device=REMOTE_CONTROL, id=<stable 26 chars>, name=fx_cast, mdx-version=3, pairing_type=cast, app=android-phone-13.14.55`.
- Commands: `add` → `addVideo`, `playNext` → `insertVideo`, `remove` → `removeVideo`; body `count=1, ofs=0, req0__sc=<cmd>, req0_videoId=<id>`.
- Re-bind before every command. Non-200 → `Error("YouTube rejected the request (HTTP <n>)")`.
- Labels: `Play next` (`popupPlayNextButtonTitle`), panel heading `Added from fx_cast` (`popupYouTubeQueueHeading`).

## Review Focus
1. Different `listId` after bind → memory cleared before applying the command. (Task 1 test)
2. Remove of an item fx_cast didn't add → still sent, memory unchanged. (Task 1/2 tests)
3. Lounge token reused until expiry, refetched after. (Task 2 test)
4. YouTube app not running on device → clear error, no HTTP calls. (Task 2 test)
5. Shorts URL → video ID from path; non-video URL → no queue buttons. (Task 3 test)

---

### Task 1: Lounge helpers (bridge)
**Files:** Create `app/src/bridge/components/youtube/loungeHelpers.ts`, `app/test/loungeHelpers.test.ts`
**Produces:**
- `parseBindResponse(text: string): { sid?: string; gsessionid?: string; listId?: string }` (regexes `"c","(.*?)","`, `"S","(.*?)"]`, `"listId":"([^"]+)"`)
- `buildCommandBody(action: "add"|"playNext"|"remove", videoId: string): Record<string,string>`
- `class LoungeQueueMemory { apply(deviceId, listId: string|undefined, action, item: {videoId,title}): {videoId,title}[]; get(deviceId): ...; clear(deviceId) }` — new listId clears; add/playNext append if absent (playNext inserts at front); remove deletes.
- [ ] Failing tests for each (incl. Review Focus 1, 2) → `cd app && npm test` FAIL → implement → PASS → commit `feat(bridge): YouTube lounge helpers`.

### Task 2: Lounge client + bridge message
**Files:** Create `app/src/bridge/components/youtube/lounge.ts`, `app/test/lounge.test.ts`; Modify `app/src/bridge/messaging.ts`, `app/src/bridge/index.ts`, `ext/src/messaging.ts`
**Produces:** `class YouTubeLounge { constructor(deps: { post: PostFn; getScreenId: (host) => Promise<string>; now?: () => number }); queueCommand(opts: { deviceId, host, action, videoId, title }): Promise<{videoId,title}[]> }`; `type PostFn = (url: string, headers: Record<string,string>, body: Record<string,string>) => Promise<{ status: number; text: string }>`; default `post` via `https.request`; default `getScreenId` via castv2 (throws `YouTube isn't running on this device` if app ≠ `233637DE`).
Messages: `bridge:youtubeQueue {deviceId, host, action, videoId, title}`, `main:youtubeQueueUpdated {deviceId, items}`, `main:youtubeQueueError {deviceId, message}`.
- [ ] Failing tests: token fetch → bind → command order and headers; token cached until `expiration` (ms) then refetched; non-200 command → error message; getScreenId rejection → error, `post` not called → implement → PASS; tsc clean → commit `feat(bridge): YouTube lounge queue commands`.

### Task 3: Extension plumbing
**Files:** Create `ext/src/lib/youtubeVideo.ts`, `ext/test/youtubeVideo.test.ts`; Modify `ext/src/types.ts` (`youtubeQueue?: {videoId,title}[]`), `ext/src/background/deviceManager.ts`, `ext/src/background/ReceiverSelector.ts`, `ext/src/background/castManager.ts`, `ext/src/messaging.ts` (`main:youtubeQueueSelected { device, action, videoId? }`)
**Produces:** `getYouTubeVideoId(url): string|null` (watch `v`, `/shorts/<id>`, `youtu.be/<id>`); `cleanYouTubeTitle(title?: string): string` (strip ` - YouTube`, leading `(n) `, fallback `YouTube video`); `deviceManager.sendYouTubeQueueCommand(...)`; deviceManager event `youtubeQueueError`.
- [ ] Failing tests for helpers (Review Focus 5) → implement → PASS.
- [ ] Wire: selector `youtubeQueue` event → castManager resolves videoId/title from `selector.pageInfo`/tab, calls deviceManager; on `main:youtubeQueueUpdated` store items + dispatch device update; error → `selector.showError`; add/playNext success → pause tab videos + close selector. tsc: 6 pre-existing errors only. Commit `feat(ext): YouTube app queue plumbing`.

### Task 4: Popup UI
**Files:** Modify `ext/src/ui/popup/Receiver.svelte`, `Popup.svelte`, `styles/cosy.css`, `_locales/en/messages.json`; Create `icons/play-next.svg`
- [ ] Busy receiver with `appId === "233637DE"`, not audio-only, page is a YouTube video (Popup passes `canQueueYouTube`): buttons Replace · Add to queue · Play next · Stop. Panel (expanded) shows `Added from fx_cast` list from `device.youtubeQueue` with ✕ → `remove`.
- [ ] Build ext → exit 0. Commit `feat(ext): YouTube app queue UI`, push.

### Task 5: Install + verify with the user
- [ ] Rebuild/install bridge (rm + cp), load extension; user tests on Living Room TV: Add to queue → TV says added; Play next; ✕ removes; error when YouTube isn't running.

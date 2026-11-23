# YouTube Ad Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ad status, Skip ad button and default-on auto-skip for YouTube on Cast TVs.

**Architecture:** Bridge watches every device whose running app has the mdx namespace with a long-lived Lounge session; pure parser + tracker decide state and auto-skip; extension stores `device.youtubeAd` and shows it.

**Tech Stack:** TypeScript (bridge TS 4.6 CommonJS, Node 16 via pkg — no fetch), Svelte 3, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-23-youtube-ad-skip-design.md`

## Global Constraints
- Detect YouTube by namespace `urn:x-cast:com.google.youtube.mdx`, never app ID.
- Watcher bind device id differs from the queue client's (`fxcastadwatch0000000000000`) so sessions don't collide.
- Auto-skip default **true** (bridge and extension).
- Tested modules must be self-contained (no extensionless relative imports).

## Review Focus
1. Back-to-back ads: `adState "0"` then a new `adPlaying` → state for the new ad, auto-skip may fire again for it.
2. Auto-skip fires once per ad, not on every repeated `isSkipEnabled:"true"` event.
3. Chunks split across reads → parser keeps the partial rest.
4. Network loss / TV off → watcher backs off, never crashes the bridge.
5. YouTube closed on the device → watcher stops, `ad: null` sent.

---

### Task 1: Parser + tracker (bridge, pure)
**Files:** Create `app/src/bridge/components/youtube/adTracker.ts`, `app/test/adTracker.test.ts`
**Produces:** `parseLoungeChunks(buf: string): { events: [string, any][]; rest: string; lastId: number }`; `interface YouTubeAd { adVideoId: string; duration: number; endsAt: number; isSkippable: boolean; isSkipEnabled: boolean }`; `class YouTubeAdTracker { constructor(now?: () => number); apply(event: [string, any]): { changed: boolean; shouldSkip: boolean }; get ad(): YouTubeAd | null; autoSkip: boolean }`.
- [ ] Failing tests (Review Focus 1–3, end via `adState "0"`, `nowPlaying` without `adState` clears, snapshot `nowPlaying` with `adState` sets ad) → implement → pass → commit.

### Task 2: Watcher + bridge wiring
**Files:** Create `app/src/bridge/components/youtube/adWatcher.ts`; modify `lounge.ts` (export token/screen helpers), `app/src/bridge/index.ts`, `app/src/bridge/messaging.ts`, `ext/src/messaging.ts`
- [ ] `YouTubeAdWatcher(host, { onAd, getToken })`: bind → long-poll loop via `https.get` streaming → tracker → `onAd`; `skip()` posts `skipAd` on its session; `stop()`. Rebind on non-200, 10 s→60 s backoff on errors.
- [ ] index.ts: start/stop per device from `onReceiverStatusUpdate` (namespace check); handle `bridge:youtubeSkipAd`, `bridge:setYouTubeAutoSkip`; stop on device down.
- [ ] tsc clean, tests pass, commit.

### Task 3: Extension
**Files:** `ext/src/defaultOptions.ts`, `ext/src/ui/options/Options.svelte`, `_locales/en/messages.json`, `ext/src/types.ts`, `deviceManager.ts`, `castManager.ts`, `ReceiverSelector.ts`, `Popup.svelte`, `Receiver.svelte`, `styles/cosy.css`
- [ ] Option `youtubeAutoSkipAds` (default true) sent to bridge on connect + change; `device.youtubeAd`; popup ad line with countdown + Skip ad button (disabled until `isSkipEnabled`, hidden for unskippable); build exit 0; commit, push.

### Task 4: Install + verify
- [ ] Install bridge (rm + cp), reload; watch next ad on TV.

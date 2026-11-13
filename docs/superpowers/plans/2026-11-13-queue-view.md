# Queue View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show "Up next" queue items with remove buttons in the receiver panel, and pause the tab's video on Add to queue.

**Architecture:** Pure helpers in `ext/src/lib/audioQueue.ts` (`getUpNext`, `createQueueRemoveMessage`-shaped data via existing `sendMediaMessage`). `Receiver.svelte` renders the list in its expanded panel. `castManager` onQueue pauses the tab's videos after sending `QUEUE_INSERT`.

**Tech Stack:** TypeScript, Svelte 3, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-13-youtube-listen-mode-design.md` (section "Revision 2026-11-13 (c)")

## Global Constraints
- Default Media Receiver only (`CC1AD845`); list hidden when no upcoming items.
- Labels: heading `Up next` (`popupQueueUpNext`), remove button title `Remove from queue` (`popupQueueRemove`), icon ✕ as `icons/remove.svg` in existing icon style.

## Review Focus
1. `currentItemId` missing → treat all items except the first as up next? No: show nothing (avoid listing the playing item). (Task 1 test)
2. `currentItemId` not in `items` → show nothing. (Task 1 test)
3. Item without title → `Untitled`. (Task 1 test)
4. Queue grows/shrinks via later MEDIA_STATUS → list follows (deviceManager merge replaces `items`). (Task 2 manual)
5. Add to queue pauses only videos in the page tab, not other tabs. (Task 2)

---

### Task 1: `getUpNext` helper
**Files:** Modify `ext/src/lib/audioQueue.ts`, `ext/test/audioQueue.test.ts`
**Produces:** `getUpNext(status?: { currentItemId?: number; items?: { itemId?: number; media?: { metadata?: { title?: string } } }[] }): { itemId: number; title: string }[]`
- [ ] Failing tests: items [1,2,3] with current 2 → `[{itemId:3,...}]`; current 1 → items 2,3 with titles; no `currentItemId` → `[]`; current not in items → `[]`; missing title → `"Untitled"`; undefined status → `[]`.
- [ ] `cd ext && npm test` → FAIL; implement; → PASS. Commit `feat(ext): up next queue helper`.

### Task 2: UI + pause on queue
**Files:** Modify `ext/src/ui/popup/Receiver.svelte`, `ext/src/ui/popup/styles/index.css`, `ext/src/_locales/en/messages.json`, `ext/src/background/castManager.ts`; Create `ext/src/ui/popup/icons/remove.svg`
- [ ] In the expanded panel (after `<ReceiverMedia>`), when `application.appId === "CC1AD845"` and `getUpNext(device.mediaStatus)` is non-empty: heading + list; each row title + ✕ button → `sendMediaMessage({ type: "QUEUE_REMOVE", itemIds: [itemId] })`.
- [ ] castManager `onQueue`: after `sendMediaMessage`, `browser.tabs.executeScript(selector.pageInfo.tabId, { code: 'document.querySelectorAll("video").forEach(v => v.pause())', frameId: 0 })` before closing.
- [ ] `cd ext && npm test && node bin/build.js` → pass; tsc still 6 pre-existing errors. Manual (user): queue two items, expand Bedroom speaker → Up next lists the second; ✕ removes it; Add to queue pauses the tab.
- [ ] Commit `feat(ext): queue view with remove; pause tab on add to queue`, push.

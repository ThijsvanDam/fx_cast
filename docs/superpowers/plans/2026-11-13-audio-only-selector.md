# "Audio only" in the Receiver Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Listen on..." context menu with an "Audio only" option in the receiver selector dropdown, with loading and errors shown inside the selector.

**Architecture:** New `ReceiverSelectorMediaType.AudioOnly` flag, offered by `castManager.getReceiverSelection` when the page is a YouTube watch/shorts URL. The popup filters to `AUDIO_OUT` devices for it. `castManager.loadSender` handles it by resolving audio via the bridge (existing `resolveYouTubeAudio`) and injecting the media sender with the chosen device, which `ensureInit({ receiverDevice })` uses to skip a second selector. Errors go back to the open selector via a new `popup:error` message.

**Tech Stack:** TypeScript, Svelte 3 (popup), WebExtension APIs, `node:test` for pure helpers.

**Spec:** `docs/superpowers/specs/2026-11-13-youtube-listen-mode-design.md` (section "Revision 2026-11-13")

## Global Constraints

- Dropdown label: `Audio only` (locale key `popupMediaTypeAudioOnly`); position between the app option and Screen.
- Offered only on YouTube watch/shorts pages: `www|m|music.youtube.com/watch`, `www|m.youtube.com/shorts/`.
- Device filter for Audio only: `capabilities & AUDIO_OUT`.
- No `browser.notifications` and no `window.alert` anywhere in listen mode.
- Bridge unchanged (still 0.3.1, message `bridge:resolveYouTubeAudio`).

## Review Focus

1. After an error banner, picking another speaker works (cast button not stuck in "Casting…"). (Task 3 manual check)
2. Switching the dropdown after an error clears the banner. (Task 3 manual check)
3. Non-YouTube page (and YouTube home page) → no "Audio only" option. (Task 1 test)
4. Speaker fails to load the stream after the selector has closed → page video resumes so the user isn't left in silence. (Task 2)
5. Selector closed by the user while resolving → no exception; `popup:error` to a closed selector is a no-op. (Task 2)

---

### Task 1: YouTube URL helper + media type flag

**Files:**
- Create: `ext/src/lib/youtubeUrl.ts`, `ext/test/youtubeUrl.test.ts`
- Modify: `ext/package.json` (`"test": "node --test \"test/**/*.test.ts\""`), `ext/src/types.ts` (`AudioOnly = 8` in `ReceiverSelectorMediaType`)

**Interfaces:**
- Produces: `isYouTubeAudioOnlyUrl(url: string): boolean` (no imports; erasable TS only); `ReceiverSelectorMediaType.AudioOnly = 8`.

- [ ] **Step 1: Failing tests:** true for `https://www.youtube.com/watch?v=abc`, `https://m.youtube.com/watch?v=abc&list=x`, `https://music.youtube.com/watch?v=abc`, `https://www.youtube.com/shorts/abc`, `https://m.youtube.com/shorts/abc`; false for `https://www.youtube.com/`, `https://www.youtube.com/@LofiGirl`, `https://example.com/watch?v=abc`, `not a url`.
- [ ] **Step 2:** `cd ext && npm test` → FAIL (module not found).
- [ ] **Step 3:** Implement with `new URL`, host allow-list and pathname check (`/watch` exact, or starts with `/shorts/`); invalid URL → false.
- [ ] **Step 4:** `cd ext && npm test` → PASS.
- [ ] **Step 5: Commit** `feat(ext): YouTube audio-only URL helper and media type flag`

### Task 2: Background flow (selector → resolve → media sender)

**Files:**
- Modify: `ext/src/background/castManager.ts` (`getReceiverSelection`, `loadSender`)
- Modify: `ext/src/background/youtubeAudio.ts` (add `startAudioOnlyCast`)
- Modify: `ext/src/background/ReceiverSelector.ts` (add `showError`)
- Modify: `ext/src/messaging.ts` (`"popup:error": string` in `ExtMessageDefinitions`)
- Modify: `ext/src/cast/senders/media.ts` (`receiverDevice` option; resume on load error; remove `window.alert`)
- Modify: `ext/src/background/menus.ts`, `ext/src/_locales/en/messages.json` (remove "Listen on..." menu, `listenOnSpeaker`, notifications, `contextListen`)

**Interfaces:**
- Consumes: `isYouTubeAudioOnlyUrl`, `AudioOnly` (Task 1); `resolveYouTubeAudio(pageUrl)` (existing).
- Produces:
  - `startAudioOnlyCast(tabId: number, pageUrl: string, device: ReceiverDevice): Promise<void>` — resolves audio, injects globals (`mediaUrl`, `mediaTitle`, `mediaImageUrl`, `mediaContentType`, `pauseVideosOnLoad = true`, `receiverDevice`, `targetElementId = undefined`) then `cast/senders/media.js` in frame 0; rejects with the resolve error.
  - `ReceiverSelector#showError(message: string): void` — posts `popup:error` to the popup port if open, otherwise no-op.
  - `MediaSenderOpts.receiverDevice?: ReceiverDevice`, passed to `ensureInit({ contextTabId, receiverDevice })`; global `window.receiverDevice`, deleted after reading like the other listen globals.

- [ ] **Step 1:** `getReceiverSelection`: if `pageInfo?.url` passes `isYouTubeAudioOnlyUrl`, `availableMediaTypes |= AudioOnly` (default media type unchanged).
- [ ] **Step 2:** `loadSender`: case `AudioOnly` → `startAudioOnlyCast(contentContext.tabId, <tab URL via browser.tabs.get>, selection.device)`; on rejection `receiverSelector?.showError(err.message)`. Selector closes on `main:castSessionCreated` as today.
- [ ] **Step 3:** Media sender: pass `receiverDevice` to `ensureInit`; in the `loadMedia` error callback, when `pauseVideosOnLoad`, log and `play()` the videos it paused (no alert).
- [ ] **Step 4:** Remove the context menu item, `listenOnSpeaker`, `listenTabsResolving`, notification calls and `contextListen` locale entry.
- [ ] **Step 5:** `cd ext && npm test && npx tsc --noEmit -p .` → tests pass, still exactly 6 pre-existing tsc errors, none in touched files; `node bin/build.js` exits 0; `grep -rn "notifications.create\|window.alert" src/background/youtubeAudio.ts src/background/menus.ts src/cast/senders/media.ts` → only pre-existing hits (none from listen mode).
- [ ] **Step 6: Commit** `feat(ext): audio-only casting from the receiver selector`

### Task 3: Popup UI

**Files:**
- Modify: `ext/src/ui/popup/Popup.svelte`, `ext/src/ui/popup/Receiver.svelte`, `ext/src/_locales/en/messages.json` (`popupMediaTypeAudioOnly`: `Audio only`)

**Interfaces:**
- Consumes: `AudioOnly` (Task 1), `popup:error` (Task 2).

- [ ] **Step 1:** Dropdown: `<option value={AudioOnly}>` between app and Screen, rendered only when `availableMediaTypes & AudioOnly`.
- [ ] **Step 2:** `isDeviceCompatible`: case `AudioOnly` → `!!(device.capabilities & ReceiverDeviceCapabilities.AUDIO_OUT)`.
- [ ] **Step 3:** `popup:error` → `errorMessage = message.data; isConnecting = false`; render it in a `banner banner--warn` above the device list; clear `errorMessage` when `mediaType` changes or a cast starts.
- [ ] **Step 4:** `Receiver.svelte`: `$: if (!isAnyConnecting) isConnecting = false;` so the button leaves "Casting…" after an error.
- [ ] **Step 5:** Build ext → exit 0. Manual check in Zen (temporary add-on reload, tab reload): Audio only appears on a watch page and not on the YouTube home page; lists Bedroom speaker + Living Room TV; casting shows "Casting…" then plays and pauses the tab; on a removed video the banner shows the yt-dlp error and another speaker can be picked; switching the dropdown clears the banner.
- [ ] **Step 6: Commit** `feat(ext): Audio only option in receiver selector`, push branch.

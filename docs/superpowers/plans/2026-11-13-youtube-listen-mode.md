# YouTube Listen Mode (Step 1: Cast speakers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Listen on…" menu item on YouTube pages that plays the video's audio-only stream on a Cast speaker (e.g. Nest Audio) and pauses the tab.

**Architecture:** The bridge gets a `bridge:resolveYouTubeAudio` message that runs `yt-dlp` and returns the direct audio URL plus title/thumbnail. The extension background resolves the URL on menu click, then injects the existing media sender (`cast/senders/media.js`) with that URL and no target element, so only `AUDIO_OUT` is requested and audio-only speakers are offered. The sender loads it on the Default Media Receiver and pauses the page's videos.

**Tech Stack:** TypeScript, Node (bridge, packaged with pkg node16), WebExtension APIs, `yt-dlp` (Homebrew), `node:test` for bridge unit tests.

**Spec:** `docs/superpowers/specs/2026-11-13-youtube-listen-mode-design.md`

## Global Constraints

- Bridge version stays `0.3.1` (`app/config.json`); extension version stays `0.3.1`.
- Bridge message types in `app/src/bridge/messaging.ts` MUST stay in sync with `ext/src/messaging.ts`.
- yt-dlp format selector: `bestaudio[ext=m4a]/bestaudio`; always `--no-playlist`.
- yt-dlp lookup: `PATH`, then `/opt/homebrew/bin/yt-dlp`, then `/usr/local/bin/yt-dlp`.
- A failing yt-dlp must produce an error message to the extension, never crash the bridge.
- Bridge build: `npm run build -- --use-pkg` in `app/` with `node_modules/mdns/build/Release/dns_sd_bindings.node` staged from the installed bridge (deps installed with `--ignore-scripts`).
- English-only UI strings; new menu title: `Listen on…`.

## Review Focus

1. yt-dlp not installed → user sees "yt-dlp not found (install with `brew install yt-dlp`)" notification; bridge keeps running. (Task 1 test)
2. Watch URL with `&list=` → only that single video plays. (Task 1 test asserts `--no-playlist`)
3. Private/age-restricted/removed video → yt-dlp exits non-zero → notification shows yt-dlp's `ERROR:` line. (Task 1 test)
4. yt-dlp hangs → 30 s timeout → error, not a stuck menu. (Task 1 test)
5. Only WebM audio available → content type `audio/webm` instead of `audio/mp4`. (Task 1 test)

---

### Task 1: Bridge YouTube audio resolver

**Files:**
- Create: `app/src/bridge/components/youtube.ts`
- Create: `app/test/youtube.test.ts`
- Modify: `app/package.json` (add `"test": "node --test test/"`)

**Interfaces:**
- Produces:
  - `interface ResolvedAudio { url: string; title: string; thumbnail?: string; contentType: string }`
  - `type RunFn = (file: string, args: string[], timeoutMs: number) => Promise<string>` (resolves stdout, rejects with `Error` whose message is stderr or `"timeout"`)
  - `findYtDlp(exists?: (p: string) => boolean, pathEnv?: string): string | null`
  - `resolveYouTubeAudio(pageUrl: string, deps?: { run?: RunFn; ytDlpPath?: string | null }): Promise<ResolvedAudio>`
  - Constant `YT_DLP_TIMEOUT_MS = 30000`

Use only erasable TS syntax (no enums/parameter properties) so `node --test` can run it with native type stripping (Node 24). Import the module in tests as `../src/bridge/components/youtube.ts`.

- [ ] **Step 1: Write failing tests** in `app/test/youtube.test.ts` (`node:test` + `node:assert/strict`):
  - `resolves m4a audio`: fake `run` returns `"https://rr1.googlevideo.com/x\nMy Video\nhttps://i.ytimg.com/t.jpg\nm4a\n"` → result `{ url: "https://rr1.googlevideo.com/x", title: "My Video", thumbnail: "https://i.ytimg.com/t.jpg", contentType: "audio/mp4" }`; captured args include `"-f"`, `"bestaudio[ext=m4a]/bestaudio"`, `"--no-playlist"` and end with the page URL.
  - `maps webm to audio/webm`: ext line `webm` → `contentType === "audio/webm"`.
  - `missing thumbnail`: thumbnail line `NA` → `thumbnail === undefined`.
  - `yt-dlp not found`: `ytDlpPath: null` → rejects with message `yt-dlp not found (install with \`brew install yt-dlp\`)`.
  - `surfaces yt-dlp error line`: `run` rejects with `Error("WARNING: x\nERROR: [youtube] abc: Private video\n")` → rejects with message `ERROR: [youtube] abc: Private video`.
  - `timeout`: `run` rejects with `Error("timeout")` → rejects with message `yt-dlp timed out`; and `run` was called with `timeoutMs === 30000`.
  - `rejects non-YouTube URL`: `https://example.com/watch?v=1` → rejects with `Not a YouTube URL`, `run` not called.
  - `findYtDlp`: with `pathEnv = "/a:/b"` and `exists` true only for `/opt/homebrew/bin/yt-dlp` → returns that; all false → `null`; true for `/b/yt-dlp` → `/b/yt-dlp`.

- [ ] **Step 2: Run** `cd app && npm test` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement `app/src/bridge/components/youtube.ts`.**
  Args: `["-f", "bestaudio[ext=m4a]/bestaudio", "--no-playlist", "--no-warnings", "--print", "urls", "--print", "title", "--print", "thumbnail", "--print", "ext", pageUrl]`; parse 4 lines in that order. Accept hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`. Default `run` uses `child_process.execFile` with `timeout`, `maxBuffer: 1 MiB`, rejecting with `Error("timeout")` when killed by timeout. Error message: last line starting with `ERROR:` in the message, else the trimmed message.

- [ ] **Step 4: Run** `cd app && npm test` → Expected: all pass.

- [ ] **Step 5: Commit** `feat(bridge): resolve YouTube audio stream via yt-dlp`

### Task 2: Bridge message + extension message types

**Files:**
- Modify: `app/src/bridge/messaging.ts` (`MessageDefinitions`)
- Modify: `app/src/bridge/index.ts` (switch in `messaging.on("message")`)
- Modify: `ext/src/messaging.ts` (`AppMessageDefinitions`, same three entries)

**Interfaces:**
- Consumes: `resolveYouTubeAudio`, `ResolvedAudio` (Task 1)
- Produces messages:
  - `"bridge:resolveYouTubeAudio": { pageUrl: string }`
  - `"main:youTubeAudioResolved": ResolvedAudio` (type duplicated inline in ext)
  - `"main:youTubeAudioError": string`

- [ ] **Step 1:** Add the three definitions to both messaging files.
- [ ] **Step 2:** Handle `bridge:resolveYouTubeAudio` in `index.ts`: call `resolveYouTubeAudio(...).then(send resolved).catch(err => send error with err.message)`.
- [ ] **Step 3: Verify manually** with the packaged bridge (build per Global Constraints), sending `{"subject":"bridge:resolveYouTubeAudio","data":{"pageUrl":"https://www.youtube.com/watch?v=jNQXAC9IVRw"}}` over native messaging (python length-prefixed stdin script) → Expected reply subject `main:youTubeAudioResolved` with a `googlevideo.com` URL and `contentType` `audio/mp4`. Then with `pageUrl` `https://www.youtube.com/watch?v=xxxxxxxxxxx` → `main:youTubeAudioError`, and process still running afterwards.
- [ ] **Step 4:** `npx tsc --noEmit -p app` and `npx tsc --noEmit -p ext` → no errors.
- [ ] **Step 5: Commit** `feat: add resolveYouTubeAudio bridge message`

### Task 3: Media sender audio-only options

**Files:**
- Modify: `ext/src/cast/senders/media.ts`

**Interfaces:**
- Produces: `MediaSenderOpts` gains `mediaTitle?: string; mediaImageUrl?: string; mediaContentType?: string; pauseVideosOnLoad?: boolean`. Content-script globals read at the bottom of the file: `window.mediaTitle`, `window.mediaImageUrl`, `window.mediaContentType`, `window.pauseVideosOnLoad`.

- [ ] **Step 1:** In `loadMedia`: `new cast.media.MediaInfo(mediaUrl.href, this.mediaContentType ?? "")`; title = `this.mediaTitle ?? <existing pathname title>`; if `mediaImageUrl`, set `metadata.images = [new cast.Image(mediaImageUrl)]`.
- [ ] **Step 2:** In the `loadMedia` success callback: if `pauseVideosOnLoad`, pause every `document.querySelectorAll("video")`.
- [ ] **Step 3:** Pass the new globals through in the content-script bootstrap block.
- [ ] **Step 4:** `npx tsc --noEmit -p ext` → no errors; existing "Cast…" on a `<video>` unchanged (no new globals set → same behavior).
- [ ] **Step 5: Commit** `feat(ext): media sender metadata and pause-on-load options`

### Task 4: "Listen on…" menu

**Files:**
- Create: `ext/src/background/youtubeAudio.ts`
- Modify: `ext/src/background/menus.ts`
- Modify: `ext/src/_locales/en/messages.json` (key `contextListen`, message `Listen on…`)

**Interfaces:**
- Consumes: messages from Task 2; media sender globals from Task 3; `bridge.connect()` from `ext/src/lib/bridge.ts`.
- Produces: `resolveYouTubeAudio(pageUrl: string): Promise<ResolvedAudio>` in `youtubeAudio.ts` — opens a bridge port, posts `bridge:resolveYouTubeAudio`, resolves/rejects on the reply, rejects with `Bridge timed out` after 35 s or on disconnect, always disconnects the port.

- [ ] **Step 1:** Implement `youtubeAudio.ts`.
- [ ] **Step 2:** In `initMenus`, create `menuIdListen` with `contexts: ["page", "video"]`, `title: _("contextListen")`, `documentUrlPatterns: ["https://www.youtube.com/watch*", "https://m.youtube.com/watch*", "https://music.youtube.com/watch*", "https://www.youtube.com/shorts/*"]`.
- [ ] **Step 3:** In `onMenuClicked`, case `menuIdListen`: resolve with `tab.url`; on success inject globals (`mediaUrl`, `mediaTitle`, `mediaImageUrl`, `mediaContentType`, `pauseVideosOnLoad = true`, no `targetElementId`) via `stringify` and then `cast/senders/media.js` into the top frame; on failure `browser.notifications.create({ type: "basic", title: "fx_cast", message: err.message, iconUrl: "icons/icon.svg" })`.
- [ ] **Step 4:** Build ext (`cd ext && npm run build`) → `dist/ext` produced without errors.
- [ ] **Step 5: Commit** `feat(ext): add "Listen on…" menu for YouTube`

### Task 5: Install and verify in Zen

- [ ] **Step 1:** Rebuild + install bridge (back up current `~/Library/Application Support/fx_cast/fx_cast_bridge` first).
- [ ] **Step 2:** In Zen: disable the installed fx_cast, then `about:debugging` → This Zen → Load Temporary Add-on → `dist/ext/manifest.json`.
- [ ] **Step 3:** On a YouTube watch page, right-click → "Listen on…" → selector lists "Bedroom speaker" → choose it → Expected: audio plays on the Nest, tab video paused, title shown in fx_cast's media controls; pause/stop from the selector works.
- [ ] **Step 4:** Unhappy path: "Listen on…" on a removed/private video → notification with yt-dlp error; normal "Cast…" still works afterwards.
- [ ] **Step 5:** Push branch `feat/youtube-listen-mode` to `origin`.

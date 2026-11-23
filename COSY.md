# fx_cast (cosy)

A personal fork of [fx_cast](https://github.com/hensm/fx_cast) for the Zen
browser on macOS, aimed at casting YouTube to Chromecast speakers and TVs.
Based on upstream **v0.3.1**; work lives on branch `feat/youtube-listen-mode`.

- Extension ID: `fx-cast-cosy@thijsvandam` (signed as an unlisted add-on on
  addons.mozilla.org; upstream's `fx_cast@matt.tf` belongs to upstream)
- Bridge: upstream's 0.3.1 bridge plus the fixes and features below

## What it adds

| Feature | Where you see it |
|---|---|
| **Audio only** casting of YouTube videos | YouTube dropdown → *Video and audio* / *Audio only* |
| **Busy speakers**: what's playing, Replace / Add to queue / Stop | Receiver picker rows |
| **Audio queue**: "Up next" list, remove items | Expanded speaker panel |
| **YouTube app queue on the TV**: Add to queue, Play next, remove | Picker, on a YouTube video page, for a TV running YouTube |
| **YouTube ads**: "Ad · 0:14 left", Skip ad button, auto-skip (on by default) | TV row in the picker; option on the settings page |
| **Shortcut** Option+Shift+C opens/closes the picker | Anywhere in Zen |
| **10 s seek buttons**, auto-expanded playing speakers | Speaker panel |
| **Cosy theme** for picker, settings and mirroring window | Everywhere |

Fixes: the bridge no longer crashes on IPv6 link-local addresses (prefers
IPv4) or when one speaker is unreachable.

## How it fits together

```
 Zen ── extension ──(native messaging)── bridge (fx_cast_bridge) ──┬─ Cast protocol (port 8009) ── speakers / TV
        picker, settings,                 long-lived per browser   ├─ yt-dlp (audio-only stream URLs)
        page cast SDK shim                                         └─ YouTube Lounge API (https) ── YouTube app on the TV
```

- **Extension** (`ext/`): Svelte popup ("picker"), background scripts, and
  a Cast SDK shim that lets sites like YouTube cast. `background/deviceManager.ts`
  keeps one long-lived bridge connection and the device list
  (`ReceiverDevice`: status, media status, `youtubeQueue`, `youtubeAd`).
- **Bridge** (`app/`): native app started by the browser. Discovers devices
  over mDNS, keeps a Cast connection per device (`components/cast/remote.ts`)
  and forwards status. Message types are shared in `app/src/bridge/messaging.ts`
  and `ext/src/messaging.ts` (keep them in sync).

### Audio only
The bridge runs `yt-dlp -f "bestaudio[ext=m4a]/bestaudio"` on the page URL
(`components/youtube.ts`) and the extension casts the resulting stream with
the Default Media Receiver (`CC1AD845`). The browser tab is paused. *Add to
queue* sends `QUEUE_INSERT`; the speaker's status only lists a window of the
queue, so the bridge fetches the full list separately (`cast/queueTracker.ts`).

### YouTube app on the TV (Lounge API)
The TV's YouTube app is the same remote-control target your phone uses.
fx_cast talks to it like a phone does:

1. Ask the app for its **screen ID** over the Cast channel
   `urn:x-cast:com.google.youtube.mdx` (`getMdxSessionStatus`).
2. Trade it for a **lounge token**: `POST /api/lounge/pairing/get_lounge_token_batch`.
3. **Bind** a session: `POST /api/lounge/bc/bind` → `SID` + `gsessionid`.
4. Send **commands** on that session (`req0__sc=addVideo | insertVideo | removeVideo | skipAd`)
   or **long-poll** it for events (`GET bc/bind?RID=rpc&TYPE=xmlhttp&AID=<last>`).

YouTube is recognised by that mdx channel, **not** by app ID: the TV runs it
as `233637DE` or `2C6A6E3D` depending on how it was started.

- **Queue** (`components/youtube/lounge.ts`): re-binds per command. YouTube's
  queue itself can't be read, so fx_cast lists only what it added ("Added
  from fx_cast") and drops items once they've played.
- **Ads** (`components/youtube/adWatcher.ts`, `adTracker.ts`): while YouTube
  runs on a device, the bridge keeps a long-poll session open and follows
  `adPlaying` (start, length, `isSkippable`) and `onAdStateChange`
  (`isSkipEnabled`, `adState "0"` = ended). Two ads in a row arrive as two
  ads. With auto-skip on, it sends `skipAd` once per ad the moment
  `isSkipEnabled` turns true. Ads YouTube doesn't allow skipping can't be
  skipped. This works for any YouTube session on the TV (phone, remote or
  fx_cast), but only while Zen (and so the bridge) is running.

The Lounge API is unofficial: expect YouTube to change it. Errors are shown
in the picker rather than crashing the bridge.

## Building and installing (macOS)

```sh
# Bridge (Node 16 via pkg; reuses the installed mdns binding)
cd app && npm run build -- --use-pkg
rm ~/Library/Application\ Support/fx_cast/fx_cast_bridge     # remove first:
cp ../dist/app/fx_cast_bridge ~/Library/Application\ Support/fx_cast/   # overwriting in place gets it killed

# Extension
cd ext && npm run build          # load dist/ext as a temporary add-on (about:debugging) to try it
```

The native-messaging manifests in `~/Library/Application Support/{Mozilla,zen}/NativeMessagingHosts/fx_cast_bridge.json`
must list both extension IDs in `allowed_extensions`.

Tests: `node --test "test/**/*.test.ts"` in `app/` and in `ext/` (Node 24
type stripping; modules under test must not use extensionless relative imports).

## Releasing

1. Bump `version` in `ext/src/manifest.json`, commit, push.
2. `cd ext && npm run package`, unzip `dist/ext/*.xpi` into `dist/sign`.
3. `git archive --format=zip -o dist/fx_cast-cosy-<version>-source.zip HEAD`
4. With your AMO API key/secret exported (never pasted anywhere):
   `npx web-ext@latest sign --channel=unlisted --source-dir dist/sign --artifacts-dir dist/signed --upload-source-code dist/fx_cast-cosy-<version>-source.zip`
5. Install the signed `.xpi` from `dist/signed` via about:addons → *Install Add-on From File…*.

## Design notes

Specs and plans for each feature are in `docs/superpowers/specs/` and
`docs/superpowers/plans/`; throwaway protocol experiments in
`docs/superpowers/spikes/`.

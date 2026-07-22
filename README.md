# 1a2n-track-id

Local overlay server for Twitch DJ streams: live Traktor Pro 4 deck/track info rendered as an OBS browser source. Shows all four decks, a now-playing hero with cover art, and a track history list.

```
Traktor Pro 4 (QML mod) --HTTP POST--> local server --WebSocket--> OBS browser source
```

Everything runs on your machine; nothing leaves `127.0.0.1`.

## Setup

### 1. Install the Traktor QML mod (one time)

The mod (adapted from [traktor-api-client](https://github.com/ErikMinekus/traktor-api-client), MIT) makes Traktor push deck state to `http://localhost:8080`.

1. Close Traktor.
2. Open PowerShell **as Administrator** and run:
   ```powershell
   .\traktor-mod\install.ps1
   ```
   (Backs up the stock files; `.\traktor-mod\uninstall.ps1` restores them.)
3. Start Traktor Pro 4. If you don't own a Kontrol D2: **Preferences > Controller Manager > Add... > Traktor > Kontrol D2**. No hardware is needed; the "virtual" D2 mapping is what runs the mod.

> **After a Traktor update:** NI updates can overwrite the mod. Just run `install.ps1` again.

### 2. Start the overlay server

Double-click **`start-overlay.cmd`** (make a desktop shortcut for pre-stream convenience). It installs dependencies on first run, starts the server, and opens the overlay in your browser as a quick check. Start order does not matter: decks already loaded in Traktor appear within about 10 seconds; new loads appear immediately.

Closing that window (the X button, Ctrl+C, or an ordinary process kill) stops the server with it; it does not linger as a background process. The server also exits on its own ~60 seconds after the last overlay window/OBS source disconnects (it won't exit before the first one connects). Use `node dist/main.js --no-auto-exit` to disable that.

### 3. Add the overlay to OBS

1. Sources > **+** > **Browser**.
2. URL: `http://127.0.0.1:8080/overlay`. Width/height: your canvas size (e.g. 1920x1080).
3. The page background is transparent; position/crop as you like.

Views, if you want separate OBS sources per element:

| URL | Shows |
| --- | --- |
| `/overlay` | everything |
| `/overlay?view=now` | now-playing hero only |
| `/overlay?view=decks` | 4-deck grid only |
| `/overlay?view=history` | track history only |

Themes: the page ground defaults to dark (Pitch). The top-right toggle cycles dark, paper, and grey and remembers the choice. `?theme=dark|paper|grey|transparent` overrides it; use `transparent` to composite over video in OBS.

## Privacy

The server binds to `127.0.0.1` only. WebSocket connections from non-local web origins are rejected, and client-facing state never includes local file paths. Fonts are self-hosted; the overlay makes no external requests.

## How it decides what's "on air"

A deck is on air when it's playing **and** its mixer channel is audible (volume up, crossfader not fully away). A track is added to the history only after ~10 s continuously on air, so quick cuts and previews don't spam the list. The now-playing area is a fixed 2x2 grid matching the deck layout; each slot holds its space and fades in when its deck is on air, carrying a pulsing ON AIR badge. A playing deck pulses gently when under 60 seconds remain.

History starts empty on every launch and is written to `history/session-<date>.json` as tracks play; start with `--resume` to reload today's file (e.g. after a mid-set restart).

## Mixer telemetry

Deck cards show live EQ positions, LOOP tags, and a dot when a deck's key is Camelot-compatible with the on-air track. Data arrives at 10 Hz from the QML mod; idle mixers send nothing. Re-run `traktor-mod\install.ps1` after updating to enable it.

## Development

```
npm run dev        # dev server on port 8090 with reload (auto-exit disabled)
npm run simulate   # fake deck data against the dev server, no Traktor needed
npm test           # vitest
npm run lint       # eslint
npm run typecheck  # tsc, covers src/, src-overlay/, and scripts/
npm run build      # production build (tsc + esbuild)
```

Development runs on port 8090 (`http://127.0.0.1:8090/overlay`); the production launcher owns 8080. This keeps stale dev servers and simulated data away from the live overlay.

Config via env vars: `TRACK_ID_PORT` (default 8080), `TRACK_ID_EXIT_GRACE_MS` (default 60000).

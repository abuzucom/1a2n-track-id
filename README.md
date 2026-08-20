# 1a2n-track-id

Local overlay server for Twitch DJ streams: live Traktor Pro 4 deck/track info rendered as an OBS browser source. Shows all four decks, now playing with cover art, BPM, key notation, track position, and a track history list.

```
Traktor Pro 4 (QML mod) --HTTP POST--> local server --WebSocket--> OBS browser source
```

Local only; nothing leaves `127.0.0.1`.

## Setup

### 1. Install the Traktor QML mod (one time)

The mod (adapted from [traktor-api-client](https://github.com/ErikMinekus/traktor-api-client), MIT) makes Traktor push deck state to `http://localhost:8080`.

1. Close Traktor.
2. Run the installer for your OS:
   - **Windows**: Open PowerShell **as Administrator** and run:
     ```powershell
     .\traktor-mod\install.ps1
     ```
     (`.\traktor-mod\uninstall.ps1` restores stock files.)
   - **macOS**: Open Terminal and run:
     ```bash
     ./traktor-mod/install.sh
     ```
     (`./traktor-mod/uninstall.sh` restores stock files.)

   The installer checks the mod's QML before it copies anything, and aborts
   without touching Traktor if a file would not parse. Traktor silently drops a
   mapping it cannot parse, which shows up as the D2 refusing to be added.
   Node.js must be on PATH for that check; the overlay server needs it anyway.
3. Start Traktor Pro. No hardware is needed. If you don't own a Kontrol D2: **Preferences > Controller Manager > Add... > Traktor > Kontrol D2**. The "virtual" D2 mapping is what runs the mod.

> **After a Traktor update:** NI updates can overwrite the mod. Just run the install script again.

> **After a material change in the QML mod:** Run the install script again.

### 2. Start the overlay server

- **Windows**: Double-click **`start-overlay.cmd`** (make a desktop shortcut for pre-stream convenience).
- **macOS**: Open Terminal and run **`./start-overlay.sh`**.

It installs dependencies on first run, starts the server, and opens the overlay in your browser as a quick check. Start order does not matter: decks already loaded in Traktor appear within about 10 seconds; new loads appear immediately.

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

The server binds to `127.0.0.1` only, and every route requires a `Host` header naming the loopback interface. That second check matters: binding to `127.0.0.1` stops other machines, but not a web page you happen to visit mid-set, which can point a hostname it controls at `127.0.0.1` and reach the server as same-origin. Requests carrying any other host get `403`. Addressing the server as `127.0.0.1` or `localhost`, as the Traktor mod and OBS both do, needs no change.

WebSocket connections from non-local web origins are rejected, and client-facing state never includes local file paths. Cover art is read only from real audio files and served only as an image type. Fonts are self-hosted; the overlay makes no external requests and runs under a Content-Security-Policy that says so.

`trackKey` is an identifier, not an anonymizer: it is an unsalted hash of a file path, so it can confirm a guessed path offline. See [docs/state-api.md](docs/state-api.md).

## How it decides what's "on air"

A deck is on air when it's playing **and** its mixer channel is audible (volume up, crossfader not fully away). A track is added to the history only after ~10 s continuously on air, so quick cuts and previews don't spam the list. The now-playing area is a fixed 2x2 grid matching the deck layout; each slot holds its space and fades in when its deck is on air, carrying a pulsing ON AIR badge. A playing deck pulses gently when under 60 seconds remain.

History starts empty on every launch and is written to `history/session-<date>.json` as tracks play; start with `--resume` to reload today's file (e.g. after a mid-set restart).

## Mixer telemetry

Deck cards show live EQ positions, a LOOP tag, and a dot when a deck's key is Camelot-compatible with the on-air track. Data arrives at 10 Hz from the QML mod via `/updateMixer`; idle mixers send nothing. Re-run `traktor-mod\install.ps1` after updating to enable it.

## Ingest API

The QML mod posts deck state to these routes; nothing outside `127.0.0.1` can reach them.

| Route | Purpose |
| --- | --- |
| `POST /deckLoaded/:deck` | A track loaded into a deck (`deck` is a Traktor deck id) |
| `POST /updateDeck/:deck` | Deck state changed (play/cue/position/etc.) |
| `POST /updateChannel/:n` | Mixer channel `n` (1-4) changed (volume, EQ, crossfader) |
| `POST /updateMixer` | Mixer-wide telemetry (loops, key compatibility) |
| `POST /updateMasterClock` | Master BPM/tempo/beat clock changed |
| `GET /state` | Current snapshot as JSON (file paths stripped) |
| `GET /art/:id` | Cover art lookup by cache id |

## Development

```
npm run dev        # dev server on port 8090 with reload (auto-exit disabled)
npm run simulate   # fake deck data against the dev server, no Traktor needed
npm test           # vitest
npm run test:watch # vitest in watch mode
npm run lint       # eslint
npm run typecheck  # tsc, covers src/, src-overlay/, and scripts/
npm run build      # production build (tsc + esbuild)
```

Development runs on port 8090 (`http://127.0.0.1:8090/overlay`); the production launcher owns 8080. This keeps stale dev servers and simulated data away from the live overlay.

Config via env vars: `TRACK_ID_PORT` (default 8080), `TRACK_ID_EXIT_GRACE_MS` (default 60000).

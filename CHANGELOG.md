# Changelog

All notable changes to this project are documented here. Versioning follows [SemVer](https://semver.org/); versions below 1.0.0 are unstable initial development.

## [0.7.2] - 2026-07-19

### Fixed

- Camelot key never appeared in stats or the compatible-key highlight: Traktor's `track.key.resulting.precise` CSI property is not reliably Camelot-formatted, so `resultingKey` was frequently unparseable. Camelot is now derived from Open Key notation (which is reliable) whenever Open Key is recognized, falling back to `resultingKey` only when it isn't.

## [0.7.1] - 2026-07-19

### Fixed

- EQ meters lagged while a knob was actively turning: the QML mod debounced EQ changes (waited for 250ms of quiet before sending), so the overlay only updated after you stopped turning the knob. Now polls at 100ms like the mixer frame, matching the level of live-ness the previous EQ rendering fix assumed but the QML side didn't actually provide.
- Track position ("0:33 / 12:47") polled once a second, visibly stepping instead of tracking playback. Now polls at the same 100ms rate as the mixer/EQ frames.

### Changed

- Hero (now-playing) stats (BPM/key) moved below the artist name instead of sitting to the right of the title, giving the title more horizontal room before it needs to marquee-scroll.

## [0.7.0] - 2026-07-19

### Added

- Standard musical key (e.g. "F#m", "Cmaj") shown alongside Open Key and Camelot notation, e.g. "7d / F#maj / 2B".
- Deck cards show elapsed/total track position ("0:33 / 12:47") below the artist.

### Fixed

- Deck cards no longer tear down and rebuild their whole body (art/title/artist/EQ) on every mixer update (up to 10 Hz); this was causing visible lag between turning an EQ knob and the overlay reflecting it. Art/title/artist/EQ are now persistent nodes updated in place, and the marquee's layout measurement only re-runs when the track actually changes.
- BPM drops the decimal for a whole-number result (e.g. a synced deck landing on 140) instead of always showing one decimal place.

### Changed

- Track history now reads "Title (Mix) - Artist" instead of "Artist - Title", matching the deck-card title format.

## [0.6.0] - 2026-07-19

### Added

- Open Key notation alongside the Camelot key on hero and deck stats (e.g. "7d / 8A"). Traktor's `content.legacy_key` was already captured server-side but never rendered.
- Marquee-scroll for titles/artists that overflow their box: scrolls to reveal the rest, holds, and resets, instead of ellipsis-truncating. Pure CSS animation, no `<marquee>`.

### Changed

- Now-playing badges always read "ON AIR" and pulse; dropped the ON AIR (master) vs MIXING (other live decks) distinction, which didn't match a typical streaming workflow where anything shown is audible.
- EQ display moved out of the crowded deck-card header to sit beside the title/artist text, enlarged, and labeled H/M/L per band.

## [0.5.0] - 2026-07-19

### Added

- CI now runs typecheck, lint, test, and build on every push and PR (previously only a doc-sync/style check ran). New `npm run typecheck` script covers `src/`, `src-overlay/`, and `scripts/`.

### Fixed

- `ApiMixer.qml` had no keep-alive: unlike the deck/channel/master-clock emitters, an idle mixer never re-sent its state, so a server restarted mid-session never learned current EQ/level/crossfader values. It now force-resends every 10 s like the others.
- The QML mod could report an empty deck as "loaded": `is_loaded`/`is_loaded_signal` also fire on the initial property binding and on eject, not just on a real load, so a deck with nothing in it sent blank title/artist. The overlay then showed "Unknown title / Unknown artist" instead of "no track loaded". The mod now only reports an actual load.
- The static-file route's error handling and the WebSocket client-error/send paths silently discarded real errors. Failures are now logged; external behavior (status codes, payload shapes) is unchanged.

### Changed

- Overlay: pure rendering logic (master-deck selection, stats text, theme resolution, shared types) extracted into a new, unit-tested `overlay-logic.ts`. `localStorage` access is now guarded, falling back to the default theme instead of throwing when storage is unavailable (e.g. browser privacy modes); a missing overlay-root element now fails with a clear error instead of crashing deep in DOM code.
- `src/state/store.ts` and `src/state/history-file.ts` now share one `src/state/coerce.ts` module for value coercion instead of two near-duplicate implementations.
- The build script emits a source map for the overlay bundle and reports a clear error naming the missing file if a font source can't be copied, instead of a raw filesystem stack trace.

## [0.4.6] - 2026-07-18

### Fixed

- Overlay WebSocket handler no longer lets a malformed frame silently stall live updates: JSON.parse failures are caught, logged, and dropped. The catch wraps only the parse step, not rendering, so a genuine rendering bug still surfaces on its own instead of being mislabeled as a parse failure.

## [0.4.5] - 2026-07-18

### Changed

- Synced AGENTS.md with abuzucom/agents (upstream commit 1f44950, PR #5): added critical rule 10, "Verify state before assuming workflow intent". Propagated to all synced tool copies via `python scripts/sync.py`.

## [0.4.4] - 2026-07-18

### Removed

- Per-deck VU meter and the crossfader/master-VU strip; not useful in practice. EQ ticks, LOOP/KEY LOCK tags, and the key-compatibility dot are unaffected.

## [0.4.3] - 2026-07-18

### Changed

- Track history box is narrower (max-width 480px -> 400px), based on how it reads in the current stream layout.

## [0.4.1] - 2026-07-18

### Fixed

- `start-overlay.cmd` left an orphaned node.exe process running after the launcher window closed. npm's launch chain nests four processes deep (cmd -> node(npm) -> cmd -> node(server)), and Windows does not reliably propagate a window close that far. The launcher is now a PowerShell script (`start-overlay.ps1`, invoked by the unchanged `start-overlay.cmd` entry point) that starts node directly, two hops instead of four, and binds the server's lifetime to the window through three independent mechanisms: a try/finally around the wait (Ctrl+C, `exit`, normal completion), a PowerShell.Exiting engine event, and a Windows Job Object with kill-on-close for forceful kills.

## [0.4.0] - 2026-07-17

### Added

- Mixer telemetry: per-channel VU bars and EQ ticks on deck cards, crossfader strip with master VU and clip flag. New `/updateMixer` ingest route fed by ApiMixer.qml at 10 Hz (idle frames skipped).
- Loop and key lock state: LOOP and KEY LOCK tags on deck cards.
- Key display: live resulting key and BPM on now-playing slots; Camelot harmonic-compatibility dot on decks matching the on-air track.
- Simulator sends EQ, crossfader sweeps, and pseudo-level mixer frames.

Re-run `traktor-mod\install.ps1` to pick up the QML changes.

## [0.3.0] - 2026-07-17

### Added

- Adopt the abuzucom/agents instruction template: AGENTS.md (canonical, orientation filled for this repo, examples in TypeScript) with synced tool copies, scripts/sync.py, sync-check CI, .claudeignore, .editorconfig, .gitattributes.

### Changed

- .gitattributes normalizes line endings: LF in repository blobs, platform-native in working trees.

## [0.2.2] - 2026-07-17

### Changed

- Now-playing is a fixed 2x2 grid mirroring the deck layout (A B over C D). Slots keep their space when a deck is off air; content fades in place. The master deck shows ON AIR, other live decks show MIXING.

## [0.2.1] - 2026-07-17

### Fixed

- Simulator payloads are tagged; the server purges all simulated decks, history, and master clock the moment real Traktor data arrives, so demo tracks cannot linger into a live session.
- Starting while port 8080 is taken now prints a clear message and exits instead of crashing with a stack dump.
- Development (`npm run dev`, `npm run simulate`) moved to port 8090 so dev servers can never collide with or leak data into the production overlay on 8080.
- QML mod re-sends loaded deck state every 10 s, so a server started after tracks were loaded still shows them; the server treats identical re-sends as refreshes (no history duplicates). Re-run `traktor-mod\install.ps1` to pick this up.

## [0.2.0] - 2026-07-17

### Added

- Theme system: dark (default), paper, and grey grounds from the brand palette; on-page toggle persisted in localStorage; `?theme=` URL override including `transparent` for OBS compositing.
- Now-playing hero renders one row per on-air deck (master first, ON AIR badge; others tagged MIXING) so blends show both tracks.
- Deck cards and hero rows display the Traktor mix name as `Title (Mix)`.
- End-of-track warning: playing decks pulse gently when 60 seconds or less remain.

### Fixed

- Live BPM: deck stats now compute `base_bpm * tempo_for_display` instead of showing the raw tempo multiplier.
- History starts empty on launch; `--resume` reloads today's session file.

### Changed

- Deck grid is a fixed 2x2 (A B over C D) at every window width.
- Simulator sends realistic tempo multipliers, mix names, and elapsed-time ticks.

## [0.1.0] - 2026-07-16

### Added

- Initial project scaffold: TypeScript, Fastify ingest server, vitest, eslint.
- Traktor Pro 4 QML mod (adapted from [traktor-api-client](https://github.com/ErikMinekus/traktor-api-client), MIT) posting deck/channel/master-clock state to `http://localhost:8080`.
- Deck state store with on-air derivation and debounced track history.
- WebSocket broadcast and OBS browser-source overlay (4 decks, now-playing hero, history, cover art).
- Cover art extraction from track files with SHA-256-keyed disk cache.
- `start-overlay.cmd` one-click launcher; auto-shutdown when the last overlay client disconnects.
- Self-hosted brand fonts (@fontsource); the overlay makes no external requests.

### Security

- WebSocket endpoint rejects non-local web origins (WebSockets bypass CORS).
- Client-facing snapshots exclude local file paths.
- History files are validated on load.

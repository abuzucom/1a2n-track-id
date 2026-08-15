# Changelog

All notable changes to this project are documented here. Versioning follows [SemVer](https://semver.org/); versions below 1.0.0 are unstable initial development.

## [Unreleased]

### Changed

- CI now cancels superseded workflow runs on the same branch/PR instead of letting them finish, `sync-check.yml` only triggers on changes to the convention files it inspects, and the OS matrix in `ci.yml` is split: PRs run typecheck/lint/test/build on `ubuntu-latest` only, while pushes to `main` cover `windows-latest` and `macos-latest` (Linux is not re-run there since the merged PR already validated it). This cuts Actions minutes usage without dropping any check: every commit on `main` still gets all three OSes validated, just split across the PR and the merge instead of run three times per push.
- `ci.yml` now skips entirely (`paths-ignore`) for changes that touch only Markdown files, the AI assistant instruction files (`.cursorrules`, `.clinerules`, `.windsurfrules`, `.copilot-instructions`), or the vendored `traktor-mod/D2/Api/LICENSE`. Documentation-only changes no longer trigger a build/test run at all, since none of those files affect the TypeScript build or test suite.

## [0.11.0] - 2026-07-31

### Security

- Every route, including the `/ws` upgrade, now requires a `Host` header naming the loopback interface and answers `403 {"error":"forbidden host"}` otherwise. Binding to `127.0.0.1` keeps other machines out but is not an origin boundary for a browser: a page can point a name it controls at `127.0.0.1` (DNS rebinding) and reach this server as same-origin, which bypasses CORS and the existing `/ws` origin check alike, because by then the origin genuinely is the attacker's own name. That gave any page the DJ visited mid-set the ability to read `/state` and to POST deck payloads onto a live overlay. The QML mod posts to `localhost:8080` and OBS loads `127.0.0.1:8080`, so both are unaffected. The `/ws` check is applied separately because the upgrade is served off the raw http server and never reaches Fastify's hooks.
- The cover-art resolver now opens a file only when its extension is a known audio type and `stat()` reports a regular file. The path it receives arrives in a POST body, so it was chosen by whoever sent the payload rather than by Traktor, which made the parser a file-existence oracle for any path on disk and, for anything with parseable embedded art, a way to read those bytes back out through `/art/<id>`.
- `/art/<id>` no longer echoes a content type taken from the track file. The value comes from the file's own picture frame, so a crafted track could name an active type and have this server serve it from its own origin. Types are normalized and restricted to `image/jpeg`, `image/png`, `image/gif`, and `image/webp`; anything else is treated as no art at all.
- Added `X-Content-Type-Options: nosniff` to every response, and a Content-Security-Policy to the overlay page. The overlay was already self-contained (no external requests, no `innerHTML`), so the policy only writes that down.
- `/updateDeck/:deck` logged `isPlaying` straight from the unvalidated body, so a string containing newlines could forge log lines. It is coerced before logging now, matching what `/deckLoaded/:deck` already did for the title.

### Fixed

- The cover-art parse timeout now stops the parse instead of only stopping the wait. `music-metadata` takes no `AbortSignal`, so the read stream is owned here and destroyed when the timer fires; previously a `Promise.race` left the parse running against a file that might never end, and repeated attempts stacked up.
- The cover-art cache is bounded by total bytes (64 MiB by default) as well as entry count. 200 entries of multi-megabyte album art could pin hundreds of megabytes on a machine already running Traktor and OBS. A cover too large to ever fit is recorded as a miss rather than evicting the cache for room it will not get.
- History is written to a temp file and renamed over the target, so a crash mid-write leaves the previous session intact. A truncated file was silently discarded as unparseable on load, which is exactly the case `--resume` exists for. Overlapping saves are also serialized, and one failed save no longer rejects the saves queued behind it.
- A failed cover-art lookup can no longer take the server down mid-set. The resolver promise had no rejection handler, so a throw became an unhandled rejection and terminated the process.

### Changed

- `docs/state-api.md` now states that `trackKey` is not an anonymizer. It is an unsalted hash of a low-entropy path, and the same snapshot carries the artist and title that make up most of that path, so a `trackKey` confirms a guessed path (username included) by offline hashing. The derivation is unchanged: `docs/state-api.md` tells consumers to reproduce it, and salting would break that contract.

## [0.10.1] - 2026-07-27

### Fixed

- `track.musicalKey` was always `null` on live decks. It was the only field on the `deckLoaded` route coerced with the strict numeric helper, which rejects strings, while Traktor's QML sends `content.musical_key` as a string. Every other number on that route (`bpm`, `tempo`, `trackLength`, `elapsedTime`) already used the lenient helper for exactly this reason. Tests posted an integer, so they passed while real decks reported no key at all. Consumers fell back to `keyText`, which comes from `content.legacy_key` and is not dependably populated, leaving them with no key for the playing track.

## [0.10.0] - 2026-07-26

### Added

- `track.trackKey` and `HistoryEntrySnapshot.trackKey`: a stable opaque id for a local track, the first 16 hex characters of the SHA-256 of its absolute path. Lets an external consumer join a playing deck to its own library index without this server emitting a file path, which would leak the username. Empty for streamed tracks, which carry `streamingId` instead, so between the two every track has exactly one identifier.
- History entries now carry `genre`, `keyText`, `musicalKey`, `trackLength`, `tempo`, `streamingId`, and `trackKey`, matching what `TrackSnapshot` already exposed. A consumer can reason about what was played using the same joins it uses for what is playing. Previously history offered only `resultingKey`, which is not dependably Camelot-formatted, so the reliable key was available for the current track but not for the set.
- History entries now carry `deck` and `loadId`. With several decks layered, two entries seconds apart may be a layer or a swap, and there was previously no way to tell.

### Changed

- `CoverArtResolver.idFor` now delegates to the new `trackKeyFor`, so the art-cache id and the join key have one definition rather than two identical implementations that could drift.

History files written before this release load unchanged: fields they predate default to `''` or `null` rather than making the entry unloadable, so `--resume` still works across the upgrade. An unrecognized `deck` value in a file is rejected rather than trusted.

## [0.9.0] - 2026-07-26

### Added

- `mixer.channels[].onAirLevel`: the channel fader attenuated by crossfader position, so consumers can tell how much each deck actually contributes to the mix. The existing `level` is a pre-fader meter and reflects track loudness rather than mix contribution, so with several decks layered it cannot distinguish a deck riding at unity from one parked low. The QML mod has always computed and posted this value; the store simply discarded it.
- `track.musicalKey`: Traktor's analyzed key as a 0-23 integer, the same encoding as `<MUSICAL_KEY VALUE="n"/>` in `collection.nml`, so external consumers can join a playing deck to a library entry without parsing key strings.
- `track.streamingId`: an opaque id for a track played from a streaming source (e.g. `beatport://tracks/N`), empty for local files. Exactly one of `streamingId` and `filePath` identifies any given track.

### Fixed

- The QML mod no longer mangles streaming URIs into fake paths. `getFilePath()` expands macOS-style `Macintosh HD:Users:...` values by prefixing `/Volumes/` and replacing colons, which turned `beatport://tracks/N` into `/Volumes/beatport///tracks/N`. URIs are now reported as `streamingId` and `filePath` is left empty for them.
- `updateChannel` keep-alive now includes `onAirLevel`, so a server started mid-set converges on the real value instead of reading 0 for every channel until a fader moves.
- A repeated `deckLoaded` is no longer treated as a refresh when only the `streamingId` differs. Two streamed tracks sharing a title would previously have reused the load id, which history deduplicates on, so the second play went unrecorded.
- Corrected the note about the virtual Kontrol D2: it persists across ordinary Traktor restarts and only needs re-adding after `install.ps1` replaces the mapping, rather than every session.

## [0.8.0] - 2026-07-25

### Added

- `GET /state` and the `/ws` state message now include a `schemaVersion` field (currently `1`), so external consumers can distinguish "server unreachable" from "shape I don't recognize" instead of failing closed on both.
- `docs/state-api.md` documents the `/state` and `/ws` state-message contract for external consumers (e.g. chat bots polling this server), formalizing what was previously only implicit in `CLAUDE.md`'s public API surface list.

## [0.7.6] - 2026-07-23

### Fixed

- Cover-art extraction no longer parses arbitrarily large files or stalls on a slow parse: files over 50 MiB are skipped and any parse taking longer than 5s is abandoned, both treated the same as "no cover art" instead of tying up the resolver.

## [0.7.5] - 2026-07-23

### Changed

- README now documents the `/updateMixer` ingest route and the full ingest API table, lists BPM/key/track-position in the feature summary, and mentions `npm run test:watch`.

## [0.7.4] - 2026-07-22

### Removed

- KEY LOCK badge on deck cards.

## [0.7.3] - 2026-07-21

### Changed

- Cousine utility text (stats, track position, empty-deck label) now renders at weight 700 instead of 400 for better legibility over busy video backgrounds.

## [0.7.2] - 2026-07-19

### Fixed

- Camelot key never appeared in stats or the compatible-key highlight: Traktor's `track.key.resulting.precise` CSI property is not reliably Camelot-formatted, so `resultingKey` was frequently unparseable. Camelot is now derived from Open Key notation (which is reliable) whenever Open Key is recognized, falling back to `resultingKey` only when it isn't.
- Open Key and Camelot lookups now tolerate case and surrounding whitespace from the CSI payload instead of requiring an exact match, so a value like "1D" or " 1m " no longer silently fails to resolve a musical/Camelot key.

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

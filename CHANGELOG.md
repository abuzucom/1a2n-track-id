# Changelog

All notable changes to this project are documented here. Versioning follows [SemVer](https://semver.org/); versions below 1.0.0 are unstable initial development.

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

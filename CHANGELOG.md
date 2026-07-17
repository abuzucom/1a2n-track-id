# Changelog

All notable changes to this project are documented here. Versioning follows [SemVer](https://semver.org/); versions below 1.0.0 are unstable initial development.

## [0.1.0] - Unreleased

### Added

- Initial project scaffold: TypeScript, Fastify ingest server, vitest, eslint.
- Traktor Pro 4 QML mod (adapted from [traktor-api-client](https://github.com/ErikMinekus/traktor-api-client), MIT) posting deck/channel/master-clock state to `http://localhost:8080`.
- Deck state store with on-air derivation and debounced track history.
- WebSocket broadcast and OBS browser-source overlay (4 decks, now-playing hero, history, cover art).
- Cover art extraction from track files with SHA-256-keyed disk cache.
- `start-overlay.cmd` one-click launcher; auto-shutdown when the last overlay client disconnects.

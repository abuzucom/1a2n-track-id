# State API

`GET /state` and the WebSocket `/ws` state message both return the same
`ClientSnapshot` shape, defined in `src/state/store.ts`. This document is the
external contract for that shape, for tools outside this repo (e.g. chat
bots) that poll or subscribe to it.

Everything here is additive-only per this repo's public API compatibility
rule: existing fields keep their name, type, and meaning; new fields may be
added alongside them. `schemaVersion` bumps only on a breaking change.

## `GET /state`

Returns the current snapshot as JSON, `200 OK`, no auth (server binds to
`127.0.0.1` only).

```
GET http://127.0.0.1:8080/state
```

## WebSocket `/ws`

On connect, and on every subsequent change, the server sends:

```json
{ "type": "state", "state": <ClientSnapshot> }
```

## `ClientSnapshot`

```ts
interface ClientSnapshot {
  schemaVersion: number;
  decks: Record<'A' | 'B' | 'C' | 'D', DeckSnapshot>;
  history: HistoryEntrySnapshot[];
  masterClock: { deck: 'A' | 'B' | 'C' | 'D' | null; bpm: number | null };
  mixer: MixerState;
}
```

### `schemaVersion`

Integer, currently `1`. Bumped only when a field is renamed, removed, or
its meaning changes. Consumers should treat an unrecognized (higher)
version as "unknown shape, do not assume the fields below still apply" and
an absent field (pre-versioning responses) as version `0`.

### `DeckSnapshot`

```ts
interface DeckSnapshot {
  track: TrackSnapshot | null;
  isPlaying: boolean;
  isSynced: boolean;
  isLooping: boolean;
  isKeyLockOn: boolean;
  elapsedTime: number;   // seconds
  onAir: boolean;        // track loaded AND isPlaying AND channel routed on air
  loadId: number;        // increments each time a new track loads on this deck
}
```

`onAir` is the authoritative "is this deck audible in the mix right now"
signal. Consumers wanting "what's currently playing" should filter decks on
`onAir`, not re-derive it from `isPlaying` or mixer state.

### `TrackSnapshot`

```ts
interface TrackSnapshot {
  title: string;
  artist: string;
  album: string;
  genre: string;
  label: string;
  mix: string;
  remixer: string;
  comment: string;
  bpm: number | null;
  tempo: number | null;      // multiplier near 1.0; live BPM is bpm * tempo
  resultingKey: string;
  keyText: string;
  trackLength: number | null; // seconds
  artUrl?: string;             // e.g. /art/<id>, fetch relative to the server origin
}
```

Local file paths are never included in a `ClientSnapshot` (they are stripped
server-side before this shape is built).

### `HistoryEntrySnapshot`

```ts
interface HistoryEntrySnapshot {
  title: string;
  artist: string;
  album: string;
  label: string;
  mix: string;
  bpm: number | null;
  resultingKey: string;
  playedAt: string; // ISO 8601
}
```

An entry is added once a track has been on air continuously for a short
debounce window, so brief cues/previews are not logged.

### `MixerState`

```ts
interface MixerState {
  channels: { level: number; eq: { high: number; mid: number; low: number } }[]; // index 0-3 = channel 1-4
  xfader: number;   // 0 = full A side, 1 = full B side
  master: { left: number; right: number; sum: number; clip: boolean };
}
```

All levels are normalized `0..1`.

## Stability notes for consumers

- Treat unrecognized fields as informational; ignore them rather than
  failing (this repo may add fields without a `schemaVersion` bump).
- Treat a missing/unreachable server, and a `schemaVersion` you don't
  recognize, as the same "no data available" case; do not try to parse a
  shape you don't understand.
- This server auto-exits shortly after its last WebSocket/overlay client
  disconnects. A plain `GET /state` poll does not count as a client and
  will not keep the server alive, nor will it be blocked by that shutdown
  timer while the process is up.

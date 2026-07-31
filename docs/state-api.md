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

Requests whose `Host` header does not name the loopback interface
(`127.0.0.1`, `localhost`, or `[::1]`, with or without a port) are refused
with `403 {"error":"forbidden host"}`. This applies to every route,
including the `/ws` upgrade. Binding to `127.0.0.1` keeps other machines
out, but it does not stop a web page from pointing a name it controls at
`127.0.0.1` and reaching this server as same-origin; the `Host` header is
what still distinguishes the two. A consumer running on the same machine
and addressing the server as `127.0.0.1` or `localhost` needs no change.

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
  musicalKey: number | null;  // 0-23: 0-11 major C..B, 12-23 minor
  trackLength: number | null; // seconds
  streamingId: string;        // e.g. "beatport://tracks/N"; '' for local files
  trackKey: string;           // opaque id derived from the local file; '' when streamed
  artUrl?: string;             // e.g. /art/<id>, fetch relative to the server origin
}
```

`musicalKey` is Traktor's analyzed key as an integer and uses the same
encoding as `<MUSICAL_KEY VALUE="n"/>` in `collection.nml`, so consumers can
join the two without parsing key strings. `keyText` (Open Key) remains the
reliable string form; `resultingKey` is not dependably Camelot-formatted.

`streamingId` identifies a track played from a streaming source, where there
is no local file. It is empty for local files, and `filePath` is empty for
streamed tracks, so exactly one of the two identifies any given track.

`trackKey` is a stable opaque id for a local track, the first 16 hex
characters of the SHA-256 of its absolute path. It exists so a consumer can
join a playing deck to its own library index without this server ever
emitting a file path. Hash a local path the same way to match. It is `''`
for streamed tracks, which carry `streamingId` instead, so between the two
every track has exactly one identifier.

> **`trackKey` is not an anonymizer.** It is an unsalted hash of a
> low-entropy, highly structured string, and the same snapshot publishes the
> artist and title that make up most of that string. Anyone holding a
> `trackKey` can confirm a guessed path, including the username in it, by
> hashing candidates offline. Treat it as an identifier, not as a way to
> withhold the path. Salting it would fix that but would also break the
> "hash a local path the same way to match" contract above, so it is left
> as-is and documented rather than changed silently.

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
  playedAt: string;           // ISO 8601
  genre: string;
  keyText: string;
  musicalKey: number | null;
  trackLength: number | null;
  tempo: number | null;       // multiplier at commit time
  streamingId: string;
  trackKey: string;
  deck: 'A' | 'B' | 'C' | 'D' | null;
  loadId: number | null;
}
```

History entries carry the same identity and key fields as `TrackSnapshot`, so
a consumer can reason about what was played with the same joins it uses for
what is playing.

`deck` and `loadId` record which deck aired the entry and its load id at the
time. With several decks layered, two entries seconds apart may be a layer or
a swap, and these distinguish the two. Both are `null` only for entries
loaded from a history file written before 0.10.0.

An entry is added once a track has been on air continuously for a short
debounce window, so brief cues/previews are not logged.

### `MixerState`

```ts
interface MixerState {
  channels: {
    level: number;       // PRE-fader meter: track loudness, not mix contribution
    eq: { high: number; mid: number; low: number };
    onAirLevel: number;  // POST-fader: contribution to the mix
  }[]; // index 0-3 = channel 1-4
  xfader: number;   // 0 = full A side, 1 = full B side
  master: { left: number; right: number; sum: number; clip: boolean };
}
```

All levels are normalized `0..1`.

`level` and `onAirLevel` answer different questions and are easy to confuse.
`level` is a pre-fader meter, so it reflects how loud the track itself is and
barely moves when the channel fader does. `onAirLevel` is the channel fader
attenuated by crossfader position, so it is the one to use when weighting how
much each deck contributes to what the audience hears. With several decks
layered, `level` cannot distinguish a deck riding at unity from one parked
low; `onAirLevel` can.

Note `onAir` remains a boolean derived from volume and crossfader assignment
only. It does not account for EQ, so a deck with every band cut still reports
`onAir: true`. Consumers wanting audibility should weigh `onAirLevel` and
`eq` themselves.

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

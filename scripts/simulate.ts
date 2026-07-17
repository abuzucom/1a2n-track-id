// Posts fake Traktor deck payloads so the overlay can be developed without Traktor.
const BASE = process.env.TRACK_ID_URL ?? 'http://127.0.0.1:8080';

const post = (path: string, body: unknown) =>
  fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// tempo is Traktor's tempo_for_display, a multiplier around 1.0.
const tracks = [
  { deck: 'A', ch: 1, title: 'Midnight Circuit', artist: 'Neon Vector', mix: '', bpm: 128, tempo: 1.0, resultingKey: '8A', trackLength: 75 },
  { deck: 'B', ch: 2, title: 'Glasshouse', artist: 'Aria Flux', mix: 'Extended Mix', bpm: 126, tempo: 1.016, resultingKey: '9A', trackLength: 360 },
  { deck: 'C', ch: 3, title: 'Deep End Theory', artist: 'Subsonic Youth', mix: 'Dub', bpm: 130, tempo: 0.985, resultingKey: '5A', trackLength: 360 },
  { deck: 'D', ch: 4, title: 'Afterimage', artist: 'Karst', mix: '', bpm: 132, tempo: 1.0, resultingKey: '11B', trackLength: 360 },
];

console.log(`simulating decks against ${BASE} ...`);
for (const t of tracks) {
  await post(`deckLoaded/${t.deck}`, {
    title: t.title,
    artist: t.artist,
    mix: t.mix,
    album: 'Simulated LP',
    bpm: t.bpm,
    tempo: t.tempo,
    resultingKey: t.resultingKey,
    trackLength: t.trackLength,
    elapsedTime: 0,
    isPlaying: false,
  });
}

// Deck A goes on air. Its short trackLength brings it into the
// end-of-track window mid-simulation so the ending pulse is visible.
await post('updateDeck/A', { isPlaying: true });
await post('updateChannel/1', { isOnAir: true });
await post('updateMasterClock', { deck: 'A', bpm: 128 });
console.log('deck A on air; B mixes in after 15s ...');
for (let elapsed = 1; elapsed <= 15; elapsed++) {
  await sleep(1000);
  await post('updateDeck/A', { elapsedTime: elapsed });
}

// Mix into B.
await post('updateDeck/B', { isPlaying: true });
await post('updateChannel/2', { isOnAir: true });
await sleep(8_000);
await post('updateChannel/1', { isOnAir: false });
await post('updateDeck/A', { isPlaying: false });
await post('updateMasterClock', { deck: 'B', bpm: 126 });
console.log('deck B now on air. Done; leave clients running to inspect.');

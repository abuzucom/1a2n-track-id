// Posts fake Traktor deck payloads so the overlay can be developed without Traktor.
const BASE = process.env.TRACK_ID_URL ?? 'http://127.0.0.1:8080';

const post = (path: string, body: unknown) =>
  fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tracks = [
  { deck: 'A', ch: 1, title: 'Midnight Circuit', artist: 'Neon Vector', bpm: 128, resultingKey: '8A' },
  { deck: 'B', ch: 2, title: 'Glasshouse (Extended Mix)', artist: 'Aria Flux', bpm: 126, resultingKey: '9A' },
  { deck: 'C', ch: 3, title: 'Deep End Theory', artist: 'Subsonic Youth', bpm: 130, resultingKey: '5A' },
  { deck: 'D', ch: 4, title: 'Afterimage', artist: 'Karst', bpm: 132, resultingKey: '11B' },
];

console.log(`simulating decks against ${BASE} ...`);
for (const t of tracks) {
  await post(`deckLoaded/${t.deck}`, {
    title: t.title,
    artist: t.artist,
    album: 'Simulated LP',
    bpm: t.bpm,
    tempo: t.bpm,
    resultingKey: t.resultingKey,
    trackLength: 360,
    elapsedTime: 0,
    isPlaying: false,
  });
}

// Deck A goes on air.
await post('updateDeck/A', { isPlaying: true });
await post('updateChannel/1', { isOnAir: true });
await post('updateMasterClock', { deck: 'A', bpm: 128 });
console.log('deck A on air; B mixes in after 15s ...');
await sleep(15_000);

// Mix into B.
await post('updateDeck/B', { isPlaying: true });
await post('updateChannel/2', { isOnAir: true });
await sleep(8_000);
await post('updateChannel/1', { isOnAir: false });
await post('updateDeck/A', { isPlaying: false });
await post('updateMasterClock', { deck: 'B', bpm: 126 });
console.log('deck B now on air. done — leave running clients to inspect.');

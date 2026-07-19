// Posts fake Traktor deck payloads so the overlay can be developed without
// Traktor. Targets the dev port; never point this at the production server.
const BASE = process.env.TRACK_ID_URL ?? 'http://127.0.0.1:8090';

// x-simulated marks this data so the server purges it when real data arrives.
const post = (path: string, body: unknown) =>
  fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-simulated': '1' },
    body: JSON.stringify(body),
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// tempo is Traktor's tempo_for_display, a multiplier around 1.0.
const tracks = [
  { deck: 'A', ch: 1, title: 'Midnight Circuit', artist: 'Neon Vector', mix: '', bpm: 128, tempo: 1.0, resultingKey: '8A', trackLength: 75 },
  // Deliberately long title/artist below exercise the overlay's marquee scroll.
  { deck: 'B', ch: 2, title: 'Glasshouse (A Very Long Continuous Overflowing Radio Rework)', artist: 'Aria Flux', mix: 'Extended Mix', bpm: 126, tempo: 1.016, resultingKey: '9A', trackLength: 360 },
  { deck: 'C', ch: 3, title: 'Deep End Theory', artist: 'Subsonic Youth And The Marquee Overflow Testing Collective', mix: 'Dub', bpm: 130, tempo: 0.985, resultingKey: '5A', trackLength: 360 },
  { deck: 'D', ch: 4, title: 'Afterimage', artist: 'Karst', mix: '', bpm: 132, tempo: 1.0, resultingKey: '11B', trackLength: 360 },
];

// 10 Hz mixer frames with pseudo-levels for on-air channels.
const liveChannels = new Set<number>();
let xfader = 0.1;
let mixerTick = 0;
const mixerLoop = setInterval(() => {
  mixerTick++;
  const level = (ch: number) =>
    liveChannels.has(ch) ? 0.45 + 0.4 * Math.abs(Math.sin(mixerTick / 3 + ch)) : 0;
  const sum = Math.min(1, [1, 2, 3, 4].map(level).reduce((a, b) => a + b, 0));
  void post('updateMixer', {
    channels: [1, 2, 3, 4].map((ch) => ({ level: level(ch) })),
    xfader,
    master: { left: sum * 0.9, right: sum * 0.95, sum, clip: sum > 0.98 },
  }).catch(() => undefined);
}, 100);

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
await post('updateDeck/A', { isPlaying: true, isLooping: true, isKeyLockOn: true });
await post('updateChannel/1', { isOnAir: true, eq: { high: 0.7, mid: 0.5, low: 0.3 } });
await post('updateMasterClock', { deck: 'A', bpm: 128 });
liveChannels.add(1);
console.log('deck A on air; B mixes in after 15s ...');
for (let elapsed = 1; elapsed <= 15; elapsed++) {
  await sleep(1000);
  await post('updateDeck/A', { elapsedTime: elapsed });
}

// Mix into B with a crossfader sweep.
await post('updateDeck/B', { isPlaying: true });
await post('updateChannel/2', { isOnAir: true, eq: { high: 0.5, mid: 0.6, low: 0.8 } });
liveChannels.add(2);
for (let step = 1; step <= 8; step++) {
  xfader = 0.1 + (0.8 * step) / 8;
  await sleep(1000);
}
await post('updateChannel/1', { isOnAir: false });
await post('updateDeck/A', { isPlaying: false });
liveChannels.delete(1);
await post('updateMasterClock', { deck: 'B', bpm: 126 });
console.log('deck B now on air. Meters keep running; Ctrl+C to stop.');
await sleep(30_000);
clearInterval(mixerLoop);
console.log('simulation done.');

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TrackerStore, type DeckId } from './store.js';

const load = (store: TrackerStore, deck: DeckId, title: string, artist = 'Artist') =>
  store.deckLoaded(deck, {
    title,
    artist,
    album: 'Album',
    genre: 'Techno',
    filePath: `C:\\Music\\${title}.mp3`,
    bpm: 128,
    resultingKey: '8A',
    trackLength: 300,
    elapsedTime: 0,
    isPlaying: false,
  });

describe('TrackerStore', () => {
  let store: TrackerStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new TrackerStore({ historyDebounceMs: 5000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with four empty decks', () => {
    const snap = store.snapshot();
    expect(Object.keys(snap.decks)).toEqual(['A', 'B', 'C', 'D']);
    expect(snap.decks.A.track).toBeNull();
    expect(snap.history).toEqual([]);
  });

  it('normalizes deckLoaded payloads and ignores junk fields', () => {
    store.deckLoaded('B', {
      title: 'Song',
      artist: 'DJ',
      bpm: '133.5',
      evil: '<script>',
    } as Record<string, unknown>);
    const deck = store.snapshot().decks.B;
    expect(deck.track?.title).toBe('Song');
    expect(deck.track?.artist).toBe('DJ');
    expect(deck.track?.bpm).toBe(133.5);
    expect(deck.track && 'evil' in deck.track).toBe(false);
  });

  it('rejects invalid deck ids and channel indexes', () => {
    expect(() => store.deckLoaded('E' as DeckId, {})).toThrow();
    expect(() => store.updateChannel(5, { isOnAir: true })).toThrow();
  });

  it('derives onAir from channel state + playing', () => {
    load(store, 'A', 'Track1');
    store.updateChannel(1, { isOnAir: true });
    expect(store.snapshot().decks.A.onAir).toBe(false); // not playing yet

    store.updateDeck('A', { isPlaying: true });
    expect(store.snapshot().decks.A.onAir).toBe(true);

    store.updateChannel(1, { isOnAir: false });
    expect(store.snapshot().decks.A.onAir).toBe(false);
  });

  it('adds a track to history only after staying on air past the debounce', () => {
    load(store, 'A', 'Keeper');
    store.updateChannel(1, { isOnAir: true });
    store.updateDeck('A', { isPlaying: true });

    expect(store.snapshot().history).toHaveLength(0);
    vi.advanceTimersByTime(4999);
    expect(store.snapshot().history).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(store.snapshot().history).toHaveLength(1);
    expect(store.snapshot().history[0]?.title).toBe('Keeper');
  });

  it('does not add a track cut off before the debounce elapses', () => {
    load(store, 'B', 'QuickCut');
    store.updateChannel(2, { isOnAir: true });
    store.updateDeck('B', { isPlaying: true });
    vi.advanceTimersByTime(2000);
    store.updateDeck('B', { isPlaying: false });
    vi.advanceTimersByTime(10000);
    expect(store.snapshot().history).toHaveLength(0);
  });

  it('does not duplicate a track that dips off air and comes back', () => {
    load(store, 'A', 'Anthem');
    store.updateChannel(1, { isOnAir: true });
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);
    store.updateChannel(1, { isOnAir: false });
    store.updateChannel(1, { isOnAir: true });
    vi.advanceTimersByTime(5000);
    expect(store.snapshot().history).toHaveLength(1);
  });

  it('treats a re-sent identical deckLoaded as a refresh, not a new load', () => {
    load(store, 'A', 'KeepAlive');
    const firstLoadId = store.snapshot().decks.A.loadId;
    store.updateChannel(1, { isOnAir: true });
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);
    expect(store.snapshot().history).toHaveLength(1);

    // QML keep-alive re-sends the same track every 10s.
    load(store, 'A', 'KeepAlive');
    expect(store.snapshot().decks.A.loadId).toBe(firstLoadId);
    vi.advanceTimersByTime(20_000);
    expect(store.snapshot().history).toHaveLength(1);
  });

  it('keep-alive refresh does not clobber playing state or art', () => {
    load(store, 'B', 'Refresh');
    store.updateDeck('B', { isPlaying: true });
    store.setDeckArt('B', '/art/abc');
    load(store, 'B', 'Refresh');
    const deck = store.snapshot().decks.B;
    expect(deck.isPlaying).toBe(true);
    expect(deck.track?.artUrl).toBe('/art/abc');
  });

  it('records a repeat play when the deck held another track in between', () => {
    load(store, 'A', 'Anthem');
    store.updateChannel(1, { isOnAir: true });
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);

    load(store, 'A', 'Interlude'); // deck A moves on...
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);

    load(store, 'A', 'Anthem'); // ...then Anthem comes back
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);

    expect(store.snapshot().history.map((h) => h.title)).toEqual(['Anthem', 'Interlude', 'Anthem']);
  });

  it('normalizes and clamps mixer frames', () => {
    store.updateMixer({
      channels: [{ level: 0.4 }, { level: 1.7 }, { level: -0.2 }, { level: 'x' }],
      xfader: 0.25,
      master: { left: 0.5, right: 2, sum: 0.6, clip: true },
    });
    const mixer = store.snapshot().mixer;
    expect(mixer.channels.map((c) => c.level)).toEqual([0.4, 1, 0, 0]);
    expect(mixer.xfader).toBe(0.25);
    expect(mixer.master).toEqual({ left: 0.5, right: 1, sum: 0.6, clip: true });
  });

  it('stores eq values per channel via updateChannel', () => {
    store.updateChannel(2, { eq: { high: 0.7, mid: 0.5, low: 1.9 } });
    expect(store.snapshot().mixer.channels[1]?.eq).toEqual({ high: 0.7, mid: 0.5, low: 1 });
  });

  it('passes isLooping and isKeyLockOn through updateDeck', () => {
    load(store, 'A', 'Loopy');
    store.updateDeck('A', { isLooping: true, isKeyLockOn: true });
    const deck = store.snapshot().decks.A;
    expect(deck.isLooping).toBe(true);
    expect(deck.isKeyLockOn).toBe(true);
  });

  it('mixer frames do not disturb decks, history, or on-air state', () => {
    load(store, 'A', 'Steady');
    store.updateChannel(1, { isOnAir: true });
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);
    const before = store.snapshot();
    store.updateMixer({ channels: [{ level: 0.9 }], xfader: 0.5, master: { sum: 0.9 } });
    vi.advanceTimersByTime(60_000);
    const after = store.snapshot();
    expect(after.decks).toEqual(before.decks);
    expect(after.history).toEqual(before.history);
  });

  it('emits change events with a snapshot', () => {
    const seen: string[] = [];
    store.on('change', (snap) => seen.push(snap.decks.C.track?.title ?? ''));
    load(store, 'C', 'Evented');
    expect(seen.at(-1)).toBe('Evented');
  });

  it('sets deck art url without clobbering on reload', () => {
    load(store, 'A', 'Arty');
    store.setDeckArt('A', '/art/abc123');
    expect(store.snapshot().decks.A.track?.artUrl).toBe('/art/abc123');

    load(store, 'A', 'NextTrack'); // reload clears artUrl
    expect(store.snapshot().decks.A.track?.artUrl).toBeUndefined();
  });

  it('tracks master clock', () => {
    store.updateMasterClock({ deck: 'B', bpm: 140.2 });
    expect(store.snapshot().masterClock).toEqual({ deck: 'B', bpm: 140.2 });
  });
});

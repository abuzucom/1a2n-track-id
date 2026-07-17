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

  it('records history for the same title reloaded later (new play)', () => {
    load(store, 'A', 'Anthem');
    store.updateChannel(1, { isOnAir: true });
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);

    load(store, 'B', 'Other');
    store.updateChannel(2, { isOnAir: true });
    store.updateDeck('B', { isPlaying: true });
    vi.advanceTimersByTime(5000);

    load(store, 'A', 'Anthem'); // reloaded, played again
    store.updateDeck('A', { isPlaying: true });
    vi.advanceTimersByTime(5000);

    expect(store.snapshot().history.map((h) => h.title)).toEqual(['Anthem', 'Other', 'Anthem']);
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

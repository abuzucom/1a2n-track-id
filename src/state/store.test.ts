import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TrackerStore, type DeckId } from './store.js';
import { trackKeyFor } from './track-key.js';

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

  it('stores onAirLevel per channel, clamped, defaulting to 0', () => {
    expect(store.snapshot().mixer.channels[0]?.onAirLevel).toBe(0);
    store.updateChannel(1, { onAirLevel: 0.75 });
    store.updateChannel(2, { onAirLevel: 1.4 });
    store.updateChannel(3, { onAirLevel: -0.2 });
    store.updateChannel(4, { onAirLevel: 'x' });
    expect(store.snapshot().mixer.channels.map((c) => c.onAirLevel)).toEqual([0.75, 1, 0, 0]);
  });

  it('leaves onAirLevel alone when a payload omits it', () => {
    store.updateChannel(1, { onAirLevel: 0.6 });
    store.updateChannel(1, { eq: { high: 0.5, mid: 0.5, low: 0.5 } });
    expect(store.snapshot().mixer.channels[0]?.onAirLevel).toBe(0.6);
  });

  it('records the full track identity and metadata in history', () => {
    store.deckLoaded('C', {
      title: 'Fable (Message Version)',
      artist: 'Robert Miles',
      album: 'Album',
      genre: 'Trance (Main Floor)',
      label: 'Label',
      mix: 'Extended Mix',
      filePath: 'K:\\Music\\fable.flac',
      bpm: 138,
      tempo: 1.014,
      keyText: '5m',
      key: 13,
      resultingKey: '8A',
      trackLength: 430,
      isPlaying: true,
    });
    store.updateChannel(3, { isOnAir: true });
    vi.advanceTimersByTime(10_000);

    const entry = store.snapshot().history[0];
    expect(entry).toBeDefined();
    expect(entry?.genre).toBe('Trance (Main Floor)');
    expect(entry?.keyText).toBe('5m');
    expect(entry?.musicalKey).toBe(13);
    expect(entry?.trackLength).toBe(430);
    expect(entry?.tempo).toBe(1.014);
    expect(entry?.deck).toBe('C');
    expect(entry?.loadId).toBe(1);
    expect(entry?.trackKey).toBe(trackKeyFor('K:\\Music\\fable.flac'));
    expect(entry?.streamingId).toBe('');
  });

  it('records streamingId in history for a streamed play', () => {
    store.deckLoaded('A', {
      title: 'Our Moon feat. Lovlee',
      streamingId: 'beatport://tracks/15344478',
      filePath: '',
      isPlaying: true,
    });
    store.updateChannel(1, { isOnAir: true });
    vi.advanceTimersByTime(10_000);

    const entry = store.snapshot().history[0];
    expect(entry?.streamingId).toBe('beatport://tracks/15344478');
    expect(entry?.trackKey).toBe('');
  });

  it('exposes trackKey on a deck track but never the file path', () => {
    store.deckLoaded('A', { title: 'Local', filePath: 'K:\\Music\\x.flac' });
    const snap = store.snapshot();
    expect(snap.decks.A.track?.trackKey).toBe(trackKeyFor('K:\\Music\\x.flac'));
  });

  it('captures the numeric musical key from deckLoaded', () => {
    store.deckLoaded('A', { title: 'Keyed', key: 13, keyText: '5m' });
    expect(store.snapshot().decks.A.track?.musicalKey).toBe(13);
  });

  it('accepts a numeric-string musical key, as live Traktor sends it', () => {
    store.deckLoaded('A', { title: 'Keyed', key: '13', keyText: '' });
    expect(store.snapshot().decks.A.track?.musicalKey).toBe(13);
  });

  it('leaves musicalKey null when absent or not a number', () => {
    store.deckLoaded('A', { title: 'No key' });
    expect(store.snapshot().decks.A.track?.musicalKey).toBeNull();
    store.deckLoaded('B', { title: 'Bad key', key: 'thirteen' });
    expect(store.snapshot().decks.B.track?.musicalKey).toBeNull();
  });

  it('captures streamingId for a streamed deck and leaves filePath empty', () => {
    store.deckLoaded('A', {
      title: 'Our Moon feat. Lovlee',
      streamingId: 'beatport://tracks/15344478',
      filePath: '',
    });
    const track = store.snapshot().decks.A.track;
    expect(track?.streamingId).toBe('beatport://tracks/15344478');
    expect(track?.filePath).toBe('');
  });

  it('distinguishes two streamed tracks that share a title', () => {
    store.deckLoaded('A', { title: 'Untitled', streamingId: 'beatport://tracks/1' });
    store.deckLoaded('A', { title: 'Untitled', streamingId: 'beatport://tracks/2' });
    // Not a refresh: a different streamingId is a different track, so the
    // load id must advance or history would dedupe two distinct plays.
    expect(store.snapshot().decks.A.track?.streamingId).toBe('beatport://tracks/2');
    expect(store.snapshot().decks.A.loadId).toBe(2);
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

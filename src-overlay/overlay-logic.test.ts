import { describe, expect, it } from 'vitest';
import { masterOnAirDeckId, resolveTheme, statsText, type Deck, type Snapshot, type Track } from './overlay-logic.js';

function track(over: Partial<Track> = {}): Track {
  return {
    title: 'Title',
    artist: 'Artist',
    mix: '',
    bpm: null,
    tempo: null,
    resultingKey: '',
    trackLength: null,
    ...over,
  };
}

function deck(over: Partial<Deck> = {}): Deck {
  return {
    track: null,
    isPlaying: false,
    isLooping: false,
    isKeyLockOn: false,
    onAir: false,
    elapsedTime: 0,
    ...over,
  };
}

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    decks: { A: deck(), B: deck(), C: deck(), D: deck() },
    history: [],
    masterClock: { deck: null, bpm: null },
    mixer: { channels: [] },
    ...over,
  };
}

describe('masterOnAirDeckId', () => {
  it('picks the master-clock deck when it is live', () => {
    const snap = snapshot({
      decks: {
        A: deck({ onAir: true, isPlaying: true, track: track() }),
        B: deck({ onAir: true, isPlaying: true, track: track() }),
        C: deck(),
        D: deck(),
      },
      masterClock: { deck: 'B', bpm: 128 },
    });
    expect(masterOnAirDeckId(snap)).toBe('B');
  });

  it('falls back to the first live deck when the master deck is not live', () => {
    const snap = snapshot({
      decks: {
        A: deck(),
        B: deck({ onAir: true, isPlaying: true, track: track() }),
        C: deck(),
        D: deck(),
      },
      masterClock: { deck: 'A', bpm: 128 },
    });
    expect(masterOnAirDeckId(snap)).toBe('B');
  });

  it('returns null when no deck is live', () => {
    expect(masterOnAirDeckId(snapshot())).toBeNull();
  });

  it('requires onAir, isPlaying, and a loaded track to count as live', () => {
    const snap = snapshot({
      decks: {
        A: deck({ onAir: true, isPlaying: false, track: track() }),
        B: deck({ onAir: false, isPlaying: true, track: track() }),
        C: deck({ onAir: true, isPlaying: true, track: null }),
        D: deck(),
      },
    });
    expect(masterOnAirDeckId(snap)).toBeNull();
  });
});

describe('statsText', () => {
  it('joins bpm and key with a separator', () => {
    expect(statsText(track({ bpm: 128, tempo: 1, resultingKey: '8A' }))).toBe('128.0 BPM | 8A');
  });

  it('omits missing parts without a stray separator', () => {
    expect(statsText(track({ bpm: null, resultingKey: '8A' }))).toBe('8A');
    expect(statsText(track({ bpm: 128, tempo: 1, resultingKey: '' }))).toBe('128.0 BPM');
    expect(statsText(track())).toBe('');
  });
});

describe('resolveTheme', () => {
  it('prefers the url theme when valid', () => {
    expect(resolveTheme('paper', 'grey')).toBe('paper');
  });

  it('falls back to the saved theme when the url theme is invalid or absent', () => {
    expect(resolveTheme(null, 'grey')).toBe('grey');
    expect(resolveTheme('bogus', 'grey')).toBe('grey');
  });

  it('falls back to dark when neither is valid', () => {
    expect(resolveTheme(null, null)).toBe('dark');
    expect(resolveTheme('bogus', 'also-bogus')).toBe('dark');
  });

  it('accepts the transparent theme', () => {
    expect(resolveTheme('transparent', null)).toBe('transparent');
  });
});

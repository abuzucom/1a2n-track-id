import { describe, expect, it } from 'vitest';
import {
  keyLabel,
  masterOnAirDeckId,
  resolveTheme,
  resolvedCamelotKey,
  statsText,
  type Deck,
  type Snapshot,
  type Track,
} from './overlay-logic.js';

function track(over: Partial<Track> = {}): Track {
  return {
    title: 'Title',
    artist: 'Artist',
    mix: '',
    bpm: null,
    tempo: null,
    resultingKey: '',
    keyText: '',
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

describe('keyLabel', () => {
  it('uses resulting key before translating it', () => {
    expect(keyLabel(track({ keyText: '1d', resultingKey: '8B' }))).toBe('8B / Cmaj');
  });

  it('derives the musical key from camelot when open key is missing', () => {
    expect(keyLabel(track({ keyText: '', resultingKey: '8A' }))).toBe('8A / Am');
  });

  it('omits the musical key when neither open key nor camelot is recognized', () => {
    expect(keyLabel(track({ keyText: 'bogus', resultingKey: '' }))).toBe('bogus');
  });

  it('is empty when neither key is present', () => {
    expect(keyLabel(track())).toBe('');
  });

  it('uses an unparseable resultingKey without falling back to keyText', () => {
    expect(keyLabel(track({ keyText: '1d', resultingKey: '0.67' }))).toBe('0.67');
  });

  it('translates a resulting Traktor Open Key when keyText is missing', () => {
    expect(keyLabel(track({ resultingKey: '11m' }))).toBe('11m / Gm / 6A');
  });

  it('uses resultingKey instead of keyText when both are present', () => {
    expect(keyLabel(track({ keyText: '10m', resultingKey: '11m' }))).toBe('11m / Gm / 6A');
  });

  it('does not fall back to keyText when resultingKey is unknown', () => {
    expect(keyLabel(track({ keyText: '11m', resultingKey: '0.67' }))).toBe('0.67');
  });
});

describe('resolvedCamelotKey', () => {
  it('derives Camelot from Open Key when recognized', () => {
    expect(resolvedCamelotKey(track({ keyText: '1d', resultingKey: '' }))).toBe('8B');
  });

  it('uses an unparseable resultingKey without falling back to keyText', () => {
    expect(resolvedCamelotKey(track({ keyText: '4m', resultingKey: '0.67' }))).toBe('0.67');
  });

  it('falls back to resultingKey when Open Key is missing or unrecognized', () => {
    expect(resolvedCamelotKey(track({ keyText: '', resultingKey: '8A' }))).toBe('8A');
    expect(resolvedCamelotKey(track({ keyText: 'bogus', resultingKey: '8A' }))).toBe('8A');
  });

  it('is empty when neither is usable', () => {
    expect(resolvedCamelotKey(track())).toBe('');
  });
});

describe('statsText', () => {
  it('joins bpm and key with a separator', () => {
    expect(statsText(track({ bpm: 128, tempo: 1, keyText: '1d', resultingKey: '8B' }))).toBe(
      '128 BPM | 8B / Cmaj',
    );
  });

  it('omits missing parts without a stray separator', () => {
    expect(statsText(track({ bpm: null, resultingKey: '8A' }))).toBe('8A / Am');
    expect(statsText(track({ bpm: 128, tempo: 1, resultingKey: '' }))).toBe('128 BPM');
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

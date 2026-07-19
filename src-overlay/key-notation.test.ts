import { describe, expect, it } from 'vitest';
import { musicalKeyLabel } from './key-notation.js';

describe('musicalKeyLabel', () => {
  it('resolves major and minor keys from Open Key notation', () => {
    expect(musicalKeyLabel('1d', '')).toBe('Cmaj');
    expect(musicalKeyLabel('1m', '')).toBe('Am');
    expect(musicalKeyLabel('4m', '')).toBe('F#m');
  });

  it('falls back to Camelot notation when Open Key is missing or unrecognized', () => {
    expect(musicalKeyLabel('', '8B')).toBe('Cmaj');
    expect(musicalKeyLabel('', '8A')).toBe('Am');
    expect(musicalKeyLabel('bogus', '11A')).toBe('F#m');
  });

  it('prefers Open Key over Camelot when both are given', () => {
    expect(musicalKeyLabel('1d', '9A')).toBe('Cmaj');
  });

  it('returns empty when neither is recognized', () => {
    expect(musicalKeyLabel('', '')).toBe('');
    expect(musicalKeyLabel('bogus', 'nope')).toBe('');
  });

  it('covers every entry on the wheel consistently between Open Key and Camelot', () => {
    const pairs: [string, string, string][] = [
      ['1d', '8B', 'Cmaj'],
      ['1m', '8A', 'Am'],
      ['2d', '9B', 'Gmaj'],
      ['2m', '9A', 'Em'],
      ['3d', '10B', 'Dmaj'],
      ['3m', '10A', 'Bm'],
      ['4d', '11B', 'Amaj'],
      ['4m', '11A', 'F#m'],
      ['5d', '12B', 'Emaj'],
      ['5m', '12A', 'C#m'],
      ['6d', '1B', 'Bmaj'],
      ['6m', '1A', 'G#m'],
      ['7d', '2B', 'F#maj'],
      ['7m', '2A', 'D#m'],
      ['8d', '3B', 'C#maj'],
      ['8m', '3A', 'A#m'],
      ['9d', '4B', 'G#maj'],
      ['9m', '4A', 'Fm'],
      ['10d', '5B', 'D#maj'],
      ['10m', '5A', 'Cm'],
      ['11d', '6B', 'A#maj'],
      ['11m', '6A', 'Gm'],
      ['12d', '7B', 'Fmaj'],
      ['12m', '7A', 'Dm'],
    ];
    for (const [openKey, camelot, musical] of pairs) {
      expect(musicalKeyLabel(openKey, '')).toBe(musical);
      expect(musicalKeyLabel('', camelot)).toBe(musical);
    }
  });
});

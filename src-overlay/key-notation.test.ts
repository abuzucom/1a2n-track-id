import { describe, expect, it } from 'vitest';
import { camelotKeyLabel, musicalKeyLabel } from './key-notation.js';

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

  it('tolerates case and surrounding whitespace from the CSI payload', () => {
    expect(musicalKeyLabel('1D', '')).toBe('Cmaj');
    expect(musicalKeyLabel(' 1m ', '')).toBe('Am');
    expect(musicalKeyLabel('', '8a')).toBe('Am');
    expect(musicalKeyLabel('', ' 8B ')).toBe('Cmaj');
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

describe('camelotKeyLabel', () => {
  it('derives the Camelot key from Open Key notation', () => {
    expect(camelotKeyLabel('1d')).toBe('8B');
    expect(camelotKeyLabel('1m')).toBe('8A');
    expect(camelotKeyLabel('4m')).toBe('11A');
  });

  it('returns empty for missing or unrecognized Open Key values', () => {
    expect(camelotKeyLabel('')).toBe('');
    expect(camelotKeyLabel('bogus')).toBe('');
  });

  it('tolerates case and surrounding whitespace from the CSI payload', () => {
    expect(camelotKeyLabel('1D')).toBe('8B');
    expect(camelotKeyLabel(' 1m ')).toBe('8A');
  });

  it('covers every entry on the wheel', () => {
    const pairs: [string, string][] = [
      ['1d', '8B'],
      ['1m', '8A'],
      ['2d', '9B'],
      ['2m', '9A'],
      ['3d', '10B'],
      ['3m', '10A'],
      ['4d', '11B'],
      ['4m', '11A'],
      ['5d', '12B'],
      ['5m', '12A'],
      ['6d', '1B'],
      ['6m', '1A'],
      ['7d', '2B'],
      ['7m', '2A'],
      ['8d', '3B'],
      ['8m', '3A'],
      ['9d', '4B'],
      ['9m', '4A'],
      ['10d', '5B'],
      ['10m', '5A'],
      ['11d', '6B'],
      ['11m', '6A'],
      ['12d', '7B'],
      ['12m', '7A'],
    ];
    for (const [openKey, camelot] of pairs) {
      expect(camelotKeyLabel(openKey)).toBe(camelot);
    }
  });
});

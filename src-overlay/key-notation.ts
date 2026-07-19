// Open Key <-> standard musical key <-> Camelot lookup. All three notations
// name the same 24 positions on the harmonic-mixing wheel; this table lets
// the overlay show whichever a viewer already knows.
//
// Source table's "5m" row was given as D# minor at Camelot 12A, but that
// duplicates 7m's D# minor (Camelot 2A) and contradicts 5d's relative
// major (E major, whose true relative minor is C# minor). Corrected here
// to C# minor / C#m, consistent with 12A on the standard Camelot wheel.
const OPEN_KEY_TO_MUSICAL: Readonly<Record<string, string>> = {
  '1d': 'Cmaj',
  '1m': 'Am',
  '2d': 'Gmaj',
  '2m': 'Em',
  '3d': 'Dmaj',
  '3m': 'Bm',
  '4d': 'Amaj',
  '4m': 'F#m',
  '5d': 'Emaj',
  '5m': 'C#m',
  '6d': 'Bmaj',
  '6m': 'G#m',
  '7d': 'F#maj',
  '7m': 'D#m',
  '8d': 'C#maj',
  '8m': 'A#m',
  '9d': 'G#maj',
  '9m': 'Fm',
  '10d': 'D#maj',
  '10m': 'Cm',
  '11d': 'A#maj',
  '11m': 'Gm',
  '12d': 'Fmaj',
  '12m': 'Dm',
};

const CAMELOT_TO_MUSICAL: Readonly<Record<string, string>> = {
  '8B': 'Cmaj',
  '8A': 'Am',
  '9B': 'Gmaj',
  '9A': 'Em',
  '10B': 'Dmaj',
  '10A': 'Bm',
  '11B': 'Amaj',
  '11A': 'F#m',
  '12B': 'Emaj',
  '12A': 'C#m',
  '1B': 'Bmaj',
  '1A': 'G#m',
  '2B': 'F#maj',
  '2A': 'D#m',
  '3B': 'C#maj',
  '3A': 'A#m',
  '4B': 'G#maj',
  '4A': 'Fm',
  '5B': 'D#maj',
  '5A': 'Cm',
  '6B': 'A#maj',
  '6A': 'Gm',
  '7B': 'Fmaj',
  '7A': 'Dm',
};

/**
 * Shortened standard musical key (e.g. "F#m", "Cmaj") for an Open Key
 * and/or Camelot value. Tries Open Key first, falls back to Camelot;
 * returns '' when neither is recognized.
 */
export function musicalKeyLabel(openKey: string, camelot: string): string {
  return OPEN_KEY_TO_MUSICAL[openKey] ?? CAMELOT_TO_MUSICAL[camelot] ?? '';
}

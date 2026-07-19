// Pure data/display logic for the overlay, kept free of DOM access so it can
// be unit-tested directly (overlay.ts owns all rendering and browser APIs).
import { formatDeckBpm } from './format.js';
import { musicalKeyLabel } from './key-notation.js';

export type DeckId = 'A' | 'B' | 'C' | 'D';
export const DECKS: readonly DeckId[] = ['A', 'B', 'C', 'D'];

export const THEMES = ['dark', 'paper', 'grey'] as const;
export type Theme = (typeof THEMES)[number] | 'transparent';

export const EQ_BANDS = ['high', 'mid', 'low'] as const;
export type EqBand = (typeof EQ_BANDS)[number];

export interface Track {
  title: string;
  artist: string;
  mix: string;
  bpm: number | null;
  tempo: number | null;
  resultingKey: string;
  /** Traktor's Open Key notation (content.legacy_key), e.g. "7d". */
  keyText: string;
  trackLength: number | null;
  artUrl?: string;
}

export interface Deck {
  track: Track | null;
  isPlaying: boolean;
  isLooping: boolean;
  isKeyLockOn: boolean;
  onAir: boolean;
  elapsedTime: number;
}

export interface Mixer {
  channels: { eq: Record<EqBand, number> }[];
}

export interface HistoryEntry {
  title: string;
  artist: string;
  mix: string;
}

export interface Snapshot {
  decks: Record<DeckId, Deck>;
  history: HistoryEntry[];
  masterClock: { deck: DeckId | null; bpm: number | null };
  mixer: Mixer;
}

/** Id of the master on-air deck, falling back to the first live deck. */
export function masterOnAirDeckId(snap: Snapshot): DeckId | null {
  const isLive = (id: DeckId) => {
    const deck = snap.decks[id];
    return deck.onAir && deck.isPlaying && deck.track !== null;
  };
  const master = snap.masterClock.deck;
  if (master !== null && isLive(master)) return master;
  return DECKS.find(isLive) ?? null;
}

/** Open Key, standard musical key, and Camelot key together, e.g.
 * "7d / F#maj / 2B". Omits whichever parts aren't available. */
export function keyLabel(track: Track): string {
  const parts: string[] = [];
  if (track.keyText) parts.push(track.keyText);
  const musical = musicalKeyLabel(track.keyText, track.resultingKey);
  if (musical) parts.push(musical);
  if (track.resultingKey) parts.push(track.resultingKey);
  return parts.join(' / ');
}

/** BPM and key summary line for a track, e.g. "128.0 BPM | 7d / 8A". */
export function statsText(track: Track): string {
  const parts: string[] = [];
  const bpm = formatDeckBpm(track.bpm, track.tempo);
  if (bpm) parts.push(bpm);
  const key = keyLabel(track);
  if (key) parts.push(key);
  return parts.join(' | ');
}

const VALID_THEMES: readonly string[] = [...THEMES, 'transparent'];

/** Active theme: the URL param wins, then the saved value, else 'dark'. */
export function resolveTheme(urlTheme: string | null, saved: string | null): Theme {
  if (urlTheme !== null && VALID_THEMES.includes(urlTheme)) return urlTheme as Theme;
  if (saved !== null && VALID_THEMES.includes(saved)) return saved as Theme;
  return 'dark';
}

// Pure display formatters shared by the overlay renderer.

const MIN_TEMPO_MULTIPLIER = 0.5;
const MAX_TEMPO_MULTIPLIER = 2.0;
export const END_WARNING_SECONDS = 60;

/**
 * Live BPM string. Traktor sends bpm as tempo.base_bpm and tempo as the
 * tempo_for_display multiplier (about 1.0); live BPM is their product.
 * Out-of-range tempo values are ignored rather than trusted. Whole-number
 * results (e.g. a synced deck landing exactly on 140) drop the decimal;
 * a genuinely fractional BPM still shows one decimal place.
 */
export function formatDeckBpm(bpm: number | null, tempo: number | null): string {
  if (bpm === null) return '';
  const multiplier =
    tempo !== null && tempo >= MIN_TEMPO_MULTIPLIER && tempo <= MAX_TEMPO_MULTIPLIER ? tempo : 1;
  const rounded = Math.round(bpm * multiplier * 10) / 10;
  const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${text} BPM`;
}

/** Title with the Traktor mix name appended, unless already part of the title. */
export function formatTitle(title: string, mix: string): string {
  if (!title) return 'Unknown title';
  if (!mix || title.toLowerCase().includes(mix.toLowerCase())) return title;
  return `${title} (${mix})`;
}

/** Clamp to the unit range; non-numbers become 0. */
export function clamp01(v: number | null | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Map an EQ knob value (0..1, 0.5 center) to -100..100 percent from center. */
export function eqOffsetPercent(value: number): number {
  return Math.round((clamp01(value) - 0.5) * 200);
}

const CAMELOT = /^([1-9]|1[0-2])([AB])$/;
const CAMELOT_POSITIONS = 12;

/**
 * True when two Camelot keys mix harmonically: same key, a wheel neighbor
 * (wrapping 12 to 1), or the relative key (same number, A/B swapped).
 * Unparseable keys return false; never guess.
 */
export function camelotCompatible(a: string, b: string): boolean {
  const ma = CAMELOT.exec(a);
  const mb = CAMELOT.exec(b);
  if (!ma || !mb || !ma[1] || !mb[1]) return false;
  const na = Number(ma[1]);
  const nb = Number(mb[1]);
  if (ma[2] === mb[2]) {
    const dist = Math.abs(na - nb);
    return dist === 0 || dist === 1 || dist === CAMELOT_POSITIONS - 1;
  }
  return na === nb;
}

function formatMinutesSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Elapsed / total track position, e.g. "0:33 / 12:47". Empty without a
 * known track length. */
export function formatTrackPosition(elapsedTime: number, trackLength: number | null): string {
  if (trackLength === null) return '';
  return `${formatMinutesSeconds(elapsedTime)} / ${formatMinutesSeconds(trackLength)}`;
}

interface EndingDeck {
  isPlaying: boolean;
  elapsedTime: number;
  track: { trackLength: number | null } | null;
}

/** True while a playing deck is within the end-of-track warning window. */
export function isEnding(deck: EndingDeck): boolean {
  if (!deck.isPlaying || !deck.track || deck.track.trackLength === null) return false;
  return deck.track.trackLength - deck.elapsedTime <= END_WARNING_SECONDS;
}

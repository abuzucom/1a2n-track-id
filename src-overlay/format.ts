// Pure display formatters shared by the overlay renderer.

const MIN_TEMPO_MULTIPLIER = 0.5;
const MAX_TEMPO_MULTIPLIER = 2.0;
export const END_WARNING_SECONDS = 60;

/**
 * Live BPM string. Traktor sends bpm as tempo.base_bpm and tempo as the
 * tempo_for_display multiplier (about 1.0); live BPM is their product.
 * Out-of-range tempo values are ignored rather than trusted.
 */
export function formatDeckBpm(bpm: number | null, tempo: number | null): string {
  if (bpm === null) return '';
  const multiplier =
    tempo !== null && tempo >= MIN_TEMPO_MULTIPLIER && tempo <= MAX_TEMPO_MULTIPLIER ? tempo : 1;
  return `${(bpm * multiplier).toFixed(1)} BPM`;
}

/** Title with the Traktor mix name appended, unless already part of the title. */
export function formatTitle(title: string, mix: string): string {
  if (!title) return 'Unknown title';
  if (!mix || title.toLowerCase().includes(mix.toLowerCase())) return title;
  return `${title} (${mix})`;
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

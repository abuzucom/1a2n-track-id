import { describe, expect, it } from 'vitest';
import {
  camelotCompatible,
  clamp01,
  eqOffsetPercent,
  formatDeckBpm,
  formatTitle,
  formatTrackPosition,
  isEnding,
} from './format.js';

describe('formatDeckBpm', () => {
  it('applies the tempo multiplier to the base bpm', () => {
    expect(formatDeckBpm(174, 1.02)).toBe('177.5 BPM');
  });

  it('uses base bpm alone when tempo is null', () => {
    expect(formatDeckBpm(128, null)).toBe('128 BPM');
  });

  it('ignores tempo values outside the sane multiplier range', () => {
    expect(formatDeckBpm(128, 128)).toBe('128 BPM');
    expect(formatDeckBpm(128, 0.1)).toBe('128 BPM');
    expect(formatDeckBpm(128, -1)).toBe('128 BPM');
  });

  it('returns empty string without a base bpm', () => {
    expect(formatDeckBpm(null, 1.0)).toBe('');
  });

  it('drops the decimal for a whole-number result, e.g. a synced deck', () => {
    expect(formatDeckBpm(140, 1.0)).toBe('140 BPM');
    expect(formatDeckBpm(120, 1.0)).toBe('120 BPM');
  });

  it('keeps one decimal for a genuinely fractional bpm', () => {
    expect(formatDeckBpm(128.4, 1.0)).toBe('128.4 BPM');
  });

  it('drops a decimal that only appears from floating-point noise', () => {
    // 126 * (128 / 126) lands a hair off 128 in floating point.
    expect(formatDeckBpm(126, 128 / 126)).toBe('128 BPM');
  });
});

describe('formatTitle', () => {
  it('appends the mix in parentheses', () => {
    expect(formatTitle('Glasshouse', 'Extended Mix')).toBe('Glasshouse (Extended Mix)');
  });

  it('returns the bare title when mix is empty', () => {
    expect(formatTitle('Glasshouse', '')).toBe('Glasshouse');
  });

  it('does not duplicate a mix already present in the title', () => {
    expect(formatTitle('Glasshouse (Extended Mix)', 'Extended Mix')).toBe('Glasshouse (Extended Mix)');
  });

  it('falls back for missing titles', () => {
    expect(formatTitle('', '')).toBe('Unknown title');
  });
});

describe('formatTrackPosition', () => {
  it('formats elapsed and total as minutes:seconds', () => {
    expect(formatTrackPosition(33, 767)).toBe('0:33 / 12:47');
  });

  it('pads seconds under 10', () => {
    expect(formatTrackPosition(65, 125)).toBe('1:05 / 2:05');
  });

  it('is empty without a known track length', () => {
    expect(formatTrackPosition(33, null)).toBe('');
  });

  it('clamps negative elapsed time to zero', () => {
    expect(formatTrackPosition(-5, 60)).toBe('0:00 / 1:00');
  });
});

describe('clamp01 and eqOffsetPercent', () => {
  it('clamps to the unit range', () => {
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(null)).toBe(0);
  });

  it('maps eq 0..1 to -100..100 percent from center', () => {
    expect(eqOffsetPercent(0.5)).toBe(0);
    expect(eqOffsetPercent(1)).toBe(100);
    expect(eqOffsetPercent(0)).toBe(-100);
    expect(eqOffsetPercent(0.75)).toBe(50);
  });
});

describe('camelotCompatible', () => {
  it('accepts same key, wheel neighbors, and relative', () => {
    expect(camelotCompatible('8A', '8A')).toBe(true);
    expect(camelotCompatible('8A', '9A')).toBe(true);
    expect(camelotCompatible('8A', '7A')).toBe(true);
    expect(camelotCompatible('8A', '8B')).toBe(true);
  });

  it('wraps the wheel between 12 and 1', () => {
    expect(camelotCompatible('12A', '1A')).toBe(true);
    expect(camelotCompatible('1B', '12B')).toBe(true);
  });

  it('rejects incompatible and cross-letter neighbors', () => {
    expect(camelotCompatible('8A', '5A')).toBe(false);
    expect(camelotCompatible('8A', '9B')).toBe(false);
  });

  it('rejects malformed or missing keys without guessing', () => {
    expect(camelotCompatible('', '8A')).toBe(false);
    expect(camelotCompatible('Am', '8A')).toBe(false);
    expect(camelotCompatible('13A', '1A')).toBe(false);
    expect(camelotCompatible('0A', '1A')).toBe(false);
  });
});

describe('isEnding', () => {
  const deck = (over: Partial<Parameters<typeof isEnding>[0]>) => ({
    isPlaying: true,
    elapsedTime: 300,
    track: { trackLength: 350 },
    ...over,
  });

  it('true when playing with 60s or less remaining', () => {
    expect(isEnding(deck({ elapsedTime: 290 }))).toBe(true);
    expect(isEnding(deck({ elapsedTime: 349 }))).toBe(true);
  });

  it('false with more than 60s remaining', () => {
    expect(isEnding(deck({ elapsedTime: 200 }))).toBe(false);
  });

  it('false when stopped, empty, or lacking a length', () => {
    expect(isEnding(deck({ isPlaying: false }))).toBe(false);
    expect(isEnding(deck({ track: null }))).toBe(false);
    expect(isEnding(deck({ track: { trackLength: null } }))).toBe(false);
  });
});

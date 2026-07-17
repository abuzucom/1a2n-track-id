import { describe, expect, it } from 'vitest';
import { formatDeckBpm, formatTitle, isEnding } from './format.js';

describe('formatDeckBpm', () => {
  it('applies the tempo multiplier to the base bpm', () => {
    expect(formatDeckBpm(174, 1.02)).toBe('177.5 BPM');
  });

  it('uses base bpm alone when tempo is null', () => {
    expect(formatDeckBpm(128, null)).toBe('128.0 BPM');
  });

  it('ignores tempo values outside the sane multiplier range', () => {
    expect(formatDeckBpm(128, 128)).toBe('128.0 BPM');
    expect(formatDeckBpm(128, 0.1)).toBe('128.0 BPM');
    expect(formatDeckBpm(128, -1)).toBe('128.0 BPM');
  });

  it('returns empty string without a base bpm', () => {
    expect(formatDeckBpm(null, 1.0)).toBe('');
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

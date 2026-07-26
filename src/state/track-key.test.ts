import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { trackKeyFor } from './track-key.js';

describe('trackKeyFor', () => {
  it('is a truncated sha256 of the path', () => {
    const path = 'K:\\Wares-Tank-Rip\\RIPS\\02 - Fable (Message version).flac';
    const expected = createHash('sha256').update(path).digest('hex').slice(0, 16);
    expect(trackKeyFor(path)).toBe(expected);
    expect(trackKeyFor(path)).toHaveLength(16);
  });

  it('is stable across calls and distinct across paths', () => {
    expect(trackKeyFor('a')).toBe(trackKeyFor('a'));
    expect(trackKeyFor('a')).not.toBe(trackKeyFor('b'));
  });

  it("returns '' for an empty path rather than hashing the empty string", () => {
    // Streamed decks have no file, so '' must mean "no key", not a key that
    // every pathless track would collide on.
    expect(trackKeyFor('')).toBe('');
  });
});

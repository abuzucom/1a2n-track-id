import { describe, expect, it } from 'vitest';
import { isSyncOffShown, type Deck } from './overlay-logic.js';

function buildDeck(isSynced: boolean): Deck {
  return {
    track: null,
    isPlaying: false,
    isLooping: false,
    isKeyLockOn: false,
    isSynced,
    onAir: false,
    elapsedTime: 0,
  };
}

describe('isSyncOffShown', () => {
  it('shows the SYNC OFF badge when the deck reports sync disengaged', () => {
    expect(isSyncOffShown(buildDeck(false))).toBe(true);
  });

  it('hides the SYNC OFF badge when the deck reports sync engaged', () => {
    expect(isSyncOffShown(buildDeck(true))).toBe(false);
  });
});

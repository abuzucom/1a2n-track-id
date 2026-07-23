import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Simulate a parse that never settles, to exercise the resolver's timeout guard.
vi.mock('music-metadata', () => ({
  parseFile: () => new Promise(() => undefined),
  selectCover: () => null,
}));

import { CoverArtResolver } from './resolver.js';

describe('CoverArtResolver parse timeout', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'covers-timeout-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('resolves to null if parsing exceeds the configured timeout', async () => {
    const file = join(dir, 'track.mp3');
    await writeFile(file, Buffer.from('irrelevant'));
    const resolver = new CoverArtResolver(200, { parseTimeoutMs: 20 });
    expect(await resolver.resolve(file)).toBeNull();
  });
});

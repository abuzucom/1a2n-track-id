import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoverArtResolver } from './resolver.js';
import { PNG_1X1 as PNG, mp3WithCover, mp3WithoutCover } from './test-fixtures.js';

describe('CoverArtResolver', () => {
  let dir: string;
  let resolver: CoverArtResolver;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'covers-'));
    resolver = new CoverArtResolver();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('extracts embedded art and serves it by stable id', async () => {
    const file = join(dir, 'track.mp3');
    await writeFile(file, mp3WithCover());

    const id = resolver.idFor(file);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(resolver.idFor(file)).toBe(id); // stable

    const art = await resolver.resolve(file);
    expect(art).not.toBeNull();
    expect(art?.mime).toBe('image/png');
    expect(Buffer.compare(art!.data, PNG)).toBe(0);

    // now retrievable synchronously by id
    const got = resolver.get(id);
    expect(got?.mime).toBe('image/png');
  });

  it('returns null for files without embedded art', async () => {
    const file = join(dir, 'noart.mp3');
    await writeFile(file, mp3WithoutCover());
    expect(await resolver.resolve(file)).toBeNull();
  });

  it('returns null for missing files and unknown ids', async () => {
    expect(await resolver.resolve(join(dir, 'ghost.mp3'))).toBeNull();
    expect(resolver.get('deadbeefdeadbeef')).toBeNull();
  });

  it('caches: second resolve of same file does not re-read from disk', async () => {
    const file = join(dir, 'track.mp3');
    await writeFile(file, mp3WithCover());
    await resolver.resolve(file);
    await rm(file); // file gone; cache must still serve
    const art = await resolver.resolve(file);
    expect(art?.mime).toBe('image/png');
  });
});

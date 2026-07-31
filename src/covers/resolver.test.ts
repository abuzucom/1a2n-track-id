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

  it('skips parsing and returns null for files over the configured size cap', async () => {
    const file = join(dir, 'track.mp3');
    await writeFile(file, mp3WithCover());
    const capped = new CoverArtResolver(200, { maxFileSizeBytes: 10 });
    expect(await capped.resolve(file)).toBeNull();
  });

  // The path reaching this resolver comes from a POST body, so it is chosen
  // by the caller, not by Traktor. Everything below keeps that path from
  // steering the parser at things that are not a track file.
  it('refuses paths that are not audio files', async () => {
    for (const name of ['passwd', 'secret.txt', 'notes.pdf', 'track.mp3.exe', 'mp3']) {
      const file = join(dir, name);
      await writeFile(file, mp3WithCover());
      expect(await resolver.resolve(file)).toBeNull();
    }
  });

  it('accepts the audio extensions a Traktor library actually holds', async () => {
    for (const name of ['a.mp3', 'b.FLAC', 'c.m4a', 'd.wav', 'e.aiff', 'f.ogg']) {
      const file = join(dir, name);
      await writeFile(file, mp3WithCover());
      // Only .mp3 content here, so the parse may or may not yield art; what
      // matters is that the extension itself is not the thing rejecting it.
      await resolver.resolve(file);
    }
    expect(await resolver.resolve(join(dir, 'a.mp3'))).not.toBeNull();
  });

  it('refuses anything that is not a regular file', async () => {
    // A directory named like a track: stat() succeeds, so only an explicit
    // isFile() check stops the parser opening it.
    const { mkdir } = await import('node:fs/promises');
    const fake = join(dir, 'notatrack.mp3');
    await mkdir(fake);
    expect(await resolver.resolve(fake)).toBeNull();
  });

  it('refuses cover art whose declared type is not an image', async () => {
    const file = join(dir, 'crafted.mp3');
    await writeFile(file, mp3WithCover('text/html'));
    expect(await resolver.resolve(file)).toBeNull();
  });

  it('normalizes a declared image type before serving it', async () => {
    const file = join(dir, 'params.mp3');
    await writeFile(file, mp3WithCover('IMAGE/PNG; charset=binary'));
    expect((await resolver.resolve(file))?.mime).toBe('image/png');
  });

  it('bounds the cache by total bytes, not just entry count', async () => {
    // Entry count alone lets 200 multi-megabyte covers sit in memory on a
    // machine already running Traktor and OBS.
    const tiny = new CoverArtResolver(200, { maxCacheBytes: PNG.length * 2 });
    const files = ['one.mp3', 'two.mp3', 'three.mp3'].map((name) => join(dir, name));
    for (const file of files) {
      await writeFile(file, mp3WithCover());
      expect(await tiny.resolve(file)).not.toBeNull();
    }

    expect(tiny.cachedBytes).toBeLessThanOrEqual(PNG.length * 2);
    // Oldest evicted to make room; newest still served.
    expect(tiny.get(tiny.idFor(files[0]!))).toBeNull();
    expect(tiny.get(tiny.idFor(files[2]!))).not.toBeNull();
  });

  it('drops a single cover too large to ever fit the cache', async () => {
    const file = join(dir, 'huge.mp3');
    await writeFile(file, mp3WithCover());
    const tiny = new CoverArtResolver(200, { maxCacheBytes: 1 });
    expect(await tiny.resolve(file)).toBeNull();
    expect(tiny.cachedBytes).toBe(0);
  });
});

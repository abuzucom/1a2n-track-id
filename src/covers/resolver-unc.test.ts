import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Stat = typeof import('node:fs/promises').stat;
const statCalls: string[] = [];

// Records which paths reach stat(). On Windows, stat() of a UNC path makes the
// OS authenticate to the remote host, so the guard must act before this call.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    stat: ((...args: Parameters<Stat>) => {
      statCalls.push(String(args[0]));
      return actual.stat(...args);
    }) as Stat,
  };
});

const { CoverArtResolver } = await import('./resolver.js');

const REMOTE_PATHS = [
  '\\\\attacker.example\\share\\track.mp3',
  '//attacker.example/share/track.mp3',
  '\\\\?\\UNC\\attacker.example\\share\\track.mp3',
  '\\\\.\\pipe\\track.mp3',
  '\\/attacker.example/share/track.mp3',
];

describe('CoverArtResolver remote path guard', () => {
  let dir: string;

  beforeEach(async () => {
    statCalls.length = 0;
    dir = await mkdtemp(join(tmpdir(), 'covers-unc-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it.each(REMOTE_PATHS)('refuses %s without touching the filesystem', async (remotePath) => {
    const resolver = new CoverArtResolver();
    expect(await resolver.resolve(remotePath)).toBeNull();
    expect(statCalls).toEqual([]);
  });

  it('still inspects an ordinary local track', async () => {
    const file = join(dir, 'track.mp3');
    await writeFile(file, Buffer.from('not really audio'));
    const resolver = new CoverArtResolver();
    await resolver.resolve(file);
    expect(statCalls).toEqual([file]);
  });
});

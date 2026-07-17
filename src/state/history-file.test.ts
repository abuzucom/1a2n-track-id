import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HistoryFile } from './history-file.js';
import type { HistoryEntry } from './store.js';

const entry = (title: string): HistoryEntry => ({
  title,
  artist: 'A',
  album: '',
  label: '',
  filePath: '',
  bpm: null,
  resultingKey: '',
  playedAt: new Date().toISOString(),
});

describe('HistoryFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'trackid-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves and reloads history entries', async () => {
    const file = join(dir, 'session.json');
    const hf = new HistoryFile(file);
    await hf.save([entry('One'), entry('Two')]);
    const loaded = await new HistoryFile(file).load();
    expect(loaded.map((e) => e.title)).toEqual(['One', 'Two']);
  });

  it('returns empty history for a missing file', async () => {
    const hf = new HistoryFile(join(dir, 'nope.json'));
    expect(await hf.load()).toEqual([]);
  });

  it('drops malformed entries and coerces fields on load', async () => {
    const file = join(dir, 'mixed.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      file,
      JSON.stringify([
        entry('Good'),
        'not an object',
        42,
        null,
        { title: 123, artist: { nested: true }, bpm: 'NaN?', playedAt: 5 },
      ]),
      'utf8',
    );
    const loaded = await new HistoryFile(file).load();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.title).toBe('Good');
    expect(loaded[1]?.title).toBe('');
    expect(loaded[1]?.artist).toBe('');
    expect(loaded[1]?.bpm).toBeNull();
    expect(loaded[1]?.playedAt).toBe('');
  });

  it('returns empty history for a corrupt file', async () => {
    const file = join(dir, 'bad.json');
    const hf = new HistoryFile(file);
    await hf.save([entry('One')]);
    const raw = await readFile(file, 'utf8');
    expect(raw).toContain('One');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, '{not json', 'utf8');
    expect(await hf.load()).toEqual([]);
  });
});

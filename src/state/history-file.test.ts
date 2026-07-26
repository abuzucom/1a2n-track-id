import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  mix: '',
  filePath: '',
  bpm: null,
  resultingKey: '',
  playedAt: new Date().toISOString(),
  genre: '',
  keyText: '',
  musicalKey: null,
  trackLength: null,
  tempo: null,
  streamingId: '',
  trackKey: '',
  deck: null,
  loadId: null,
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

  it('loads a pre-0.10.0 file, defaulting the fields it predates', async () => {
    // Written by 0.9.0 or earlier: no genre, keyText, musicalKey, tempo,
    // trackLength, streamingId, trackKey, deck, or loadId. --resume must
    // still load these rather than discarding the session.
    const file = join(dir, 'legacy.json');
    await writeFile(
      file,
      JSON.stringify([
        {
          title: 'Old Entry',
          artist: 'A',
          album: '',
          label: '',
          mix: '',
          filePath: 'K:\\Music\\old.flac',
          bpm: 128,
          resultingKey: '8A',
          playedAt: '2026-07-01T00:00:00.000Z',
        },
      ]),
      'utf8',
    );
    const loaded = await new HistoryFile(file).load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe('Old Entry');
    expect(loaded[0]?.bpm).toBe(128);
    expect(loaded[0]?.genre).toBe('');
    expect(loaded[0]?.musicalKey).toBeNull();
    expect(loaded[0]?.deck).toBeNull();
    expect(loaded[0]?.loadId).toBeNull();
  });

  it('rejects an unrecognized deck id rather than trusting the file', async () => {
    const file = join(dir, 'baddeck.json');
    await writeFile(
      file,
      JSON.stringify([{ ...entry('X'), deck: 'Z' }]),
      'utf8',
    );
    const loaded = await new HistoryFile(file).load();
    expect(loaded[0]?.deck).toBeNull();
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

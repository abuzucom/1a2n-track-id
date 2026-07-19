import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { numStrict, str } from './coerce.js';
import type { HistoryEntry } from './store.js';

/** Coerce one persisted entry to a valid shape; the file is not trusted input. */
function sanitizeEntry(v: unknown): HistoryEntry | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  return {
    title: str(raw.title),
    artist: str(raw.artist),
    album: str(raw.album),
    label: str(raw.label),
    mix: str(raw.mix),
    filePath: str(raw.filePath),
    bpm: numStrict(raw.bpm),
    resultingKey: str(raw.resultingKey),
    playedAt: str(raw.playedAt),
  };
}

/** Persists the session's track history as a JSON file. */
export class HistoryFile {
  constructor(private readonly filePath: string) {}

  async load(): Promise<HistoryEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeEntry).filter((e): e is HistoryEntry => e !== null);
    } catch {
      return [];
    }
  }

  async save(entries: HistoryEntry[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf8');
  }
}

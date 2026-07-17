import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HistoryEntry } from './store.js';

/** Persists the session's track history as a JSON file. */
export class HistoryFile {
  constructor(private readonly filePath: string) {}

  async load(): Promise<HistoryEntry[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  }

  async save(entries: HistoryEntry[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf8');
  }
}

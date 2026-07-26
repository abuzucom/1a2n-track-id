import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { numStrict, str } from './coerce.js';
import { isDeckId, type DeckId, type HistoryEntry } from './store.js';

/** Deck ids from a pre-0.10.0 file are absent; anything unrecognized is null. */
function deckOrNull(v: unknown): DeckId | null {
  const raw = str(v);
  return isDeckId(raw) ? raw : null;
}

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
    // Added in 0.10.0. Files written by earlier versions lack these, so they
    // default rather than making the entry unloadable.
    genre: str(raw.genre),
    keyText: str(raw.keyText),
    musicalKey: numStrict(raw.musicalKey),
    trackLength: numStrict(raw.trackLength),
    tempo: numStrict(raw.tempo),
    streamingId: str(raw.streamingId),
    trackKey: str(raw.trackKey),
    deck: deckOrNull(raw.deck),
    loadId: numStrict(raw.loadId),
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

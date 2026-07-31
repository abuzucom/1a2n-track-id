import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
  /**
   * Saves run one at a time. The server fires save() on every history change
   * without awaiting it, and two overlapping writes would otherwise race for
   * the same temp path and interleave.
   */
  private writeChain: Promise<unknown> = Promise.resolve();

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

  save(entries: HistoryEntry[]): Promise<void> {
    // settled(), not the chain itself: one failed save must not reject every
    // save queued behind it.
    const settled = this.writeChain.catch(() => undefined);
    const run = settled.then(() => this.writeAtomically(entries));
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  /**
   * Write to a temp file, then rename over the target. rename() is atomic
   * within a directory, so a crash mid-write leaves the previous session
   * intact instead of a truncated file that --resume would silently discard
   * as unparseable, which is the case --resume exists for.
   */
  private async writeAtomically(entries: HistoryEntry[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(entries, null, 2), 'utf8');
      await rename(tempPath, this.filePath);
    } catch (err) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}

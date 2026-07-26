import { stat } from 'node:fs/promises';
import { parseFile, selectCover } from 'music-metadata';
import { trackKeyFor } from '../state/track-key.js';

export interface CoverArt {
  data: Buffer;
  mime: string;
}

export interface CoverArtResolverOptions {
  /** Skip parsing (and cache a miss) for files larger than this. Default 50 MiB. */
  maxFileSizeBytes?: number;
  /** Give up on a stuck parse (and cache a miss) after this long. Default 5s. */
  parseTimeoutMs?: number;
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_PARSE_TIMEOUT_MS = 5_000;

/**
 * Extracts embedded cover art from track files. Ids are SHA-256 prefixes of
 * the file path, so untrusted metadata never appears in URLs or paths.
 */
export class CoverArtResolver {
  private readonly cache = new Map<string, CoverArt | null>();
  private readonly maxEntries: number;
  private readonly maxFileSizeBytes: number;
  private readonly parseTimeoutMs: number;

  constructor(maxEntries = 200, opts: CoverArtResolverOptions = {}) {
    this.maxEntries = maxEntries;
    this.maxFileSizeBytes = opts.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    this.parseTimeoutMs = opts.parseTimeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS;
  }

  idFor(filePath: string): string {
    return trackKeyFor(filePath);
  }

  get(id: string): CoverArt | null {
    return this.cache.get(id) ?? null;
  }

  async resolve(filePath: string): Promise<CoverArt | null> {
    const id = this.idFor(filePath);
    if (this.cache.has(id)) return this.cache.get(id) ?? null;

    let art: CoverArt | null = null;
    try {
      const stats = await stat(filePath);
      if (stats.size <= this.maxFileSizeBytes) {
        art = await this.parseWithTimeout(filePath);
      }
    } catch {
      art = null;
    }

    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(id, art);
    return art;
  }

  /** Race the metadata parse against a timeout so a stuck/slow file can't stall the resolver. */
  private async parseWithTimeout(filePath: string): Promise<CoverArt | null> {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), this.parseTimeoutMs).unref();
    });
    // Caught here (rather than left to the caller) so a parse that errors
    // after the timeout has already won the race doesn't surface as an
    // unhandled rejection.
    const parse = (async (): Promise<CoverArt | null> => {
      const meta = await parseFile(filePath, { skipPostHeaders: true });
      const cover = selectCover(meta.common.picture);
      return cover ? { data: Buffer.from(cover.data), mime: cover.format } : null;
    })().catch(() => null);
    return Promise.race([parse, timeout]);
  }
}

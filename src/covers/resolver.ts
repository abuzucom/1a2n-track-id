import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseStream, selectCover } from 'music-metadata';
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
  /** Total cover bytes held in the cache. Default 64 MiB. */
  maxCacheBytes?: number;
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_PARSE_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_CACHE_BYTES = 64 * 1024 * 1024;

/**
 * Extensions Traktor can actually have in a library. The path handed to this
 * resolver arrives in a POST body, so it is chosen by whoever sent the
 * payload rather than by Traktor. Without this gate the parser can be aimed
 * at any path on disk, which turns it into a file-existence oracle and, for
 * anything with parseable embedded art, a read primitive.
 */
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.m4b', '.mp4', '.aac', '.flac', '.wav', '.wave',
  '.aif', '.aiff', '.aifc', '.ogg', '.oga', '.opus', '.wma', '.alac',
  '.mpc', '.ape', '.wv',
]);

/**
 * Types we are willing to echo back as a Content-Type. The value comes from
 * the file's own picture frame, so a crafted track could otherwise name an
 * active type and have this server serve it from its own origin.
 */
const ALLOWED_ART_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Lowercased type without parameters, e.g. "IMAGE/PNG; charset=x" -> "image/png". */
function normalizeMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Extracts embedded cover art from track files. Ids are SHA-256 prefixes of
 * the file path, so untrusted metadata never appears in URLs or paths.
 */
export class CoverArtResolver {
  private readonly cache = new Map<string, CoverArt | null>();
  private readonly maxEntries: number;
  private readonly maxFileSizeBytes: number;
  private readonly parseTimeoutMs: number;
  private readonly maxCacheBytes: number;
  private cachedByteCount = 0;

  constructor(maxEntries = 200, opts: CoverArtResolverOptions = {}) {
    this.maxEntries = maxEntries;
    this.maxFileSizeBytes = opts.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    this.parseTimeoutMs = opts.parseTimeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS;
    this.maxCacheBytes = opts.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES;
  }

  /** Cover bytes currently held, for the caller's own limits and for tests. */
  get cachedBytes(): number {
    return this.cachedByteCount;
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

    return this.store(id, await this.readCover(filePath));
  }

  /** Parse the file if it is one we are willing to open; null on any refusal. */
  private async readCover(filePath: string): Promise<CoverArt | null> {
    if (!AUDIO_EXTENSIONS.has(extname(filePath).toLowerCase())) return null;
    try {
      const stats = await stat(filePath);
      // Directories and device/FIFO nodes also pass stat(). A character
      // device reports size 0, so the size cap alone would wave it through
      // into an unbounded read.
      if (!stats.isFile() || stats.size > this.maxFileSizeBytes) return null;
      return await this.parseWithTimeout(filePath, stats.size);
    } catch (err) {
      // Missing, unreadable, timed out, or not really an audio file. All are
      // ordinary for a live library, and the caller caches the miss so a
      // broken file is not reopened on every snapshot. The path is not
      // logged: it is the username-bearing string the rest of this server
      // takes care never to emit.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('cover art read/parse failed for a track (path redacted):', (err as Error).name);
      }
      return null;
    }
  }

  /**
   * Parse with a timeout that actually stops the work. music-metadata takes
   * no AbortSignal, so the read stream is owned here and destroyed on
   * timeout; the previous Promise.race only stopped waiting, leaving the
   * parse running against a file that might never end.
   */
  private async parseWithTimeout(filePath: string, size: number): Promise<CoverArt | null> {
    const stream = createReadStream(filePath);
    const timer = setTimeout(() => {
      stream.destroy(new Error(`cover art parse timed out after ${this.parseTimeoutMs}ms`));
    }, this.parseTimeoutMs);
    timer.unref();
    try {
      const meta = await parseStream(stream, { path: filePath, size }, { skipPostHeaders: true });
      const cover = selectCover(meta.common.picture);
      if (!cover) return null;
      const mime = normalizeMime(cover.format);
      return ALLOWED_ART_MIME_TYPES.has(mime) ? { data: Buffer.from(cover.data), mime } : null;
    } finally {
      clearTimeout(timer);
      stream.destroy();
    }
  }

  /** Cache the result, evicting oldest-first to stay within both bounds. */
  private store(id: string, art: CoverArt | null): CoverArt | null {
    // A cover that can never fit is cached as a miss rather than evicting
    // the whole cache to make room it will not get.
    const size = art ? art.data.length : 0;
    const entry = size > this.maxCacheBytes ? null : art;
    const entrySize = entry ? size : 0;

    while (this.cache.size >= this.maxEntries || this.cachedByteCount + entrySize > this.maxCacheBytes) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.evict(oldest);
    }
    this.cache.set(id, entry);
    this.cachedByteCount += entrySize;
    return entry;
  }

  private evict(id: string): void {
    const evicted = this.cache.get(id);
    if (evicted) this.cachedByteCount -= evicted.data.length;
    this.cache.delete(id);
  }
}

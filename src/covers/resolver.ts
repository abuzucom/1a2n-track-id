import { createHash } from 'node:crypto';
import { parseFile, selectCover } from 'music-metadata';

export interface CoverArt {
  data: Buffer;
  mime: string;
}

/**
 * Extracts embedded cover art from track files. Ids are SHA-256 prefixes of
 * the file path, so untrusted metadata never appears in URLs or paths.
 */
export class CoverArtResolver {
  private readonly cache = new Map<string, CoverArt | null>();
  private readonly maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  idFor(filePath: string): string {
    return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  }

  get(id: string): CoverArt | null {
    return this.cache.get(id) ?? null;
  }

  async resolve(filePath: string): Promise<CoverArt | null> {
    const id = this.idFor(filePath);
    if (this.cache.has(id)) return this.cache.get(id) ?? null;

    let art: CoverArt | null = null;
    try {
      const meta = await parseFile(filePath, { skipPostHeaders: true });
      const cover = selectCover(meta.common.picture);
      if (cover) art = { data: Buffer.from(cover.data), mime: cover.format };
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
}

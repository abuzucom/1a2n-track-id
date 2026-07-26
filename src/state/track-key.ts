import { createHash } from 'node:crypto';

const KEY_LENGTH = 16;

/**
 * Stable, opaque id for a local track, derived from its absolute file path.
 *
 * Lets an external consumer join a playing deck to its own library index
 * without the server ever emitting a file path, which would leak the
 * username. SHA-256 rather than a fast non-cryptographic hash so the choice
 * stays defensible wherever this id ends up being used.
 *
 * Returns '' for an empty path instead of hashing the empty string: streamed
 * decks have no file, and every one of them sharing a single "key" would be
 * worse than having none. Those are identified by `streamingId` instead.
 */
export function trackKeyFor(filePath: string): string {
  if (!filePath) return '';
  return createHash('sha256').update(filePath).digest('hex').slice(0, KEY_LENGTH);
}

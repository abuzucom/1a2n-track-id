// Shared value coercion helpers for untrusted input (network payloads, files on disk).

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Lenient: also accepts numeric strings, since live Traktor JSON may send them. */
export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Strict: rejects strings, for input that is not trusted to look like JSON at all. */
export const numStrict = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1;

export const clamp01 = (v: unknown): number => Math.min(1, Math.max(0, num(v) ?? 0));

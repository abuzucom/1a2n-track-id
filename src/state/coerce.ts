// Shared value coercion helpers for untrusted input (network payloads, files on disk).

export const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Lenient: also accepts numeric strings, since live Traktor JSON may send them. */
export const num = (value: unknown): number | null => {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
};

/** Strict: rejects strings, for input that is not trusted to look like JSON at all. */
export const numStrict = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const bool = (value: unknown): boolean => value === true || value === 'true' || value === 1;

export const clamp01 = (value: unknown): number => Math.min(1, Math.max(0, num(value) ?? 0));

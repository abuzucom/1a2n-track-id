/**
 * Friendly message for a failed listen, or null when the error is not one we
 * explain (caller rethrows those).
 */
export function formatListenError(err: unknown, port: number): string | null {
  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
  if (code !== 'EADDRINUSE') return null;
  return (
    `Port ${port} is already in use. Is the overlay server already running?\n` +
    `Close the other window, or set TRACK_ID_PORT to use a different port.`
  );
}

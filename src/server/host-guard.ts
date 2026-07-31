// Loopback Host header check. See isLoopbackHost for why binding to
// 127.0.0.1 is not by itself enough.

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Hostname part of a Host header value, without the port. */
function hostnameOf(host: string): string {
  // IPv6 literals are bracketed (RFC 3986), so the colons inside them are
  // not the port separator.
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? '' : host.slice(0, end + 1);
  }
  return host.split(':')[0] ?? '';
}

/**
 * True when the Host header names the loopback interface.
 *
 * Binding to 127.0.0.1 keeps other machines out, but it is not an origin
 * boundary for a browser. A page can point a hostname it controls at
 * 127.0.0.1 (DNS rebinding) and then reach this server as same-origin,
 * which bypasses CORS and the /ws origin check alike, because by that point
 * the origin genuinely is the attacker's own name.
 *
 * The Host header still carries that name, so checking it closes the hole.
 * The QML mod posts to http://localhost:8080 and OBS loads
 * http://127.0.0.1:8080/overlay, so both keep working unchanged.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  return LOOPBACK_HOSTNAMES.has(hostnameOf(host.toLowerCase()));
}

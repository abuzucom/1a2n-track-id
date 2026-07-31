import { describe, expect, it } from 'vitest';
import { isLoopbackHost } from './host-guard.js';

describe('isLoopbackHost', () => {
  it('accepts the loopback names the server is reachable under', () => {
    expect(isLoopbackHost('127.0.0.1:8080')).toBe(true);
    expect(isLoopbackHost('localhost:8080')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('[::1]:8080')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  it('rejects a rebound attacker hostname', () => {
    // The whole point: the DNS name resolves to 127.0.0.1, so the connection
    // arrives, but the Host header still carries the attacker's name.
    expect(isLoopbackHost('evil.com')).toBe(false);
    expect(isLoopbackHost('evil.com:8080')).toBe(false);
  });

  it('rejects names that merely contain a loopback name', () => {
    expect(isLoopbackHost('localhost.evil.com')).toBe(false);
    expect(isLoopbackHost('127.0.0.1.evil.com')).toBe(false);
    expect(isLoopbackHost('notlocalhost')).toBe(false);
    expect(isLoopbackHost('evil.com:localhost')).toBe(false);
  });

  it('rejects a missing or empty Host header', () => {
    expect(isLoopbackHost(undefined)).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
    expect(isLoopbackHost(':8080')).toBe(false);
  });

  it('ignores case, which DNS does too', () => {
    expect(isLoopbackHost('LOCALHOST:8080')).toBe(true);
  });
});

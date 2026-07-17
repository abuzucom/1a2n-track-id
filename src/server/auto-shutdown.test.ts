import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoShutdown } from './auto-shutdown.js';

describe('AutoShutdown', () => {
  let exited: boolean;
  let auto: AutoShutdown;

  beforeEach(() => {
    vi.useFakeTimers();
    exited = false;
  });
  afterEach(() => {
    auto.dispose();
    vi.useRealTimers();
  });

  const make = (enabled = true) =>
    new AutoShutdown({ graceMs: 60_000, enabled, onShutdown: () => (exited = true) });

  it('does not shut down before any client has ever connected', () => {
    auto = make();
    vi.advanceTimersByTime(10 * 60_000);
    expect(exited).toBe(false);
  });

  it('shuts down after the last client leaves and the grace period passes', () => {
    auto = make();
    auto.clientsChanged(1);
    auto.clientsChanged(0);
    vi.advanceTimersByTime(59_999);
    expect(exited).toBe(false);
    vi.advanceTimersByTime(1);
    expect(exited).toBe(true);
  });

  it('cancels shutdown if a client reconnects within the grace period', () => {
    auto = make();
    auto.clientsChanged(1);
    auto.clientsChanged(0);
    vi.advanceTimersByTime(30_000);
    auto.clientsChanged(1);
    vi.advanceTimersByTime(10 * 60_000);
    expect(exited).toBe(false);
  });

  it('does nothing when disabled', () => {
    auto = make(false);
    auto.clientsChanged(1);
    auto.clientsChanged(0);
    vi.advanceTimersByTime(10 * 60_000);
    expect(exited).toBe(false);
  });
});

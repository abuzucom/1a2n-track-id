import { describe, expect, it } from 'vitest';
import { parseCliFlags } from './cli.js';

describe('parseCliFlags', () => {
  it('defaults to auto-exit on, resume off, dev off', () => {
    expect(parseCliFlags([])).toEqual({ autoExit: true, resume: false, dev: false, requireAuth: false });
  });

  it('parses --no-auto-exit, --resume, --dev, and --require-auth', () => {
    expect(parseCliFlags(['--no-auto-exit'])).toEqual({ autoExit: false, resume: false, dev: false, requireAuth: false });
    expect(parseCliFlags(['--resume'])).toEqual({ autoExit: true, resume: true, dev: false, requireAuth: false });
    expect(parseCliFlags(['--dev'])).toEqual({ autoExit: true, resume: false, dev: true, requireAuth: false });
    expect(parseCliFlags(['--require-auth'])).toEqual({ autoExit: true, resume: false, dev: false, requireAuth: true });
    expect(parseCliFlags(['--resume', '--no-auto-exit', '--dev'])).toEqual({
      autoExit: false,
      resume: true,
      dev: true,
      requireAuth: false,
    });
  });

  it('ignores unknown arguments', () => {
    expect(parseCliFlags(['--verbose', 'extra'])).toEqual({
      autoExit: true,
      resume: false,
      dev: false,
      requireAuth: false,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { parseCliFlags } from './cli.js';

describe('parseCliFlags', () => {
  it('defaults to auto-exit on, resume off, dev off', () => {
    expect(parseCliFlags([])).toEqual({ autoExit: true, resume: false, dev: false });
  });

  it('parses --no-auto-exit, --resume, and --dev', () => {
    expect(parseCliFlags(['--no-auto-exit'])).toEqual({ autoExit: false, resume: false, dev: false });
    expect(parseCliFlags(['--resume'])).toEqual({ autoExit: true, resume: true, dev: false });
    expect(parseCliFlags(['--dev'])).toEqual({ autoExit: true, resume: false, dev: true });
    expect(parseCliFlags(['--resume', '--no-auto-exit', '--dev'])).toEqual({
      autoExit: false,
      resume: true,
      dev: true,
    });
  });

  it('ignores unknown arguments', () => {
    expect(parseCliFlags(['--verbose', 'extra'])).toEqual({ autoExit: true, resume: false, dev: false });
  });
});

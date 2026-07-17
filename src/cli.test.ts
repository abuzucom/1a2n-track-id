import { describe, expect, it } from 'vitest';
import { parseCliFlags } from './cli.js';

describe('parseCliFlags', () => {
  it('defaults to auto-exit on and resume off', () => {
    expect(parseCliFlags([])).toEqual({ autoExit: true, resume: false });
  });

  it('parses --no-auto-exit and --resume', () => {
    expect(parseCliFlags(['--no-auto-exit'])).toEqual({ autoExit: false, resume: false });
    expect(parseCliFlags(['--resume'])).toEqual({ autoExit: true, resume: true });
    expect(parseCliFlags(['--resume', '--no-auto-exit'])).toEqual({ autoExit: false, resume: true });
  });

  it('ignores unknown arguments', () => {
    expect(parseCliFlags(['--verbose', 'extra'])).toEqual({ autoExit: true, resume: false });
  });
});

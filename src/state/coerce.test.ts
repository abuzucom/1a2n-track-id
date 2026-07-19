import { describe, expect, it } from 'vitest';
import { bool, clamp01, num, numStrict, str } from './coerce.js';

describe('str', () => {
  it('passes strings through and coerces everything else to empty', () => {
    expect(str('hello')).toBe('hello');
    expect(str(123)).toBe('');
    expect(str(null)).toBe('');
    expect(str(undefined)).toBe('');
  });
});

describe('num (lenient)', () => {
  it('accepts numeric strings, unlike numStrict', () => {
    expect(num('128')).toBe(128);
    expect(num(128)).toBe(128);
  });

  it('rejects non-finite and non-numeric values', () => {
    expect(num('not a number')).toBeNull();
    expect(num(NaN)).toBeNull();
    expect(num(Infinity)).toBeNull();
    expect(num(null)).toBeNull();
  });
});

describe('numStrict', () => {
  it('rejects numeric strings, unlike num', () => {
    expect(numStrict('128')).toBeNull();
  });

  it('accepts finite numbers and rejects non-finite ones', () => {
    expect(numStrict(128)).toBe(128);
    expect(numStrict(NaN)).toBeNull();
    expect(numStrict(Infinity)).toBeNull();
    expect(numStrict(null)).toBeNull();
  });
});

describe('bool', () => {
  it('accepts true, "true", and 1', () => {
    expect(bool(true)).toBe(true);
    expect(bool('true')).toBe(true);
    expect(bool(1)).toBe(true);
  });

  it('rejects everything else', () => {
    expect(bool(false)).toBe(false);
    expect(bool('false')).toBe(false);
    expect(bool(0)).toBe(false);
    expect(bool(null)).toBe(false);
  });
});

describe('clamp01', () => {
  it('clamps numeric input to the unit range', () => {
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(7)).toBe(1);
  });

  it('treats unparseable input as 0', () => {
    expect(clamp01(null)).toBe(0);
    expect(clamp01('nope')).toBe(0);
  });
});

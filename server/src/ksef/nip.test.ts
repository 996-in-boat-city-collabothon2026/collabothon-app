import { describe, expect, it } from 'vitest';
import { isValidNip, nipError } from './nip';

describe('NIP checksum', () => {
  it('accepts valid NIPs (also with dashes / PL prefix)', () => {
    expect(isValidNip('1234563218')).toBe(true);
    expect(isValidNip('123-456-32-18')).toBe(true);
    expect(isValidNip('PL1234563218')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidNip('1234563219')).toBe(false);
    expect(nipError('1234563219')).toMatch(/wrong checksum/);
  });

  it('rejects wrong length (the demo invoice FV/2026/11/009)', () => {
    expect(nipError('94412345')).toMatch(/10 digits/);
  });

  it('skips foreign EU VAT ids', () => {
    expect(nipError('DE298765432')).toBeNull();
  });
});

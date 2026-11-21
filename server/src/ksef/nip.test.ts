import { describe, expect, it } from 'vitest';
import { isForeignVatId, isValidNip, nipError, normalizeNip } from './nip';
// The web form has its own copy (web cannot import server code). Both must give the same answer.
import * as web from '../../../web/src/lib/nip';

describe('NIP checksum', () => {
  it('accepts valid NIPs (also with dashes / PL prefix)', () => {
    expect(isValidNip('1234563218')).toBe(true);
    expect(isValidNip('123-456-32-18')).toBe(true);
    expect(isValidNip('PL1234563218')).toBe(true);
    expect(isValidNip('pl 123 456 32 18')).toBe(true);
    expect(normalizeNip('pl 123-456-32-18')).toBe('1234563218');
  });

  it('rejects a wrong check digit', () => {
    expect(isValidNip('1234563219')).toBe(false);
    expect(nipError('1234563219')).toMatch(/suma kontrolna/);
  });

  it('rejects wrong length (the demo invoice FV/2026/11/009)', () => {
    expect(nipError('94412345')).toMatch(/10 cyfr/);
  });
});

describe('foreign VAT IDs: only Germany (DE + 9 digits) is supported', () => {
  it('accepts the German IDs used by the demo, also with spaces / lower case', () => {
    for (const id of ['DE298765432', 'DE812345678', 'de 298 765 432', 'DE-298765432']) {
      expect(isForeignVatId(id), id).toBe(true);
      expect(nipError(id), id).toBeNull();
    }
  });

  it('rejects any other two letters (review: "TEST" became an accepted invoice with a UPO)', () => {
    for (const id of ['TEST', 'XX123456789', 'FR12345678901', 'ABCD', 'TE']) {
      expect(isForeignVatId(id), id).toBe(false);
      expect(nipError(id), id).toMatch(/nieobsługiwany prefiks kraju/);
    }
  });

  it('rejects a German ID in the wrong format', () => {
    for (const id of ['DE12345678', 'DE1234567890', 'DE12345678X', 'DE']) {
      expect(isForeignVatId(id), id).toBe(false);
      expect(nipError(id), id).toMatch(/DE i 9 cyfr/);
    }
  });

  it('every rejection names "NIP nabywcy", so the agents translate it to English (agents/facts.ts)', () => {
    for (const id of ['TEST', 'DE123', '94412345', '1234563219']) expect(nipError(id)).toMatch(/NIP nabywcy/);
  });
});

describe('web form validator agrees with the gateway', () => {
  const cases = [
    '1234563218', '123-456-32-18', 'PL1234563218', '1234563219', '94412345', '',
    'DE298765432', 'de 298 765 432', 'DE12345678', 'TEST', 'XX123456789', 'FR12345678901', '12A4563218',
  ];
  it.each(cases)('%j', (id) => {
    expect(web.nipProblem(id) === null, 'web accepts').toBe(nipError(id) === null);
    expect(web.normalizeNip(id)).toBe(normalizeNip(id));
    expect(web.isForeignVatId(id)).toBe(isForeignVatId(id));
  });

  it('gives the form a clear reason', () => {
    expect(web.nipProblem('TEST')).toBe('nip_country');
    expect(web.nipProblem('DE12345678')).toBe('nip_foreign_format');
    expect(web.nipProblem('94412345')).toBe('nip_length');
    expect(web.nipProblem('1234563219')).toBe('nip_checksum');
    expect(web.nipProblem('')).toBe('nip_empty');
  });
});

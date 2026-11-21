// Owner: Pair 3. Tests for the English text of KSeF rejection reasons (shared/ksefReason.ts).
import { describe, expect, it } from 'vitest';
import { ksefReasonEn } from '@cfo/shared';
import { nipError } from './nip';

describe('ksefReasonEn', () => {
  it('translates every Polish NIP message from the simulated KSeF', () => {
    expect(ksefReasonEn(nipError('94412345')!)).toBe('Invalid buyer NIP (Podmiot2): it must have 10 digits');
    expect(ksefReasonEn(nipError('1234567890')!)).toBe('Invalid buyer NIP (Podmiot2): the checksum does not match');
    expect(ksefReasonEn(nipError('TE123456789')!)).toBe('Invalid buyer NIP (Podmiot2): the country prefix "TE" is not supported');
    expect(ksefReasonEn(nipError('DE12345')!)).toBe('Invalid buyer NIP (Podmiot2): a German VAT ID is DE and 9 digits');
  });

  it('leaves English or unknown reasons unchanged', () => {
    expect(ksefReasonEn('Invoice has no lines (FaWiersz)')).toBe('Invoice has no lines (FaWiersz)');
    expect(ksefReasonEn('Test')).toBe('Test');
  });
});

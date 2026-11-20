// Owner: Pair 3. Polish NIP checksum (weights 6,5,7,2,3,4,5,6,7; sum mod 11 = last digit; 10 = invalid).
// Same logic as web/src/lib/nip.ts (web cannot import server code) – keep both in sync.
const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export const normalizeNip = (nip: string) => nip.replace(/[\s-]/g, '').replace(/^PL/i, '');

/** Foreign EU VAT numbers (e.g. DE298765432) are not Polish NIPs – we don't checksum them. */
export const isForeignVatId = (nip: string) => /^[A-Z]{2}[0-9A-Z]{2,12}$/i.test(nip.trim()) && !/^PL/i.test(nip.trim());

export function isValidNip(nip: string): boolean {
  const d = normalizeNip(nip);
  if (!/^\d{10}$/.test(d)) return false;
  const sum = WEIGHTS.reduce((s, w, i) => s + w * Number(d[i]), 0);
  return sum % 11 !== 10 && sum % 11 === Number(d[9]);
}

/** Polish error message for KSeF, or null when the NIP is fine. */
export function nipError(nip: string): string | null {
  if (isForeignVatId(nip)) return null;
  const d = normalizeNip(nip);
  if (!/^\d{10}$/.test(d)) return 'Invalid buyer NIP (Podmiot2): 10 digits required';
  if (!isValidNip(d)) return 'Invalid buyer NIP (Podmiot2): wrong checksum';
  return null;
}

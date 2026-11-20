// Polish NIP checksum (weights 6,5,7,2,3,4,5,6,7; sum mod 11 = last digit; 10 = invalid).
// Same logic as server/src/ksef/nip.ts – keep both in sync.
const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export const normalizeNip = (nip: string) => nip.replace(/[\s-]/g, '').replace(/^PL/i, '');

/** Foreign EU VAT ids (e.g. DE298765432) are not checksummed. */
export const isForeignVatId = (nip: string) => /^[A-Z]{2}[0-9A-Z]{2,12}$/i.test(nip.trim()) && !/^PL/i.test(nip.trim());

export function isValidNip(nip: string): boolean {
  const d = normalizeNip(nip);
  if (!/^\d{10}$/.test(d)) return false;
  const sum = WEIGHTS.reduce((s, w, i) => s + w * Number(d[i]), 0);
  return sum % 11 !== 10 && sum % 11 === Number(d[9]);
}

/** i18n key of the problem, or null when the NIP is fine. */
export function nipProblem(nip: string): 'nip_empty' | 'nip_digits' | 'nip_length' | 'nip_checksum' | null {
  if (isForeignVatId(nip)) return null;
  const d = normalizeNip(nip);
  if (!d) return 'nip_empty';
  if (!/^\d+$/.test(d)) return 'nip_digits';
  if (d.length !== 10) return 'nip_length';
  if (!isValidNip(d)) return 'nip_checksum';
  return null;
}

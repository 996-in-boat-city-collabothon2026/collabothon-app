// Buyer tax ID check for the KSeF "Fix & resend" form.
// Same logic as server/src/ksef/nip.ts – keep both in sync.
//
// Accepted:
// - Polish NIP: 10 digits with a valid checksum (weights 6,5,7,2,3,4,5,6,7; sum mod 11 = last digit; 10 = invalid).
//   Spaces, dashes and a "PL" prefix are allowed ("123-456-32-18", "PL1234563218").
// - Foreign EU VAT ID: ONLY the countries listed in FOREIGN_VAT_FORMATS (today: Germany, "DE" + 9 digits,
//   e.g. DE298765432). Any other two letters (also "TEST") are rejected. Format only, no foreign checksum.
const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/** The only foreign VAT IDs this project supports, with the format for that country. */
export const FOREIGN_VAT_FORMATS: Readonly<Record<string, RegExp>> = { DE: /^\d{9}$/ };

const compact = (nip: string) => nip.replace(/[\s-]/g, '').toUpperCase();

/** Polish NIP → 10 digits (no "PL", spaces or dashes). A foreign VAT ID keeps its country prefix. */
export const normalizeNip = (nip: string) => compact(nip).replace(/^PL/, '');

/** Two letters that are not "PL" = the buyer is foreign. */
const foreignPrefix = (nip: string): string | null => {
  const m = /^([A-Z]{2})/.exec(compact(nip));
  return m && m[1] !== 'PL' ? m[1] : null;
};

/** True only for a supported foreign VAT ID in the right format (e.g. DE298765432). */
export function isForeignVatId(nip: string): boolean {
  const country = foreignPrefix(nip);
  const format = country ? FOREIGN_VAT_FORMATS[country] : undefined;
  return !!format && format.test(compact(nip).slice(2));
}

export function isValidNip(nip: string): boolean {
  const d = normalizeNip(nip);
  if (!/^\d{10}$/.test(d)) return false;
  const sum = WEIGHTS.reduce((s, w, i) => s + w * Number(d[i]), 0);
  return sum % 11 !== 10 && sum % 11 === Number(d[9]);
}

export type NipProblem = 'nip_empty' | 'nip_digits' | 'nip_length' | 'nip_checksum' | 'nip_country' | 'nip_foreign_format';

/** i18n key of the problem, or null when the buyer ID is fine. */
export function nipProblem(nip: string): NipProblem | null {
  const country = foreignPrefix(nip);
  if (country) {
    if (!FOREIGN_VAT_FORMATS[country]) return 'nip_country';
    return isForeignVatId(nip) ? null : 'nip_foreign_format';
  }
  const d = normalizeNip(nip);
  if (!d) return 'nip_empty';
  if (!/^\d+$/.test(d)) return 'nip_digits';
  if (d.length !== 10) return 'nip_length';
  if (!isValidNip(d)) return 'nip_checksum';
  return null;
}

// Owner: Pair 2. Small, tested money/date helpers. Keep all rounding here.
import type { Invoice } from '@cfo/shared';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const invoiceNet = (inv: Invoice) => round2(inv.lines.reduce((s, l) => s + l.qty * l.unitNet, 0));
export const invoiceVat = (inv: Invoice) =>
  round2(inv.lines.reduce((s, l) => s + (l.qty * l.unitNet * l.vatRate) / 100, 0));
export const invoiceGross = (inv: Invoice) => round2(invoiceNet(inv) + invoiceVat(inv));

/** Whole days from `from` to `to` (ISO dates). Negative = in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const fmtPLN = (n: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n);

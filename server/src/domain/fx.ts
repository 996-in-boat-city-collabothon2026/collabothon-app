// Owner: Pair 2. Currency helpers. Rates come from seed fx-rates.json (NBP table A, demo values).
import type { Currency, Invoice } from '@cfo/shared';
import { db } from './store';
import { invoiceGross, round2 } from './money';

/** Newest NBP mid rate for a currency (1 unit = x zł). PLN = 1. */
export function latestRate(currency: Currency = 'PLN'): number {
  if (currency === 'PLN') return 1;
  const rates = db.fxRates.filter((r) => r.currency === currency).sort((a, b) => a.date.localeCompare(b.date));
  const last = rates[rates.length - 1];
  if (!last) throw new Error(`No FX rate for ${currency} in seed fx-rates.json`);
  return last.midPLN;
}

export const toPLN = (amount: number, currency: Currency = 'PLN') => round2(amount * latestRate(currency));

/** Invoice gross converted to złoty at today's rate (PLN invoices unchanged). */
export const invoiceGrossPLN = (inv: Invoice) => toPLN(invoiceGross(inv), inv.currency);

/** Unpaid foreign purchases minus unpaid foreign sales, in PLN. Positive = we owe foreign currency. */
export function fxExposurePLN(): number {
  const foreign = db.invoices.filter((i) => !i.paid && i.currency && i.currency !== 'PLN');
  return round2(foreign.reduce((s, i) => s + (i.direction === 'purchase' ? 1 : -1) * invoiceGrossPLN(i), 0));
}

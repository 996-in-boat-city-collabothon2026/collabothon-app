// Owner: Pair 2 (Anna). Day-by-day cash forecast for 30/60/90 days.
// Money in = unpaid sales invoices, moved by how late that customer usually pays.
// Money out = unpaid obligations (overdue ones are paid today).
import type { Forecast, ForecastPoint, Invoice } from '@cfo/shared';
import { db } from '../domain/store';
import { addDays, daysBetween, round2 } from '../domain/money';
import { convertible, invoiceGrossPLN } from '../domain/fx';

// `paidDate` is not in shared/types.ts yet. When the seed gets it, payer history starts working automatically.
type PaidInvoice = Invoice & { paidDate?: string };

/** Average days late per customer NIP, from their paid sales invoices. Customers with no history are missing. */
export function payerDelays(): Map<string, number> {
  const late = new Map<string, number[]>();
  for (const inv of db.invoices as PaidInvoice[]) {
    if (inv.direction !== 'sales' || !inv.paid || !inv.paidDate) continue;
    const days = Math.max(0, daysBetween(inv.dueDate, inv.paidDate));
    late.set(inv.counterparty.nip, [...(late.get(inv.counterparty.nip) ?? []), days]);
  }
  const avg = new Map<string, number>();
  for (const [nip, list] of late) avg.set(nip, Math.round(list.reduce((s, d) => s + d, 0) / list.length));
  return avg;
}

/**
 * When we expect the money for an unpaid sales invoice, or null if we don't count on it.
 * - Known payer: due date + their average delay.
 * - Unknown payer: the due date.
 * - Already later than expected (overdue, no history or past their usual delay): null = worst case.
 */
export function expectedPayDate(inv: Invoice, delays = payerDelays()): string | null {
  const expected = addDays(inv.dueDate, delays.get(inv.counterparty.nip) ?? 0);
  return daysBetween(db.shop.today, expected) < 0 ? null : expected;
}

export function forecast(days: number): Forecast {
  const today = db.shop.today;
  const delays = payerDelays();
  const inflows = db.invoices
    .filter((i) => i.direction === 'sales' && !i.paid && convertible(i)) // no NBP rate → cannot count it in złoty
    .map((i) => ({ date: expectedPayDate(i, delays), amount: invoiceGrossPLN(i) }));
  const outflows = db.obligations
    .filter((o) => !o.paid)
    .map((o) => ({ date: daysBetween(today, o.dueDate) < 0 ? today : o.dueDate, amount: o.amountPLN }));

  let balance = db.bank.balancePLN;
  const points: ForecastPoint[] = [];
  for (let d = 0; d <= days; d++) {
    const date = addDays(today, d);
    for (const inf of inflows) if (inf.date === date) balance += inf.amount;
    for (const out of outflows) if (out.date === date) balance -= out.amount;
    points.push({ date, balancePLN: round2(balance) });
  }
  const lowest = points.reduce((min, p) => (p.balancePLN < min.balancePLN ? p : min), points[0]);
  return { days, bufferPLN: db.shop.safetyBufferPLN, points, lowest };
}

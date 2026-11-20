// Owner: Pair 2 (Anna). STARTER version: simple day-by-day forecast.
// TODO(Pair 2): shift late payers by their average delay, add expected new sales, PL weekends.
import type { Forecast, ForecastPoint } from '@cfo/shared';
import { db } from '../domain/store';
import { addDays, daysBetween, invoiceGross, round2 } from '../domain/money';

export function forecast(days: number): Forecast {
  const today = db.shop.today;
  const inflows = db.invoices.filter((i) => i.direction === 'sales' && !i.paid);
  const outflows = db.obligations.filter((o) => !o.paid);

  let balance = db.bank.balancePLN;
  const points: ForecastPoint[] = [];
  for (let d = 0; d <= days; d++) {
    const date = addDays(today, d);
    // Overdue invoices are NOT assumed to arrive (worst case). Pair 2: make this smarter.
    for (const inv of inflows) if (inv.dueDate === date) balance += invoiceGross(inv);
    for (const ob of outflows) {
      const due = daysBetween(today, ob.dueDate) < 0 ? today : ob.dueDate; // overdue = pay today
      if (due === date) balance -= ob.amountPLN;
    }
    points.push({ date, balancePLN: round2(balance) });
  }
  const lowest = points.reduce((min, p) => (p.balancePLN < min.balancePLN ? p : min), points[0]);
  return { days, bufferPLN: db.shop.safetyBufferPLN, points, lowest };
}

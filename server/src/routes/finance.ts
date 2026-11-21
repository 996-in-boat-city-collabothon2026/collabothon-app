// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import type { Alert, AppState, ExpenseBreakdown, Kpis } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN, lastDays, round2 } from '../domain/money';
import { convertible, fxExposurePLN, invoiceGrossPLN } from '../domain/fx';
import { forecast } from '../rules/cashflow';
import { totalsBetween } from '../rules/expenses';
import { FX_SHOCK_THRESHOLD_PLN, fxExposures } from '../rules/fx';
import { taxesDue, taxLabelEn } from '../rules/taxDue';
import { InvoiceForm, fillInvoiceGaps } from '../agents/invoiceClerk';

function kpis(): Kpis {
  const unpaidSales = db.invoices.filter((i) => i.direction === 'sales' && !i.paid && convertible(i));
  const overdue = unpaidSales.filter((i) => daysBetween(db.shop.today, i.dueDate) < 0);
  const openObligations = db.obligations.filter((o) => !o.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = openObligations[0];
  return {
    balancePLN: db.bank.balancePLN,
    receivablesPLN: round2(unpaidSales.reduce((s, i) => s + invoiceGrossPLN(i), 0)),
    overdueReceivablesPLN: round2(overdue.reduce((s, i) => s + invoiceGrossPLN(i), 0)),
    payablesPLN: round2(openObligations.reduce((s, o) => s + o.amountPLN, 0)),
    // Tax labels in English (the seed label is Polish: "VAT za październik"); other labels are names from the seed.
    nextDeadline: next && { label: ['VAT', 'ZUS', 'PIT'].includes(next.kind) ? taxLabelEn(next) : next.label, date: next.dueDate, amountPLN: next.amountPLN },
    fxExposurePLN: fxExposurePLN(),
  };
}

/** Pie chart data: money spent in the last `days` calendar dates ([today−(days−1), today]), by category. */
export function expenseBreakdown(days: number): ExpenseBreakdown {
  const { from, to } = lastDays(db.shop.today, days); // same window as Tomasz's expenses rule
  const totals = totalsBetween(from, to);
  const totalPLN = round2([...totals.values()].reduce((s, v) => s + v, 0));
  const byCategory = [...totals]
    .map(([category, amountPLN]) => ({ category, amountPLN: round2(amountPLN), share: totalPLN ? round2(amountPLN / totalPLN) : 0 }))
    .sort((a, b) => b.amountPLN - a.amountPLN);
  return { from, to, totalPLN, byCategory };
}

const TAX_ALERT_DAYS = 5;
const SEVERITY_ORDER: Record<Alert['severity'], number> = { critical: 0, warning: 1, info: 2 };

/** Dashboard banner: at most one alert per area (cash gap, FX shock, tax due soon, KSeF rejected), worst first. */
export function alerts(): Alert[] {
  const today = db.shop.today;
  const list: Alert[] = [];

  // Anna: cash below the buffer (critical when it goes below zero).
  const f = forecast(30);
  if (f.lowest.balancePLN < f.bufferPLN) {
    list.push({
      id: 'cash-gap',
      cfo: 'anna',
      severity: f.lowest.balancePLN < 0 ? 'critical' : 'warning',
      text: `Cash drops to ${fmtPLN(f.lowest.balancePLN)} on ${f.lowest.date} (buffer ${fmtPLN(f.bufferPLN)})`,
    });
  }

  // Kasia: a 5% currency move would cost more than the hedge threshold.
  for (const e of fxExposures().filter((x) => x.shockPLN > FX_SHOCK_THRESHOLD_PLN)) {
    const weOwe = e.net > 0;
    list.push({
      id: `fx-${e.currency}`,
      cfo: 'kasia',
      severity: 'warning',
      text: `If ${e.currency} ${weOwe ? 'rises' : 'falls'} 5%, you lose ${fmtPLN(e.shockPLN)} (${Math.abs(e.net)} ${e.currency} ${weOwe ? 'to pay' : 'to receive'})`,
    });
  }

  // Marek: VAT / ZUS / PIT due in the next 5 days (critical when overdue). Numbers from rules/taxDue.ts.
  const taxes = taxesDue(TAX_ALERT_DAYS);
  if (taxes.obligations.length > 0) {
    list.push({
      id: 'tax-due',
      cfo: 'marek',
      severity: taxes.overdue ? 'critical' : 'warning',
      text: `Taxes due soon: ${taxes.obligations.map((o) => `${o.kind} ${fmtPLN(o.amountPLN)} on ${o.dueDate}`).join(', ')}` +
        (taxes.obligations.length > 1 ? ` (total ${fmtPLN(taxes.totalPLN)})` : ''),
    });
  }

  // Marek: invoices rejected by KSeF (they are not legally issued until fixed).
  const rejected = db.invoices.filter((i) => i.ksef.status === 'rejected');
  if (rejected.length > 0) {
    list.push({
      id: 'ksef-rejected',
      cfo: 'marek',
      severity: 'warning',
      text: `KSeF rejected ${rejected.length} invoice(s): ${rejected.map((i) => i.number).join(', ')}`,
    });
  }

  return list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

const routes: FastifyPluginAsync = async (app) => {
  app.get('/state', async (): Promise<AppState> => ({ shop: db.shop, bank: db.bank, kpis: kpis() }));

  app.get<{ Querystring: { days?: string } }>('/forecast', async (req) => {
    const days = [30, 60, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    return forecast(days);
  });

  app.get<{ Querystring: { days?: string } }>('/expenses', async (req) => expenseBreakdown(Number(req.query.days) || 30));

  app.get('/alerts', async (): Promise<Alert[]> => alerts());

  // Voice-to-Invoice: the browser turns speech into text, the Invoice clerk agent fills the form's gaps from it.
  // Fills a form only: nothing is saved or sent to KSeF here.
  app.post<{ Body: { text?: unknown; form?: unknown } | undefined }>('/invoices/parse-voice', async (req, reply) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return reply.code(400).send({ error: 'text is required' });
    if (text.length > 2000) return reply.code(400).send({ error: 'text is too long (max 2000 characters)' });
    const form = InvoiceForm.safeParse(req.body?.form ?? {});
    if (!form.success) return reply.code(400).send({ error: 'form has a wrong shape' });
    return fillInvoiceGaps(text, form.data, db.shop.today);
  });
};

export default routes;

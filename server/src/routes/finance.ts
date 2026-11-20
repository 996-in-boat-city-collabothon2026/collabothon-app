// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import type { Alert, AppState, Kpis } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN, invoiceGross, round2 } from '../domain/money';
import { forecast } from '../rules/cashflow';

function kpis(): Kpis {
  const unpaidSales = db.invoices.filter((i) => i.direction === 'sales' && !i.paid);
  const overdue = unpaidSales.filter((i) => daysBetween(db.shop.today, i.dueDate) < 0);
  const openObligations = db.obligations.filter((o) => !o.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = openObligations[0];
  return {
    balancePLN: db.bank.balancePLN,
    receivablesPLN: round2(unpaidSales.reduce((s, i) => s + invoiceGross(i), 0)),
    overdueReceivablesPLN: round2(overdue.reduce((s, i) => s + invoiceGross(i), 0)),
    payablesPLN: round2(openObligations.reduce((s, o) => s + o.amountPLN, 0)),
    nextDeadline: next && { label: next.label, date: next.dueDate, amountPLN: next.amountPLN },
  };
}

const routes: FastifyPluginAsync = async (app) => {
  app.get('/state', async (): Promise<AppState> => ({ shop: db.shop, bank: db.bank, kpis: kpis() }));

  app.get<{ Querystring: { days?: string } }>('/forecast', async (req) => {
    const days = [30, 60, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    return forecast(days);
  });

  // STARTER: Pair 2 adds alerts from each rule file.
  app.get('/alerts', async (): Promise<Alert[]> => {
    const f = forecast(30);
    return f.lowest.balancePLN < f.bufferPLN
      ? [{ id: 'cash-gap', cfo: 'anna', severity: 'critical', text: `Cash drops to ${fmtPLN(f.lowest.balancePLN)} on ${f.lowest.date}` }]
      : [];
  });
};

export default routes;

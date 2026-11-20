// Owner: Pair 2 (Person B). GET /api/alerts: one alert per area, worst first.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Alert, ExpenseBreakdown } from '@cfo/shared';
import { addDays } from '../domain/money';
import { forecast } from '../rules/cashflow';
import { db, resetDb } from '../domain/store';
import finance, { alerts } from './finance';

const ids = () => alerts().map((a) => a.id);

describe('alerts', () => {
  beforeEach(() => resetDb());

  it('seed data: cash gap, FX shock, VAT in 5 days, KSeF rejected', async () => {
    const app = Fastify();
    await app.register(finance, { prefix: '/api' });
    const list = (await app.inject({ method: 'GET', url: '/api/alerts' })).json<Alert[]>();

    expect(list.map((a) => a.id).sort()).toEqual(['cash-gap', 'fx-EUR', 'ksef-rejected', 'tax-due']);
    expect(list[0]).toMatchObject({ id: 'cash-gap', cfo: 'anna', severity: 'critical' }); // goes below zero
    expect(list.find((a) => a.id === 'fx-EUR')!.text).toContain('320,25');
    expect(list.find((a) => a.id === 'tax-due')!.text).toContain('VAT'); // 25.11, in 5 days
    expect(list.find((a) => a.id === 'ksef-rejected')!.text).toContain('FV/2026/11/009');
  });

  it('tax due in 6 days → no tax alert; overdue → critical', () => {
    db.obligations = db.obligations.filter((o) => o.kind === 'VAT').map((o) => ({ ...o, dueDate: '2026-11-26' }));
    expect(ids()).not.toContain('tax-due');
    db.obligations[0].dueDate = '2026-11-18';
    expect(alerts().find((a) => a.id === 'tax-due')!.severity).toBe('critical');
  });

  it('healthy shop → no alerts', () => {
    db.obligations = [];
    db.invoices = [];
    expect(alerts()).toEqual([]);
  });

  it('cash below buffer but above zero → warning', () => {
    db.invoices = [];
    db.obligations = [{ id: 'o', kind: 'RENT', label: 'Rent', amountPLN: db.bank.balancePLN - 10000, dueDate: '2026-11-22', paid: false }];
    expect(alerts()).toEqual([expect.objectContaining({ id: 'cash-gap', severity: 'warning' })]);
  });
});

describe('GET /api/expenses uses the same 30 calendar dates as the rule', () => {
  beforeEach(() => resetDb());

  it('from = today−29; 100 zł a day for 60 days → 3 000 zł', async () => {
    db.expenses = Array.from({ length: 60 }, (_, n) => ({
      id: `d${n}`, date: addDays('2026-11-20', -n), category: 'parts' as const, label: 'parts', amountPLN: 100,
    }));
    const app = Fastify();
    await app.register(finance, { prefix: '/api' });
    const b = (await app.inject({ url: '/api/expenses?days=30' })).json<ExpenseBreakdown>();
    expect(b.from).toBe('2026-10-22');
    expect(b.to).toBe('2026-11-20');
    expect(b.totalPLN).toBe(3000);
  });

  it('forecast(30) still shows today and the next 30 days (31 points)', () => {
    expect(forecast(30).points).toHaveLength(31);
  });
});

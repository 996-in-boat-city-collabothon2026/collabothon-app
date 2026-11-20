import { beforeEach, describe, expect, it } from 'vitest';
import type { Invoice } from '@cfo/shared';
import { db, resetDb } from '../domain/store';
import { expectedPayDate, forecast, payerDelays } from './cashflow';

const sale = (id: string, nip: string, dueDate: string, extra: Partial<Invoice> & { paidDate?: string } = {}) =>
  ({
    id, number: id, direction: 'sales', issueDate: '2026-10-01', dueDate,
    counterparty: { name: `Client ${nip}`, nip },
    lines: [{ name: 'Repair', kind: 'labour', qty: 1, unitNet: 1000, vatRate: 23 }],
    paid: false, ksef: { status: 'accepted' }, ...extra,
  }) as Invoice;

describe('cashflow forecast', () => {
  beforeEach(() => resetDb());

  it('has one point per day for 30/60/90 days', () => {
    expect(forecast(30).points).toHaveLength(31);
    expect(forecast(90).points).toHaveLength(91);
    expect(forecast(30).points[0].date).toBe(db.shop.today);
  });

  it('lowest is the minimum point', () => {
    const f = forecast(30);
    expect(f.lowest.balancePLN).toBe(Math.min(...f.points.map((p) => p.balancePLN)));
  });

  it('does not count on overdue invoices without history (worst case)', () => {
    const overdue = db.invoices.find((i) => i.id === 'inv-s-001')!; // due 2026-11-05, today 2026-11-20
    expect(expectedPayDate(overdue)).toBeNull();
  });

  it('moves an invoice by its customer average delay', () => {
    db.invoices = [
      sale('old-1', '111', '2026-09-10', { paid: true, paidDate: '2026-09-20' }), // 10 days late
      sale('old-2', '111', '2026-10-10', { paid: true, paidDate: '2026-10-14' }), // 4 days late
      sale('new', '111', '2026-11-25'),
    ];
    db.obligations = [];
    expect(payerDelays().get('111')).toBe(7);
    expect(expectedPayDate(db.invoices[2])).toBe('2026-12-02');

    const f = forecast(30);
    const at = (date: string) => f.points.find((p) => p.date === date)!.balancePLN;
    expect(at('2026-12-01')).toBe(db.bank.balancePLN);
    expect(at('2026-12-02')).toBe(db.bank.balancePLN + 1230);
  });
});

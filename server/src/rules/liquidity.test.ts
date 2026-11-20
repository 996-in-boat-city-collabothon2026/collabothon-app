import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { creditLine, deposit, liquidity, paymentReminders } from './liquidity';

describe('liquidity rule (Anna)', () => {
  beforeEach(() => resetDb());

  it('seed data: credit line rounded up to 1 000 zł', () => {
    // Lowest point: −20 275 zł on 2026-12-20 (after EUR supplier, ZUS and PIT) → gap 35 275 → 36 000
    const [a] = creditLine();
    expect(a.kind).toBe('credit_line');
    expect(a.tier).toBe('NEEDS_APPROVAL');
    expect(a.amountPLN).toBe(36000);
    expect(a.dueDate).toBe('2026-12-20');
  });

  it('gap of 12 300 zł → credit line of 13 000 zł', () => {
    db.invoices = [];
    db.obligations = [{ id: 'o', kind: 'RENT', label: 'Rent', amountPLN: db.bank.balancePLN - 2700, dueDate: '2026-11-22', paid: false }];
    expect(creditLine()[0].amountPLN).toBe(13000); // balance 2 700, buffer 15 000
  });

  it('no gap → no credit line', () => {
    db.obligations = [];
    expect(creditLine()).toHaveLength(0);
  });

  it('one reminder per overdue sales invoice', () => {
    const r = paymentReminders();
    expect(r.map((a) => a.refId)).toEqual(['inv-s-001', 'inv-s-002']);
    expect(r[0].title).toContain('15 days late');
  });

  it('suggests a deposit only with a big surplus', () => {
    expect(deposit()).toHaveLength(0);
    db.obligations = [];
    db.invoices = [];
    db.bank.balancePLN = 50000;
    expect(deposit()[0].amountPLN).toBe(35000);
  });

  it('every action has numbers in why[]', () => {
    for (const a of liquidity()) for (const line of a.why) expect(line).toMatch(/\d/);
  });
});

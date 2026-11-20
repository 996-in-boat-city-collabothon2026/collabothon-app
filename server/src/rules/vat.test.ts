// Owner: Pair 2 (Person A). Tests for Marek's VAT rule. Each test starts from fresh seed data.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { vat } from './vat';
import { taxesDue } from './taxDue';

const vatOb = () => db.obligations.find((o) => o.id === 'ob-vat-10')!;

describe('vat rule (Marek)', () => {
  beforeEach(() => resetDb());

  it('seed data: one card for 14 230 zł due 25.11.2026', () => {
    const cards = vat();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      cfo: 'marek', kind: 'tax_payment', tier: 'NEEDS_APPROVAL', execution: 'simulated',
      amountPLN: 14230, dueDate: '2026-11-25', refId: 'ob-vat-10',
    });
    expect(cards[0].why[0]).toMatch(/VAT 14\s230,00\szł due on 2026-11-25 \(in 5 days\)/);
  });

  it('amount comes from the obligation, not from the (partial) invoices', () => {
    db.invoices = [];
    expect(vat()[0].amountPLN).toBe(14230);
  });

  it('paid VAT → no card', () => {
    vatOb().paid = true;
    expect(vat()).toHaveLength(0);
  });

  it('10-day window: 10 days → card, 11 days → no card', () => {
    db.shop.today = '2026-11-15';
    expect(vat()).toHaveLength(1);
    db.shop.today = '2026-11-14';
    expect(vat()).toHaveLength(0);
  });

  it('overdue VAT still shows, marked late', () => {
    db.shop.today = '2026-11-27';
    expect(vat()[0].why[0]).toContain('2 days late');
  });
});

describe('taxesDue (numbers for the tax alert)', () => {
  beforeEach(() => resetDb());

  it('seed, 5 days: only VAT 14 230 zł, not overdue', () => {
    const t = taxesDue(5);
    expect(t.obligations.map((o) => o.id)).toEqual(['ob-vat-10']);
    expect(t.totalPLN).toBe(14230);
    expect(t.overdue).toBe(false);
  });

  it('on 12.12.2026, 10 days: overdue VAT + ZUS + PIT = 22 130 zł, earliest first', () => {
    db.shop.today = '2026-12-12';
    const t = taxesDue(10);
    expect(t.obligations.map((o) => o.kind)).toEqual(['VAT', 'ZUS', 'PIT']);
    expect(t.totalPLN).toBe(22130);
    expect(t.overdue).toBe(true);
  });
});

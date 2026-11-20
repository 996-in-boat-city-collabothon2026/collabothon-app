// Owner: Pair 2 (Person A). Tests for Marek's VAT rule. Each test starts from fresh seed data.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { vat } from './vat';

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

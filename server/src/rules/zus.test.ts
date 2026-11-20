// Owner: Pair 2 (Person A). Tests for Marek's ZUS rule.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { zus } from './zus';

describe('zus rule (Marek)', () => {
  beforeEach(() => resetDb());

  it('seed date (30 days before the 20th) → no card', () => {
    expect(zus()).toHaveLength(0);
  });

  it('on 12.12.2026 → 5 800 zł due on the 20th', () => {
    db.shop.today = '2026-12-12';
    const cards = zus();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      cfo: 'marek', kind: 'tax_payment', tier: 'NEEDS_APPROVAL', amountPLN: 5800, dueDate: '2026-12-20', refId: 'ob-zus-11',
    });
  });

  it('10-day window: 10 days → card, 11 days → no card', () => {
    db.shop.today = '2026-12-10';
    expect(zus()).toHaveLength(1);
    db.shop.today = '2026-12-09';
    expect(zus()).toHaveLength(0);
  });

  it('paid ZUS → no card', () => {
    db.shop.today = '2026-12-12';
    db.obligations.find((o) => o.kind === 'ZUS')!.paid = true;
    expect(zus()).toHaveLength(0);
  });
});

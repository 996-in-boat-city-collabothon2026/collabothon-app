// Owner: Pair 2 (Person A). Tests for Marek's PIT rule.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { pit } from './pit';

describe('pit rule (Marek)', () => {
  beforeEach(() => resetDb());

  it('seed date (30 days before the 20th) → no card', () => {
    expect(pit()).toHaveLength(0);
  });

  it('on 12.12.2026 → 2 100 zł due on the 20th', () => {
    db.shop.today = '2026-12-12';
    const cards = pit();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      cfo: 'marek', kind: 'tax_payment', tier: 'NEEDS_APPROVAL', amountPLN: 2100, dueDate: '2026-12-20', refId: 'ob-pit-11',
    });
  });

  it('10-day window: 10 days → card, 11 days → no card', () => {
    db.shop.today = '2026-12-10';
    expect(pit()).toHaveLength(1);
    db.shop.today = '2026-12-09';
    expect(pit()).toHaveLength(0);
  });

  it('paid PIT → no card', () => {
    db.shop.today = '2026-12-12';
    db.obligations.find((o) => o.kind === 'PIT')!.paid = true;
    expect(pit()).toHaveLength(0);
  });
});

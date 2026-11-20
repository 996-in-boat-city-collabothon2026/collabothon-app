// Owner: Pair 2 (Person A). Tests for Kasia's FX rule. Each test starts from fresh seed data.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { toPLN } from '../domain/fx';
import { exposureAfterPaying, fx, fxExposures } from './fx';

describe('fx rule (Kasia)', () => {
  beforeEach(() => resetDb());

  it('seed data: one forward contract for 1 500 EUR, plus two ideas', () => {
    const eur = fxExposures().find((e) => e.currency === 'EUR');
    expect(eur?.net).toBe(1500); // 3 600 EUR to Krause − 2 100 EUR from Weber
    expect(eur?.shockPLN).toBe(320.25); // 1 500 × 4,27 × 5%
    expect(eur?.trend).toEqual({ from: 4.22, to: 4.27, weeksUp: 4 });

    const actions = fx();
    const hedges = actions.filter((a) => a.kind === 'fx_hedge');
    expect(hedges).toHaveLength(1);
    expect(hedges[0].tier).toBe('NEEDS_APPROVAL');
    expect(hedges[0].amountPLN).toBe(toPLN(1500, 'EUR'));
    expect(hedges[0].title).toContain('EUR');
    expect(actions.filter((a) => a.tier === 'RECOMMENDED').map((a) => a.kind)).toEqual(['info']); // natural hedge
    expect(actions.find((a) => a.kind === 'supplier_payment')!.tier).toBe('NEEDS_APPROVAL'); // pay early moves money
  });

  it('no foreign invoices: no actions', () => {
    db.invoices = db.invoices.filter((i) => !i.currency || i.currency === 'PLN');
    expect(fx()).toHaveLength(0);
  });

  it('small exposure below the threshold: no hedge', () => {
    const krause = db.invoices.find((i) => i.direction === 'purchase' && i.currency === 'EUR')!;
    krause.lines[0].unitNet = 2500; // net exposure 400 EUR → shock ≈ 85 zł
    expect(fx().filter((a) => a.kind === 'fx_hedge')).toHaveLength(0);
  });
});

describe('"Pay supplier early" shows the risk before and after paying (Kasia)', () => {
  beforeEach(() => resetDb());

  it('seed Krause: 1 500 EUR to pay (320,25 zł) → after 3 600 EUR, 2 100 EUR to receive (448,35 zł)', () => {
    const eur = fxExposures().find((e) => e.currency === 'EUR')!;
    const krause = db.invoices.find((i) => i.id === 'inv-p-002')!;
    expect(eur.net).toBe(1500);
    expect(eur.shockPLN).toBe(320.25);
    expect(exposureAfterPaying(eur, krause)).toEqual({ net: -2100, shockPLN: 448.35 });
  });

  it('the card needs approval, says the risk goes up, and names the right direction', () => {
    const card = fx().find((a) => a.kind === 'supplier_payment')!;
    expect(card.tier).toBe('NEEDS_APPROVAL');
    expect(card.refId).toBe('inv-p-002');
    expect(card.title).toMatch(/320,25\szł → 448,35\szł/);
    const why = card.why.join('\n');
    expect(why).toMatch(/Now: 1500 EUR to pay, a 5% EUR move costs 320,25\szł/);
    expect(why).toMatch(/After paying: 2100 EUR to receive, a 5% EUR move costs 448,35\szł/);
    expect(why).toMatch(/risk BIGGER, by 128,10\szł/);
  });

  it('when paying reduces the risk, the card says so', () => {
    db.invoices = db.invoices.filter((i) => i.id !== 'inv-s-005'); // no EUR sale: 3 600 EUR to pay → 0 after
    const why = fx().find((a) => a.kind === 'supplier_payment')!.why.join('\n');
    expect(why).toContain('After paying: nothing open in EUR');
    expect(why).toMatch(/risk smaller/);
    expect(why).not.toMatch(/BIGGER/);
  });

  it('building the card changes nothing: balance, invoices and obligations stay as they were', () => {
    const before = JSON.stringify([db.bank, db.invoices, db.obligations]);
    fx();
    expect(JSON.stringify([db.bank, db.invoices, db.obligations])).toBe(before);
  });
});

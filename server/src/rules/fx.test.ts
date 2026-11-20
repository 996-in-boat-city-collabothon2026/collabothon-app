// Owner: Pair 2 (Person A). Tests for Kasia's FX rule. Each test starts from fresh seed data.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { toPLN } from '../domain/fx';
import { fx, fxExposures } from './fx';

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
    expect(actions.filter((a) => a.tier === 'RECOMMENDED')).toHaveLength(2);
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

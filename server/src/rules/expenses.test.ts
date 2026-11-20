import { beforeEach, describe, expect, it } from 'vitest';
import type { Expense } from '@cfo/shared';
import { db, resetDb } from '../domain/store';
import { expenses, totalsBetween } from './expenses';
import { addDays, lastDays } from '../domain/money';

const ex = (date: string, category: Expense['category'], amountPLN: number) =>
  ({ id: `${date}-${category}`, date, category, label: category, amountPLN }) as Expense;

describe('expenses rule (Tomasz)', () => {
  beforeEach(() => resetDb());

  it('seed data: parts is the biggest cost you can change (payroll is skipped)', () => {
    // 3 150 + 8 400 + 6 300 = 17 850 zł; no data for the 30 days before
    const [a] = expenses();
    expect(a.kind).toBe('cost_cut');
    expect(a.tier).toBe('RECOMMENDED');
    expect(a.amountPLN).toBe(17850);
    expect(a.title).toContain('Parts');
  });

  it('shows the % change vs the 30 days before', () => {
    db.expenses = [ex('2026-10-10', 'parts', 7950), ex('2026-11-15', 'parts', 9400), ex('2026-11-15', 'payroll', 21000)];
    const [a] = expenses();
    expect(a.title).toContain('Parts up 18%');
    expect(a.why.join(' ')).toMatch(/7\s?950,00\szł/);
  });

  it('spending went down → no action', () => {
    db.expenses = [ex('2026-10-10', 'parts', 9000), ex('2026-11-15', 'parts', 5000)];
    expect(expenses()).toHaveLength(0);
  });

  it('only fixed costs → no action', () => {
    db.expenses = [ex('2026-11-15', 'payroll', 21000), ex('2026-11-15', 'rent', 6500)];
    expect(expenses()).toHaveLength(0);
  });
});

describe('expenses periods: exactly 30 calendar dates each', () => {
  beforeEach(() => resetDb());

  // 100 zł of parts every day from today (day 0) back to day −60.
  const daily = () =>
    Array.from({ length: 61 }, (_, n) => ex(addDays('2026-11-20', -n), 'parts', 100)).map((e, n) => ({ ...e, id: `d${n}` }));

  it('100 zł a day → 3 000 zł in both periods, so no "Parts up 3%" card', () => {
    db.expenses = daily();
    const cur = lastDays('2026-11-20', 30);
    const prev = lastDays('2026-11-20', 30, 30);
    expect(totalsBetween(cur.from, cur.to).get('parts')).toBe(3000);
    expect(totalsBetween(prev.from, prev.to).get('parts')).toBe(3000);
    expect(expenses()).toEqual([]);
  });

  it('day −30 belongs only to the previous period, day −60 to neither', () => {
    const cur = lastDays('2026-11-20', 30);
    const prev = lastDays('2026-11-20', 30, 30);
    db.expenses = [ex(addDays('2026-11-20', -30), 'parts', 500)];
    expect(totalsBetween(cur.from, cur.to).get('parts')).toBeUndefined();
    expect(totalsBetween(prev.from, prev.to).get('parts')).toBe(500);
    db.expenses = [ex(addDays('2026-11-20', -60), 'parts', 500)];
    expect(totalsBetween(cur.from, cur.to).size + totalsBetween(prev.from, prev.to).size).toBe(0);
  });

  it('the tip names the measured spend that triggered it', () => {
    const [a] = expenses(); // seed: parts 17 850 zł
    const tip = a.why.at(-1)!;
    expect(tip).toMatch(/17\s850,00\szł/);
    expect(tip).toContain('wholesalers');
  });
});

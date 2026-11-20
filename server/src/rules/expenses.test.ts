import { beforeEach, describe, expect, it } from 'vitest';
import type { Expense } from '@cfo/shared';
import { db, resetDb } from '../domain/store';
import { expenses } from './expenses';

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

// Example test — Pair 2: add one test file per rule (rules/*.test.ts).
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, invoiceGross } from './money';
import type { Invoice } from '@cfo/shared';

describe('money helpers', () => {
  it('computes gross with 23% VAT', () => {
    const inv = { lines: [{ name: 'x', kind: 'part', qty: 2, unitNetPLN: 100, vatRate: 23 }] } as Invoice;
    expect(invoiceGross(inv)).toBe(246);
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-11-20', '2026-11-25')).toBe(5);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

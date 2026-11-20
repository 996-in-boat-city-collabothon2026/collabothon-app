// Example test — Pair 2: add one test file per rule (rules/*.test.ts).
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, invoiceGross, lastDays } from './money';
import type { Invoice } from '@cfo/shared';

describe('money helpers', () => {
  it('computes gross with 23% VAT', () => {
    const inv = { lines: [{ name: 'x', kind: 'part', qty: 2, unitNet: 100, vatRate: 23 }] } as Invoice;
    expect(invoiceGross(inv)).toBe(246);
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-11-20', '2026-11-25')).toBe(5);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('lastDays (exactly N calendar dates, both ends included)', () => {
  it('last 30 days = [today−29, today], the 30 before = [today−59, today−30]', () => {
    expect(lastDays('2026-11-20', 30)).toEqual({ from: '2026-10-22', to: '2026-11-20' });
    expect(lastDays('2026-11-20', 30, 30)).toEqual({ from: '2026-09-22', to: '2026-10-21' });
    const { from, to } = lastDays('2026-11-20', 30);
    expect(daysBetween(from, to) + 1).toBe(30);
  });
});

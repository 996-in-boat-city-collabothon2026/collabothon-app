import { beforeEach, describe, expect, it } from 'vitest';
import type { RepairOrder } from '@cfo/shared';
import { db, resetDb } from '../domain/store';
import { labourUnderRate, margin, partsMarkup } from './margin';

const order = (extra: Partial<RepairOrder>) =>
  ({
    id: 'ro', date: '2026-11-15', car: 'Test Car', customer: 'X',
    partsCostPLN: 1000, partsPricePLN: 1250, labourHours: 2, labourBilledPLN: 400, ...extra,
  }) as RepairOrder;

describe('margin rule (Tomasz)', () => {
  beforeEach(() => resetDb());

  it('seed data: 3 orders under the labour rate, 1 700 zł missing', () => {
    // Passat 14 h → 2 800 vs 2 000, Transit 11 h → 2 200 vs 1 600, Astra 6 h → 1 200 vs 900
    const [a] = labourUnderRate();
    expect(a.kind).toBe('pricing');
    expect(a.tier).toBe('RECOMMENDED');
    expect(a.amountPLN).toBe(1700);
    expect(a.why).toHaveLength(4); // the rate + 3 cars
  });

  it('one under-billed order → one pricing action with the right missing amount', () => {
    db.repairOrders = [order({ labourHours: 3, labourBilledPLN: 450 })]; // 3 × 200 = 600 → 150 missing
    const r = labourUnderRate();
    expect(r).toHaveLength(1);
    expect(r[0].amountPLN).toBe(150);
    expect(r[0].why[1]).toContain('Test Car');
  });

  it('exactly on target markup is fine, below it is flagged', () => {
    db.repairOrders = [order({ id: 'ok' }), order({ id: 'low', car: 'Cheap Car', partsPricePLN: 1100 })];
    const [a] = partsMarkup();
    expect(a.amountPLN).toBe(150); // 1 000 × 1,25 − 1 100
    expect(a.why.join(' ')).toContain('Cheap Car');
    expect(a.why.join(' ')).not.toContain('Test Car');
  });

  it('old orders (more than 30 days ago) are ignored', () => {
    db.repairOrders = [order({ date: '2026-09-01', labourBilledPLN: 0, partsPricePLN: 0 })];
    expect(margin()).toHaveLength(0);
  });
});

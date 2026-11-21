// Owner: Pair 2. Rebuild M2 (docs/PAIR2-REBUILD.md): each CFO's conclusion is split into points with an id.
// The summary (the safe fallback) is the core points joined; details are extra points the owner may ask about.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CfoId } from '@cfo/shared';
import { db, resetDb } from '../domain/store';
import { settlePayment } from '../domain/settle';
import { explain } from './explain';
import { cfoFacts, summaryOf } from './facts';

const CFOS: CfoId[] = ['anna', 'kasia', 'marek', 'tomasz'];
const sp = (s: string) => s.replace(/ /g, ' '); // fmtPLN uses no-break spaces
const ids = (cfo: CfoId, core: boolean) => cfoFacts(cfo).points.filter((p) => p.core === core).map((p) => p.id);
const text = (cfo: CfoId, id: string) => sp(cfoFacts(cfo).points.find((p) => p.id === id)!.text);

describe('facts as points (seed, 2026-11-20)', () => {
  beforeEach(() => resetDb());

  it('core points in order; the summary is exactly the core points joined', () => {
    expect(ids('anna', true)).toEqual(['gap', 'reminders', 'credit']);
    expect(ids('kasia', true)).toEqual(['fx-EUR', 'hedge-EUR']);
    expect(ids('marek', true)).toEqual(['next-tax', 'ksef']);
    expect(ids('tomasz', true)).toEqual(['labour', 'markup']);
    for (const cfo of CFOS) {
      const f = cfoFacts(cfo);
      expect(f.summary).toBe(summaryOf(f.points));
      expect(new Set(f.points.map((p) => p.id)).size).toBe(f.points.length); // ids are unique
    }
  });

  it('details: balance, each late customer, each tax, the KSeF reason, the value in złoty, the rate trend, each car', () => {
    expect(ids('anna', false)).toEqual(['balance', 'late-inv-s-001', 'late-inv-s-002']);
    expect(text('anna', 'balance')).toBe('Your bank balance today is 38 400,00 zł.');
    expect(text('anna', 'late-inv-s-001')).toBe('FlotaTrans Sp. z o.o. owes you 12 300,00 zł and is 15 days late.');
    expect(text('anna', 'late-inv-s-002')).toBe('Kurier Express Kraków owes you 7380,00 zł and is 9 days late.');
    expect(text('kasia', 'net-EUR')).toBe('Your 1500 EUR to pay is 6405,00 zł at today\'s NBP rate of 4,27 zł.');
    expect(text('kasia', 'rate-EUR')).toBe('The NBP EUR rate is 4,27 zł today; 4 weeks ago it was 4,22 zł (up 4 weeks in a row).');
    expect(text('marek', 'ksef-inv-s-003')).toBe('KSeF rejected invoice FV/2026/11/009 for Jan Kowalski – JK Budownictwo because the buyer\'s tax number (NIP) is wrong, it must have 10 digits.');
    expect(cfoFacts('marek').points.filter((p) => p.id.startsWith('tax-')).map((p) => sp(p.text))).toEqual([
      'VAT: 14 230,00 zł, due November 25, 2026 (in 5 days), still unpaid.',
      'ZUS: 5800,00 zł, due December 20, 2026 (in 30 days), still unpaid.',
      'PIT: 2100,00 zł, due December 20, 2026 (in 30 days), still unpaid.',
    ]);
    expect(text('tomasz', 'top-cost')).toBe('You spend most on parts: 17 850,00 zł in 30 days. Ask other suppliers for a quote.');
    expect(cfoFacts('tomasz').points.filter((p) => p.id.startsWith('car-')).map((p) => sp(p.text))).toEqual([
      'VW Passat 2015: 800,00 zł of labour is missing.',
      'Ford Transit 2018: 600,00 zł of labour is missing.',
      'Opel Astra 2016: 300,00 zł of labour is missing.',
    ]);
  });

  it('critical = a real risk now: the cash gap, the FX loss above the threshold, VAT in 5 days', () => {
    const critical = (cfo: CfoId) => cfoFacts(cfo).points.filter((p) => p.critical).map((p) => p.id);
    expect(critical('anna')).toEqual(['gap']);
    expect(critical('kasia')).toEqual(['fx-EUR']);
    expect(critical('marek')).toEqual(['next-tax']);
    expect(critical('tomasz')).toEqual([]);
  });

  it('every number in every point is a number of the same CFO\'s fact lines (no point computes anything new)', () => {
    // "-20 275,00" → "-20275,00"; dates are compared as written ("December 20, 2026" in both).
    const numbersOf = (s: string) => [...s.matchAll(/[-−]?\d[\d\s\u00a0.,]*\d|\d/g)].map((m) => m[0].replace(/[\s\u00a0]/g, '').replace(/[.,]$/, ''));
    for (const cfo of CFOS) {
      const f = cfoFacts(cfo);
      const known = new Set(numbersOf(f.lines.join('\n')));
      for (const p of f.points) for (const n of numbersOf(p.text)) expect(known.has(n), `${cfo}/${p.id}: ${n}`).toBe(true);
    }
  });
});

describe('facts as points in other data states', () => {
  beforeEach(() => resetDb());

  it('VAT paid: the next tax is ZUS in 30 days, not critical', () => {
    const vat = db.obligations.find((o) => o.kind === 'VAT')!;
    settlePayment(vat.amountPLN, vat.id);
    expect(text('marek', 'next-tax')).toMatch(/^Next deadline: ZUS 5800,00 zł, due December 20, 2026/);
    expect(cfoFacts('marek').points.find((p) => p.id === 'next-tax')!.critical).toBe(false);
  });

  it('no late customers: the credit line no longer says "If that is not enough"', () => {
    for (const i of db.invoices) if (i.direction === 'sales' && i.dueDate < db.shop.today) i.paid = true;
    expect(ids('anna', true)).toEqual(['gap', 'credit']);
    expect(text('anna', 'credit')).toBe('A credit line of 36 000,00 zł would cover the gap.');
  });

  it('enough cash and no foreign invoices: one calm core point each, nothing critical', () => {
    db.bank.balancePLN += 60000;
    db.invoices = db.invoices.filter((i) => !i.currency || i.currency === 'PLN');
    expect(ids('anna', true)).toEqual(['cash']);
    expect(ids('kasia', true)).toEqual(['no-fx']);
    expect(cfoFacts('anna').points.some((p) => p.critical)).toBe(false);
  });

  it('no labour or markup gaps: the biggest cost becomes the conclusion', () => {
    for (const o of db.repairOrders) {
      o.labourBilledPLN = o.labourHours * db.shop.labourRatePLN;
      o.partsPricePLN = o.partsCostPLN * 2;
    }
    expect(ids('tomasz', true)).toEqual(['top-cost']);
    expect(cfoFacts('tomasz').summary).toBe(cfoFacts('tomasz').points[0].text);
  });

  it('two currencies: each FX card explains only its own currency (review of PR #6)', () => {
    const base = db.invoices.find((i) => i.currency === 'EUR' && i.direction === 'purchase')!;
    db.invoices.push({ ...structuredClone(base), id: 'inv-usd-1', number: 'US/1', currency: 'USD' });
    const eur = sp(explain({ cfo: 'kasia', kind: 'fx_hedge', refId: base.id }));
    const usd = sp(explain({ cfo: 'kasia', kind: 'fx_hedge', refId: 'inv-usd-1' }));
    expect(eur).toMatch(/^You have 1500 EUR to pay\./);
    expect(eur).not.toContain('USD');
    expect(usd).toMatch(/^You have 3600 USD to pay\./);
    expect(usd).not.toContain('EUR');
    expect(usd).toMatch(/You decide, everything is simulated\.$/);
  });
});

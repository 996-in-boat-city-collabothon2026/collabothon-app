// Owner: Pair 2 (Person A). Tests for Marek's KSeF rule.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { ksef } from './ksef';

const inv = (id: string) => db.invoices.find((i) => i.id === id)!;

describe('ksef rule (Marek)', () => {
  beforeEach(() => resetDb());

  it('seed data: rejected FV/2026/11/009 → ANALYSED re-validate + RECOMMENDED fix and resend', () => {
    const cards = ksef();
    expect(cards).toHaveLength(2); // purchase invoices without UPO are ignored
    const [analysed, fix] = cards;
    expect(analysed).toMatchObject({ kind: 'ksef_revalidate', tier: 'ANALYSED', refId: 'inv-s-003' });
    expect(analysed.title).toContain('FV/2026/11/009');
    expect(fix).toMatchObject({ kind: 'ksef_fix', tier: 'RECOMMENDED', refId: 'inv-s-003' });
    expect(fix.title).toBe('Fix and resend KSeF invoice FV/2026/11/009');
    expect(fix.why[0]).toContain('Nieprawidłowy NIP nabywcy (Podmiot2): wymagane 10 cyfr');
  });

  it('accepted sales invoice without UPO → one "Download the UPO" card', () => {
    inv('inv-s-003').ksef = { status: 'accepted', ksefNumber: 'X-1' };
    const cards = ksef();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'ksef_fix', tier: 'RECOMMENDED', refId: 'inv-s-003' });
    expect(cards[0].title).toContain('UPO');
  });

  it('accepted purchase invoice without UPO, drafts and invoices with UPO → no cards', () => {
    inv('inv-s-003').ksef = { status: 'draft' };
    expect(inv('inv-p-001').ksef.upo).toBeUndefined();
    expect(ksef()).toHaveLength(0);
  });
});

describe('ksef why[]: every line names the invoice and its amount', () => {
  beforeEach(() => resetDb());

  it('seed: lines carry FV/2026/11/009 and 4 920,00 zł', () => {
    for (const card of ksef()) {
      for (const line of card.why) {
        expect(line).toContain('FV/2026/11/009');
        expect(line).toMatch(/4\s?920,00\szł/);
      }
    }
  });

  it.each([undefined, '', '   '])('missing or empty rejection reason (%j) still names the invoice and amount', (reason) => {
    inv('inv-s-003').ksef = { status: 'rejected', rejectionReason: reason };
    const fix = ksef().find((a) => a.kind === 'ksef_fix')!;
    expect(fix.why[0]).toMatch(/FV\/2026\/11\/009 \(4\s?920,00\szł\): KSeF gave no reason/);
  });

  it('foreign invoices show their own currency code', () => {
    inv('inv-s-005').ksef = { status: 'rejected', rejectionReason: 'Test' };
    const lines = ksef().filter((a) => a.refId === 'inv-s-005').flatMap((a) => a.why);
    expect(lines.every((l) => /2\s?100,00\sEUR/.test(l))).toBe(true);
  });
});

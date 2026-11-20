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

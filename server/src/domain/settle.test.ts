// Owner: Pair 2. Money effects of approved cards (simulated): balance, obligation and invoice stay consistent.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from './store';
import { openCreditLine, settlePayment } from './settle';

const ob = (id: string) => db.obligations.find((o) => o.id === id)!;
const inv = (id: string) => db.invoices.find((i) => i.id === id)!;

describe('settle (simulated money effects)', () => {
  beforeEach(() => resetDb());

  it('paying an obligation by its id: balance down, obligation paid', () => {
    settlePayment(14230, 'ob-vat-10');
    expect(db.bank.balancePLN).toBe(24170);
    expect(ob('ob-vat-10').paid).toBe(true);
  });

  it('paying by the purchase invoice id settles both the invoice and its obligation', () => {
    settlePayment(9800, 'inv-p-001');
    expect(db.bank.balancePLN).toBe(28600);
    expect(ob('ob-sup-1').paid).toBe(true);
    expect(inv('inv-p-001').paid).toBe(true);
  });

  it('credit line adds the money to the balance', () => {
    openCreditLine(36000);
    expect(db.bank.balancePLN).toBe(74400);
  });
});

// Owner: Pair 2. Money effects of an approved card (all SIMULATED). Routes only check approval and call these.
import { db } from './store';
import { round2 } from './money';

/**
 * Pay an obligation (or the purchase invoice behind it): balance − amount, obligation and invoice marked paid.
 * `refId` can be the obligation id or the invoice id (Kasia's "pay early" card points at the invoice).
 */
export function settlePayment(amountPLN: number, refId?: string): void {
  db.bank.balancePLN = round2(db.bank.balancePLN - amountPLN);
  const ob = refId ? db.obligations.find((o) => o.id === refId || o.invoiceId === refId) : undefined;
  if (ob) ob.paid = true;
  const inv = db.invoices.find((i) => i.id === (ob?.invoiceId ?? refId));
  if (inv) inv.paid = true;
}

/** Demo: the bank grants the credit line at once and the money is available on the account. */
export function openCreditLine(amountPLN: number): void {
  db.bank.balancePLN = round2(db.bank.balancePLN + amountPLN);
}

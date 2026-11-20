// Owner: Pair 3. SIMULATED KSeF: no real government API is called.
// send() → "processing" now → after ~2 s "accepted" (KSeF number + UPO) or "rejected" (reason).
import type { Invoice } from '@cfo/shared';
import { db, logActivity, nowIso } from '../domain/store';
import { nipError } from './nip';

const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();

/** Basic checks a real KSeF would also do. Pair 3: add more (dates, totals). */
export function validate(inv: Invoice): string | null {
  const nip = nipError(inv.counterparty.nip);
  if (nip) return nip;
  if (inv.lines.length === 0) return 'Faktura bez pozycji (FaWiersz)';
  return null;
}

export function sendToKsef(inv: Invoice): void {
  inv.ksef = { status: 'processing' };
  setTimeout(() => {
    const error = validate(inv);
    if (error) {
      inv.ksef = { status: 'rejected', rejectionReason: error };
      logActivity('marek', `KSeF rejected ${inv.number}: ${error}`, true);
      return;
    }
    const ksefNumber = `${db.shop.nip}-${db.shop.today.replace(/-/g, '')}-${hex(12)}-${hex(2)}`;
    inv.ksef = {
      status: 'accepted',
      ksefNumber,
      upo: { ksefNumber, referenceNumber: `${db.shop.today.replace(/-/g, '')}-SE-${hex(10)}-${hex(2)}`, receivedAt: nowIso() },
    };
    logActivity('marek', `KSeF accepted ${inv.number} (UPO received)`, true);
  }, 2000);
}

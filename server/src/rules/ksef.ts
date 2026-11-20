// Owner: Pair 2 (Person A). Marek ⚪: KSeF problems — rejected invoices and missing UPO receipts.
import type { Invoice } from '@cfo/shared';
import { db } from '../domain/store';
import { fmtPLN, invoiceGross } from '../domain/money';
import type { DraftAction, Rule } from './index';

/** Gross in the invoice's own currency ("4920,00 zł", "2100,00 EUR"), so no FX rate is involved. */
const fmtGross = (i: Invoice) =>
  !i.currency || i.currency === 'PLN'
    ? fmtPLN(invoiceGross(i))
    : new Intl.NumberFormat('pl-PL', { style: 'currency', currency: i.currency, currencyDisplay: 'code' }).format(invoiceGross(i));

/** Rejected invoice → re-validated automatically (safe) + advice to fix the data and resend. */
function rejected(i: Invoice): DraftAction[] {
  const reason = i.ksef.rejectionReason?.trim() || 'KSeF gave no reason';
  const inv = `${i.number} (${fmtGross(i)})`; // every line names the invoice and its amount
  return [
    {
      cfo: 'marek',
      kind: 'ksef_revalidate',
      tier: 'ANALYSED',
      execution: 'simulated',
      title: `Re-validated KSeF invoice ${i.number}`,
      why: [`KSeF rejected invoice ${inv}: ${reason}`, `Invoice ${inv} is not issued until KSeF accepts it`],
      refId: i.id,
    },
    {
      cfo: 'marek',
      kind: 'ksef_fix',
      tier: 'RECOMMENDED',
      execution: 'simulated',
      title: `Fix and resend KSeF invoice ${i.number}`,
      why: [
        `Rejection reason for invoice ${inv}: ${reason}`,
        `Invoice ${inv} to ${i.counterparty.name}, due on ${i.dueDate}: fix it and send it again`,
      ],
      refId: i.id,
    },
  ];
}

/** Our own (sales) invoice accepted by KSeF but no UPO on file → download the official receipt. */
function missingUpo(i: Invoice): DraftAction {
  return {
    cfo: 'marek',
    kind: 'ksef_fix',
    tier: 'RECOMMENDED',
    execution: 'simulated',
    title: `Download the UPO for invoice ${i.number}`,
    why: [
      `KSeF accepted ${i.number} (KSeF no. ${i.ksef.ksefNumber ?? 'unknown'}) but there is no UPO`,
      `The UPO is the official proof that invoice ${i.number} (${fmtGross(i)}) was received`,
    ],
    refId: i.id,
  };
}

export const ksef: Rule = () => [
  ...db.invoices.filter((i) => i.ksef.status === 'rejected').flatMap(rejected),
  ...db.invoices.filter((i) => i.direction === 'sales' && i.ksef.status === 'accepted' && !i.ksef.upo).map(missingUpo),
];

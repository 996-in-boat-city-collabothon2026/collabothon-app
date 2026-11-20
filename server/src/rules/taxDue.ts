// Owner: Pair 2 (Person A). Marek ⚪: shared logic for VAT, ZUS and PIT payments.
// The amount and due date come from the unpaid obligation (db.obligations), never from invoices:
// the seed invoices cover only part of the month, so they cannot give the real tax amount.
import type { Obligation, ObligationKind } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN, round2 } from '../domain/money';
import type { DraftAction } from './index';

/** Show a payment card when the deadline is this many days away or closer (overdue included). */
export const TAX_WINDOW_DAYS = 10;

type TaxKind = Extract<ObligationKind, 'VAT' | 'ZUS' | 'PIT'>;

const DEADLINE_NOTE: Record<TaxKind, string> = {
  VAT: 'VAT and JPK_V7M are due by the 25th of the next month',
  ZUS: 'ZUS is due by the 20th of the next month',
  PIT: 'PIT advance is due by the 20th of the next month',
};

const TAX_KINDS: TaxKind[] = ['VAT', 'ZUS', 'PIT'];

/** Unpaid VAT / ZUS / PIT due within `withinDays` (overdue included), earliest first, with their total. */
export function taxesDue(withinDays: number): { obligations: Obligation[]; totalPLN: number; overdue: boolean } {
  const today = db.shop.today;
  const obligations = db.obligations
    .filter((o) => !o.paid && (TAX_KINDS as string[]).includes(o.kind) && daysBetween(today, o.dueDate) <= withinDays)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    obligations,
    totalPLN: round2(obligations.reduce((s, o) => s + o.amountPLN, 0)),
    overdue: obligations.some((o) => daysBetween(today, o.dueDate) < 0),
  };
}

const when = (days: number) => (days > 0 ? `in ${days} days` : days === 0 ? 'today' : `${-days} days late`);

/** Unpaid obligations of one tax kind due within the window → NEEDS_APPROVAL tax_payment. */
export function taxPayments(kind: TaxKind): DraftAction[] {
  const today = db.shop.today;
  return taxesDue(TAX_WINDOW_DAYS)
    .obligations.filter((o) => o.kind === kind)
    .map((o): DraftAction => ({
      cfo: 'marek',
      kind: 'tax_payment',
      tier: 'NEEDS_APPROVAL',
      execution: 'simulated',
      title: `Pay ${o.label}: ${fmtPLN(o.amountPLN)}`,
      why: [`${kind} ${fmtPLN(o.amountPLN)} due on ${o.dueDate} (${when(daysBetween(today, o.dueDate))})`, DEADLINE_NOTE[kind]],
      amountPLN: o.amountPLN,
      dueDate: o.dueDate,
      refId: o.id, // approving marks this obligation paid
    }));
}

// Owner: Pair 2. Every rule returns draft actions. The autopilot adds ids/status and de-duplicates.
// STARTER rules below show the pattern. Pair 2: split into vat.ts, zus.ts, pit.ts, ksef.ts, margin.ts, growth.ts.
import type { Action } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN } from '../domain/money';
import { fx } from './fx';
import { liquidity } from './liquidity';
import { expenses } from './expenses';
import { margin } from './margin';

export type DraftAction = Omit<Action, 'id' | 'status' | 'createdAt'>;
export type Rule = () => DraftAction[];

/** Marek: tax/ZUS deadlines in the next 10 days → needs approval. */
const deadlines: Rule = () =>
  db.obligations
    .filter((o) => !o.paid && ['VAT', 'ZUS', 'PIT'].includes(o.kind) && daysBetween(db.shop.today, o.dueDate) <= 10)
    .map((o): DraftAction => ({
      cfo: 'marek',
      kind: 'tax_payment',
      tier: 'NEEDS_APPROVAL',
      execution: 'simulated',
      title: `Pay ${o.label}`,
      why: [`${fmtPLN(o.amountPLN)} due on ${o.dueDate} (in ${daysBetween(db.shop.today, o.dueDate)} days)`],
      amountPLN: o.amountPLN,
      dueDate: o.dueDate,
      refId: o.id,
    }));

/** Marek: KSeF rejected invoices → re-validate automatically (safe, simulated). */
const ksefRejected: Rule = () =>
  db.invoices
    .filter((i) => i.ksef.status === 'rejected')
    .map((i): DraftAction => ({
      cfo: 'marek',
      kind: 'ksef_revalidate',
      tier: 'ANALYSED',
      execution: 'simulated',
      title: `Re-validated KSeF invoice ${i.number}`,
      why: [`KSeF rejected it: ${i.ksef.rejectionReason ?? 'unknown reason'}`, 'Fix the buyer data and resend.'],
      refId: i.id,
    }));

export const RULES: Rule[] = [deadlines, ksefRejected, liquidity, fx, expenses, margin];

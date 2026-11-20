// Owner: Pair 2 (Anna ⚫). Liquidity: keep the balance above the safety buffer, chase overdue customers.
import type { Invoice } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN } from '../domain/money';
import { convertible, invoiceGrossPLN } from '../domain/fx';
import { forecast } from './cashflow';
import type { DraftAction, Rule } from './index';

/** Lowest point of the 30-day forecast below the buffer → credit line, gap rounded UP to 1 000 zł. */
export function creditLine(): DraftAction[] {
  const f = forecast(30);
  if (f.lowest.balancePLN >= f.bufferPLN) return [];
  const need = Math.ceil((f.bufferPLN - f.lowest.balancePLN) / 1000) * 1000;
  return [
    {
      cfo: 'anna',
      kind: 'credit_line',
      tier: 'NEEDS_APPROVAL',
      execution: 'simulated',
      title: `Open a credit line of ${fmtPLN(need)}`,
      why: [
        `Balance falls to ${fmtPLN(f.lowest.balancePLN)} on ${f.lowest.date}`,
        `Your safety buffer is ${fmtPLN(f.bufferPLN)}, so you are ${fmtPLN(f.bufferPLN - f.lowest.balancePLN)} short`,
      ],
      amountPLN: need,
      dueDate: f.lowest.date,
    },
  ];
}

/** Each overdue, unpaid sales invoice → reminder e-mail (contacts a customer, so it needs approval). */
export function paymentReminders(): DraftAction[] {
  const today = db.shop.today;
  return db.invoices
    .filter((i) => i.direction === 'sales' && !i.paid && daysBetween(i.dueDate, today) > 0 && convertible(i))
    .map((i: Invoice): DraftAction => {
      const late = daysBetween(i.dueDate, today);
      const amount = invoiceGrossPLN(i);
      return {
        cfo: 'anna',
        kind: 'payment_reminder',
        tier: 'NEEDS_APPROVAL',
        execution: 'simulated',
        title: `Send a reminder to ${i.counterparty.name} for ${fmtPLN(amount)}, ${late} days late`,
        why: [`Invoice ${i.number} for ${fmtPLN(amount)} was due on ${i.dueDate} (${late} days ago)`],
        amountPLN: amount,
        dueDate: i.dueDate,
        refId: i.id,
      };
    });
}

/** Balance stays at least 2× the buffer for 60 days → suggest a term deposit for the surplus. */
export function deposit(): DraftAction[] {
  const f = forecast(60);
  if (f.lowest.balancePLN < 2 * f.bufferPLN) return [];
  const spare = Math.floor((f.lowest.balancePLN - f.bufferPLN) / 1000) * 1000;
  return [
    {
      cfo: 'anna',
      kind: 'deposit',
      tier: 'RECOMMENDED',
      execution: 'simulated',
      title: `Put ${fmtPLN(spare)} on a term deposit`,
      why: [
        `Lowest balance in 60 days is ${fmtPLN(f.lowest.balancePLN)} on ${f.lowest.date}`,
        `That is well above your safety buffer of ${fmtPLN(f.bufferPLN)}`,
      ],
      amountPLN: spare,
    },
  ];
}

export const liquidity: Rule = () => [...creditLine(), ...paymentReminders(), ...deposit()];

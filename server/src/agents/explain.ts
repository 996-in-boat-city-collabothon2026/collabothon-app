// Owner: Pair 2 (Person A). A ready English explanation for each approval card, built only from rule numbers.
// Live test (Llama 3.2 3B): free explanations said the balance was "too high", wrote reminders TO the customer and
// started by addressing "the shop owner". So the card shows this rule text, no model call.
import type { Action } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN } from '../domain/money';
import { forecast } from '../rules/cashflow';
import { exposureAfterPaying, fxExposures } from '../rules/fx';
import { taxLabelEn } from '../rules/taxDue';
import { cfoFacts, fmtDateEn } from './facts';

const noDemo = (name: string) => name.replace(/\s*\(demo\)/g, '').trim();
const APPROVAL = 'You decide, everything is simulated.';

/** 2–3 short English sentences from the rules: what happens, why, why it needs the owner's OK. No model call. */
export function explain(a: Pick<Action, 'cfo' | 'kind' | 'refId' | 'amountPLN' | 'dueDate'>): string {
  const amount = a.amountPLN !== undefined ? fmtPLN(a.amountPLN) : '';
  const inv = db.invoices.find((i) => i.id === a.refId);

  switch (a.kind) {
    case 'credit_line': {
      const f = forecast(30);
      return `Forecast: on ${fmtDateEn(f.lowest.date)} the balance drops to ${fmtPLN(f.lowest.balancePLN)}, ` +
        `${fmtPLN(f.bufferPLN - f.lowest.balancePLN)} below your ${fmtPLN(f.bufferPLN)} buffer. A credit line of ${amount} would cover the gap. ${APPROVAL}`;
    }
    case 'payment_reminder':
      if (inv) {
        const late = daysBetween(inv.dueDate, db.shop.today);
        return `${noDemo(inv.counterparty.name)} is ${late} days late paying you ${amount} for invoice ${inv.number}. ` +
          'The reminder is an email to the customer, so it waits for your approval.';
      }
      break;
    case 'tax_payment': {
      const ob = db.obligations.find((o) => o.id === a.refId);
      if (ob) return `${taxLabelEn(ob)}: ${amount} is due by ${fmtDateEn(ob.dueDate)}. Paying it lowers your balance, so it waits for your approval.`;
      break;
    }
    case 'supplier_payment': {
      const e = inv && fxExposures().find((x) => x.currency === inv.currency);
      if (inv && e) {
        const after = exposureAfterPaying(e, inv);
        return `Pay ${amount} to ${noDemo(inv.counterparty.name)} today instead of on ${fmtDateEn(inv.dueDate)}. ` +
          `The ${e.currency} risk goes ${after.shockPLN > e.shockPLN ? 'up' : 'down'} from ${fmtPLN(e.shockPLN)} to ${fmtPLN(after.shockPLN)}, ` +
          `and the money leaves your account today. ${APPROVAL}`;
      }
      break;
    }
    case 'fx_hedge': {
      // Only the card's own currency (review of PR #6: a USD card also explained the EUR risk).
      const own = cfoFacts('kasia').points.filter((p) => p.id === `fx-${inv?.currency}` || p.id === `hedge-${inv?.currency}`);
      if (own.length) return `${own.map((p) => p.text).join(' ')} ${APPROVAL}`;
      break;
    }
  }
  return `${cfoFacts(a.cfo).summary} ${APPROVAL}`;
}

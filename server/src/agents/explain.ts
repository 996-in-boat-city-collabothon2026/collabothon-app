// Owner: Pair 2 (Person A). A ready Polish explanation for each approval card, built only from rule numbers.
// Live test (Llama 3.2 3B): free explanations said "saldo dziś jest zbyt wysokie", wrote reminders TO the customer
// and started with "Właściciel warsztatu…". The model now only rephrases this text; it is also the fallback.
import type { Action } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN } from '../domain/money';
import { forecast } from '../rules/cashflow';
import { exposureAfterPaying, fxExposures } from '../rules/fx';
import { cfoFacts, fmtDate } from './facts';

const noDemo = (name: string) => name.replace(/\s*\(demo\)/g, '').trim();
const APPROVAL = 'Decyzja należy do Ciebie, wszystko jest symulacją.';

/** 2–3 short Polish sentences: what happens, why, why it needs the owner's OK. */
export function explainPL(a: Pick<Action, 'cfo' | 'kind' | 'refId' | 'amountPLN' | 'dueDate'>): string {
  const amount = a.amountPLN !== undefined ? fmtPLN(a.amountPLN) : '';
  const inv = db.invoices.find((i) => i.id === a.refId);

  switch (a.kind) {
    case 'credit_line': {
      const f = forecast(30);
      return `Prognoza: ${fmtDate(f.lowest.date)} saldo spadnie do ${fmtPLN(f.lowest.balancePLN)}, czyli ${fmtPLN(f.bufferPLN - f.lowest.balancePLN)} poniżej bufora ${fmtPLN(f.bufferPLN)}. ` +
        `Linia kredytowa ${amount} pokryje tę lukę. ${APPROVAL}`;
    }
    case 'payment_reminder':
      if (inv) {
        const late = daysBetween(inv.dueDate, db.shop.today);
        return `Klient ${noDemo(inv.counterparty.name)} spóźnia się ${late} dni z zapłatą ${amount} za fakturę ${inv.number}. ` +
          `Przypomnienie to e-mail do klienta, dlatego czeka na Twoją zgodę.`;
      }
      break;
    case 'tax_payment': {
      const ob = db.obligations.find((o) => o.id === a.refId);
      if (ob) return `${ob.label}: ${amount} trzeba zapłacić do ${fmtDate(ob.dueDate)}. Ta płatność zmniejszy saldo, dlatego czeka na Twoją zgodę.`;
      break;
    }
    case 'supplier_payment': {
      const e = inv && fxExposures().find((x) => x.currency === inv.currency);
      if (inv && e) {
        const after = exposureAfterPaying(e, inv);
        const riskWord = after.shockPLN > e.shockPLN ? 'wzrośnie' : 'spadnie';
        return `Zapłata ${amount} dla ${noDemo(inv.counterparty.name)} dziś zamiast ${fmtDate(inv.dueDate)}. ` +
          `Ryzyko ${e.currency} ${riskWord} z ${fmtPLN(e.shockPLN)} do ${fmtPLN(after.shockPLN)}, a pieniądze znikną z konta już dziś. ${APPROVAL}`;
      }
      break;
    }
    case 'fx_hedge':
      return `${cfoFacts('kasia', 'pl').summary} ${APPROVAL}`;
  }
  return `${cfoFacts(a.cfo, 'pl').summary} ${APPROVAL}`;
}

/** Money amounts in a text ("36 000,00 zł", "1500 EUR"), normalised so "36 000,00" and "36 000,00" match. */
export const amountsIn = (text: string) =>
  (text.replace(/ /g, ' ').match(/\d{1,3}(?: \d{3})*(?:,\d+)?(?= ?(?:zł|EUR|USD))/g) ?? []);

/** True when `reply` repeats at least one amount from `source` (the key number made it through). */
export const keepsAmount = (reply: string, source: string) => {
  const r = reply.replace(/ /g, ' ');
  return amountsIn(source).some((x) => r.includes(x));
};

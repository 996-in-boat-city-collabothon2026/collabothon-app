// Owner: Pair 2 (Person A). A ready explanation for each approval card (English on stage), built only from rule numbers.
// Live test (Llama 3.2 3B): free explanations said "saldo dziś jest zbyt wysokie", wrote reminders TO the customer
// and started with "Właściciel warsztatu…". So the card shows this rule text, no model call.
import type { Action } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN } from '../domain/money';
import { forecast } from '../rules/cashflow';
import { exposureAfterPaying, fxExposures } from '../rules/fx';
import { taxLabelEn } from '../rules/taxDue';
import { cfoFacts, fmtDate, fmtDateEn, type Lang } from './facts';

const noDemo = (name: string) => name.replace(/\s*\(demo\)/g, '').trim();
const APPROVAL: Record<Lang, string> = {
  pl: 'Decyzja należy do Ciebie, wszystko jest symulacją.',
  en: 'You decide, everything is simulated.',
};

/**
 * 2–3 short sentences from the rules: what happens, why, why it needs the owner's OK. No model call.
 * Stage language is English (STAGE_LANG); the Polish text is kept for a Polish UI.
 */
export function explain(a: Pick<Action, 'cfo' | 'kind' | 'refId' | 'amountPLN' | 'dueDate'>, lang: Lang): string {
  const pl = lang === 'pl';
  const date = (iso: string) => (pl ? fmtDate(iso) : fmtDateEn(iso));
  const amount = a.amountPLN !== undefined ? fmtPLN(a.amountPLN) : '';
  const inv = db.invoices.find((i) => i.id === a.refId);

  switch (a.kind) {
    case 'credit_line': {
      const f = forecast(30);
      const low = fmtPLN(f.lowest.balancePLN);
      const gap = fmtPLN(f.bufferPLN - f.lowest.balancePLN);
      return pl
        ? `Prognoza: ${date(f.lowest.date)} saldo spadnie do ${low}, czyli ${gap} poniżej bufora ${fmtPLN(f.bufferPLN)}. Linia kredytowa ${amount} pokryje tę lukę. ${APPROVAL.pl}`
        : `Forecast: on ${date(f.lowest.date)} the balance drops to ${low}, ${gap} below your ${fmtPLN(f.bufferPLN)} buffer. A credit line of ${amount} would cover the gap. ${APPROVAL.en}`;
    }
    case 'payment_reminder':
      if (inv) {
        const late = daysBetween(inv.dueDate, db.shop.today);
        const who = noDemo(inv.counterparty.name);
        return pl
          ? `Klient ${who} spóźnia się ${late} dni z zapłatą ${amount} za fakturę ${inv.number}. Przypomnienie to e-mail do klienta, dlatego czeka na Twoją zgodę.`
          : `${who} is ${late} days late paying you ${amount} for invoice ${inv.number}. The reminder is an email to the customer, so it waits for your approval.`;
      }
      break;
    case 'tax_payment': {
      const ob = db.obligations.find((o) => o.id === a.refId);
      if (ob) {
        return pl
          ? `${ob.label}: ${amount} trzeba zapłacić do ${date(ob.dueDate)}. Ta płatność zmniejszy saldo, dlatego czeka na Twoją zgodę.`
          : `${taxLabelEn(ob)}: ${amount} is due by ${date(ob.dueDate)}. Paying it lowers your balance, so it waits for your approval.`;
      }
      break;
    }
    case 'supplier_payment': {
      const e = inv && fxExposures().find((x) => x.currency === inv.currency);
      if (inv && e) {
        const after = exposureAfterPaying(e, inv);
        const up = after.shockPLN > e.shockPLN;
        const who = noDemo(inv.counterparty.name);
        return pl
          ? `Zapłata ${amount} dla ${who} dziś zamiast ${date(inv.dueDate)}. Ryzyko ${e.currency} ${up ? 'wzrośnie' : 'spadnie'} z ${fmtPLN(e.shockPLN)} do ${fmtPLN(after.shockPLN)}, a pieniądze znikną z konta już dziś. ${APPROVAL.pl}`
          : `Pay ${amount} to ${who} today instead of on ${date(inv.dueDate)}. The ${e.currency} risk goes ${up ? 'up' : 'down'} from ${fmtPLN(e.shockPLN)} to ${fmtPLN(after.shockPLN)}, and the money leaves your account today. ${APPROVAL.en}`;
      }
      break;
    }
    case 'fx_hedge':
      return `${cfoFacts('kasia', lang).summary} ${APPROVAL[lang]}`;
  }
  return `${cfoFacts(a.cfo, lang).summary} ${APPROVAL[lang]}`;
}

/** The Polish text (kept for a Polish UI and B's tests). */
export const explainPL = (a: Parameters<typeof explain>[0]) => explain(a, 'pl');

/** Money amounts in a text ("36 000,00 zł", "1500 EUR"), normalised so "36 000,00" and "36 000,00" match. */
export const amountsIn = (text: string) =>
  (text.replace(/ /g, ' ').match(/\d{1,3}(?: \d{3})*(?:,\d+)?(?= ?(?:zł|EUR|USD))/g) ?? []);

/** True when `reply` repeats at least one amount from `source` (the key number made it through). */
export const keepsAmount = (reply: string, source: string) => {
  const r = reply.replace(/ /g, ' ');
  return amountsIn(source).some((x) => r.includes(x));
};

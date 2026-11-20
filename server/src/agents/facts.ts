// Owner: Pair 2 (Person B). Short, human facts for ONE CFO, in English, built only from rule numbers.
// Why: the small model (Llama 3.2 3B) mixed up numbers from a big snapshot ("the euro can fall by 20 275 zł").
// With a few clearly labelled facts plus a ready-made conclusion it only has to say the conclusion in its own words.
// `summary` is also the safe answer when the model is down or invents a number.
// The whole app speaks English (money keeps the Polish format "12 430,00 zł", the shop is Polish).
import type { CfoId } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN } from '../domain/money';
import { latestRate } from '../domain/fx';
import { forecast } from '../rules/cashflow';
import { creditLine, paymentReminders } from '../rules/liquidity';
import { FX_SHOCK_THRESHOLD_PLN, fxExposures, hasTrend, missingFxRates } from '../rules/fx';
import { taxesDue } from '../rules/taxDue';
import { topCost } from '../rules/expenses';
import { labourGaps, lowMarkups, sumMissing } from '../rules/margin';

export interface CfoFacts {
  lines: string[]; // "label: value" facts for the prompt
  summary: string; // 1–2 plain sentences: what the owner should know and do
  misread?: (reply: string) => boolean; // a mistake seen live on the real model (true = don't show the reply)
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/);

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-11-25" → "November 25, 2026" (the model then writes the date the same way). */
export const fmtDateEn = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS_EN[m - 1]} ${d}, ${y}`;
};
/** Number format of the app: "4,27", "1500" (decimal comma, like the money format "12 430,00 zł"). */
const fmtNum = (n: number, digits = 2) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: digits }).format(n);
const noDemo = (name: string) => name.replace(/\s*\(demo\)/g, '').trim();
const inDays = (iso: string) => {
  const d = daysBetween(db.shop.today, iso);
  return d > 0 ? `in ${d} days` : d === 0 ? 'today' : `${-d} days late`;
};
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function anna(): CfoFacts {
  const f = forecast(30);
  const low = f.lowest;
  const gap = f.bufferPLN - low.balancePLN;
  const credit = creditLine()[0]?.amountPLN;
  const late = db.invoices.filter((i) => paymentReminders().some((r) => r.refId === i.id));
  const lateText = paymentReminders().map((r) => {
    const i = late.find((x) => x.id === r.refId)!;
    return `${noDemo(i.counterparty.name)} ${fmtPLN(r.amountPLN!)} (${inDays(i.dueDate)})`;
  });

  const lines = [
    `Bank balance today: ${fmtPLN(db.bank.balancePLN)}`,
    `Lowest balance in the 30-day forecast (future, not today): ${fmtPLN(low.balancePLN)} on ${fmtDateEn(low.date)}`,
    `Safety buffer: ${fmtPLN(f.bufferPLN)}`,
    ...(gap > 0 ? [`Missing to the buffer: ${fmtPLN(gap)}`] : []),
    ...(credit ? [`Proposed credit line (simulated): ${fmtPLN(credit)}`] : []),
    ...(lateText.length ? [`Customers who owe you money and are late: ${list(lateText)}`] : []),
  ];

  let summary: string;
  if (gap <= 0) {
    summary = `You have enough cash: the lowest forecast balance is ${fmtPLN(low.balancePLN)} (${fmtDateEn(low.date)}), above the ${fmtPLN(f.bufferPLN)} buffer.`;
  } else {
    summary = `Careful: on ${fmtDateEn(low.date)} the balance drops to ${fmtPLN(low.balancePLN)}, ${fmtPLN(gap)} below your buffer.`;
    if (late.length) summary += ` First send reminders to the customers who have not paid you: ${list(late.map((i) => noDemo(i.counterparty.name)))}.`;
    if (credit) summary += ` If that is not enough, a credit line of ${fmtPLN(credit)}.`;
  }
  // Live: "pay FlotaTrans 12 300 zł", but FlotaTrans owes the shop money, not the other way round.
  const customers = late.map((i) => noDemo(i.counterparty.name).split(/\s+/)[0].toLowerCase());
  const misread = (reply: string) =>
    sentencesOf(reply).some((sen) => {
      const s = sen.toLowerCase();
      // "hasn't paid you", "is late", "overdue" all say the right direction.
      const payCustomer = customers.some((c) => s.includes(c)) && /\bpay/.test(s) &&
        !/remind|\bowe|not paid|n't paid|not yet paid|unpaid|overdue|\blate\b|collect|pay you\b|paid you\b/.test(s);
      // Live: "it is not a problem" with a 35 275 zł gap.
      const falseComfort = gap > 0 && /no problem|not a problem|you(?:'re| are) fine/.test(s);
      return payCustomer || falseComfort;
    });
  return { lines, summary, misread };
}

function kasia(): CfoFacts {
  const exposures = fxExposures();
  // No NBP rate for a currency with open invoices: say so, never guess a conversion (the other agents still run).
  const missing = missingFxRates();
  const noRate = missing.map((c) => `No NBP rate for ${c}: the conversion of ${c} invoices to złoty is unavailable`);
  if (exposures.length === 0 && missing.length) {
    return {
      lines: noRate,
      summary: `I cannot measure the currency risk: there is no NBP rate for ${missing.join(', ')}, so the conversion to złoty is unavailable.`,
    };
  }
  if (exposures.length === 0) {
    return { lines: ['No unpaid foreign-currency invoices'], summary: 'You have no currency risk right now: all open invoices are in złoty.' };
  }
  const lines: string[] = [];
  const parts: string[] = [];
  for (const e of exposures) {
    const c = e.currency;
    const weOwe = e.net > 0;
    const amount = `${fmtNum(Math.abs(e.net))} ${c}`;
    const rate = `${fmtNum(latestRate(c), 4)} zł`;
    const { from, to, weeksUp } = e.trend;
    lines.push(
      `${c} ${weOwe ? 'to pay' : 'to receive'} (net): ${amount} = ${fmtPLN(Math.abs(e.netPLN))} at the NBP rate ${rate}`,
      // one rate only → no "4 weeks ago" line
      ...(hasTrend(e) ? [`${c} rate 4 weeks ago: ${fmtNum(from, 4)} zł, today: ${rate}${weeksUp > 0 ? ` (up ${weeksUp} weeks in a row)` : ''}`] : []),
      `Loss if ${c} ${weOwe ? 'rises' : 'falls'} 5%: ${fmtPLN(e.shockPLN)}`,
      // Spelled out: the small model said "the euro is not a problem because it is rising".
      weOwe ? `A rising ${c} rate is bad for you: the same ${c} cost you more złoty` : `A falling ${c} rate is bad for you: the same ${c} bring you less złoty`,
    );
    const hedge = e.shockPLN > FX_SHOCK_THRESHOLD_PLN;
    if (hedge) lines.push(`Proposal: a forward contract for ${amount} (simulated), the rate stays at ${rate}`);
    parts.push(
      `You have ${amount} ${weOwe ? 'to pay' : 'to receive'}. If ${c} ${weOwe ? 'rises' : 'falls'} 5%, you lose ${fmtPLN(e.shockPLN)}${to > from && weOwe ? `, and the rate is going up (from ${fmtNum(from, 4)} zł to ${rate})` : ''}. ` +
        (hedge ? `I suggest locking the rate with a forward contract for ${amount}.` : 'The risk is small, no action needed for now.'),
    );
  }
  // Live: "the euro is not a problem because it is rising" while the shop owes euro and a hedge is proposed.
  const risky = exposures.some((e) => e.shockPLN > FX_SHOCK_THRESHOLD_PLN);
  const misread = (reply: string) => risky && /not a problem|no problem/i.test(reply);
  return { lines: [...lines, ...noRate], summary: parts.join(' '), misread };
}

/**
 * KSeF gives its rejection reason in Polish ("Nieprawidłowy NIP nabywcy (Podmiot2): wymagane 10 cyfr").
 * The facts carry it in English, or the model copies Polish words onto the English stage.
 */
function reasonEn(reason?: string): string {
  if (!reason) return 'none given';
  const nip = /NIP nabywcy.*?(\d+) cyfr/i.exec(reason);
  if (nip) return `the buyer's tax number (NIP) is wrong, it must have ${nip[1]} digits`;
  if (/NIP/i.test(reason)) return "the buyer's tax number (NIP) is wrong";
  return 'the invoice data is wrong';
}

function marek(): CfoFacts {
  const taxes = taxesDue(30).obligations;
  const rejected = db.invoices.filter((i) => i.ksef.status === 'rejected');
  const lines = [
    ...taxes.map((o) => `${o.kind}: ${fmtPLN(o.amountPLN)}, due ${fmtDateEn(o.dueDate)} (${inDays(o.dueDate)}), unpaid`),
    ...rejected.map(
      (i) => `Invoice ${i.number} for ${noDemo(i.counterparty.name)} was rejected by KSeF (e-invoice system). Reason: ${reasonEn(i.ksef.rejectionReason)}`,
    ),
  ];
  if (lines.length === 0) lines.push('No taxes due in 30 days and no KSeF problems');

  const next = taxes[0];
  const bits: string[] = [];
  if (next) bits.push(`Next deadline: ${next.kind} ${fmtPLN(next.amountPLN)}, due ${fmtDateEn(next.dueDate)} (${inDays(next.dueDate)}), still unpaid.`);
  if (rejected.length) {
    bits.push(`KSeF rejected invoice ${list(rejected.map((i) => i.number))}, so it is not issued yet: fix the buyer data and send it again.`);
  }
  return { lines, summary: bits.join(' ') || 'Taxes and KSeF are in order.' };
}

const CATEGORY_EN: Record<string, string> = { parts: 'parts', utilities: 'utilities', other: 'other costs' };

function tomasz(): CfoFacts {
  const rate = fmtPLN(db.shop.labourRatePLN);
  const labour = labourGaps();
  const markup = lowMarkups();
  const top = topCost();
  const target = `${Math.round(db.shop.partsMarkupTarget * 100)}%`;

  const lines: string[] = [];
  if (labour.length) {
    lines.push(
      `You billed customers for labour below your ${rate} hourly rate (your prices, not your mechanics' pay): ${labour.length} orders, ${fmtPLN(sumMissing(labour))} missing in total`,
      ...labour.map(({ o, missing }) => `- ${o.car}: ${fmtPLN(missing)} is missing`),
    );
  }
  if (markup.length) lines.push(`Parts markup below ${target}: ${markup.length} orders, ${fmtPLN(sumMissing(markup))} missing in total`);
  if (top) lines.push(`Biggest cost you can change: ${CATEGORY_EN[top.category]}, ${fmtPLN(top.amount)} in 30 days (${top.sharePct}% of all costs)`);
  if (lines.length === 0) lines.push('Margins and costs are in order');

  const bits: string[] = [];
  if (labour.length) {
    const cars = list(labour.map(({ o }) => o.car));
    bits.push(`On ${labour.length} orders you billed customers too little for labour: ${fmtPLN(sumMissing(labour))} missing (${cars}). Bill the full hours at ${rate}.`);
  }
  if (markup.length) bits.push(`Also, a parts markup below ${target} cost you ${fmtPLN(sumMissing(markup))}.`);
  if (!bits.length && top) {
    bits.push(`You spend most on ${CATEGORY_EN[top.category]}: ${fmtPLN(top.amount)} in 30 days. Ask other suppliers for a quote.`);
  }
  // Live: "You're paying your labourers 200 zł per hour…": the rule is about prices for customers, not wages.
  // A wage word that is negated or contrasted in its clause is the RIGHT reading (review of 1bdce05: "The 1700 zł is
  // missing revenue, not an increase in mechanics' wages." fell back).
  const misread = (reply: string) =>
    labour.length > 0 &&
    [...reply.matchAll(/wage|salar|labourers|paying your (?:mechanics|workers)/gi)].some((m) => {
      const clause = reply.slice(Math.max(0, m.index! - 45), m.index).split(/[.;!?](?=\s)/).pop() ?? '';
      return !/\b(?:not|no|never|rather than|instead of|unlike)\b|n't\b/i.test(clause);
    });
  return { lines, summary: bits.join(' ') || 'Margins and costs are in order.', misread };
}

const BUILDERS: Record<CfoId, () => CfoFacts> = { anna, kasia, marek, tomasz };

/** Facts + conclusion for one CFO. Today's date is always included. */
export function cfoFacts(cfo: CfoId): CfoFacts {
  const f = BUILDERS[cfo]();
  return { ...f, lines: [`Today is ${fmtDateEn(db.shop.today)}`, ...f.lines] };
}

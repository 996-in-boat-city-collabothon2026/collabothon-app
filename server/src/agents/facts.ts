// Owner: Pair 2 (Person B). Short, human facts for ONE CFO, in English, built only from rule numbers.
// Why: the small model (Llama 3.2 3B) mixed up numbers from a big snapshot ("the euro can fall by 20 275 zł").
// With a few clearly labelled facts plus a ready-made conclusion it only has to say the conclusion in its own words.
// `summary` is also the safe answer when the model is down or invents a number.
// The whole app speaks English (money keeps the Polish format "12 430,00 zł", the shop is Polish).
// The conclusion is split into POINTS: `critical` decides who speaks in the meeting (agents/boardroom.ts), and
// explain.ts reuses Kasia's points. Rebuild 2 (8B): the model writes the answer, agents/guard.ts checks its numbers.
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

/** One ready-made piece of the answer, built only from rule numbers. */
export interface CfoPoint {
  id: string; // stable per CFO, e.g. "gap", "reminders", "fx-EUR", "next-tax", "labour"
  text: string; // one or two plain English sentences
  core: boolean; // part of the conclusion (the summary). Other points are details the owner may ask about.
  critical: boolean; // a real risk right now: this CFO always speaks in the meeting (agents/boardroom.ts)
}

export interface CfoFacts {
  lines: string[]; // "label: value" facts for the prompt
  points: CfoPoint[]; // the conclusion (core points, in order) and the details
  summary: string; // the core points joined: what the owner should know and do, and the safe fallback answer
}

/** What a builder returns: `summary` is always made from the core points (cfoFacts). */
type Built = Omit<CfoFacts, 'summary'>;
const point = (id: string, text: string, core = true, critical = false): CfoPoint => ({ id, text, core, critical });
export const summaryOf = (points: CfoPoint[]) => points.filter((p) => p.core).map((p) => p.text).join(' ');

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

function anna(): Built {
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
    // Live run on 8B: "How much do my customers owe me?" made the model add the amounts itself (19 680), and the
    // guard rejected the sum. The rules give the total, so the model can copy it.
    ...(late.length > 1 ? [`Late customers owe you in total: ${fmtPLN(owedTotal())}`] : []),
  ];

  const points: CfoPoint[] = [];
  if (gap <= 0) {
    points.push(point('cash', `You have enough cash: the lowest forecast balance is ${fmtPLN(low.balancePLN)} (${fmtDateEn(low.date)}), above the ${fmtPLN(f.bufferPLN)} buffer.`));
  } else {
    points.push(point('gap', `Careful: on ${fmtDateEn(low.date)} the balance drops to ${fmtPLN(low.balancePLN)}, ${fmtPLN(gap)} below your buffer.`, true, true));
    if (late.length) points.push(point('reminders', `First send reminders to the customers who have not paid you: ${list(late.map((i) => noDemo(i.counterparty.name)))}.`));
    // "If that is not enough" only follows the reminders; without late customers it had nothing to point back to.
    if (credit) {
      points.push(late.length
        ? point('credit', `If that is not enough, a credit line of ${fmtPLN(credit)}.`)
        : point('credit', `A credit line of ${fmtPLN(credit)} would cover the gap.`));
    }
  }
  points.push(point('balance', `Your bank balance today is ${fmtPLN(db.bank.balancePLN)}.`, false));
  // Before the single customers: "Who owes me money?" matches both, and the earlier point wins a tie (fallbackFor).
  if (late.length > 1) {
    points.push(point('owed', `Your late customers ${list(late.map((i) => noDemo(i.counterparty.name)))} owe you ${fmtPLN(owedTotal())} in total.`, false));
  }
  for (const r of paymentReminders()) {
    const i = late.find((x) => x.id === r.refId)!;
    points.push(point(`late-${i.id}`, `${noDemo(i.counterparty.name)} owes you ${fmtPLN(r.amountPLN!)} and is ${inDays(i.dueDate)}.`, false));
  }
  return { lines, points };
}

/** What the late customers owe together (the sum of the reminder amounts). */
const owedTotal = () => paymentReminders().reduce((sum, r) => sum + (r.amountPLN ?? 0), 0);

function kasia(): Built {
  const exposures = fxExposures();
  // No NBP rate for a currency with open invoices: say so, never guess a conversion (the other agents still run).
  const missing = missingFxRates();
  const noRate = missing.map((c) => `No NBP rate for ${c}: the conversion of ${c} invoices to złoty is unavailable`);
  if (exposures.length === 0 && missing.length) {
    return {
      lines: noRate,
      points: [point('no-rate', `I cannot measure the currency risk: there is no NBP rate for ${missing.join(', ')}, so the conversion to złoty is unavailable.`)],
    };
  }
  if (exposures.length === 0) {
    return { lines: ['No unpaid foreign-currency invoices'], points: [point('no-fx', 'You have no currency risk right now: all open invoices are in złoty.')] };
  }
  const lines: string[] = [];
  const points: CfoPoint[] = [];
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
    points.push(point(`fx-${c}`, `You have ${amount} ${weOwe ? 'to pay' : 'to receive'}. If ${c} ${weOwe ? 'rises' : 'falls'} 5%, you lose ${fmtPLN(e.shockPLN)}${to > from && weOwe ? `, and the rate is going up (from ${fmtNum(from, 4)} zł to ${rate})` : ''}.`, true, hedge));
    if (hedge) points.push(point(`hedge-${c}`, `I suggest locking the rate with a forward contract for ${amount}.`));
  }
  // One "small risk" point for all small currencies, not one per currency. Named only next to a hedged one.
  const small = exposures.filter((e) => e.shockPLN <= FX_SHOCK_THRESHOLD_PLN).map((e) => e.currency);
  if (small.length) {
    const which = small.length < exposures.length ? `The ${list(small)} risk is` : 'The risk is';
    points.push(point('small-risk', `${which} small, no action needed for now.`));
  }
  // The value in złoty was only in the old prompt lines (found in M8).
  for (const e of exposures) {
    const c = e.currency;
    points.push(point(`net-${c}`, `Your ${fmtNum(Math.abs(e.net))} ${c} ${e.net > 0 ? 'to pay' : 'to receive'} is ${fmtPLN(Math.abs(e.netPLN))} at today's NBP rate of ${fmtNum(latestRate(c), 4)} zł.`, false));
  }
  for (const e of exposures.filter(hasTrend)) {
    const { from, weeksUp } = e.trend;
    points.push(point(`rate-${e.currency}`, `The NBP ${e.currency} rate is ${fmtNum(latestRate(e.currency), 4)} zł today; 4 weeks ago it was ${fmtNum(from, 4)} zł${weeksUp > 0 ? ` (up ${weeksUp} weeks in a row)` : ''}.`, false));
  }
  return { lines: [...lines, ...noRate], points };
}

/**
 * KSeF gives its rejection reason in Polish ("Nieprawidłowy NIP nabywcy (Podmiot2): wymagane 10 cyfr").
 * The facts carry it in English, or the model copies Polish words onto the English stage.
 * (The UI uses ksefReasonEn from shared/ksefReason.ts; this one words it as part of a sentence.)
 */
function reasonEn(reason?: string): string {
  if (!reason) return 'none given';
  const nip = /NIP nabywcy.*?(\d+) cyfr/i.exec(reason);
  if (nip) return `the buyer's tax number (NIP) is wrong, it must have ${nip[1]} digits`;
  if (/NIP/i.test(reason)) return "the buyer's tax number (NIP) is wrong";
  return 'the invoice data is wrong';
}

/** A tax deadline this close (or already late) is a real risk now. */
const URGENT_TAX_DAYS = 7;

function marek(): Built {
  const taxes = taxesDue(30).obligations;
  const rejected = db.invoices.filter((i) => i.ksef.status === 'rejected');
  const lines = [
    ...taxes.map((o) => `${o.kind}: ${fmtPLN(o.amountPLN)}, due ${fmtDateEn(o.dueDate)} (${inDays(o.dueDate)}), unpaid`),
    ...rejected.map(
      (i) => `Invoice ${i.number} for ${noDemo(i.counterparty.name)} was rejected by KSeF (e-invoice system). Reason: ${reasonEn(i.ksef.rejectionReason)}`,
    ),
  ];
  // Live run on 8B: "How much do I pay in taxes in total?" made the model add the taxes itself (22 130).
  const total = taxes.reduce((sum, o) => sum + o.amountPLN, 0);
  if (taxes.length > 1) lines.push(`All taxes due in 30 days together: ${fmtPLN(total)}`);
  if (lines.length === 0) lines.push('No taxes due in 30 days and no KSeF problems');

  const next = taxes[0];
  const points: CfoPoint[] = [];
  if (next) {
    const urgent = daysBetween(db.shop.today, next.dueDate) <= URGENT_TAX_DAYS;
    points.push(point('next-tax', `Next deadline: ${next.kind} ${fmtPLN(next.amountPLN)}, due ${fmtDateEn(next.dueDate)} (${inDays(next.dueDate)}), still unpaid.`, true, urgent));
  }
  if (rejected.length) {
    points.push(point('ksef', `KSeF rejected invoice ${list(rejected.map((i) => i.number))}, so it is not issued yet: fix the buyer data and send it again.`));
  }
  if (!points.length) points.push(point('ok', 'Taxes and KSeF are in order.'));
  // Every tax due in 30 days, so a question about ZUS or PIT gets its own deadline, not only the next one.
  for (const o of taxes) {
    points.push(point(`tax-${o.id}`, `${o.kind}: ${fmtPLN(o.amountPLN)}, due ${fmtDateEn(o.dueDate)} (${inDays(o.dueDate)}), still unpaid.`, false));
  }
  if (taxes.length > 1) points.push(point('taxes-total', `All your taxes due in the next 30 days come to ${fmtPLN(total)} in total.`, false));
  // The reason was only in the old prompt lines (found in M8): "why was it rejected?" needs its own point.
  for (const i of rejected) {
    const why = i.ksef.rejectionReason ? ` because ${reasonEn(i.ksef.rejectionReason)}` : ', no reason given';
    points.push(point(`ksef-${i.id}`, `KSeF rejected invoice ${i.number} for ${noDemo(i.counterparty.name)}${why}.`, false));
  }
  return { lines, points };
}

const CATEGORY_EN: Record<string, string> = { parts: 'parts', utilities: 'utilities', other: 'other costs' };

function tomasz(): Built {
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

  const points: CfoPoint[] = [];
  if (labour.length) {
    const cars = list(labour.map(({ o }) => o.car));
    points.push(point('labour', `On ${labour.length} orders you billed customers too little for labour: ${fmtPLN(sumMissing(labour))} missing (${cars}). Bill the full hours at ${rate}.`));
  }
  if (markup.length) points.push(point('markup', `${labour.length ? 'Also, a' : 'A'} parts markup below ${target} cost you ${fmtPLN(sumMissing(markup))}.`));
  // The biggest cost is the conclusion only when nothing else is wrong; otherwise it is a detail the owner may ask about.
  if (top) {
    points.push(point('top-cost', `You spend most on ${CATEGORY_EN[top.category]}: ${fmtPLN(top.amount)} in 30 days. Ask other suppliers for a quote.`, points.length === 0));
  }
  if (!points.length) points.push(point('ok', 'Margins and costs are in order.'));
  for (const { o, missing } of labour) points.push(point(`car-${o.id}`, `${o.car}: ${fmtPLN(missing)} of labour is missing.`, false));
  return { lines, points };
}

const BUILDERS: Record<CfoId, () => Built> = { anna, kasia, marek, tomasz };

/** Words that say nothing about the topic ("what is my…"). */
const STOP_WORDS = new Set(['the', 'and', 'what', 'when', 'how', 'much', 'many', 'does', 'did', 'can', 'could', 'should',
  'would', 'will', 'are', 'was', 'were', 'has', 'have', 'you', 'your', 'about', 'with', 'for', 'this', 'that', 'there',
  'any', 'all', 'now', 'please', 'tell', 'need', 'one', 'sentence', 'why', 'who', 'which', 'not']);

/** The words of the question that can point at a topic: 3+ letters, not a stop word, lower case, without a final
 * "s" ("owes" also finds "owe", "taxes" also finds "tax"). */
const topicWords = (question: string) =>
  (question.toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((w) => !STOP_WORDS.has(w)).map((w) => w.replace(/(?<=\p{L}{3})s$/u, ''));

/**
 * The rule text shown when the model's reply cannot be shown (model down, or the guard said no).
 * It fits the question: the point sharing the most words with it wins (ties: the earlier point).
 * - The best point is a detail ("What is the EUR rate today?" → the rate) → the first core point, then that detail,
 *   so the main advice never vanishes.
 * - The best point is part of the conclusion, or nothing matches → the whole summary, as before.
 * Deterministic: no model, the same question always gives the same text.
 */
export function fallbackFor(facts: CfoFacts, question: string): string {
  const words = topicWords(question);
  let best: CfoPoint | undefined;
  let bestScore = 0;
  for (const p of facts.points) {
    const text = p.text.toLowerCase();
    const score = words.filter((w) => text.includes(w)).length;
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  if (!best || best.core) return facts.summary;
  const main = facts.points.find((p) => p.core);
  return main ? `${main.text} ${best.text}` : best.text;
}

/** Facts + conclusion for one CFO. Today's date is always included. */
export function cfoFacts(cfo: CfoId): CfoFacts {
  const f = BUILDERS[cfo]();
  return { ...f, lines: [`Today is ${fmtDateEn(db.shop.today)}`, ...f.lines], summary: summaryOf(f.points) };
}

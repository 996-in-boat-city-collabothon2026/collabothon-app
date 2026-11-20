// Owner: Pair 2 (Person A). Kasia 🔴, the FX hedging agent: finds currency risk in unpaid EUR/USD invoices.
// Numbers only. The LLM never calculates any of this; it only talks about it later.
import type { Currency, Invoice } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN, invoiceGross, round2 } from '../domain/money';
import { latestRate, toPLN } from '../domain/fx';
import type { DraftAction, Rule } from './index';

/** Propose a hedge when a 5% currency move would cost more than this. Seed data: 320,25 zł. */
export const FX_SHOCK_THRESHOLD_PLN = 300;
const SHOCK = 0.05; // "what if the rate moves 5%?"
const TREND_WEEKS = 4; // NBP rates in the seed are weekly

type ForeignCurrency = Exclude<Currency, 'PLN'>;
const FOREIGN: ForeignCurrency[] = ['EUR', 'USD'];

export interface FxExposure {
  currency: ForeignCurrency;
  net: number; // in the foreign currency. Positive = we owe it (purchases > sales)
  netPLN: number; // the same at today's NBP rate
  shockPLN: number; // how much a 5% move against us costs, in zł
  trend: { from: number; to: number; weeksUp: number }; // rate 4 weeks ago, today, weeks up in a row
}

const fmtNum = (n: number, digits = 2) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: digits }).format(n);
const fmtFx = (n: number, c: ForeignCurrency) => `${fmtNum(n)} ${c}`;
const fmtRate = (n: number) => `${fmtNum(n, 4)} zł`;

const unpaid = (currency: ForeignCurrency) => db.invoices.filter((i) => !i.paid && i.currency === currency);
const sumGross = (invoices: Invoice[]) => round2(invoices.reduce((s, i) => s + invoiceGross(i), 0));

/** NBP trend over the last 4 weeks: first rate, last rate, and how many weeks in a row it went up. */
function rateTrend(currency: ForeignCurrency): FxExposure['trend'] {
  const rates = db.fxRates
    .filter((r) => r.currency === currency)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-(TREND_WEEKS + 1))
    .map((r) => r.midPLN);
  let weeksUp = 0;
  for (let i = rates.length - 1; i > 0 && rates[i] > rates[i - 1]; i--) weeksUp++;
  return { from: rates[0], to: rates[rates.length - 1], weeksUp };
}

/** What a 5% move against us costs for a net position (in the foreign currency), in zł. */
const shockOf = (net: number, currency: ForeignCurrency) => round2(Math.abs(toPLN(net, currency)) * SHOCK);

/** Net exposure per currency (only currencies with unpaid invoices). Also used by the boardroom snapshot later. */
export function fxExposures(): FxExposure[] {
  return FOREIGN.filter((c) => unpaid(c).length > 0).map((currency) => {
    const invoices = unpaid(currency);
    const owe = sumGross(invoices.filter((i) => i.direction === 'purchase'));
    const owed = sumGross(invoices.filter((i) => i.direction === 'sales'));
    const net = round2(owe - owed);
    const netPLN = toPLN(net, currency);
    return { currency, net, netPLN, shockPLN: shockOf(net, currency), trend: rateTrend(currency) };
  });
}

/** "What if we pay this purchase invoice in full today?" Pure: nothing in db changes. */
export function exposureAfterPaying(e: FxExposure, invoice: Invoice): { net: number; shockPLN: number } {
  const net = round2(e.net - invoiceGross(invoice));
  return { net, shockPLN: shockOf(net, e.currency) };
}

/** "1 500 EUR to pay" / "2 100 EUR to receive" / "nothing open in EUR". */
const position = (net: number, c: ForeignCurrency) =>
  net === 0 ? `nothing open in ${c}` : `${fmtFx(Math.abs(net), c)} ${net > 0 ? 'to pay' : 'to receive'}`;

/** Turn one exposure into Kasia's cards: a hedge to approve + two cheaper ideas. */
function actionsFor(e: FxExposure): DraftAction[] {
  if (e.shockPLN <= FX_SHOCK_THRESHOLD_PLN) return [];

  const c = e.currency;
  const weOwe = e.net > 0; // net payable → buy the currency forward; net receivable → sell it forward
  const purchases = unpaid(c).filter((i) => i.direction === 'purchase');
  const sales = unpaid(c).filter((i) => i.direction === 'sales');
  const byGross = (list: Invoice[]) => [...list].sort((a, b) => invoiceGross(b) - invoiceGross(a))[0];
  const biggest = byGross(purchases);
  const anchor = weOwe ? biggest : byGross(sales); // the invoice the forward is about
  const { from, to, weeksUp } = e.trend;

  const why = [
    `Net ${weOwe ? 'to pay' : 'to receive'}: ${fmtFx(Math.abs(e.net), c)} = ${fmtPLN(Math.abs(e.netPLN))} at NBP ${fmtRate(latestRate(c))}`,
    `If ${c} ${weOwe ? 'rises' : 'falls'} 5%, you lose ${fmtPLN(e.shockPLN)}`,
    `${c} went from ${fmtRate(from)} to ${fmtRate(to)} in ${TREND_WEEKS} weeks (up ${weeksUp} week(s) in a row)`,
  ];

  const actions: DraftAction[] = [
    {
      cfo: 'kasia',
      kind: 'fx_hedge',
      tier: 'NEEDS_APPROVAL',
      execution: 'simulated',
      title: `Lock the rate: ${weOwe ? 'buy' : 'sell'} ${fmtFx(Math.abs(e.net), c)} forward (simulated)`,
      why,
      amountPLN: Math.abs(e.netPLN),
      dueDate: anchor?.dueDate,
      refId: anchor?.id,
    },
  ];

  // Paying a foreign supplier early only reduces risk when we owe the currency.
  if (weOwe && biggest) {
    const gross = invoiceGross(biggest);
    const after = exposureAfterPaying(e, biggest);
    const diff = round2(after.shockPLN - e.shockPLN);
    const riskLine =
      diff > 0
        ? `Careful: paying all ${fmtFx(gross, c)} makes your ${c} risk BIGGER, by ${fmtPLN(diff)}. Pay only part, or hedge the rest`
        : diff < 0
          ? `Paying all ${fmtFx(gross, c)} makes your ${c} risk smaller, by ${fmtPLN(-diff)}`
          : `Paying all ${fmtFx(gross, c)} leaves your ${c} risk the same: ${fmtPLN(e.shockPLN)}`;
    actions.push({
      cfo: 'kasia',
      kind: 'supplier_payment',
      tier: 'RECOMMENDED',
      execution: 'simulated',
      title: `Pay ${biggest.counterparty.name} early (${c} risk ${fmtPLN(e.shockPLN)} → ${fmtPLN(after.shockPLN)})`,
      why: [
        `${fmtFx(gross, c)} due on ${biggest.dueDate} (in ${daysBetween(db.shop.today, biggest.dueDate)} days)`,
        `Paying today locks ${fmtRate(latestRate(c))}: ${fmtPLN(toPLN(gross, c))}`,
        `Now: ${position(e.net, c)}, a 5% ${c} move costs ${fmtPLN(e.shockPLN)}`,
        `After paying: ${position(after.net, c)}, a 5% ${c} move costs ${fmtPLN(after.shockPLN)}`,
        riskLine,
      ],
      amountPLN: toPLN(gross, c),
      dueDate: biggest.dueDate,
      refId: biggest.id,
    });
  }

  actions.push({
    cfo: 'kasia',
    kind: 'info',
    tier: 'RECOMMENDED',
    execution: 'simulated',
    title: `Natural hedge: match ${c} income against ${c} costs`,
    why: [
      `${c} coming in: ${fmtFx(sumGross(sales), c)}. ${c} going out: ${fmtFx(sumGross(purchases), c)}`,
      `Only the difference, ${fmtFx(Math.abs(e.net), c)}, is at risk. ${weOwe ? `More ${c} sales shrink it.` : `Paying suppliers in ${c} shrinks it.`}`,
    ],
  });

  return actions;
}

export const fx: Rule = () => fxExposures().flatMap(actionsFor);

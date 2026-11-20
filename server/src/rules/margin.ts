// Owner: Pair 2 (Tomasz 🟢). Money left on the table in repair orders from the last 30 days.
import type { RepairOrder } from '@cfo/shared';
import { db } from '../domain/store';
import { fmtPLN, lastDays, round2 } from '../domain/money';
import type { DraftAction, Rule } from './index';

/** Orders from the last 30 calendar dates: [today−29, today], same window as the expenses rule. */
const recentOrders = (): RepairOrder[] => {
  const { from, to } = lastDays(db.shop.today, 30);
  return db.repairOrders.filter((o) => o.date >= from && o.date <= to);
};

/** Labour billed below hours × shop rate → one pricing tip with the missing money and the cars. */
export function labourUnderRate(): DraftAction[] {
  const rate = db.shop.labourRatePLN;
  const under = recentOrders()
    .map((o) => ({ o, missing: round2(o.labourHours * rate - o.labourBilledPLN) }))
    .filter((x) => x.missing > 0);
  if (under.length === 0) return [];

  const missing = round2(under.reduce((s, x) => s + x.missing, 0));
  return [
    {
      cfo: 'tomasz',
      kind: 'pricing',
      tier: 'RECOMMENDED',
      execution: 'simulated',
      title: `Labour billed under your rate: ${fmtPLN(missing)} missing on ${under.length} orders`,
      why: [
        `Your rate is ${fmtPLN(rate)} per hour`,
        ...under.map(
          ({ o, missing }) =>
            `${o.car}: ${o.labourHours} h billed ${fmtPLN(o.labourBilledPLN)}, should be ${fmtPLN(o.labourHours * rate)} (${fmtPLN(missing)} missing)`,
        ),
      ],
      amountPLN: missing,
    },
  ];
}

/** Parts sold with a markup below the target → one pricing tip. */
export function partsMarkup(): DraftAction[] {
  const target = db.shop.partsMarkupTarget;
  const low = recentOrders()
    .filter((o) => o.partsCostPLN > 0)
    .map((o) => ({ o, markup: (o.partsPricePLN - o.partsCostPLN) / o.partsCostPLN }))
    .filter((x) => x.markup < target);
  if (low.length === 0) return [];

  const missing = round2(low.reduce((s, { o }) => s + o.partsCostPLN * (1 + target) - o.partsPricePLN, 0));
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return [
    {
      cfo: 'tomasz',
      kind: 'pricing',
      tier: 'RECOMMENDED',
      execution: 'simulated',
      title: `Parts markup below ${pct(target)} on ${low.length} orders: ${fmtPLN(missing)} missing`,
      why: [
        `Your target markup on parts is ${pct(target)}`,
        ...low.map(
          ({ o, markup }) =>
            `${o.car}: parts cost ${fmtPLN(o.partsCostPLN)}, sold for ${fmtPLN(o.partsPricePLN)} (markup ${pct(markup)})`,
        ),
      ],
      amountPLN: missing,
    },
  ];
}

export const margin: Rule = () => [...labourUnderRate(), ...partsMarkup()];

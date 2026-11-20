// Owner: Pair 2 (Tomasz 🟢). Biggest cost the owner can change: last 30 days vs the 30 days before.
import type { ExpenseCategory } from '@cfo/shared';
import { db } from '../domain/store';
import { addDays, fmtPLN, round2 } from '../domain/money';
import type { DraftAction, Rule } from './index';

// Payroll, rent, taxes and leasing are fixed: "cut your taxes" is not a useful tip.
const TIPS: Partial<Record<ExpenseCategory, { label: string; tip: string }>> = {
  parts: { label: 'Parts', tip: 'Ask 2 other wholesalers for a quote, or buy the most-used parts in bulk' },
  utilities: { label: 'Utilities', tip: 'Check your electricity tariff and switch off compressors overnight' },
  other: { label: 'Other costs', tip: 'Review subscriptions and services you rarely use' },
};

/** Sum per category for expenses dated from `from` to `to` (both included). */
export function totalsBetween(from: string, to: string): Map<ExpenseCategory, number> {
  const totals = new Map<ExpenseCategory, number>();
  for (const e of db.expenses) {
    if (e.date >= from && e.date <= to) totals.set(e.category, round2((totals.get(e.category) ?? 0) + e.amountPLN));
  }
  return totals;
}

export const expenses: Rule = () => {
  const today = db.shop.today;
  const now = totalsBetween(addDays(today, -30), today); // same window as the pie chart
  const before = totalsBetween(addDays(today, -60), addDays(today, -31));

  const top = [...now]
    .filter(([category]) => TIPS[category])
    .sort((a, b) => b[1] - a[1])[0];
  if (!top) return [];

  const [category, amount] = top;
  const { label, tip } = TIPS[category]!;
  const prev = before.get(category) ?? 0;
  const total = [...now.values()].reduce((s, v) => s + v, 0);
  const why = [`${label}: ${fmtPLN(amount)} in the last 30 days, ${Math.round((amount / total) * 100)}% of all costs`];

  let title = `${label} is your biggest cost you can change: ${fmtPLN(amount)}`;
  if (prev > 0) {
    const change = Math.round(((amount - prev) / prev) * 100);
    if (change <= 0) return []; // spending went down: nothing to say
    title = `${label} up ${change}%: ${fmtPLN(amount)} vs ${fmtPLN(prev)}`;
    why.push(`The 30 days before: ${fmtPLN(prev)}`);
  }
  why.push(tip);

  const draft: DraftAction = {
    cfo: 'tomasz',
    kind: 'cost_cut',
    tier: 'RECOMMENDED',
    execution: 'simulated',
    title,
    why,
    amountPLN: amount,
  };
  return [draft];
};

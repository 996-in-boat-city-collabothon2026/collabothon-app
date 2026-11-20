// Owner: Pair 2 (Person B). Golden rule 1 guard: the model may only REPEAT numbers from the data, never invent them.
// findInventedNumbers(reply, facts) lists every number or date in the reply that does not appear in the facts.
// A non-empty list → the caller throws the reply away and shows a rule-based fallback instead.

/** Small whole numbers (days, counts, months, percents like 5%) are too common to check. */
const MAX_FREE_INTEGER = 31;
const TOLERANCE = 0.006; // 320,25 vs 320.25 → same number

const MONTHS: Record<string, number> = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, września: 9, wrzesnia: 9, października: 10, pazdziernika: 10, listopada: 11, grudnia: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_RE = Object.keys(MONTHS).join('|');

// "2026-12-20" · "20 listopada" / "20. listopada" / "20th of November" · "November 25th"
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:\\.|st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b`, 'gi');
const MONTH_DAY = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi');
// A number: "14 230,00" (space groups must have exactly 3 digits), "12,300.00", "4,27", "1500".
const NUMBER = /\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)*|\d+(?:[.,]\d+)*/g;

const dateKey = (month: number, day: number) => `${month}-${day}`;

/** All the values a written number could mean: "36,000,00" → 36000; "1,500" → 1.5 or 1500; "4,27" → 4.27. */
export function numberValues(raw: string): number[] {
  const s = raw.replace(/[ \u00a0]/g, ' ');
  const parts = s.split(/[ .,]/);
  const seps = s.match(/[ .,]/g) ?? [];
  if (seps.length === 0) return [Number(s)];

  const values = new Set<number>([Number(parts.join(''))]); // every separator = thousands grouping
  const last = parts[parts.length - 1];
  const lastSep = seps[seps.length - 1];
  if (lastSep !== ' ' && last.length <= 3) {
    // the last , or . is the decimal point, everything before it is grouping
    values.add(Number(`${parts.slice(0, -1).join('')}.${last}`));
  }
  return [...values].filter((v) => Number.isFinite(v));
}

/** Dates as "month-day" keys, and every number value, found in a text. */
function scan(text: string): { dates: Set<string>; numbers: number[]; tokens: { raw: string; values: number[] }[] } {
  const dates = new Set<string>();
  let rest = text;

  const years: number[] = [];
  for (const m of text.matchAll(ISO_DATE)) {
    dates.add(dateKey(Number(m[2]), Number(m[3])));
    years.push(Number(m[1]));
  }
  for (const m of text.matchAll(DAY_MONTH)) dates.add(dateKey(MONTHS[m[2].toLowerCase()], Number(m[1])));
  for (const m of text.matchAll(MONTH_DAY)) dates.add(dateKey(MONTHS[m[1].toLowerCase()], Number(m[2])));
  // Dates are checked as dates, so take them out before reading plain numbers (keeps "2026" or "20" from leaking in).
  rest = rest.replace(ISO_DATE, ' ').replace(DAY_MONTH, ' ').replace(MONTH_DAY, ' ');

  const tokens = [...rest.matchAll(NUMBER)].map((m) => ({ raw: m[0].trim(), values: numberValues(m[0].trim()) }));
  return { dates, numbers: [...years, ...tokens.flatMap((t) => t.values)], tokens };
}

/** "25.11" or "25.11.2026" written in a reply may be a date (25 November) as well as a number. */
function asDayMonth(raw: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.\d{4})?$/.exec(raw);
  if (!m) return null;
  const [day, month] = [Number(m[1]), Number(m[2])];
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 ? dateKey(month, day) : null;
}

/**
 * Numbers and dates in `reply` that are not in `facts` (the DATA sent to the model, plus the owner's question).
 * Returns the offending pieces of text, e.g. ["50 230,00", "20 listopada"]. Empty list = the reply is safe.
 */
export function findInventedNumbers(reply: string, facts: string): string[] {
  const known = scan(facts);
  for (const t of known.tokens) {
    const d = asDayMonth(t.raw);
    if (d) known.dates.add(d);
  }
  const isKnown = (v: number) => known.numbers.some((k) => Math.abs(Math.abs(k) - Math.abs(v)) < TOLERANCE);

  const invented: string[] = [];
  const out = scan(reply);

  for (const m of reply.matchAll(ISO_DATE)) {
    if (!known.dates.has(dateKey(Number(m[2]), Number(m[3])))) invented.push(m[0]);
  }
  for (const m of reply.matchAll(DAY_MONTH)) {
    if (!known.dates.has(dateKey(MONTHS[m[2].toLowerCase()], Number(m[1])))) invented.push(m[0]);
  }
  for (const m of reply.matchAll(MONTH_DAY)) {
    if (!known.dates.has(dateKey(MONTHS[m[1].toLowerCase()], Number(m[2])))) invented.push(m[0]);
  }

  for (const t of out.tokens) {
    if (t.values.some((v) => Number.isInteger(v) && v <= MAX_FREE_INTEGER)) continue;
    if (t.values.some(isKnown)) continue;
    const d = asDayMonth(t.raw);
    if (d && known.dates.has(d)) continue;
    invented.push(t.raw);
  }
  return invented;
}

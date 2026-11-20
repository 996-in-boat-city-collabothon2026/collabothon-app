// Owner: Pair 2 (Person B). Golden rule 1 guard: the model may only REPEAT numbers from the data, never invent them.
// findInventedNumbers(reply, facts) lists every number or date in the reply that does not appear in the facts.
// A non-empty list → the caller throws the reply away and shows a rule-based fallback instead.

/** Small whole numbers (days, counts, months) are too common to check. Percents are always checked, see PERCENT. */
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
// A percent: "5%", "5 %", "4,5%", "5 procent", "5-procentowy", "5 proc.", "5 percent". Checked AS A PERCENT:
// "4%" is invented even when the facts say "4 tygodnie", and it is never a free small number.
const PERCENT = /(\d+(?:[.,]\d+)?)\s*(?:%|-?\s*procent\w*|proc\.|percent\b)/gi;
const percentValue = (raw: string) => Number(raw.replace(',', '.'));
const NUMBER = /\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)*|\d+(?:[.,]\d+)*/g;

const dateKey = (month: number, day: number) => `${month}-${day}`;

/** All the values a written number could mean: "36,000,00" → 36000; "1,500" → 1.5 or 1500; "4,27" → 4.27. */
export function numberValues(raw: string): number[] {
  const s = raw.replace(/[ \u00a0]/g, ' ');
  const parts = s.split(/[ .,]/);
  const seps = s.match(/[ .,]/g) ?? [];
  if (seps.length === 0) return [Number(s)];

  // Thousands groups always have 3 digits: "4,27" is never 427, but "1,500" may be 1500.
  const groupsOk = (groups: string[]) => groups.slice(1).every((g) => g.length === 3);
  const values = new Set<number>();
  if (groupsOk(parts)) values.add(Number(parts.join(''))); // every separator = thousands grouping
  const last = parts[parts.length - 1];
  const lastSep = seps[seps.length - 1];
  if (lastSep !== ' ' && last.length <= 3 && groupsOk(parts.slice(0, -1))) {
    // the last , or . is the decimal point, everything before it is grouping
    values.add(Number(`${parts.slice(0, -1).join('')}.${last}`));
  }
  return [...values].filter((v) => Number.isFinite(v));
}

/** Dates as "month-day" keys, and every number value, found in a text. */
function scan(text: string): {
  dates: Set<string>;
  numbers: number[];
  percents: { raw: string; value: number }[];
  tokens: { raw: string; values: number[] }[];
} {
  const dates = new Set<string>();
  const percents = [...text.matchAll(PERCENT)].map((m) => ({ raw: m[0].trim(), value: percentValue(m[1]) }));
  let rest = text;

  const years: number[] = [];
  for (const m of text.matchAll(ISO_DATE)) {
    dates.add(dateKey(Number(m[2]), Number(m[3])));
    years.push(Number(m[1]));
  }
  for (const m of text.matchAll(DAY_MONTH)) dates.add(dateKey(MONTHS[m[2].toLowerCase()], Number(m[1])));
  for (const m of text.matchAll(MONTH_DAY)) dates.add(dateKey(MONTHS[m[1].toLowerCase()], Number(m[2])));
  // Dates are checked as dates, so take them out before reading plain numbers (keeps "2026" or "20" from leaking in).
  // Percents are checked as percents, too.
  rest = rest.replace(ISO_DATE, ' ').replace(DAY_MONTH, ' ').replace(MONTH_DAY, ' ').replace(PERCENT, ' ');

  const tokens = [...rest.matchAll(NUMBER)].map((m) => ({ raw: m[0].trim(), values: numberValues(m[0].trim()) }));
  return { dates, numbers: [...years, ...tokens.flatMap((t) => t.values)], percents, tokens };
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

  for (const p of out.percents) {
    if (!known.percents.some((k) => Math.abs(k.value - p.value) < TOLERANCE)) invented.push(p.raw);
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

// A money amount: "12 300,00 zł", "1500 EUR", "6405,00 PLN". Rates like "4,27 zł" are below MIN_KEY_AMOUNT.
// (no \\b after "zł": in JS regexes "ł" is not a word character)
const MONEY = new RegExp(`(${NUMBER.source})\\s*(?:zł|PLN|EUR|USD)(?![A-Za-z])`, 'gi');
const MIN_KEY_AMOUNT = 100;
const INVOICE_NO = /\bFV\/[\w/]+/g;

/**
 * True when the reply actually uses the facts: at least one money amount (≥ 100) from the facts, or an invoice
 * number from the facts. Live test: "Jak obciąć koszty?" got generic talk with no numbers, and "Kurs euro nie jest
 * problemem" quoted only the rate; such replies are replaced by the rule conclusion.
 */
export function mentionsKeyFact(reply: string, facts: string): boolean {
  const amounts = (text: string) =>
    [...text.matchAll(MONEY)].flatMap((m) => numberValues(m[1].trim())).filter((v) => Math.abs(v) >= MIN_KEY_AMOUNT);
  const known = amounts(facts);
  if (amounts(reply).some((v) => known.some((k) => Math.abs(Math.abs(k) - Math.abs(v)) < TOLERANCE))) return true;
  const invoices = new Set(facts.match(INVOICE_NO) ?? []);
  return (reply.match(INVOICE_NO) ?? []).some((n) => invoices.has(n));
}

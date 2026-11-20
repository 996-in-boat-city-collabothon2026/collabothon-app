// Owner: Pair 2 (Person B). Golden rule 1 guard: the model may only REPEAT numbers from the data, never invent them.
// findInventedNumbers(reply, facts) lists every number or date in the reply that does not appear in the facts.
// A non-empty list → the caller throws the reply away and shows a rule-based fallback instead.

/** Small whole numbers (days, counts, months) are too common to check. Percents and money amounts are always checked. */
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
// An explicit year after the date is kept and checked: "November 25, 2099" is invented when the data says 2026.
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:\\.|st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})(?:,?\\s+(\\d{4}))?\\b`, 'gi');
const MONTH_DAY = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi');
// A number: "14 230,00" (space groups must have exactly 3 digits), "12,300.00", "4,27", "1500".
// A percent: "5%", "5 %", "4,5%", "5 procent", "5-procentowy", "5 proc.", "5 percent". Checked AS A PERCENT:
// "4%" is invented even when the facts say "4 tygodnie", and it is never a free small number.
// The sign is kept: "-5%" and "−5%" (Unicode minus) are a fall, "+5%" a rise.
const PERCENT = /([-−+]\s?)?(\d+(?:[.,]\d+)?)\s*(?:%|-?\s*procent\w*|proc\.|percent\b)/gi;
const percentValue = (raw: string) => Number(raw.replace(',', '.'));

/**
 * Direction of a percent move: +1 rise, -1 fall, 0 not said. "rises 5%" and "falls 5%" have the same number but
 * opposite meaning (review: "A -5% change would cost you 320,25 zł" while the loss is for a 5% RISE of EUR).
 * Order: the sign, then the last direction word before it in the same sentence, then the first one after it.
 */
const UP = /^(?:rise|rises|rising|rose|risen|up|increase|increases|increased|increasing|grow|grows|growing|higher|strengthens?|appreciates?|podroż\p{L}*|wzro\p{L}*|wzroś\p{L}*|rośnie|rosnie)$/iu;
const DOWN = /^(?:fall|falls|falling|fell|fallen|drop|drops|dropping|dropped|down|decrease|decreases|decreased|decreasing|lower|weakens?|depreciates?|stanie\p{L}*|spad\p{L}*|tanieje)$/iu;
const dirOf = (word: string) => (UP.test(word) ? 1 : DOWN.test(word) ? -1 : 0);
function percentDirection(text: string, start: number, end: number, sign?: string): number {
  if (sign) return sign.trim() === '+' ? 1 : -1;
  const before = text.slice(Math.max(0, start - 40), start).split(/[.;:!?]/).pop() ?? '';
  const words = before.match(/\p{L}+/gu) ?? [];
  for (let i = words.length - 1; i >= 0; i--) if (dirOf(words[i])) return dirOf(words[i]);
  const after = text.slice(end, end + 25).split(/[.;:!?,]/)[0];
  for (const w of after.match(/\p{L}+/gu) ?? []) if (dirOf(w)) return dirOf(w);
  return 0;
}

// A money unit right after or right before a number: "17 zł", "1500 EUR", "PLN 17", "€ 17". Every money amount is
// checked against money amounts in the facts, whatever its size (review: "The late fee is 17 zł" slipped through
// as a "small number"). "zł" has no \b after it: in JS regexes "ł" is not a word character.
const UNIT_AFTER = /^\s?(?:zł|złotych|PLN|EUR|USD|euro|€|\$)(?![A-Za-z])/i;
const UNIT_BEFORE = /(?:^|[^A-Za-z])(?:PLN|EUR|USD|€|\$)\s?$/i;
const NUMBER = /\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)*|\d+(?:[.,]\d+)*/g;

const dateKey = (month: number, day: number) => `${month}-${day}`;
const fullKey = (year: number, month: number, day: number) => `${year}-${month}-${day}`;
/** A minus sign (or the word) right before a number: "-20 275,00 zł", "−20 275", "minus 20 275". */
const NEGATIVE_BEFORE = /(?:[-−]\s?|minus\s+)$/i;
/** A negative told in words: "a negative balance of 20 275,00 zł", "20 275,00 zł below zero / in the red". */
const NEGATIVE_WORDS_BEFORE = /\b(?:negative|ujemn\w*)(?:\s+(?:balance|saldo))?(?:\s+(?:of|wynosi|do))?\s+$/i;
const NEGATIVE_WORDS_AFTER = /^\s*(?:zł|PLN)?\s*(?:below zero|in the red|in minus|pod kreską|na minusie)/i;

/** All dates in a text: "month-day" keys, plus "year-month-day" keys when the year is written. */
interface Dates { md: Set<string>; full: Set<string>; mdNoYear: Set<string> }
function addDate(d: Dates, month: number, day: number, year?: number) {
  d.md.add(dateKey(month, day));
  if (year) d.full.add(fullKey(year, month, day));
  else d.mdNoYear.add(dateKey(month, day));
}

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

/** Dates, percents and every number (with its sign) found in a text. */
function scan(text: string): {
  dates: Dates;
  numbers: { value: number; neg: boolean; money: boolean }[];
  percents: { raw: string; value: number; dir: number }[];
  tokens: { raw: string; values: number[]; neg: boolean; money: boolean }[];
} {
  const dates: Dates = { md: new Set(), full: new Set(), mdNoYear: new Set() };
  const percents = [...text.matchAll(PERCENT)].map((m) => ({
    raw: m[0].trim(),
    value: percentValue(m[2]),
    dir: percentDirection(text, m.index!, m.index! + m[0].length, m[1]),
  }));

  const years: number[] = [];
  for (const m of text.matchAll(ISO_DATE)) {
    addDate(dates, Number(m[2]), Number(m[3]), Number(m[1]));
    years.push(Number(m[1]));
  }
  for (const m of text.matchAll(DAY_MONTH)) {
    addDate(dates, MONTHS[m[2].toLowerCase()], Number(m[1]), m[3] ? Number(m[3]) : undefined);
    if (m[3]) years.push(Number(m[3])); // "November 25, 2026" in the facts → "in 2026" in a reply is known
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    addDate(dates, MONTHS[m[1].toLowerCase()], Number(m[2]), m[3] ? Number(m[3]) : undefined);
    if (m[3]) years.push(Number(m[3]));
  }
  // Dates are checked as dates, so take them out before reading plain numbers (keeps "2026" or "20" from leaking in).
  // Percents are checked as percents, too.
  const rest = text.replace(ISO_DATE, ' ').replace(DAY_MONTH, ' ').replace(MONTH_DAY, ' ').replace(PERCENT, ' ');

  const tokens = [...rest.matchAll(NUMBER)].map((m) => {
    const before = rest.slice(Math.max(0, m.index! - 30), m.index);
    const after = rest.slice(m.index! + m[0].length, m.index! + m[0].length + 25);
    return {
      raw: m[0].trim(),
      values: numberValues(m[0].trim()),
      neg: NEGATIVE_BEFORE.test(before.slice(-7)) || NEGATIVE_WORDS_BEFORE.test(before) || NEGATIVE_WORDS_AFTER.test(after),
      money: UNIT_AFTER.test(after) || UNIT_BEFORE.test(before),
    };
  });
  const numbers = [
    ...years.map((value) => ({ value, neg: false, money: false })),
    ...tokens.flatMap((t) => t.values.map((value) => ({ value, neg: t.neg, money: t.money }))),
  ];
  return { dates, numbers, percents, tokens };
}

/** "25.11" or "25.11.2026" written in a reply may be a date (25 November) as well as a number. */
function asDayMonth(raw: string): { md: string; full?: string } | null {
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(raw);
  if (!m) return null;
  const [day, month] = [Number(m[1]), Number(m[2])];
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { md: dateKey(month, day), full: m[3] ? fullKey(Number(m[3]), month, day) : undefined };
}

/**
 * Numbers and dates in `reply` that are not in `facts` (ONLY the rule output sent to the model: never the owner's
 * question or the meeting topic, they cannot make a number true). Also invented: a known amount with the wrong
 * sign ("20 275 zł" for a forecast of -20 275 zł) and a known day with a wrong year ("November 25, 2099").
 * Returns the offending pieces of text, e.g. ["50 230,00", "20 listopada"]. Empty list = the reply is safe.
 */
export function findInventedNumbers(reply: string, facts: string): string[] {
  const known = scan(facts);
  for (const t of known.tokens) {
    const d = asDayMonth(t.raw);
    if (!d) continue;
    known.dates.md.add(d.md);
    if (d.full) known.dates.full.add(d.full);
    else known.dates.mdNoYear.add(d.md);
  }
  /** A money amount must match a money amount of the facts ("17 days" never makes "17 zł" true). */
  const isKnown = (v: number, neg: boolean, money: boolean) =>
    known.numbers.some((k) => Math.abs(k.value - v) < TOLERANCE && k.neg === neg && (!money || k.money));
  /** A date with a year must match a known full date; without a year, any known day and month is fine. */
  const knownDate = (month: number, day: number, year?: number) =>
    year ? known.dates.full.has(fullKey(year, month, day)) || known.dates.mdNoYear.has(dateKey(month, day)) : known.dates.md.has(dateKey(month, day));

  const invented: string[] = [];
  const out = scan(reply);

  for (const m of reply.matchAll(ISO_DATE)) {
    if (!knownDate(Number(m[2]), Number(m[3]), Number(m[1]))) invented.push(m[0]);
  }
  for (const m of reply.matchAll(DAY_MONTH)) {
    if (!knownDate(MONTHS[m[2].toLowerCase()], Number(m[1]), m[3] ? Number(m[3]) : undefined)) invented.push(m[0].trim());
  }
  for (const m of reply.matchAll(MONTH_DAY)) {
    if (!knownDate(MONTHS[m[1].toLowerCase()], Number(m[2]), m[3] ? Number(m[3]) : undefined)) invented.push(m[0].trim());
  }

  // Same value, and never the opposite direction: "-5%" or "falls 5%" when the facts say "rises 5%" is invented.
  // A percent with no direction in the reply ("5% risk") or in the facts ("markup below 25%") needs only the value.
  for (const p of out.percents) {
    const ok = known.percents.some((k) => Math.abs(k.value - p.value) < TOLERANCE && (k.dir === 0 || p.dir === 0 || k.dir === p.dir));
    if (!ok) invented.push(p.raw);
  }

  for (const t of out.tokens) {
    if (!t.neg && !t.money && t.values.some((v) => Number.isInteger(v) && v <= MAX_FREE_INTEGER)) continue;
    if (t.values.some((v) => isKnown(v, t.neg, t.money))) continue;
    const d = asDayMonth(t.raw);
    if (d && (d.full ? known.dates.full.has(d.full) || known.dates.mdNoYear.has(d.md) : known.dates.md.has(d.md))) continue;
    invented.push(t.neg ? `-${t.raw}` : t.raw);
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

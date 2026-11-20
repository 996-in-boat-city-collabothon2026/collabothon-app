// Owner: Pair 2 (Person B). Golden rule 1 guard: the model may only REPEAT numbers from the data, never invent them.
// findInventedNumbers(reply, facts) lists every number or date in the reply that does not appear in the facts.
// A non-empty list → the caller throws the reply away and shows a rule-based fallback instead.

/** Small whole numbers (days, counts, months) are too common to check. Percents and money amounts are always checked. */
const MAX_FREE_INTEGER = 31;
const TOLERANCE = 0.006; // 320,25 vs 320.25 → same number

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_RE = Object.keys(MONTHS).join('|');

// "2026-12-20" · "20 November" / "20th of November" · "November 25th"
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
// An explicit year after the date is kept and checked: "November 25, 2099" is invented when the data says 2026.
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:\\.|st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})(?:,?\\s+(\\d{4}))?\\b`, 'gi');
const MONTH_DAY = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi');
// A number: "14 230,00" (space groups must have exactly 3 digits), "12,300.00", "4,27", "1500".
// A percent: "5%", "5 %", "4,5%", "5 percent", "5 per cent". Checked AS A PERCENT:
// "4%" is invented even when the facts say "4 tygodnie", and it is never a free small number.
// The sign is kept: "-5%" and "−5%" (Unicode minus) are a fall, "+5%" a rise.
const PERCENT = /([-−+]\s?)?(\d+(?:[.,]\d+)?)\s*(?:%|-?\s*percent\b|\s*per cent\b)/gi;
const percentValue = (raw: string) => Number(raw.replace(',', '.'));

/**
 * Direction of a percent move of a currency: +1 the currency gets stronger, -1 weaker, 0 not said.
 * "rises 5%" and "falls 5%" have the same number but opposite meaning. Review of fc04703: "A -5% change would cost
 * you 320,25 zł"; review of 8d96df5: "A 5% depreciation would cost you 320,25 zł" (the loss is for a 5% RISE of EUR).
 * Order: the sign; then a direction word right after the percent ("5% depreciation"); then the last one before it.
 * Only the percent's own clause counts, so "EUR is rising, so a 5% depreciation …" is a depreciation.
 * When the subject of the move is the złoty ("if the złoty weakens 5%"), the euro moves the other way.
 */
const UP = /^(?:rise|rises|rising|rose|risen|up|increase|increases|increased|increasing|grow|grows|growing|grew|higher|stronger|strengthen|strengthens|strengthened|strengthening|appreciate|appreciates|appreciated|appreciating|appreciation|gain|gains|gained|climb|climbs|climbed|jump|jumps|jumped|surge|surges|surged)$/iu;
const DOWN = /^(?:fall|falls|falling|fell|fallen|drop|drops|dropping|dropped|down|decrease|decreases|decreased|decreasing|decline|declines|declined|declining|lower|weaker|weaken|weakens|weakened|weakening|depreciate|depreciates|depreciated|depreciating|depreciation|slide|slides|slid|sink|sinks|sank|loses|lost|slump|slumps|slumped|dip|dips|dipped|plunge|plunges|plunged|tumble|tumbles|tumbled)$/iu;
const dirOf = (word: string) => (UP.test(word) ? 1 : DOWN.test(word) ? -1 : 0);
const PCT_CLAUSE = /[.;:!?,](?=\s|$)|\b(?:and|but|so|while|whereas|although|though|then|yet)\b/i;
/** First currency NAME in the clause (not an amount unit like "1500 EUR" or "320,25 zł"): is it the złoty? */
function zlotyIsSubject(clause: string): boolean {
  for (const m of clause.matchAll(/(\d\s?)?(?<![\p{L}])(złoty|zloty|zlotys|PLN|euro|euros|EUR|USD|dollars?)(?![\p{L}])/giu)) {
    if (m[1]) continue; // "1500 EUR", "6405 PLN": an amount, not the subject
    return /^(?:złoty|zloty|zlotys|PLN)$/i.test(m[2]);
  }
  return false;
}
function percentDirection(text: string, start: number, end: number, sign?: string): number {
  if (sign) return sign.trim() === '+' ? 1 : -1;
  const after = text.slice(end, end + 40).split(PCT_CLAUSE)[0];
  const before = text.slice(Math.max(0, start - 60), start).split(PCT_CLAUSE).pop() ?? '';
  const flip = zlotyIsSubject(`${before} ${after}`) ? -1 : 1;
  for (const w of (after.match(/\p{L}+/gu) ?? []).slice(0, 4)) if (dirOf(w)) return dirOf(w) * flip;
  const words = before.match(/\p{L}+/gu) ?? [];
  for (let i = words.length - 1; i >= 0; i--) if (dirOf(words[i])) return dirOf(words[i]) * flip;
  return 0;
}

// A money unit right after or right before a number: "17 zł", "1500 EUR", "PLN 17", "€ 17". Every money amount is
// checked against money amounts in the facts, whatever its size (review: "The late fee is 17 zł" slipped through
// as a "small number"). "zł" has no \b after it: in JS regexes "ł" is not a word character.
// Any currency, not only the shop's: review of bc24564 found "You owe an extra £17." and "17 GBP" passing as a
// free small number. A currency symbol before the number or an ISO code after it makes the number a money amount.
const CURRENCY_WORDS = 'zł|zl|złoty|złotych|zlotych|zloty|zlotys|PLN|EUR|euros?|€|USD|dollars?|bucks|\\$|GBP|pounds?|quid|£|CHF|francs?|JPY|yen|¥|CZK|SEK|NOK|DKK|HUF|UAH|CNY|CAD|AUD';
const UNIT_AFTER = new RegExp(`^\\s?-?\\s?(${CURRENCY_WORDS})(?![\\p{L}])`, 'iu');
const UNIT_BEFORE = /(?:^|[^\p{L}])(zł|PLN|EUR|€|USD|\$|GBP|£|CHF|JPY|¥|S?Fr\.?|kr\.?)\s?-?\s?$/iu;
/**
 * "zł", "złotych", "PLN" → "PLN"; "euro", "€" → "EUR"; "$" → "USD"; "£" → "GBP"; other codes as written.
 * An alias that names no single currency ("bucks", "quid", "pounds", "dollars", "Fr.", "francs", "kr") stays an
 * unknown currency: it is still a money amount (no small-number exception) and never matches a fact
 * (review of f5f7df5: "The surcharge is 17 bucks / 17 quid / Fr. 17" passed).
 */
const ALIAS = /^(?:bucks|quid|pounds?|dollars?|s?fr\.?|francs?|kr\.?)$/i;
function currencyOf(unit?: string): string {
  if (!unit) return '';
  if (ALIAS.test(unit)) return `unknown:${unit.toLowerCase()}`;
  if (/^(?:eur|euros?|€)$/i.test(unit)) return 'EUR';
  if (/^(?:usd|dollars?|\$)$/i.test(unit)) return 'USD';
  if (/^(?:gbp|pounds?|£)$/i.test(unit)) return 'GBP';
  if (/^(?:chf|francs?)$/i.test(unit)) return 'CHF';
  if (/^(?:jpy|yen|¥)$/i.test(unit)) return 'JPY';
  if (/^(?:zł|zl|złoty|złotych|zlotych|zloty|zlotys|pln)$/i.test(unit)) return 'PLN';
  return unit.toUpperCase();
}

/**
 * Is the amount told as a loss (-1), a gain (+1), both (AMBIGUOUS) or neither (0)?
 * Review of bc24564: "If EUR rises 5%, you gain 320,25 zł." passed although the rule says 320,25 zł is the LOSS.
 * Review of f5f7df5: "you gain, even after fees, 320,25 zł", "you come out 320,25 zł ahead", "you are 320,25 zł
 * better off", "you make 320,25 zł", "a 320,25 zł windfall" passed, and the true "you do not gain 320,25 zł" failed.
 *   - Before the amount: every gain/loss word in the amount's own clause (an aside like ", even after fees," stays in
 *     the clause). "make"/"pocket" count only right before the amount ("you make 320,25 zł", not "make a payment of").
 *   - After the amount: "ahead", "better off", "richer", "windfall", "in profit" / "loss", "worse off", "poorer".
 *   - A negated word ("do not gain", "won't lose") says nothing.
 *   - Gain and loss words for the same amount → AMBIGUOUS: the caller uses the rule text when the rule tells it.
 * "costs you", "risk" and "missing" are neutral on purpose: only a contradiction with the rule is caught.
 */
export const AMBIGUOUS = 2;
const LOSS_WORD = /^(?:lose|loses|losing|lost|loss|losses)$/i;
const GAIN_WORD = /^(?:gain|gains|gained|gaining|earn|earns|earned|earning|profit|profits|win|wins|won|benefit|benefits|windfall)$/i;
const GAIN_NEAR = /^(?:make|makes|making|made|pocket|pockets|pocketed)$/i;
const NEGATION_BEFORE = /(?:\b(?:not|never|no)|n't)\s+(?:\p{L}+\s+)?$/iu;
const GAIN_AFTER = /^\s*(?:zł|PLN|EUR|USD|€)?\s*(?:more\s+)?(?:ahead|better off|richer|windfall|in profit|in the black|profit|gain|bonus)\b/i;
const LOSS_AFTER = /^\s*(?:zł|PLN|EUR|USD|€)?\s*(?:worse off|poorer|loss|losses|in the red|down)\b/i;
// Clauses end at a sentence end or a coordinator, NOT at a comma: "you gain, even after fees, 320,25 zł".
const OUTCOME_CLAUSE = /[.;!?](?=\s|$)|\b(?:and|but|so|while|whereas)\b/i; // not "or": "gain or lose X" is ambiguous
function outcomeOf(text: string, start: number, end: number): number {
  const window = text.slice(Math.max(0, start - 70), start);
  const clause = window.split(OUTCOME_CLAUSE).pop() ?? '';
  const words = [...clause.matchAll(/\p{L}+/gu)];
  const found = new Set<number>();
  words.forEach((m, i) => {
    const w = m[0];
    const near = words.length - 1 - i <= 0; // the word right before the amount
    const dir = LOSS_WORD.test(w) ? -1 : GAIN_WORD.test(w) || (near && GAIN_NEAR.test(w)) ? 1 : 0;
    if (dir && !NEGATION_BEFORE.test(clause.slice(0, m.index))) found.add(dir);
  });
  const after = text.slice(end, end + 30).split(/[.;!?](?=\s|$)/)[0];
  if (GAIN_AFTER.test(after)) found.add(1);
  if (LOSS_AFTER.test(after)) found.add(-1);
  if (found.size > 1) return AMBIGUOUS;
  return found.size ? [...found][0] : 0;
}

/**
 * Money written in a form this guard cannot read: number words ("fifteen thousand euro"), "17,-", "15k zł",
 * "2 tys. zł", "1,5 mln". Any of them → the whole reply falls back (review of 8d96df5: "Add a fee of 17,-." and
 * "fifteen thousand euro" passed next to a true VAT figure).
 */
const NUM_WORD = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen)';
const MONEY_UNIT = '(?:zł|zl|złot\\p{L}*|zlot\\p{L}*|PLN|EUR|euros?|USD|dollars?|bucks|€|\\$)';
const UNREADABLE_MONEY = [
  new RegExp(`(?<![\\p{L}])${NUM_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUM_WORD})*[\\s-]+${MONEY_UNIT}(?![\\p{L}])(?!\\s+(?:invoices?|rates?|exposure|contracts?|risk|position|bills?))`, 'giu'),
  /(?<![\d.,])\d+(?:[.,]\d+)?\s?[.,]-/g, // "17,-", "17.-"
  /(?<![\d.,])\d+(?:[.,]\d+)?\s?(?:k|K|tys\.?|mln|mld|bn)(?![\p{L}])/gu, // "15k", "2 tys.", "1,5 mln"
];
export const unreadableMoney = (text: string): string[] => UNREADABLE_MONEY.flatMap((re) => [...text.matchAll(re)].map((m) => m[0].trim()));
const NUMBER = /\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)*|\d+(?:[.,]\d+)*/g;

const dateKey = (month: number, day: number) => `${month}-${day}`;
const fullKey = (year: number, month: number, day: number) => `${year}-${month}-${day}`;
/** A minus sign (or the word) right before a number: "-20 275,00 zł", "−20 275", "minus 20 275". */
const NEGATIVE_BEFORE = /(?:[-−]\s?|minus\s+)$/i;
/** A negative told in words: "a negative balance of 20 275,00 zł", "20 275,00 zł below zero / in the red". */
const NEGATIVE_WORDS_BEFORE = /\b(?:negative|ujemn\w*)(?:\s+(?:balance|saldo))?(?:\s+(?:of|wynosi|do))?\s+$/i;
const NEGATIVE_WORDS_AFTER = /^\s*(?:zł|PLN)?\s*(?:below zero|in the red|in minus)/i;

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
  numbers: { value: number; neg: boolean; cur: string; outcome: number }[];
  percents: { raw: string; value: number; dir: number }[];
  tokens: { raw: string; values: number[]; neg: boolean; cur: string; outcome: number }[];
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
      cur: currencyOf(UNIT_AFTER.exec(after)?.[1] ?? UNIT_BEFORE.exec(before)?.[1]),
      outcome: outcomeOf(rest, m.index!, m.index! + m[0].length),
    };
  });
  const numbers = [
    ...years.map((value) => ({ value, neg: false, cur: '', outcome: 0 })),
    ...tokens.flatMap((t) => t.values.map((value) => ({ value, neg: t.neg, cur: t.cur, outcome: t.outcome }))),
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
 * Returns the offending pieces of text, e.g. ["50 230,00", "December 24"]. Empty list = the reply is safe.
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
  /**
   * A money amount must match a money amount of the facts with the same currency and sign: "17 days" never makes
   * "17 zł" true, "14 230 zł" never makes "14 230 EUR" true, "-20 275 zł" never makes "20 275 zł" true.
   */
  const isKnown = (v: number, neg: boolean, cur: string) =>
    known.numbers.some((k) => Math.abs(k.value - v) < TOLERANCE && k.neg === neg && (!cur || k.cur === cur));
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

  /** The rule told this same amount the other way round: a loss in the facts, a gain in the reply (or back). */
  const contradicts = (v: number, cur: string, outcome: number) =>
    outcome !== 0 &&
    known.numbers.some(
      (k) => Math.abs(k.value - v) < TOLERANCE && (!cur || k.cur === cur) && k.outcome !== 0 && (outcome === AMBIGUOUS || k.outcome === -outcome),
    );

  for (const t of out.tokens) {
    if (t.values.some((v) => contradicts(v, t.cur, t.outcome))) {
      invented.push(`${t.outcome === AMBIGUOUS ? 'gain or loss' : t.outcome > 0 ? 'gain' : 'loss'} ${t.raw}`);
      continue;
    }
    if (!t.neg && !t.cur && t.values.some((v) => Number.isInteger(v) && v <= MAX_FREE_INTEGER)) continue;
    if (t.values.some((v) => isKnown(v, t.neg, t.cur))) continue;
    const d = asDayMonth(t.raw);
    if (d && (d.full ? known.dates.full.has(d.full) || known.dates.mdNoYear.has(d.md) : known.dates.md.has(d.md))) continue;
    invented.push(t.neg ? `-${t.raw}` : t.raw);
  }
  invented.push(...unreadableMoney(reply));
  return invented;
}

// A money amount: "12 300,00 zł", "1500 EUR", "6405,00 PLN". Rates like "4,27 zł" are below MIN_KEY_AMOUNT.
// (no \\b after "zł": in JS regexes "ł" is not a word character)
const MONEY = new RegExp(`(${NUMBER.source})\\s*(?:zł|PLN|EUR|USD)(?![A-Za-z])`, 'gi');
const MIN_KEY_AMOUNT = 100;
const INVOICE_NO = /\bFV\/[\w/]+/g;

/**
 * True when the reply actually uses the facts: at least one money amount (≥ 100) from the facts, or an invoice
 * number from the facts. Live test: "How can I cut costs?" got generic talk with no numbers, and "The euro is not
 * a problem" quoted only the rate; such replies are replaced by the rule conclusion.
 */
export function mentionsKeyFact(reply: string, facts: string): boolean {
  const amounts = (text: string) =>
    [...text.matchAll(MONEY)].flatMap((m) => numberValues(m[1].trim())).filter((v) => Math.abs(v) >= MIN_KEY_AMOUNT);
  const known = amounts(facts);
  if (amounts(reply).some((v) => known.some((k) => Math.abs(Math.abs(k) - Math.abs(v)) < TOLERANCE))) return true;
  const invoices = new Set(facts.match(INVOICE_NO) ?? []);
  return (reply.match(INVOICE_NO) ?? []).some((n) => invoices.has(n));
}

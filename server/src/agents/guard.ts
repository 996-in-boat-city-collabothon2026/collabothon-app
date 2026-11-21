// Owner: Pair 2 (Person A). Rebuild 2 (docs/AGENTS-8B-PLAN.md): the 8B model writes its own answer, and this guard
// decides whether the owner may see it. Golden rule 1: every number on screen must come from the rules. A reply with
// a number the facts do not have is never shown; the caller shows the rule summary instead.
import { fmtPLN } from '../domain/money';
import type { CfoFacts } from './facts';
import { looksPolish } from './safety';

export const MAX_SENTENCES = 3;
export const MAX_CHARS = 400;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * One number, in any way the model writes it:
 * - "14 230,00" / "14 230.00" / "14 230"   groups of 3 digits split by spaces, optional cents   (our format, fmtPLN)
 * - "14,230" / "14,230.00" / "20,275,00"  groups of 3 digits split by commas, optional cents   (English format)
 * - "4,27" / "4.27" / "1500"              a plain number, comma or dot as the decimal point
 * Live run (PR #22): "1,700.00 zł" was read as 1700 AND 0, so good answers fell back. Cents belong to the number.
 */
const NUMBER = /\d{1,3}(?: \d{3})+(?!\d)(?:[.,]\d+)?|\d{1,3}(?:,\d{3})+(?:[.,]\d{2})?(?![\d,])|\d+(?:[.,]\d+)?/g;
/** A short date "20.12" or "25.11.2026": day and month (and year) are separate numbers, not the decimal 20.12. */
const SHORT_DATE = /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/g;

/** "14 230,00" → 14230, "14,230.00" → 14230, "4,27" → 4.27. */
function toValue(token: string): number {
  if (/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(token)) return Number(token.replace(/ /g, '').replace(',', '.'));
  if (/^\d{1,3}(,\d{3})+([.,]\d{2})?$/.test(token)) {
    const cents = /[.,]\d{2}$/.test(token) ? token.slice(-2) : '';
    const whole = cents ? token.slice(0, -3) : token;
    return Number(whole.replace(/,/g, '') + (cents ? `.${cents}` : ''));
  }
  return Number(token.replace(',', '.'));
}

/**
 * Every number in a text as a value. Signs are ignored ("-20 275,00 zł", "minus 20 275 zł" and "20 275 zł in the
 * red" are all 20275), so the guard checks the amount, not how the model words the minus.
 */
export function numbersIn(text: string): number[] {
  // fmtPLN puts a non-breaking space (U+00A0, or U+202F) between thousands: read it as a normal space.
  let t = text.replace(/[  ]/g, ' ');
  // ONE digit between two capital letters is part of a form name, not an amount: "JPK_V7M" (live run on 8B: read
  // as 7). Anything else is still checked: "200zł", "EUR1500" and "EUR99999zł" (review of PR #29) are amounts.
  t = t.replace(/(?<=\p{Lu})\d(?=\p{Lu})/gu, '');
  const found: number[] = [];
  t = t.replace(SHORT_DATE, (whole, d: string, m: string, y?: string) => {
    // "4.27" is a rate and "15.00" is money (month 00), not dates
    if (Number(d) < 1 || Number(d) > 31 || Number(m) < 1 || Number(m) > 12) return whole;
    found.push(Number(d), Number(m), ...(y ? [Number(y)] : []));
    return ' ';
  });
  for (const token of t.match(NUMBER) ?? []) found.push(toValue(token));
  return found;
}

/** The numbers the facts allow, plus the month number of every month named there ("December 20" allows "20.12"). */
function allowedNumbers(facts: CfoFacts): number[] {
  const text = [...facts.lines, facts.summary].join(' ');
  // Only a month followed by a day: the verb "may" is not the month May.
  const months = MONTHS.flatMap((m, i) => (new RegExp(`\\b${m} \\d`, 'i').test(text) ? [i + 1] : []));
  return [...numbersIn(text), ...months];
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Sentence ends: ".", "!" or "?" followed by a capital letter or the end ("Sp. z o.o." and "4.27" do not count). */
const sentences = (text: string) => (text.trim().match(/[.!?]+(?=\s+[A-Z„"]|\s*$)/g) ?? []).length || 1;

/**
 * Golden rule 3: nothing is done until the owner approves it, and all execution is simulated. Replies that say
 * something already happened are false ("I've opened a credit line", "the reminder is on its way", "VAT was paid").
 * Every phrase here was written by the real model (agents/review-corpus.ts).
 */
const CLAIMS_DONE = new RegExp([
  String.raw`\b(?:i|we)(?:'ve| have)? (?:sent|opened|locked|paid|approved|decided|agreed|set up|fixed|corrected)\b`,
  String.raw`\b(?:is|are) now (?:active|covered|open)\b`,
  // Live run (PR #22): "The credit line is open, but I advise against using it yet." No fact uses these words.
  String.raw`\b(?:is|are) (?:already )?(?:open|opened|active|paid|sent|approved|locked|done)\b`,
  String.raw`\b(?:was|were|has been|have been|got) (?:paid|sent|reminded|approved|accepted|opened|set up)\b`,
  String.raw`\bit'?s done\b|\bhas paid\b|\bpaid its\b|\bon its way\b|\bis sorted\b|\bis complete\b|\bwent out\b`,
  String.raw`\b(?:received|accepted|took) (?:your|the)\b|\bgot its money\b|\bleft your account\b|\b(?:you|the owner) approved\b`,
].join('|'), 'i');

/** The facts give exact dates ("November 25, 2026, in 5 days"). A different "when" is made up ("due tomorrow"). */
const WHEN = /\b(?:tomorrow|yesterday|next week|this week|overdue|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;

/**
 * May the owner see this reply? Not when it is empty, too long, Polish, says something was already done, names a
 * "when" the facts do not have, or has a number the facts do not have.
 * The owner's question is never part of the facts: "Is my VAT 99 999 zł?" cannot put 99 999 on screen.
 */
export function checkReply(reply: string, facts: CfoFacts): { ok: boolean; reason: string } {
  const text = reply.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_CHARS || sentences(text) > MAX_SENTENCES) return { ok: false, reason: 'too long' };
  if (looksPolish(text)) return { ok: false, reason: 'polish' };
  if (CLAIMS_DONE.test(text)) return { ok: false, reason: 'claims it was done' };
  const factText = [...facts.lines, facts.summary].join(' ').toLowerCase();
  // "overdue" is fine where the facts say "late" (Anna's customers), never for a tax that is not late yet.
  const inFacts = (w: string) => factText.includes(w) || (w === 'overdue' && factText.includes(' late'));
  const when = (text.match(WHEN) ?? []).find((w) => !inFacts(w.toLowerCase()));
  if (when) return { ok: false, reason: `time not in facts: ${when.toLowerCase()}` };
  const allowed = allowedNumbers(facts);
  const wrong = numbersIn(text).find((n) => !allowed.some((a) => same(a, n)));
  if (wrong !== undefined) return { ok: false, reason: `number not in facts: ${wrong}` };
  return { ok: true, reason: '' };
}

/** English money before "zł": "14,230.00 zł", "36,000 zł", "4.27 zł". Our format ("14 230,00 zł") does not match. */
const ENGLISH_MONEY = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})\s?zł/g;

/**
 * Golden rule 6: money on screen is "14 230,00 zł". The 8B model often writes "14,230.00 zł" (live run on 8B: 6 of 8
 * chair sentences). Call this AFTER checkReply: the value stays the same, only the way it is written changes.
 */
export function tidyMoney(text: string): string {
  return text.replace(ENGLISH_MONEY, (_whole, n: string) => fmtPLN(Number(n.replace(/,/g, ''))));
}

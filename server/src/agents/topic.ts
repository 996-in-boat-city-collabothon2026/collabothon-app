// Owner: Pair 2 (Person B). Who answers a question, who leads a meeting, and what is only small talk.
// Keywords only: no model call, so this is fast and always gives the same answer.
import { CFOS, type ChatLine, type CfoId } from '@cfo/shared';

// Pick the CFO by keywords. Each CFO scores 1 point per matching word group; the highest
// score wins. Ties and no match → Anna. Short words use \b so "pit" doesn't match "hospital", "vat" not "private".
// (Moved unchanged from routes/boardroom.ts.)
const TOPICS: Record<CfoId, RegExp[]> = {
  anna: [
    /liquid|cash|money|balance|account/i,
    /credit|loan|lend|borrow|overdraft|deposit|saving/i,
    /survive|solven|bankrupt|forecast|buffer|run out/i,
    /overdue|debtor|late pay|not paid|unpaid|reminder|collect|receivabl/i,
  ],
  kasia: [
    /\beur|euro|\busd\b|dollar|currenc|\bfx\b|\bnbp\b/i,
    /exchange rate|hedg|forward/i,
    /german|krause|weber|foreign|import/i,
    // Live run 1: "What rate would you lock?", "Should I worry about the złoty?" went to Anna.
    /zł?oty|zloty|\block\b|exchange/i,
  ],
  marek: [
    /\bvat\b|\bzus\b|\bpit\b|\bcit\b|\btax|jpk/i,
    /ksef|invoice|\bupo\b|\bnip\b|e-invoic|rejected/i,
    /declarat|deadline|due date/i,
  ],
  tomasz: [
    /cost|expens|saving|\bcut/i,
    /margin|profit|markup/i,
    /price|pricing|rate per hour|hourly rate|labou?r/i,
    /parts|wholesal|supplier|utilities|electricity/i,
    /quick win|cheap|save money|waste/i, // live run 1: "What is the cheapest quick win?" went to Anna
    // Setting a price (review of bc24564: both went to Anna). "charge" alone is too broad ("will the bank charge me"),
    // and "ask" only with customers (review of f5f7df5: "How much should I ask the bank to lend me?" is a loan).
    /\b(?:how much|what)\s+(?:should|do|can|must)\s+(?:i|we)\s+(?:charge|bill|ask\s+(?:my\s+)?(?:customers?|clients?))\b|\bcharge\s+(?:per\s+hour|an?\s+hour|by\s+the\s+hour|for\s+(?:an?|the|my|this)\s+\w+|customers|clients)\b/i,
  ],
};

/** "Kasia, ...?" → the CFO the owner asked by name, if any. */
function namedCfo(text: string): CfoId | undefined {
  return (Object.keys(CFOS) as CfoId[]).find((c) => new RegExp(`\\b${CFOS[c].name}`, 'i').test(text));
}

/** The CFO with the most matching keyword groups, or null when no keyword matches. A tie keeps the first (Anna first). */
function bestByKeywords(text: string): CfoId | null {
  let best: CfoId | null = null;
  let bestScore = 0;
  for (const [cfo, groups] of Object.entries(TOPICS) as [CfoId, RegExp[]][]) {
    const score = groups.filter((re) => re.test(text)).length;
    if (score > bestScore) [best, bestScore] = [cfo, score];
  }
  return best;
}

/** True when the text names this CFO or hits one of its keyword groups. The meeting uses it to decide who passes. */
export function matchesTopic(cfo: CfoId, text: string): boolean {
  return namedCfo(text) === cfo || TOPICS[cfo].some((re) => re.test(text));
}

/** Who leads a meeting. null = a general topic ("Monthly review"): everyone speaks. */
export function leadFor(topic: string): CfoId | null {
  return namedCfo(topic) ?? bestByKeywords(topic);
}

/** Who answers a bubble question. Always a CFO: no match → Anna. */
export function pickCfo(question: string): CfoId {
  return leadFor(question) ?? 'anna';
}

// "How much would IT cost?" points back at the chat: there "cost" or "how much" is about what was just said, not
// Tomasz's costs (B4 live check: it went to Tomasz after Kasia's EUR answer).
const POINTS_BACK = /\b(?:it|that|this|those|them)\b/i;
const MONEY_WORDS = /\b(?:how much|costs?|price[sd]?|cheap\w*|expensive|sav(?:e|ing)s?)\b/gi;

/**
 * Who answers a follow-up in a chat ("Why?", "And next month?"). A named CFO or a keyword match wins, so
 * "When is VAT due?" still goes to Marek. Otherwise the CFO who answered the owner's last question stays: the FIRST
 * one after it, because after a meeting the lead speaks first and the others only react. No CFO in the history →
 * pickCfo (Anna).
 */
export function followUpCfo(question: string, history: ChatLine[] = []): CfoId {
  const isCfo = (line: ChatLine) => line.from === 'cfo' && line.cfo;
  const lastOwner = history.map((line) => line.from).lastIndexOf('owner');
  const answer = history.slice(lastOwner + 1).find(isCfo) ?? [...history].reverse().find(isCfo);
  // With "it/that/this" and someone to point back at, money words alone do not switch the CFO.
  const topic = answer && POINTS_BACK.test(question) ? question.replace(MONEY_WORDS, ' ') : question;
  return leadFor(topic) ?? answer?.cfo ?? pickCfo(question);
}

// Greetings and thanks (English and Polish, with or without Polish letters).
// Lookarounds instead of \b, because \b does not see "ś" or "ć" as letters.
const GREETING = /(?<!\p{L})(?:hello|hi|hey|thanks|thank you|good (?:morning|afternoon|evening)|cześć|czesc|dzień dobry|dzien dobry)(?!\p{L})/giu;

/**
 * True for "hello", "Hi!", "thanks", "?" or "ok": nothing to talk about, so no CFO needs to answer.
 * After removing greetings, fewer than 2 words of 3+ letters is small talk ("Hi, how do I improve the margin?" is not).
 * A finance keyword or a CFO's name is never small talk, so "Margin", "EUR" or "Kasia?" still starts a meeting.
 */
export function isSmallTalk(text: string): boolean {
  // A finance keyword or a CFO's name ("Kasia?") means the owner wants an answer (review of PR #22).
  if (bestByKeywords(text) || namedCfo(text)) return false;
  const words = text.replace(GREETING, ' ').match(/\p{L}{3,}/gu) ?? [];
  return words.length < 2;
}

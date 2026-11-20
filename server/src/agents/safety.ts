// Owner: Pair 2. ONE check for every model reply an agent shows: /api/ask and each conference turn.
// A reply is shown only when it passes all of it; otherwise the caller shows the agent's rule conclusion.
import type { CfoFacts, Lang } from './facts';
import { findInventedNumbers } from './numberGuard';
import { claimsDone, falseCalm, myMoney } from './text';

/** Polish letters (not "ł": it is in "zł") or common Polish words. Names like "Kraków" do not trigger it. */
const POLISH = /[ąćęńśźż]|\b(?:jest|się|że|masz|musisz|ponieważ|oraz|który|która|które|jeśli|zapłać|proponuję|złotych|faktura|faktury)\b/i;
export const looksPolish = (text: string) => POLISH.test(text);

/**
 * Live: "The EUR/USD rate is going up" when the shop has only euro invoices: the risk is the euro against the złoty.
 * A pair like "EUR/USD" becomes the currency the facts talk about ("EUR"); a pair the facts contain stays.
 */
export function fixCurrencyPair(text: string, facts: CfoFacts): string {
  const known = factText(facts);
  return text.replace(/\b(EUR|USD)\s*\/\s*(EUR|USD)\b/g, (pair, a: string, b: string) => {
    if (known.includes(pair)) return pair;
    const has = (c: string) => new RegExp(`\\b${c}\\b`).test(known);
    return has(a) && !has(b) ? a : has(b) && !has(a) ? b : pair;
  });
}

/** Only rule output counts as facts: the owner's question or the meeting topic can never make a number true. */
export const factText = (facts: CfoFacts) => [...facts.lines, facts.summary].join('\n');

/**
 * Why this reply must not be shown ('' = it is fine).
 * `onTopic` = the caller's "does it use this agent's own facts" test.
 * `alsoKnown` = other rule text already shown (the conference: earlier, checked turns). Live, Anna repeated
 * Marek's "VAT 14 230,00 zł", a true rule number that is not in her own facts, and her whole turn was dropped.
 */
export function replyProblem(text: string, facts: CfoFacts, lang: Lang, onTopic: (text: string) => boolean, alsoKnown = ''): string {
  if (!text) return 'empty';
  if (lang === 'en' && looksPolish(text)) return 'not in English';
  const invented = findInventedNumbers(text, [factText(facts), alsoKnown].join('\n'));
  if (invented.length) return `invented ${JSON.stringify(invented)}`;
  if (!onTopic(text)) return 'no key fact of its own';
  if (claimsDone(text)) return 'claims something was done'; // golden rule 3
  if (falseCalm(text) || myMoney(text) || facts.misread?.(text)) return 'known misread';
  return '';
}

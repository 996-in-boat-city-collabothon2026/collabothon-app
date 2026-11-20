// Owner: Pair 2. ONE check for every model reply an agent shows: /api/ask and each conference turn.
// A reply is shown only when it passes all of it; otherwise the caller shows the agent's rule conclusion.
import type { CfoFacts, Lang } from './facts';
import { findInventedNumbers } from './numberGuard';
import { claimsDone, falseCalm } from './text';

/** Polish letters (not "ł": it is in "zł") or common Polish words. Names like "Kraków" do not trigger it. */
const POLISH = /[ąćęńśźż]|\b(?:jest|się|że|masz|musisz|ponieważ|oraz|który|która|które|jeśli|zapłać|proponuję|złotych|faktura|faktury)\b/i;
export const looksPolish = (text: string) => POLISH.test(text);

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
  if (falseCalm(text) || facts.misread?.(text)) return 'known misread';
  return '';
}

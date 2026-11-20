// Owner: Pair 2. ONE check for every model reply an agent shows: /api/ask and each conference turn.
// A reply is shown only when it passes all of it; otherwise the caller shows the agent's rule conclusion.
import { db } from '../domain/store';
import type { CfoFacts, Lang } from './facts';
import { findInventedNumbers } from './numberGuard';
import { claimsDone, falseCalm, myMoney } from './text';

/** Polish letters (not "ł": it is in "zł"; not "ó": it is in "Kraków"). */
const POLISH_LETTERS = /[ąćęńśźż]/i;
/**
 * Common Polish words that are not English words. Review: "Podatek VAT wynosi 14 230 zł." has no Polish letter
 * except "ł" and was shown on the English stage. Names are removed first ("Sp. z o.o.", "Kurier Express Kraków").
 */
const POLISH_WORDS = new Set([
  'jest', 'są', 'się', 'że', 'nie', 'czy', 'jak', 'ile', 'oraz', 'albo', 'lub', 'ale', 'dla', 'przez', 'przy', 'jako', 'tylko',
  'już', 'jeszcze', 'bardzo', 'teraz', 'dziś', 'dzisiaj', 'jutro', 'wynosi', 'wynoszą', 'podatek', 'podatku', 'kurs', 'kursu',
  'rośnie', 'spada', 'masz', 'musisz', 'możesz', 'trzeba', 'należy', 'termin', 'terminie', 'zapłać', 'zapłacić', 'zapłaty',
  'faktura', 'faktury', 'fakturę', 'saldo', 'salda', 'będzie', 'może', 'kwota', 'kwoty', 'złotych', 'który', 'która', 'które',
  'jeśli', 'jeżeli', 'ponieważ', 'proponuję', 'twoje', 'twój', 'twoja', 'twoich', 'warsztat', 'klient', 'klienci', 'klientów',
  'przypomnienie', 'bufor', 'prognoza', 'kredyt', 'kredytowa', 'ryzyko', 'strata', 'stracisz', 'idzie', 'górę', 'dół', 'kontrakt',
  'ochroni', 'mamy', 'wszystko', 'się',
]); // short words like "na", "do", "we" are left out: they are English too
/**
 * Polish spelling English does not have: "rz", "cz", "sz", "dz", "ść" and Polish endings ("zleceniach", "brakuje",
 * "wysokich"). Two such words make a sentence Polish (review: "Na 3 zleceniach brakuje 1700,00 zł.").
 */
const POLISH_SHAPE = /rz|cz|sz|dz|ść|(?:[iknrtwł]ach|ych|ami|uje|ują|iem|cji|ości)$/u;
const COMPANY = /\bSp\.\s*z\s*o\.\s*o\.|\bS\.A\.|\bGmbH\b/g;

/** Firm and customer names from the data ("Kurier Express Kraków", "Jan Kowalski – JK Budownictwo") are not language. */
function withoutNames(text: string): string {
  let t = text.replace(COMPANY, ' ');
  for (const i of db.invoices) {
    const name = i.counterparty.name.replace(/\s*\(demo\)/g, '').replace(COMPANY, '').trim();
    for (const part of name.split(/\s+[–-]\s+/)) if (part) t = t.split(part.trim()).join(' ');
  }
  return t;
}

export function looksPolish(text: string): boolean {
  const t = withoutNames(text);
  if (POLISH_LETTERS.test(t)) return true;
  const words = t.toLowerCase().match(/\p{L}+/gu) ?? [];
  return words.some((w) => POLISH_WORDS.has(w)) || words.filter((w) => POLISH_SHAPE.test(w)).length >= 2;
}

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
  const problem = textProblem(text, [factText(facts), alsoKnown].join('\n'), lang);
  if (problem) return problem;
  if (!onTopic(text)) return 'no key fact of its own';
  if (facts.misread?.(text)) return 'known misread';
  return '';
}

/**
 * The checks every shown model text passes, also the chair's summary (which has no facts of its own, only `known`):
 * language, numbers / amounts / percent direction only from `known`, nothing "done", no false calm, not "my money".
 */
export function textProblem(text: string, known: string, lang: Lang): string {
  if (!text) return 'empty';
  if (lang === 'en' && looksPolish(text)) return 'not in English';
  const invented = findInventedNumbers(text, known);
  if (invented.length) return `invented ${JSON.stringify(invented)}`;
  if (claimsDone(text)) return 'claims something was done'; // golden rule 3
  if (falseCalm(text) || myMoney(text)) return 'known misread';
  return '';
}

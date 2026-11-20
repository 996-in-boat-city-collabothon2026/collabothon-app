// Owner: Pair 2 (Person B). Makes a small model's reply readable in the advice bubble, in code (no second LLM call).
// Live test (Llama 3.2 3B): replies came with "Oto kilka propozycji:", bullet lists, copied [brackets],
// English words inside Polish sentences ("safety buffer") and were cut mid-sentence by the token limit.
import type { Lang } from './facts';

export const MAX_SENTENCES = 3;

const PREAMBLE = /^(oto|poniżej|odpowiedź|here(?:'s| is| are)|sure|certainly|of course)\b[^.:\n]{0,60}:\s*/i;

// English words the model drops into Polish replies → the Polish word (only applied to Polish replies).
const GLOSSARY: [RegExp, string][] = [
  [/safety buffer(em|u|ze)?/gi, 'bufor$1 bezpieczeństwa'],
  [/\bbuffer(em|u)?\b/gi, 'bufor$1'],
  [/lowest point/gi, 'najniższy punkt'],
  [/credit line/gi, 'linia kredytowa'],
  [/\bforecast\w*/gi, 'prognoza'],
  [/\breminder\w*/gi, 'przypomnienie'],
  [/\b(green|black|white|red|blue) hat(em)?\b/gi, ''],
];

/**
 * Splits into sentences. A new sentence starts with a capital letter or a digit, so "25.11.2026", "4.27 zł"
 * and abbreviations like "Sp. z o.o." do not end a sentence.
 */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ0-9"„])/).map((s) => s.trim()).filter(Boolean);
}

// Instruction words the model echoes at the start of a sentence: "Ty, musisz…", "Ty: Masz, wyślij…",
// "Właścicielu warsztatu, …", and the bare "Masz, zapłać, wyślij." (copied from an old prompt).
const VOCATIVE = /^(?:(?:ty|właścicielu[^,:]{0,40}|właściciel warsztatu[^,:]{0,30}|masz)\s*[,:]\s*)+/i;
const ECHO_ONLY = /^masz,\s*zapłać,\s*wyślij\.?$/i;

/** Removes an echoed instruction word at the start of a sentence and capitalises what is left. */
function dropVocative(sentence: string): string {
  if (ECHO_ONLY.test(sentence)) return '';
  const rest = sentence.replace(VOCATIVE, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * Turns a raw model reply into at most 3 full, plain sentences.
 * Returns '' when nothing usable is left (the caller then uses the rule-based answer).
 */
export function tidyReply(raw: string, lang: Lang): string {
  let t = raw
    .replace(/\r/g, '')
    .replace(/\*\*|__|`/g, '') // markdown bold / code
    .replace(/^\s*#+\s*/gm, '') // headings
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '') // list markers
    .replace(/[[\]]/g, '') // copied placeholders: "[14 230,00 zł]"
    .trim();
  t = t.replace(PREAMBLE, '');
  if (lang === 'pl') for (const [re, pl] of GLOSSARY) t = t.replace(re, pl);
  t = t.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

  const all = sentences(t).map(dropVocative).filter(Boolean);
  // The last sentence was cut by the token limit if it doesn't end with . ! ? or …: drop it.
  const complete = all.filter((s, i) => i < all.length - 1 || /[.!?…]["”)]?$/.test(s));
  return complete.slice(0, MAX_SENTENCES).join(' ');
}

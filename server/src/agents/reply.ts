// Owner: Pair 2 (Person B). Makes a small model's reply readable in the advice bubble, in code (no second LLM call).
// Live test (Llama 3.2 3B): replies came with "Here's what to do:", bullet lists, copied [brackets], filler like
// "Sure, here is what…" and were cut mid-sentence by the token limit.

export const MAX_SENTENCES = 3;

const PREAMBLE = /^(here(?:'s| is| are)|sure|certainly|of course)\b[^.:\n]{0,60}:\s*/i;

/**
 * Splits into sentences. A new sentence starts with a capital letter or a digit, so "25.11.2026", "4.27 zł"
 * and abbreviations like "Sp. z o.o." do not end a sentence.
 */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+(?=[A-Z0-9"])/).map((s) => s.trim()).filter(Boolean);
}

// Filler the small model adds: "Sure, here is what we must do.", "Of course: …".
const FILLER_ONLY = /^(?:sure|of course)?[,!.]?\s*here is what\b[^.]{0,40}[.:]$/i;
const FILLER_START = /^(?:(?:sure|of course|certainly)\s*[,:!.]\s*)+/i;

/** Drops filler at the start of a sentence and capitalises what is left. */
function dropFiller(sentence: string): string {
  if (FILLER_ONLY.test(sentence)) return '';
  const rest = sentence.replace(FILLER_START, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * Turns a raw model reply into at most 3 full, plain sentences.
 * Returns '' when nothing usable is left (the caller then uses the rule-based answer).
 */
export function tidyReply(raw: string): string {
  let t = raw
    .replace(/\r/g, '')
    .replace(/\*\*|__|`/g, '') // markdown bold / code
    .replace(/^\s*#+\s*/gm, '') // headings
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '') // list markers
    .replace(/[[\]]/g, '') // copied placeholders: "[14 230,00 zł]"
    .trim();
  t = t.replace(PREAMBLE, '');
  t = t.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

  const all = sentences(t).map(dropFiller).filter(Boolean);
  // The last sentence was cut by the token limit if it doesn't end with . ! ? or …: drop it.
  const complete = all.filter((s, i) => i < all.length - 1 || /[.!?…]["”)]?$/.test(s));
  return complete.slice(0, MAX_SENTENCES).join(' ');
}

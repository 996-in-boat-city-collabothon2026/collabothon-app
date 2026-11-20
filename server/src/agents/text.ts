// Owner: Pair 2 (Person A). Small, tested clean-ups for model text before it reaches the UI.

/** Openers small models add ("Here's a reminder…:", "Oto wyjaśnienie:", "Sure!"). Only a short first line/phrase is cut. */
const PREAMBLE = /^\s*(here'?s|here is|sure|of course|okay|ok|oto|jasne|oczywiście|wyjaśnienie)\b[^.!?:\n]{0,60}[:!.\n]\s*/i;

export const dropPreamble = (text: string) => text.replace(PREAMBLE, '').trim();

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Keep at most `maxWords` words and never end mid-word or mid-sentence:
 * whole sentences are kept while they fit; if not even one fits, cut at a word and add "…".
 * Also drops an unfinished last sentence (the model hit max_tokens).
 */
export function wholeSentences(text: string, maxWords: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const sentences = t.match(/[^.!?…]+[.!?…]+["”)]?/g) ?? [];
  let out = '';
  for (const s of sentences) {
    const next = (out + ' ' + s.trim()).trim();
    if (words(next).length > maxWords) break;
    out = next;
  }
  if (out) return out;
  const cut = words(t).slice(0, maxWords).join(' ').replace(/[,;:–-]+$/, '');
  return cut ? `${cut}…` : '';
}

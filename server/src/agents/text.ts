// Owner: Pair 2 (Person A). Small, tested clean-ups for model text before it reaches the UI.

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Keep at most `maxWords` words and never end mid-word or mid-sentence:
 * whole sentences are kept while they fit; if not even one fits, cut at a word and add "…".
 * Also drops an unfinished last sentence (the model hit max_tokens).
 */
export function wholeSentences(text: string, maxWords: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  // A sentence ends with . ! ? … followed by a space, so "20.12.2026", "4,27" and "Sp. z o.o." stay whole enough.
  const parts = t.split(/(?<=[.!?…]["”)]?)\s+/).filter(Boolean);
  const done = parts.filter((p, i) => i < parts.length - 1 || /[.!?…]["”)]?$/.test(p)); // drop a cut-off last one
  let out = '';
  for (const s of done) {
    const next = out ? `${out} ${s}` : s;
    if (words(next).length > maxWords) break;
    out = next;
  }
  if (out) return out;
  const cut = words(t).slice(0, maxWords).join(' ').replace(/[,;:–-]+$/, '');
  return cut ? `${cut}…` : '';
}

/**
 * Live replies began with the way we told the model to talk: "Ty: Ty musisz…", "Właścicielu warsztatu, …".
 * Drop such an address at the start and capitalise the rest.
 */
export function stripAddress(text: string): string {
  const t = text
    .replace(/^(?:\s*(?:Ty|Właściciel(?:u)?(?: warsztatu(?: samochodowego)?)?)\s*[:,]\s*)+/i, '')
    .replace(/^Ty\s+(?=\p{Ll})/u, '')
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

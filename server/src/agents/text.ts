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
    .replace(/^(?:\s*(?:Ty|Właściciel(?:u)?(?: warsztatu(?: samochodowego)?)?|(?:Dear )?owner)\s*[:,]\s*)+/i, '')
    .replace(/^Ty\s+(?=\p{Ll})/u, '')
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * Golden rule 3: nothing is done without the owner, so the model must never say it was.
 * Live: "przypomnienia do klientów zostały wysłane", "zostały zablokowane zlecenia na 1500 EUR".
 * Review: "VAT of 14,230 zł was paid yesterday." ("has not been paid" stays fine: the verb must follow directly).
 */
const DONE = /\b(?:został[aoy]?|zostały|zostało)\s+(?:już\s+)?(?:wysłan|zablokowan|zapłacon|opłacon|zatwierdzon|otwart|wykonan|przelan|podpisan)\w*|\b(?:wysłał|zapłacił|zablokował|opłacił|zatwierdził|przelał|podpisał)(?:em|am|am|iśmy|yśmy)\b|\b(?:has|have|had|was|were|is|are) (?:already |just |now )?(?:been )?(?:sent|paid|locked|approved|opened|signed|transferred|submitted|settled|hedged)\b|\b(?:I|we)(?:'ve| have)? (?:already |just )?(?:sent|paid|locked|approved|signed|transferred)\b/i;
// Live chair: "It was decided to send reminders…", "no decisions were made, and no actions were assigned".
// Only the owner decides (golden rule 3): the meeting proposes, it never decides or assigns.
const DECIDED = /\b(?:it was|it has been|it's been|we(?:'ve| have)?|they) (?:been )?decided\b|\bdecisions? (?:was|were|has been|have been) (?:made|taken)\b|\bactions? (?:was|were|has been|have been) assigned\b|\bzdecydowan|\bpostanowion/i;
export const claimsDone = (text: string) => DONE.test(text) || DECIDED.test(text);

/**
 * The advisor tells the owner's money as its own. Live (Kasia): "I have 1500 EUR to pay, and if the rate rises 5%,
 * I'd lose 320,25 zł". The money and the loss are the owner's ("you"), never the advisor's.
 */
const MY_MONEY = /\bI(?:'d|'ll| would| will| could| might)? lose\b|\bI (?:have|owe) [^.]{0,30}\bto pay\b|\bI(?:'ll| will) (?:have to )?pay\b|\bmy (?:money|balance|invoices?|payments?|loss)\b/i;
export const myMoney = (text: string) => MY_MONEY.test(text);

/** False calm next to a real risk. Live: "stracisz 320,25 zł, a kurs rośnie, to nie masz nic do stracenia". */
const CALM = /nic do stracenia|nie masz się czym (?:martwić|przejmować)|wszystko (?:musi być|jest|będzie) w porządku|nothing to lose|nothing to worry/i;
export const falseCalm = (text: string) => CALM.test(text);

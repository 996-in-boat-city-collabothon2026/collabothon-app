// Owner: Pair 2. The app is English only. The model writes no text any more (agents/comments.ts), so this Polish
// detector now guards the tests: every rule text and comment on stage must read as English (agents/corpus.test.ts).
import { db } from '../domain/store';

/** Polish letters (not "ł": it is in "zł"; not "ó": it is in "Kraków"). */
const POLISH_LETTERS = /[ąćęńśźż]/i;

/**
 * Polish words that are not English words, with and without Polish letters: the small model often drops the
 * accents. Review of fc04703: "Podatek VAT wynosi 14 230 zł."; review of 8d96df5: "VAT to 14 230 zł. Zaplac go."
 */
const POLISH_WORDS = new Set(
  `jest są sa się sie że ze nie czy jak ile oraz albo lub ale dla przez przy jako tylko już juz jeszcze bardzo teraz
  dziś dzis dzisiaj jutro wynosi wynoszą wynosza podatek podatku kurs kursu rośnie rosnie spada masz musisz możesz
  mozesz trzeba należy nalezy termin terminie zapłać zaplac zapłacić zaplacic zapłaty zaplaty zapłacone zaplacone
  wyślij wyslij wysłane wyslane przypomnij sprawdź sprawdz popraw faktura faktury fakturę fakture saldo salda będzie
  bedzie może moze kwota kwoty złotych zlotych który ktory która ktora które ktore jeśli jesli jeżeli jezeli ponieważ
  poniewaz proszę prosze proponuję proponuje twoje twój twoj twoja twoich warsztat klient klienci klientów klientow
  klienta przypomnienie bufor prognoza kredyt kredytowa ryzyko strata stracisz idzie górę gore dół kontrakt ochroni
  mamy wszystko więc wiec żeby zeby kiedy gdy dziękuję dziekuje tak zrób zrob jutra pieniądze pieniadze
  stycznia lutego marca kwietnia maja czerwca lipca sierpnia września wrzesnia października pazdziernika listopada
  grudnia`.split(/\s+/).filter(Boolean),
); // short words like "na", "do", "to", "go" are left out: they are English too

/**
 * Polish spelling English does not have: "rz", "cz", "sz", "dz", "ść" and Polish endings ("zleceniach", "brakuje",
 * "wysokich"). Two such words make a sentence Polish (review: "Na 3 zleceniach brakuje 1700,00 zł.").
 */
const POLISH_SHAPE = /rz|cz|sz|dz|ść|(?:[iknrtwł]ach|ych|ami|uje|ują|iem|cji|ości)$/u;

/**
 * Common English words. A reply must SHOW it is English, not only lack Polish: a short reply with too few of them
 * ("VAT 14 230 zł.", "VAT to 14 230 zł.") is ambiguous and falls back. Words ending -ing/-ed/-tion/-ly also count.
 */
const ENGLISH_WORDS = new Set(
  `the a an of to in on at by for with from into about as and or but if so than then when once while because is are
  was were be been being am it its this that these those there here you your yours we our us i me my they their them
  he she his her will would can could should must may might shall do does did done not no yes have has had get gets
  got make made pay pays send sends sent due lose loses lost loss rate rates up down rise rises fall falls money cash
  balance invoice invoices customer customers reminder reminders tax taxes cost costs owe owes owed before after now
  today tomorrow next week weeks month months day days year years buffer credit line forward contract euro risk which
  who what where how all any each every one two three four five six seven eight nine ten also only just still yet
  already first last please more less most least much many some other another over under below above between against
  per hour hours full order orders parts part labour labor markup bill bills price prices fix again data buyer
  supplier suppliers early late deadline unpaid need needs keep lock rate safety point lowest highest drop drops
  forecast enough short gap protect protects suggest recommend propose proposal decide decides owner owners shop
  advisor advisors meeting step steps review add fee interest amount total missing car cars good bad careful it go
  goes open close term deposit income natural hedge match download put biggest change spend spent quote ask other
  costs too little cover covers out today's lowers leaves account money instead number tax sum receive bring same
  new rejected rejection reason wrong digits must you'll you're it's we're don't can't won't isn't per cent percent
  set aside plan budget prepare priority still both expect expects job jobs account accounts revenue wage wages
  increase hit floor target spend spending note remember call follow look confirm start mind cash bill bills cent
  pay paying planning ahead first next ready work works worked quote quotes week month spare stay stays keep keeps
  january february march april may june july august september october november december
  monday tuesday wednesday thursday friday saturday sunday`.split(/\s+/).filter(Boolean),
);
const ENGLISH_SHAPE = /(?:ing|ed|tion|tions|ly|ment|ness|able|ance)$/;

const COMPANY = /\bSp\.\s*z\s*o\.\s*o\.|\bS\.A\.|\bGmbH\b/g;
/** Units, codes and invoice numbers say nothing about the language: "zł", "PLN", "JPK_V7M", "FV/2026/11/009". */
const NOT_LANGUAGE = /\bFV\/[\w/]+|\b[A-Z][A-Za-z]*_[\w]+|(?<![\p{L}])(?:zł|zl|PLN|EUR|USD|demo)(?![\p{L}])|\b(?:[A-Z][a-z]*[A-Z][A-Za-z]*|[A-Z]{2,})\b/gu;

/** Firm, customer and car names from the data: "Kurier Express Kraków", "Jan Kowalski", "JK Budownictwo", "VW Passat 2015". */
function dataNames(): string[] {
  const raw = [...db.invoices.map((i) => i.counterparty.name), ...db.repairOrders.map((o) => o.car)];
  return raw.flatMap((r) => r.replace(/\s*\(demo\)/g, '').replace(COMPANY, '').trim().split(/\s+[–-]\s+/)).map((p) => p.trim()).filter(Boolean);
}

/** Names are not language. */
function withoutNames(text: string): string {
  let t = text.replace(COMPANY, ' ');
  for (const name of dataNames()) t = t.split(name).join(' ');
  return t.replace(NOT_LANGUAGE, ' ');
}

/**
 * Not shown on the English stage: Polish letters, a Polish word (also without accents), two Polish-shaped words,
 * or too little English to be sure (a short reply needs 2 English words, a longer one 40% English words).
 * A unit ("zł") or a proper name ("Kraków", "Sp. z o.o.") alone never decides the language.
 */
export function looksPolish(text: string): boolean {
  const t = withoutNames(text);
  if (POLISH_LETTERS.test(t)) return true;
  const words = t.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.some((w) => POLISH_WORDS.has(w)) || words.filter((w) => POLISH_SHAPE.test(w)).length >= 2) return true;
  const english = words.filter((w) => ENGLISH_WORDS.has(w) || ENGLISH_SHAPE.test(w)).length;
  return words.length <= 6 ? english < 2 : english / words.length < 0.4;
}

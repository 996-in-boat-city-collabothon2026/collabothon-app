// Owner: Pair 2. The check for the only model text an agent shows: its one-sentence comment (commentProblem below),
// in /api/ask, each conference turn and the chair. Facts are always rule text (agents/facts.ts points).
// The app is English only. The Polish detector is a GUARD, not Polish support: the model (and the Polish seed names
// it reads) can still slip into Polish, and such a comment must never reach the English UI.
import { db } from '../domain/store';
import { claimsDone, falseCalm, myMoney } from './text';

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

// ---------- Rebuild M3 (docs/PAIR2-REBUILD.md): the model's one-sentence comment ----------
// The facts are always rule text (the points in agents/facts.ts). The model may add ONE short comment in its hat's
// voice, and that comment must carry no fact at all. "No fact" can be checked completely, unlike "the right fact":
// no number, money, date, name or market trend, and nothing in the past tense (nothing was done: golden rule 3).

export const COMMENT_MAX_WORDS = 25;

/** Words that carry a number. "one" and "first" stay: "one thing at a time", "chase the money first". */
const NUMBER_WORDS = /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|half|halves|double|twice|triple|percent|per\s+cent)\b/i;
/** A currency name, code or symbol (also "euro": the direction of a rate is a fact, so the comment leaves it out). */
const MONEY_WORDS = /(?<![\p{L}])(?:zł|zl|złot\p{L}*|zlot\p{L}*|pln|eur|euros?|usd|dollars?|gbp|pounds?|chf|francs?|bucks|quid|grand)(?![\p{L}])|[€$£¥]/iu;
/** A month, a weekday or a relative date. "May" and "March" only capitalised ("you may", "march on" are fine). */
const DATE_WORDS = /\b(?:january|february|april|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tonight|tomorrow|yesterday|overdue|late|weekends?|weeks?|months?|years?|quarters?)\b/i;
const MONTH_CAPS = /\b(?:March|May|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/;
/** A market move is a fact of the rules (and the model reversed it live). */
const TREND_WORDS = /\b(?:rise|rises|rising|rose|risen|fall|falls|falling|fell|fallen|drops?|dropping|dropped|climb\w*|jump\w*|surg\w*|slid\w*|sink\w*|sank|plung\w*|strengthen\w*|weaken\w*|apprecia\w*|deprecia\w*|soar\w*|tumbl\w*|(?:go|goes|going)\s+(?:up|down))\b/i;
/** Capitalised words that are not names: the hats' own vocabulary. Anything else capitalised mid-sentence is a name. */
const NOT_A_NAME = new Set(['I', "I'm", "I'd", "I'll", 'VAT', 'ZUS', 'PIT', 'JPK', 'KSeF', 'NBP', 'NIP', 'UPO', 'OK', 'CFO', 'Anna', 'Kasia', 'Marek', 'Tomasz']);

/** Past forms that are never present tense. */
const PAST_IRREGULAR = 'went|gone|got|gotten|took|taken|sent|paid|made|did|done|came|gave|given|left|told|sold|bought|brought|spent|lost|won|kept|held|found|wrote|written|spoke|spoken|began|begun|chose|chosen|drew|drawn|fell|fallen|felt|forgot|forgotten|knew|known|led|lent|met|ran|saw|seen|shown|stood|thought|understood|became|broke|broken|built|caught|fought|hid|hidden|meant|sat|slept|taught|threw|thrown|wore|worn|woke|woken';
const PAST = new RegExp(`\\b(?:was|were|been|had|${PAST_IRREGULAR})\\b`, 'i');
/** Same form in present and past ("set", "cut", "put"): a claim only after be/have ("is set up", "has cut"). */
const AMBIGUOUS_PAST = /\b(?:is|are|be|being|has|have)\s+(?:\w+\s+)?(?:set|put|cut|let|read|hit|cost|spread|shut|quit|hurt|upset|bet)\b|\b\w+'(?:s|re|ve)\s+(?:\w+\s+)?(?:set|put|cut|let|read|hit|cost|spread|shut|quit|hurt|upset|bet)\b/i;
/** A state that says the work is over: "the forward is now active", "the line is in place", "it's on its way". */
const COMPLETED = /\b(?:is|are|now|already)\s+(?:\w+\s+)?(?:complete|active|ready|live|open|in\s+place|through|underway|over|on\s+(?:its|their|the)\s+way)\b|\b\w+'(?:s|re)\s+(?:\w+\s+)?(?:complete|active|ready|live|open|in\s+place|through|underway|over)\b/i;
/** Words ending in -ed that are not a past action: feelings and plain adjectives a hat may use. */
const ED_OK = new Set(['red', 'bed', 'shed', 'owed', 'concerned', 'worried', 'prepared', 'focused', 'interested', 'pleased', 'relieved', 'surprised', 'convinced', 'tired', 'scared', 'excited', 'detailed', 'limited', 'balanced', 'advanced', 'experienced', 'skilled', 'informed', 'organised', 'organized', 'motivated', 'committed', 'dedicated', 'complicated', 'unexpected', 'based', 'related', 'rushed', 'stressed', 'simulated', 'rejected']); // "simulated": the app's own word; "rejected": the invoice's true state
const EED_PAST = new Set(['agreed', 'freed', 'decreed', 'guaranteed', 'refereed']);
const isPastEd = (w: string) => {
  const l = w.toLowerCase();
  if (l.length < 4 || !l.endsWith('ed') || ED_OK.has(l)) return false;
  return !l.endsWith('eed') || EED_PAST.has(l); // "need", "indeed", "proceed" are present
};
/** Next to a real risk (a critical point) a calming word is false calm. */
const CALM_WORDS = /\b(?:fine|safe|healthy|enough|okay|ok|comfortable|stable|solid|secure|relax\w*|plenty|good\s+shape|under\s+control|all\s+good|no\s+problem|not\s+a\s+problem|nothing\s+to\s+worry|no\s+worr\w*|don'?t\s+worry|no\s+need\s+to\s+worry|no\s+rush|no\s+hurry|not\s+urgent|nothing\s+urgent|can\s+wait)\b/i;
/** Money goes TO a customer: the customers owe the shop (live: "pay FlotaTrans 12 300 zł"). */
const PAY_CUSTOMER = /\b(?:pay|paying|transfer|wire)\b[^.?!]{0,30}\b(?:customers?|clients?|debtors?)\b/i;

/**
 * Why the comment must not be shown ('' = it may be shown after the rule text).
 * `critical` = this CFO has a real risk right now (any critical point, not only the chosen ones).
 */
export function commentProblem(comment: string, critical: boolean): string {
  const c = comment.trim();
  if (!c) return 'empty';
  if (/[\r\n]|[*#_`[\]{}<>|]/.test(c)) return 'markup or more than one line';
  const words = c.split(/\s+/);
  if (words.length > COMMENT_MAX_WORDS) return 'too long';
  if (c.split(/[.!?]+(?=\s|$)/).filter((s) => s.trim()).length > 1) return 'more than one sentence';
  if (/\d/.test(c) || NUMBER_WORDS.test(c)) return 'a number';
  if (MONEY_WORDS.test(c)) return 'money';
  if (DATE_WORDS.test(c) || MONTH_CAPS.test(c) || /\bFV\b/i.test(c)) return 'a date or an invoice';
  const tokens = c.match(/\p{L}+(?:['’]\p{L}+)?/gu) ?? [];
  const capitalised = tokens.filter((w, i) => (i > 0 && /^\p{Lu}/u.test(w)) || /\p{Ll}\p{Lu}/u.test(w)); // "FlotaTrans" even first
  const lower = c.toLowerCase();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dataName = dataNames()
    .map((n) => n.split(/\s+/)[0].toLowerCase()) // "flotatrans", "kurier", "autoteile", "jan", "ford" in any case
    .find((n) => n.length >= 3 && new RegExp(`(?<![\\p{L}])${escape(n)}(?![\\p{L}])`, 'u').test(lower));
  if (capitalised.some((w) => !NOT_A_NAME.has(w)) || dataName) return 'a name';
  if (looksPolish(c)) return 'not in English'; // after the names: without them a short reply has too few words
  if (TREND_WORDS.test(c)) return 'a market trend';
  if (PAST.test(c) || AMBIGUOUS_PAST.test(c) || COMPLETED.test(c) || tokens.some(isPastEd) || claimsDone(c)) return 'past tense or a done claim';
  if (myMoney(c)) return "the owner's money told as the advisor's";
  if (PAY_CUSTOMER.test(c)) return 'pays a customer';
  if (critical && (CALM_WORDS.test(c) || falseCalm(c))) return 'false calm next to a real risk';
  return '';
}

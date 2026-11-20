// Owner: Pair 2 (Person A). Four CFOs speak in turn, then a "chair" call turns the debate into decisions.
// The snapshot is Polish with a clear label on every number: the small model copies labels, it must not compute.
import { z } from 'zod';
import { CFOS, type Action, type ActionKind, type BoardroomResult, type BoardroomTurn, type CfoId, type ExpenseCategory, type Tier } from '@cfo/shared';
import { db } from '../domain/store';
import { fmtPLN, lastDays } from '../domain/money';
import { latestRate } from '../domain/fx';
import { forecast } from '../rules/cashflow';
import { PERIOD_DAYS, totalsBetween } from '../rules/expenses';
import { fmtFx, fmtRate, fxExposures, hasTrend } from '../rules/fx';
import { chatOr } from '../llm/provider';
import { extractJson } from '../llm/json';
import { findInventedNumbers, mentionsKeyFact } from './numberGuard';
import { claimsDone, falseCalm, stripAddress, wholeSentences } from './text';
import { tidyReply } from './reply';
import { cfoFacts, STAGE_LANG, type CfoFacts, type Lang } from './facts';
import { fixCurrencyPair, looksPolish, replyProblem } from './safety';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia']; // White → Black → Green → Red, the Blue chair sums up

/** Word limit per turn. Prompt asks for less; the server cuts at a whole sentence so nothing ends mid-word. */
export const TURN_MAX_WORDS = 50;
export const SUMMARY_MAX_WORDS = 45;
// Live: ~36 tokens/s and a 22 s budget for 5 calls. 4×120 + 200 tokens leaves room; tidy() ends on a whole sentence.
export const TURN_MAX_TOKENS = 120;
export const CHAIR_MAX_TOKENS = 200;

const CATEGORY_PL: Record<ExpenseCategory, string> = {
  parts: 'części', payroll: 'wynagrodzenia', rent: 'czynsz', taxes: 'podatki',
  leasing: 'leasing', utilities: 'media', other: 'inne',
};
/** Costs the owner can change. Same list as Tomasz's tips in rules/expenses.ts (payroll, rent, taxes are fixed). */
const CHANGEABLE: ExpenseCategory[] = ['parts', 'utilities', 'other'];

const KIND_PL: Record<ActionKind, string> = {
  ksef_revalidate: 'ponowne sprawdzenie faktury w KSeF',
  ksef_fix: 'poprawka faktury w KSeF',
  tax_payment: 'zapłata podatku',
  credit_line: 'linia kredytowa',
  payment_reminder: 'przypomnienie o zapłacie dla klienta',
  supplier_payment: 'wcześniejsza zapłata dostawcy',
  pricing: 'ceny w warsztacie',
  cost_cut: 'obniżka kosztów',
  deposit: 'lokata',
  fx_hedge: 'zabezpieczenie kursu (kontrakt forward)',
  info: 'naturalne zabezpieczenie walutowe',
};
const TIER_PL: Record<Tier, string> = {
  ANALYSED: 'zrobione automatycznie',
  RECOMMENDED: 'porada',
  NEEDS_APPROVAL: 'czeka na zgodę właściciela',
};

/** Polish name of a card. Tomasz's cards share a kind, so the rule's title tells which one it is. */
function labelPL(a: Pick<Action, 'kind' | 'title' | 'refId'>): string {
  if (/^Labour billed/.test(a.title)) return 'robocizna policzona poniżej stawki';
  if (/^Parts markup/.test(a.title)) return 'za niska marża na częściach';
  const tax = a.kind === 'tax_payment' ? db.obligations.find((o) => o.id === a.refId)?.kind : undefined;
  return tax ? `zapłata ${tax}` : KIND_PL[a.kind];
}

/** What the card is about: invoice (number + firm) or obligation (VAT / ZUS / PIT …). */
function aboutPL(refId?: string): string | undefined {
  const inv = db.invoices.find((i) => i.id === refId);
  if (inv) return `faktura ${inv.number}, ${inv.counterparty.name}`;
  return db.obligations.find((o) => o.id === refId)?.kind;
}

/**
 * Tomasz's per-car reasons in Polish. Amounts are copied character by character from the rule's why[] (no maths here).
 * "VW Passat 2015: 4 h billed 0,00 zł, should be 800,00 zł (800,00 zł missing)" → "VW Passat 2015: brakuje 800,00 zł robocizny".
 */
function detailsPL(why: string[]): string[] {
  return why.flatMap((w) => {
    const labour = /^(.+?): .* \((.+) missing\)$/.exec(w);
    if (labour) return [`${labour[1]}: brakuje ${labour[2]} robocizny`];
    const parts = /^(.+?): parts cost (.+), sold for (.+) \(markup (\d+%)\)$/.exec(w);
    if (parts) return [`${parts[1]}: części kosztowały ${parts[2]}, sprzedane za ${parts[3]} (narzut ${parts[4]})`];
    return [];
  });
}

/** One open card as a Polish line. Numbers: only the card's own amount and date (from the rules). */
export function itemPL(a: Action): string {
  const parts = [`${CFOS[a.cfo].name}: ${labelPL(a)} (${TIER_PL[a.tier]})`];
  const about = a.kind === 'tax_payment' ? undefined : aboutPL(a.refId); // tax: already in the label
  if (about) parts.push(about);
  if (a.amountPLN !== undefined) parts.push(`kwota ${fmtPLN(a.amountPLN)}`);
  if (a.dueDate) parts.push(a.kind === 'payment_reminder' ? `termin płatności minął ${a.dueDate}` : `termin ${a.dueDate}`);
  const details = detailsPL(a.why);
  return parts.join(', ') + (details.length ? ` (${details.join('; ')})` : '');
}

/** Facts for the prompt, Polish, one labelled number per line. Every number comes from the rules engine. */
export function snapshot(): string {
  const f = forecast(30);
  const short = f.bufferPLN - f.lowest.balancePLN;
  const lines = [
    `Warsztat: ${db.shop.name}, ${db.shop.city}, mechaników: ${db.shop.employees}, stawka za roboczogodzinę: ${fmtPLN(db.shop.labourRatePLN)}.`,
    `Saldo dziś: ${fmtPLN(db.bank.balancePLN)}.`,
    `Bufor bezpieczeństwa: ${fmtPLN(f.bufferPLN)}.`,
    `Najniższe saldo w prognozie (${f.lowest.date}): ${fmtPLN(f.lowest.balancePLN)}. To prognoza na przyszłość, nie saldo dziś.`,
    short > 0 ? `Brakuje do bufora: ${fmtPLN(short)}.` : 'Prognoza nie spada poniżej bufora.',
  ];

  for (const e of fxExposures()) {
    const weOwe = e.net > 0;
    lines.push(
      `Kurs ${e.currency} (NBP) dziś: ${fmtRate(latestRate(e.currency))}` +
        (hasTrend(e) ? `, ${e.trend.weeksUp ? `rośnie od ${e.trend.weeksUp} tygodni` : 'nie rośnie'} (4 tygodnie temu: ${fmtRate(e.trend.from)}).` : '.'),
      `${e.currency} netto ${weOwe ? 'do zapłaty' : 'do otrzymania'}: ${fmtFx(Math.abs(e.net), e.currency)} = ${fmtPLN(Math.abs(e.netPLN))}.`,
      `Ryzyko ${e.currency} przy ${weOwe ? '+5%' : '−5%'}: ${fmtPLN(e.shockPLN)}.`,
    );
  }

  const period = lastDays(db.shop.today, PERIOD_DAYS);
  const costs = [...totalsBetween(period.from, period.to)].sort((a, b) => b[1] - a[1]);
  if (costs.length) {
    lines.push(`Koszty w ostatnich ${PERIOD_DAYS} dniach: ${costs.map(([c, v]) => `${CATEGORY_PL[c]} ${fmtPLN(v)}`).join(', ')}.`);
    const top = costs.find(([c]) => CHANGEABLE.includes(c));
    if (top) lines.push(`Największy koszt, na który masz wpływ: ${CATEGORY_PL[top[0]]} ${fmtPLN(top[1])}.`);
  }

  const open = db.actions.filter((a) => a.status === 'open');
  lines.push('Otwarte sprawy:', ...(open.length ? open.map((a) => `- [${a.id}] ${itemPL(a)}`) : ['- brak']));
  return lines.join('\n');
}

/** Golden rule 1: text with a number or date that is not in `known` is dropped (→ '' → rule-based text). */
function safe(text: string, known: string, key: string): string {
  if (!text) return '';
  const invented = findInventedNumbers(text, known);
  if (!invented.length) return text;
  console.info(`[guard] ${key} invented ${JSON.stringify(invented)} → rule-based text`);
  return '';
}

/** Model reply → at most 3 clean, whole sentences (B's tidyReply) and never more than `maxWords`. */
const tidy = (raw: string, lang: Lang, maxWords: number) => wholeSentences(tidyReply(raw, lang), maxWords);

const transcriptOf = (turns: BoardroomTurn[]) => turns.map((t) => `${CFOS[t.cfo].name}: ${t.text}`).join('\n');

/**
 * One CFO's turn prompt. The others' words come FIRST and this CFO's own facts LAST: live, the small model
 * copied the previous speaker (Tomasz repeated Anna) when the transcript was at the end.
 */
function turnPrompt(cfo: CfoId, facts: CfoFacts, subject: string, turns: BoardroomTurn[], lang: Lang): string {
  const so = transcriptOf(turns);
  const name = CFOS[cfo].name;
  return lang === 'pl'
    ? [
        `TEMAT NARADY: ${subject}`,
        `CO POWIEDZIELI INNI (nie powtarzaj tego):\n${so || '(nikt jeszcze nie mówił)'}`, '',
        `TWOJE FAKTY, ${name} (tylko tych liczb wolno Ci użyć):`, ...facts.lines.map((l) => `- ${l}`), '',
        `TWÓJ WNIOSEK (powiedz go swoimi słowami, z tymi samymi liczbami): ${facts.summary}`, '',
        'Mów tylko o swoim temacie, 2 krótkie zdania po polsku, zwracaj się wprost do właściciela. Niczego nie licz.',
      ].join('\n')
    : [
        `MEETING TOPIC: ${subject}`,
        `WHAT THE OTHERS SAID (do not repeat it):\n${so || '(nobody has spoken yet)'}`, '',
        `YOUR FACTS, ${name} (the only numbers you may use):`, ...facts.lines.map((l) => `- ${l}`), '',
        `YOUR KEY POINT (say it in your own words, with the same numbers): ${facts.summary}`, '',
        'Talk only about your own area, 2 short sentences in English, directly to the owner. Do not calculate.',
      ].join('\n');
}

/** Open approval cards, one line each, for the chair (and its rule-based summary). */
const itemFor = (a: Action, lang: Lang) => (lang === 'pl' ? itemPL(a) : `${CFOS[a.cfo].name}: ${a.title}`);

/** Summary from the rules when the chair's JSON is broken or invents a number: the first 3 decisions. */
export function ruleSummary(approvals: Action[], lang: Lang): string {
  if (!approvals.length) return lang === 'pl' ? 'Nic nie czeka na Twoją decyzję. Wszystko jest pod kontrolą.' : 'Nothing is waiting for your decision. Everything is under control.';
  const top = approvals.slice(0, 3).map((a) => (lang === 'pl' ? `${labelPL(a)}${a.amountPLN !== undefined ? ` ${fmtPLN(a.amountPLN)}` : ''}` : a.title));
  return lang === 'pl'
    ? `Do Twojej decyzji: ${top.join('; ')}. Wszystkie propozycje są w kolejce do zatwierdzenia.`
    : `For your decision: ${top.join('; ')}. All proposals are in the approval queue.`;
}

const ChairSchema = z.object({ summary: z.string(), decisionActionIds: z.array(z.string()) });

export { STAGE_LANG }; // defined in facts.ts, re-exported for the routes

export async function runBoardroom(topic?: string): Promise<BoardroomResult> {
  const subject = topic?.trim() || 'Monthly review';
  const lang = STAGE_LANG;
  const turns: BoardroomTurn[] = [];

  for (const cfo of ORDER) {
    const facts = cfoFacts(cfo, lang);
    const raw = await chatOr('', [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: turnPrompt(cfo, facts, subject, turns, lang) },
    ], { maxTokens: TURN_MAX_TOKENS, temperature: 0.1, mockKey: `boardroom:${cfo}` });
    // Same check as /api/ask (agents/safety.ts): only this CFO's own rule numbers, English, at least one amount
    // from its own conclusion (live: Tomasz repeated Anna), nothing "done", no false calm → else the rule conclusion.
    // "Its own amount" is compared as a number, so "14,230 zł" or "14 230 zł" count as "14 230,00 zł".
    const text = fixCurrencyPair(stripAddress(tidy(raw, lang, TURN_MAX_WORDS)), facts);
    const hasKeyFact = mentionsKeyFact(facts.summary, facts.summary);
    const ownAmount = (t: string) => !hasKeyFact || mentionsKeyFact(t, facts.summary);
    const problem = replyProblem(text, facts, lang, ownAmount, transcriptOf(turns));
    if (problem && problem !== 'empty') console.info(`[guard] boardroom:${cfo} ${problem} → rule conclusion`);
    turns.push({ cfo, text: problem ? facts.summary : text });
  }

  const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL');
  const items = approvals.map((a) => `- [${a.id}] ${itemFor(a, lang)}`).join('\n') || '-';
  const debate = transcriptOf(turns);
  const chairRaw = await chatOr('', [
    {
      role: 'system',
      content: CHAIR_PERSONA +
        ' Reply ONLY with JSON: {"summary": string (in English, max 2 sentences, only proposals for the owner: nothing is done or decided yet), "decisionActionIds": string[] (ids from the list)}',
    },
    { role: 'user', content: `ITEMS TO APPROVE:\n${items}\n\nDEBATE:\n${debate}` },
  ], { maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1, mockKey: 'boardroom:chair' });

  const chair = extractJson(chairRaw, ChairSchema);
  const ids = approvals.map((a) => a.id);
  const validIds = (chair?.decisionActionIds ?? []).filter((id) => ids.includes(id));
  // Numbers only from the items and the (already checked) debate; English; the chair only proposes (golden rule 3).
  let summary = safe(stripAddress(tidy(chair?.summary ?? '', lang, SUMMARY_MAX_WORDS)), [items, debate].join('\n'), 'boardroom:chair');
  if (summary && (looksPolish(summary) || claimsDone(summary) || falseCalm(summary))) {
    console.info('[guard] boardroom:chair not English, claims something was done or false calm → rule summary');
    summary = '';
  }
  return {
    turns,
    summary: summary || ruleSummary(approvals, lang),
    decisionActionIds: validIds.length ? validIds : ids,
  };
}

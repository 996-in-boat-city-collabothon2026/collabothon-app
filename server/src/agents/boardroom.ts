// Owner: Pair 2 (Person A). Four CFOs speak in turn, then a "chair" call turns the debate into decisions.
// The snapshot is Polish with a clear label on every number: the small model copies labels, it must not compute.
import { z } from 'zod';
import { CFOS, type Action, type ActionKind, type BoardroomResult, type BoardroomTurn, type CfoId, type ExpenseCategory, type Tier } from '@cfo/shared';
import { db } from '../domain/store';
import { fmtPLN, lastDays } from '../domain/money';
import { latestRate } from '../domain/fx';
import { forecast } from '../rules/cashflow';
import { PERIOD_DAYS, totalsBetween } from '../rules/expenses';
import { fmtFx, fmtRate, fxExposures } from '../rules/fx';
import { chatOr } from '../llm/provider';
import { extractJson } from '../llm/json';
import { wholeSentences } from './text';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia']; // White → Black → Green → Red, the Blue chair sums up

/** Word limit per turn. Prompt asks for less; the server cuts at a whole sentence so nothing ends mid-word. */
export const TURN_MAX_WORDS = 60;
export const SUMMARY_MAX_WORDS = 50;
// ~3 tokens per Polish word on Llama 3.2 + headroom, so the limit is the word count, not max_tokens.
const TURN_MAX_TOKENS = 260;

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

/** One open card as a Polish line. Numbers: only the card's own amount and date (from the rules). */
export function itemPL(a: Action): string {
  const parts = [`${CFOS[a.cfo].name}: ${labelPL(a)} (${TIER_PL[a.tier]})`];
  const about = a.kind === 'tax_payment' ? undefined : aboutPL(a.refId); // tax: already in the label
  if (about) parts.push(about);
  if (a.amountPLN !== undefined) parts.push(`kwota ${fmtPLN(a.amountPLN)}`);
  if (a.dueDate) parts.push(a.kind === 'payment_reminder' ? `termin płatności minął ${a.dueDate}` : `termin ${a.dueDate}`);
  return parts.join(', ');
}

/** Facts for the prompt, Polish, one labelled number per line. Every number comes from the rules engine. */
export function snapshot(): string {
  const f = forecast(30);
  const short = f.bufferPLN - f.lowest.balancePLN;
  const lines = [
    `Warsztat: ${db.shop.name}, ${db.shop.city}, mechaników: ${db.shop.employees}, stawka za roboczogodzinę: ${fmtPLN(db.shop.labourRatePLN)}.`,
    `Dzisiaj: ${db.shop.today}.`,
    `Saldo dziś: ${fmtPLN(db.bank.balancePLN)}.`,
    `Bufor bezpieczeństwa: ${fmtPLN(f.bufferPLN)}.`,
    `Najniższe saldo w prognozie (${f.lowest.date}): ${fmtPLN(f.lowest.balancePLN)}. To prognoza na przyszłość, nie saldo dziś.`,
    short > 0 ? `Brakuje do bufora: ${fmtPLN(short)}.` : 'Prognoza nie spada poniżej bufora.',
  ];

  for (const e of fxExposures()) {
    const weOwe = e.net > 0;
    lines.push(
      `Kurs ${e.currency} (NBP) dziś: ${fmtRate(latestRate(e.currency))}, ${e.trend.weeksUp ? `rośnie od ${e.trend.weeksUp} tygodni` : 'nie rośnie'} (4 tygodnie temu: ${fmtRate(e.trend.from)}).`,
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

/** Rule-based line when the model fails (or, later, invents a number): the CFO's own open cards, max 2. */
export function fallbackTurn(cfo: CfoId): string {
  const mine = db.actions.filter((a) => a.status === 'open' && a.cfo === cfo).slice(0, 2);
  if (!mine.length) return `${CFOS[cfo].name}: w moim obszarze nie ma nic pilnego.`;
  return mine.map((a) => `${itemPL(a).replace(`${CFOS[cfo].name}: `, '')}.`).map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
}

const transcriptOf = (turns: BoardroomTurn[]) => turns.map((t) => `${CFOS[t.cfo].name}: ${t.text}`).join('\n');

const ChairSchema = z.object({ summary: z.string(), decisionActionIds: z.array(z.string()) });

export async function runBoardroom(topic?: string): Promise<BoardroomResult> {
  const facts = snapshot();
  const turns: BoardroomTurn[] = [];

  for (const cfo of ORDER) {
    const raw = await chatOr('', [
      { role: 'system', content: PERSONAS[cfo] },
      {
        role: 'user',
        content:
          `DANE:\n${facts}\n\nTEMAT: ${topic ?? 'Przegląd miesiąca'}\n\nDOTYCHCZAS:\n${transcriptOf(turns) || '(nikt jeszcze nie mówił)'}\n\n` +
          `Twoja kolej. Odpowiedz po polsku, najwyżej 3 krótkie zdania (do 50 słów). ` +
          `Kwoty i daty przepisz dokładnie z DANYCH, niczego nie licz i nie dodawaj.`,
      },
    ], { maxTokens: TURN_MAX_TOKENS, mockKey: `boardroom:${cfo}` });
    const text = wholeSentences(raw, TURN_MAX_WORDS);
    turns.push({ cfo, text: text || fallbackTurn(cfo) });
  }

  const openApprovals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL').map((a) => a.id);
  const chairRaw = await chatOr('', [
    {
      role: 'system',
      content: CHAIR_PERSONA +
        ` Reply ONLY with JSON: {"summary": string (po polsku, max ${SUMMARY_MAX_WORDS} words), "decisionActionIds": string[] (ids from DANE that the owner should approve)}`,
    },
    { role: 'user', content: `DANE:\n${facts}\n\nDYSKUSJA:\n${transcriptOf(turns)}` },
  ], { maxTokens: 260, mockKey: 'boardroom:chair' });

  const chair = extractJson(chairRaw, ChairSchema);
  const validIds = (chair?.decisionActionIds ?? []).filter((id) => openApprovals.includes(id));
  const summary = wholeSentences(chair?.summary ?? '', SUMMARY_MAX_WORDS);
  return {
    turns,
    summary: summary || 'Rada przejrzała otwarte sprawy. Sprawdź kolejkę spraw do zatwierdzenia.',
    decisionActionIds: validIds.length ? validIds : openApprovals,
  };
}

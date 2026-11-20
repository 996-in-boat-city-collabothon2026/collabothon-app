// Owner: Pair 2 (Person A). Polish snapshot with labelled numbers, whole-sentence turns, Polish explanations.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../llm/provider';
import { config } from '../config';
import { setModelCallForTests } from '../llm/provider';
import { db, resetDb } from '../domain/store';
import { runAutopilot } from './autopilot';
import { fallbackTurn, runBoardroom, snapshot, TURN_MAX_WORDS } from './boardroom';
import { dropPreamble, wholeSentences } from './text';

const saved = { ...config.llm };
/** Fake model: `reply(messages)` answers each call. Mode openai_compat so the real chat() path runs. */
let reply: (m: ChatMessage[]) => string = () => '';
const sent: ChatMessage[][] = [];

beforeEach(() => {
  resetDb();
  sent.length = 0;
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (m) => {
    sent.push(m);
    return reply(m);
  }, 'openai_compat');
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('text helpers', () => {
  it('wholeSentences keeps whole sentences within the limit and never ends mid-word', () => {
    expect(wholeSentences('Jedno zdanie. Drugie zdanie. Trzecie zda', 10)).toBe('Jedno zdanie. Drugie zdanie.');
    expect(wholeSentences('Saldo 38 400,00 zł. Bufor 15 000,00 zł.', 4)).toBe('Saldo 38 400,00 zł.');
    expect(wholeSentences('bardzo długie zdanie bez kropki które się urwało w poło', 5)).toBe('bardzo długie zdanie bez kropki…');
    expect(wholeSentences('', 5)).toBe('');
  });

  it('dropPreamble removes "Here\'s…:" / "Oto…:" openers only', () => {
    expect(dropPreamble("Here's a reminder about your payment: Zapłać VAT.")).toBe('Zapłać VAT.');
    expect(dropPreamble('Oto wyjaśnienie: Saldo spadnie.')).toBe('Saldo spadnie.');
    expect(dropPreamble('Saldo spadnie poniżej bufora.')).toBe('Saldo spadnie poniżej bufora.');
  });
});

describe('snapshot (Polish, labelled numbers from the rules)', () => {
  it('has the seed numbers with clear labels', async () => {
    await runAutopilot();
    const s = snapshot();
    expect(s).toMatch(/Saldo dziś: 38\s400,00\szł/);
    expect(s).toMatch(/Najniższe saldo w prognozie \(2026-12-20\): -20\s275,00\szł\. To prognoza/);
    expect(s).toMatch(/Brakuje do bufora: 35\s275,00\szł/);
    expect(s).toMatch(/Ryzyko EUR przy \+5%: 320,25\szł/);
    expect(s).toMatch(/Największy koszt, na który masz wpływ: części 17\s850,00\szł/);
    expect(s).toMatch(/linia kredytowa \(czeka na zgodę właściciela\), kwota 36\s000,00\szł, termin 2026-12-20/);
    expect(s).not.toMatch(/credit line|safety buffer|Bank balance/i);
  });
});

describe('conference turns', () => {
  it('a long reply cut mid-word is trimmed to whole sentences within the word limit', async () => {
    const long = Array.from({ length: 12 }, (_, i) => `To jest zdanie numer ${i + 1} o saldzie.`).join(' ') + ' I urwa';
    reply = (m) => (m[0].content.includes('Reply ONLY with JSON') ? '{"summary":"Krótko.","decisionActionIds":[]}' : long);
    const r = await runBoardroom();
    for (const t of r.turns) {
      expect(t.text.split(/\s+/).length).toBeLessThanOrEqual(TURN_MAX_WORDS);
      expect(t.text).toMatch(/\.$/);
    }
    expect(r.summary).toBe('Krótko.');
    expect(sent[0][1].content).toContain('Odpowiedz po polsku');
  });

  it('model gives nothing → each CFO says a rule-based Polish line with numbers from the cards', async () => {
    await runAutopilot(); // no model answer → explanations fall back to why[]
    reply = () => '';
    const r = await runBoardroom();
    expect(r.turns.map((t) => t.text)).toEqual(['marek', 'anna', 'tomasz', 'kasia'].map((c) => fallbackTurn(c as 'anna')));
    expect(r.turns[1].text).toMatch(/Linia kredytowa \(czeka na zgodę właściciela\), kwota 36\s000,00\szł/);
    expect(r.summary).toMatch(/^Rada przejrzała/);
  });
});

describe('number guard (golden rule 1)', () => {
  it('a turn with an invented sum falls back to the rule line; good turns stay', async () => {
    await runAutopilot();
    reply = (m) => {
      if (m[0].content.includes('Reply ONLY with JSON')) return '{"summary":"Strata 50 230,00 zł w grudniu.","decisionActionIds":[]}';
      if (m[0].content.includes('Jesteś Anna')) return 'Razem 14 230 + 36 000 = 50 230,00 zł straty.';
      return 'Saldo dziś: 38 400,00 zł. Ryzyko EUR przy +5%: 320,25 zł.';
    };
    const r = await runBoardroom();
    const anna = r.turns.find((t) => t.cfo === 'anna')!;
    expect(anna.text).toBe(fallbackTurn('anna'));
    expect(r.turns.find((t) => t.cfo === 'kasia')!.text).toBe('Saldo dziś: 38 400,00 zł. Ryzyko EUR przy +5%: 320,25 zł.');
    expect(r.summary).toMatch(/^Rada przejrzała/); // invented 50 230 in the chair summary → rule text
  });

  it('an explanation with an invented rate falls back to why[]', async () => {
    reply = () => 'Kurs forward to 4,30 zł na 3 miesiące, zapłacisz 6 450,00 zł.';
    await runAutopilot();
    const hedge = db.actions.find((a) => a.kind === 'fx_hedge')!;
    expect(hedge.explanation).toBe(hedge.why.join('. '));
  });
});

describe('approval explanations (autopilot)', () => {
  it('Polish prompt, preamble dropped, amounts from why[]', async () => {
    reply = () => "Here's a reminder about this card: Saldo spadnie do -20 275,00 zł 2026-12-20. Linia 36 000,00 zł to zabezpieczenie.";
    await runAutopilot();
    const credit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(credit.explanation).toBe('Saldo spadnie do -20 275,00 zł 2026-12-20. Linia 36 000,00 zł to zabezpieczenie.');
    const prompt = sent.find((m) => m[1].content.includes(credit.title))!;
    expect(prompt[0].content).toMatch(/po polsku/);
    expect(prompt[0].content).toMatch(/bez wstępu/);
  });

  it('empty model reply → falls back to the rules\' why[]', async () => {
    reply = () => '';
    await runAutopilot();
    const credit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(credit.explanation).toBe(credit.why.join('. '));
  });
});

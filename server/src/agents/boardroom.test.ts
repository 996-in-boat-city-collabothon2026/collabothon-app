// Owner: Pair 2 (Person A). Conference: per-CFO facts, clean whole-sentence turns, number guard, PL/EN by topic.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { CfoId } from '@cfo/shared';
import type { ChatMessage, ChatOptions } from '../llm/provider';
import { config } from '../config';
import { setModelCallForTests } from '../llm/provider';
import { db, resetDb } from '../domain/store';
import { runAutopilot } from './autopilot';
import { CHAIR_MAX_TOKENS, ruleSummary, runBoardroom, snapshot, TURN_MAX_TOKENS, TURN_MAX_WORDS } from './boardroom';
import { cfoFacts } from './facts';
import { explainPL } from './explain';
import { wholeSentences } from './text';

const saved = { ...config.llm };
/** Fake model: `reply(messages)` answers each call. Mode openai_compat so the real chat() path runs. */
let reply: (m: ChatMessage[]) => string = () => '';
const sent: { m: ChatMessage[]; o: ChatOptions }[] = [];
const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia'];
const isChair = (m: ChatMessage[]) => m[0].content.includes('Reply ONLY with JSON');

beforeEach(() => {
  resetDb();
  sent.length = 0;
  reply = () => '';
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (m, o) => {
    sent.push({ m, o });
    return reply(m);
  }, 'openai_compat');
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('wholeSentences', () => {
  it('keeps whole sentences within the limit, keeps dates whole, never ends mid-word', () => {
    expect(wholeSentences('Jedno zdanie. Drugie zdanie. Trzecie zda', 10)).toBe('Jedno zdanie. Drugie zdanie.');
    expect(wholeSentences('Saldo 38 400,00 zł. Bufor 15 000,00 zł.', 4)).toBe('Saldo 38 400,00 zł.');
    expect(wholeSentences('Saldo spadnie 20.12.2026 do zera. Uwaga.', 20)).toBe('Saldo spadnie 20.12.2026 do zera. Uwaga.');
    expect(wholeSentences('bardzo długie zdanie bez kropki które się urwało w poło', 5)).toBe('bardzo długie zdanie bez kropki…');
    expect(wholeSentences('', 5)).toBe('');
  });
});

describe('snapshot (Polish, labelled numbers from the rules)', () => {
  it('has the seed numbers with clear labels', async () => {
    await runAutopilot();
    const s = snapshot();
    expect(s).toMatch(/Saldo dziś: 38\s400,00\szł/);
    expect(s).toMatch(/Najniższe saldo w prognozie \(2026-12-20\): -20\s275,00\szł\. To prognoza/);
    expect(s).toMatch(/Ryzyko EUR przy \+5%: 320,25\szł/);
    expect(s).toMatch(/linia kredytowa \(czeka na zgodę właściciela\), kwota 36\s000,00\szł/);
    expect(s).not.toMatch(/credit line|safety buffer|Bank balance/i);
  });
});

describe('conference: prompts and limits', () => {
  it('each turn gets only its own CFO facts, Polish by default, 120 tokens, temperature 0.1', async () => {
    await runAutopilot();
    sent.length = 0;
    await runBoardroom('Czy przeżyjemy grudzień?');
    const turns = sent.filter((c) => !isChair(c.m));
    expect(turns).toHaveLength(4);
    turns.forEach((c, i) => {
      expect(c.o).toMatchObject({ maxTokens: TURN_MAX_TOKENS, temperature: 0.1 });
      expect(c.m[1].content).toContain(cfoFacts(ORDER[i], 'pl').summary);
      expect(c.m[1].content).toContain('po polsku');
    });
    expect(turns[3].m[1].content).not.toMatch(/Saldo na koncie dziś/); // Kasia does not get Anna's balance facts
    expect(turns[3].m[1].content).toMatch(/^Marek: .*$/m); // but she hears the earlier turns
    expect(sent.find((c) => isChair(c.m))!.o).toMatchObject({ maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1 });
    expect(TURN_MAX_TOKENS).toBeLessThanOrEqual(130);
  });

  it('a long reply cut mid-word becomes whole sentences within the word limit; preamble and "Ty:" dropped', async () => {
    await runAutopilot();
    const cfoIn = (m: ChatMessage[]) => ORDER.find((c) => m[0].content.includes(`Jesteś ${c[0].toUpperCase()}${c.slice(1)}`))!;
    const filler = Array.from({ length: 12 }, (_, i) => `To jest zdanie numer ${i + 1}.`).join(' ') + ' I urwa';
    reply = (m) =>
      isChair(m) ? '{"summary":"Krótko i jasno.","decisionActionIds":[]}'
        : `Oto moja odpowiedź: Ty: ${cfoFacts(cfoIn(m), 'pl').summary.split(/(?<=\.)\s/)[0]} ${filler}`;
    const r = await runBoardroom();
    for (const t of r.turns) {
      expect(t.text.startsWith(cfoFacts(t.cfo, 'pl').summary.split(/(?<=\.)\s/)[0].slice(0, 12))).toBe(true);
      expect(t.text).not.toMatch(/^(Oto|Ty)/);
      expect(t.text.split(/\s+/).length).toBeLessThanOrEqual(TURN_MAX_WORDS);
      expect(t.text).toMatch(/\.$/);
    }
    expect(r.summary).toBe('Krótko i jasno.');
  });

  it('own facts come last in the prompt, after what the others said', async () => {
    await runAutopilot();
    sent.length = 0;
    await runBoardroom();
    const kasia = sent.filter((c) => !isChair(c.m))[3].m[1].content;
    expect(kasia.indexOf('CO POWIEDZIELI INNI')).toBeLessThan(kasia.indexOf('TWOJE FAKTY'));
    expect(kasia).not.toMatch(/na "Ty"/);
  });
});

describe('conference: number guard and fallbacks', () => {
  it('invented numbers → that turn says the rule conclusion; chair summary → rule summary', async () => {
    await runAutopilot();
    reply = (m) => {
      if (isChair(m)) return '{"summary":"Strata 50 230,00 zł w grudniu.","decisionActionIds":[]}';
      if (m[0].content.includes('Jesteś Anna')) return 'Razem 14 230 + 36 000 = 50 230,00 zł straty.';
      if (m[0].content.includes('Jesteś Kasia')) return 'EUR wzrosło o 4,5% w tym miesiącu. Zablokuj kurs.';
      if (m[0].content.includes('Jesteś Tomasz')) return 'Brakuje 1700,00 zł na robociźnie. Licz pełne godziny.';
      return 'Nic ważnego.';
    };
    const r = await runBoardroom();
    const text = (c: CfoId) => r.turns.find((t) => t.cfo === c)!.text;
    expect(text('anna')).toBe(cfoFacts('anna', 'pl').summary);
    expect(text('kasia')).toBe(cfoFacts('kasia', 'pl').summary); // "4,5%" is not in Kasia's facts
    expect(text('tomasz')).toBe('Brakuje 1700,00 zł na robociźnie. Licz pełne godziny.'); // real number, kept
    const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL');
    expect(r.summary).toBe(ruleSummary(approvals, 'pl'));
    expect(r.summary).toMatch(/^Do Twojej decyzji: .*36\s000,00\szł/);
  });

  it('a turn that repeats a colleague (no own amount, or a colleague\'s amount) → its own rule conclusion', async () => {
    await runAutopilot();
    reply = (m) => {
      if (isChair(m)) return '{"summary":"Krótko.","decisionActionIds":[]}';
      if (m[0].content.includes('Jesteś Tomasz')) return 'Ty: Ty musisz rozważyć linię kredytową 36 000,00 zł.';
      if (m[0].content.includes('Jesteś Marek')) return 'Wyślij przypomnienia do klientów.';
      return '';
    };
    const r = await runBoardroom();
    expect(r.turns.find((t) => t.cfo === 'tomasz')!.text).toBe(cfoFacts('tomasz', 'pl').summary);
    expect(r.turns.find((t) => t.cfo === 'marek')!.text).toBe(cfoFacts('marek', 'pl').summary);
  });

  it('model down → every turn is its rule conclusion; broken chair JSON → Polish rule summary, all approvals', async () => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? 'Sure! Here is the summary: {broken' : '');
    const r = await runBoardroom('Przegląd miesiąca');
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map((c) => cfoFacts(c, 'pl').summary));
    expect(r.summary).toMatch(/^Do Twojej decyzji/);
    expect(r.decisionActionIds).toHaveLength(db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL').length);
  });

  it('English topic → English prompts and English fallbacks', async () => {
    await runAutopilot();
    sent.length = 0;
    const r = await runBoardroom('Should we lock the EUR rate?');
    expect(sent[0].m[1].content).toContain('in English');
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map((c) => cfoFacts(c, 'en').summary));
    expect(r.summary).toMatch(/^For your decision: /);
  });
});

describe('approval explanations (autopilot)', () => {
  it('Polish rule text per card, rephrased by the model; preamble and address dropped', async () => {
    reply = (m) => (m[1].content.includes('Linia kredytowa') ? 'Oto wyjaśnienie: Ty: Linia kredytowa 36 000,00 zł pokryje lukę do 20.12.2026.' : '');
    await runAutopilot();
    const credit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(credit.explanation).toBe('Linia kredytowa 36 000,00 zł pokryje lukę do 20.12.2026.');
    const call = sent.find((c) => c.m[1].content.includes('Linia kredytowa'))!;
    expect(call.m[0].content).toMatch(/po polsku/);
    expect(call.m[1].content).toMatch(/Prognoza: 20\.12\.2026 saldo spadnie do -20\s275,00\szł, czyli 35\s275,00\szł poniżej bufora/);
    expect(call.o).toMatchObject({ maxTokens: 120, temperature: 0.1 });
  });

  it('rule texts say the right thing for each card (seed)', async () => {
    await runAutopilot();
    const card = (kind: string) => db.actions.find((a) => a.kind === kind)!;
    expect(explainPL(card('payment_reminder'))).toMatch(/^Klient FlotaTrans .* spóźnia się 15 dni z zapłatą 12\s300,00\szł .* e-mail do klienta/);
    expect(explainPL(card('tax_payment'))).toMatch(/^VAT za październik .*: 14\s230,00\szł trzeba zapłacić do 25\.11\.2026/);
    expect(explainPL(card('supplier_payment'))).toMatch(/Ryzyko EUR wzrośnie z 320,25\szł do 448,35\szł/);
    expect(explainPL(card('fx_hedge'))).toMatch(/stracisz 320,25\szł/);
  });

  it('invented rate, or the key amount missing → the Polish rule text', async () => {
    reply = (m) => (m[1].content.includes('EUR') ? 'Kurs forward to 4,30 zł na 3 miesiące.' : 'Zapłać szybko.');
    await runAutopilot();
    for (const a of db.actions.filter((x) => x.tier === 'NEEDS_APPROVAL' && x.status === 'open')) {
      expect(a.explanation).toBe(explainPL(a));
    }
  });

  it('empty model reply → the Polish rule text', async () => {
    await runAutopilot();
    const credit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(credit.explanation).toBe(explainPL(credit));
  });
});

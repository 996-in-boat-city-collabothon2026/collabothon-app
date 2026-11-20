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
import { claimsDone, falseCalm, wholeSentences } from './text';

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

const en = (c: CfoId) => cfoFacts(c, 'en').summary;
const persona = (m: ChatMessage[], c: CfoId) => m[0].content.includes(`You are ${c[0].toUpperCase()}${c.slice(1)}`);

describe('conference: English on stage, prompts and limits', () => {
  it('Polish topic → each turn still gets English facts and must answer in English; 120 tokens, temperature 0.1', async () => {
    await runAutopilot();
    sent.length = 0;
    await runBoardroom('Czy przeżyjemy grudzień?');
    const turns = sent.filter((c) => !isChair(c.m));
    expect(turns).toHaveLength(4);
    turns.forEach((c, i) => {
      expect(c.o).toMatchObject({ maxTokens: TURN_MAX_TOKENS, temperature: 0.1 });
      expect(c.m[1].content).toContain(en(ORDER[i]));
      expect(c.m[1].content).toContain('in English');
    });
    expect(turns[3].m[1].content).not.toMatch(/Bank balance today/); // Kasia does not get Anna's balance facts
    expect(turns[3].m[1].content).toMatch(/^Marek: .*$/m); // but she hears the earlier turns
    expect(sent.find((c) => isChair(c.m))!.o).toMatchObject({ maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1 });
    expect(TURN_MAX_TOKENS).toBeLessThanOrEqual(130);
  });

  it('no topic → "Monthly review", English rule fallbacks everywhere when the model is down', async () => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? 'Sure! Here is the summary: {broken' : '');
    const r = await runBoardroom();
    expect(sent.find((c) => !isChair(c.m))!.m[1].content).toContain('MEETING TOPIC: Monthly review');
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map(en));
    expect(r.summary).toMatch(/^For your decision: /);
    expect(r.decisionActionIds).toHaveLength(db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL').length);
  });

  it('a long reply cut mid-word becomes whole sentences within the word limit; preamble and address dropped', async () => {
    await runAutopilot();
    const cfoIn = (m: ChatMessage[]) => ORDER.find((c) => persona(m, c))!;
    const filler = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1}.`).join(' ') + ' And then it bre';
    const first = (c: CfoId) => en(c).split(/(?<=\.)\s/)[0];
    reply = (m) => (isChair(m) ? '{"summary":"Short and clear.","decisionActionIds":[]}' : `Here's my answer: ${first(cfoIn(m))} ${filler}`);
    const r = await runBoardroom();
    for (const t of r.turns) {
      expect(t.text.startsWith(first(t.cfo).slice(0, 12))).toBe(true);
      expect(t.text).not.toMatch(/^Here/);
      expect(t.text.split(/\s+/).length).toBeLessThanOrEqual(TURN_MAX_WORDS);
      expect(t.text).toMatch(/\.$/);
    }
    expect(r.summary).toBe('Short and clear.');
  });

  it('own facts come last in the prompt, after what the others said', async () => {
    await runAutopilot();
    sent.length = 0;
    await runBoardroom();
    const kasia = sent.filter((c) => !isChair(c.m))[3].m[1].content;
    expect(kasia.indexOf('WHAT THE OTHERS SAID')).toBeLessThan(kasia.indexOf('YOUR FACTS'));
  });
});

describe('conference: the same safeguards as /api/ask', () => {
  it('invented numbers → that turn says the rule conclusion; chair summary → rule summary', async () => {
    await runAutopilot();
    reply = (m) => {
      if (isChair(m)) return '{"summary":"A loss of 50 230,00 zł in December.","decisionActionIds":[]}';
      if (persona(m, 'anna')) return '14 230 + 36 000 = 50 230,00 zł of losses.';
      if (persona(m, 'kasia')) return 'EUR went up 4,5% this month. Lock the rate.';
      if (persona(m, 'tomasz')) return 'You are missing 1700,00 zł on labour. Bill the full hours.';
      return 'Nothing important.';
    };
    const r = await runBoardroom();
    const text = (c: CfoId) => r.turns.find((t) => t.cfo === c)!.text;
    expect(text('anna')).toBe(en('anna'));
    expect(text('kasia')).toBe(en('kasia')); // "4,5%" is not in Kasia's facts
    expect(text('tomasz')).toBe('You are missing 1700,00 zł on labour. Bill the full hours.'); // real number, kept
    const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL');
    expect(r.summary).toBe(ruleSummary(approvals, 'en'));
  });

  it('a Polish turn, a repeated colleague, a done-claim, false calm or a flipped sign → rule conclusion', async () => {
    await runAutopilot();
    reply = (m) => {
      if (isChair(m)) return '{"summary":"The forward for 1500 EUR has been locked and the reminders were sent.","decisionActionIds":[]}';
      if (persona(m, 'marek')) return 'VAT 14 230,00 zł trzeba zapłacić do 25.11.2026.'; // Polish
      if (persona(m, 'tomasz')) return 'You should consider the credit line of 36 000,00 zł.'; // Anna's number
      if (persona(m, 'kasia')) return 'If EUR rises 5%, you lose 320,25 zł, so you have nothing to lose.';
      if (persona(m, 'anna')) return 'Your lowest balance will be 20 275,00 zł on December 20, 2026.'; // loss → positive
      return '';
    };
    const r = await runBoardroom();
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map(en));
    expect(r.summary).toMatch(/^For your decision: /);
  });

  it('done-claim and false-calm checks do not fire on proposals', () => {
    expect(claimsDone('I suggest sending reminders and locking the rate.')).toBe(false);
    expect(claimsDone('The invoice must be sent again.')).toBe(false);
    expect(claimsDone('The reminders have been sent.')).toBe(true);
    expect(claimsDone('Przypomnienia zostały wysłane.')).toBe(true);
    expect(falseCalm('You have nothing to lose.')).toBe(true);
    expect(falseCalm('You lose 320,25 zł if EUR rises.')).toBe(false);
  });

  it('no EUR rate: Kasia says in English the conversion is unavailable, the other agents finish', async () => {
    db.fxRates = db.fxRates.filter((r) => r.currency !== 'EUR');
    await runAutopilot();
    const r = await runBoardroom();
    expect(r.turns).toHaveLength(4);
    expect(r.turns.find((t) => t.cfo === 'kasia')!.text).toMatch(/no NBP rate for EUR, so the conversion to złoty is unavailable/);
    expect(r.turns.find((t) => t.cfo === 'anna')!.text).toBe(en('anna'));
    expect(db.actions.some((a) => a.kind === 'credit_line')).toBe(true);
  });

  it('one EUR rate: Kasia quotes it, no 4-week trend', async () => {
    db.fxRates = [...db.fxRates.filter((r) => r.currency !== 'EUR'), { currency: 'EUR', date: '2026-11-19', midPLN: 4.27 }];
    const f = cfoFacts('kasia', 'en');
    expect(f.lines.join('\n')).toMatch(/at the NBP rate 4,27 zł/);
    expect(f.lines.join('\n')).not.toMatch(/4 weeks ago/);
    expect(f.summary).not.toMatch(/going up/);
  });
});

describe('approval explanations (autopilot)', () => {
  it('explanations are the Polish rule text, no model call (live: rephrasing added nonsense)', async () => {
    reply = () => 'Sedno: Oto prognoza. Wszystkie kwoty muszą być zapłacone na naszą konto bankowe.';
    await runAutopilot();
    expect(sent).toHaveLength(0);
    const credit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(credit.explanation).toBe(explainPL(credit));
    expect(credit.explanation).toMatch(/^Prognoza: 20\.12\.2026 saldo spadnie do -20\s275,00\szł, czyli 35\s275,00\szł poniżej bufora/);
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

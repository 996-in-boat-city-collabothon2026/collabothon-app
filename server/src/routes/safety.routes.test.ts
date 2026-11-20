// Owner: Pair 2. Review of 8d96df5: four classes of unsafe model text, each sent through the REAL routes
// (POST /api/ask, an agent turn in POST /api/boardroom, and the chair's valid JSON summary).
// Every unsafe reply must give HTTP 200 AND exactly the English rule fallback; every safe English reply in the same
// class must reach the owner unchanged (so "always return the fallback" fails these tests).
import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult, BoardroomResult, CfoId } from '@cfo/shared';
import { config } from '../config';
import { db, resetDb } from '../domain/store';
import { settlePayment } from '../domain/settle';
import { setModelCallForTests, type ChatMessage } from '../llm/provider';
import { runAutopilot } from '../agents/autopilot';
import { ruleSummary } from '../agents/boardroom';
import { cfoFacts } from '../agents/facts';
import { textProblem, looksPolish } from '../agents/safety';
import boardroom from './boardroom';

const saved = { ...config.llm };
let reply: (m: ChatMessage[]) => string = () => '';
let calls = 0;
const isChair = (m: ChatMessage[]) => m[0].content.includes('Reply ONLY with JSON');
const speaker = (m: ChatMessage[]): CfoId | undefined =>
  (['marek', 'anna', 'tomasz', 'kasia'] as CfoId[]).find((c) => m[0].content.includes(`You are ${c[0].toUpperCase()}${c.slice(1)}`));
const rule = (cfo: CfoId) => cfoFacts(cfo).summary;
const chairFallback = () =>
  ruleSummary(db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL'));

async function post<T>(url: string, payload: object): Promise<{ status: number; body: T }> {
  const app = Fastify();
  await app.register(boardroom, { prefix: '/api' });
  const res = await app.inject({ method: 'POST', url, payload });
  return { status: res.statusCode, body: res.json<T>() };
}
const ask = (question: string) => post<AskResult>('/api/ask', { question });
const conference = () => post<BoardroomResult>('/api/boardroom', {});

beforeEach(async () => {
  resetDb();
  await runAutopilot(); // the chair needs the open approval cards
  calls = 0;
  reply = () => '';
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (m) => {
    calls++;
    return reply(m);
  }, 'openai_compat');
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

/** One unsafe reply of a class: the question for /api/ask, which agent says it, and the text. */
interface Case { name: string; question: string; cfo: CfoId; text: string; before?: () => void }

const UNSAFE: Case[] = [
  // 1. a completed action that did not happen (VAT is unpaid on the seed)
  { name: 'done: "got paid"', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT of 14,230 zł got paid.' },
  { name: 'done: "went out"', question: 'Will I have enough cash?', cfo: 'anna', text: 'The reminder to FlotaTrans Sp. z o.o. for 12 300,00 zł went out.' },
  { name: 'done: "is complete"', question: 'How much VAT do I owe?', cfo: 'marek', text: 'The payment of VAT of 14,230 zł is complete.' },
  { name: 'done: "was paid yesterday" (kept)', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT of 14,230 zł was paid yesterday.' },
  // 2. invented money in formats the validator cannot read, next to a true figure
  { name: 'money: number words', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14,230 zł. Add a fee of fifteen thousand euro.' },
  { name: 'money: "17,-"', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14,230 zł. Add a fee of 17,-.' },
  { name: 'money: "15k zł"', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14,230 zł. Add a fee of 15k zł.' },
  { name: 'money: wrong currency', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14,230 EUR, due on November 25, 2026.' },
  { name: 'money: invented 17 zł (kept)', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14,230 zł. The late fee is 17 zł.' },
  // 3. the FX move in the wrong direction (the shop owes EUR: the loss comes from EUR appreciation)
  { name: 'FX: "depreciation"', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'A 5% depreciation would cost you 320,25 zł.' },
  { name: 'FX: "weakens"', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If the euro weakens by 5%, you lose 320,25 zł.' },
  { name: 'FX: "złoty strengthens"', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If the złoty strengthens 5%, you lose 320,25 zł.' },
  { name: 'FX: two clauses, second wrong', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'EUR is rising, so a 5% depreciation would cost you 320,25 zł.' },
  { name: 'FX: "-5%" (kept)', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'A -5% change would cost you 320,25 zł.' },
  // 4. Polish, also without diacritics or mixed into English
  { name: 'Polish: no diacritics', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT to 14 230 zł. Zaplac go.' },
  { name: 'Polish: mixed instruction', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14 230,00 zł, zaplac do 25 listopada.' },
  { name: 'Polish: short ambiguous', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT 14 230 zł.' },
  { name: 'Polish: diacritics (kept)', question: 'How much VAT do I owe?', cfo: 'marek', text: 'Podatek VAT wynosi 14 230 zł.' },
  // Review of bc24564: a loss told as a gain, a fee in another currency, a payment confirmed by the receiver
  { name: 'FX: loss told as a gain', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If EUR rises 5%, you gain 320,25 zł.' },
  { name: 'money: £17', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14,230 zł. You owe an extra £17.' },
  { name: 'money: 17 GBP', question: 'How much VAT do I owe?', cfo: 'marek', text: 'You owe VAT of 14,230 zł. The surcharge is 17 GBP.' },
  { name: 'done: receiver confirms', question: 'How much VAT do I owe?', cfo: 'marek', text: 'You owe VAT of 14,230 zł. The tax office received your payment.' },
];

const SAFE: Case[] = [
  { name: 'done: negation', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT of 14,230 zł has not been paid yet, it is due on November 25, 2026.' },
  { name: 'done: proposal', question: 'How much VAT do I owe?', cfo: 'marek', text: 'We can send reminders about VAT of 14,230 zł before November 25, 2026.' },
  { name: 'done: hypothetical', question: 'How much VAT do I owe?', cfo: 'marek', text: 'Once VAT of 14,230 zł is paid, the deadline of November 25, 2026 is met.' },
  { name: 'money: supported formats', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is 14.230,00 PLN, written also as 14,230 zł, due on November 25, 2026.' },
  {
    name: 'money: a small fee that is in the facts',
    question: 'How much VAT do I owe?',
    cfo: 'marek',
    text: 'VAT is 17 zł, due on November 25, 2026. Invoice FV/2026/11/009 must be fixed and sent again.',
    before: () => {
      db.obligations.find((o) => o.id === 'ob-vat-10')!.amountPLN = 17;
    },
  },
  { name: 'FX: appreciation', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'A 5% appreciation of the euro would cost you 320,25 zł on the 1500 EUR you owe.' },
  { name: 'FX: złoty weakens', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If the złoty weakens 5% against the euro, you lose 320,25 zł on 1500 EUR.' },
  { name: 'FX: neutral "5% risk"', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'There is a 5% risk on the 1500 EUR you owe: up to 320,25 zł.' },
  { name: 'English: names and zł', question: 'Will I have enough cash?', cfo: 'anna', text: 'Kurier Express Kraków owes you 7 380,00 zł and FlotaTrans Sp. z o.o. owes you 12 300,00 zł: remind them before the balance drops to -20 275,00 zł.' },
  { name: 'English: short', question: 'How much VAT do I owe?', cfo: 'marek', text: 'Pay VAT of 14 230,00 zł by November 25, 2026.' },
  // Review of bc24564: the controls next to the new checks, each with a true VAT / FX fact
  { name: 'FX: loss told as a loss', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If EUR rises 5%, you lose 320,25 zł.' },
  { name: 'done: receiver, negation', question: 'How much VAT do I owe?', cfo: 'marek', text: 'You owe VAT of 14,230 zł, due November 25, 2026: the tax office has not received your payment yet.' },
  { name: 'done: receiver, condition', question: 'How much VAT do I owe?', cfo: 'marek', text: 'You owe VAT of 14,230 zł: the deadline of November 25, 2026 is met only if the tax office receives your payment by then.' },
];

describe('POST /api/ask: unsafe → exact English rule fallback, HTTP 200, one model call', () => {
  it.each(UNSAFE)('$name', async ({ question, cfo, text, before }) => {
    before?.();
    reply = () => text;
    const r = await ask(question);
    expect(r.status).toBe(200);
    expect(r.body.cfo).toBe(cfo);
    expect(r.body.text).toBe(rule(cfo));
    expect(calls).toBe(1);
  });
});

describe('POST /api/ask: safe English → shown unchanged', () => {
  it.each(SAFE)('$name', async ({ question, cfo, text, before }) => {
    before?.();
    reply = () => text;
    const r = await ask(question);
    expect(r.status).toBe(200);
    expect(r.body.cfo).toBe(cfo);
    expect(r.body.text).toBe(text);
  });
});

describe('POST /api/boardroom, agent turn: unsafe → that agent\'s rule conclusion; safe → unchanged', () => {
  it.each(UNSAFE)('unsafe $name', async ({ cfo, text, before }) => {
    before?.();
    reply = (m) => (speaker(m) === cfo ? text : '');
    const r = await conference();
    expect(r.status).toBe(200);
    expect(r.body.turns.find((t) => t.cfo === cfo)!.text).toBe(rule(cfo));
    expect(calls).toBe(5);
  });
  it.each(SAFE)('safe $name', async ({ cfo, text, before }) => {
    before?.();
    reply = (m) => (speaker(m) === cfo ? text : '');
    const r = await conference();
    expect(r.status).toBe(200);
    expect(r.body.turns.find((t) => t.cfo === cfo)!.text).toBe(text);
  });
});

describe('POST /api/boardroom, chair (valid JSON): unsafe summary → rule summary; safe → unchanged', () => {
  const chairSays = (summary: string) => (m: ChatMessage[]) => (isChair(m) ? JSON.stringify({ summary, decisionActionIds: [] }) : '');
  it.each(UNSAFE)('unsafe $name', async ({ text, before }) => {
    before?.();
    reply = chairSays(text);
    const r = await conference();
    expect(r.status).toBe(200);
    expect(r.body.summary).toBe(chairFallback());
    expect(calls).toBe(5);
  });
  it.each([
    'The advisors propose paying VAT of 14 230,00 zł by November 25, 2026 and sending reminders. The owner decides.',
    'If EUR rises 5%, the owner loses 320,25 zł, so a forward contract for 1500 EUR is proposed for approval.',
  ])('safe: %s', async (summary) => {
    reply = chairSays(summary);
    const r = await conference();
    expect(r.status).toBe(200);
    expect(r.body.summary).toBe(summary);
  });
});

describe('FX direction after settling Krause (the shop is owed EUR: the loss comes from EUR depreciation)', () => {
  const settle = () => settlePayment(15372, 'inv-p-002');
  it.each([
    'A 5% appreciation would cost you 448,35 zł.',
    'If the euro strengthens 5%, you lose 448,35 zł.',
    'If EUR rises 5%, you lose 448,35 zł.',
    'A +5% change would cost you 448,35 zł.',
    'EUR is falling, so a 5% appreciation would cost you 448,35 zł.',
    'If EUR falls 5%, you gain 448,35 zł.', // review of bc24564: the loss told as a gain, receivable side
  ])('unsafe: %s', async (text) => {
    settle();
    reply = () => text;
    expect((await ask('Is the euro rate a problem?')).body.text).toBe(rule('kasia'));
    reply = (m) => (speaker(m) === 'kasia' ? text : '');
    expect((await conference()).body.turns[3].text).toBe(rule('kasia'));
  });
  it.each([
    'A 5% depreciation of the euro would cost you 448,35 zł on the 2100 EUR you will receive.',
    'If the euro weakens 5%, you lose 448,35 zł on the 2100 EUR you will receive.',
    'If EUR falls 5%, you lose 448,35 zł.',
  ])('safe: %s', async (text) => {
    settle();
    expect(rule('kasia')).toMatch(/If EUR falls 5%/);
    reply = () => text;
    expect((await ask('Is the euro rate a problem?')).body.text).toBe(text);
  });
});

describe('every seeded English rule text passes its own safety check', () => {
  it('fact lines, summaries, card titles and explanations', () => {
    for (const cfo of ['marek', 'anna', 'tomasz', 'kasia'] as CfoId[]) {
      const f = cfoFacts(cfo);
      const known = [...f.lines, f.summary].join('\n');
      for (const line of [...f.lines, f.summary]) expect([cfo, line, textProblem(line, known)]).toEqual([cfo, line, '']);
    }
    for (const a of db.actions) {
      for (const t of [a.title, a.explanation ?? '']) if (t) expect([t, looksPolish(t)]).toEqual([t, false]);
      if (a.explanation) {
        const known = [...cfoFacts(a.cfo).lines, cfoFacts(a.cfo).summary, a.explanation].join('\n');
        expect([a.explanation, textProblem(a.explanation, known)]).toEqual([a.explanation, '']);
      }
    }
  });
});

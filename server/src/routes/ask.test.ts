// Owner: Pair 2 (Person B). POST /api/ask: "the bubble works as before". Rebuild 2 (docs/AGENTS-8B-PLAN.md): the
// model writes the answer (agents/cfo.ts); the routing cases moved to agents/topic.test.ts. Fake model, no GPU.
import Fastify from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult } from '@cfo/shared';
import { config } from '../config';
import { resetDb } from '../domain/store';
import { setModelCallForTests, type ChatMessage } from '../llm/provider';
import { cfoFacts } from '../agents/facts';
import boardroom from './boardroom';

// The real guard (agents/guard.ts, Person A) checks every reply, so these are end-to-end through the route.

const saved = { ...config.llm };
let modelReply = '';
let lastPrompt: ChatMessage[] = [];
let calls = 0;

async function post(payload: unknown) {
  const app = Fastify();
  await app.register(boardroom, { prefix: '/api' });
  return app.inject({ method: 'POST', url: '/api/ask', payload: payload as object });
}
const ask = async (payload: object) => (await post(payload)).json<AskResult>();

beforeEach(() => {
  modelReply = '';
  calls = 0;
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (messages) => {
    calls++;
    lastPrompt = messages;
    return modelReply;
  }, 'openai_compat');
});
afterEach(() => {
  setModelCallForTests(null);
  resetDb();
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('POST /api/ask: the answer', () => {
  it('is { cfo, text }, picked by topic, in the model\'s own words when the guard accepts them', async () => {
    modelReply = 'Your margin suffers because some labour is billed too low. Raise those prices first.';
    const r = await ask({ question: 'How to improve the margin?' });
    expect(Object.keys(r).sort()).toEqual(['cfo', 'text']);
    expect(r).toEqual({ cfo: 'tomasz', text: modelReply });
    expect(lastPrompt[0].content).toContain('You are Tomasz');
    expect(lastPrompt[1].content).toContain('OWNER ASKS: How to improve the margin?');
  });

  it('a named CFO answers, even off their topic', async () => {
    const r = await ask({ cfo: 'kasia', question: 'How much VAT do I owe?' });
    expect(r.cfo).toBe('kasia');
    expect(lastPrompt[0].content).toContain('You are Kasia');
  });

  it('a cfo that is not ours ("toString", "__proto__", …) is ignored: picked by topic', async () => {
    for (const cfo of ['toString', 'constructor', '__proto__', 'nobody']) {
      expect((await ask({ cfo, question: 'How much VAT do I owe?' })).cfo).toBe('marek');
    }
  });

  it('model down → the rule summary of the picked CFO', async () => {
    modelReply = '';
    expect(await ask({ question: 'Will we survive December?' })).toEqual({ cfo: 'anna', text: cfoFacts('anna').summary });
    expect(calls).toBe(1);
  });
});

describe('POST /api/ask: body checks', () => {
  it.each([
    ['empty question', { question: '   ' }],
    ['a number', { question: 123 }],
    ['an object', { question: { a: 1 } }],
    ['no question', { cfo: 'anna' }],
    ['too long', { question: 'x'.repeat(1001) }],
  ])('%s → 400, and no model call', async (_name, payload) => {
    expect((await post(payload)).statusCode).toBe(400);
    expect(calls).toBe(0);
  });
});

describe('POST /api/ask: history (a chat after a meeting)', () => {
  const line = (text: string) => ({ from: 'owner', text });

  it('no history works as before', async () => {
    modelReply = 'Your margin suffers because some labour is billed too low. Raise those prices first.';
    expect(await ask({ question: 'How to improve the margin?' })).toEqual({ cfo: 'tomasz', text: modelReply });
  });

  it('up to 6 good lines are accepted', async () => {
    const history = [line('a'), { from: 'cfo', cfo: 'kasia', text: 'b' }, line('c'), line('d'), line('e'), line('f')];
    expect((await post({ question: 'How to improve the margin?', history })).statusCode).toBe(200);
  });

  it.each([
    ['7 items', { history: Array.from({ length: 7 }, (_, i) => line(`m${i}`)) }],
    ['not an array', { history: 'x' }],
    ['a line that is not an object', { history: ['x'] }],
    ['an unknown "from"', { history: [{ from: 'bank', text: 'hi' }] }],
    ['a CFO that is not ours', { history: [{ from: 'cfo', cfo: 'toString', text: 'hi' }] }],
    ['no text', { history: [{ from: 'owner' }] }],
    ['text too long', { history: [line('x'.repeat(501))] }],
  ])('%s → 400, and no model call', async (_name, extra) => {
    const r = await post({ question: 'Why?', ...extra });
    expect(r.statusCode).toBe(400);
    expect(calls).toBe(0);
  });
});

describe('POST /api/ask: follow-ups use the history', () => {
  const afterKasia = [
    { from: 'owner', text: 'Should we lock the EUR rate?' },
    { from: 'cfo', cfo: 'kasia', text: 'Yes, a forward contract would protect the Krause invoice.' },
  ];

  it('"Why?" after Kasia → kasia answers, and the prompt holds the chat', async () => {
    const r = await ask({ question: 'Why?', history: afterKasia });
    expect(r.cfo).toBe('kasia');
    expect(lastPrompt[1].content).toContain('Kasia: Yes, a forward contract would protect the Krause invoice.');
  });

  it('"When is VAT due?" after Kasia → marek', async () => {
    expect((await ask({ question: 'When is VAT due?', history: afterKasia })).cfo).toBe('marek');
  });

  it('only the last 4 lines reach the prompt', async () => {
    const history = ['one', 'two', 'three', 'four', 'five', 'six'].map((text) => ({ from: 'owner', text }));
    await ask({ question: 'Why?', history });
    expect(lastPrompt[1].content).not.toContain('Owner: two');
    expect(lastPrompt[1].content).toContain('Owner: three');
    expect(lastPrompt[1].content).toContain('Owner: six');
  });

  it('after a full meeting (6 lines) "Why?" goes to the lead, and only the last 4 lines reach the prompt', async () => {
    const history = [
      { from: 'owner', text: 'Should we lock the EUR rate?' },
      { from: 'cfo', cfo: 'kasia', text: 'Lock the rate with a forward contract.' },
      { from: 'cfo', cfo: 'anna', text: 'Cash is tight.' },
      { from: 'cfo', cfo: 'tomasz', text: 'Margins are thin.' },
      { from: 'cfo', cfo: 'marek', text: 'VAT is due on the 25th.' },
      { from: 'cfo', text: 'Joint recommendation: lock the rate first.' },
    ];
    expect((await ask({ question: 'Why?', history })).cfo).toBe('kasia');
    expect(lastPrompt[1].content).not.toContain('Owner: Should we lock');
    expect(lastPrompt[1].content).toContain('Anna: Cash is tight.');
  });

  it('a chat as the web sends it (chair line without a CFO, a long turn cut to 500) → 200, stays with the last CFO', async () => {
    const history = [
      { from: 'cfo', cfo: 'kasia', text: 'k'.repeat(500) },
      { from: 'cfo', cfo: 'anna', text: 'Cash is tight in December.' },
      { from: 'cfo', text: 'Joint recommendation: lock the rate first.' },
      { from: 'owner', text: 'OK' },
    ];
    const r = await post({ question: 'Why?', history });
    expect(r.statusCode).toBe(200);
    expect(r.json<AskResult>().cfo).toBe('anna');
    expect(lastPrompt[1].content).toContain('CFO: Joint recommendation: lock the rate first.');
  });

  it('a history with "99 999 zł" and a model that repeats it → the answer never contains 99 999', async () => {
    modelReply = 'Because your VAT is 99 999 zł.';
    const r = await ask({ question: 'Why?', history: [
      { from: 'owner', text: 'Is my VAT 99 999 zł?' },
      { from: 'cfo', cfo: 'marek', text: 'Your VAT is 99 999 zł.' },
    ] });
    expect(r.cfo).toBe('marek');
    expect(r.text).not.toContain('99 999');
    expect(r.text).toBe(cfoFacts('marek').summary);
  });
});

describe('POST /api/ask: numbers come only from the rules', () => {
  it('"Is my VAT 99 999 zł?" with a model that repeats 99 999 → the answer never contains 99 999', async () => {
    modelReply = 'Yes, your VAT is 99 999 zł.';
    const r = await ask({ question: 'Is my VAT 99 999 zł?' });
    expect(r.cfo).toBe('marek');
    expect(r.text).not.toContain('99 999');
    expect(r.text).toBe(cfoFacts('marek').summary);
  });
});

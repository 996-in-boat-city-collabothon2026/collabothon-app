// Owner: Pair 2. pickCfo (Person B: moves to agents/topic.test.ts) and POST /api/boardroom (Person C).
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BoardroomResult } from '@cfo/shared';
import { config } from '../config';
import { db, resetDb } from '../domain/store';
import { setModelCallForTests } from '../llm/provider';
import { cfoFacts } from '../agents/facts';
import routes, { pickCfo } from './boardroom';

describe('pickCfo', () => {
  it.each([
    ['Is the euro rate a problem?', 'kasia'],
    ['Should I hedge my EUR invoices?', 'kasia'],
    ['How much VAT do I pay this month?', 'marek'],
    ['KSeF rejected my invoice, what now?', 'marek'],
    ['When is ZUS due?', 'marek'],
    ['Is my margin on parts too low?', 'tomasz'],
    ['How can I cut costs?', 'tomasz'],
    ['Is my labour rate too low?', 'tomasz'],
    ['How much should I charge per hour?', 'tomasz'], // review of bc24564: pricing questions
    ['How much should I charge for an oil change?', 'tomasz'],
    ['Will the bank charge me for the overdraft?', 'anna'], // "charge" alone is not pricing
    ['Anna, how much should I charge per hour?', 'anna'], // a CFO asked by name still wins
    ['How much should I ask the bank to lend me?', 'anna'], // review of f5f7df5: a loan, not a price
    ['Will I have enough cash until the end of the month?', 'anna'],
    ['Do I need a loan?', 'anna'],
    ['A customer is late paying me', 'anna'],
    ['Will the cash last through December?', 'anna'],
  ])('%s → %s', (question, cfo) => {
    expect(pickCfo(question)).toBe(cfo);
  });

  it('a CFO asked by name always answers', () => {
    expect(pickCfo('Tomasz, is the euro rate a problem?')).toBe('tomasz');
  });

  it('no keywords → Anna', () => {
    expect(pickCfo('Good morning!')).toBe('anna');
  });

  it('short words do not match inside longer ones', () => {
    expect(pickCfo('I went to the hospital')).toBe('anna'); // "pit" inside "hospital"
  });
});

describe('pickCfo: pricing vs loans (review of f5f7df5)', () => {
  it.each([
    ['How much should I ask customers for a brake job?', 'tomasz'],
    ['How much can I borrow?', 'anna'],
    ['Should I ask for a bigger credit line?', 'anna'],
    ['How much VAT should I pay?', 'marek'],
    ['Is the euro going up?', 'kasia'],
  ])('%s → %s', (q, cfo) => expect(pickCfo(q)).toBe(cfo));
});

// ---------- POST /api/boardroom (Person C, docs/AGENTS-8B-PLAN.md C2): the API works as before ----------
// The route is unchanged (runBoardroom(req.body?.topic) + BOARDROOM_BODY); these tests pin its shape for the web app.
describe('POST /api/boardroom', () => {
  let calls = 0;
  let down = false;
  const saved = { ...config.llm };
  beforeEach(() => {
    resetDb();
    calls = 0;
    down = false;
    Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
    setModelCallForTests(async () => {
      calls++;
      if (down) throw new Error('model down');
      return 'The model says this in its own words.'; // no numbers: any guard accepts it
    }, 'openai_compat');
  });
  afterEach(() => {
    setModelCallForTests(null);
    resetDb();
    Object.assign(config.llm, saved);
  });

  async function post(payload?: unknown) {
    const app = Fastify();
    await app.register(routes, { prefix: '/api' });
    const res = await app.inject({ method: 'POST', url: '/api/boardroom', ...(payload === undefined ? {} : { payload: payload as object }) });
    await app.close();
    return res;
  }

  it('the answer has exactly turns, summary and decisionActionIds (the BoardroomResult the web page reads)', async () => {
    const res = await post({ topic: 'How to improve the margin?' });
    expect(res.statusCode).toBe(200);
    const r = res.json<BoardroomResult>();
    expect(Object.keys(r).sort()).toEqual(['decisionActionIds', 'summary', 'turns']);
    expect(r.turns[0].cfo).toBe('tomasz'); // the topic reaches runBoardroom
    for (const t of r.turns) expect(typeof t.text).toBe('string');
    expect(typeof r.summary).toBe('string');
    for (const id of r.decisionActionIds) expect(db.actions.find((a) => a.id === id)?.status).toBe('open');
  });

  it('{} or an empty topic → the general meeting (all 4 speak); no body at all → 400 (the web always sends { topic })', async () => {
    expect((await post()).statusCode).toBe(400);
    expect((await post({ topic: '  ' })).json<BoardroomResult>().turns).toHaveLength(4);
    expect((await post({})).json<BoardroomResult>().turns).toHaveLength(4);
  });

  it('"hello" → "Pick a topic", no model call', async () => {
    const r = (await post({ topic: 'hello' })).json<BoardroomResult>();
    expect(r.turns).toEqual([]);
    expect(r.summary).toContain('Pick a topic');
    expect(calls).toBe(0);
  });

  it('bad bodies: an object or a topic over 200 characters → 400; a number is read as text ("123"), never a 500', async () => {
    expect((await post({ topic: { a: 1 } })).statusCode).toBe(400);
    expect((await post({ topic: 'x'.repeat(201) })).statusCode).toBe(400);
    // Fastify turns 123 into "123" (coercion), so this is 200: "123" is small talk, the model is not called.
    const n = await post({ topic: 123 });
    expect(n.statusCode).toBe(200);
    expect(n.json<BoardroomResult>().turns).toEqual([]);
    expect(calls).toBe(0);
  });

  it('model down → still 200, every turn is its CFO\'s rule text', async () => {
    down = true;
    const res = await post({ topic: 'Monthly review' });
    expect(res.statusCode).toBe(200);
    for (const t of res.json<BoardroomResult>().turns) expect(t.text).toBe(cfoFacts(t.cfo).summary);
  });
});

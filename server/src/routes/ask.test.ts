// Owner: Pair 2 (Person B). POST /api/ask. Rebuild M4 (docs/PAIR2-REBUILD.md): the model picks rule points by id
// and may add one checked comment (agents/answer.ts). Its free text is never shown, even when it is true.
// Every wrong (and true) free-text reply from the reviews is in agents/review-corpus.ts, checked by agents/corpus.test.ts.
import Fastify from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult, BoardroomResult, CfoId } from '@cfo/shared';
import { config } from '../config';
import { db, resetDb } from '../domain/store';
import { setModelCallForTests, type ChatMessage } from '../llm/provider';
import { settlePayment } from '../domain/settle';
import { runAutopilot } from '../agents/autopilot';
import { cfoFacts } from '../agents/facts';
import { agentModel } from '../agents/answer';
import { COMMENTS } from '../agents/comments';
import boardroom, { ruleAnswer } from './boardroom';

let modelReply = '';
const sp = (s: string) => s.replace(/ /g, ' '); // fmtPLN uses no-break spaces
let lastPrompt: ChatMessage[] = [];
let calls = 0;
const saved = { ...config.llm };

async function ask(question: string): Promise<AskResult> {
  const app = Fastify();
  await app.register(boardroom, { prefix: '/api' });
  return (await app.inject({ method: 'POST', url: '/api/ask', payload: { question } })).json<AskResult>();
}

beforeEach(() => {
  resetDb(); // no "Run check" needed: the facts come straight from the rules
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  calls = 0;
  setModelCallForTests(async (messages) => {
    calls++;
    lastPrompt = messages;
    return modelReply;
  }, 'openai_compat');
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('POST /api/ask', () => {
  it('sends only this CFO\'s points with their ids and asks for the JSON choice', async () => {
    modelReply = '';
    await ask('Is the euro rate a problem?');
    const prompt = sp(lastPrompt[1].content);
    expect(prompt).toContain('POINTS');
    expect(prompt).toContain('- fx-EUR (main): You have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł');
    expect(prompt).toContain('- rate-EUR (detail): ');
    expect(prompt).toContain('OWNER ASKS: Is the euro rate a problem?');
    expect(prompt).toContain('Reply ONLY with JSON');
    expect(prompt).not.toContain('36 000,00 zł'); // Anna's credit line is not Kasia's business
  });

  it('a true English free-text reply is still not shown: only rule text reaches the owner', async () => {
    modelReply = 'You have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł.';
    expect(await ask('Is the euro rate a problem?')).toEqual({ cfo: 'kasia', text: ruleAnswer('kasia') });
  });

  it('model down → the same rule conclusion', async () => {
    setModelCallForTests(async () => {
      throw new Error('model down');
    }, 'openai_compat');
    expect((await ask('How much VAT do I pay?')).text).toBe(ruleAnswer('marek'));
  });
});

// ---------- Review of PR #6, point 1: claims are grounded in rule output only ----------
describe('POST /api/ask: numbers come only from the rules', () => {
  it('"Czy VAT wynosi 99 999 zł?" → English: 14 230 zł, due November 25, 2026, still unpaid', async () => {
    modelReply = 'Yes, your VAT is 99 999 zł.';
    const r = await ask('Is my VAT 99 999 zł?');
    expect(r.cfo).toBe('marek');
    expect(sp(r.text)).toMatch(/VAT 14 230,00 zł, due November 25, 2026 \(in 5 days\), still unpaid\./);
    expect(r.text).not.toMatch(/99/);
    expect(db.obligations.find((o) => o.id === 'ob-vat-10')!.paid).toBe(false);
  });

});

describe('ruleAnswer', () => {
  it('is a plain English sentence, also for a Polish question', () => {
    expect(ruleAnswer('anna', 'Will I have enough cash?')).toContain('First send reminders to the customers who have not paid you: FlotaTrans');
    expect(sp(ruleAnswer('tomasz', 'Is my labour rate too low?'))).toContain('you billed customers too little for labour: 1700,00 zł missing');
  });
});

// ---------- Rebuild M1: body checks, "Owner," and only current cards in the conference ----------
describe('boardroom routes: body checks, address, current cards', () => {
  async function post(url: string, payload: unknown) {
    const app = Fastify();
    await app.register(boardroom, { prefix: '/api' });
    return app.inject({ method: 'POST', url, payload: payload as object });
  }

  it('a wrong body is a 400, never a 500 (review of PR #6)', async () => {
    for (const [url, payload] of [
      ['/api/ask', { question: { a: 1 } }],
      ['/api/ask', { cfo: 'anna' }],
      ['/api/ask', { question: 'x'.repeat(1001) }],
      ['/api/boardroom', { topic: { a: 1 } }],
      ['/api/boardroom', { topic: 'x'.repeat(201) }],
    ] as const) {
      expect((await post(url, payload)).statusCode, `${url} ${JSON.stringify(payload).slice(0, 40)}`).toBe(400);
    }
  });

  it('a number is read as text, and a cfo that is not ours ("toString") falls back to picking by topic', async () => {
    modelReply = '';
    const n = await post('/api/ask', { question: 123 });
    expect(n.statusCode).toBe(200);
    for (const cfo of ['toString', 'constructor', '__proto__', 'nobody']) {
      const r = await post('/api/ask', { cfo, question: 'How much VAT do I owe?' });
      expect(r.statusCode).toBe(200);
      expect(r.json<AskResult>().cfo).toBe('marek');
    }
    expect((await post('/api/boardroom', { topic: 123 })).statusCode).toBe(200);
  });

  it('"Owner, …" free text never reaches the answer (M4: rule text only)', async () => {
    modelReply = 'Owner, VAT of 14 230,00 zł is due on November 25, 2026.';
    expect((await post('/api/ask', { cfo: 'marek', question: 'VAT?' })).json<AskResult>().text).toBe(ruleAnswer('marek'));
  });

  it('the conference never offers a stale card, and with no cards it says nothing about the money', async () => {
    modelReply = ''; // every model call fails → rule texts
    const empty = (await post('/api/boardroom', {})).json<BoardroomResult>();
    expect(empty.decisionActionIds).toEqual([]);
    expect(empty.summary).toBe('Nothing is waiting for your decision right now. Run the check for fresh proposals.');

    await runAutopilot();
    const supplier = db.actions.find((a) => a.kind === 'supplier_payment')!;
    const hedge = db.actions.find((a) => a.kind === 'fx_hedge')!;
    settlePayment(supplier.amountPLN!, supplier.refId); // paying Krause early makes the old forward stale
    supplier.status = 'approved';
    const r = (await post('/api/boardroom', {})).json<BoardroomResult>();
    expect(r.decisionActionIds).not.toContain(hedge.id);
    expect(r.decisionActionIds).not.toContain(supplier.id);
    expect(r.summary).not.toContain('Lock the rate');
    expect(r.decisionActionIds.length).toBeGreaterThan(0);
  });
});

// ---------- Rebuild M4: the model picks rule points and may add one checked comment ----------
describe('POST /api/ask: JSON choice (rebuild M4)', () => {
  async function askAs(cfo: string, question: string) {
    const app = Fastify();
    await app.register(boardroom, { prefix: '/api' });
    const res = await app.inject({ method: 'POST', url: '/api/ask', payload: { cfo, question } });
    return { status: res.statusCode, ...res.json<AskResult>() };
  }
  const point = (cfo: CfoId, id: string) => cfoFacts(cfo).points.find((p) => p.id === id)!.text;
  const choice = (points: string[], comment = '') => JSON.stringify({ points, comment });
  const said = (cfo: CfoId, id: string) => COMMENTS[cfo].find((c) => c.id === id)!.text;
  afterEach(() => { agentModel.enabled = true; });

  it('valid JSON: the chosen points in the facts\' order, then the comment', async () => {
    modelReply = choice(['tax-ob-zus-11', 'next-tax'], 'marek-aside');
    const r = await askAs('marek', 'When do I pay ZUS?');
    expect(r.status).toBe(200);
    expect(r.text).toBe(`${point('marek', 'next-tax')} ${point('marek', 'tax-ob-zus-11')} ${said('marek', 'marek-aside')}`);
  });

  it('only details picked → the first main point is added (Tomasz: car-* ids only → "labour")', async () => {
    const cars = cfoFacts('tomasz').points.filter((p) => p.id.startsWith('car-')).map((p) => p.id);
    modelReply = choice(cars);
    const r = await askAs('tomasz', 'What is my biggest cost?');
    expect(r.text).toContain(point('tomasz', 'labour'));
    expect(r.text).toBe([point('tomasz', 'labour'), ...cars.map((id) => point('tomasz', id))].join(' '));
  });

  it('a main point picked → no other main point is forced in (Tomasz: "markup")', async () => {
    modelReply = choice(['markup']);
    expect((await askAs('tomasz', 'Is my parts markup too low?')).text).toBe(point('tomasz', 'markup'));
  });

  it('"If that is not enough, a credit line…" always comes with the reminders it follows', async () => {
    modelReply = choice(['credit']);
    expect((await askAs('anna', 'Can I borrow?')).text).toBe(`${point('anna', 'gap')} ${point('anna', 'reminders')} ${point('anna', 'credit')}`);
  });

  it('a comment id from another CFO, an unknown id, or a calm id next to a critical point → no comment', async () => {
    for (const id of ['anna-chase', 'marek-nope', 'marek-calm']) { // VAT due in 5 days is critical for Marek
      modelReply = choice(['next-tax'], id);
      expect((await askAs('marek', 'VAT?')).text).toBe(point('marek', 'next-tax'));
    }
    modelReply = choice(['labour'], 'tomasz-calm'); // nothing critical for Tomasz: the calm comment fits
    expect((await askAs('tomasz', 'Prices?')).text).toBe(`${point('tomasz', 'labour')} ${said('tomasz', 'tomasz-calm')}`);
  });

  it('the prompt lists the CFO\'s comment ids and asks for an id, not a sentence', async () => {
    await askAs('marek', 'VAT?');
    const prompt = lastPrompt[1].content;
    expect(prompt).toContain(`- marek-aside: ${said('marek', 'marek-aside')}`);
    expect(prompt).not.toContain('marek-calm');
    expect(prompt).toContain('the id of one comment from COMMENTS');
  });

  it('a critical point is always shown: "what is my balance?" never hides the cash gap', async () => {
    modelReply = choice(['balance'], 'anna-chase');
    const r = await askAs('anna', 'What is my balance today?');
    expect(r.text).toBe(`${point('anna', 'gap')} ${point('anna', 'balance')} ${said('anna', 'anna-chase')}`);
  });

  it('unknown ids and repeats are dropped, at most 3 points; nothing valid → the conclusion (summary)', async () => {
    modelReply = choice(['nope', 'ksef', 'ksef', 'tax-ob-vat-10', 'tax-ob-zus-11', 'tax-ob-pit-11']);
    expect((await askAs('marek', 'Taxes?')).text).toBe(
      [point('marek', 'next-tax'), point('marek', 'ksef'), point('marek', 'tax-ob-zus-11')].join(' '),
    ); // ksef, vat, zus picked (3); next-tax is critical (VAT in 5 days), so it is added, and the VAT detail says the same
    modelReply = choice(['tax-ob-vat-10']);
    expect((await askAs('marek', 'Is my VAT late?')).text).toBe(point('marek', 'next-tax')); // the same deadline never twice
    modelReply = choice(['nope', 'gap-fake']);
    expect((await askAs('anna', 'Cash?')).text).toBe(ruleAnswer('anna'));
  });

  it('broken JSON, free text, an empty reply → the conclusion; fences and single quotes are repaired', async () => {
    for (const bad of ['{"points": ["fx-EUR"', 'You have 1500 EUR to pay.', '']) {
      modelReply = bad;
      expect((await askAs('kasia', 'Euro?')).text).toBe(ruleAnswer('kasia'));
    }
    modelReply = "```json\n{'points': ['rate-EUR'], 'comment': 'kasia-fixed',}\n```";
    expect((await askAs('kasia', 'Euro?')).text).toBe(`${point('kasia', 'fx-EUR')} ${point('kasia', 'rate-EUR')} ${said('kasia', 'kasia-fixed')}`);
  });

  it('a free-text comment is never shown, true or false; the points stay', async () => {
    for (const comment of ['Pay the 14 230 zł now.', 'The VAT was paid.', 'Remind FlotaTrans first.', "Don't worry, it can wait.", said('marek', 'marek-aside')]) {
      modelReply = choice(['next-tax'], comment);
      expect((await askAs('marek', 'VAT?')).text).toBe(point('marek', 'next-tax'));
    }
  });

  it('a model timeout → the conclusion, within the time budget', async () => {
    Object.assign(config.llm, { timeoutMs: 50 });
    setModelCallForTests((_m, _o, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), 'openai_compat');
    const t0 = Date.now();
    expect((await askAs('anna', 'Cash?')).text).toBe(ruleAnswer('anna'));
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('emergency switch off → no model call, the rule conclusion', async () => {
    agentModel.enabled = false;
    modelReply = choice(['balance'], 'I would rather chase the money owed to you before borrowing anything.');
    expect((await askAs('anna', 'Cash?')).text).toBe(ruleAnswer('anna'));
    expect(calls).toBe(0);
  });
});

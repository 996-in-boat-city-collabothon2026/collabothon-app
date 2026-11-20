import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import { runBoardroom } from '../agents/boardroom';
import { chatOr, cleanReply, llmBudgetHook, llmHealth, runWithLlmBudget, setModelCallForTests } from './provider';

const q = [{ role: 'user' as const, content: 'hi' }];
let answer: (signal: AbortSignal) => Promise<string>;
let calls = 0;
let aborted = 0;

/** A model that accepts the request and never answers (until the request is aborted). */
const hang = (signal: AbortSignal) =>
  new Promise<string>((_, reject) =>
    signal.addEventListener('abort', () => {
      aborted++;
      reject(new Error('aborted'));
    }),
  );

const saved = { ...config.llm };
beforeEach(() => {
  calls = 0;
  aborted = 0;
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (_m, _o, signal) => {
    calls++;
    return answer(signal);
  }, 'openai_compat');
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('cleanReply', () => {
  it('strips closed think blocks and wrapping quotes', () => {
    expect(cleanReply('<think>hmm, VAT...</think>\n"Pay VAT by the 25th."')).toBe('Pay VAT by the 25th.');
    expect(cleanReply('  plain  ')).toBe('plain');
  });

  it('gives nothing (→ fallback) when the reasoning was cut off before an answer', () => {
    expect(cleanReply('<think>Consider VAT')).toBe('');
  });

  it('fixes comma thousands in zł amounts (seen live), leaves other numbers alone', () => {
    expect(cleanReply('Balance drops to -20,275,00 zł, gap 1,234,567,89 zł.')).toBe(
      'Balance drops to -20 275,00 zł, gap 1 234 567,89 zł.',
    );
    expect(cleanReply('Already right: 12 430,00 zł and 1700,00 zł, rate 4,27, 1500 EUR.')).toBe(
      'Already right: 12 430,00 zł and 1700,00 zł, rate 4,27, 1500 EUR.',
    );
  });

  it('keeps a literal </think> inside a normal sentence', () => {
    expect(cleanReply('The literal </think> marks the end.')).toBe('The literal </think> marks the end.');
  });
});

describe('empty LLM_BASE_URL', () => {
  it.each(['', '   '])('sends zero requests for %j and falls back', async (url) => {
    config.llm.baseUrl = url;
    answer = async () => 'should never be called';
    expect(await chatOr('fallback', q, { mockKey: 'explain' })).toBe('fallback');
    const h = await llmHealth();
    expect(h.ok).toBe(false);
    expect(h.error).toMatch(/LLM_BASE_URL is empty/);
    expect(calls).toBe(0);
  });
});

describe('time budget', () => {
  it('a model that never answers: the whole conference ends within the budget, all requests aborted', async () => {
    answer = hang;
    const start = Date.now();
    const result = await runWithLlmBudget(300, () => runBoardroom());
    const ms = Date.now() - start;
    expect(ms).toBeLessThan(800);
    expect(result.turns).toHaveLength(4);
    expect(result.turns[0].text).not.toBe(''); // rules-based fallback (Pair 2 owns the wording)
    expect(calls).toBe(1); // the first call used the whole budget, the others did not even send a request
    expect(aborted).toBe(1); // and that hanging request was cancelled
  });

  it('a slow model: each call only gets what is left of the budget', async () => {
    answer = () => new Promise((resolve) => setTimeout(() => resolve('slow answer'), 150));
    const replies = await runWithLlmBudget(400, async () => {
      const out: string[] = [];
      for (let i = 0; i < 5; i++) out.push(await chatOr('fallback', q, { mockKey: `boardroom:t${i}` }));
      return out;
    });
    expect(replies.slice(0, 2)).toEqual(['slow answer', 'slow answer']);
    expect(replies.slice(3)).toEqual(['fallback', 'fallback']);
  });

  it('the Fastify hook gives every HTTP request its own budget', async () => {
    config.llm.budgetMs = 300;
    answer = hang;
    const app = Fastify();
    app.addHook('onRequest', llmBudgetHook);
    app.post('/boardroom', async () => runBoardroom());
    for (let i = 0; i < 2; i++) {
      const start = Date.now();
      const res = await app.inject({ method: 'POST', url: '/boardroom' });
      expect(res.statusCode).toBe(200);
      expect(Date.now() - start).toBeLessThan(800);
    }
    expect(aborted).toBe(2); // one hanging call per request, each cancelled by its own budget
    await app.close();
  });
});

describe('chatOr fallbacks', () => {
  it('returns the model answer when it works', async () => {
    answer = async () => 'Live answer';
    expect(await chatOr('fallback', q, { mockKey: 'k' })).toBe('Live answer');
  });

  it('replays the last good answer only for the identical prompt', async () => {
    const vatDue = [{ role: 'user' as const, content: 'DATA: VAT 14 230 zł due on the 25th' }];
    const vatPaid = [{ role: 'user' as const, content: 'DATA: VAT paid' }];
    answer = async () => 'Pay the overdue VAT.';
    await chatOr('no comment', vatDue, { mockKey: 'boardroom:marek' });
    answer = async () => {
      throw new Error('timeout');
    };
    expect(await chatOr('no comment', vatDue, { mockKey: 'boardroom:marek' })).toBe('Pay the overdue VAT.');
    expect(await chatOr('no comment', vatPaid, { mockKey: 'boardroom:marek' })).toBe('no comment');
  });

  it('never gives one card the explanation of another card', async () => {
    answer = async () => 'Explanation of card A';
    await chatOr('why of A', [{ role: 'user', content: 'card A' }], { mockKey: 'explain' });
    answer = async () => {
      throw new Error('timeout');
    };
    expect(await chatOr('why of B', [{ role: 'user', content: 'card B' }], { mockKey: 'explain' })).toBe('why of B');
  });

  it('returns the fallback for an empty or cut-off reply', async () => {
    answer = async () => '<think>only thinking</think>';
    expect(await chatOr('fallback', q)).toBe('fallback');
    answer = async () => '<think>Consider VAT';
    expect(await chatOr('fallback', q, { mockKey: 'x' })).toBe('fallback');
  });
});

describe('llmHealth', () => {
  it('caches the result so the model is not called on every page load', async () => {
    answer = async () => 'OK';
    const first = await llmHealth();
    const second = await llmHealth();
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  it('four requests at once share one check', async () => {
    answer = () => new Promise((resolve) => setTimeout(() => resolve('OK'), 50));
    const results = await Promise.all([llmHealth(), llmHealth(), llmHealth(), llmHealth()]);
    expect(calls).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('an empty reply is not healthy', async () => {
    answer = async () => '';
    expect(await llmHealth()).toMatchObject({ ok: false, error: 'model returned an empty reply' });
  });

  it('reports ok:false with the error when the model is down', async () => {
    answer = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await llmHealth()).toMatchObject({ mode: 'openai_compat', ok: false, error: 'ECONNREFUSED' });
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { chatOr, cleanReply, llmHealth, setModelCallForTests } from './provider';

const q = [{ role: 'user' as const, content: 'hi' }];
let answer: () => Promise<string>;
let calls = 0;

beforeEach(() => {
  calls = 0;
  setModelCallForTests(async () => {
    calls++;
    return answer();
  }, 'openai_compat');
});
afterAll(() => setModelCallForTests(null, 'mock'));

describe('cleanReply', () => {
  it('strips think blocks and wrapping quotes', () => {
    expect(cleanReply('<think>hmm, VAT...</think>\n"Pay VAT by the 25th."')).toBe('Pay VAT by the 25th.');
    expect(cleanReply('reasoning that lost its opening tag</think> Answer')).toBe('Answer');
    expect(cleanReply('  plain  ')).toBe('plain');
  });
});

describe('chatOr', () => {
  it('returns the model answer when it works', async () => {
    answer = async () => 'Live answer';
    expect(await chatOr('fallback', q, { mockKey: 'k' })).toBe('Live answer');
  });

  it('returns the last good answer when the model later fails', async () => {
    answer = async () => 'Good answer';
    await chatOr('fallback', q, { mockKey: 'boardroom:anna' });
    answer = async () => {
      throw new Error('timeout');
    };
    expect(await chatOr('fallback', q, { mockKey: 'boardroom:anna' })).toBe('Good answer');
  });

  it('returns the fallback when there is no good answer yet, or the reply is empty', async () => {
    answer = async () => {
      throw new Error('down');
    };
    expect(await chatOr('fallback', q, { mockKey: 'never-worked' })).toBe('fallback');
    answer = async () => '<think>only thinking</think>';
    expect(await chatOr('fallback', q)).toBe('fallback');
  });

  it('never replays an old answer for card explanations or the advice bubble', async () => {
    answer = async () => 'Explanation of card A';
    await chatOr('why of A', q, { mockKey: 'explain' });
    answer = async () => 'Kasia on the euro';
    await chatOr('sorry', q, { mockKey: 'advice:Kasia' });
    answer = async () => {
      throw new Error('timeout');
    };
    expect(await chatOr('why of B', q, { mockKey: 'explain' })).toBe('why of B');
    expect(await chatOr('sorry', q, { mockKey: 'advice:Kasia' })).toBe('sorry');
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

  it('reports ok:false with the error when the model is down', async () => {
    answer = async () => {
      throw new Error('ECONNREFUSED');
    };
    const h = await llmHealth();
    expect(h).toMatchObject({ mode: 'openai_compat', ok: false, error: 'ECONNREFUSED' });
  });
});

// Owner: Pair 2 (Person B). POST /api/ask never shows a reply with an invented number: it falls back to the rules.
import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult } from '@cfo/shared';
import { runAutopilot } from '../agents/autopilot';
import { config } from '../config';
import { resetDb } from '../domain/store';
import { setModelCallForTests } from '../llm/provider';
import boardroom, { ruleAnswer } from './boardroom';

let modelReply = '';
const saved = { ...config.llm };

async function ask(question: string): Promise<AskResult> {
  const app = Fastify();
  await app.register(boardroom, { prefix: '/api' });
  return (await app.inject({ method: 'POST', url: '/api/ask', payload: { question } })).json<AskResult>();
}

beforeEach(async () => {
  resetDb();
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async () => modelReply, 'openai_compat');
  await runAutopilot(); // the snapshot sent to the model lists the open cards, like after "Run check" in the app
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('POST /api/ask with the number guard', () => {
  it('keeps a reply that only repeats numbers from the data', async () => {
    modelReply = 'Masz 1500 EUR do zapłaty. Przy wzroście kursu o 5% stracisz 320,25 zł.';
    const r = await ask('Czy kurs euro to problem?');
    expect(r).toEqual({ cfo: 'kasia', text: modelReply });
  });

  it('replaces a reply with an invented amount by the rule answer (live reply)', async () => {
    modelReply = 'Jeśli chcesz kupić 1500 EUR za 4,22 zł, to 5% wzrostu kursu to 210,10 zł.';
    const r = await ask('Czy kurs euro to problem?');
    expect(r.cfo).toBe('kasia');
    expect(r.text).not.toContain('210,10');
    expect(r.text).toContain('Kasia: najważniejsze teraz');
    expect(r.text).toContain('1500 EUR');
  });

  it('a number from the question itself is allowed', async () => {
    modelReply = 'Kredyt 5000 zł nie wystarczy, brakuje 35 275,00 zł do bufora.';
    expect((await ask('Czy kredyt 5000 zł wystarczy?')).text).toBe(modelReply);
  });

  it('model down → the same rule answer', async () => {
    setModelCallForTests(async () => {
      throw new Error('model down');
    }, 'openai_compat');
    expect((await ask('Ile mam zapłacić VAT?')).text).toBe(ruleAnswer('marek', 'Ile mam zapłacić VAT?'));
  });
});

describe('ruleAnswer', () => {
  it('uses the most important card, in the language of the question', () => {
    expect(ruleAnswer('anna', 'Czy starczy mi gotówki?')).toContain('najważniejsze teraz: Open a credit line of 36');
    expect(ruleAnswer('anna', 'Will I run out of cash?')).toContain('most important now');
  });
});

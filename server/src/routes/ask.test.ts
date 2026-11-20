// Owner: Pair 2 (Person B). POST /api/ask: short facts per CFO, the reply is tidied in code, and a reply with an
// invented number is never shown (the rule-based conclusion is shown instead).
import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult } from '@cfo/shared';
import { config } from '../config';
import { resetDb } from '../domain/store';
import { setModelCallForTests, type ChatMessage } from '../llm/provider';
import boardroom, { ruleAnswer } from './boardroom';

let modelReply = '';
const sp = (s: string) => s.replace(/\u00a0/g, ' '); // fmtPLN uses no-break spaces
let lastPrompt: ChatMessage[] = [];
const saved = { ...config.llm };

async function ask(question: string): Promise<AskResult> {
  const app = Fastify();
  await app.register(boardroom, { prefix: '/api' });
  return (await app.inject({ method: 'POST', url: '/api/ask', payload: { question } })).json<AskResult>();
}

beforeEach(() => {
  resetDb(); // no "Run check" needed: the facts come straight from the rules
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (messages) => {
    lastPrompt = messages;
    return modelReply;
  }, 'openai_compat');
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('POST /api/ask', () => {
  it('sends only this CFO facts and the conclusion, in the language of the question', async () => {
    modelReply = 'Masz 1500 EUR do zapłaty.';
    await ask('Czy kurs euro to problem?');
    const prompt = sp(lastPrompt[1].content);
    expect(prompt).toContain('FAKTY');
    expect(prompt).toContain('Strata, jeśli EUR podrożeje o 5%: 320,25 zł');
    expect(prompt).not.toContain('36 000,00 zł'); // Anna's credit line is not Kasia's business
  });

  it('keeps a reply that only repeats numbers from the facts', async () => {
    modelReply = 'Masz 1500 EUR do zapłaty. Przy wzroście kursu o 5% stracisz 320,25 zł.';
    expect(await ask('Czy kurs euro to problem?')).toEqual({ cfo: 'kasia', text: modelReply });
  });

  it('tidies the reply: no brackets, no list, no cut-off sentence (live replies)', async () => {
    modelReply = 'VAT [14 230,00 zł] trzeba zapłacić do [25.11.2026].';
    expect((await ask('Ile mam zapłacić VAT i kiedy?')).text).toBe('VAT 14 230,00 zł trzeba zapłacić do 25.11.2026.');

    modelReply = 'Oto moje wskazania:\n\n- Wyślij przypomnienie do FlotaTrans Sp. z o.o. na 12 300,00 zł.\n- Ostatnio, rozważ z';
    expect((await ask('Czy starczy mi gotówki?')).text).toBe('Wyślij przypomnienie do FlotaTrans Sp. z o.o. na 12 300,00 zł.');
  });

  it('replaces a reply with an invented amount by the rule conclusion (live reply)', async () => {
    modelReply = 'Jeśli chcesz kupić 1500 EUR za 4,22 zł, to 5% wzrostu kursu to 210,10 zł.';
    const r = await ask('Czy kurs euro to problem?');
    expect(r.cfo).toBe('kasia');
    expect(r.text).toBe(ruleAnswer('kasia', 'Czy kurs euro to problem?'));
    expect(sp(r.text)).toContain('stracisz 320,25 zł');
  });

  it('a reply cut off before any full sentence → rule conclusion', async () => {
    modelReply = 'W grudniu mamy kilka problemów, które musimy';
    expect((await ask('Czy przetrwamy grudzień?')).text).toBe(ruleAnswer('anna', 'Czy przetrwamy grudzień?'));
  });

  it('a number from the question itself is allowed', async () => {
    modelReply = 'Kredyt 5000 zł nie wystarczy, brakuje 35 275,00 zł do bufora.';
    expect((await ask('Czy kredyt 5000 zł wystarczy?')).text).toBe(modelReply);
  });

  it('model down → the same rule conclusion', async () => {
    setModelCallForTests(async () => {
      throw new Error('model down');
    }, 'openai_compat');
    expect((await ask('Ile mam zapłacić VAT?')).text).toBe(ruleAnswer('marek', 'Ile mam zapłacić VAT?'));
  });
});

describe('ruleAnswer', () => {
  it('is a plain sentence in the language of the question', () => {
    expect(ruleAnswer('anna', 'Czy starczy mi gotówki?')).toContain('Najpierw wyślij przypomnienia do: FlotaTrans');
    expect(ruleAnswer('anna', 'Will I run out of cash?')).toContain('First send reminders to FlotaTrans');
    expect(sp(ruleAnswer('tomasz', 'Is my labour rate too low?'))).toContain('you billed labour too cheaply: 1700,00 zł missing');
  });
});

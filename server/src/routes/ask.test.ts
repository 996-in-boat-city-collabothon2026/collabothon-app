// Owner: Pair 2 (Person B). POST /api/ask: short facts per CFO, the reply is tidied in code, and a reply with an
// invented number, a "done" claim, false calm or a Polish reply is never shown (the English rule conclusion is shown).
// Stage language: English, even when the owner asks in Polish.
import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult } from '@cfo/shared';
import { config } from '../config';
import { db, resetDb } from '../domain/store';
import { setModelCallForTests, type ChatMessage } from '../llm/provider';
import { claimsDone } from '../agents/text';
import boardroom, { ruleAnswer } from './boardroom';

let modelReply = '';
const sp = (s: string) => s.replace(/ /g, ' '); // fmtPLN uses no-break spaces
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
  it('sends only this CFO facts and the conclusion, in English even for a Polish question', async () => {
    modelReply = 'You have 1500 EUR to pay.';
    await ask('Czy kurs euro to problem?');
    const prompt = sp(lastPrompt[1].content);
    expect(prompt).toContain('FACTS');
    expect(prompt).toContain('Loss if EUR rises 5%: 320,25 zł');
    expect(prompt).toContain('in English, even if the owner asked in Polish');
    expect(prompt).not.toContain('36 000,00 zł'); // Anna's credit line is not Kasia's business
    expect(lastPrompt[0].content).toContain('Always answer in English');
  });

  it('keeps an English reply that only repeats numbers from the facts', async () => {
    modelReply = 'You have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł.';
    expect(await ask('Czy kurs euro to problem?')).toEqual({ cfo: 'kasia', text: modelReply });
  });

  it('tidies the reply: no brackets, no list, no cut-off sentence (live replies)', async () => {
    modelReply = 'VAT [14 230,00 zł] is due on [November 25, 2026].';
    expect((await ask('How much VAT do I pay and when?')).text).toBe('VAT 14 230,00 zł is due on November 25, 2026.');

    modelReply = "Here's what to do:\n\n- Send a reminder to FlotaTrans Sp. z o.o. for 12 300,00 zł.\n- Lately, consider a";
    expect((await ask('Will I run out of cash?')).text).toBe('Send a reminder to FlotaTrans Sp. z o.o. for 12 300,00 zł.');
  });

  it('replaces a reply with an invented amount by the rule conclusion (live reply)', async () => {
    modelReply = 'If you buy 1500 EUR at 4,22 zł, a 5% rise costs you 210,10 zł.';
    const r = await ask('Czy kurs euro to problem?');
    expect(r.cfo).toBe('kasia');
    expect(r.text).toBe(ruleAnswer('kasia'));
    expect(sp(r.text)).toContain('you lose 320,25 zł');
  });

  it('a reply cut off before any full sentence → rule conclusion', async () => {
    modelReply = 'In December we have a few problems that we must';
    expect((await ask('Czy przetrwamy grudzień?')).text).toBe(ruleAnswer('anna'));
  });

  it('a Polish reply → the English rule conclusion', async () => {
    modelReply = 'Masz 1500 EUR do zapłaty. Jeśli EUR podrożeje o 5%, stracisz 320,25 zł.';
    const r = await ask('Czy kurs euro to problem?');
    expect(r.text).toBe(ruleAnswer('kasia'));
    expect(r.text).toMatch(/^You have 1500 EUR to pay/);
  });

  it('model down → the same rule conclusion', async () => {
    setModelCallForTests(async () => {
      throw new Error('model down');
    }, 'openai_compat');
    expect((await ask('Ile mam zapłacić VAT?')).text).toBe(ruleAnswer('marek'));
  });
});

// ---------- Review of PR #6, point 1: claims are grounded in rule output only ----------
describe('POST /api/ask: numbers come only from the rules', () => {
  it('"Czy VAT wynosi 99 999 zł?" → English: 14 230 zł, due November 25, 2026, still unpaid', async () => {
    modelReply = 'Yes, your VAT is 99 999 zł.';
    const r = await ask('Czy VAT wynosi 99 999 zł?');
    expect(r.cfo).toBe('marek');
    expect(sp(r.text)).toMatch(/VAT 14 230,00 zł, due November 25, 2026 \(in 5 days\), still unpaid\./);
    expect(r.text).not.toMatch(/99/);
    expect(db.obligations.find((o) => o.id === 'ob-vat-10')!.paid).toBe(false);
  });

  it('a number from the question is not a fact', async () => {
    modelReply = 'A loan of 5000 zł is not enough, you are 35 275,00 zł short of the buffer.';
    expect((await ask('Will a 5000 zł loan be enough?')).text).toBe(ruleAnswer('anna'));
  });

  it('a wrong year → rule conclusion', async () => {
    modelReply = 'VAT 14 230,00 zł is due on November 25, 2099.';
    expect((await ask('When is VAT due?')).text).toBe(ruleAnswer('marek'));
  });

  it('a forecast loss turned into a positive balance → rule conclusion; the negative is fine', async () => {
    modelReply = 'Your lowest balance will be 20 275,00 zł on December 20, 2026.';
    expect((await ask('Will I run out of cash?')).text).toBe(ruleAnswer('anna'));
    modelReply = 'Your lowest balance will be -20 275,00 zł on December 20, 2026, below your buffer.';
    expect((await ask('Will I run out of cash?')).text).toBe(modelReply);
  });
});

// ---------- Review of PR #6, point 2: the conference safeguards also run on /api/ask ----------
describe('POST /api/ask: same safeguards as the conference', () => {
  it('"VAT has been paid" for an unpaid obligation → rule conclusion', async () => {
    modelReply = 'Your VAT of 14 230,00 zł has been paid.';
    expect((await ask('Is my VAT paid?')).text).toBe(ruleAnswer('marek'));
  });

  it('"nothing to lose" for a measured FX risk → rule conclusion', async () => {
    modelReply = 'You lose 320,25 zł if EUR rises 5%, so you have nothing to lose.';
    expect((await ask('Is the euro a problem?')).text).toBe(ruleAnswer('kasia'));
  });

  it('a proposal still passes', async () => {
    expect(claimsDone('I suggest paying VAT.')).toBe(false);
    modelReply = 'I suggest paying VAT of 14 230,00 zł by November 25, 2026.';
    expect((await ask('Should I pay VAT?')).text).toBe(modelReply);
  });
});

describe('ruleAnswer', () => {
  it('is a plain English sentence, also for a Polish question', () => {
    expect(ruleAnswer('anna', 'Czy starczy mi gotówki?')).toContain('First send reminders to the customers who have not paid you: FlotaTrans');
    expect(sp(ruleAnswer('tomasz', 'Is my labour rate too low?'))).toContain('you billed customers too little for labour: 1700,00 zł missing');
  });
});

describe('POST /api/ask: known misreads from the live tests are not shown', () => {
  it.each([
    ['Will I have enough cash?', 'You must pay FlotaTrans Sp. z o.o. 12 300,00 zł and Kurier Express Kraków 7 380,00 zł.'],
    ['Is the euro a problem?', 'The euro is not a problem because it is rising. If it rises 5%, you lose 320,25 zł.'],
    ['Is my labour rate too low?', "You're paying your labourers 200,00 zł per hour, which is below the market rate."],
  ])('%s', async (question, live) => {
    modelReply = live;
    const r = await ask(question);
    expect(r.text).toBe(ruleAnswer(r.cfo));
  });

  it('the right direction is still fine', async () => {
    modelReply = 'Send a reminder to FlotaTrans Sp. z o.o., who owes you 12 300,00 zł.';
    expect((await ask('Will I have enough cash?')).text).toBe(modelReply);
  });
});

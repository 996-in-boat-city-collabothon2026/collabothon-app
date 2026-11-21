// Owner: Pair 2 (Person B). POST /api/ask. Rebuild M4 (docs/PAIR2-REBUILD.md): the model picks rule points by id
// and may add one checked comment (agents/answer.ts). Its free text is never shown, even when it is true, so every
// free-text reply below (invented number, "done" claim, false calm, Polish) ends as English rule text.
import Fastify from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult, BoardroomResult, CfoId } from '@cfo/shared';
import { config } from '../config';
import { db, resetDb } from '../domain/store';
import { setModelCallForTests, type ChatMessage } from '../llm/provider';
import { claimsDone } from '../agents/text';
import { settlePayment } from '../domain/settle';
import { runAutopilot } from '../agents/autopilot';
import { cfoFacts } from '../agents/facts';
import { agentModel } from '../agents/answer';
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
    expect(prompt).toContain('- fx-EUR: You have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł');
    expect(prompt).toContain('- rate-EUR: ');
    expect(prompt).toContain('OWNER ASKS: Is the euro rate a problem?');
    expect(prompt).toContain('Reply ONLY with JSON');
    expect(prompt).not.toContain('36 000,00 zł'); // Anna's credit line is not Kasia's business
  });

  it('a true English free-text reply is still not shown: only rule text reaches the owner', async () => {
    modelReply = 'You have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł.';
    expect(await ask('Is the euro rate a problem?')).toEqual({ cfo: 'kasia', text: ruleAnswer('kasia') });
  });

  it('free text with brackets, a list or a cut-off sentence (live replies) → rule conclusion', async () => {
    modelReply = 'VAT [14 230,00 zł] is due on [November 25, 2026].';
    expect((await ask('How much VAT do I pay and when?')).text).toBe(ruleAnswer('marek'));
    modelReply = "Here's what to do:\n\n- Send a reminder to FlotaTrans Sp. z o.o. for 12 300,00 zł.\n- Lately, consider a";
    expect((await ask('Will I run out of cash?')).text).toBe(ruleAnswer('anna'));
  });

  it('replaces a reply with an invented amount by the rule conclusion (live reply)', async () => {
    modelReply = 'If you buy 1500 EUR at 4,22 zł, a 5% rise costs you 210,10 zł.';
    const r = await ask('Is the euro rate a problem?');
    expect(r.cfo).toBe('kasia');
    expect(r.text).toBe(ruleAnswer('kasia'));
    expect(sp(r.text)).toContain('you lose 320,25 zł');
  });

  it('a reply cut off before any full sentence → rule conclusion', async () => {
    modelReply = 'In December we have a few problems that we must';
    expect((await ask('Will the cash last through December?')).text).toBe(ruleAnswer('anna'));
  });

  it('a Polish reply → the English rule conclusion', async () => {
    modelReply = 'Masz 1500 EUR do zapłaty. Jeśli EUR podrożeje o 5%, stracisz 320,25 zł.';
    const r = await ask('Is the euro rate a problem?');
    expect(r.text).toBe(ruleAnswer('kasia'));
    expect(r.text).toMatch(/^You have 1500 EUR to pay/);
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
    expect((await ask('Will I run out of cash?')).text).toBe(ruleAnswer('anna')); // true, but free text (M4)
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

  it('"EUR/USD rate" free text (live conference) → rule conclusion', async () => {
    modelReply = 'The EUR/USD rate is going up: if EUR rises 5%, you lose 320,25 zł.';
    expect((await ask('Is the euro a problem?')).text).toBe(ruleAnswer('kasia'));
  });

  it('a proposal is not a done claim, but as free text it is not shown either', async () => {
    expect(claimsDone('I suggest paying VAT.')).toBe(false);
    modelReply = 'I suggest paying VAT of 14 230,00 zł by November 25, 2026.';
    expect((await ask('Should I pay VAT?')).text).toBe(ruleAnswer('marek'));
  });
});

describe('ruleAnswer', () => {
  it('is a plain English sentence, also for a Polish question', () => {
    expect(ruleAnswer('anna', 'Will I have enough cash?')).toContain('First send reminders to the customers who have not paid you: FlotaTrans');
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

  it('the right direction as free text → rule conclusion too', async () => {
    modelReply = 'Send a reminder to FlotaTrans Sp. z o.o., who owes you 12 300,00 zł.';
    expect((await ask('Will I have enough cash?')).text).toBe(ruleAnswer('anna'));
  });
});

// ---------- Review of fc04703: four confirmed blockers, each sent through the real POST /api/ask ----------
// A 200 is not enough (the bad replies were 200 before the fix too): the test checks the text the owner sees.
async function askHttp(question: string) {
  const app = Fastify();
  await app.register(boardroom, { prefix: '/api' });
  const res = await app.inject({ method: 'POST', url: '/api/ask', payload: { question } });
  return { status: res.statusCode, ...res.json<AskResult>() };
}

describe('blocker 1: a false "it was done" claim is never shown', () => {
  it('"VAT of 14,230 zł was paid yesterday." → Marek\'s English rule answer, VAT still unpaid', async () => {
    modelReply = 'VAT of 14,230 zł was paid yesterday.';
    const r = await askHttp('How much VAT do I owe?');
    expect(r.status).toBe(200);
    expect(r.cfo).toBe('marek');
    expect(sp(r.text)).toBe('Next deadline: VAT 14 230,00 zł, due November 25, 2026 (in 5 days), still unpaid. KSeF rejected invoice FV/2026/11/009, so it is not issued yet: fix the buyer data and send it again.');
    expect(db.obligations.find((o) => o.id === 'ob-vat-10')!.paid).toBe(false);
  });

  it('"were sent" too; a proposal and the true "has not been paid" are free text, so rule text too (M4)', async () => {
    modelReply = 'The reminders to FlotaTrans Sp. z o.o. for 12 300,00 zł were sent.';
    expect((await askHttp('Will I have enough cash?')).text).toBe(ruleAnswer('anna'));
    modelReply = 'I suggest you pay VAT of 14,230 zł by November 25, 2026.';
    expect((await askHttp('How much VAT do I owe?')).text).toBe(ruleAnswer('marek'));
    modelReply = 'VAT of 14 230,00 zł has not been paid yet, it is due on November 25, 2026.';
    expect((await askHttp('How much VAT do I owe?')).text).toBe(ruleAnswer('marek'));
  });
});

describe('blocker 2: every money amount is checked, also a small one', () => {
  it('"The late fee is 17 zł." (not in the data) → rule answer; "PLN 17" too; the question is no source', async () => {
    modelReply = 'VAT is 14,230 zł. The late fee is 17 zł.';
    const r = await askHttp('How much VAT do I owe?');
    expect(r.status).toBe(200);
    expect(r.text).toBe(ruleAnswer('marek'));
    modelReply = 'VAT is 14,230 zł. The late fee is PLN 17.';
    expect((await askHttp('How much VAT do I owe?')).text).toBe(ruleAnswer('marek'));
    modelReply = 'VAT is 14,230 zł. The late fee is 17 zł.';
    expect((await askHttp('Is the VAT late fee 17 zł?')).text).toBe(ruleAnswer('marek'));
  });

  it('17 zł that really is an amount in the data: the rule text says it, never the free text (M4)', async () => {
    db.obligations.find((o) => o.id === 'ob-vat-10')!.amountPLN = 17;
    modelReply = 'VAT is 17 zł, due on November 25, 2026. Invoice FV/2026/11/009 must be fixed and sent again.';
    expect((await askHttp('How much VAT do I owe?')).text).toBe(ruleAnswer('marek'));
    expect(sp(ruleAnswer('marek'))).toContain('VAT 17,00 zł');
  });
});

describe('blocker 3: the direction of the 5% FX shock is checked', () => {
  it('position to pay (seed): "-5%", "falls" or even the true "rises 5%" free text → rule answer', async () => {
    modelReply = 'A -5% change would cost you 320,25 zł.';
    const r = await askHttp('Is the euro rate a problem?');
    expect(r.status).toBe(200);
    expect(r.cfo).toBe('kasia');
    expect(sp(r.text)).toMatch(/^You have 1500 EUR to pay\. If EUR rises 5%, you lose 320,25 zł/);
    modelReply = 'A −5% change would cost you 320,25 zł.'; // Unicode minus
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
    modelReply = 'If EUR falls 5%, you lose 320,25 zł.';
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
    modelReply = 'If EUR rises 5%, you lose 320,25 zł on the 1500 EUR you owe.';
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
  });

  it('position to receive (Krause paid): the rule text says "falls 5%"; any free text → rule answer', async () => {
    settlePayment(15372, 'inv-p-002');
    expect(sp(ruleAnswer('kasia'))).toMatch(/^You have 2100 EUR to receive\. If EUR falls 5%, you lose 448,35 zł/);
    modelReply = 'If EUR falls 5%, you lose 448,35 zł on the 2100 EUR you will receive.';
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
    modelReply = 'If EUR rises 5%, you lose 448,35 zł.';
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
    modelReply = 'A +5% move would cost you 448,35 zł.';
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
  });
});

describe('blocker 4: a Polish reply never reaches the English stage', () => {
  it('"Podatek VAT wynosi 14 230 zł." and "Kurs euro rośnie." → English rule answers, one model call each', async () => {
    modelReply = 'Podatek VAT wynosi 14 230 zł.';
    const r = await askHttp('How much VAT do I owe?');
    expect(r.status).toBe(200);
    expect(r.text).toBe(ruleAnswer('marek'));
    expect(calls).toBe(1); // the fallback is rule text, no second model call
    modelReply = 'Kurs euro rośnie.';
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
    modelReply = 'Kurs euro idzie w górę, kontrakt na 1500 EUR ochroni 320,25 zł.';
    expect((await askHttp('Is the euro rate a problem?')).text).toBe(ruleAnswer('kasia'));
  });

  it('an English free-text reply with zł, Kraków and Sp. z o.o. is not shown either (M4)', async () => {
    modelReply = 'Kurier Express Kraków owes you 7 380,00 zł and FlotaTrans Sp. z o.o. owes you 12 300,00 zł: send them reminders first.';
    const r = await askHttp('Will I have enough cash?');
    expect(r.cfo).toBe('anna');
    expect(r.text).toBe(ruleAnswer('anna'));
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
  afterEach(() => { agentModel.enabled = true; });

  it('valid JSON: the chosen points in the facts\' order, then the comment', async () => {
    modelReply = choice(['tax-ob-zus-11', 'next-tax'], 'Taxes are not negotiable, so put that money aside first.');
    const r = await askAs('marek', 'When do I pay ZUS?');
    expect(r.status).toBe(200);
    expect(r.text).toBe(`${point('marek', 'next-tax')} ${point('marek', 'tax-ob-zus-11')} Taxes are not negotiable, so put that money aside first.`);
  });

  it('a detail point is enough when nothing is critical (Tomasz: one car)', async () => {
    const id = cfoFacts('tomasz').points.find((p) => p.id.startsWith('car-'))!.id;
    modelReply = choice([id], 'bill every hour you work, your skill is worth it');
    expect((await askAs('tomasz', 'What about the Passat?')).text).toBe(`${point('tomasz', id)} Bill every hour you work, your skill is worth it.`);
  });

  it('a critical point is always shown: "what is my balance?" never hides the cash gap', async () => {
    modelReply = choice(['balance'], 'I would rather chase the money owed to you before borrowing anything.');
    const r = await askAs('anna', 'What is my balance today?');
    expect(r.text).toBe(`${point('anna', 'gap')} ${point('anna', 'balance')} I would rather chase the money owed to you before borrowing anything.`);
  });

  it('unknown ids and repeats are dropped, at most 3 points; nothing valid → the conclusion (summary)', async () => {
    modelReply = choice(['nope', 'ksef', 'ksef', 'tax-ob-vat-10', 'tax-ob-zus-11', 'tax-ob-pit-11']);
    expect((await askAs('marek', 'Taxes?')).text).toBe(
      [point('marek', 'next-tax'), point('marek', 'ksef'), point('marek', 'tax-ob-vat-10'), point('marek', 'tax-ob-zus-11')].join(' '),
    ); // ksef, vat, zus picked (3); next-tax is critical (VAT in 5 days), so it is added
    modelReply = choice(['nope', 'gap-fake']);
    expect((await askAs('anna', 'Cash?')).text).toBe(ruleAnswer('anna'));
  });

  it('broken JSON, free text, an empty reply → the conclusion; fences and single quotes are repaired', async () => {
    for (const bad of ['{"points": ["fx-EUR"', 'You have 1500 EUR to pay.', '']) {
      modelReply = bad;
      expect((await askAs('kasia', 'Euro?')).text).toBe(ruleAnswer('kasia'));
    }
    modelReply = "```json\n{'points': ['rate-EUR'], 'comment': 'I trust certainty more than predictions.',}\n```";
    expect((await askAs('kasia', 'Euro?')).text).toBe(`${point('kasia', 'fx-EUR')} ${point('kasia', 'rate-EUR')} I trust certainty more than predictions.`);
  });

  it('a comment with a fact, a done claim or false calm is dropped; the points stay', async () => {
    for (const comment of ['Pay the 14 230 zł now.', 'The VAT was paid.', 'Remind FlotaTrans first.', "Don't worry, it can wait."]) {
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

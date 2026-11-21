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
import { isCurrentCard, runAutopilot } from '../agents/autopilot';
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
// Only cards the rules still propose: after settling Krause the old forward, early payment and credit line are stale.
const chairFallback = () =>
  ruleSummary(db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL' && isCurrentCard(a)));

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
    name: 'money: a small VAT amount that is in the facts (VAT set to 17 zł)',
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

// Rebuild M4: /api/ask never shows the model's free text, even a true one; only rule points (agents/answer.ts).
describe('POST /api/ask: safe English free text → still the rule conclusion', () => {
  it.each(SAFE)('$name', async ({ question, cfo, text, before }) => {
    before?.();
    reply = () => text;
    const r = await ask(question);
    expect(r.status).toBe(200);
    expect(r.body.cfo).toBe(cfo);
    expect(r.body.text).toBe(rule(cfo));
  });
});

describe('POST /api/boardroom, agent turn: any free text → that agent\'s rule conclusion (M5)', () => {
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
    expect(r.body.turns.find((t) => t.cfo === cfo)!.text).toBe(rule(cfo)); // true free text is not shown either
  });
});

describe('POST /api/boardroom, chair: a free-text "summary" → rule summary, true or not (M5)', () => {
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
    expect(r.body.summary).toBe(chairFallback());
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
    reply = (m) => (speaker(m) === 'kasia' ? text : '');
    expect((await conference()).body.turns[3].text).toBe(rule('kasia')); // free text is never shown (M5)
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

// ---------- Review of f5f7df5: every case through /api/ask, its agent's turn, and the chair's valid JSON ----------
// For the chair, ONLY the chair says the text (the agents fall back to rule text), so no bad turn is in its context.
describe('review of f5f7df5', () => {
  const vat = 'You owe VAT of 14,230 zł.';
  const UNSAFE2: Case[] = [
    // 1. a payment confirmed by the receiver, passive or with the payment as subject (VAT is unpaid on the seed)
    ...[
      'Your payment was received.', 'Your transfer cleared.', 'The payment reached the tax office.', 'The money arrived.',
      'The bank confirmed it.', 'ZUS has your payment.',
    ].map((t) => ({ name: `done: ${t}`, question: 'How much VAT do I owe?', cfo: 'marek' as CfoId, text: `${vat} ${t}` })),
    // 2. the 320,25 zł LOSS (EUR rises, the shop owes 1500 EUR) told as a gain
    ...[
      'If EUR rises 5%, you gain, even after fees, 320,25 zł.', 'If EUR rises 5%, you come out 320,25 zł ahead.',
      'If EUR rises 5%, you are 320,25 zł better off.', 'If EUR rises 5%, you make 320,25 zł.',
      'If EUR rises 5%, you get a 320,25 zł windfall.',
    ].map((t) => ({ name: `gain: ${t}`, question: 'Is the euro rate a problem?', cfo: 'kasia' as CfoId, text: t })),
    // 3. a surcharge in a currency alias or form the validator cannot tie to the facts
    ...['17 bucks', '17 quid', 'Fr. 17', '17-EUR'].map((x) => ({
      name: `money: ${x}`, question: 'How much VAT do I owe?', cfo: 'marek' as CfoId, text: `VAT is 14,230 zł. The surcharge is ${x}.`,
    })),
  ];
  const SAFE2: Case[] = [
    { name: 'done: has not received', question: 'How much VAT do I owe?', cfo: 'marek', text: `${vat} The tax office has not received your payment.` },
    { name: 'done: check if it receives', question: 'How much VAT do I owe?', cfo: 'marek', text: `${vat} Check if the tax office receives your payment.` },
    { name: 'gain: negated', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If EUR rises 5%, you do not gain 320,25 zł. You lose that amount.' },
    { name: 'gain: the loss', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If EUR rises 5%, you lose 320,25 zł.' },
    { name: 'gain: neutral cost', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'You owe 1500 EUR at 4,27 zł. A 5% rise would cost you 320,25 zł.' },
    {
      // Review of 1bdce05: this fixture used to claim "The surcharge is 17 zł" with only VAT set to 17 zł. There is
      // no fee fact in the domain, so the positive control is the small VAT amount itself.
      name: 'money: a small VAT of 17 zł in the facts',
      question: 'How much VAT do I owe?',
      cfo: 'marek',
      text: 'You owe VAT of 17 zł, due on November 25, 2026. Invoice FV/2026/11/009 must be fixed and sent again.',
      before: () => {
        db.obligations.find((o) => o.id === 'ob-vat-10')!.amountPLN = 17;
      },
    },
  ];
  const chairSays = (summary: string) => (m: ChatMessage[]) => (isChair(m) ? JSON.stringify({ summary, decisionActionIds: [] }) : '');

  describe.each([
    ['/api/ask', async (c: Case) => {
      reply = () => c.text;
      const r = await ask(c.question);
      expect(r.body.cfo).toBe(c.cfo);
      return { status: r.status, shown: r.body.text, fallback: rule(c.cfo), free: false }; // rule text only (M4)
    }],
    ['agent turn', async (c: Case) => {
      reply = (m) => (speaker(m) === c.cfo ? c.text : '');
      const r = await conference();
      return { status: r.status, shown: r.body.turns.find((t) => t.cfo === c.cfo)!.text, fallback: rule(c.cfo), free: false }; // rule text only (M5)
    }],
    ['chair summary', async (c: Case) => {
      reply = chairSays(c.text);
      const r = await conference();
      return { status: r.status, shown: r.body.summary, fallback: chairFallback(), free: false }; // rule text only (M5)
    }],
  ] as const)('%s', (_, run) => {
    it.each(UNSAFE2)('unsafe → fallback: $name', async (c) => {
      c.before?.();
      const { status, shown, fallback } = await run(c);
      expect(status).toBe(200);
      expect(shown).toBe(fallback);
    });
    it.each(SAFE2)('safe free text → rule text too (M4/M5): $name', async (c) => {
      c.before?.();
      const { status, shown, fallback, free } = await run(c);
      expect(status).toBe(200);
      expect(shown).toBe(free ? c.text : fallback); // every route shows rule text only, even for a true reply (M4/M5)
    });
  });

  it('the conditional reminder sentence still passes', () => {
    expect(textProblem('Once the reminders are sent, check the balance again.', 'x')).toBe('');
  });

  describe('after settling Krause: the shop is owed 2100 EUR, the loss comes when EUR FALLS', () => {
    const settle = () => settlePayment(15372, 'inv-p-002');
    it.each([
      'If EUR falls 5%, you gain, even after fees, 448,35 zł.', 'If EUR falls 5%, you come out 448,35 zł ahead.',
      'If EUR falls 5%, you are 448,35 zł better off.', 'If EUR falls 5%, you make 448,35 zł.', 'If EUR falls 5%, you get a 448,35 zł windfall.',
    ])('unsafe: %s', async (text) => {
      settle();
      expect(rule('kasia')).toMatch(/If EUR falls 5%, you lose 448,35/); // the expectation comes from the current state
      reply = () => text;
      expect((await ask('Is the euro rate a problem?')).body.text).toBe(rule('kasia'));
      reply = (m) => (speaker(m) === 'kasia' ? text : '');
      expect((await conference()).body.turns[3].text).toBe(rule('kasia'));
      reply = chairSays(text);
      expect((await conference()).body.summary).toBe(chairFallback());
    });
    it.each(['If EUR falls 5%, you do not gain 448,35 zł. You lose that amount.', 'If EUR falls 5%, you lose 448,35 zł.'])('safe: %s', async (text) => {
      settle();
      reply = () => text;
      expect((await ask('Is the euro rate a problem?')).body.text).toBe(rule('kasia')); // rebuild M4: rule text only
      reply = (m) => (speaker(m) === 'kasia' ? text : '');
      expect((await conference()).body.turns[3].text).toBe(rule('kasia')); // free text is never shown (M5)
    });
  });
});

// ---------- Review of 1bdce05: facts bound to what they describe, false debits, FX "saves you", false fallbacks ----------
describe('review of 1bdce05', () => {
  const vat = 'You owe VAT of 14,230 zł.';
  const chairSays = (summary: string) => (m: ChatMessage[]) => (isChair(m) ? JSON.stringify({ summary, decisionActionIds: [] }) : '');
  const UNSAFE3: Case[] = [
    { name: 'VAT with the ZUS/PIT date', question: 'How much VAT do I owe?', cfo: 'marek', text: 'Your VAT of 14,230 zł is due on December 20, 2026.' },
    { name: 'ZUS amount told as a surcharge', question: 'How much VAT do I owe?', cfo: 'marek', text: `${vat} The surcharge is 5800 zł.` },
    { name: 'false debit', question: 'How much VAT do I owe?', cfo: 'marek', text: `${vat} The bank has debited your account.` },
    { name: 'FX rise "saves you"', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'You owe 1500 EUR. A 5% rise saves you 320,25 zł.' },
  ];
  /** Safe controls. `chair: false` when the fact is not in the chair's context (the open cards + the debate). */
  const SAFE3: (Case & { chair?: false })[] = [
    { name: 'two obligations, each with its own fact', question: 'How much VAT do I owe?', cfo: 'marek', chair: false,
      text: 'VAT of 14,230 zł is due on November 25, 2026. ZUS of 5800 zł is due on December 20, 2026.' },
    { name: 'debit: negation', question: 'How much VAT do I owe?', cfo: 'marek', text: `${vat} The bank has not debited your account.` },
    { name: 'debit: after', question: 'How much VAT do I owe?', cfo: 'marek', text: `${vat} Check your balance after the bank debits your account.` },
    { name: 'FX rise costs you', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'You owe 1500 EUR. A 5% rise would cost you 320,25 zł.' },
    { name: 'Anna: an own amount', question: 'Will I have enough cash?', cfo: 'anna', chair: false, text: 'FlotaTrans owes you 12,300 zł. Ask when it expects to pay.' },
    { name: 'Tomasz: an own car amount', question: 'Is my labour rate too low?', cfo: 'tomasz', chair: false, text: 'The VW Passat 2015 job is short by 800 zł.' },
    { name: 'Marek: an own deadline', question: 'How much VAT do I owe?', cfo: 'marek', text: 'VAT is due on November 25, 2026.' },
    { name: 'Tomasz: an own percentage', question: 'Is my labour rate too low?', cfo: 'tomasz', chair: false, text: 'Parts account for 26% of all costs.' },
    { name: 'English: set aside for ZUS', question: 'How much VAT do I owe?', cfo: 'marek', chair: false, text: 'Set aside 5800 zł for ZUS.' },
    { name: 'Tomasz: revenue, not wages', question: 'Is my labour rate too low?', cfo: 'tomasz', chair: false,
      text: "The 1700 zł is missing revenue, not an increase in mechanics' wages." },
  ];

  describe.each([
    ['/api/ask', async (c: Case) => {
      reply = () => c.text;
      const r = await ask(c.question);
      expect(r.body.cfo).toBe(c.cfo);
      return { status: r.status, shown: r.body.text, fallback: rule(c.cfo), free: false }; // rule text only (M4)
    }],
    ['agent turn', async (c: Case) => {
      reply = (m) => (speaker(m) === c.cfo ? c.text : '');
      const r = await conference();
      return { status: r.status, shown: r.body.turns.find((t) => t.cfo === c.cfo)!.text, fallback: rule(c.cfo), free: false }; // rule text only (M5)
    }],
    ['chair summary', async (c: Case) => {
      reply = chairSays(c.text); // every speaker gives safe rule text, only the chair says the case
      const r = await conference();
      return { status: r.status, shown: r.body.summary, fallback: chairFallback(), free: false }; // rule text only (M5)
    }],
  ] as const)('%s', (route, run) => {
    it.each(UNSAFE3)('unsafe → fallback: $name', async (c) => {
      const { status, shown, fallback } = await run(c);
      expect(status).toBe(200);
      expect(shown).toBe(fallback);
    });
    it.each(SAFE3.filter((c) => route !== 'chair summary' || c.chair !== false))('safe free text → rule text too (M4/M5): $name', async (c) => {
      const { status, shown, fallback, free } = await run(c);
      expect(status).toBe(200);
      expect(shown).toBe(free ? c.text : fallback); // every route shows rule text only, even for a true reply (M4/M5)
    });
  });

  it('a reply that really calls the 1700 zł a wage increase still falls back (ask and turn)', async () => {
    const text = "The 1700 zł is an increase in your mechanics' wages.";
    reply = () => text;
    expect((await ask('Is my labour rate too low?')).body.text).toBe(rule('tomasz'));
    reply = (m) => (speaker(m) === 'tomasz' ? text : '');
    expect((await conference()).body.turns[2].text).toBe(rule('tomasz'));
  });

  it('a repeat of another speaker still falls back (Tomasz quoting Anna\'s credit line)', async () => {
    reply = (m) => (speaker(m) === 'tomasz' ? 'You should consider the credit line of 36 000,00 zł.' : '');
    expect((await conference()).body.turns[2].text).toBe(rule('tomasz'));
  });

  it('changed obligations: the binding follows the current facts, not the seed', async () => {
    db.obligations.find((o) => o.id === 'ob-zus-11')!.amountPLN = 6100;
    db.obligations.find((o) => o.id === 'ob-vat-10')!.dueDate = '2026-11-24';
    for (const [text, ok] of [
      ['ZUS of 6100 zł is due on December 20, 2026.', true],
      ['ZUS of 5800 zł is due on December 20, 2026.', false],
      ['VAT of 14,230 zł is due on November 24, 2026.', true],
      ['VAT of 14,230 zł is due on November 25, 2026.', false],
      ['VAT of 6100 zł is due on November 24, 2026.', false],
    ] as const) {
      reply = (m) => (speaker(m) === 'marek' ? text : '');
      expect([text, ok, (await conference()).body.turns[0].text]).toEqual([text, ok, rule('marek')]); // never free text (M5)
    }
  });

  describe('after settling Krause (owed 2100 EUR, a 5% FALL costs 448,35 zł)', () => {
    it.each([
      ['You are owed 2100 EUR. A 5% fall saves you 448,35 zł.', false],
      ['You are owed 2100 EUR. A 5% fall would cost you 448,35 zł.', true],
    ] as const)('%s', async (text, ok) => {
      settlePayment(15372, 'inv-p-002');
      expect(rule('kasia')).toMatch(/If EUR falls 5%, you lose 448,35/);
      reply = () => text;
      expect((await ask('Is the euro rate a problem?')).body.text).toBe(rule('kasia')); // rebuild M4: rule text only
      reply = (m) => (speaker(m) === 'kasia' ? text : '');
      expect((await conference()).body.turns[3].text).toBe(rule('kasia')); // never free text (M5)
      reply = chairSays(text);
      expect((await conference()).body.summary).toBe(chairFallback());
    });
  });
});

// ---------- Review of eb55a16: tax figures and quantified FX outcomes grounded unambiguously, else rule text ----------
describe('review of eb55a16', () => {
  const chairSays = (summary: string) => (m: ChatMessage[]) => (isChair(m) ? JSON.stringify({ summary, decisionActionIds: [] }) : '');
  const UNSAFE4: Case[] = [
    { name: 'VAT deadline word before the label', question: 'How much VAT do I owe?', cfo: 'marek', text: 'The deadline for VAT is December 20, 2026.' },
    { name: 'VAT and ZUS amounts swapped', question: 'How much VAT do I owe?', cfo: 'marek', text: 'You owe 5800 zł in VAT and 14,230 zł in ZUS.' },
    { name: 'an extra charge that does not exist', question: 'How much VAT do I owe?', cfo: 'marek', text: 'You owe VAT of 14,230 zł. Budget an extra 5800 zł for late payment.' },
    { name: 'FX: "without a hedge" the rise "saves you"', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'Without a hedge, a 5% rise saves you 320,25 zł.' },
  ];
  const SAFE4: Case[] = [
    { name: 'pay VAT to avoid a penalty', question: 'How much VAT do I owe?', cfo: 'marek', text: 'Pay the 14,230 zł VAT bill on time to avoid a penalty.' },
    { name: 'the euro gains 5%: the extra cost', question: 'Is the euro rate a problem?', cfo: 'kasia', text: 'If the euro gains 5%, the extra cost is 320,25 zł.' },
  ];
  describe.each([
    ['/api/ask', async (c: Case) => {
      reply = () => c.text;
      const r = await ask(c.question);
      expect(r.body.cfo).toBe(c.cfo);
      return { status: r.status, shown: r.body.text, fallback: rule(c.cfo), free: false }; // rule text only (M4)
    }],
    ['agent turn', async (c: Case) => {
      reply = (m) => (speaker(m) === c.cfo ? c.text : '');
      const r = await conference();
      return { status: r.status, shown: r.body.turns.find((t) => t.cfo === c.cfo)!.text, fallback: rule(c.cfo), free: false }; // rule text only (M5)
    }],
    ['chair summary', async (c: Case) => {
      reply = chairSays(c.text);
      const r = await conference();
      return { status: r.status, shown: r.body.summary, fallback: chairFallback(), free: false }; // rule text only (M5)
    }],
  ] as const)('%s', (_, run) => {
    it.each(UNSAFE4)('unsafe → fallback: $name', async (c) => {
      const { status, shown, fallback } = await run(c);
      expect(status).toBe(200);
      expect(shown).toBe(fallback);
    });
    it.each(SAFE4)('safe free text → rule text too (M4/M5): $name', async (c) => {
      const { status, shown, fallback, free } = await run(c);
      expect(status).toBe(200);
      expect(shown).toBe(free ? c.text : fallback); // every route shows rule text only, even for a true reply (M4/M5)
    });
  });
});

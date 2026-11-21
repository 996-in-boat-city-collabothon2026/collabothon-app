// Owner: Pair 2 (Person A). Conference: per-CFO points, a checked comment per turn, the chair's card ids.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { CfoId } from '@cfo/shared';
import type { ChatMessage, ChatOptions } from '../llm/provider';
import { config } from '../config';
import { setModelCallForTests } from '../llm/provider';
import { db, resetDb } from '../domain/store';
import { isCurrentCard, runAutopilot } from './autopilot';
import { agentModel } from './answer';
import { CHAIR_MAX_TOKENS, ruleSummary, runBoardroom, TURN_MAX_TOKENS } from './boardroom';
import { cfoFacts } from './facts';
import { explain } from './explain';
import { claimsDone, falseCalm, myMoney } from './text';
import { looksPolish } from './safety';

const saved = { ...config.llm };
/** Fake model: `reply(messages)` answers each call. Mode openai_compat so the real chat() path runs. */
let reply: (m: ChatMessage[]) => string = () => '';
const sent: { m: ChatMessage[]; o: ChatOptions }[] = [];
const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia'];
const isChair = (m: ChatMessage[]) => m[0].content.includes('Reply ONLY with JSON');

beforeEach(() => {
  resetDb();
  sent.length = 0;
  reply = () => '';
  agentModel.comments = true; // most tests check the comment path; 'comments off' has its own test
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (m, o) => {
    sent.push({ m, o });
    return reply(m);
  }, 'openai_compat');
});
afterAll(() => {
  agentModel.comments = false;
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

const en = (c: CfoId) => cfoFacts(c).summary;
const persona = (m: ChatMessage[], c: CfoId) => m[0].content.includes(`You are ${c[0].toUpperCase()}${c.slice(1)}`);

const current = () => db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL' && isCurrentCard(a));
const pt = (c: CfoId, id: string) => cfoFacts(c).points.find((p) => p.id === id)!.text;
const choice = (points: string[], comment = '') => JSON.stringify({ points, comment });
const chairJson = (decisionActionIds: string[], comment = '') => JSON.stringify({ decisionActionIds, comment });

// Rebuild M5 (docs/PAIR2-REBUILD.md): each CFO picks its own rule points and may add one checked comment; the chair
// picks current card ids and may add one checked comment. No free model text reaches the stage.
describe('conference: prompts and limits', () => {
  it('each turn gets only its own points with ids and asks for the JSON choice; 120 tokens, temperature 0.1', async () => {
    await runAutopilot();
    sent.length = 0;
    await runBoardroom('Will the cash last through December?');
    const turns = sent.filter((c) => !isChair(c.m));
    expect(turns).toHaveLength(4);
    turns.forEach((c, i) => {
      expect(c.o).toMatchObject({ maxTokens: TURN_MAX_TOKENS, temperature: 0.1 });
      for (const p of cfoFacts(ORDER[i]).points) expect(c.m[1].content).toContain(`- ${p.id} (${p.core ? 'main' : 'detail'}): ${p.text}`);
      expect(c.m[1].content).toContain('Reply ONLY with JSON');
      expect(c.m[1].content).toContain('MEETING TOPIC: Will the cash last through December?');
    });
    expect(turns[3].m[1].content).not.toContain(pt('anna', 'balance')); // Kasia does not get Anna's points
    expect(turns[3].m[1].content).toMatch(/^Marek: .*$/m); // but she hears the earlier turns
    expect(turns[3].m[1].content.indexOf('WHAT THE OTHERS SAID')).toBeLessThan(turns[3].m[1].content.indexOf('YOUR POINTS'));
    expect(sent.find((c) => isChair(c.m))!.o).toMatchObject({ maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1 });
    expect(TURN_MAX_TOKENS).toBeLessThanOrEqual(130);
  });

  it('no topic → "Monthly review"; model down → every turn is its conclusion, the chair lists the current cards', async () => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? 'Sure! Here is the summary: {broken' : '');
    const r = await runBoardroom();
    expect(sent.find((c) => !isChair(c.m))!.m[1].content).toContain('MEETING TOPIC: Monthly review');
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map(en));
    expect(r.summary).toBe(ruleSummary(current()));
    expect(r.decisionActionIds).toEqual(current().map((a) => a.id));
  });

  it('emergency switch off → no model call, conclusions and the rule summary', async () => {
    await runAutopilot();
    agentModel.enabled = false;
    try {
      const r = await runBoardroom();
      expect(sent).toHaveLength(0);
      expect(r.turns.map((t) => t.text)).toEqual(ORDER.map(en));
      expect(r.summary).toBe(ruleSummary(current()));
    } finally {
      agentModel.enabled = true;
    }
  });
});

describe('conference turns: rule points + a checked comment', () => {
  it('valid choices: the picked points in the facts\' order, critical points always, then the comment', async () => {
    await runAutopilot();
    const said: Record<CfoId, string> = {
      marek: choice(['ksef'], 'KSeF needs correct buyer data, so check the NIP carefully.'),
      anna: choice(['reminders'], 'Chase the customers who owe you before you think about a loan.'),
      tomasz: choice(['labour']),
      kasia: choice(['hedge-EUR', 'rate-EUR'], 'Nobody can predict the rate, so locking it gives you peace of mind.'),
    };
    reply = (m) => (isChair(m) ? '' : said[ORDER.find((c) => persona(m, c))!]);
    const r = await runBoardroom();
    expect(r.turns.map((t) => t.text)).toEqual([
      `${pt('marek', 'next-tax')} ${pt('marek', 'ksef')} KSeF needs correct buyer data, so check the NIP carefully.`, // VAT in 5 days is critical
      `${pt('anna', 'gap')} ${pt('anna', 'reminders')} Chase the customers who owe you before you think about a loan.`,
      pt('tomasz', 'labour'),
      `${pt('kasia', 'fx-EUR')} ${pt('kasia', 'hedge-EUR')} ${pt('kasia', 'rate-EUR')} Nobody can predict the rate, so locking it gives you peace of mind.`,
    ]);
  });

  it('free text never reaches the stage, true or false (it used to be judged by the number guard)', async () => {
    await runAutopilot();
    const said: Record<CfoId, string> = {
      marek: "Your VAT of 14,230 zł for 2026 is due on November 25, 2026 and is still unpaid.", // true
      anna: 'Your bank balance today is -20 275,00 zł.', // wrong label (review of PR #6)
      tomasz: 'Na 3 zleceniach brakuje 1700,00 zł.', // Polish
      kasia: 'On your 1500 EUR, if EUR rises 5%, you lose 35 275,00 zł.', // Anna's number (review of PR #6)
    };
    reply = (m) => (isChair(m) ? '' : said[ORDER.find((c) => persona(m, c))!]);
    expect((await runBoardroom()).turns.map((t) => t.text)).toEqual(ORDER.map(en));
  });

  it('a CFO with nothing to report cannot say anything unchecked (review of PR #6: Kasia with no FX)', async () => {
    db.invoices = db.invoices.filter((i) => !i.currency || i.currency === 'PLN');
    reply = (m) => (persona(m, 'kasia') ? 'The euro is very dangerous right now, so lock a forward contract today.' : '');
    expect((await runBoardroom()).turns[3].text).toBe('You have no currency risk right now: all open invoices are in złoty.');
  });

  it.each([
    ['a number', 'Pay the 14 230 zł first.'],
    ['a done claim', 'The reminders were sent this morning.'],
    ['a name', 'Remind FlotaTrans first.'],
    ['Polish', 'Zapłać VAT na czas, to ważne.'],
    ['false calm next to the cash gap', 'You are in good shape, so take it easy.'],
  ])('a comment with %s is dropped, the points stay', async (_, comment) => {
    await runAutopilot();
    reply = (m) => (persona(m, 'anna') ? choice(['reminders'], comment) : '');
    expect((await runBoardroom()).turns[1].text).toBe(`${pt('anna', 'gap')} ${pt('anna', 'reminders')}`);
  });
  it('comments off (the default for the demo): rule points only, in turns and in the chair summary', async () => {
    await runAutopilot();
    agentModel.comments = false;
    reply = (m) => (isChair(m) ? JSON.stringify({ decisionActionIds: [], comment: 'Start with what is due first.' })
      : choice(['ksef'], 'KSeF needs correct buyer data, so check the NIP carefully.'));
    const r = await runBoardroom();
    expect(r.turns[0].text).toBe(`${pt('marek', 'next-tax')} ${pt('marek', 'ksef')}`);
    expect(r.summary).not.toContain('Start with');
  });
});

describe('conference chair: current card ids + a checked comment', () => {
  it('picked ids in the chair\'s order, unknown and repeated ids dropped; the summary lists them, then the comment', async () => {
    await runAutopilot();
    const [a, b] = [current().find((x) => x.kind === 'payment_reminder')!, current().find((x) => x.kind === 'tax_payment')!];
    reply = (m) => (isChair(m) ? chairJson(['nope', a.id, b.id, a.id], 'I would start with the reminders and keep the credit line as a backup.') : '');
    const r = await runBoardroom();
    expect(r.decisionActionIds).toEqual([a.id, b.id]);
    expect(r.summary).toBe(`${ruleSummary([a, b])} I would start with the reminders and keep the credit line as a backup.`);
  });

  it('no valid id → every current card; a stale card is never offered', async () => {
    await runAutopilot();
    const hedge = db.actions.find((x) => x.kind === 'fx_hedge')!;
    db.invoices.find((i) => i.id === 'inv-p-002')!.paid = true; // the forward goes stale
    reply = (m) => (isChair(m) ? chairJson([hedge.id]) : '');
    const r = await runBoardroom();
    expect(r.decisionActionIds).not.toContain(hedge.id);
    expect(r.decisionActionIds).toEqual(current().map((x) => x.id));
    expect(r.summary).toBe(ruleSummary(current()));
  });

  it.each([
    ['a done claim (live)', 'It was decided to send reminders to overdue customers.'],
    ['false calm next to the cash gap', 'Cash looks healthy this month, nothing urgent for you.'],
    ['a number', 'Pay VAT of 14 230 zł first.'],
    ['Polish', 'Podatek VAT trzeba zapłacić na czas.'],
    ['the advisor\'s money', 'I will pay the VAT so you do not have to.'],
  ])('a chair comment with %s is dropped, the rule summary stays', async (_, comment) => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? chairJson([], comment) : '');
    const r = await runBoardroom();
    expect(r.summary).toBe(ruleSummary(current()));
    expect(sent).toHaveLength(5); // 4 turns + chair, no extra model call
  });

  it('the old free-text "summary" field is never shown', async () => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? JSON.stringify({ summary: 'The advisors propose paying VAT of 14 230,00 zł.', decisionActionIds: [] }) : '');
    expect((await runBoardroom()).summary).toBe(ruleSummary(current()));
  });
});

describe('conference: rule texts and checks still used', () => {
  it('Marek\'s English facts carry the KSeF reason in English', () => {
    const lines = cfoFacts('marek').lines.join('\n');
    expect(lines).toContain("Reason: the buyer's tax number (NIP) is wrong, it must have 10 digits");
    expect(looksPolish(lines)).toBe(false);
  });

  it('done-claim, false-calm and my-money checks (used by commentProblem)', () => {
    expect(claimsDone('I suggest sending reminders and locking the rate.')).toBe(false);
    expect(claimsDone('The invoice must be sent again.')).toBe(false);
    expect(claimsDone('The reminders have been sent.')).toBe(true);
    expect(claimsDone('It was decided to send reminders to overdue customers.')).toBe(true);
    expect(claimsDone('However, no decisions were made, and no actions were assigned.')).toBe(true);
    expect(claimsDone("We've decided to lock the rate.")).toBe(true);
    expect(claimsDone('The owner decides whether to send reminders.')).toBe(false);
    expect(falseCalm('You have nothing to lose.')).toBe(true);
    expect(falseCalm('You lose 320,25 zł if EUR rises.')).toBe(false);
    expect(myMoney("I'll lose 320,25 zł.")).toBe(true);
    expect(myMoney('I suggest you pay VAT by November 25, 2026.')).toBe(false);
  });

  it('no EUR rate: Kasia says in English the conversion is unavailable, the other agents finish', async () => {
    db.fxRates = db.fxRates.filter((r) => r.currency !== 'EUR');
    await runAutopilot();
    const r = await runBoardroom();
    expect(r.turns).toHaveLength(4);
    expect(r.turns.find((t) => t.cfo === 'kasia')!.text).toMatch(/no NBP rate for EUR, so the conversion to złoty is unavailable/);
    expect(r.turns.find((t) => t.cfo === 'anna')!.text).toBe(en('anna'));
    expect(db.actions.some((a) => a.kind === 'credit_line')).toBe(true);
  });

  it('one EUR rate: Kasia quotes it, no 4-week trend', async () => {
    db.fxRates = [...db.fxRates.filter((r) => r.currency !== 'EUR'), { currency: 'EUR', date: '2026-11-19', midPLN: 4.27 }];
    const f = cfoFacts('kasia');
    expect(f.lines.join('\n')).toMatch(/at the NBP rate 4,27 zł/);
    expect(f.lines.join('\n')).not.toMatch(/4 weeks ago/);
    expect(f.summary).not.toMatch(/going up/);
  });
});

describe('approval explanations (autopilot)', () => {
  it('explanations are the English rule text, no model call (live: rephrasing added nonsense)', async () => {
    reply = () => 'Sure: here is the forecast. All amounts must be paid into our bank account.';
    await runAutopilot();
    expect(sent).toHaveLength(0);
    const credit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(credit.explanation).toBe(explain(credit));
    expect(credit.explanation).toMatch(/^Forecast: on December 20, 2026 the balance drops to -20\s275,00\szł, 35\s275,00\szł below your 15\s000,00\szł buffer/);
  });

  it('every open approval card is explained in English, none in Polish', async () => {
    await runAutopilot();
    const open = db.actions.filter((x) => x.tier === 'NEEDS_APPROVAL' && x.status === 'open');
    expect(open.length).toBeGreaterThan(0);
    for (const a of open) {
      expect(a.explanation).toBe(explain(a));
      expect(looksPolish(a.explanation!)).toBe(false);
    }
  });

  it('English rule texts say the right thing for each card (seed)', async () => {
    await runAutopilot();
    const card = (kind: string) => db.actions.find((a) => a.kind === kind)!;
    expect(explain(card('payment_reminder'))).toMatch(/^FlotaTrans .* is 15 days late paying you 12\s300,00\szł .* an email to the customer/);
    expect(explain(card('tax_payment'))).toMatch(/^VAT for October \(JPK_V7M\): 14\s230,00\szł is due by November 25, 2026/);
    expect(explain(card('supplier_payment'))).toMatch(/The EUR risk goes up from 320,25\szł to 448,35\szł/);
    expect(explain(card('fx_hedge'))).toMatch(/you lose 320,25\szł/);
  });

  it('the VAT card title is all English', async () => {
    await runAutopilot();
    const tax = db.actions.find((a) => a.kind === 'tax_payment')!;
    expect(tax.title.replace(/\u00a0/g, ' ')).toBe('Pay VAT for October (JPK_V7M): 14 230,00 zł');
    expect(looksPolish(tax.title)).toBe(false);
  });
});

describe('review of 8d96df5: completed actions vs proposals, negation and hypotheticals', () => {
  it.each([
    'VAT of 14,230 zł got paid.', 'The reminder went out.', 'The payment is complete.', 'The VAT payment went through.',
    'The reminder has been dispatched.', 'We took care of VAT.', 'The forward contract is in place.', 'VAT is already paid.',
  ])('claim: %s', (t) => expect(claimsDone(t)).toBe(true));
  it.each([
    'VAT of 14,230 zł has not been paid.', 'We can send reminders about VAT of 14,230 zł.', 'Once VAT is paid, the deadline is met.',
    'If the reminder is sent today, FlotaTrans may pay.', 'VAT should be paid by November 25, 2026.', "I've taken a look at your costs.",
    'The EUR rate is out of your control.',
  ])('not a claim: %s', (t) => expect(claimsDone(t)).toBe(false));
});

describe('review of 8d96df5: language', () => {
  it.each(['VAT to 14 230 zł. Zaplac go.', 'VAT is 14 230,00 zł, zaplac do 25 listopada.', 'VAT 14 230 zł.', 'Pay VAT 14 230 zł, prosze.', 'Podatek VAT wynosi 14 230 zł.'])(
    'not English: %s',
    (t) => expect(looksPolish(t)).toBe(true),
  );
  it.each([
    'Kurier Express Kraków owes you 7 380,00 zł.', 'Remind FlotaTrans Sp. z o.o. about invoice FV/2026/10/031.',
    'Pay VAT for October (JPK_V7M) by November 25, 2026.', 'Bill the full hours for the VW Passat 2015.',
  ])('English: %s', (t) => expect(looksPolish(t)).toBe(false));
});

describe('review of bc24564: the receiver confirms a payment', () => {
  it.each(['The tax office received your payment.', 'The bank credited the transfer.', 'FlotaTrans paid you yesterday.', 'The tax office has received your payment.'])(
    'claim: %s',
    (t) => expect(claimsDone(t)).toBe(true),
  );
  it.each([
    'The tax office has not received your payment yet.', "FlotaTrans hasn't paid you.", 'Send reminders to the customers who have not paid you.',
    'If the tax office receives your payment by November 25, 2026, there is no penalty.', 'Once the tax office has received your payment, VAT is settled.',
  ])('not a claim: %s', (t) => expect(claimsDone(t)).toBe(false));
});

describe('review of bc24564: a past "when" story is still a claim', () => {
  it('"When the office checked, your VAT was paid." is a claim', () => {
    expect(claimsDone('When the office checked, your VAT was paid.')).toBe(true);
  });
});

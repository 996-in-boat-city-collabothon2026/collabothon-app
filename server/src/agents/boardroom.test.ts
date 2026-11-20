// Owner: Pair 2 (Person A). Conference: per-CFO facts, clean whole-sentence turns, number guard, PL/EN by topic.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { CfoId } from '@cfo/shared';
import type { ChatMessage, ChatOptions } from '../llm/provider';
import { config } from '../config';
import { setModelCallForTests } from '../llm/provider';
import { db, resetDb } from '../domain/store';
import { runAutopilot } from './autopilot';
import { CHAIR_MAX_TOKENS, ruleSummary, runBoardroom, snapshot, TURN_MAX_TOKENS, TURN_MAX_WORDS } from './boardroom';
import { cfoFacts } from './facts';
import { explain, explainPL } from './explain';
import { claimsDone, falseCalm, myMoney, wholeSentences } from './text';
import { fixCurrencyPair, looksPolish } from './safety';

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
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (m, o) => {
    sent.push({ m, o });
    return reply(m);
  }, 'openai_compat');
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

describe('wholeSentences', () => {
  it('keeps whole sentences within the limit, keeps dates whole, never ends mid-word', () => {
    expect(wholeSentences('Jedno zdanie. Drugie zdanie. Trzecie zda', 10)).toBe('Jedno zdanie. Drugie zdanie.');
    expect(wholeSentences('Saldo 38 400,00 zł. Bufor 15 000,00 zł.', 4)).toBe('Saldo 38 400,00 zł.');
    expect(wholeSentences('Saldo spadnie 20.12.2026 do zera. Uwaga.', 20)).toBe('Saldo spadnie 20.12.2026 do zera. Uwaga.');
    expect(wholeSentences('bardzo długie zdanie bez kropki które się urwało w poło', 5)).toBe('bardzo długie zdanie bez kropki…');
    expect(wholeSentences('', 5)).toBe('');
  });
});

describe('snapshot (Polish, labelled numbers from the rules)', () => {
  it('has the seed numbers with clear labels', async () => {
    await runAutopilot();
    const s = snapshot();
    expect(s).toMatch(/Saldo dziś: 38\s400,00\szł/);
    expect(s).toMatch(/Najniższe saldo w prognozie \(2026-12-20\): -20\s275,00\szł\. To prognoza/);
    expect(s).toMatch(/Ryzyko EUR przy \+5%: 320,25\szł/);
    expect(s).toMatch(/linia kredytowa \(czeka na zgodę właściciela\), kwota 36\s000,00\szł/);
    expect(s).not.toMatch(/credit line|safety buffer|Bank balance/i);
  });
});

const en = (c: CfoId) => cfoFacts(c, 'en').summary;
const persona = (m: ChatMessage[], c: CfoId) => m[0].content.includes(`You are ${c[0].toUpperCase()}${c.slice(1)}`);

describe('conference: English on stage, prompts and limits', () => {
  it('Polish topic → each turn still gets English facts and must answer in English; 120 tokens, temperature 0.1', async () => {
    await runAutopilot();
    sent.length = 0;
    await runBoardroom('Czy przeżyjemy grudzień?');
    const turns = sent.filter((c) => !isChair(c.m));
    expect(turns).toHaveLength(4);
    turns.forEach((c, i) => {
      expect(c.o).toMatchObject({ maxTokens: TURN_MAX_TOKENS, temperature: 0.1 });
      expect(c.m[1].content).toContain(en(ORDER[i]));
      expect(c.m[1].content).toContain('in English');
    });
    expect(turns[3].m[1].content).not.toMatch(/Bank balance today/); // Kasia does not get Anna's balance facts
    expect(turns[3].m[1].content).toMatch(/^Marek: .*$/m); // but she hears the earlier turns
    expect(sent.find((c) => isChair(c.m))!.o).toMatchObject({ maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1 });
    expect(TURN_MAX_TOKENS).toBeLessThanOrEqual(130);
  });

  it('no topic → "Monthly review", English rule fallbacks everywhere when the model is down', async () => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? 'Sure! Here is the summary: {broken' : '');
    const r = await runBoardroom();
    expect(sent.find((c) => !isChair(c.m))!.m[1].content).toContain('MEETING TOPIC: Monthly review');
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map(en));
    expect(r.summary).toMatch(/^For your decision: /);
    expect(r.decisionActionIds).toHaveLength(db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL').length);
  });

  it('a long reply cut mid-word becomes whole sentences within the word limit; preamble and address dropped', async () => {
    await runAutopilot();
    const cfoIn = (m: ChatMessage[]) => ORDER.find((c) => persona(m, c))!;
    const filler = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1}.`).join(' ') + ' And then it bre';
    const first = (c: CfoId) => en(c).split(/(?<=\.)\s/)[0];
    reply = (m) => (isChair(m) ? '{"summary":"Short and clear.","decisionActionIds":[]}' : `Here's my answer: ${first(cfoIn(m))} ${filler}`);
    const r = await runBoardroom();
    for (const t of r.turns) {
      expect(t.text.startsWith(first(t.cfo).slice(0, 12))).toBe(true);
      expect(t.text).not.toMatch(/^Here/);
      expect(t.text.split(/\s+/).length).toBeLessThanOrEqual(TURN_MAX_WORDS);
      expect(t.text).toMatch(/\.$/);
    }
    expect(r.summary).toBe('Short and clear.');
  });

  it('own facts come last in the prompt, after what the others said', async () => {
    await runAutopilot();
    sent.length = 0;
    await runBoardroom();
    const kasia = sent.filter((c) => !isChair(c.m))[3].m[1].content;
    expect(kasia.indexOf('WHAT THE OTHERS SAID')).toBeLessThan(kasia.indexOf('YOUR FACTS'));
  });
});

describe('conference: the same safeguards as /api/ask', () => {
  it('invented numbers → that turn says the rule conclusion; chair summary → rule summary', async () => {
    await runAutopilot();
    reply = (m) => {
      if (isChair(m)) return '{"summary":"A loss of 50 230,00 zł in December.","decisionActionIds":[]}';
      if (persona(m, 'anna')) return '14 230 + 36 000 = 50 230,00 zł of losses.';
      if (persona(m, 'kasia')) return 'EUR went up 4,5% this month. Lock the rate.';
      if (persona(m, 'tomasz')) return 'You are missing 1700,00 zł on labour. Bill the full hours.';
      return 'Nothing important.';
    };
    const r = await runBoardroom();
    const text = (c: CfoId) => r.turns.find((t) => t.cfo === c)!.text;
    expect(text('anna')).toBe(en('anna'));
    expect(text('kasia')).toBe(en('kasia')); // "4,5%" is not in Kasia's facts
    expect(text('tomasz')).toBe('You are missing 1700,00 zł on labour. Bill the full hours.'); // real number, kept
    const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL');
    expect(r.summary).toBe(ruleSummary(approvals, 'en'));
  });

  it('a Polish turn, a repeated colleague, a done-claim, false calm or a flipped sign → rule conclusion', async () => {
    await runAutopilot();
    reply = (m) => {
      if (isChair(m)) return '{"summary":"The forward for 1500 EUR has been locked and the reminders were sent.","decisionActionIds":[]}';
      if (persona(m, 'marek')) return 'VAT 14 230,00 zł trzeba zapłacić do 25.11.2026.'; // Polish
      if (persona(m, 'tomasz')) return 'You should consider the credit line of 36 000,00 zł.'; // Anna's number
      if (persona(m, 'kasia')) return 'If EUR rises 5%, you lose 320,25 zł, so you have nothing to lose.';
      if (persona(m, 'anna')) return 'Your lowest balance will be 20 275,00 zł on December 20, 2026.'; // loss → positive
      return '';
    };
    const r = await runBoardroom();
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map(en));
    expect(r.summary).toMatch(/^For your decision: /);
  });

  it('correct Marek and Anna replies are shown, not replaced (on stage both fell back to the rules)', async () => {
    await runAutopilot();
    const said = {
      // "14,230 zł" without decimals, a year on its own, the KSeF reason in English
      marek: "Your VAT of 14,230 zł for 2026 is due on November 25, 2026 and is still unpaid. Invoice FV/2026/11/009 was rejected because the buyer's NIP must have 10 digits.",
      // repeats Marek's VAT number, says the loss in words, "hasn't paid you"
      anna: "On top of the 14 230,00 zł VAT, a negative balance of 20 275,00 zł is coming on December 20, 2026. FlotaTrans Sp. z o.o. hasn't paid you yet, so send reminders first.",
      tomasz: 'Bill the full hours at 200,00 zł: on 2 orders you are 1700,00 zł short.',
      kasia: 'If EUR rises 5%, you lose 320,25 zł. I suggest a forward contract for 1500 EUR.',
    } satisfies Record<CfoId, string>;
    reply = (m) => (isChair(m) ? '' : said[ORDER.find((c) => persona(m, c))!]);
    const r = await runBoardroom();
    expect(r.turns.map((t) => t.text)).toEqual(ORDER.map((c) => said[c]));
  });

  it('the earlier turns make a number known, but a turn still needs its own amount', async () => {
    await runAutopilot();
    reply = (m) => (persona(m, 'anna') ? 'Marek said VAT is 14 230,00 zł.' : '');
    const r = await runBoardroom();
    expect(r.turns[1].text).toBe(en('anna'));
  });

  it('Marek\'s English facts carry the KSeF reason in English', () => {
    const lines = cfoFacts('marek', 'en').lines.join('\n');
    expect(lines).toContain("Reason: the buyer's tax number (NIP) is wrong, it must have 10 digits");
    expect(looksPolish(lines)).toBe(false);
  });

  it('done-claim and false-calm checks do not fire on proposals', () => {
    expect(claimsDone('I suggest sending reminders and locking the rate.')).toBe(false);
    expect(claimsDone('The invoice must be sent again.')).toBe(false);
    expect(claimsDone('The reminders have been sent.')).toBe(true);
    expect(claimsDone('Przypomnienia zostały wysłane.')).toBe(true);
    expect(falseCalm('You have nothing to lose.')).toBe(true);
    expect(falseCalm('You lose 320,25 zł if EUR rises.')).toBe(false);
  });

  it('only the owner decides: "it was decided" / "no decisions were made" are rejected, proposals pass', () => {
    expect(claimsDone('It was decided to send reminders to overdue customers.')).toBe(true);
    expect(claimsDone('However, no decisions were made, and no actions were assigned.')).toBe(true);
    expect(claimsDone("We've decided to lock the rate.")).toBe(true);
    expect(claimsDone('The owner decides whether to send reminders.')).toBe(false);
    expect(claimsDone('Next steps for you to decide: send reminders and lock the EUR rate.')).toBe(false);
  });

  it('chair says "It was decided…" (live) → rule summary', async () => {
    await runAutopilot();
    reply = (m) =>
      isChair(m)
        ? '{"summary":"The meeting discussed the credit line and the EUR rate. It was decided to send reminders to overdue customers.","decisionActionIds":[]}'
        : '';
    const r = await runBoardroom();
    const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL');
    expect(r.summary).toBe(ruleSummary(approvals, 'en'));
  });

  it('Kasia "EUR/USD rate" (live, only euro invoices) → "EUR rate", the rest of her turn is kept', async () => {
    await runAutopilot();
    reply = (m) =>
      persona(m, 'kasia') ? 'The EUR/USD rate is going up. I suggest a forward contract for 1500 EUR, or you lose 320,25 zł if EUR rises 5%.' : '';
    const r = await runBoardroom();
    expect(r.turns[3].text).toBe('The EUR rate is going up. I suggest a forward contract for 1500 EUR, or you lose 320,25 zł if EUR rises 5%.');
    const kasiaPrompt = sent.find((c) => persona(c.m, 'kasia'))!.m[0].content;
    expect(kasiaPrompt).not.toContain('EUR/USD');
  });

  it('Kasia telling the owner\'s money as her own (live) → rule conclusion; "you lose" is fine', async () => {
    await runAutopilot();
    reply = (m) =>
      persona(m, 'kasia')
        ? "Owner, I have 1500 EUR to pay, and if the rate rises 5%, I'd lose 320,25 zł. I recommend locking the rate with a forward contract for 1500 EUR."
        : '';
    expect((await runBoardroom()).turns[3].text).toBe(en('kasia'));
    expect(myMoney("I'll lose 320,25 zł.")).toBe(true);
    expect(myMoney('You have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł.')).toBe(false);
    expect(myMoney('I suggest you pay VAT by November 25, 2026.')).toBe(false);
  });

  it('"Owner," at the start is dropped, the turn is kept', async () => {
    await runAutopilot();
    reply = (m) => (persona(m, 'kasia') ? 'Owner, you have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł.' : '');
    expect((await runBoardroom()).turns[3].text).toBe('You have 1500 EUR to pay. If EUR rises 5%, you lose 320,25 zł.');
  });

  it('review of fc04703: bad conference turns (done, small fee, wrong FX direction, Polish) → rule conclusions', async () => {
    await runAutopilot();
    reply = (m) => {
      if (isChair(m)) return '';
      if (persona(m, 'marek')) return 'VAT of 14,230 zł was paid yesterday.';
      if (persona(m, 'anna')) return 'The balance drops to -20 275,00 zł on December 20, 2026, and the bank fee is 17 zł.';
      if (persona(m, 'tomasz')) return 'Na 3 zleceniach brakuje 1700,00 zł.';
      if (persona(m, 'kasia')) return 'A -5% change would cost you 320,25 zł.';
      return '';
    };
    expect((await runBoardroom()).turns.map((t) => t.text)).toEqual(ORDER.map(en));
  });

  it.each([
    ['done', '{"summary":"VAT of 14 230,00 zł was paid and the reminders were sent.","decisionActionIds":[]}'],
    ['Polish', '{"summary":"Podatek VAT wynosi 14 230,00 zł, kurs euro rośnie.","decisionActionIds":[]}'],
    ['small invented fee', '{"summary":"Pay VAT of 14 230,00 zł and a late fee of 17 zł.","decisionActionIds":[]}'],
    ['my money', '{"summary":"I would lose 320,25 zł if EUR rises 5%.","decisionActionIds":[]}'],
  ])('review of fc04703: chair summary with %s → rule summary', async (_, chair) => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? chair : '');
    const r = await runBoardroom();
    const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL');
    expect(r.summary).toBe(ruleSummary(approvals, 'en'));
    expect(sent).toHaveLength(5); // 4 turns + chair, no extra model call
  });

  it('a correct chair summary is still shown', async () => {
    await runAutopilot();
    const good = 'The advisors propose paying VAT of 14 230,00 zł and sending reminders. The owner decides.';
    reply = (m) => (isChair(m) ? JSON.stringify({ summary: good, decisionActionIds: [] }) : '');
    expect((await runBoardroom()).summary).toBe(good);
  });

  it('a currency pair the facts really have stays', () => {
    const facts = { lines: ['USD to pay: 100 USD', 'EUR to pay: 1500 EUR'], summary: '' };
    expect(fixCurrencyPair('The EUR/USD rate moved.', facts)).toBe('The EUR/USD rate moved.');
    expect(fixCurrencyPair('The EUR/USD rate moved.', { lines: ['EUR to pay: 1500 EUR'], summary: '' })).toBe('The EUR rate moved.');
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
    const f = cfoFacts('kasia', 'en');
    expect(f.lines.join('\n')).toMatch(/at the NBP rate 4,27 zł/);
    expect(f.lines.join('\n')).not.toMatch(/4 weeks ago/);
    expect(f.summary).not.toMatch(/going up/);
  });
});

describe('approval explanations (autopilot)', () => {
  it('explanations are the English rule text, no model call (live: rephrasing added nonsense)', async () => {
    reply = () => 'Sedno: Oto prognoza. Wszystkie kwoty muszą być zapłacone na naszą konto bankowe.';
    await runAutopilot();
    expect(sent).toHaveLength(0);
    const credit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(credit.explanation).toBe(explain(credit, 'en'));
    expect(credit.explanation).toMatch(/^Forecast: on December 20, 2026 the balance drops to -20\s275,00\szł, 35\s275,00\szł below your 15\s000,00\szł buffer/);
  });

  it('every open approval card is explained in English (stage language), none in Polish', async () => {
    await runAutopilot();
    const open = db.actions.filter((x) => x.tier === 'NEEDS_APPROVAL' && x.status === 'open');
    expect(open.length).toBeGreaterThan(0);
    for (const a of open) {
      expect(a.explanation).toBe(explain(a, 'en'));
      expect(looksPolish(a.explanation!)).toBe(false);
    }
  });

  it('English rule texts say the right thing for each card (seed)', async () => {
    await runAutopilot();
    const card = (kind: string) => db.actions.find((a) => a.kind === kind)!;
    expect(explain(card('payment_reminder'), 'en')).toMatch(/^FlotaTrans .* is 15 days late paying you 12\s300,00\szł .* an email to the customer/);
    expect(explain(card('tax_payment'), 'en')).toMatch(/^VAT for October \(JPK_V7M\): 14\s230,00\szł is due by November 25, 2026/);
    expect(explain(card('supplier_payment'), 'en')).toMatch(/The EUR risk goes up from 320,25\szł to 448,35\szł/);
    expect(explain(card('fx_hedge'), 'en')).toMatch(/you lose 320,25\szł/);
  });

  it('Polish rule texts are kept for a Polish UI', async () => {
    await runAutopilot();
    const card = (kind: string) => db.actions.find((a) => a.kind === kind)!;
    expect(explainPL(card('payment_reminder'))).toMatch(/^Klient FlotaTrans .* spóźnia się 15 dni z zapłatą 12\s300,00\szł .* e-mail do klienta/);
    expect(explainPL(card('tax_payment'))).toMatch(/^VAT za październik .*: 14\s230,00\szł trzeba zapłacić do 25\.11\.2026/);
    expect(explainPL(card('supplier_payment'))).toMatch(/Ryzyko EUR wzrośnie z 320,25\szł do 448,35\szł/);
  });

  it('the VAT card title is all English', async () => {
    await runAutopilot();
    const tax = db.actions.find((a) => a.kind === 'tax_payment')!;
    expect(tax.title.replace(/\u00a0/g, ' ')).toBe('Pay VAT for October (JPK_V7M): 14 230,00 zł');
    expect(looksPolish(tax.title)).toBe(false);
  });
});

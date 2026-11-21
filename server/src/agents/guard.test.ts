// Owner: Pair 2 (Person A). Rebuild 2 (docs/AGENTS-8B-PLAN.md): the guard that decides whether the owner may see a
// reply the 8B model wrote. Seed data: today 2026-11-20, VAT 14 230,00 zł due November 25, gap -20 275,00 zł.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CfoId } from '@cfo/shared';
import { resetDb } from '../domain/store';
import { cfoFacts } from './facts';
import { checkReply, MAX_CHARS, numbersIn } from './guard';
import { REVIEW_REPLIES } from './review-corpus';

const CFOS: CfoId[] = ['anna', 'kasia', 'marek', 'tomasz'];
const check = (cfo: CfoId, reply: string) => checkReply(reply, cfoFacts(cfo));

describe('numbersIn: every way the model writes a number', () => {
  it('reads our format, the English format and plain numbers as the same value', () => {
    for (const s of ['14 230,00 zł', '14 230,00 zł', '14 230 zł', '14,230 zł', '14230']) expect(numbersIn(s)).toEqual([14230]);
    expect(numbersIn('-20,275,00 zł')).toEqual([20275]);
    expect(numbersIn('1,500 EUR')).toEqual([1500]);
  });

  it('reads decimals, percents, signs, dates and years', () => {
    expect(numbersIn('4,27 zł or 4.27 zł')).toEqual([4.27, 4.27]);
    expect(numbersIn('If EUR rises 5%')).toEqual([5]);
    expect(numbersIn('drops to -20 275,00 zł')).toEqual([20275]); // the sign is ignored
    expect(numbersIn('November 25, 2026')).toEqual([25, 2026]);
    expect(numbersIn('on 20.12')).toEqual([20, 12]); // a short date, not the decimal 20.12
    expect(numbersIn('due 25.11.2026')).toEqual([25, 11, 2026]);
    expect(numbersIn('December 20 2026')).toEqual([20, 2026]); // not "20 202" + "6"
    expect(numbersIn('VW Passat 2015, Ford Transit 2018')).toEqual([2015, 2018]);
  });
});

describe('checkReply (seed, 2026-11-20)', () => {
  beforeEach(() => resetDb());

  it('passes a reply that uses only fact numbers, in any format', () => {
    expect(check('marek', 'Your VAT of 14 230,00 zł is due on November 25, 2026. Put the money aside now.')).toEqual({ ok: true, reason: '' });
    expect(check('marek', 'VAT of 14,230 zł is due by 25.11.2026.').ok).toBe(true);
    expect(check('anna', 'On December 20 your balance drops to minus 20 275 zł. Remind FlotaTrans first.').ok).toBe(true);
  });

  it('every rule point passes on its own: the model copying a fact is never rejected', () => {
    for (const cfo of CFOS) for (const p of cfoFacts(cfo).points) expect(check(cfo, p.text), `${cfo}/${p.id}`).toEqual({ ok: true, reason: '' });
  });

  it('a made-up amount, date or year fails, and the reason names the number', () => {
    expect(check('marek', 'Your VAT of 15 000 zł is due on November 25.')).toEqual({ ok: false, reason: 'number not in facts: 15000' });
    expect(check('anna', 'On December 21 the balance drops to -20 275,00 zł.')).toEqual({ ok: false, reason: 'number not in facts: 21' });
    expect(check('marek', 'VAT of 14 230 zł is due November 25, 2025.').reason).toBe('number not in facts: 2025');
    expect(check('kasia', 'If EUR rises 10%, you lose 640,50 zł.').ok).toBe(false);
  });

  it("the owner's number never counts: only the facts decide", () => {
    // The owner asked "Is my VAT 99 999 zł?" and the model repeated it.
    expect(check('marek', 'Yes, your VAT is 99 999 zł, due November 25.')).toEqual({ ok: false, reason: 'number not in facts: 99999' });
  });

  it('a Polish, empty or too long reply fails', () => {
    expect(check('marek', 'VAT 14 230,00 zł trzeba zapłacić do 25.11.2026.').reason).toBe('polish');
    expect(check('marek', '   ').reason).toBe('empty');
    expect(check('marek', 'VAT is due. Pay it. Do it now. Really.').reason).toBe('too long'); // 4 sentences
    expect(check('marek', 'VAT is due on November 25'.padEnd(MAX_CHARS + 1, '!')).reason).toBe('too long'); // 1 sentence, 401 characters
    expect(check('anna', 'FlotaTrans Sp. z o.o. owes you money. Send a reminder.').ok).toBe(true); // "Sp. z o.o." is not 3 sentences
  });

  it('a reply that says something was already done fails (golden rule 3: the owner decides)', () => {
    for (const reply of [
      "I've opened a credit line of 36 000,00 zł for you.",
      'Your credit line of 36 000,00 zł is now active.',
      'VAT of 14 230 zł was paid yesterday.',
      'The reminder is on its way to FlotaTrans.',
      'I locked the rate at 4,27 zł for your 1500 EUR.',
    ]) expect(check('anna', reply).reason, reply).toBe('claims it was done');
  });

  it('a "when" the facts do not have fails', () => {
    expect(check('marek', 'VAT of 14 230,00 zł is due tomorrow.')).toEqual({ ok: false, reason: 'time not in facts: tomorrow' });
    expect(check('marek', 'VAT of 14 230,00 zł is due this Friday.').reason).toBe('time not in facts: friday');
    expect(check('anna', 'Pay FlotaTrans 12 300,00 zł this week.').reason).toBe('time not in facts: this week');
    expect(check('marek', 'VAT of 14 230,00 zł is already overdue.').reason).toBe('time not in facts: overdue');
    // Anna's customers really are late (facts: "15 days late"), so "overdue" is true for her.
    expect(check('anna', 'Two customers are overdue: FlotaTrans and Kurier Express. Send them a reminder first.').ok).toBe(true);
  });
});

describe('the review corpus: every real model reply from the reviews (agents/review-corpus.ts)', () => {
  beforeEach(() => resetDb());

  it('every reply a reviewer marked true passes', () => {
    const truths = REVIEW_REPLIES.filter((r) => r.from.includes('true reply'));
    expect(truths.length).toBe(31);
    for (const r of truths) expect(check(r.cfo, r.text), r.text).toEqual({ ok: true, reason: '' });
  });

  it('catches at least 39 of the 75 replies a reviewer marked wrong (the rest: docs/AGENTS-8B-GUARD.md, "Not caught")', () => {
    const wrong = REVIEW_REPLIES.filter((r) => r.from === 'review of main, wrong reply');
    expect(wrong.length).toBe(75);
    const caught = wrong.filter((r) => !check(r.cfo, r.text).ok).length;
    expect(caught).toBeGreaterThanOrEqual(39);
  });
});

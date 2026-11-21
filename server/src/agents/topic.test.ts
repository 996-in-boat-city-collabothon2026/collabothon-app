// Owner: Pair 2 (Person B). "The right CFO leads": keyword routing, general topics and small talk. No model involved.
import { describe, expect, it } from 'vitest';
import type { ChatLine } from '@cfo/shared';
import { followUpCfo, isSmallTalk, leadFor, matchesTopic, pickCfo } from './topic';

describe('leadFor: the CFO who owns the topic leads the meeting', () => {
  it.each([
    ['How to improve the margin?', 'tomasz'],
    ['Should we lock the EUR rate?', 'kasia'],
    ['Will we survive December?', 'anna'],
    ['When is VAT due?', 'marek'],
  ])('%s → %s', (topic, cfo) => expect(leadFor(topic)).toBe(cfo));

  it('a general topic has no lead: everyone speaks', () => {
    expect(leadFor('Monthly review')).toBeNull();
    expect(leadFor('')).toBeNull();
  });

  it('a CFO named in the topic leads, even with no keyword', () => {
    expect(leadFor('Kasia, what do you think?')).toBe('kasia');
    expect(leadFor('Tomasz, is the euro rate a problem?')).toBe('tomasz');
  });

  it('pickCfo is leadFor with Anna when nothing matches', () => {
    expect(pickCfo('Monthly review')).toBe('anna');
    expect(pickCfo('Should we lock the EUR rate?')).toBe(leadFor('Should we lock the EUR rate?'));
  });
});

describe('matchesTopic: does the topic touch this CFO? (the meeting lets the others pass)', () => {
  it('true for every CFO whose keywords match, not only the winner', () => {
    // "margin" is Tomasz's, "credit" is Anna's: both match, Tomasz does not win alone.
    const topic = 'Is a credit line better than a bigger margin?';
    expect(matchesTopic('tomasz', topic)).toBe(true);
    expect(matchesTopic('anna', topic)).toBe(true);
    expect(matchesTopic('kasia', topic)).toBe(false);
    expect(matchesTopic('marek', topic)).toBe(false);
  });

  it('a CFO named in the topic matches, the others only by keyword', () => {
    expect(matchesTopic('kasia', 'Kasia, what do you think?')).toBe(true);
    expect(matchesTopic('anna', 'Kasia, what do you think?')).toBe(false);
  });

  it('a general topic matches nobody', () => {
    for (const cfo of ['anna', 'kasia', 'marek', 'tomasz'] as const) expect(matchesTopic(cfo, 'Monthly review')).toBe(false);
  });
});

describe('isSmallTalk: nothing to discuss, so no CFO speaks', () => {
  it.each(['hello', 'Hi!', 'hey', 'thanks', 'Thank you!', 'Cześć', 'Dzień dobry!', 'good morning', '?', 'ok', ''])(
    '"%s" is small talk',
    (text) => expect(isSmallTalk(text)).toBe(true),
  );

  it.each([
    'How to improve the margin?',
    'Hi, how do I improve the margin?', // a greeting before a real question still counts
    'Monthly review',
    'Kasia, what do you think?',
    'Margin', // one finance keyword is enough for a meeting
    'EUR?',
    'Kasia?', // a CFO's name alone: the owner wants that CFO (review of PR #22)
  ])('"%s" is not small talk', (text) => expect(isSmallTalk(text)).toBe(false));

  it('"hi" inside a word is not a greeting ("this", "history")', () => {
    expect(isSmallTalk('this history')).toBe(false);
  });
});

// Moved from routes/ask.test.ts: the old routing cases must still pass after the move.
describe('pickCfo: the bubble sends no CFO (F4)', () => {
  it.each([
    ['What rate would you lock?', 'kasia'],
    ['Should I worry about the złoty?', 'kasia'],
    ['Should I worry about the zloty?', 'kasia'],
    ['What is the cheapest quick win?', 'tomasz'],
    ['What do I waste the most on?', 'tomasz'],
    ['Will I have enough cash in December?', 'anna'],
  ])('%s → %s', (q, cfo) => expect(pickCfo(q)).toBe(cfo));
});

describe('pickCfo: keyword routing', () => {
  it.each([
    ['Is the euro rate a problem?', 'kasia'],
    ['Should I hedge my EUR invoices?', 'kasia'],
    ['How much VAT do I pay this month?', 'marek'],
    ['KSeF rejected my invoice, what now?', 'marek'],
    ['When is ZUS due?', 'marek'],
    ['Is my margin on parts too low?', 'tomasz'],
    ['How can I cut costs?', 'tomasz'],
    ['Is my labour rate too low?', 'tomasz'],
    ['How much should I charge per hour?', 'tomasz'], // review of bc24564: pricing questions
    ['How much should I charge for an oil change?', 'tomasz'],
    ['How much should I ask customers for a brake job?', 'tomasz'],
    ['Will the bank charge me for the overdraft?', 'anna'], // "charge" alone is not pricing
    ['Anna, how much should I charge per hour?', 'anna'], // a CFO asked by name still wins
    ['How much should I ask the bank to lend me?', 'anna'], // review of f5f7df5: a loan, not a price
    ['How much can I borrow?', 'anna'],
    ['Do I need a loan?', 'anna'],
    ['A customer is late paying me', 'anna'],
    ['Good morning!', 'anna'], // no keywords → Anna
    ['I went to the hospital', 'anna'], // "pit" inside "hospital" does not match
  ])('%s → %s', (q, cfo) => expect(pickCfo(q)).toBe(cfo));
});

describe('followUpCfo: a follow-up in a chat stays with the CFO who answered', () => {
  const kasiaAnswered: ChatLine[] = [
    { from: 'owner', text: 'Should we lock the EUR rate?' },
    { from: 'cfo', cfo: 'kasia', text: 'Yes, a forward contract would protect the Krause invoice.' },
  ];

  it('"Why?" after Kasia → kasia', () => expect(followUpCfo('Why?', kasiaAnswered)).toBe('kasia'));
  it('a keyword wins: "When is VAT due?" → marek', () => expect(followUpCfo('When is VAT due?', kasiaAnswered)).toBe('marek'));
  it('a named CFO wins', () => expect(followUpCfo('Tomasz, why?', kasiaAnswered)).toBe('tomasz'));
  it('the last CFO who answered counts', () => {
    const later: ChatLine[] = [...kasiaAnswered, { from: 'cfo', cfo: 'anna', text: 'Cash is tight.' }, { from: 'owner', text: 'Hmm' }];
    expect(followUpCfo('Why?', later)).toBe('anna');
  });
  it('after a meeting the lead stays, not the last CFO who reacted', () => {
    const meeting: ChatLine[] = [
      { from: 'owner', text: 'Should we lock the EUR rate?' },
      { from: 'cfo', cfo: 'kasia', text: 'Lead answer.' },
      { from: 'cfo', cfo: 'anna', text: 'Reaction.' },
      { from: 'cfo', cfo: 'marek', text: 'Reaction.' },
      { from: 'cfo', text: 'Joint recommendation.' },
    ];
    expect(followUpCfo('Why?', meeting)).toBe('kasia');
  });

  it('"it/that/this" + money words stay with the CFO (B4 live check: "How much would it cost?" went to Tomasz)', () => {
    expect(followUpCfo('How much would it cost?', kasiaAnswered)).toBe('kasia');
    expect(followUpCfo('Is that expensive?', kasiaAnswered)).toBe('kasia');
    expect(followUpCfo('Is that a lot of money?', kasiaAnswered)).toBe('kasia'); // review of #30: went to Anna
    expect(followUpCfo('OK, what first?', kasiaAnswered)).toBe('kasia');
  });
  it('a real topic still switches, even with "it"', () => {
    expect(followUpCfo('Is it time to pay VAT?', kasiaAnswered)).toBe('marek');
    expect(followUpCfo('Can we cut costs on that?', kasiaAnswered)).toBe('tomasz'); // "cut" is Tomasz's
    expect(followUpCfo('Tomasz, how much would it cost?', kasiaAnswered)).toBe('tomasz');
  });
  it('money words without a pointer, or with no history, keep their keyword', () => {
    expect(followUpCfo('How can I cut costs?', kasiaAnswered)).toBe('tomasz');
    expect(followUpCfo('How much would it cost?')).toBe('tomasz');
  });

  it('no history (or no CFO in it) → pickCfo (Anna)', () => {
    expect(followUpCfo('Why?')).toBe('anna');
    expect(followUpCfo('Why?', [{ from: 'owner', text: 'hi' }])).toBe('anna');
  });
});

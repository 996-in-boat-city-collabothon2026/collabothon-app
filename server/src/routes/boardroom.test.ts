// Owner: Pair 2 (Person B). Quick-advice bubble: which CFO answers which question.
import { describe, expect, it } from 'vitest';
import { pickCfo } from './boardroom';

describe('pickCfo', () => {
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
    ['Will the bank charge me for the overdraft?', 'anna'], // "charge" alone is not pricing
    ['Anna, how much should I charge per hour?', 'anna'], // a CFO asked by name still wins
    ['Will I have enough cash until the end of the month?', 'anna'],
    ['Do I need a loan?', 'anna'],
    ['A customer is late paying me', 'anna'],
    ['Will the cash last through December?', 'anna'],
  ])('%s → %s', (question, cfo) => {
    expect(pickCfo(question)).toBe(cfo);
  });

  it('a CFO asked by name always answers', () => {
    expect(pickCfo('Tomasz, is the euro rate a problem?')).toBe('tomasz');
  });

  it('no keywords → Anna', () => {
    expect(pickCfo('Good morning!')).toBe('anna');
  });

  it('short words do not match inside longer ones', () => {
    expect(pickCfo('I went to the hospital')).toBe('anna'); // "pit" inside "hospital"
  });
});

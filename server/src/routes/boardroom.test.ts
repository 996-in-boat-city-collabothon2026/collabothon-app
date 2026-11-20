// Owner: Pair 2 (Person B). Quick-advice bubble: which CFO answers which question.
import { describe, expect, it } from 'vitest';
import { pickCfo } from './boardroom';

describe('pickCfo', () => {
  it.each([
    ['Czy kurs euro to problem?', 'kasia'],
    ['Should I hedge my EUR invoices?', 'kasia'],
    ['Ile zapłacę VAT w tym miesiącu?', 'marek'],
    ['KSeF odrzucił fakturę, co robić?', 'marek'],
    ['When is ZUS due?', 'marek'],
    ['Czy mam za niską marżę na częściach?', 'tomasz'],
    ['Jak obciąć koszty?', 'tomasz'],
    ['Is my labour rate too low?', 'tomasz'],
    ['Czy starczy mi gotówki do końca miesiąca?', 'anna'],
    ['Czy potrzebuję kredytu?', 'anna'],
    ['Klient się spóźnia z płatnością', 'anna'],
    ['Czy przetrwamy grudzień?', 'anna'],
    ['plynnosc finansowa', 'anna'], // no Polish letters
  ])('%s → %s', (question, cfo) => {
    expect(pickCfo(question)).toBe(cfo);
  });

  it('a CFO asked by name always answers', () => {
    expect(pickCfo('Tomasz, czy kurs euro to problem?')).toBe('tomasz');
  });

  it('no keywords → Anna', () => {
    expect(pickCfo('Dzień dobry!')).toBe('anna');
  });

  it('short words do not match inside longer ones', () => {
    expect(pickCfo('I went to the hospital')).toBe('anna'); // "pit" inside "hospital"
  });
});

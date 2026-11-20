// Owner: Pair 2 (Person B). Shapes of real replies from the live tests on OpenShift (Llama 3.2 3B), now English only.
import { beforeAll, describe, expect, it } from 'vitest';
import { db, resetDb } from '../domain/store';
import { runAutopilot } from './autopilot';
import { cfoFacts } from './facts';
import { findInventedNumbers, mentionsKeyFact, numberValues } from './numberGuard';

/** All rule output a reply may use: every CFO's facts and conclusion, plus the open cards. */
let facts = '';
beforeAll(async () => {
  resetDb();
  await runAutopilot();
  facts = [
    ...(['marek', 'anna', 'tomasz', 'kasia'] as const).flatMap((c) => [...cfoFacts(c).lines, cfoFacts(c).summary]),
    ...db.actions.map((a) => a.title),
  ].join('\n');
});

describe('numberValues', () => {
  it('reads Polish-style, English and broken number formats', () => {
    expect(numberValues('14 230,00')).toContain(14230);
    expect(numberValues('14\u00a0230,00')).toContain(14230);
    expect(numberValues('12,300.00')).toContain(12300);
    expect(numberValues('36,000,00')).toContain(36000);
    expect(numberValues('4,27')).toContain(4.27);
    expect(numberValues('320.25')).toContain(320.25);
    expect(numberValues('1500')).toEqual([1500]);
  });
});

describe('findInventedNumbers (live replies)', () => {
  it('catches a sum the model calculated itself', () => {
    const anna = 'Auto-Serwis Nowak could lose 14 230,00 zł for VAT and 36 000,00 zł for the loan. That is 50 230,00 zł.';
    expect(findInventedNumbers(anna, facts)).toEqual(['50 230,00']);
  });

  it('catches an invented amount, keeps a real rate from the trend', () => {
    // 4,22 zł is in the data (EUR 4 weeks ago); 210,10 zł is not
    const kasia = 'If you buy 1500 EUR at 4,27 zł, a 5% rise costs you 320,25 zł. At 4,22 zł it is 210,10 zł.';
    expect(findInventedNumbers(kasia, facts)).toEqual(['210,10']);
    expect(findInventedNumbers('EUR costs 4,35 zł.', facts)).toEqual(['4,35']);
  });

  it('catches an invented date written with a month name', () => {
    expect(findInventedNumbers('VAT is due on November 25, and the KSeF fix on November 22.', facts)).toEqual(['November 22']);
    expect(findInventedNumbers('VAT by the 25th of November, KSeF by the 22nd of November.', facts)).toEqual(['22nd of November']);
  });

  it('lets through a correct answer, even with English number formats', () => {
    const marek = 'VAT is 14 230,00 zł, due 25.11 (in 5 days).';
    const anna = 'You have 38,400.00 zł today, the lowest point is -20,275.00 zł on 2026-12-20.';
    const tomasz = "You're missing 1700,00 zł on 3 orders: 800,00 zł for VW Passat 2015, 600,00 zł for Ford Transit 2018.";
    expect(findInventedNumbers(marek, facts)).toEqual([]);
    expect(findInventedNumbers(anna, facts)).toEqual([]);
    expect(findInventedNumbers(tomasz, facts)).toEqual([]);
  });

  it('small counts and percents are free; the question counts only when the caller adds it', () => {
    expect(findInventedNumbers('Pay within 3 days, 2 invoices, 5% risk.', facts)).toEqual([]);
    expect(findInventedNumbers('You cannot buy a lift for 5000 zł.', `${facts}\nIs 5000 zł enough?`)).toEqual([]);
    expect(findInventedNumbers('You cannot buy a lift for 5000 zł.', facts)).toEqual(['5000']);
  });

  it('catches an invented ISO date', () => {
    expect(findInventedNumbers('The balance drops on 2026-12-24.', facts)).toEqual(['2026-12-24']);
  });
});

describe('findInventedNumbers: percents are checked as percents', () => {
  const factsOf = (cfo: 'kasia' | 'tomasz') => {
    const f = cfoFacts(cfo);
    return [...f.lines, f.summary].join('\n');
  };

  it('catches an invented percent even when the bare number is in the facts (live reply)', () => {
    // Kasia's facts say "4 weeks ago" and "5%"; the rate went 4,22 → 4,27 zł, not up 4%
    expect(findInventedNumbers('Over the last four weeks the euro rate rose 4%.', factsOf('kasia'))).toEqual(['4%']);
    expect(findInventedNumbers('EUR went up 4,5%.', factsOf('kasia'))).toEqual(['4,5%']);
  });

  it('a percent from the facts passes, in any format the small model uses', () => {
    const kasia = factsOf('kasia');
    expect(findInventedNumbers('If the euro rises 5%, you lose 320,25 zł.', kasia)).toEqual([]);
    expect(findInventedNumbers('With a 5 % rise you lose 320,25 zł.', kasia)).toEqual([]);
    expect(findInventedNumbers('A 5-percent rise costs you 320,25 zł.', kasia)).toEqual([]);
    expect(findInventedNumbers('A rise of 5 percent costs you 320,25 zł.', kasia)).toEqual([]);
  });

  it('small counts and days stay free', () => {
    expect(findInventedNumbers('In 4 weeks, 3 orders, in 5 days.', factsOf('kasia'))).toEqual([]);
  });

  it("Tomasz: a percent from his facts passes, a made-up one is caught", () => {
    const tomasz = factsOf('tomasz'); // "below 25%", "26% of all costs"
    expect(findInventedNumbers('The parts markup is below 25%, and parts are 26% of all costs.', tomasz)).toEqual([]);
    expect(findInventedNumbers('Set a 30% markup on parts.', tomasz)).toEqual(['30%']);
  });
});

describe('mentionsKeyFact (live replies on the test instance)', () => {
  const factsOf = (cfo: 'kasia' | 'tomasz' | 'marek' | 'anna') => {
    const f = cfoFacts(cfo);
    return [...f.lines, f.summary].join('\n');
  };

  it('a reply with a money amount or an invoice number from the facts uses the facts', () => {
    expect(mentionsKeyFact('If EUR rises 5%, you lose 320,25 zł.', factsOf('kasia'))).toBe(true);
    expect(mentionsKeyFact('You have 38 400,00 zł in the bank.', factsOf('anna'))).toBe(true);
    expect(mentionsKeyFact('Fix the buyer data on invoice FV/2026/11/009.', factsOf('marek'))).toBe(true);
  });

  it('generic talk or only a rate does not', () => {
    expect(mentionsKeyFact('The euro is not a problem because it is rising. Today the rate is 4,27 zł, 4 weeks ago 4,22 zł.', factsOf('kasia'))).toBe(false);
    expect(mentionsKeyFact('You can cut labour costs or parts costs.', factsOf('tomasz'))).toBe(false);
  });
});

describe('numberValues: thousands groups have 3 digits', () => {
  it('"4,27" is only 4.27, "1,500" may be 1.5 or 1500', () => {
    expect(numberValues('4,27')).toEqual([4.27]);
    expect(numberValues('1,500').sort()).toEqual([1.5, 1500]);
    expect(numberValues('14 230,00')).toEqual([14230]);
  });
});

describe('review of fc04703: money amounts of any size, percent direction', () => {
  const facts = 'VAT: 14 230,00 zł, due November 25, 2026 (in 5 days)\nLoss if EUR rises 5%: 320,25 zł\nParts markup below 25%';
  it('a small money amount is checked, unit before or after; a small count is still free', () => {
    expect(findInventedNumbers('The late fee is 17 zł.', facts)).toEqual(['17']);
    expect(findInventedNumbers('The late fee is PLN 17.', facts)).toEqual(['17']);
    expect(findInventedNumbers('Pay within 5 days.', facts)).toEqual([]);
    expect(findInventedNumbers('It costs 5 zł.', facts)).toEqual(['5']); // "5 days" is not an amount
    expect(findInventedNumbers('The fee is 17 zł.', `${facts}\nLate fee: 17,00 zł`)).toEqual([]);
  });
  it('percent: the opposite direction is invented, the same or none is fine', () => {
    expect(findInventedNumbers('A -5% change costs you 320,25 zł.', facts)).toEqual(['-5%']);
    expect(findInventedNumbers('A −5% change costs you 320,25 zł.', facts)).toEqual(['−5%']);
    expect(findInventedNumbers('If EUR falls 5%, you lose 320,25 zł.', facts)).toEqual(['5%']);
    expect(findInventedNumbers('If EUR goes up by 5%, you lose 320,25 zł.', facts)).toEqual([]);
    expect(findInventedNumbers('A 5% rise costs you 320,25 zł.', facts)).toEqual([]);
    expect(findInventedNumbers('Your markup is lower than 25%.', facts)).toEqual([]); // fact has no direction
    expect(findInventedNumbers('If EUR rises 4%, you lose 320,25 zł.', facts)).toEqual(['4%']);
  });
});

describe('review of 8d96df5: money forms, currency and FX direction words', () => {
  const facts = 'VAT: 14 230,00 zł\nEUR to pay (net): 1500 EUR\nLoss if EUR rises 5%: 320,25 zł';
  it('unreadable money forms are invented; supported forms pass', () => {
    expect(findInventedNumbers('Add a fee of fifteen thousand euro.', facts)).toContain('fifteen thousand euro');
    expect(findInventedNumbers('Add a fee of 17,-.', facts)).toContain('17,-');
    expect(findInventedNumbers('Add a fee of 15k zł.', facts)).toContain('15k');
    expect(findInventedNumbers('VAT is 14,230 zł, also 14.230,00 PLN, and you owe 1500 EUR.', facts)).toEqual([]);
    expect(findInventedNumbers('You have one EUR invoice to pay.', facts)).toEqual([]);
  });
  it('a known amount in another currency is invented', () => {
    expect(findInventedNumbers('VAT is 14 230 EUR.', facts)).toEqual(['14 230']);
    expect(findInventedNumbers('You owe 1500 zł.', facts)).toEqual(['1500']);
  });
  it('direction words, the złoty as subject, and the percent\'s own clause', () => {
    expect(findInventedNumbers('A 5% appreciation costs you 320,25 zł.', facts)).toEqual([]);
    expect(findInventedNumbers('A 5% depreciation costs you 320,25 zł.', facts)).toEqual(['5%']);
    expect(findInventedNumbers('If the euro strengthens 5%, you lose 320,25 zł.', facts)).toEqual([]);
    expect(findInventedNumbers('If the euro weakens 5%, you lose 320,25 zł.', facts)).toEqual(['5%']);
    expect(findInventedNumbers('If the złoty weakens 5%, you lose 320,25 zł.', facts)).toEqual([]);
    expect(findInventedNumbers('If the złoty strengthens 5%, you lose 320,25 zł.', facts)).toEqual(['5%']);
    expect(findInventedNumbers('EUR is rising, so a 5% depreciation costs you 320,25 zł.', facts)).toEqual(['5%']);
    expect(findInventedNumbers('If EUR rises 5%, you lose 320,25 zł, and if it weakens 5%, you lose 320,25 zł.', facts)).toEqual(['5%']);
    expect(findInventedNumbers('There is a 5% risk on 1500 EUR.', facts)).toEqual([]);
  });
});

// Owner: Pair 2 (Person B). Real replies from the live test on OpenShift (Llama 3.2 3B), 2026-11-20.
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb } from '../domain/store';
import { runAutopilot } from './autopilot';
import { snapshot } from './boardroom';
import { cfoFacts } from './facts';
import { findInventedNumbers, mentionsKeyFact, numberValues } from './numberGuard';

let facts = '';
beforeAll(async () => {
  resetDb();
  await runAutopilot(); // open cards go into the snapshot, like in the live app
  facts = snapshot();
});

describe('numberValues', () => {
  it('reads Polish, English and broken formats', () => {
    expect(numberValues('14 230,00')).toContain(14230);
    expect(numberValues('14 230,00')).toContain(14230);
    expect(numberValues('12,300.00')).toContain(12300);
    expect(numberValues('36,000,00')).toContain(36000);
    expect(numberValues('4,27')).toContain(4.27);
    expect(numberValues('320.25')).toContain(320.25);
    expect(numberValues('1500')).toEqual([1500]);
  });
});

describe('findInventedNumbers (live replies)', () => {
  it('catches a sum the model calculated itself', () => {
    const anna = 'Auto-Serwis Nowak może stracić 14 230,00 zł za VAT i 36 000,00 zł za pożyczkę. To jest 50 230,00 zł.';
    expect(findInventedNumbers(anna, facts)).toEqual(['50 230,00']);
  });

  it('catches an invented amount, keeps a real rate from the trend', () => {
    // 4,22 zł is in the data (EUR 4 weeks ago); 210,10 zł is not
    const kasia = 'Jeśli chcesz kupić 1500 EUR za 4,27 zł, to 5% wzrostu kursu to 320,25 zł. Za 4,22 zł to 210,10 zł.';
    expect(findInventedNumbers(kasia, facts)).toEqual(['210,10']);
    expect(findInventedNumbers('EUR kosztuje 4,35 zł.', facts)).toEqual(['4,35']);
  });

  it('catches an invented date written with a month name', () => {
    const marek = 'VAT jest do 25 listopada, a KSeF-rejestracja do 20 listopada.';
    expect(findInventedNumbers(marek, facts)).toEqual(['20 listopada']);
    // live reply, Polish ordinal with a dot
    expect(findInventedNumbers('VAT do dnia 25. listopada, KSeF do dnia 20. listopada.', facts)).toEqual(['20. listopada']);
  });

  it('lets through a correct answer, even with English number formats', () => {
    const marek = 'Wartość VAT to 14 230,00 zł, termin 25.11 (za 5 dni).';
    const anna = 'You have 38,400.00 zł today, the lowest point is -20,275.00 zł on 2026-12-20.';
    const tomasz = "You're missing 1700,00 zł on 3 orders: 800,00 zł for VW Passat 2015, 600,00 zł for Ford Transit 2018.";
    expect(findInventedNumbers(marek, facts)).toEqual([]);
    expect(findInventedNumbers(anna, facts)).toEqual([]);
    expect(findInventedNumbers(tomasz, facts)).toEqual([]);
  });

  it('small counts and percents are free, the question counts as facts', () => {
    expect(findInventedNumbers('Pay within 3 days, 2 invoices, 5% risk.', facts)).toEqual([]);
    expect(findInventedNumbers('Za 5000 zł nie kupisz podnośnika.', `${facts}\nCzy 5000 zł wystarczy?`)).toEqual([]);
    expect(findInventedNumbers('Za 5000 zł nie kupisz podnośnika.', facts)).toEqual(['5000']);
  });

  it('catches an invented ISO date', () => {
    expect(findInventedNumbers('The balance drops on 2026-12-24.', facts)).toEqual(['2026-12-24']);
  });
});

describe('findInventedNumbers: percents are checked as percents', () => {
  const factsOf = (cfo: 'kasia' | 'tomasz') => {
    const f = cfoFacts(cfo, 'pl');
    return [...f.lines, f.summary].join('\n');
  };

  it('catches an invented percent even when the bare number is in the facts (live reply)', () => {
    // Kasia's facts say "4 tygodnie temu" and "5%"; the rate went 4,22 → 4,27 zł, not up 4%
    expect(findInventedNumbers('Kurs euro w ciągu ostatnich czterech tygodni wzrósł o 4%.', factsOf('kasia'))).toEqual(['4%']);
    expect(findInventedNumbers('EUR wzrosło o 4,5%.', factsOf('kasia'))).toEqual(['4,5%']);
  });

  it('a percent from the facts passes, in any format the small model uses', () => {
    const kasia = factsOf('kasia');
    expect(findInventedNumbers('Jeśli euro podrożeje o 5%, stracisz 320,25 zł.', kasia)).toEqual([]);
    expect(findInventedNumbers('Przy 5 % wzrostu stracisz 320,25 zł.', kasia)).toEqual([]);
    expect(findInventedNumbers('5-procentowy wzrost kursu to strata 320,25 zł.', kasia)).toEqual([]);
    expect(findInventedNumbers('Wzrost o 5 procent kosztuje 320,25 zł.', kasia)).toEqual([]);
  });

  it('small counts and days stay free', () => {
    expect(findInventedNumbers('Za 4 tygodnie, 3 zlecenia, za 5 dni.', factsOf('kasia'))).toEqual([]);
  });

  it("Tomasz: a percent from his facts passes, a made-up one is caught", () => {
    const tomasz = factsOf('tomasz'); // "poniżej 25%", "26% wszystkich kosztów"
    expect(findInventedNumbers('Narzut na części jest poniżej 25%, a części to 26% kosztów.', tomasz)).toEqual([]);
    expect(findInventedNumbers('Ustaw narzut 30% na części.', tomasz)).toEqual(['30%']);
  });
});

describe('mentionsKeyFact (live replies on the test instance)', () => {
  const factsOf = (cfo: 'kasia' | 'tomasz' | 'marek' | 'anna') => {
    const f = cfoFacts(cfo, 'pl');
    return [...f.lines, f.summary].join('\n');
  };

  it('a reply with a money amount or an invoice number from the facts uses the facts', () => {
    expect(mentionsKeyFact('Jeśli EUR podrożeje o 5%, stracisz 320,25 zł.', factsOf('kasia'))).toBe(true);
    expect(mentionsKeyFact('Masz na koncie 38 400,00 zł.', factsOf('anna'))).toBe(true);
    expect(mentionsKeyFact('Popraw dane nabywcy na fakturze FV/2026/11/009.', factsOf('marek'))).toBe(true);
  });

  it('generic talk or only a rate does not', () => {
    expect(mentionsKeyFact('Kurs euro nie jest problemem, bo rośnie. Dziś kurs 4,27 zł, 4 tygodnie temu 4,22 zł.', factsOf('kasia'))).toBe(false);
    expect(mentionsKeyFact('Możesz obciąć koszty za robociznę albo za części.', factsOf('tomasz'))).toBe(false);
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

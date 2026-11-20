// Owner: Pair 2 (Person B). Real replies from the live test on OpenShift (Llama 3.2 3B), 2026-11-20.
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb } from '../domain/store';
import { runAutopilot } from './autopilot';
import { snapshot } from './boardroom';
import { findInventedNumbers, numberValues } from './numberGuard';

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

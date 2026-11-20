// DEMO DATA for the KPI dashboard – clearly marked, shown with a "dane demo" label in the UI.
// These numbers are NOT calculated in the UI. They stand in for API fields that Pair 2 does not provide yet
// (see docs/specs/kpi-api-wishlist.md). When the API has them, replace this file with real calls.
import type { CfoId } from '@cfo/shared';

export type Period = 'review' | 'week' | 'month';
export type Source = 'ksef' | 'bank' | 'workshop' | 'rules';
type Txt = { pl: string; en: string };

export interface DemoKpi {
  id: string;
  owner: CfoId;
  value: number;
  unit: 'pln' | 'count' | 'pct';
  ref: { label: Txt };
  /** difference vs the reference, as given by the backend (no maths in the UI) */
  delta: { text: Txt; good: boolean };
  /** the target (cel) shown next to the value */
  target: Txt;
  /** longer trend in plain words, e.g. "better than 3 months ago" */
  trend: Txt;
  /** one-sentence reason from the agent ("Dlaczego się zmieniło") */
  why: Txt;
  /** what happens if this number drops by 10 %, and what to do */
  stress: Txt;
  source: Source;
}

/** "Przychód = liczba aut × średnia wartość zlecenia − reklamacje" – the parts and the total come precomputed. */
export const DEMO_REVENUE = {
  week: { cars: 46, avgJobPLN: 612, complaintsPLN: 380, revenuePLN: 27772 },
  month: { cars: 187, avgJobPLN: 598, complaintsPLN: 1240, revenuePLN: 110586 },
};

export const DEMO_WEEK: DemoKpi[] = [
  { id: 'cars', owner: 'tomasz', value: 46, unit: 'count', source: 'workshop',
    ref: { label: { pl: 'cel', en: 'target' } }, target: { pl: '52 auta', en: '52 cars' },
    delta: { text: { pl: '▼ 6 aut poniżej celu', en: '▼ 6 cars below target' }, good: false },
    trend: { pl: '4 tygodnie z rzędu w dół', en: 'Down 4 weeks in a row' },
    why: { pl: 'Później przyszły przymrozki, więc klienci jeszcze nie zmieniają opon na zimowe.', en: 'Frost came later, so clients have not switched to winter tyres yet.' },
    stress: { pl: 'Jeśli aut będzie o 10% mniej, w miesiącu zabraknie około 2 800 zł. Uruchom przypomnienie SMS o wymianie opon.', en: 'With 10% fewer cars you lose about 2 800 zł a month. Send an SMS reminder about tyre change.' } },
  { id: 'avg_job', owner: 'tomasz', value: 612, unit: 'pln', source: 'workshop',
    ref: { label: { pl: 'cel', en: 'target' } }, target: { pl: '600 zł', en: '600 zł' },
    delta: { text: { pl: '▲ 12 zł powyżej celu', en: '▲ 12 zł above target' }, good: true },
    trend: { pl: '4 miesiące z rzędu w górę', en: 'Up 4 months in a row' },
    why: { pl: 'Więcej klientów bierze pakiet: opony + wyważenie + przechowanie.', en: 'More clients take the bundle: tyres + balancing + storage.' },
    stress: { pl: 'Jeśli średnie zlecenie spadnie o 10%, w miesiącu będzie około 11 000 zł mniej. Proponuj pakiet przy każdej wizycie.', en: 'If the average job drops 10%, you get about 11 000 zł less a month. Offer the bundle at every visit.' } },
  { id: 'margin_parts', owner: 'tomasz', value: 23.4, unit: 'pct', source: 'ksef',
    ref: { label: { pl: 'cel', en: 'target' } }, target: { pl: '28%', en: '28%' },
    delta: { text: { pl: '▼ 4,6 p.p. poniżej celu', en: '▼ 4.6 pp below target' }, good: false },
    trend: { pl: '4 miesiące z rzędu w dół', en: 'Down 4 months in a row' },
    why: { pl: 'Hurtownia podniosła ceny opon o 6%, a nasze ceny zostały bez zmian.', en: 'The wholesaler raised tyre prices by 6%, our prices stayed the same.' },
    stress: { pl: 'Jeśli marża spadnie jeszcze o 10%, zysk zmniejszy się o około 1 900 zł w miesiącu. Porównaj ceny w drugiej hurtowni.', en: 'If the margin drops another 10%, profit falls by about 1 900 zł a month. Compare prices with a second wholesaler.' } },
];

/** Trend sentences for the numbers that already come from the API (the reference itself is still demo). */
export const DEMO_REFS = {
  cash: { label: { pl: 'ten sam tydzień 2025', en: 'same week 2025' }, delta: { text: '+5 200 zł', good: true },
    trend: { pl: 'Od 4 miesięcy podobnie', en: 'About the same for 4 months' }, daysToShortage: 30,
    why: { pl: 'Floty płacą później, a 25.11 trzeba zapłacić VAT.', en: 'Fleets pay late, and VAT is due on 25.11.' },
    stress: { pl: 'Jeśli wpływy spadną o 10%, braki gotówki przyjdą tydzień wcześniej, około 13.12. Odbierz zaległe faktury.', en: 'If income drops 10%, the cash gap comes a week earlier, around 13.12. Collect overdue invoices.' } },
  overdue: { label: { pl: 'poprzedni tydzień', en: 'previous week' }, delta: { text: '+4 800 zł', good: false },
    trend: { pl: '3 miesiące z rzędu w górę', en: 'Up 3 months in a row' },
    why: { pl: 'Flota „TransBud” nie zapłaciła dwóch faktur z października.', en: 'The “TransBud” fleet has not paid two October invoices.' } },
  /** how long fleets take to pay, and invoices more than 30 days late */
  payDays: { pl: 'Floty płacą średnio po 41 dniach (termin: 14 dni)', en: 'Fleets pay after 41 days on average (terms: 14 days)' },
  late30: { pl: '2 faktury przeterminowane ponad 30 dni', en: '2 invoices more than 30 days overdue' },
  /** cash runway in plain words */
  runway: { pl: 'Bez nowych wpływów gotówki starczy na około miesiąc', en: 'Without new income, cash will last about a month' },
  tax: { trend: { pl: 'Tyle samo co w zeszłym miesiącu', en: 'Same as last month' } },
  owed: { trend: { pl: 'Nam winni więcej niż my – to dobrze, jeśli zapłacą na czas', en: 'Others owe us more than we owe – fine if they pay on time' } },
};

export const DEMO_MONTH = {
  profitPLN: 18450,
  profitRef: { text: '+2 100 zł', label: { pl: 'ten sam miesiąc 2025', en: 'same month 2025' }, good: true },
  profitTrend: { pl: 'Lepiej niż 3 miesiące temu', en: 'Better than 3 months ago' },
  costSharePct: 83.3,
  costShareRef: { text: { pl: '+1,8 p.p.', en: '+1.8 pp' }, label: { pl: 'plan 81,5%', en: 'plan 81.5%' }, good: false },
  costTrend: { pl: 'Koszty rosną od 2 miesięcy', en: 'Costs rising for 2 months' },
  planPct: 92,
  planDevText: { pl: '8% poniżej planu', en: '8% below plan' },
  planText: { pl: '110 586 zł z planu 120 000 zł', en: '110 586 zł of the 120 000 zł plan' },
};

/** "Przegląd tygodnia": the 3 things that matter most this Monday. Priority and wording come from the agents. */
export const DEMO_REVIEW: { owner: CfoId; warn: boolean; title: Txt; value: Txt; todo: Txt; action: Txt; to: string }[] = [
  { owner: 'anna', warn: true,
    title: { pl: 'Za 30 dni może zabraknąć gotówki', en: 'Cash may run out in 30 days' }, value: { pl: '−20 275 zł', en: '−20 275 zł' },
    todo: { pl: 'Odbierz zaległe faktury od flot, zanim przyjdzie termin VAT.', en: 'Collect overdue fleet invoices before VAT is due.' },
    action: { pl: 'Wyślij przypomnienie do floty', en: 'Send a reminder to the fleet' }, to: '/approvals' },
  { owner: 'marek', warn: true,
    title: { pl: 'VAT do zapłaty do 25.11', en: 'VAT due by 25.11' }, value: { pl: '14 230 zł', en: '14 230 zł' },
    todo: { pl: 'Zatwierdź przelew, żeby nie płacić odsetek.', en: 'Approve the transfer to avoid interest.' },
    action: { pl: 'Zatwierdź płatność VAT', en: 'Approve the VAT payment' }, to: '/approvals' },
  { owner: 'tomasz', warn: false,
    title: { pl: 'Mniej aut niż rok temu', en: 'Fewer cars than last year' }, value: { pl: '46 aut', en: '46 cars' },
    todo: { pl: 'Przypomnij stałym klientom o wymianie opon na zimowe.', en: 'Remind regular clients about winter tyres.' },
    action: { pl: 'Przygotuj akcję z Tomaszem', en: 'Plan a campaign with Tomasz' }, to: '/boardroom' },
];

/** Which workshop services pay off (margin per hour of work), best and worst three. */
export const DEMO_SERVICES = {
  best: [
    { name: { pl: 'Wymiana opon z wyważeniem', en: 'Tyre change with balancing' }, margin: '61%' },
    { name: { pl: 'Przechowywanie opon', en: 'Tyre storage' }, margin: '74%' },
    { name: { pl: 'Naprawa przebitej opony', en: 'Puncture repair' }, margin: '55%' },
  ],
  worst: [
    { name: { pl: 'Sprzedaż opon premium', en: 'Premium tyre sales' }, margin: '9%' },
    { name: { pl: 'Geometria kół', en: 'Wheel alignment' }, margin: '14%' },
    { name: { pl: 'Opony do aut dostawczych', en: 'Van tyres' }, margin: '17%' },
  ],
};

export const DEMO_REFRESHED_AT = '21:00';

/** Short money lines for the main screen (details stay in the Month view). */
export const DEMO_MONEY_LINES = {
  topCostGrew: { pl: 'urósł o 12% w miesiąc', en: 'up 12% in a month' },
  profit: { pl: 'Zysk w tym miesiącu: 18 450 zł', en: 'Profit this month: 18 450 zł' },
};

/** Action list built from the deviations: who, what, check-by date. */
export const DEMO_ACTIONS: { owner: CfoId; what: Txt; check: string }[] = [
  { owner: 'anna', what: { pl: 'Wysłać przypomnienie do floty TransBud o 2 fakturach', en: 'Send TransBud fleet a reminder about 2 invoices' }, check: '24.11' },
  { owner: 'marek', what: { pl: 'Zatwierdzić przelew VAT 14 230 zł', en: 'Approve the 14 230 zł VAT transfer' }, check: '25.11' },
  { owner: 'tomasz', what: { pl: 'Porównać ceny opon w drugiej hurtowni', en: 'Compare tyre prices with a second wholesaler' }, check: '27.11' },
  { owner: 'tomasz', what: { pl: 'Wysłać SMS stałym klientom o wymianie opon', en: 'Text regular clients about tyre change' }, check: '22.11' },
];

/** Break-even in one line. */
export const DEMO_BREAKEVEN = {
  pl: 'Musisz zarobić 21 000 zł w miesiącu, żeby wyjść na zero – brakuje jeszcze 3 400 zł',
  en: 'You need 21 000 zł a month to break even – 3 400 zł still missing',
};

/** Receivables by age (who owes us, how long). */
export const DEMO_AGING: { label: Txt; amountPLN: number; warn: boolean }[] = [
  { label: { pl: 'do 30 dni', en: 'up to 30 days' }, amountPLN: 17577, warn: false },
  { label: { pl: '30–60 dni', en: '30–60 days' }, amountPLN: 12880, warn: true },
  { label: { pl: 'ponad 60 dni', en: 'over 60 days' }, amountPLN: 6800, warn: true },
];

/** "Czy stać mnie na…?" – the agents' answers, based on cash, profit and break-even. */
export const DEMO_AFFORD: { q: Txt; owner: CfoId; yes: boolean; a: Txt; low: Txt }[] = [
  { q: { pl: 'nowego pracownika', en: 'a new employee' }, owner: 'anna', yes: false,
    a: { pl: 'Pracownik kosztuje około 7 500 zł miesięcznie, a teraz brakuje 3 400 zł do progu rentowności. Wróć do tematu po sezonie zimowym, gdy floty zapłacą zaległe faktury.', en: 'An employee costs about 7 500 zł a month and you are 3 400 zł below break-even. Revisit after the winter season, once fleets pay overdue invoices.' },
    low: { pl: 'Najmniej gotówki spadłoby z −20 275 zł do −27 775 zł (20.12).', en: 'The lowest cash point would drop from −20 275 zł to −27 775 zł (20.12).' } },
  { q: { pl: 'nową wyważarkę (18 000 zł)', en: 'a new wheel balancer (18 000 zł)' }, owner: 'tomasz', yes: true,
    a: { pl: 'Ale w leasingu, nie za gotówkę. Rata około 450 zł miesięcznie nie zagrozi płynności, a szybsze wyważanie da więcej aut dziennie.', en: 'But on lease, not cash. About 450 zł a month will not hurt liquidity, and faster balancing means more cars a day.' },
    low: { pl: 'Najmniej gotówki: −20 725 zł zamiast −20 275 zł – prawie bez zmiany.', en: 'Lowest cash point: −20 725 zł instead of −20 275 zł – almost no change.' } },
  { q: { pl: 'premię świąteczną (2 000 zł)', en: 'a Christmas bonus (2 000 zł)' }, owner: 'anna', yes: true,
    a: { pl: 'Jeśli wypłacisz ją po 25.11, czyli po zapłacie VAT. Wtedy gotówki wystarczy.', en: 'If you pay it after 25.11, once VAT is paid. Then cash is enough.' },
    low: { pl: 'Najmniej gotówki: −22 275 zł zamiast −20 275 zł; po 25.11 bez wpływu na VAT.', en: 'Lowest cash point: −22 275 zł instead of −20 275 zł; paid after 25.11 it does not touch VAT.' } },
];

/** Cash first: free cash = balance minus payments already planned (precomputed), credit line kept apart. */
export const DEMO_CASH = {
  freePLN: { pl: '28 600 zł', en: '28 600 zł' },
  plannedPLN: { pl: 'zaplanowane płatności 9 800 zł', en: 'planned payments 9 800 zł' },
  creditPLN: { pl: '20 000 zł', en: '20 000 zł' },
  days: { pl: 'Starczy na około 26 dni', en: 'Lasts about 26 days' },
  forecastMiss: { pl: 'Prognoza z zeszłego tygodnia pomyliła się o 800 zł – flota zapłaciła później.', en: 'Last week’s forecast was off by 800 zł – a fleet paid later.' },
  payments: [
    { date: '20.11', what: { pl: 'ZUS i zaliczka PIT', en: 'ZUS and PIT advance' }, amount: '4 300 zł' },
    { date: '28.11', what: { pl: 'Wypłaty dla 3 pracowników', en: 'Wages for 3 employees' }, amount: '21 000 zł' },
  ],
};

/** The agents' three warning rules and whether they fire right now. */
export const DEMO_RULES: { hit: boolean; text: Txt }[] = [
  { hit: true, text: { pl: 'Faktura floty TransBud ma ponad 45 dni – zadzwoń i nie przyjmuj nowych zleceń bez planu spłaty.', en: 'A TransBud fleet invoice is over 45 days old – call them and take no new jobs without a repayment plan.' } },
  { hit: true, text: { pl: 'Gotówki na mniej niż 30 dni – nie zatrudniaj i wstrzymaj duże zakupy.', en: 'Less than 30 days of cash – do not hire and hold big purchases.' } },
  { hit: true, text: { pl: 'Zlecenia dla flot są zyskowne, ale zjadają gotówkę – bierz zaliczkę albo skróć termin do 14 dni.', en: 'Fleet jobs are profitable but eat cash – take a deposit or shorten terms to 14 days.' } },
];

/** "Zanim skończą się pieniądze": the agents' best moves, best first (the first one gets the button). */
export const DEMO_MOVES: { owner: CfoId; what: Txt; effect: Txt; action: Txt }[] = [
  { owner: 'anna', what: { pl: 'Odbierz 12 880 zł od floty TransBud', en: 'Collect 12 880 zł from the TransBud fleet' },
    effect: { pl: 'Brak gotówki w grudniu zmniejszy się o ponad połowę.', en: 'The December cash gap shrinks by more than half.' },
    action: { pl: 'Wyślij przypomnienie do TransBud', en: 'Send TransBud a reminder' } },
  { owner: 'tomasz', what: { pl: 'Przesuń zamówienie opon zimowych z 2.12 na 15.12', en: 'Move the winter tyre order from 2.12 to 15.12' },
    effect: { pl: '9 500 zł zostaje na koncie w najtrudniejszym tygodniu.', en: '9 500 zł stays in the account in the hardest week.' },
    action: { pl: 'Przesuń zamówienie', en: 'Move the order' } },
  { owner: 'kasia', what: { pl: 'Zapłać fakturę w euro po 10.12, gdy kurs będzie korzystny', en: 'Pay the euro invoice after 10.12 if the rate is good' },
    effect: { pl: 'Mniejszy wydatek na początku miesiąca, ryzyko kursu pod kontrolą.', en: 'Smaller outflow early in the month, FX risk under control.' },
    action: { pl: 'Zobacz propozycję Kasi', en: 'See Kasia’s proposal' } },
];

/** Who owes us the most. */
export const DEMO_TOP_DEBTOR = { name: 'TransBud Sp. z o.o.', amount: '12 880 zł', late: true,
  days: { pl: '48 dni po terminie', en: '48 days overdue' } };

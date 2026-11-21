// "Zmiany w przepisach" for the printed report. Static, informational text (checked on 20.11.2026 against the
// sources listed). It is NOT legal advice and must be re-checked against the official texts (Dziennik Ustaw,
// ksef.podatki.gov.pl) before relying on it. Update this file when the rules change.
type Txt = { pl: string; en: string };

export const LAW_CHECKED_ON = '20.11.2026';

export const LAW_UPDATES: { title: Txt; body: Txt }[] = [
  {
    title: { pl: 'KSeF – obowiązkowe e-faktury', en: 'KSeF – mandatory e-invoices' },
    body: {
      pl: 'Od 1 lutego 2026 r. każda firma musi umieć odbierać faktury w KSeF, a największe firmy (obrót powyżej 200 mln zł) – także je wystawiać. Od 1 kwietnia 2026 r. faktury w KSeF wystawiają pozostali podatnicy VAT, czyli także warsztaty. Najmniejsze firmy (sprzedaż do 10 tys. zł miesięcznie) mają czas do 1 stycznia 2027 r.',
      en: 'From 1 February 2026 every business must be able to receive invoices in KSeF, and the largest (turnover above 200 m zł) must also issue them. From 1 April 2026 all other VAT payers, including workshops, issue invoices in KSeF. The smallest firms (sales up to 10 000 zł a month) have until 1 January 2027.',
    },
  },
  {
    title: { pl: 'Kary za błędy w KSeF', en: 'Penalties for KSeF errors' },
    body: {
      pl: 'Według obecnych przepisów kary pieniężne za faktury poza KSeF mają obowiązywać od 1 stycznia 2027 r. (nawet do 100% VAT z faktury). Ministerstwo Finansów zapowiedziało przesunięcie kar do końca 2027 r., ale do czasu zmiany ustawy warto trzymać się terminu z 2027 r.',
      en: 'Under current law, fines for invoices issued outside KSeF apply from 1 January 2027 (up to 100% of the VAT on the invoice). The Ministry of Finance announced a delay to the end of 2027, but until the law is amended it is safer to plan for 2027.',
    },
  },
  {
    title: { pl: 'Tryb offline24', en: 'Offline24 mode' },
    body: {
      pl: 'Gdy KSeF nie działa albo nie ma internetu, fakturę można wystawić offline i wysłać do KSeF najpóźniej następnego dnia roboczego.',
      en: 'When KSeF is down or there is no internet, an invoice can be issued offline and sent to KSeF by the next working day.',
    },
  },
  {
    title: { pl: 'Stałe terminy co miesiąc', en: 'Fixed monthly deadlines' },
    body: {
      pl: 'Do 20. dnia miesiąca: ZUS i zaliczka na PIT za poprzedni miesiąc. Do 25. dnia: JPK_V7M i zapłata VAT.',
      en: 'By the 20th: ZUS and the PIT advance for the previous month. By the 25th: JPK_V7M and the VAT payment.',
    },
  },
  {
    title: { pl: 'Podzielona płatność (split payment)', en: 'Split payment' },
    body: {
      pl: 'Faktury powyżej 15 000 zł brutto za towary z załącznika nr 15 do ustawy o VAT (m.in. części do pojazdów) muszą mieć dopisek „mechanizm podzielonej płatności” i być opłacone na rachunek VAT.',
      en: 'Invoices over 15 000 zł gross for goods in Annex 15 of the VAT Act (including vehicle parts) must say “split payment mechanism” and be paid via the VAT account.',
    },
  },
];

export const LAW_SOURCES = [
  { label: 'KSeF – podatki.gov.pl', url: 'https://ksef.podatki.gov.pl/' },
  { label: 'KPMG: odroczenie kar KSeF do końca 2027', url: 'https://kpmg.com/pl/pl/wiedza/podatki/alert-podatkowy-przedluzenie-odroczenia-kar-za-bledy-w-stosowaniu-ksef-do-konca-2027-r.html' },
  { label: 'jpk.info.pl: harmonogram KSeF 2026/2027', url: 'https://jpk.info.pl/faktury/e-faktura-ustrukturyzowana-ksef/harmonogram/' },
  { label: 'Fakturownia: KSeF od 2027', url: 'https://fakturownia.pl/aktualnosci/ksef-od-2027-kto-ma-obowiazek-i-co-sie-zmienia-w-ostatnim-etapie-wdrozenia' },
];

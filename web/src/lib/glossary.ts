// One plain sentence per KPI – the same definition everywhere it is shown ("Co to znaczy?").
type Txt = { pl: string; en: string };

export const GLOSSARY: Record<string, Txt> = {
  cash: { pl: 'Pieniądze, które masz teraz na koncie firmy i możesz wydać.', en: 'Money in the company account that you can spend now.' },
  cars: { pl: 'Ile aut przyjechało do warsztatu w tym tygodniu.', en: 'How many cars came to the workshop this week.' },
  avg_job: { pl: 'Ile średnio płaci klient za jedną wizytę (usługa + opony i części).', en: 'What a client pays on average per visit (service + tyres and parts).' },
  margin_parts: { pl: 'Marża: ile zostaje Ci z każdych 100 zł sprzedaży opon i części po zapłaceniu hurtowni.', en: 'Margin: what you keep from every 100 zł of tyre and parts sales after paying the wholesaler.' },
  low_point: { pl: 'Najmniejsza kwota, jaka będzie na koncie w ciągu 13 tygodni – to ten dzień trzeba przygotować.', en: 'The lowest the account will get in the next 13 weeks – the day to prepare for.' },
  overdue: { pl: 'Faktury dla firm z flotą aut, których termin zapłaty już minął.', en: 'Invoices to fleet companies that are past their due date.' },
  tax: { pl: 'Kwota VAT i ZUS, którą trzeba odłożyć, żeby zapłacić w terminie.', en: 'The VAT and ZUS amount to put aside to pay on time.' },
  profit: { pl: 'Wynik: przychód minus wszystkie koszty w tym miesiącu – tyle firma zarobiła.', en: 'Result: revenue minus all costs this month – what the business earned.' },
  owed: { pl: 'Ile klienci są Ci winni i ile Ty jesteś winien dostawcom i urzędom.', en: 'What clients owe you and what you owe suppliers and offices.' },
  cost_share: { pl: 'Jaka część sprzedaży idzie na koszty. Im mniej, tym lepiej.', en: 'What part of sales goes to costs. Lower is better.' },
  plan: { pl: 'Ile procent zaplanowanego przychodu na ten miesiąc już zarobiłeś.', en: 'How much of this month’s planned revenue you have earned so far.' },
};

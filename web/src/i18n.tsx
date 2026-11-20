// Tiny PL/EN dictionary. Add keys as you go; missing keys fall back to the key itself.
import { createContext, useContext, useState, type ReactNode } from 'react';

type Lang = 'pl' | 'en';

const DICT: Record<string, { pl: string; en: string }> = {
  dashboard: { pl: 'Pulpit', en: 'Dashboard' },
  approvals: { pl: 'Do akceptacji', en: 'Approvals' },
  boardroom: { pl: 'Zarząd CFO', en: 'Boardroom' },
  ksef: { pl: 'KSeF', en: 'KSeF' },
  activity: { pl: 'Historia', en: 'Activity' },
  settings: { pl: 'Ustawienia', en: 'Settings' },
  tier_ANALYSED: { pl: 'Sprawdzone automatycznie', en: 'Checked automatically' },
  tier_RECOMMENDED: { pl: 'Rekomendacja', en: 'Recommendation' },
  tier_NEEDS_APPROVAL: { pl: 'Czeka na Twoją zgodę', en: 'Waiting for your OK' },
  simulated: { pl: 'Symulacja', en: 'Simulated' },
  permitted: { pl: 'Dozwolone', en: 'Permitted' },
  approve: { pl: 'Zatwierdź', en: 'Approve' },
  reject: { pl: 'Odrzuć', en: 'Reject' },
  why: { pl: 'Dlaczego?', en: 'Why?' },
  run_check: { pl: 'Sprawdź teraz', en: 'Run check now' },
  balance: { pl: 'Saldo', en: 'Balance' },
  lowest_30: { pl: 'Najniższe saldo (30 dni)', en: 'Lowest point (30 days)' },
  next_deadline: { pl: 'Najbliższy termin', en: 'Next deadline' },
  start_meeting: { pl: 'Rozpocznij spotkanie', en: 'Start meeting' },
  loading: { pl: 'Ładowanie…', en: 'Loading…' },
  login: { pl: 'Zaloguj się', en: 'Sign in' },
  logout: { pl: 'Wyloguj', en: 'Sign out' },
  login_tagline: { pl: 'Twój AI-dyrektor finansowy dla warsztatu', en: 'Your AI finance director for the workshop' },
  login_h1a: { pl: 'Twój zespół finansowy', en: 'Your finance team' },
  login_h1b: { pl: 'na autopilocie', en: 'on autopilot' },
  hub_title: { pl: 'Twój zespół AI pracuje', en: 'Your AI team is working' },
  hub_text: { pl: 'Anna, Tomasz, Kasia i Marek co chwilę sprawdzają bank, faktury KSeF i kursy NBP. Nic nie wydadzą bez Twojej zgody.', en: 'Anna, Tomasz, Kasia and Marek keep checking the bank, KSeF invoices and NBP rates. Nothing is paid without your OK.' },
  lowest_point: { pl: 'Najniżej', en: 'Lowest' },
  agents_on_watch: { pl: '4 agentów pilnuje Twoich pieniędzy', en: '4 agents watch your money' },
  login_agents: { pl: 'Twoi agenci', en: 'Your agents' },
  login_demo_note: { pl: 'Konto demo', en: 'Demo account' },
  expenses_30: { pl: 'Wydatki (30 dni)', en: 'Expenses (30 days)' },
  forecast_title: { pl: 'Prognoza gotówki', en: 'Cash forecast' },
  days: { pl: 'dni', en: 'days' },
  buffer: { pl: 'Bufor bezpieczeństwa', en: 'Safety buffer' },
  agents_found: { pl: 'Agenci znaleźli…', en: 'Agents found…' },
  invoices: { pl: 'Faktury', en: 'Invoices' },
  total: { pl: 'Razem', en: 'Total' },
  lowest: { pl: 'Najniższe saldo', en: 'Lowest point' },
  cat_parts: { pl: 'Części', en: 'Parts' },
  cat_payroll: { pl: 'Wynagrodzenia', en: 'Payroll' },
  cat_rent: { pl: 'Czynsz', en: 'Rent' },
  cat_taxes: { pl: 'Podatki i ZUS', en: 'Taxes & ZUS' },
  cat_leasing: { pl: 'Leasing', en: 'Leasing' },
  cat_utilities: { pl: 'Media', en: 'Utilities' },
  cat_other: { pl: 'Inne', en: 'Other' },
  nothing_here: { pl: 'Nic tu jeszcze nie ma', en: 'Nothing here yet' },
  // KSeF
  ksef_title: { pl: 'Faktury KSeF', en: 'KSeF invoices' },
  ksef_sim_badge: { pl: 'Bramka symulowana', en: 'Simulated gateway' },
  ksef_sim_notice: {
    pl: 'To symulacja KSeF – faktury nie trafiają do Ministerstwa Finansów.',
    en: 'This is a KSeF simulation – nothing is sent to the Ministry of Finance.',
  },
  sales_invoices: { pl: 'Sprzedaż', en: 'Sales' },
  purchase_invoices: { pl: 'Zakupy', en: 'Purchases' },
  col_invoice: { pl: 'Faktura', en: 'Invoice' },
  col_buyer: { pl: 'Kontrahent', en: 'Counterparty' },
  col_amount: { pl: 'Kwota brutto', en: 'Gross amount' },
  col_currency: { pl: 'Waluta', en: 'Currency' },
  col_status: { pl: 'Status KSeF', en: 'KSeF status' },
  col_docs: { pl: 'Dokumenty', en: 'Documents' },
  ks_draft: { pl: 'Do wysłania', en: 'Draft' },
  ks_processing: { pl: 'Wysyłanie…', en: 'Sending…' },
  ks_accepted: { pl: 'Przyjęta w KSeF', en: 'Accepted by KSeF' },
  ks_rejected: { pl: 'Odrzucona', en: 'Rejected' },
  to_fix: { pl: 'do poprawy', en: 'to fix' },
  send_ksef: { pl: 'Wyślij do KSeF', en: 'Send to KSeF' },
  fix_resend: { pl: 'Popraw i wyślij ponownie', en: 'Fix & resend' },
  buyer_name: { pl: 'Nazwa nabywcy', en: 'Buyer name' },
  buyer_nip: { pl: 'NIP nabywcy', en: 'Buyer NIP' },
  nip_ok: { pl: '✓ NIP poprawny', en: '✓ NIP is valid' },
  nip_empty: { pl: 'Wpisz NIP.', en: 'Enter the NIP.' },
  nip_digits: { pl: 'NIP może mieć tylko cyfry.', en: 'NIP can only contain digits.' },
  nip_length: { pl: 'NIP ma 10 cyfr.', en: 'NIP has 10 digits.' },
  nip_checksum: { pl: 'Błędna suma kontrolna – sprawdź cyfry.', en: 'Wrong checksum – check the digits.' },
  name_empty: { pl: 'Wpisz nazwę nabywcy.', en: 'Enter the buyer name.' },
  resend_btn: { pl: 'Wyślij ponownie do KSeF 🧪', en: 'Resend to KSeF 🧪' },
  sent_accepted: { pl: '🧪 Przyjęta w KSeF (symulacja):', en: '🧪 Accepted by KSeF (simulated):' },
  sent_rejected: { pl: '❌ KSeF odrzucił:', en: '❌ KSeF rejected:' },
  send_failed: { pl: 'Nie udało się wysłać. Spróbuj ponownie.', en: 'Could not send. Try again.' },
  xml_hint: { pl: 'Faktura w formacie FA(3)', en: 'Invoice in FA(3) format' },
  upo_hint: { pl: 'Urzędowe Poświadczenie Odbioru', en: 'Official receipt (UPO)' },
  upo_number: { pl: 'Numer KSeF', en: 'KSeF number' },
  upo_ref: { pl: 'Numer referencyjny', en: 'Reference number' },
  upo_received: { pl: 'Przyjęto', en: 'Received' },
  // Advice bubble
  ask_title: { pl: 'Zapytaj CFO', en: 'Ask the CFO' },
  ask_hello: {
    pl: 'Cześć! Zapytaj o pieniądze warsztatu – odpowie agent, który się na tym zna.',
    en: 'Hi! Ask about the workshop’s money – the right agent will answer.',
  },
  ask_s1: { pl: 'Czy przeżyjemy grudzień?', en: 'Will we survive December?' },
  ask_s2: { pl: 'Co z fakturami w EUR?', en: 'What about EUR invoices?' },
  ask_s3: { pl: 'Gdzie zaoszczędzić?', en: 'Where can we save?' },
  ask_placeholder: { pl: 'Zadaj pytanie…', en: 'Ask a question…' },
  ask_typing: { pl: 'Agent pisze…', en: 'Agent is typing…' },
  ask_error: { pl: 'Model nie odpowiedział. Spróbuj jeszcze raz.', en: 'The model did not answer. Try again.' },
  send: { pl: 'Wyślij', en: 'Send' },
  close: { pl: 'Zamknij', en: 'Close' },
  // Login form + dashboard
  login_user: { pl: 'Login', en: 'Login' },
  login_pass: { pl: 'Hasło', en: 'Password' },
  login_missing: { pl: 'Wpisz login i hasło.', en: 'Enter login and password.' },
  login_hint: { pl: 'Dane demo: login „demo”, hasło „demo”.', en: 'Demo data: login “demo”, password “demo”.' },
  above_buffer: { pl: 'powyżej bufora', en: 'above buffer' },
  below_buffer: { pl: 'poniżej bufora', en: 'below buffer' },
  agents_working: { pl: 'Agenci przeglądają faktury i prognozę…', en: 'Agents are checking invoices and the forecast…' },
  status_auto_done: { pl: 'zrobione automatycznie', en: 'done automatically' },
  status_approved: { pl: 'zatwierdzone', en: 'approved' },
  status_rejected: { pl: 'odrzucone', en: 'rejected' },
  // Minimal dashboard
  kpi_receivables: { pl: 'Należności', en: 'Receivables' },
  kpi_overdue: { pl: 'Zaległe', en: 'Overdue' },
  kpi_payables: { pl: 'Do zapłaty', en: 'To pay' },
  kpi_fx: { pl: 'W walutach', en: 'In foreign currency' },
  biggest_cost: { pl: 'Największy koszt', en: 'Biggest cost' },
  of_expenses_30: { pl: 'wszystkich wydatków z 30 dni', en: 'of all expenses in 30 days' },
  ask_inline: { pl: 'Zapytaj agentów…', en: 'Ask the agents…' },
  today: { pl: 'Dziś', en: 'Today' },
  you_have: { pl: 'Na koncie firmy masz', en: 'Your business account holds' },
  verdict_ok: { pl: 'Wszystko w porządku – zapas bezpieczeństwa jest zachowany.', en: 'All good – your safety buffer is kept.' },
  verdict_low: { pl: 'Uwaga: pieniędzy będzie mniej niż bezpieczny zapas, najmniej dnia', en: 'Heads up: money drops below your safety buffer, lowest on' },
  verdict_short: { pl: 'Uwaga: może zabraknąć pieniędzy – najgorzej będzie', en: 'Warning: you may run out of money – the worst day is' },
  checking: { pl: 'Sprawdzam…', en: 'Checking…' },
  waiting_for_you: { pl: 'Czeka na Twoją zgodę', en: 'Waiting for your OK' },
  nothing_waits: { pl: 'Nic – wszystko załatwione', en: 'Nothing – all done' },
  matter_1: { pl: 'sprawa', en: 'item' },
  matter_n: { pl: 'sprawy', en: 'items' },
  legend_analysed: { pl: 'sprawdzone', en: 'checked' },
  legend_recommended: { pl: 'rada', en: 'advice' },
  legend_approval: { pl: 'potrzebna Twoja zgoda', en: 'needs your OK' },
  see_all: { pl: 'Zobacz wszystko', en: 'See all' },
  all_quiet: { pl: 'Agenci nic nie znaleźli. Kliknij „Sprawdź teraz”.', en: 'The agents found nothing. Tap “Run check now”.' },
  // Settings
  autonomy_title: { pl: 'Co agenci mogą robić sami?', en: 'What may the agents do alone?' },
  autonomy_note: {
    pl: 'Wszystko w demo jest symulacją. „Zapytaj mnie” znaczy: nic się nie stanie bez Twojego kliknięcia.',
    en: 'Everything in this demo is simulated. “Ask me” means nothing happens without your click.',
  },
  kind_ksef_revalidate: { pl: 'Ponowne sprawdzenie odrzuconych faktur KSeF', en: 'Re-validate rejected KSeF invoices' },
  kind_payment_reminder: { pl: 'Przypomnienia o zapłacie do klientów', en: 'Payment reminders to clients' },
  kind_tax_payment: { pl: 'Płatność VAT / ZUS / PIT', en: 'Pay VAT / ZUS / PIT' },
  kind_supplier_payment: { pl: 'Płatności dla dostawców', en: 'Pay suppliers' },
  kind_credit_line: { pl: 'Wniosek o linię kredytową', en: 'Apply for a credit line' },
  mode_auto: { pl: 'Sami', en: 'Alone' },
  mode_ask: { pl: 'Zapytaj mnie', en: 'Ask me' },
  saved: { pl: 'Zapisano ✓', en: 'Saved ✓' },
  save_failed: { pl: 'Nie udało się zapisać.', en: 'Could not save.' },
  demo_title: { pl: 'Demo', en: 'Demo' },
  demo_note: { pl: 'Przed każdą próbą pokazu przywróć dane startowe.', en: 'Restore the starting data before each rehearsal.' },
  reset_demo: { pl: 'Przywróć dane demo', en: 'Reset demo data' },
  reset_confirm: { pl: 'Na pewno? Decyzje i poprawki z tej sesji znikną.', en: 'Are you sure? Decisions and fixes from this session will be lost.' },
  reset_yes: { pl: 'Tak, przywróć', en: 'Yes, reset' },
  cancel: { pl: 'Anuluj', en: 'Cancel' },
  // Activity
  filter_by: { pl: 'Pokaż wpisy', en: 'Show entries' },
  filter_all: { pl: 'Wszystko', en: 'All' },
  you: { pl: 'Ty', en: 'You' },
  system: { pl: 'System', en: 'System' },
  // Hat conference
  boardroom_title: { pl: 'Konferencja kapeluszy', en: 'Hat conference' },
  boardroom_intro: {
    pl: 'Czterech agentów, każdy w swoim kapeluszu myślenia, omawia temat. Niebieski kapelusz podsumowuje.',
    en: 'Four agents, each in their thinking hat, discuss a topic. The Blue hat sums up.',
  },
  topic: { pl: 'Temat spotkania', en: 'Meeting topic' },
  topic_december: { pl: 'Czy przeżyjemy grudzień?', en: 'Will we survive December?' },
  topic_month: { pl: 'Przegląd miesiąca', en: 'Monthly review' },
  topic_fx: { pl: 'Czy zabezpieczyć kurs EUR?', en: 'Should we lock the EUR rate?' },
  topic_margin: { pl: 'Jak poprawić marżę?', en: 'How to improve the margin?' },
  topic_custom: { pl: 'albo wpisz własny temat…', en: 'or type your own topic…' },
  meeting_running: { pl: 'Trwa spotkanie…', en: 'Meeting in progress…' },
  cfos_thinking: { pl: 'Agenci myślą…', en: 'The CFOs are thinking…' },
  meeting_failed: { pl: 'Spotkanie się nie udało. Spróbuj jeszcze raz.', en: 'The meeting failed. Try again.' },
  transcript: { pl: 'Przebieg spotkania', en: 'Meeting transcript' },
  is_typing: { pl: 'pisze…', en: 'is typing…' },
  chair: { pl: 'Przewodniczący', en: 'Chair' },
  chair_summing: { pl: 'Niebieski kapelusz podsumowuje…', en: 'The Blue hat is summing up…' },
  blue_summary: { pl: 'Podsumowanie spotkania', en: 'Meeting summary' },
  decisions_to_approve: { pl: 'Decyzje do zatwierdzenia', en: 'Decisions to approve' },
  no_decisions: { pl: 'Nic nie czeka na zgodę.', en: 'Nothing waits for approval.' },
  // Approvals
  approved_toast: { pl: '🧪 Zatwierdzono (symulacja):', en: '🧪 Approved (simulated):' },
  rejected_toast: { pl: 'Odrzucono:', en: 'Rejected:' },
  decision_failed: { pl: 'Nie udało się zapisać decyzji.', en: 'Could not save the decision.' },
  all_done: { pl: 'Nic nie czeka na Twoją decyzję 👍', en: 'Nothing waits for your decision 👍' },
  recent_decisions: { pl: 'Ostatnie decyzje', en: 'Recent decisions' },
  waiting: { pl: 'czeka', en: 'waiting' },
};

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

function initialLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'pl' ? 'pl' : 'en';
  } catch {
    return 'en';
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      /* private mode: ignore */
    }
  };
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useT() {
  const { lang, setLang } = useContext(LangCtx);
  const t = (key: string) => DICT[key]?.[lang] ?? key;
  return { t, lang, setLang };
}

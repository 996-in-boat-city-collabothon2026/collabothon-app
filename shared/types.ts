// API contract between server/ and web/. Owner: Pair 2.
// Changing a field? Tell the team first — both sides compile against this file.

// ---------- CFOs + thinking hats (de Bono's "Six Thinking Hats") ----------
export type CfoId = 'marek' | 'anna' | 'tomasz' | 'kasia';
export type Hat = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue';

export const HATS: Record<Hat, { label: string; labelPl: string; meaning: string; color: string }> = {
  white: { label: 'White hat', labelPl: 'Biały kapelusz', meaning: 'Facts and rules only', color: '#f8fafc' },
  red: { label: 'Red hat', labelPl: 'Czerwony kapelusz', meaning: 'Gut feeling and market mood', color: '#dc2626' },
  black: { label: 'Black hat', labelPl: 'Czarny kapelusz', meaning: 'Risks and caution', color: '#0f172a' },
  yellow: { label: 'Yellow hat', labelPl: 'Żółty kapelusz', meaning: 'Benefits and opportunities', color: '#facc15' },
  green: { label: 'Green hat', labelPl: 'Zielony kapelusz', meaning: 'Creative fixes and new ideas', color: '#16a34a' },
  blue: { label: 'Blue hat', labelPl: 'Niebieski kapelusz', meaning: 'Chairs the meeting, sums up the plan', color: '#2563eb' },
};

/** Each CFO always wears the same hat. The Blue hat is the meeting chair (not a CFO). */
export const CFOS: Record<CfoId, { name: string; role: string; rolePl: string; color: string; hat: Hat }> = {
  marek: { name: 'Marek', role: 'Tax & KSeF', rolePl: 'Podatki i KSeF', color: '#2563eb', hat: 'white' },
  anna: { name: 'Anna', role: 'Liquidity & Cash-flow', rolePl: 'Płynność finansowa', color: '#059669', hat: 'black' },
  tomasz: { name: 'Tomasz', role: 'Costs & Margins', rolePl: 'Koszty i marże', color: '#d97706', hat: 'green' },
  kasia: { name: 'Kasia', role: 'FX & Currency risk', rolePl: 'Ryzyko walutowe', color: '#7c3aed', hat: 'red' },
};

// ---------- Login (demo now, real Google OAuth later if time) ----------
export interface User {
  id: string;
  name: string;
  email: string;
  provider: 'demo' | 'google';
}

// ---------- Business data (seed JSON has exactly these shapes) ----------
export interface Shop {
  name: string;
  nip: string; // 10 digits
  city: string;
  employees: number;
  labourRatePLN: number; // target net price per labour hour (roboczogodzina)
  partsMarkupTarget: number; // e.g. 0.25 = 25% over cost
  safetyBufferPLN: number; // minimum cash the owner wants to keep
  today: string; // ISO date used as "now" so the demo is repeatable
}

export interface BankAccount {
  name: string;
  iban: string;
  balancePLN: number;
}

export type VatRate = 23 | 8 | 5 | 0;
export type Currency = 'PLN' | 'EUR' | 'USD';

/** NBP table A mid rate: 1 unit of currency = midPLN złoty. Seed: fx-rates.json (oldest first). */
export interface FxRate {
  currency: Exclude<Currency, 'PLN'>;
  date: string;
  midPLN: number;
}
export type KsefStatus = 'draft' | 'processing' | 'accepted' | 'rejected';

export interface InvoiceLine {
  name: string;
  kind: 'part' | 'labour' | 'other';
  qty: number;
  unitNet: number; // in the invoice's currency
  vatRate: VatRate;
}

export interface Upo {
  ksefNumber: string;
  referenceNumber: string;
  receivedAt: string; // ISO datetime
}

export interface Invoice {
  id: string;
  number: string; // e.g. FV/2026/11/014
  direction: 'sales' | 'purchase';
  issueDate: string;
  dueDate: string;
  counterparty: { name: string; nip: string };
  currency?: Currency; // missing = PLN. Foreign invoices are what the FX agent (Kasia) watches.
  lines: InvoiceLine[];
  paid: boolean;
  ksef: { status: KsefStatus; ksefNumber?: string; upo?: Upo; rejectionReason?: string };
}

export interface RepairOrder {
  id: string;
  date: string;
  car: string; // "Skoda Octavia 2017"
  customer: string;
  partsCostPLN: number; // what we paid for parts (net)
  partsPricePLN: number; // what we charged for parts (net)
  labourHours: number; // hours actually worked
  labourBilledPLN: number; // labour charged (net)
}

export type ObligationKind = 'VAT' | 'ZUS' | 'PIT' | 'PAYROLL' | 'RENT' | 'SUPPLIER' | 'LEASING' | 'OTHER';

export interface Obligation {
  id: string;
  kind: ObligationKind;
  label: string;
  amountPLN: number;
  dueDate: string;
  paid: boolean;
  invoiceId?: string; // purchase invoice behind this payment (foreign: amountPLN = estimate at today's rate)
}

// ---------- Expenses (dashboard pie chart, Tomasz) ----------
export type ExpenseCategory = 'parts' | 'payroll' | 'rent' | 'taxes' | 'leasing' | 'utilities' | 'other';

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  label: string;
  amountPLN: number;
}

// ---------- Agent output ----------
export type Tier = 'ANALYSED' | 'RECOMMENDED' | 'NEEDS_APPROVAL';
export type Execution = 'simulated' | 'permitted';
export type ActionStatus = 'open' | 'auto_done' | 'approved' | 'rejected';
export type ActionKind =
  | 'ksef_revalidate'
  | 'ksef_fix'
  | 'tax_payment'
  | 'credit_line'
  | 'payment_reminder'
  | 'supplier_payment'
  | 'pricing'
  | 'cost_cut'
  | 'deposit'
  | 'fx_hedge'
  | 'info';

export interface Action {
  id: string;
  cfo: CfoId;
  kind: ActionKind;
  tier: Tier;
  execution: Execution;
  title: string;
  why: string[]; // reasons, each with the number that triggered it
  explanation?: string; // plain-language text written by the LLM (optional)
  amountPLN?: number;
  dueDate?: string;
  refId?: string; // id of the Obligation / Invoice / RepairOrder this is about
  status: ActionStatus;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  actor: CfoId | 'user' | 'system';
  text: string;
  simulated: boolean;
  actionId?: string;
}

export interface Alert {
  id: string;
  cfo: CfoId;
  severity: 'info' | 'warning' | 'critical';
  text: string;
}

// ---------- API responses ----------
export interface Kpis {
  balancePLN: number;
  receivablesPLN: number;
  overdueReceivablesPLN: number;
  payablesPLN: number;
  nextDeadline?: { label: string; date: string; amountPLN: number };
  fxExposurePLN: number; // unpaid foreign payables − receivables, valued at today's rate
}

export interface AppState {
  shop: Shop;
  bank: BankAccount;
  kpis: Kpis;
}

export interface ForecastPoint {
  date: string;
  balancePLN: number;
}

export interface Forecast {
  days: number;
  bufferPLN: number;
  points: ForecastPoint[];
  lowest: ForecastPoint;
}

export interface AutopilotResult {
  log: string[];
  actions: Action[];
}

export interface BoardroomTurn {
  cfo: CfoId;
  text: string;
}

export interface ExpenseBreakdown {
  from: string;
  to: string;
  totalPLN: number;
  byCategory: { category: ExpenseCategory; amountPLN: number; share: number }[]; // biggest first, share 0..1
}

/** One message of a chat, sent back to /ask as context ("Why?" after a meeting). */
export interface ChatLine {
  from: 'owner' | 'cfo';
  cfo?: CfoId; // who answered, when from = 'cfo'
  text: string;
}

/** Body of POST /api/ask. cfo and history are optional, so old clients keep working. */
export interface AskRequest {
  question: string;
  cfo?: CfoId; // without it the server picks one by topic (or keeps the CFO from the history)
  history?: ChatLine[]; // at most 6 lines; all pick the CFO, the last 4 go into the prompt
}

export interface AskResult {
  cfo: CfoId; // who answered (picked by topic when the question did not name a CFO)
  text: string;
}

export interface BoardroomResult {
  turns: BoardroomTurn[];
  summary: string;
  decisionActionIds: string[];
}

export type AutonomyMode = 'auto' | 'ask';

export interface Settings {
  language: 'pl' | 'en';
  // Which action kinds the agents may execute alone (still simulated) vs must ask first.
  autonomy: Partial<Record<ActionKind, AutonomyMode>>;
}

export interface LlmHealth {
  mode: 'mock' | 'openai_compat';
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

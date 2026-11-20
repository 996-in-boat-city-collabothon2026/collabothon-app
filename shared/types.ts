// API contract between server/ and web/. Owner: Pair 2.
// Changing a field? Tell the team first — both sides compile against this file.

// ---------- CFOs ----------
export type CfoId = 'marek' | 'anna' | 'tomasz' | 'kasia';

export const CFOS: Record<CfoId, { name: string; role: string; rolePl: string; color: string }> = {
  marek: { name: 'Marek', role: 'Tax & KSeF', rolePl: 'Podatki i KSeF', color: '#2563eb' },
  anna: { name: 'Anna', role: 'Cash-flow & Liquidity', rolePl: 'Płynność finansowa', color: '#059669' },
  tomasz: { name: 'Tomasz', role: 'Margin & Costs', rolePl: 'Marże i koszty', color: '#d97706' },
  kasia: { name: 'Kasia', role: 'Growth & Investment', rolePl: 'Rozwój i inwestycje', color: '#7c3aed' },
};

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
export type KsefStatus = 'draft' | 'processing' | 'accepted' | 'rejected';

export interface InvoiceLine {
  name: string;
  kind: 'part' | 'labour' | 'other';
  qty: number;
  unitNetPLN: number;
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
  | 'capex'
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

// The ONLY file that knows API URLs. Pages call these functions, never fetch() directly.
import { useCallback, useEffect, useState } from 'react';
import type {
  Action, ActivityEntry, Alert, AppState, AskResult, AutopilotResult, BoardroomResult, CfoId, ExpenseBreakdown,
  Currency, Forecast, Invoice, InvoiceLine, LlmHealth, Settings, Upo, User, VatRate,
} from '@cfo/shared';

/** GET /ksef/invoices adds totals computed on the server (Pair 3 route), so the UI never does money maths. */
export type KsefInvoiceRow = Invoice & { gross: number; grossPLN: number };

/** The form as sent to the Invoice clerk agent. Empty string = a gap. assumed = guessed earlier, may be replaced. */
export interface ClerkForm {
  counterparty: { name: string; nip: string };
  currency: Currency | '';
  dueDate: string;
  paymentMethod: PaymentMethod | '';
  lines: Array<{ name: string; kind: InvoiceLine['kind']; qty: string; unitNet: string; vatRate: VatRate; assumed: ('qty' | 'vatRate')[] }>;
}
export type PaymentMethod = 'transfer' | 'cash' | 'card';
/** POST /invoices/parse-voice (Pair 2, server/src/agents/invoiceClerk.ts – keep in sync). Only the gaps are filled. */
export interface InvoiceFill {
  agent: 'clerk';
  source: 'llm' | 'fallback';
  set: { name?: string; nip?: string; currency?: Currency; paymentMethod?: PaymentMethod; dueDate?: string };
  lineUpdates: Array<{ index: number; name?: string; kind?: InvoiceLine['kind']; qty?: number; unitNet?: number; vatRate?: VatRate }>;
  newLines: Array<Omit<InvoiceLine, 'unitNet'> & { unitNet: number | null; assumed: ('qty' | 'vatRate')[] }>;
  skipped: Array<{ field: string; value: string; reason: 'already_filled' | 'wrong_type' | 'not_said' | 'invalid_nip' | 'used_twice' | 'bad_value' }>;
  missing: Array<{ field: 'name' | 'nip' | 'dueDate' } | { field: 'line.name' | 'line.qty' | 'line.unitNet'; line: number }>;
}
export type NewInvoice = Omit<Invoice, 'id' | 'ksef' | 'paid'>;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
}
const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  llmHealth: () => call<LlmHealth>('/llm/health'),
  me: () => call<{ user: User | null }>('/auth/me'),
  demoLogin: () => post<{ user: User }>('/auth/demo-login'),
  logout: () => post<{ user: null }>('/auth/logout'),
  state: () => call<AppState>('/state'),
  forecast: (days: 30 | 60 | 90 = 30) => call<Forecast>(`/forecast?days=${days}`),
  expenses: (days = 30) => call<ExpenseBreakdown>(`/expenses?days=${days}`),
  alerts: () => call<Alert[]>('/alerts'),
  runAutopilot: () => post<AutopilotResult>('/autopilot/run'),
  actions: (status?: Action['status']) => call<Action[]>(`/actions${status ? `?status=${status}` : ''}`),
  approve: (id: string) => post<Action>(`/actions/${id}/approve`),
  reject: (id: string) => post<Action>(`/actions/${id}/reject`),
  activity: () => call<ActivityEntry[]>('/activity'),
  boardroom: (topic?: string) => post<BoardroomResult>('/boardroom', { topic }),
  /** Quick advice: leave cfo out and the server picks the right CFO by topic. */
  ask: (question: string, cfo?: CfoId) => post<AskResult>('/ask', { question, cfo }),
  invoices: () => call<KsefInvoiceRow[]>('/ksef/invoices'),
  sendInvoice: (id: string, fix?: Pick<Invoice, 'counterparty'>) => post<Invoice>(`/ksef/invoices/${id}/send`, fix ?? {}),
  createInvoice: (inv: NewInvoice) => post<Invoice>('/ksef/invoices', inv),
  /** Dictated text → form fields. Fills the form only, saves nothing. */
  /** Invoice clerk agent: dictated text + the form → values for the EMPTY fields only. Saves nothing. */
  fillInvoiceGaps: (text: string, form: ClerkForm) => post<InvoiceFill>('/invoices/parse-voice', { text, form }),
  invoiceXml: (id: string) => call<string>(`/ksef/invoices/${id}/xml`),
  invoiceUpo: (id: string) => call<Upo>(`/ksef/invoices/${id}/upo`),
  settings: () => call<Settings>('/settings'),
  saveSettings: (s: Partial<Settings>) => call<Settings>('/settings', { method: 'PUT', body: JSON.stringify(s) }),
  resetDemo: () => post<{ ok: boolean }>('/demo/reset'),
};

/** Load data in a component: const { data, loading, error, reload } = useApi(api.state); */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

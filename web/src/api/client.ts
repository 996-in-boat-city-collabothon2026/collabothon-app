// The ONLY file that knows API URLs. Pages call these functions, never fetch() directly.
import { useCallback, useEffect, useState } from 'react';
import type {
  Action, ActivityEntry, Alert, AppState, AskResult, AutopilotResult, BoardroomResult, CfoId, ExpenseBreakdown,
  Forecast, Invoice, LlmHealth, Settings, Upo, User,
} from '@cfo/shared';

/** GET /ksef/invoices adds totals computed on the server (Pair 3 route), so the UI never does money maths. */
export type KsefInvoiceRow = Invoice & { gross: number; grossPLN: number };

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

/** POST /ksef/parse: a draft read from one sentence (Pair 3 route). Dates and number come from the server. */
export interface ParsedInvoice {
  buyerName: string; nip: string; nipError: string | null; lines: Invoice['lines']; source: 'model' | 'rules';
  number: string; issueDate: string; dueDate: string;
}

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
  transcribeStatus: () => call<{ ready: boolean }>('/ksef/transcribe/status'),
  /** Raw recording -> our server -> Whisper on OpenShift AI. The audio never goes to a public cloud. */
  transcribe: async (audio: Blob, lang: string) => {
    const res = await fetch(`/api/ksef/transcribe?lang=${lang === 'en' ? 'en' : 'pl'}`, {
      method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio,
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { text: string };
  },
  parseInvoice: (text: string) => post<ParsedInvoice>('/ksef/parse', { text }),
  createInvoice: (inv: Omit<Invoice, 'id' | 'ksef' | 'paid'>) => post<Invoice>('/ksef/invoices', inv),
  sendInvoice: (id: string, fix?: Pick<Invoice, 'counterparty'>) => post<Invoice>(`/ksef/invoices/${id}/send`, fix ?? {}),
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

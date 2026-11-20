// The ONLY file that knows API URLs. Pages call these functions, never fetch() directly.
import { useCallback, useEffect, useState } from 'react';
import type {
  Action, ActivityEntry, Alert, AppState, AutopilotResult, BoardroomResult, CfoId, Forecast, Invoice,
  LlmHealth, Settings, Upo,
} from '@cfo/shared';

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
  state: () => call<AppState>('/state'),
  forecast: (days: 30 | 60 | 90 = 30) => call<Forecast>(`/forecast?days=${days}`),
  alerts: () => call<Alert[]>('/alerts'),
  runAutopilot: () => post<AutopilotResult>('/autopilot/run'),
  actions: (status?: Action['status']) => call<Action[]>(`/actions${status ? `?status=${status}` : ''}`),
  approve: (id: string) => post<Action>(`/actions/${id}/approve`),
  reject: (id: string) => post<Action>(`/actions/${id}/reject`),
  activity: () => call<ActivityEntry[]>('/activity'),
  boardroom: (topic?: string) => post<BoardroomResult>('/boardroom', { topic }),
  ask: (cfo: CfoId, question: string) => post<{ text: string }>('/ask', { cfo, question }),
  invoices: () => call<Invoice[]>('/ksef/invoices'),
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

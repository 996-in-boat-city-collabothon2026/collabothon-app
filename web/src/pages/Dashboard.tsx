// STARTER — Pair 3 polishes. Shows health, forecast, and the three clearly separated agent sections.
import { useState } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { ActionCard, Card, Status, fmtPLN } from '../components/ui';
import { useT } from '../i18n';

const SECTIONS: Tier[] = ['ANALYSED', 'RECOMMENDED', 'NEEDS_APPROVAL'];

export default function Dashboard() {
  const { t } = useT();
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(30));
  const actions = useApi(() => api.actions());
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const reloadAll = () => Promise.all([state.reload(), forecast.reload(), actions.reload()]);

  async function runCheck() {
    setRunning(true);
    try {
      setLog((await api.runAutopilot()).log);
      await reloadAll();
    } finally {
      setRunning(false);
    }
  }

  async function decide(a: Action, approve: boolean) {
    await (approve ? api.approve(a.id) : api.reject(a.id));
    await reloadAll();
  }

  const k = state.data?.kpis;
  const f = forecast.data;
  return (
    <div className="space-y-4">
      <Status loading={state.loading && !state.data} error={state.error} />
      {k && f && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><p className="text-sm text-slate-500">{t('balance')}</p><p className="text-2xl font-bold">{fmtPLN(k.balancePLN)}</p></Card>
          <Card>
            <p className="text-sm text-slate-500">{t('lowest_30')}</p>
            <p className={`text-2xl font-bold ${f.lowest.balancePLN < f.bufferPLN ? 'text-rose-600' : ''}`}>{fmtPLN(f.lowest.balancePLN)}</p>
            <p className="text-sm text-slate-500">{f.lowest.date}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">{t('next_deadline')}</p>
            <p className="font-semibold">{k.nextDeadline?.label ?? '—'}</p>
            {k.nextDeadline && <p className="text-sm text-slate-500">{fmtPLN(k.nextDeadline.amountPLN)} · {k.nextDeadline.date}</p>}
          </Card>
        </div>
      )}

      {f && (
        <Card title="Cash forecast · 30 days">
          <div className="h-48">
            <ResponsiveContainer>
              <AreaChart data={f.points}>
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                <YAxis width={60} fontSize={12} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmtPLN(Number(v))} />
                <ReferenceLine y={f.bufferPLN} stroke="#e11d48" strokeDasharray="4 4" />
                <Area type="stepAfter" dataKey="balancePLN" stroke="#0f172a" fill="#cbd5e1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <button onClick={runCheck} disabled={running}
        className="w-full rounded-2xl bg-slate-900 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {running ? '…' : `▶ ${t('run_check')}`}
      </button>
      {log.length > 0 && <Card><ul className="space-y-1 text-sm">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>}

      <div className="grid gap-4 lg:grid-cols-3">
        {SECTIONS.map((tier) => {
          const items = (actions.data ?? []).filter((a) => a.tier === tier);
          return (
            <Card key={tier} title={t(`tier_${tier}`)}>
              {items.length === 0 && <p className="text-sm text-slate-500">{t('nothing_here')}</p>}
              <div className="space-y-2">
                {items.map((a) => (
                  <ActionCard key={a.id} action={a} onApprove={() => decide(a, true)} onReject={() => decide(a, false)} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

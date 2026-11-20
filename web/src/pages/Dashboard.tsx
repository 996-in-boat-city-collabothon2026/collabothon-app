// Dashboard: balance, expenses pie, cash forecast 30/60/90, and what the agents found.
// The UI computes nothing: every number comes from the API.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, ExpenseCategory, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { ActionCard, Card, Status, fmtPLN } from '../components/ui';
import { useT } from '../i18n';

const SECTIONS: Tier[] = ['ANALYSED', 'RECOMMENDED', 'NEEDS_APPROVAL'];
const TIER_ICON: Record<Tier, string> = { ANALYSED: '🔍', RECOMMENDED: '💡', NEEDS_APPROVAL: '✋' };
const RANGES =[30, 60, 90] as const;
const CAT_COLOR: Record<ExpenseCategory, string> = {
  payroll: '#2563eb', taxes: '#dc2626', parts: '#d97706', rent: '#7c3aed',
  utilities: '#0891b2', leasing: '#059669', other: '#94a3b8',
};
const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export default function Dashboard() {
  const { t } = useT();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(days), [days]);
  const expenses = useApi(() => api.expenses(30));
  const actions = useApi(() => api.actions());
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const reloadAll = () => Promise.all([state.reload(), forecast.reload(), expenses.reload(), actions.reload()]);

  async function runCheck() {
    setRunning(true);
    try {
      setLog((await api.runAutopilot()).log);
      await reloadAll();
    } catch (e) {
      setLog([`⚠️ ${(e as Error).message}`]);
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
  const ex = expenses.data;
  return (
    <div className="space-y-4">
      <Status loading={state.loading && !state.data} error={state.error} />

      {/* Balance + quick facts */}
      {k && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-slate-500">{t('balance')}</p>
            <p className="text-3xl font-bold">{fmtPLN(k.balancePLN)}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">{t('lowest')} ({days} {t('days')})</p>
            {f ? (
              <>
                <p className={`text-2xl font-bold ${f.lowest.balancePLN < f.bufferPLN ? 'text-rose-600' : ''}`}>{fmtPLN(f.lowest.balancePLN)}</p>
                <p className="text-sm text-slate-500">{ddmm(f.lowest.date)}</p>
              </>
            ) : <p className="text-slate-500">—</p>}
          </Card>
          <Card>
            <p className="text-sm text-slate-500">{t('next_deadline')}</p>
            <p className="font-semibold">{k.nextDeadline?.label ?? '—'}</p>
            {k.nextDeadline && <p className="text-sm text-slate-500">{fmtPLN(k.nextDeadline.amountPLN)} · {ddmm(k.nextDeadline.date)}</p>}
          </Card>
        </div>
      )}

      <Link to="/ksef" className="flex min-h-12 items-center justify-center rounded-2xl bg-white py-3 text-lg font-semibold shadow-sm">
        🧾 {t('invoices')}
      </Link>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expenses pie */}
        <Card title={t('expenses_30')}>
          <Status loading={expenses.loading && !ex} error={expenses.error} />
          {ex && ex.byCategory.length === 0 && <p className="text-sm text-slate-500">{t('nothing_here')}</p>}
          {ex && ex.byCategory.length > 0 && (
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={ex.byCategory} dataKey="amountPLN" nameKey="category" innerRadius="55%" outerRadius="100%" paddingAngle={1}>
                      {ex.byCategory.map((c) => <Cell key={c.category} fill={CAT_COLOR[c.category]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmtPLN(Number(v)), t(`cat_${n}`)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-1 text-sm">
                {ex.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.category] }} />
                    <span className="flex-1">{t(`cat_${c.category}`)}</span>
                    <span className="font-medium">{fmtPLN(c.amountPLN)}</span>
                    <span className="w-10 text-right text-slate-500">{Math.round(c.share * 100)}%</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>{t('total')}</span><span>{fmtPLN(ex.totalPLN)}</span>
                </li>
              </ul>
            </div>
          )}
        </Card>

        {/* Cash forecast */}
        <Card title={
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t('forecast_title')}
            <span className="flex gap-1" role="group">
              {RANGES.map((r) => (
                <button key={r} onClick={() => setDays(r)} aria-pressed={days === r}
                  className={`min-h-11 min-w-11 rounded-lg px-2 text-sm ${days === r ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>
                  {r} {t('days')}
                </button>
              ))}
            </span>
          </span>
        }>
          <Status loading={forecast.loading && !f} error={forecast.error} />
          {f && (
            <>
              <div className="h-48">
                <ResponsiveContainer>
                  <AreaChart data={f.points}>
                    <XAxis dataKey="date" tickFormatter={ddmm} fontSize={12} minTickGap={20} />
                    <YAxis width={44} fontSize={12} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v) => fmtPLN(Number(v))} labelFormatter={(d) => ddmm(String(d))} />
                    <ReferenceLine y={f.bufferPLN} stroke="#e11d48" strokeDasharray="4 4" />
                    <Area type="stepAfter" dataKey="balancePLN" stroke="#0f172a" fill="#cbd5e1" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-sm text-rose-700">┄ {t('buffer')}: {fmtPLN(f.bufferPLN)}</p>
            </>
          )}
        </Card>
      </div>

      <button onClick={runCheck} disabled={running}
        className="min-h-12 w-full rounded-2xl bg-slate-900 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {running ? '…' : `▶ ${t('run_check')}`}
      </button>
      {log.length > 0 && <Card><ul className="space-y-1 text-sm">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>}

      {/* What the agents found, split by tier */}
      <h2 className="text-xl font-bold">{t('agents_found')}</h2>
      <Status loading={actions.loading && !actions.data} error={actions.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        {SECTIONS.map((tier) => {
          const items = (actions.data ?? []).filter((a) => a.tier === tier);
          return (
            <Card key={tier} title={`${TIER_ICON[tier]} ${t(`tier_${tier}`)}`}>
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

// Dashboard in the "fintech overview" layout: big title + range pill, a wide chart card with KPIs and an
// inline question box, a balance card with category bars, then three small cards and the agents' findings.
// Readable for every age. The UI computes nothing: every number comes from the API.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Cell, Label, Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, ExpenseCategory, Forecast, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { TypingDots } from '../components/AskBubble';
import AgentHub from '../components/AgentHub';
import { ActionCard, PageHeader, useCountUp, Status, fmtDay, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';

const RANGES = [30, 60, 90] as const;
const PRIORITY: Record<Tier, number> = { NEEDS_APPROVAL: 0, RECOMMENDED: 1, ANALYSED: 2 };
const CAT_COLOR: Record<ExpenseCategory, string> = {
  payroll: '#2563eb', taxes: '#db2777', parts: '#16a34a', rent: '#d97706',
  leasing: '#7c3aed', utilities: '#0891b2', other: '#78716c',
};

export default function Dashboard() {
  const { t } = useT();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(days), [days]);
  const expenses = useApi(() => api.expenses(30));
  const actions = useApi(() => api.actions('open'));
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const { toast, showToast } = useToast();

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
    try {
      await (approve ? api.approve(a.id) : api.reject(a.id));
      showToast(`${t(approve ? 'approved_toast' : 'rejected_toast')} ${a.title}`);
    } catch {
      showToast(t('decision_failed'));
    }
    await reloadAll();
  }

  const s = state.data;
  const k = s?.kpis;
  const f = forecast.data;
  const ex = expenses.data;
  const open = [...(actions.data ?? [])].sort((a, b) => PRIORITY[a.tier] - PRIORITY[b.tier]);
  const count = (tier: Tier) => open.filter((a) => a.tier === tier).length;
  const shownBalance = useCountUp(k?.balancePLN);

  // One plain sentence about the money (comparison only – the numbers come from the rules engine).
  let verdict: { tone: 'ok' | 'warn' | 'bad'; text: string } | null = null;
  if (f) {
    if (f.lowest.balancePLN < 0) verdict = { tone: 'bad', text: `${t('verdict_short')} ${fmtDay(f.lowest.date)} (${fmtPLN(f.lowest.balancePLN)}).` };
    else if (f.lowest.balancePLN < f.bufferPLN) verdict = { tone: 'warn', text: `${t('verdict_low')} ${fmtDay(f.lowest.date)}.` };
    else verdict = { tone: 'ok', text: t('verdict_ok') };
  }

  return (
    <div className="space-y-10">
      <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-sm font-medium">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-xs" aria-hidden="true">⚡</span>
        {t('agents_on_watch')}
      </span>
      <PageHeader title={t('dashboard')}>
        <span className="flex flex-wrap items-center gap-2">
        <Link to="/ksef" className="inline-flex min-h-12 items-center gap-3 rounded-full bg-stone-950 px-6 font-semibold text-white hover:bg-stone-800">
          🧾 {t('invoices')} <span aria-hidden="true">↗</span>
        </Link>
        <span className="flex items-center gap-1 rounded-full border border-black/10 bg-white p-1" role="group" aria-label={t('forecast_title')}>
          {s && <span className="hidden px-3 text-sm font-medium sm:inline">{t('today')} {fmtDay(s.shop.today)}</span>}
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)} aria-pressed={days === r}
              className={`min-h-12 rounded-full px-4 text-sm font-semibold ${days === r ? 'bg-black/[0.07] text-stone-900' : 'text-stone-700'}`}>
              {r} {t('days')}
            </button>
          ))}
        </span>
        </span>
      </PageHeader>

      <Status loading={state.loading && !s} error={state.error} />

      {/* Row 1: the balance, then the cash forecast. One message per card. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_1.7fr]">
        <section className="surface glow-mint flex flex-col justify-center p-8">
          <h2 className="text-xl font-semibold">{t('you_have')}</h2>
          {k && <p className="mt-3 text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl" aria-label={fmtPLN(k.balancePLN)}>{fmtPLN(shownBalance ?? k.balancePLN)}</p>}
          {s && <p className="mt-4 text-lg text-stone-800">{t('today')} {fmtDay(s.shop.today)}</p>}
        </section>

        <section className="surface min-w-0 p-8">
          <h2 className="text-xl font-semibold">{t('forecast_title')}</h2>
          <Status loading={forecast.loading && !f} error={forecast.error} />
          {verdict && (
            <p className={`mt-3 text-2xl font-bold leading-snug ${verdict.tone === 'ok' ? 'text-emerald-800' : verdict.tone === 'warn' ? 'text-amber-800' : 'text-rose-700'}`}>
              {verdict.tone === 'ok' ? '✓' : '⚠'} {verdict.text}
            </p>
          )}
          {f && <CashChart f={f} />}
        </section>
      </div>

      {/* Row 2: expenses donut + two simple facts */}
      <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
        <section className="surface p-8">
          <h2 className="text-xl font-semibold">{t('expenses_30')}</h2>
          <Status loading={expenses.loading && !ex} error={expenses.error} />
          {ex && ex.byCategory.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row">
              <div className="relative h-56 w-56 shrink-0" role="img" aria-label={`${t('expenses_30')}: ${fmtPLN(ex.totalPLN)}`}>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-lg text-stone-800">{t('total')}</span>
                  <strong className="text-xl tabular-nums">{fmtPLN(ex.totalPLN)}</strong>
                </div>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={ex.byCategory} dataKey="amountPLN" nameKey="category" innerRadius="64%" outerRadius="100%"
                      paddingAngle={2} cornerRadius={6} stroke="none" isAnimationActive={false}>
                      {ex.byCategory.map((c) => <Cell key={c.category} fill={CAT_COLOR[c.category]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-3 text-lg">
                {ex.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.category] }} aria-hidden="true" />
                      {t(`cat_${c.category}`)}
                    </span>
                    <span className="font-semibold tabular-nums">{fmtPLN(c.amountPLN)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="grid gap-8">
          <section className="surface p-8">
            <h2 className="text-xl font-semibold">{t('next_deadline')}</h2>
            {k?.nextDeadline ? (
              <>
                <p className="mt-3 text-4xl font-bold tracking-tight tabular-nums">{fmtPLN(k.nextDeadline.amountPLN)}</p>
                <p className="mt-2 text-lg text-stone-800">{k.nextDeadline.label} · {fmtDay(k.nextDeadline.date)}</p>
              </>
            ) : <p className="mt-3 text-lg text-stone-800">—</p>}
          </section>

          <Link to="/approvals" className="surface block p-8 hover:ring-2 hover:ring-emerald-600">
            <h2 className="text-xl font-semibold">{t('waiting_for_you')}</h2>
            <p className="mt-3 text-6xl font-bold leading-none tracking-tight">{actions.data ? count('NEEDS_APPROVAL') : '…'}</p>
            <p className="mt-3 text-lg font-semibold text-emerald-700">{t('see_all')} →</p>
          </Link>
        </div>
      </div>

      {/* The AI team: 4 agents connected to the data sources */}
      <section className="surface glow-mint grid items-center gap-6 p-8 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight"><span className="text-gradient">{t('hub_title')}</span></h2>
          <p className="mt-3 text-lg text-stone-800">{t('hub_text')}</p>
        </div>
        <AgentHub />
      </section>

      {/* What the agents found – the 3 most important, approvals first */}
      <section className="space-y-4 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{t('agents_found')}</h2>
            <p className="text-stone-700">🔍 {t('legend_analysed')} · 💡 {t('legend_recommended')} · ✋ {t('legend_approval')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runCheck} disabled={running}
              className="inline-flex min-h-12 items-center gap-3 rounded-full bg-stone-950 px-6 font-semibold text-white hover:bg-stone-800 disabled:opacity-60">
              {running ? t('checking') : t('run_check')} <span aria-hidden="true">↗</span>
            </button>
            {open.length > 3 && (
              <Link to="/approvals" className="inline-flex min-h-12 items-center gap-3 rounded-full border border-black/10 bg-white px-6 font-semibold">
                {t('see_all')} ({open.length}) <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </div>
        {running && <p className="flex items-center gap-3 text-stone-700" aria-live="polite"><TypingDots /> <span className="ai-shimmer font-semibold">{t('agents_working')}</span></p>}
        {log.length > 0 && (
          <div className="surface p-6"><ul className="space-y-1 text-stone-700">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        )}
        <Status loading={actions.loading && !actions.data} error={actions.error} />
        {actions.data && open.length === 0 && (
          <p className="surface p-6 text-center text-lg text-stone-700">{t('all_quiet')}</p>
        )}
        <div className="grid gap-6 lg:grid-cols-3">
          {open.slice(0, 3).map((a) => (
            <div key={a.id} className="surface p-1">
              <ActionCard action={a} onApprove={() => void decide(a, true)} onReject={() => void decide(a, false)} />
            </div>
          ))}
        </div>
      </section>
      {toast}
    </div>
  );
}

// ---------- small pieces ----------
/** Big, simple cash line: blue above zero, red below, dashed safety buffer, the lowest day labelled on the chart. */
function CashChart({ f }: { f: Forecast }) {
  const { t } = useT();
  const pts = f.points;
  const values = pts.map((p) => p.balancePLN);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const zeroAt = max === min ? 1 : max / (max - min); // where 0 sits in the gradient (0 = top, 1 = bottom)
  const xTicks = [pts[0]?.date, pts[Math.floor(pts.length / 2)]?.date, pts[pts.length - 1]?.date].filter(Boolean) as string[];
  const yTicks = [...new Set([Math.round(min / 10000) * 10000, 0, Math.round(max / 10000) * 10000])];
  const tys = (v: number) => (v === 0 ? '0 zł' : `${Math.round(v / 1000)} tys. zł`);
  return (
    <div className="mt-6 h-80" role="img"
      aria-label={`${t('forecast_title')}: ${t('lowest_point')} ${fmtPLN(f.lowest.balancePLN)}, ${fmtDay(f.lowest.date)}`}>
      <ResponsiveContainer>
        <AreaChart data={pts} margin={{ top: 16, right: 30, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#059669" stopOpacity={0.2} />
              <stop offset={zeroAt} stopColor="#059669" stopOpacity={0.05} />
              <stop offset={zeroAt} stopColor="#e11d48" stopOpacity={0.15} />
              <stop offset={1} stopColor="#e11d48" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="cashLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset={zeroAt} stopColor="#059669" />
              <stop offset={zeroAt} stopColor="#e11d48" />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" ticks={xTicks} interval={0} tickFormatter={fmtDay} fontSize={18} fontWeight={600}
            tickLine={false} axisLine={false} stroke="#1d1d1f" dy={8} />
          <YAxis width={88} fontSize={18} ticks={yTicks} tickFormatter={tys} tickLine={false} axisLine={false} stroke="#1d1d1f" />
          <Tooltip formatter={(v) => [fmtPLN(Number(v)), t('balance')]} labelFormatter={(d) => fmtDay(String(d))}
            contentStyle={{ borderRadius: 16, border: '1px solid rgb(0 0 0 / 0.1)', fontSize: 18 }} />
          <ReferenceLine y={0} stroke="#1d1d1f" strokeWidth={2} />
          <ReferenceLine y={f.bufferPLN} stroke="#e11d48" strokeDasharray="8 6" strokeWidth={2}>
            <Label value={`${t('buffer')} ${tys(f.bufferPLN)}`} position="insideTopRight" fontSize={16} fontWeight={600} fill="#be123c" />
          </ReferenceLine>
          <Area type="stepAfter" dataKey="balancePLN" stroke="url(#cashLine)" strokeWidth={5} fill="url(#cashFill)" isAnimationActive={false} />
          <ReferenceDot x={f.lowest.date} y={f.lowest.balancePLN} r={9} fill="#e11d48" stroke="#fff" strokeWidth={3}>
            <Label value={`${t('lowest_point')} ${fmtDay(f.lowest.date)}`} position="left" fontSize={18} fontWeight={700} fill="#be123c" offset={14} />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

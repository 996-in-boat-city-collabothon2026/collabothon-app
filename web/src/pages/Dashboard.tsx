// Dashboard in the "fintech overview" layout: big title + range pill, a wide chart card with KPIs and an
// inline question box, a balance card with category bars, then three small cards and the agents' findings.
// Readable for every age. The UI computes nothing: every number comes from the API.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, AskResult, ExpenseCategory, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { TypingDots } from '../components/AskBubble';
import { ActionCard, CfoAvatar, PageHeader, Status, fmtDay, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';

const RANGES = [30, 60, 90] as const;
const PRIORITY: Record<Tier, number> = { NEEDS_APPROVAL: 0, RECOMMENDED: 1, ANALYSED: 2 };
const CAT_COLOR: Record<ExpenseCategory, string> = {
  payroll: '#2563eb', taxes: '#db2777', parts: '#16a34a', rent: '#d97706',
  leasing: '#7c3aed', utilities: '#0891b2', other: '#78716c',
};
const TIER_DOT: Record<Tier, string> = { ANALYSED: '#78716c', RECOMMENDED: '#d97706', NEEDS_APPROVAL: '#16a34a' };
const TIER_ICON: Record<Tier, string> = { ANALYSED: '🔍', RECOMMENDED: '💡', NEEDS_APPROVAL: '✋' };

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
  const biggest = ex?.byCategory[0];

  // One plain sentence about the money (comparison only – the numbers come from the rules engine).
  let verdict: { tone: 'ok' | 'warn' | 'bad'; text: string } | null = null;
  if (f) {
    if (f.lowest.balancePLN < 0) verdict = { tone: 'bad', text: `${t('verdict_short')} ${fmtDay(f.lowest.date)} (${fmtPLN(f.lowest.balancePLN)}).` };
    else if (f.lowest.balancePLN < f.bufferPLN) verdict = { tone: 'warn', text: `${t('verdict_low')} ${fmtDay(f.lowest.date)}.` };
    else verdict = { tone: 'ok', text: t('verdict_ok') };
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard')}>
        <span className="flex flex-wrap items-center gap-2">
        <Link to="/ksef" className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#0071e3] px-6 font-semibold text-white hover:bg-[#0077ed]">
          🧾 {t('invoices')} <span aria-hidden="true">→</span>
        </Link>
        <span className="flex items-center gap-1 rounded-full bg-black/[0.06] p-1" role="group" aria-label={t('forecast_title')}>
          {s && <span className="hidden px-3 text-sm font-medium sm:inline">● {t('today')} {fmtDay(s.shop.today)}</span>}
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)} aria-pressed={days === r}
              className={`min-h-12 rounded-full px-4 text-sm font-semibold ${days === r ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-700'}`}>
              {r} {t('days')}
            </button>
          ))}
        </span>
        </span>
      </PageHeader>

      <Status loading={state.loading && !s} error={state.error} />

      {/* Row 1: wide chart card + balance card */}
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <section className="surface min-w-0 p-6">
          <h2 className="text-lg font-semibold">{t('forecast_title')}</h2>
          {k && (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
              <Kpi label={t('balance')} value={fmtPLN(k.balancePLN)} />
              <Kpi label={t('kpi_receivables')} value={fmtPLN(k.receivablesPLN)} />
              <Kpi label={t('kpi_overdue')} value={fmtPLN(k.overdueReceivablesPLN)} bad={k.overdueReceivablesPLN > 0} />
              <Kpi label={t('kpi_payables')} value={fmtPLN(k.payablesPLN)} />
              <Kpi label={t('kpi_fx')} value={fmtPLN(k.fxExposurePLN)} />
            </dl>
          )}
          <Status loading={forecast.loading && !f} error={forecast.error} />
          {f && (
            <>
              <div className="mt-6 h-60" role="img" aria-label={`${t('forecast_title')}: ${t('lowest')} ${fmtPLN(f.lowest.balancePLN)} ${fmtDay(f.lowest.date)}`}>
                <ResponsiveContainer>
                  <BarChart data={f.points} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
                    <defs>
                      <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                        <rect width="6" height="6" fill="#dbeafe" />
                        <line x1="0" y1="0" x2="0" y2="6" stroke="#60a5fa" strokeWidth="2.5" />
                      </pattern>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={13} minTickGap={28} tickLine={false} axisLine={false} stroke="#57534e" />
                    <YAxis width={46} fontSize={13} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} stroke="#57534e" />
                    <Tooltip cursor={{ fill: '#f4f4f5' }} formatter={(v) => [fmtPLN(Number(v)), t('balance')]} labelFormatter={(d) => fmtDay(String(d))}
                      contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)', fontSize: 15 }} />
                    <ReferenceLine y={0} stroke="#d6d3d1" />
                    <ReferenceLine y={f.bufferPLN} stroke="#be123c" strokeDasharray="5 5" />
                    <Bar dataKey="balancePLN" radius={[6, 6, 6, 6]} isAnimationActive={false}>
                      {f.points.map((p) => (
                        <Cell key={p.date} fill={p.date === f.lowest.date ? '#1d4ed8' : p.balancePLN < 0 ? '#fda4af' : 'url(#hatch)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-sm text-rose-700">┄ {t('buffer')}: {fmtPLN(f.bufferPLN)}</p>
            </>
          )}
          <AskInline />
        </section>

        <section className="surface order-first flex flex-col p-6 lg:order-none">
          <h2 className="text-lg font-semibold">{t('you_have')}</h2>
          {k && <p className="mt-2 text-5xl font-bold leading-none tracking-tight tabular-nums">{fmtPLN(k.balancePLN)}</p>}
          {verdict && (
            <p className={`mt-4 text-lg leading-snug ${verdict.tone === 'ok' ? 'text-emerald-800' : verdict.tone === 'warn' ? 'text-amber-800' : 'text-rose-700'}`}>
              {verdict.tone === 'ok' ? '✓' : '⚠'} {verdict.text}
            </p>
          )}
          <h3 className="mt-8 font-semibold">{t('expenses_30')}</h3>
          <Status loading={expenses.loading && !ex} error={expenses.error} />
          {ex && ex.byCategory.length > 0 && (
            <div className="relative mx-auto mt-4 h-52 w-52" role="img" aria-label={`${t('expenses_30')}: ${fmtPLN(ex.totalPLN)}`}>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-sm font-medium text-stone-700">{t('total')}</span>
                <strong className="text-lg tabular-nums">{fmtPLN(ex.totalPLN)}</strong>
              </div>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={ex.byCategory} dataKey="amountPLN" nameKey="category" innerRadius="66%" outerRadius="100%"
                    paddingAngle={2} cornerRadius={6} stroke="none" isAnimationActive={false}>
                    {ex.byCategory.map((c) => <Cell key={c.category} fill={CAT_COLOR[c.category]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [fmtPLN(Number(v)), t(`cat_${n}`)]}
                    contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)', fontSize: 15 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {ex && (
            <ul className="mt-5 space-y-3">
              {ex.byCategory.map((c) => (
                <li key={c.category}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: CAT_COLOR[c.category] }} aria-hidden="true" />
                      {t(`cat_${c.category}`)}
                    </span>
                    <span className="font-semibold tabular-nums">{fmtPLN(c.amountPLN)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-zinc-100">
                    <div className="h-2 rounded-full" style={{ width: `${Math.round(c.share * 100)}%`, background: CAT_COLOR[c.category] }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Row 2: three small cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <section className="surface p-6">
          <h2 className="text-lg font-semibold">{t('next_deadline')}</h2>
          {k?.nextDeadline ? (
            <>
              <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{fmtPLN(k.nextDeadline.amountPLN)}</p>
              <p className="mt-1 text-stone-700">{k.nextDeadline.label} · {fmtDay(k.nextDeadline.date)}</p>
            </>
          ) : <p className="mt-2 text-stone-700">—</p>}
          {f && (
            <div className="mt-4 h-20" aria-hidden="true">
              <ResponsiveContainer>
                <LineChart data={f.points}>
                  <Line type="stepAfter" dataKey="balancePLN" stroke="#db2777" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <Link to="/approvals" className="surface block p-6 hover:ring-2 hover:ring-stone-900">
          <h2 className="text-lg font-semibold">{t('waiting_for_you')}</h2>
          <p className="mt-2 text-6xl font-bold leading-none tracking-tight">{actions.data ? count('NEEDS_APPROVAL') : '…'}</p>
          <ul className="mt-4 space-y-2">
            {(['NEEDS_APPROVAL', 'RECOMMENDED', 'ANALYSED'] as Tier[]).map((tier) => (
              <li key={tier} className="flex items-center gap-3">
                <span className="w-7" aria-hidden="true">{TIER_ICON[tier]}</span>
                <span className="flex flex-1 flex-wrap gap-1" aria-hidden="true">
                  {Array.from({ length: count(tier) }, (_, i) => (
                    <span key={i} className="h-3.5 w-3.5 rounded-full" style={{ background: TIER_DOT[tier] }} />
                  ))}
                  {count(tier) === 0 && <span className="h-3.5 w-3.5 rounded-full bg-zinc-200" />}
                </span>
                <span className="font-semibold tabular-nums">{count(tier)} <span className="sr-only">{t(`tier_${tier}`)}</span></span>
              </li>
            ))}
          </ul>
        </Link>

        <section className="rounded-[1.75rem] bg-gradient-to-br from-sky-100 via-white to-emerald-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t('biggest_cost')}</h2>
          {biggest ? (
            <>
              <p className="mt-2 text-6xl font-bold leading-none tracking-tight">{Math.round(biggest.share * 100)}%</p>
              <p className="mt-2 text-lg">{t(`cat_${biggest.category}`)} · <strong className="tabular-nums">{fmtPLN(biggest.amountPLN)}</strong></p>
              <p className="mt-1 text-stone-700">{t('of_expenses_30')}</p>
            </>
          ) : <p className="mt-2 text-stone-700">—</p>}
        </section>
      </div>

      {/* What the agents found – the 3 most important, approvals first */}
      <section className="space-y-4 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{t('agents_found')}</h2>
            <p className="text-stone-700">🔍 {t('legend_analysed')} · 💡 {t('legend_recommended')} · ✋ {t('legend_approval')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runCheck} disabled={running}
              className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#0071e3] px-6 font-semibold text-white hover:bg-[#0077ed] disabled:opacity-60">
              {running ? t('checking') : t('run_check')} <span aria-hidden="true">→</span>
            </button>
            {open.length > 3 && (
              <Link to="/approvals" className="inline-flex min-h-12 items-center gap-3 rounded-full bg-white px-6 font-semibold shadow-sm">
                {t('see_all')} ({open.length}) <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </div>
        {running && <p className="flex items-center gap-3 text-stone-700" aria-live="polite"><TypingDots /> {t('agents_working')}</p>}
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
function Kpi({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-stone-700">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums ${bad ? 'text-rose-700' : ''}`}>{value}</dd>
    </div>
  );
}

/** "What would you like to ask?" box right under the chart. Same /ask endpoint as the 💬 bubble. */
function AskInline() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [error, setError] = useState(false);

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(false);
    try {
      setAnswer(await api.ask(q.trim()));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-3xl bg-zinc-100 p-2">
      <form onSubmit={ask} className="flex items-center gap-2">
        <label className="sr-only" htmlFor="ask-inline">{t('ask_inline')}</label>
        <input id="ask-inline" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ask_inline')}
          className="min-h-12 min-w-0 flex-1 rounded-full bg-white px-5 text-base placeholder:text-stone-600" />
        <button disabled={busy || !q.trim()} aria-label={t('ask_title')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0071e3] text-xl text-white disabled:opacity-40">→</button>
      </form>
      {(busy || answer || error) && (
        <div className="flex items-start gap-3 p-3" aria-live="polite">
          {busy && <><TypingDots /> <span className="text-stone-700">{t('ask_typing')}</span></>}
          {!busy && error && <p className="text-rose-700">{t('ask_error')}</p>}
          {!busy && !error && answer && <><CfoAvatar cfo={answer.cfo} size={36} /><p className="pt-1">{answer.text}</p></>}
        </div>
      )}
    </div>
  );
}

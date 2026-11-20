// Dashboard in the "fintech overview" layout: big title + range pill, a wide chart card with KPIs and an
// inline question box, a balance card with category bars, then three small cards and the agents' findings.
// Readable for every age. The UI computes nothing: every number comes from the API.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Cell, Label, Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, CfoId, ExpenseCategory, Forecast, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { TypingDots } from '../components/AskBubble';
import { ActionCard, CfoAvatar, PageHeader, Status, fmtDay, fmtPLN, useToast } from '../components/ui';
import { DEMO_AFFORD, DEMO_CASH, DEMO_MOVES, DEMO_RULES, DEMO_TOP_DEBTOR, DEMO_AGING, DEMO_BREAKEVEN, DEMO_MONEY_LINES, DEMO_MONTH, DEMO_REFRESHED_AT, DEMO_REFS, DEMO_REVENUE, DEMO_REVIEW, DEMO_SERVICES, DEMO_WEEK, type Period, type Source } from '../lib/kpiDemo';
import { useT } from '../i18n';
import { GLOSSARY } from '../lib/glossary';
import Icon from '../components/Icon';

const RANGES = [30, 60, 90] as const;
const PRIORITY: Record<Tier, number> = { NEEDS_APPROVAL: 0, RECOMMENDED: 1, ANALYSED: 2 };
// One accent in tints + greys: the biggest costs are the strongest colour.
const CAT_COLOR: Record<ExpenseCategory, string> = {
  payroll: '#0F5132', taxes: '#141414', parts: '#4E8A6B', rent: '#6b6b6b',
  leasing: '#A9CDB9', utilities: '#a3a3a3', other: '#d4d4d4',
};

export default function Dashboard() {
  const { t, lang } = useT();
  const [view, setView] = useState<Period>('review');
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(days), [days]);
  const forecast90 = useApi(() => api.forecast(90)); // 13 weeks: the lowest point matters, not the month end
  const f90 = forecast90.data;
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
      setLog([(e as Error).message]);
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

  // One plain sentence about the money (comparison only – the numbers come from the rules engine).
  let verdict: { tone: 'ok' | 'warn'; text: string } | null = null;
  if (f) {
    if (f.lowest.balancePLN < 0) verdict = { tone: 'warn', text: `${t('verdict_short')} ${fmtDay(f.lowest.date)} (${fmtPLN(f.lowest.balancePLN)}).` };
    else if (f.lowest.balancePLN < f.bufferPLN) verdict = { tone: 'warn', text: `${t('verdict_low')} ${fmtDay(f.lowest.date)}.` };
    else verdict = { tone: 'ok', text: t('verdict_ok') };
  }
  const L = lang === 'pl' ? 'pl' : 'en';
  const revKey = view === 'month' ? 'month' : 'week';
  const rev = DEMO_REVENUE[revKey];

  return (
    <div className="space-y-5">
      <PageHeader title={t('dashboard')}>
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/report" className="no-print inline-flex min-h-12 items-center gap-2 rounded-full border border-black/15 bg-white px-5 text-base font-semibold hover:bg-zinc-100">
            <Icon name="receipt" size={18} /> {t('print_a4')}
          </Link>
          <Link to="/ksef" className="no-print inline-flex min-h-12 items-center gap-3 rounded-full bg-accent px-6 text-lg font-bold text-white hover:brightness-95">
            <Icon name="receipt" /> {t('invoices')} <Icon name="arrow-up-right" size={18} />
          </Link>
          <span className="no-print grid w-full grid-cols-3 items-center gap-1 rounded-2xl border border-black/10 bg-white p-1 sm:flex sm:w-auto sm:rounded-full" role="group" aria-label={t('kpi_view')}>
            {(['review', 'week', 'month'] as Period[]).map((p) => (
              <button key={p} onClick={() => setView(p)} aria-pressed={view === p}
                className={`min-h-12 rounded-full px-3 text-base font-semibold sm:px-5 ${view === p ? 'bg-ink text-white' : 'text-stone-700 hover:bg-zinc-100'}`}>
                <span className="sm:hidden">{t(p === 'review' ? 'view_review_short' : p === 'week' ? 'view_week' : 'view_month')}</span>
                <span className="hidden sm:inline">{t(p === 'review' ? 'view_review' : p === 'week' ? 'view_week' : 'view_month')}</span>
              </button>
            ))}
          </span>
        </span>
      </PageHeader>
      <p className="-mt-2 text-[15px] text-stone-700">
        {t('refreshed_at')} <span className="tabular-nums">{s ? `${fmtDay(s.shop.today)}, ` : ''}{DEMO_REFRESHED_AT}</span>
      </p>

      <Status loading={state.loading && !s} error={state.error} />

      {/* ---------- Monday review: the 3 things that matter ---------- */}
      {view === 'review' && (
        <>
          {/* 1. One sentence about the money, in large type */}
          <section className={`surface p-6 ${f90 && f90.lowest.balancePLN < 0 ? 'border-warn/40 bg-warn-soft' : ''}`} aria-live="polite">
            {f90 ? (
              f90.lowest.balancePLN < 0 ? (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-3xl font-bold leading-tight text-warn sm:text-5xl">
                  <WarnMark />
                  {L === 'pl'
                    ? `${fmtDay(f90.lowest.date)} może zabraknąć ${fmtPLN(Math.abs(f90.lowest.balancePLN))}`
                    : `On ${fmtDay(f90.lowest.date)} you may be short by ${fmtPLN(Math.abs(f90.lowest.balancePLN))}`}
                </p>
              ) : (
                <p className="text-3xl font-bold leading-tight text-accent-ink sm:text-5xl">{t('status_ok_13w')}</p>
              )
            ) : <div className="skeleton h-10 w-2/3" />}
            <p className="mt-2 text-lg text-stone-700">{t('status_sub')}</p>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            {/* 2. Where the money goes */}
            <section className="surface p-6">
              <h2 className="text-xl font-semibold">{t('where_money_goes')}</h2>
              <Status loading={expenses.loading && !ex} error={expenses.error} />
              {ex && ex.byCategory.length > 0 && (
                <>
                  <p className="mt-2 text-2xl font-bold leading-snug">
                    {L === 'pl'
                      ? `${t(`cat_${ex.byCategory[0].category}`)} to ${Math.round(ex.byCategory[0].share * 100)}% kosztów`
                      : `${t(`cat_${ex.byCategory[0].category}`)} are ${Math.round(ex.byCategory[0].share * 100)}% of costs`}
                  </p>
                  <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                    <div className="donut-in relative h-40 w-40 shrink-0" role="img" aria-label={`${t('where_money_goes')}: ${fmtPLN(ex.totalPLN)}`}>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-sm text-stone-700">{t('total_30d')}</span>
                        <strong className="text-xs tabular-nums">{fmtPLN(ex.totalPLN)}</strong>
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
                    <ul className="w-full space-y-3 text-[18px]">
                      {ex.byCategory.slice(0, 5).map((c) => (
                        <li key={c.category}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex items-center gap-2">
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.category] }} aria-hidden="true" />
                              {t(`cat_${c.category}`)}
                            </span>
                            <strong className="tabular-nums">{Math.round(c.share * 100)}%</strong>
                          </div>
                          <div className="mt-1 h-2.5 rounded-full bg-zinc-100" aria-hidden="true">
                            <div className="h-2.5 rounded-full" style={{ width: `${Math.round(c.share * 100)}%`, background: CAT_COLOR[c.category] }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <SourceTag source="ksef" />
                </>
              )}
            </section>

            {/* 3. Before the money runs out: the agents' moves */}
            <section className="surface flex flex-col p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">{t('before_runs_out')}</h2>
                <DemoTag />
              </div>
              <ol className="mt-3 flex-1 space-y-4">
                {DEMO_MOVES.map((m, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CfoAvatar cfo={m.owner} size={24} />
                    <div className="min-w-0 text-[18px] leading-snug">
                      <p><strong>{m.what[L]}</strong> <KindTag kind="ai" /></p>
                      <p className="text-stone-700">{m.effect[L]}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to="/approvals" className="mt-5 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-5 text-lg font-semibold text-white hover:bg-zinc-800">
                {DEMO_MOVES[0].action[L]} <span aria-hidden="true">→</span>
              </Link>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* 4. Free cash and how many days it lasts */}
            <section className="surface p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CfoAvatar cfo="anna" size={28} />
                  <h2 className="text-xl font-semibold">{t('kpi_free_cash')}</h2>
                </div>
                <DemoTag />
              </div>
              <Term id="cash" />
              <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-bold tracking-tight tabular-nums">{DEMO_CASH.freePLN[L]}</span>
                <KindTag kind="estimate" />
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-lg font-bold text-warn"><WarnMark />{DEMO_CASH.days[L]}</p>
              <p className="mt-2 text-[17px] text-stone-700">{t('free_cash_how')} {k ? fmtPLN(k.balancePLN) : '…'} − {DEMO_CASH.plannedPLN[L]}</p>
              <SourceTag source="bank" />
            </section>

            {/* 5. Upcoming payments and who owes us most */}
            <section className="surface p-6">
              <h2 className="text-xl font-semibold">{t('upcoming_payments')}</h2>
              <ul className="mt-3 divide-y divide-black/10 text-[18px]">
                {[
                  ...(k?.nextDeadline ? [{ date: fmtDay(k.nextDeadline.date), what: k.nextDeadline.label, amount: fmtPLN(k.nextDeadline.amountPLN) }] : []),
                  ...DEMO_CASH.payments.map((p) => ({ date: p.date, what: p.what[L], amount: p.amount })),
                ].sort((a, b) => a.date.split('.').reverse().join('').localeCompare(b.date.split('.').reverse().join(''))).map((p) => (
                  <li key={p.date + p.what} className="flex items-baseline justify-between gap-3 py-2">
                    <span><strong className="tabular-nums">{p.date}</strong> · {p.what}</span>
                    <strong className="tabular-nums">{p.amount}</strong>
                  </li>
                ))}
              </ul>
              <h3 className="mt-5 text-lg font-semibold">{t('owes_most')}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[18px]">
                {DEMO_TOP_DEBTOR.late && <WarnMark />}
                <span><strong>{DEMO_TOP_DEBTOR.name}</strong> – <strong className="tabular-nums">{DEMO_TOP_DEBTOR.amount}</strong>, {DEMO_TOP_DEBTOR.days[L]}</span>
              </p>
              <p className="mt-3 text-sm text-stone-600">{t('src_prefix')} KSeF, {t('src_rules')} · <span className="text-warn">{t('demo_data')}</span></p>
            </section>
          </div>

          {/* Lower down: actions, rules, money in short (profit, break-even, can I afford) */}
          <MoneyLines />
        </>
      )}

      {/* ---------- Week: 6 numbers, details on click ---------- */}
      {view === 'week' && (
        <>
          {/* 1. Cash first */}
          <h2 className="text-lg font-semibold uppercase tracking-wide text-stone-700">{t('row_cash')}</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <KpiCard term="cash" owner="anna" label={t('kpi_free_cash')} source="bank" demoRef
              value={DEMO_CASH.freePLN[L]} valueKind="estimate"
              note={`${t('free_cash_how')} ${k ? fmtPLN(k.balancePLN) : '…'} − ${DEMO_CASH.plannedPLN[L]}`}
              trend={DEMO_REFS.cash.trend[L]} why={DEMO_REFS.cash.why[L]} stress={DEMO_REFS.cash.stress[L]}
              extraLine={`${t('credit_line')}: ${DEMO_CASH.creditPLN[L]} – ${t('credit_line_note')}`}
              warn={DEMO_RULES[1].hit ? DEMO_RULES[1].text[L] : undefined}
              todo={t('todo_cash')} action={{ label: t('act_cash'), to: '/approvals' }} />
            <KpiCard term="low_point" owner="anna" label={t('kpi_low_point')} source="bank" demoRef
              value={f90 ? fmtPLN(f90.lowest.balancePLN) : undefined} valueKind="estimate"
              compare={f90 ? { label: '', text: `${t('low_point_when')} ${fmtDay(f90.lowest.date)} – ${t('low_point_before')}`, good: f90.lowest.balancePLN >= 0, neutral: true } : undefined}
              note={DEMO_CASH.forecastMiss[L]}
              warn={f90 && f90.lowest.balancePLN < 0 ? t('low_point_warn') : undefined}
              todo={t('todo_low_point')} action={{ label: t('act_cash'), to: '/approvals' }} />
          </div>

          {/* 2. Who owes us / what we pay */}
          <h2 className="pt-2 text-lg font-semibold uppercase tracking-wide text-stone-700">{t('row_owed')}</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <KpiCard term="overdue" owner="anna" label={t('kpi_overdue_fleet')} source="ksef" demoRef
              value={k ? fmtPLN(k.overdueReceivablesPLN) : undefined}
              compare={{ label: DEMO_REFS.overdue.label[L], text: DEMO_REFS.overdue.delta.text, good: DEMO_REFS.overdue.delta.good }}
              trend={DEMO_REFS.overdue.trend[L]} why={DEMO_REFS.overdue.why[L]} note={DEMO_REFS.payDays[L]}
              warn={DEMO_RULES[0].hit ? DEMO_RULES[0].text[L] : undefined}
              todo={t('todo_overdue')} action={{ label: t('act_overdue'), to: '/approvals' }} />
            <section className="kpi-card surface flex min-w-0 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CfoAvatar cfo="marek" size={28} />
                  <h2 className="text-lg font-semibold leading-tight">{t('kpi_we_pay')}</h2>
                </div>
                <DemoTag />
              </div>
              <Term id="tax" />
              <ul className="mt-3 divide-y divide-black/10 text-[18px]">
                {/* payments in date order (DD.MM, same year) */}
                {[
                  ...(k?.nextDeadline ? [{ date: fmtDay(k.nextDeadline.date), what: k.nextDeadline.label, amount: fmtPLN(k.nextDeadline.amountPLN) }] : []),
                  ...DEMO_CASH.payments.map((p) => ({ date: p.date, what: p.what[L], amount: p.amount })),
                ].sort((a, b) => a.date.split('.').reverse().join('').localeCompare(b.date.split('.').reverse().join(''))).map((p) => (
                  <li key={p.date + p.what} className="flex items-baseline justify-between gap-3 py-2">
                    <span><strong className="tabular-nums">{p.date}</strong> · {p.what}</span>
                    <strong className="tabular-nums">{p.amount}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex-1 text-[17px] leading-snug text-stone-800"><span className="font-semibold">{t('todo_prefix')}</span> {t('todo_tax')}</p>
              <Link to="/approvals" className="no-print mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-white hover:bg-zinc-800">
                {t('act_tax')} <span aria-hidden="true">→</span>
              </Link>
              <SourceTag source="rules" />
            </section>
          </div>

          {/* 3. Profit – details after a click */}
          <Details title={t('row_profit')}>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {DEMO_WEEK.map((d) => (
                <KpiCard key={d.id} term={d.id} owner={d.owner} source={d.source} demo
                  label={t(d.id === 'cars' ? 'kpi_cars_week' : d.id === 'avg_job' ? 'kpi_avg_job' : 'kpi_margin_parts')}
                  value={d.unit === 'pln' ? fmtPLN(d.value) : d.unit === 'pct' ? `${String(d.value).replace('.', ',')}%` : String(d.value)}
                  target={d.target[L]} compare={{ label: '', text: d.delta.text[L], good: d.delta.good }} trend={d.trend[L]} why={d.why[L]} stress={d.stress[L]}
                  warn={d.id === 'margin_parts' && DEMO_RULES[2].hit ? DEMO_RULES[2].text[L] : undefined}
                  todo={t(d.id === 'cars' ? 'todo_cars' : d.id === 'avg_job' ? 'todo_avg' : 'todo_margin')}
                  action={{ label: t(d.id === 'cars' ? 'act_cars' : d.id === 'avg_job' ? 'act_avg' : 'act_margin'), to: '/boardroom' }} />
              ))}
            </div>
          </Details>

          <Details title={t('details_forecast')}>
            {verdict && (
              <p className={`flex items-start gap-2 text-xl font-bold leading-snug ${verdict.tone === 'ok' ? 'text-accent-ink' : 'text-warn'}`}>
                {verdict.tone === 'warn' && <WarnMark />}
                {verdict.text}
              </p>
            )}
            <Status loading={forecast.loading && !f} error={forecast.error} />
            {f && <CashChart f={f} />}
            <SourceTag source="bank" />
          </Details>
          <Details title={t('details_revenue')}>
            <RevenueFormula rev={rev} />
          </Details>
        </>
      )}

      {/* ---------- Month: result, who owes whom, costs, plan ---------- */}
      {view === 'month' && (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <KpiCard term="profit" owner="anna" label={t('kpi_profit_month')} source="ksef" demo
              value={fmtPLN(DEMO_MONTH.profitPLN)}
              compare={{ label: DEMO_MONTH.profitRef.label[L], text: DEMO_MONTH.profitRef.text, good: DEMO_MONTH.profitRef.good }} trend={DEMO_MONTH.profitTrend[L]}
              todo={t('todo_profit')} action={{ label: t('act_profit'), to: '/boardroom' }} />
            <section className="surface flex flex-col p-5">
              <div className="flex items-center gap-3">
                <CfoAvatar cfo="anna" size={28} />
                <h2 className="text-lg font-semibold leading-tight">{t('kpi_owed')}</h2>
              </div>
              <Term id="owed" />
              <dl className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-[17px] text-stone-700">{t('owed_to_us')}</dt>
                  <dd className="text-3xl font-bold tabular-nums">{k ? fmtPLN(k.receivablesPLN) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-[17px] text-stone-700">{t('owed_by_us')}</dt>
                  <dd className="text-3xl font-bold tabular-nums">{k ? fmtPLN(k.payablesPLN) : '—'}</dd>
                </div>
              </dl>
              <p className="mt-3 flex-1 text-[17px] text-stone-800">{DEMO_REFS.owed.trend[L]}</p>
              <Link to="/approvals" className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-white hover:bg-zinc-800">
                {t('act_owed')} <span aria-hidden="true">→</span>
              </Link>
              <SourceTag source="ksef" />
            </section>
            <KpiCard term="cost_share" owner="tomasz" label={t('kpi_cost_share')} source="ksef" demo
              value={`${String(DEMO_MONTH.costSharePct).replace('.', ',')}%`}
              compare={{ label: DEMO_MONTH.costShareRef.label[L], text: DEMO_MONTH.costShareRef.text[L], good: DEMO_MONTH.costShareRef.good }} trend={DEMO_MONTH.costTrend[L]}
              todo={t('todo_costs')} action={{ label: t('act_costs'), to: '/boardroom' }} />
            <section className="surface flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{t('kpi_plan')}</h2>
                <DemoTag />
              </div>
              <Term id="plan" />
              <p className="mt-3 flex flex-wrap items-center gap-x-2 text-3xl font-bold leading-tight text-warn">
                <WarnMark arrow={false} /><span aria-hidden="true">▼</span>{DEMO_MONTH.planDevText[L]}
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{t('now_value')} {DEMO_MONTH.planPct}% {t('of_plan')}</p>
              <div className="mt-3 h-3 rounded-full bg-zinc-100" aria-hidden="true">
                <div className="h-3 rounded-full bg-accent" style={{ width: `${Math.min(100, DEMO_MONTH.planPct)}%` }} />
              </div>
              <p className="mt-2 text-[17px] text-stone-700">{DEMO_MONTH.planText[L]}</p>
              <SourceTag source="ksef" />
            </section>
          </div>

          <Details title={t('details_services')}>
            <div className="flex justify-end"><DemoTag /></div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-accent-ink">{t('services_best')}</h3>
                <ol className="mt-2 space-y-2 text-[17px]">
                  {DEMO_SERVICES.best.map((x) => <li key={x.name.pl} className="flex justify-between gap-3"><span>{x.name[L]}</span><strong className="tabular-nums">{x.margin}</strong></li>)}
                </ol>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-warn">{t('services_worst')}</h3>
                <ol className="mt-2 space-y-2 text-[17px]">
                  {DEMO_SERVICES.worst.map((x) => <li key={x.name.pl} className="flex justify-between gap-3"><span>{x.name[L]}</span><strong className="tabular-nums">{x.margin}</strong></li>)}
                </ol>
              </div>
            </div>
            <p className="mt-3 text-[15px] text-stone-700">{t('services_note')}</p>
          </Details>
          <Details title={t('details_expenses')}>
            <Status loading={expenses.loading && !ex} error={expenses.error} />
            {ex && ex.byCategory.length > 0 && (
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <div className="donut-in relative h-44 w-44 shrink-0" role="img" aria-label={`${t('expenses_30')}: ${fmtPLN(ex.totalPLN)}`}>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-base text-stone-800">{t('total')}</span>
                    <strong className="text-sm tabular-nums">{fmtPLN(ex.totalPLN)}</strong>
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
                <ul className="w-full space-y-2 text-[17px]">
                  {ex.byCategory.map((c) => (
                    <li key={c.category} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.category] }} aria-hidden="true" />
                        {t(`cat_${c.category}`)}
                      </span>
                      <span className="font-semibold tabular-nums">{fmtPLN(c.amountPLN)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SourceTag source="ksef" />
          </Details>
          <Details title={t('details_revenue')}>
            <RevenueFormula rev={rev} />
          </Details>
        </>
      )}

      {/* What the agents found – the 3 most important, approvals first */}
      <section className="no-print space-y-4 pt-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t('agents_found')}</h2>
            <p className="text-stone-700">{t('legend_analysed')} · {t('legend_recommended')} · {t('legend_approval')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runCheck} disabled={running}
              className="inline-flex min-h-12 items-center gap-3 rounded-full bg-ink px-6 font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
              {running ? t('checking') : t('run_check')} <Icon name="arrow-up-right" size={18} />
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
        <div className="grid gap-5 lg:grid-cols-3">
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
    <div className="cash-chart mt-3 h-60" role="img"
      aria-label={`${t('forecast_title')}: ${t('lowest_point')} ${fmtPLN(f.lowest.balancePLN)}, ${fmtDay(f.lowest.date)}`}>
      <ResponsiveContainer>
        <AreaChart data={pts} margin={{ top: 16, right: 30, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#141414" stopOpacity={0.2} />
              <stop offset={zeroAt} stopColor="#141414" stopOpacity={0.05} />
              <stop offset={zeroAt} stopColor="#B45309" stopOpacity={0.15} />
              <stop offset={1} stopColor="#B45309" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="cashLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset={zeroAt} stopColor="#141414" />
              <stop offset={zeroAt} stopColor="#B45309" />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" ticks={xTicks} interval={0} tickFormatter={fmtDay} fontSize={18} fontWeight={600}
            tickLine={false} axisLine={false} stroke="#1d1d1f" dy={8} />
          <YAxis width={88} fontSize={18} ticks={yTicks} tickFormatter={tys} tickLine={false} axisLine={false} stroke="#1d1d1f" />
          <Tooltip formatter={(v) => [fmtPLN(Number(v)), t('balance')]} labelFormatter={(d) => fmtDay(String(d))}
            contentStyle={{ borderRadius: 16, border: '1px solid rgb(0 0 0 / 0.1)', fontSize: 18 }} />
          <ReferenceLine y={0} stroke="#1d1d1f" strokeWidth={2} />
          <ReferenceLine y={f.bufferPLN} stroke="#0F5132" strokeDasharray="8 6" strokeWidth={2}>
            <Label value={`${t('buffer')} ${tys(f.bufferPLN)}`} position="insideTopRight" fontSize={16} fontWeight={600} fill="#0F5132" />
          </ReferenceLine>
          <Area type="stepAfter" dataKey="balancePLN" stroke="url(#cashLine)" strokeWidth={5} fill="url(#cashFill)" isAnimationActive={false} />
          <ReferenceDot x={f.lowest.date} y={f.lowest.balancePLN} r={9} fill="#B45309" stroke="#fff" strokeWidth={3}>
            <Label value={`${t('lowest_point')} ${fmtDay(f.lowest.date)}`} position="left" fontSize={18} fontWeight={700} fill="#B45309" offset={14} />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- KPI pieces ----------
const SOURCE_LABEL: Record<Source, string> = { ksef: 'src_ksef', bank: 'src_bank', workshop: 'src_workshop', rules: 'src_rules' };

function SourceTag({ source }: { source: Source }) {
  const { t } = useT();
  return <p className="mt-3 text-sm text-stone-600">{t('src_prefix')} {t(SOURCE_LABEL[source])}</p>;
}

function DemoTag() {
  const { t } = useT();
  return <span className="shrink-0 rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-sm font-medium text-warn">{t('demo_data')}</span>;
}

/** Details only after a click: a big, plain button that opens the panel. */
function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="surface group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-lg font-semibold">
        {title}
        <span aria-hidden="true" className="text-2xl text-stone-600 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-black/10 p-5">{children}</div>
    </details>
  );
}

function RevenueFormula({ rev }: { rev: { cars: number; avgJobPLN: number; complaintsPLN: number; revenuePLN: number } }) {
  const { t } = useT();
  return (
    <>
      <div className="flex justify-end"><DemoTag /></div>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg">
        <span><strong className="tabular-nums">{rev.cars}</strong> {t('rev_cars')}</span>
        <span aria-hidden="true">×</span>
        <span><strong className="tabular-nums">{fmtPLN(rev.avgJobPLN)}</strong> {t('rev_avg')}</span>
        <span aria-hidden="true">−</span>
        <span><strong className="tabular-nums">{fmtPLN(rev.complaintsPLN)}</strong> {t('rev_complaints')}</span>
        <span aria-hidden="true">=</span>
        <strong className="text-2xl tabular-nums">{fmtPLN(rev.revenuePLN)}</strong>
      </p>
      <p className="mt-2 text-[15px] text-stone-700">{t('rev_note')}</p>
    </>
  );
}

/** Amber light is never colour alone: always the word "Uwaga" and an arrow next to it. */
function WarnMark({ arrow = true }: { arrow?: boolean }) {
  const { t } = useT();
  return (
    <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-warn-soft px-2 py-0.5 text-base font-bold text-warn">
      <span className="h-3 w-3 rounded-full bg-warn" aria-hidden="true" /> {t('attention')} {arrow && <span aria-hidden="true">▼</span>}
    </span>
  );
}

/** "Co to znaczy?" – one plain sentence from the shared glossary, after a click. */
function Term({ id }: { id: string }) {
  const { t, lang } = useT();
  const def = GLOSSARY[id];
  if (!def) return null;
  return (
    <details className="no-print mt-1 text-[16px]">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 font-medium text-accent-ink underline underline-offset-4">
        {t('what_is_it')}
      </summary>
      <p className="mt-1 rounded-xl bg-zinc-50 px-3 py-2 text-stone-800">{lang === 'pl' ? def.pl : def.en}</p>
    </details>
  );
}

/** Small word next to a number: "jest" (actual), "plan" or "przewidujemy" (forecast). */
function KindTag({ kind }: { kind: 'actual' | 'plan' | 'forecast' | 'estimate' | 'ai' }) {
  const { t } = useT();
  const key = { actual: 'tag_actual', plan: 'tag_plan', forecast: 'tag_forecast', estimate: 'tag_estimate', ai: 'tag_ai' }[kind];
  return (
    <span className={`rounded-md border px-1.5 py-0.5 align-middle font-sans text-sm font-medium ${kind === 'ai' ? 'border-accent/40 text-accent-ink' : 'border-black/15 text-stone-700'}`}>
      {t(key)}
    </span>
  );
}


/** One KPI tile: owner agent, the VALUE ("jest") with the TARGET ("plan") next to it, the DEVIATION below
 *  (arrow = direction; colour plus the word "Uwaga" when it needs attention), WHY it changed (one sentence from
 *  the agent), a 4-month trend in words, a "-10 %" test after a click, what to do, one action, source, glossary. */
function KpiCard({ owner, label, value, valueKind = 'actual', target, compare, trend, note, extraLine, warn, why, stress, stale, forecastNote = false, todo, action, source, term, demo = false, demoRef = false }: {
  owner: CfoId; label: string; value: string | undefined; source: Source; term?: string; target?: string;
  compare?: { label: string; text: string; good: boolean; neutral?: boolean };
  trend?: string; note?: string; extraLine?: string; warn?: string; why?: string; stress?: string; forecastNote?: boolean;
  valueKind?: 'actual' | 'estimate'; stale?: string;
  todo: string; action: { label: string; to: string }; demo?: boolean; demoRef?: boolean;
}) {
  const { t } = useT();
  const deviation = compare && !compare.neutral;
  const text = compare?.text.trim() ?? '';
  const hasArrow = text.startsWith('▲') || text.startsWith('▼');
  const up = text.startsWith('+') || text.startsWith('▲');
  const hasMore = Boolean(why || trend || note || extraLine || stress || term || todo);
  return (
    <section className="kpi-card surface flex min-w-0 flex-col p-5" aria-label={label}>
      {/* header: who owns it, what it is */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CfoAvatar cfo={owner} size={28} />
          <h2 className="text-lg font-semibold leading-tight">{label}</h2>
        </div>
        {(demo || demoRef) && <DemoTag />}
      </div>

      {/* the number (+ target), one line of deviation – nothing else up front */}
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-bold leading-none tracking-tight tabular-nums">{stale ? '—' : value ?? '—'}</span>
        {stale ? <span className="rounded-md bg-warn-soft px-2 py-0.5 text-base font-bold text-warn">{t('stale')}</span> : <KindTag kind={valueKind} />}
        {target && <span className="text-lg font-semibold text-stone-700">{t('target')} {target}</span>}
      </p>
      {deviation && compare && !stale && (
        <p className={`mt-2 flex flex-wrap items-center gap-x-2 text-lg font-bold leading-snug ${compare.good ? 'text-accent-ink' : 'text-warn'}`}>
          {!compare.good && <WarnMark arrow={false} />}
          {!hasArrow && <span aria-hidden="true">{up ? '▲' : '▼'}</span>}
          <span className="tabular-nums">{text}</span>
          {compare.label && <span className="text-[17px] font-normal text-stone-700">vs {compare.label}</span>}
        </p>
      )}
      {compare?.neutral && <p className="mt-2 text-[17px] font-semibold text-stone-700">{compare.text}</p>}
      {warn && (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-[17px] font-semibold text-warn">
          <WarnMark />{warn}
        </p>
      )}
      {stale && <p className="mt-2 text-[17px] text-warn">{stale}</p>}

      {/* the action sits right next to the number it is about */}
      <Link to={action.to} className="no-print mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-center font-semibold text-white hover:bg-zinc-800">
        {action.label} <span aria-hidden="true">→</span>
      </Link>

      {/* everything else only after a click */}
      {hasMore && !stale && (
        <details className="no-print group mt-3 text-[17px]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg font-semibold text-accent-ink">
            {t('more')}
            <span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-1 space-y-2 leading-snug text-stone-800">
            {why && <p><span className="font-semibold">{t('why_changed')}</span> {why} <KindTag kind="ai" /></p>}
            {trend && <p className="text-stone-700">{trend}</p>}
            {note && <p className="font-semibold text-ink">{note} {forecastNote && <KindTag kind="forecast" />}</p>}
            {extraLine && <p className="text-stone-700">{extraLine}</p>}
            {todo && <p><span className="font-semibold">{t('todo_prefix')}</span> {todo}</p>}
            {stress && <p className="rounded-xl bg-zinc-50 px-3 py-2"><span className="font-semibold">{t('stress_q')}</span> {stress}</p>}
            {term && GLOSSARY[term] && <p className="rounded-xl bg-zinc-50 px-3 py-2"><span className="font-semibold">{t('what_is_it')}</span> {GLOSSARY[term][t('lang_code') === 'en' ? 'en' : 'pl']}</p>}
            <SourceTag source={source} />
          </div>
        </details>
      )}
    </section>
  );
}


/** Main screen: the most important money facts as short sentences (full breakdown stays in the Month view),
 *  break-even in one line, receivables by age after a click, and "Czy stać mnie na…?". */
function MoneyLines() {
  const { t, lang } = useT();
  const L = lang === 'pl' ? 'pl' : 'en';
  const state = useApi(api.state);
  const expenses = useApi(() => api.expenses(30));
  const [ask, setAsk] = useState<number | null>(null);
  const k = state.data?.kpis;
  const top = expenses.data?.byCategory[0];
  const answer = ask !== null ? DEMO_AFFORD[ask] : null;
  return (
    <section className="surface p-5" aria-label={t('money_title')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('money_title')}</h2>
        <DemoTag />
      </div>
      <ul className="mt-3 space-y-3 text-[19px] leading-snug">
        {top && (
          <li className="flex flex-wrap items-center gap-x-2">
            <WarnMark />
            <span>{t('top_cost')} <strong>{t(`cat_${top.category}`)}</strong>, <strong className="tabular-nums">{Math.round(top.share * 100)}%</strong> {t('of_costs')} – {DEMO_MONEY_LINES.topCostGrew[L]}</span>
          </li>
        )}
        <li>{DEMO_MONEY_LINES.profit[L]}</li>
        <li className="flex flex-wrap items-center gap-x-2"><WarnMark /><span><strong>{t('breakeven')}:</strong> {DEMO_BREAKEVEN[L]}</span></li>
        {k && (
          <li>
            {t('owed_line_1')} <strong className="tabular-nums">{fmtPLN(k.receivablesPLN)}</strong>, {t('owed_line_2')} <strong className="tabular-nums">{fmtPLN(k.payablesPLN)}</strong>
            <details className="no-print mt-1">
              <summary className="inline-flex min-h-10 cursor-pointer list-none items-center text-[17px] font-medium text-accent-ink underline underline-offset-4">{t('aging_open')}</summary>
              <ul className="mt-1 space-y-1 rounded-xl bg-zinc-50 px-3 py-2 text-[17px]">
                {DEMO_AGING.map((b) => (
                  <li key={b.label.pl} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">{b.warn && <WarnMark />}{b.label[L]}</span>
                    <strong className="tabular-nums">{fmtPLN(b.amountPLN)}</strong>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        )}
        <li>{DEMO_REFS.runway[L]} <KindTag kind="forecast" /></li>
      </ul>

      {/* "Czy stać mnie na…?" */}
      <div className="no-print mt-5 border-t border-black/10 pt-4">
        <p className="text-lg font-semibold">{t('afford_q')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEMO_AFFORD.map((o, i) => (
            <button key={i} onClick={() => setAsk(ask === i ? null : i)} aria-pressed={ask === i}
              className={`min-h-12 rounded-full border px-4 text-base font-semibold ${ask === i ? 'border-ink bg-ink text-white' : 'border-black/15 bg-white hover:bg-zinc-100'}`}>
              {o.q[L]}
            </button>
          ))}
        </div>
        {answer && (
          <div className="pop-in mt-3 flex items-start gap-3 rounded-2xl bg-zinc-50 p-4" aria-live="polite">
            <CfoAvatar cfo={answer.owner} size={28} />
            <p className="text-[18px] leading-snug">
              <strong className={answer.yes ? 'text-accent-ink' : 'text-warn'}>{t(answer.yes ? 'afford_yes' : 'afford_no')}.</strong> {answer.a[L]} <KindTag kind="ai" />
              <span className="mt-2 block font-semibold">{answer.low[L]}</span>
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-[15px] text-stone-700">{t('more_in_month')}</p>
    </section>
  );
}

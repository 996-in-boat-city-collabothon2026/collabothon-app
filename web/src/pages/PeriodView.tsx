// Week and Month tabs (Ewelina): KPI cards with details on click. Partly demo data, labelled "dane demo".
// The first tab ("Overview") is the main dashboard in Dashboard.tsx; nothing here changes it.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Cell, Label, Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CfoId, ExpenseCategory, Forecast } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { CfoAvatar, Status, fmtDay, fmtPLN } from '../components/ui';
import { DEMO_CASH, DEMO_RULES, DEMO_MONTH, DEMO_REFS, DEMO_REVENUE, DEMO_SERVICES, DEMO_WEEK, type Source } from '../lib/kpiDemo';
import { useT } from '../i18n';
import { GLOSSARY } from '../lib/glossary';
import { useSweep } from '../components/useSweep';

// One accent in tints + greys: the biggest costs are the strongest colour.
const CAT_COLOR: Record<ExpenseCategory, string> = {
  payroll: '#EE0000', taxes: '#141414', parts: '#1D4ED8', rent: '#6b6b6b',
  leasing: '#F2B8C0', utilities: '#a3a3a3', other: '#d4d4d4',
};

export default function PeriodView({ view }: { view: 'week' | 'month' }) {
  const { t, lang } = useT();
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(30));
  const forecast90 = useApi(() => api.forecast(90));
  const expenses = useApi(() => api.expenses(30));
  const k = state.data?.kpis;
  const f = forecast.data;
  const f90 = forecast90.data;
  const ex = expenses.data;
  const pieEnd = useSweep(Boolean(ex && ex.byCategory.length > 0));
  let verdict: { tone: 'ok' | 'warn'; text: string } | null = null;
  if (f) {
    if (f.lowest.balancePLN < 0) verdict = { tone: 'warn', text: `${t('verdict_short')} ${fmtDay(f.lowest.date)} (${fmtPLN(f.lowest.balancePLN)}).` };
    else if (f.lowest.balancePLN < f.bufferPLN) verdict = { tone: 'warn', text: `${t('verdict_low')} ${fmtDay(f.lowest.date)}.` };
    else verdict = { tone: 'ok', text: t('verdict_ok') };
  }
  const L = lang === 'pl' ? 'pl' : 'en';
  const rev = DEMO_REVENUE[view];

  return (
    <div className="space-y-5">
      <Status loading={state.loading && !state.data} error={state.error} />
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
              <p className="mt-3 flex-1 text-[17px] text-stone-800">{k && k.receivablesPLN < k.payablesPLN ? DEMO_REFS.owed.less[L] : DEMO_REFS.owed.trend[L]}</p>
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
                      <Pie data={ex.byCategory} dataKey="amountPLN" nameKey="category" startAngle={90} endAngle={pieEnd} innerRadius="64%" outerRadius="100%"
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
    </div>
  );
}

// ---------- small pieces ----------
/** Chart dot that slides in from the left edge to the lowest day (display only; ends exactly on the data point). */
function TravelDot(props: { cx?: number; cy?: number; r?: number; fill?: string; stroke?: string; strokeWidth?: number }) {
  const { cx = 0, cy = 0, r = 8, fill, stroke, strokeWidth } = props;
  return (
    <g className="dot-travel" style={{ ['--dx' as string]: `${Math.max(0, cx - 70)}px` }}>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}
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
              <stop offset={zeroAt} stopColor="#CC0000" stopOpacity={0.15} />
              <stop offset={1} stopColor="#CC0000" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="cashLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset={zeroAt} stopColor="#141414" />
              <stop offset={zeroAt} stopColor="#CC0000" />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" ticks={xTicks} interval={0} tickFormatter={fmtDay} fontSize={18} fontWeight={600}
            tickLine={false} axisLine={false} stroke="#1d1d1f" dy={8} />
          <YAxis width={88} fontSize={18} ticks={yTicks} tickFormatter={tys} tickLine={false} axisLine={false} stroke="#1d1d1f" />
          <Tooltip formatter={(v) => [fmtPLN(Number(v)), t('balance')]} labelFormatter={(d) => fmtDay(String(d))}
            contentStyle={{ borderRadius: 16, border: '1px solid rgb(0 0 0 / 0.1)', fontSize: 18 }} />
          <ReferenceLine y={0} stroke="#1d1d1f" strokeWidth={2} />
          <ReferenceLine y={f.bufferPLN} stroke="#EE0000" strokeDasharray="8 6" strokeWidth={2}>
            <Label value={`${t('buffer')} ${tys(f.bufferPLN)}`} position="insideTopRight" fontSize={16} fontWeight={600} fill="#EE0000" />
          </ReferenceLine>
          <Area type="stepAfter" dataKey="balancePLN" stroke="url(#cashLine)" strokeWidth={5} fill="url(#cashFill)" isAnimationActive={false} />
          <ReferenceDot x={f.lowest.date} y={f.lowest.balancePLN} r={9} fill="#CC0000" stroke="#fff" strokeWidth={3} shape={TravelDot}>
            <Label value={`${t('lowest_point')} ${fmtDay(f.lowest.date)}`} position="left" fontSize={18} fontWeight={700} fill="#CC0000" offset={14} />
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

/** Alert colour is never colour alone: always the word "Uwaga" and an arrow next to it. */
function WarnMark({ arrow = true }: { arrow?: boolean }) {
  const { t } = useT();
  return (
    <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-warn px-2.5 py-0.5 text-base font-bold text-white">
      <span className="h-2.5 w-2.5 rounded-full bg-white" aria-hidden="true" /> {t('attention')} {arrow && <span aria-hidden="true">▼</span>}
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


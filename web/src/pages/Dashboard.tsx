// Dashboard: one warning sentence, 4 money tiles, the cash forecast, where the money goes, and what the agents found.
// Golden rule 1: the UI computes nothing. Every number comes from the API (server/src/rules); no demo numbers here.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Cell, Label, Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, ExpenseCategory, Forecast, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { TypingDots } from '../components/AskBubble';
import { ActionCard, PageHeader, Status, fmtDay, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';
import { GLOSSARY } from '../lib/glossary';
import Icon from '../components/Icon';
import PeriodView from './PeriodView';
import CountUp from '../components/CountUp';
import { useSweep } from '../components/useSweep';

const RANGES = [30, 60, 90] as const;
const PRIORITY: Record<Tier, number> = { NEEDS_APPROVAL: 0, RECOMMENDED: 1, ANALYSED: 2 };
// One accent in tints + greys: the biggest costs are the strongest colour.
const CAT_COLOR: Record<ExpenseCategory, string> = {
  payroll: '#2f2a24', taxes: '#7c5a3a', parts: '#a68a64', rent: '#78716c',
  leasing: '#c8bba6', utilities: '#d6d3d1', other: '#e7e5e4',
};

export default function Dashboard() {
  const { t } = useT();
  const [view, setView] = useState<'review' | 'week' | 'month'>('review');
  const [activeCat, setActiveCat] = useState<number | undefined>(undefined); // hovered slice of the pie
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(days), [days]);
  const forecast90 = useApi(() => api.forecast(90)); // 13 weeks: the lowest point matters, not the month end
  const expenses = useApi(() => api.expenses(30));
  const actions = useApi(() => api.actions('open'));
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const { toast, showToast } = useToast();

  const reloadAll = () => Promise.all([state.reload(), forecast.reload(), forecast90.reload(), expenses.reload(), actions.reload()]);

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

  // The agents check on their own when the page opens, so problems show up without clicking.
  // The server ignores proposals it already has, so running it again is safe.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(a: Action, approve: boolean) {
    try {
      await (approve ? api.approve(a.id) : api.reject(a.id));
      showToast(`${t(approve ? 'approved_toast' : 'rejected_toast')} ${a.title}`);
    } catch {
      showToast(t('decision_failed'));
    }
    await reloadAll();
  }

  const k = state.data?.kpis;
  const f = forecast.data;
  const f90 = forecast90.data;
  const ex = expenses.data;
  const pieEnd = useSweep(Boolean(ex && ex.byCategory.length > 0));
  const open = [...(actions.data ?? [])].sort((a, b) => PRIORITY[a.tier] - PRIORITY[b.tier]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('dashboard')}>
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/report" className="no-print inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-4 text-[15px] font-semibold hover:bg-zinc-100">
            <Icon name="receipt" size={18} /> {t('print_a4')}
          </Link>
          <Link to="/ksef" className="no-print inline-flex min-h-10 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-bold text-white hover:brightness-95">
            <Icon name="receipt" /> {t('invoices')} <Icon name="arrow-up-right" size={18} />
          </Link>
          {/* Tabs: Overview = this page as it was; Week and Month = KPI cards (PeriodView.tsx) */}
          <span className="no-print grid w-full grid-cols-3 items-center gap-1 rounded-2xl border border-black/10 bg-white p-1 sm:flex sm:w-auto sm:rounded-full" role="group" aria-label={t('kpi_view')}>
            {(['review', 'week', 'month'] as const).map((p) => (
              <button key={p} onClick={() => setView(p)} aria-pressed={view === p}
                className={`min-h-10 rounded-full px-3 text-[15px] font-semibold sm:px-4 ${view === p ? 'bg-ink text-white' : 'text-stone-700 hover:bg-black/5'}`}>
                <span className="sm:hidden">{t(p === 'review' ? 'view_review_short' : p === 'week' ? 'view_week' : 'view_month')}</span>
                <span className="hidden sm:inline">{t(p === 'review' ? 'view_review' : p === 'week' ? 'view_week' : 'view_month')}</span>
              </button>
            ))}
          </span>
        </span>
      </PageHeader>

      <Status loading={state.loading && !state.data} error={state.error} />

      {view !== 'review' && <div key={view} className="page-in"><PeriodView view={view} /></div>}
      {view === 'review' && (<div key="review" className="page-in space-y-5">

      {/* 0. One line that says what this page is and where the numbers come from (article: the dashboard explains itself) */}
      <p className="max-w-3xl text-[17px] text-stone-700">{t('intro_line')}</p>

      {/* 1. The headline in one line: money today → lowest point of the 13-week forecast (numbers from the rules engine) */}
      <section className={`alert-first surface grp p-6 sm:p-7 grp-alert`} aria-live="polite">
        {state.data?.shop.today && <p className="hero-date mb-4">{t('refreshed_at')} {fmtDay(state.data.shop.today)}</p>}
        {k && f90 ? (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div>
              <p className="text-base font-semibold text-stone-700">{t('available_today')}</p>
              <p className="text-3xl font-bold tracking-tight tabular-nums sm:text-[2.75rem] sm:leading-none"><CountUp text={fmtPLN(k.balancePLN)} /></p>
            </div>
            <span aria-hidden="true" className="hidden pb-2 text-3xl text-stone-400 sm:inline">→</span>
            <div>
              <p className="text-base font-semibold text-stone-700">{t('forecast_word')} · {fmtDay(f90.lowest.date)}</p>
              <p className={`text-3xl font-bold tracking-tight tabular-nums sm:text-[2.75rem] sm:leading-none ${f90.lowest.balancePLN < 0 ? 'text-warn' : 'text-good'}`}>
                <CountUp text={fmtPLN(f90.lowest.balancePLN)} />
              </p>
            </div>
            {f90.lowest.balancePLN < 0
              ? <span className="mb-1 inline-flex flex-wrap items-center gap-1 text-lg font-semibold text-warn"><WarnMark arrow={false} />{t('projected_shortfall')}</span>
              : f90.lowest.balancePLN < f90.bufferPLN
                ? <span className="mb-1"><WarnMark />{t('verdict_low')}</span>
                : <span className="mb-1 rounded-full bg-good-soft px-3 py-1 font-semibold text-good">{t('status_ok_13w')}</span>}
          </div>
        ) : <div className="skeleton h-12 w-2/3" />}
        {open[0] && (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* Phone: full width, so the button drops under the text instead of squeezing it */}
            <p className="min-w-0 basis-full text-lg sm:basis-0 sm:flex-1"><span className="font-semibold text-stone-700">{t('next_step')}</span> <strong>{open[0].title}</strong></p>
            <Link to="/approvals" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 text-lg font-bold text-white hover:brightness-95">
              {t('decide_now')} <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
        {k?.nextDeadline && (
          <p className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/10 pt-4 text-[17px] text-stone-700">
            <span className="h-2.5 w-2.5 rounded-full bg-ink" aria-hidden="true" />
            <strong className="text-ink">{k.nextDeadline.label}</strong> · {fmtDay(k.nextDeadline.date)} · <span className="tabular-nums">{fmtPLN(k.nextDeadline.amountPLN)}</span>
          </p>
        )}
        <p className="mt-2 text-sm text-stone-600">{t('status_sub')}</p>
      </section>

      {/* 2. Four money tiles – all straight from GET /api/state (kpis) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile group="flow" label={t('kpi_owed_to_you')} value={k && fmtPLN(k.receivablesPLN)} source="src_ksef" term="overdue"
          note={k && k.overdueReceivablesPLN > 0 ? `${t('kpi_overdue_now')} ${fmtPLN(k.overdueReceivablesPLN)}` : undefined} warn={!!k && k.overdueReceivablesPLN > 0} />
        <Tile group="flow" label={t('kpi_you_owe')} value={k && fmtPLN(k.payablesPLN)} source="src_ksef" term="owed"
          note={k && k.fxExposurePLN !== 0 ? `${t('kpi_fx_net')} ${fmtPLN(k.fxExposurePLN)}` : undefined} />
        <Tile group="flow" label={t('next_deadline')} value={k?.nextDeadline && fmtPLN(k.nextDeadline.amountPLN)} source="src_rules"
          note={k?.nextDeadline ? `${k.nextDeadline.label} · ${fmtDay(k.nextDeadline.date)}` : k ? t('nothing_waiting') : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* 3. Cash forecast */}
        <section className="surface grp grp-cash min-w-0 p-6">
          <GroupTag group="cash" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t('forecast_title')}</h2>
            <span className="flex gap-1 rounded-full border border-black/10 bg-white p-1" role="group" aria-label={t('forecast_title')}>
              {RANGES.map((d) => (
                <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
                  className={`min-h-10 rounded-full px-3 text-sm font-semibold sm:px-4 ${days === d ? 'bg-ink text-white' : 'text-stone-700 hover:bg-zinc-100'}`}>
                  {d} {t('days_short')}
                </button>
              ))}
            </span>
          </div>
          <Status loading={forecast.loading && !f} error={forecast.error} />
          {f && <p className="mt-1 text-sm text-stone-600">{t('chart_axis_note')}</p>}
          {f && <CashChart f={f} />}
          {f && (
            <p className="mt-3 text-[17px] leading-snug"><strong>{t('takeaway')}</strong>{' '}
              {f.lowest.balancePLN < 0
                ? `${t('takeaway_low_1')} ${fmtDay(f.lowest.date)} (${fmtPLN(f.lowest.balancePLN)}). ${t('takeaway_low_2')}`
                : t('takeaway_ok')}
            </p>
          )}
          <Term id="low_point" />
          <p className="mt-2 text-sm text-stone-600">{t('src_prefix')} {t('src_bank')}, {t('src_ksef')}, {t('src_rules')}</p>
        </section>

        {/* 4. Where the money goes */}
        <section className="surface grp grp-cost min-w-0 p-6">
          <GroupTag group="cost" />
          <h2 className="text-xl font-semibold">{t('where_money_goes')}</h2>
          <Status loading={expenses.loading && !ex} error={expenses.error} />
          {ex && ex.byCategory.length > 0 && (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start lg:flex-col lg:items-center xl:flex-row xl:items-start">
              <div className="donut-in relative h-40 w-40 shrink-0" role="img" aria-label={`${t('where_money_goes')}: ${fmtPLN(ex.totalPLN)}`}>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-sm text-stone-700">{t('total_30d')}</span>
                  <strong className="text-xs tabular-nums">{fmtPLN(ex.totalPLN)}</strong>
                </div>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={ex.byCategory} dataKey="amountPLN" nameKey="category" startAngle={90} endAngle={pieEnd} innerRadius="64%" outerRadius="100%"
                      paddingAngle={2} cornerRadius={6} stroke="none" isAnimationActive={false}
                      activeIndex={activeCat} onMouseEnter={(_, i) => setActiveCat(i)} onMouseLeave={() => setActiveCat(undefined)}
                      activeShape={(p: any) => <Sector {...p} outerRadius={p.outerRadius + 7} />}>
                      {ex.byCategory.map((c, i) => <Cell key={c.category} fill={i < 4 ? CAT_COLOR[c.category] : '#d4d4d4'} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full min-w-0 space-y-2 text-[16px]">
                {ex.byCategory.slice(0, 4).map((c) => (
                  <li key={c.category} onMouseEnter={() => setActiveCat(ex.byCategory.indexOf(c))} onMouseLeave={() => setActiveCat(undefined)}
                    className={`flex items-center justify-between gap-3 rounded-lg px-1 transition-colors ${activeCat === ex.byCategory.indexOf(c) ? 'bg-accent-soft' : ''}`}>
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.category] }} aria-hidden="true" />
                      {t(`cat_${c.category}`)}
                    </span>
                    <span className="tabular-nums"><strong>{Math.round(c.share * 100)}%</strong> · {fmtPLN(c.amountPLN)}</span>
                  </li>
                ))}
                {ex.byCategory.length > 4 && (
                  <li className="flex items-center gap-2 px-1 text-stone-700">
                    <span className="h-3 w-3 shrink-0 rounded-full bg-[#d4d4d4]" aria-hidden="true" />
                    {t('cat_others')}: {ex.byCategory.slice(4).map((c) => t(`cat_${c.category}`)).join(', ')}
                  </li>
                )}
              </ul>
            </div>
          )}
          {ex && ex.byCategory[0] && (
            <p className="mt-3 text-[17px] leading-snug"><strong>{t('takeaway')}</strong>{' '}
              {t('takeaway_cost')} {t(`cat_${ex.byCategory[0].category}`)}, {Math.round(ex.byCategory[0].share * 100)}% {t('takeaway_cost_2')}
            </p>
          )}
          <p className="mt-3 text-sm text-stone-600">{t('src_prefix')} {t('src_ksef')}, {t('src_bank')}</p>
        </section>
      </div>

      </div>)}

      {/* 5. What the agents found – approvals first. Every card shows tier + execution + why (Commerzbank challenge). */}
      <section className="dark-band no-print space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t('agents_found')}</h2>
            <p className="text-stone-700">{t('legend_analysed')} · {t('legend_recommended')} · {t('legend_approval')} · {t('simulated')}</p>
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
        <Status loading={actions.loading && !actions.data} error={actions.error} />
        {actions.data && open.length === 0 && <p className="surface p-6 text-center text-lg text-stone-700">{t('all_quiet')}</p>}
        <div className="grid gap-5 lg:grid-cols-3">
          {open.slice(0, 3).map((a) => (
            <div key={a.id} className="surface flex p-1">
              <ActionCard action={a} onApprove={() => decide(a, true)} onReject={() => decide(a, false)} />
            </div>
          ))}
        </div>
        {/* The rest of what the agents found (the top 3 are the cards above): approvals first, one line each, appearing one by one */}
        {(open.length > 0 || log.length > 0) && (
          <AgentLog lines={[
            ...log.filter((l) => !/^(✋|💡|🔍)/u.test(l)),
            ...open.slice(3).map((a) => `${a.tier === 'NEEDS_APPROVAL' ? '✋' : a.tier === 'RECOMMENDED' ? '💡' : '🔍'} ${a.title}`),
          ]} />
        )}
      </section>
      {toast}
    </div>
  );
}

// ---------- small pieces ----------
/** What the check found: needs-your-OK first, then advice, then checks. Plain tags instead of emoji; lines appear one by one. */
function AgentLog({ lines }: { lines: string[] }) {
  const { t } = useT();
  const kind = (l: string) => (l.startsWith('✋') ? 0 : l.startsWith('💡') ? 1 : l.startsWith('🔍') ? 2 : l.startsWith('↩') ? 3 : 4);
  const TAG = ['log_needs_ok', 'log_advice', 'log_checked', 'log_withdrawn', ''];
  const items = lines.map((l) => ({ k: kind(l), text: l.replace(/^(✋|💡|🔍|↩)️?\s*/u, '') }))
    .sort((a, b) => a.k - b.k);
  return (
    <ul className="agent-log space-y-2" aria-label={t('agents_found')}>
      {items.map((it, i) => (
        <li key={i} className="log-in flex items-start gap-3 rounded-xl bg-[#3a342d] px-4 py-3 text-[17px] leading-snug text-white"
          style={{ animationDelay: `${i * 90}ms` }}>
          {it.k < 4 && (
            <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-bold ${it.k === 0 ? 'bg-white text-ink' : it.k === 1 ? 'bg-[#efe9df] text-ink' : 'border border-white/40 text-white'}`}>
              {t(TAG[it.k])}
            </span>
          )}
          <span className={`flex-1 ${it.k === 4 ? 'text-[#d4d4d4]' : ''}`}>{it.text}</span>
          {it.k === 0 && (
            <Link to="/approvals" className="shrink-0 whitespace-nowrap rounded-full bg-white px-4 py-1 text-[15px] font-bold text-ink hover:bg-zinc-200">
              {t('decide_now')} <span aria-hidden="true">→</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Chart dot that slides in from the left edge to the lowest day (display only; ends exactly on the data point). */
function TravelDot(props: { cx?: number; cy?: number; r?: number; fill?: string; stroke?: string; strokeWidth?: number }) {
  const { cx = 0, cy = 0, r = 8, fill, stroke, strokeWidth } = props;
  return (
    <g className="dot-travel" style={{ ['--dx' as string]: `${Math.max(0, cx - 70)}px` }}>
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}
/** One money tile: label, big number, one short note, where the number comes from. */
type Group = 'cash' | 'flow' | 'cost';

/** Small coloured label that says which group a card belongs to (same shade as the card's left edge). */
function GroupTag({ group }: { group: Group }) {
  const { t } = useT();
  return <p className={`grp-tag grp-tag-${group}`}>{t(`grp_${group}`)}</p>;
}

function Tile({ label, value, note, warn = false, source, term, group }: {
  label: string; value?: string | false; note?: string; warn?: boolean; source: string; term?: string; group: Group;
}) {
  const { t } = useT();
  return (
    <section className={`surface grp grp-${group} flex min-w-0 flex-col p-5`}>
      <GroupTag group={group} />
      <h2 className="text-base font-medium text-stone-700">{label}</h2>
      {value ? <p className="mt-1 text-[1.75rem] font-bold tracking-tight tabular-nums"><CountUp text={value} /></p> : <div className="skeleton mt-2 h-8 w-3/4" />}
      {note && <p className={`mt-2 flex flex-wrap items-center gap-2 text-[16px] ${warn ? 'font-semibold text-warn' : 'text-stone-700'}`}>{warn && <WarnMark arrow={false} />}{note}</p>}
      <div className="mt-auto pt-2">
        {term && <Term id={term} />}
        <p className="text-sm text-stone-600">{t('src_prefix')} {t(source)}</p>
      </div>
    </section>
  );
}

/** Big, simple cash line: dark above zero, red below, dashed safety buffer, the lowest day labelled on the chart. */
function CashChart({ f }: { f: Forecast }) {
  const { t } = useT();
  const pts = f.points;
  const values = pts.map((p) => p.balancePLN);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const zeroAt = max === min ? 1 : max / (max - min); // where 0 sits in the gradient (0 = top, 1 = bottom) – drawing only
  const xTicks = [pts[0]?.date, pts[Math.floor(pts.length / 2)]?.date, pts[pts.length - 1]?.date].filter(Boolean) as string[];
  const yTicks = [...new Set([Math.round(min / 10000) * 10000, 0, Math.round(max / 10000) * 10000])];
  const short = (v: number) => (v === 0 ? '0 zł' : `${Math.round(v / 1000)}k zł`);
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
          <XAxis dataKey="date" ticks={xTicks} interval={0} tickFormatter={fmtDay} fontSize={16} fontWeight={600}
            tickLine={false} axisLine={false} stroke="#1d1d1f" dy={8} />
          <YAxis width={72} fontSize={16} ticks={yTicks} tickFormatter={short} tickLine={false} axisLine={false} stroke="#1d1d1f" />
          <Tooltip formatter={(v) => [fmtPLN(Number(v)), t('balance')]} labelFormatter={(d) => fmtDay(String(d))}
            contentStyle={{ borderRadius: 16, border: '1px solid rgb(0 0 0 / 0.1)', fontSize: 16 }} />
          <ReferenceLine y={0} stroke="#1d1d1f" strokeWidth={2} />
          <ReferenceLine y={f.bufferPLN} stroke="#78716C" strokeDasharray="8 6" strokeWidth={2}>
            <Label value={`${t('buffer')} ${short(f.bufferPLN)}`} position="insideTopRight" fontSize={14} fontWeight={600} fill="#78716C" />
          </ReferenceLine>
          <Area type="stepAfter" dataKey="balancePLN" stroke="url(#cashLine)" strokeWidth={4} fill="url(#cashFill)" isAnimationActive={false} />
          <ReferenceDot x={f.lowest.date} y={f.lowest.balancePLN} r={8} fill="#CC0000" stroke="#fff" strokeWidth={3} shape={TravelDot}>
            <Label value={`${t('lowest_point')} ${fmtDay(f.lowest.date)}`} position="left" fontSize={15} fontWeight={700} fill="#CC0000" offset={12} />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Alert colour is never colour alone: always the word "Attention" next to it. */
function WarnMark({ arrow = true }: { arrow?: boolean }) {
  const { t } = useT();
  return (
    <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-warn px-2.5 py-0.5 text-base font-bold text-white">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" fill="currentColor"/><path d="M12 10v5M12 18v.5" stroke="#cc0000" strokeWidth="2.4" strokeLinecap="round"/></svg> {t('attention')} {arrow && <span aria-hidden="true">▼</span>}
    </span>
  );
}

/** "What is it?" – one plain sentence from the shared glossary, after a click. */
function Term({ id }: { id: string }) {
  const { t, lang } = useT();
  const def = GLOSSARY[id];
  if (!def) return null;
  return (
    <details className="no-print mt-1 text-[15px]">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 font-medium text-accent-ink underline underline-offset-4">
        {t('what_is_it')}
      </summary>
      <p className="mt-1 rounded-xl bg-zinc-50 px-3 py-2 text-stone-800">{lang === 'pl' ? def.pl : def.en}</p>
    </details>
  );
}

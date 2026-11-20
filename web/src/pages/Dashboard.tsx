// Dashboard: one warning sentence, 4 money tiles, the cash forecast, where the money goes, and what the agents found.
// Golden rule 1: the UI computes nothing. Every number comes from the API (server/src/rules); no demo numbers here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Cell, Label, Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, ExpenseCategory, Forecast, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { TypingDots } from '../components/AskBubble';
import { ActionCard, PageHeader, Status, fmtDay, fmtPLN, useToast } from '../components/ui';
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
  const { t } = useT();
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
  const open = [...(actions.data ?? [])].sort((a, b) => PRIORITY[a.tier] - PRIORITY[b.tier]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('dashboard')}>
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/report" className="no-print inline-flex min-h-12 items-center gap-2 rounded-full border border-black/15 bg-white px-5 font-semibold hover:bg-zinc-100">
            <Icon name="receipt" size={18} /> {t('print_a4')}
          </Link>
          <Link to="/ksef" className="no-print inline-flex min-h-12 items-center gap-3 rounded-full bg-accent px-6 text-lg font-bold text-white hover:brightness-95">
            <Icon name="receipt" /> {t('invoices')} <Icon name="arrow-up-right" size={18} />
          </Link>
        </span>
      </PageHeader>

      <Status loading={state.loading && !state.data} error={state.error} />

      {/* 1. One sentence about the money (the lowest day of the 13-week forecast, from the rules engine) */}
      <section className={`surface p-6 ${f90 && f90.lowest.balancePLN < 0 ? 'border-warn/40 bg-warn-soft' : ''}`} aria-live="polite">
        {f90 ? (
          f90.lowest.balancePLN < 0 ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-3xl font-bold leading-tight text-warn sm:text-4xl">
              <WarnMark />
              {t('short_on')} {fmtDay(f90.lowest.date)}: {fmtPLN(f90.lowest.balancePLN)}
            </p>
          ) : f90.lowest.balancePLN < f90.bufferPLN ? (
            <p className="text-3xl font-bold leading-tight text-warn sm:text-4xl">{t('verdict_low')} {fmtDay(f90.lowest.date)}.</p>
          ) : (
            <p className="text-3xl font-bold leading-tight text-accent-ink sm:text-4xl">{t('status_ok_13w')}</p>
          )
        ) : <div className="skeleton h-10 w-2/3" />}
        <p className="mt-2 text-lg text-stone-700">{t('status_sub')}</p>
      </section>

      {/* 2. Four money tiles – all straight from GET /api/state (kpis) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={t('kpi_balance')} value={k && fmtPLN(k.balancePLN)} term="cash" source="src_bank" />
        <Tile label={t('kpi_owed_to_you')} value={k && fmtPLN(k.receivablesPLN)} source="src_ksef" term="overdue"
          note={k && k.overdueReceivablesPLN > 0 ? `${t('kpi_overdue_now')} ${fmtPLN(k.overdueReceivablesPLN)}` : undefined} warn={!!k && k.overdueReceivablesPLN > 0} />
        <Tile label={t('kpi_you_owe')} value={k && fmtPLN(k.payablesPLN)} source="src_ksef" term="owed"
          note={k && k.fxExposurePLN !== 0 ? `${t('kpi_fx_net')} ${fmtPLN(k.fxExposurePLN)}` : undefined} />
        <Tile label={t('next_deadline')} value={k?.nextDeadline && fmtPLN(k.nextDeadline.amountPLN)} source="src_rules"
          note={k?.nextDeadline ? `${k.nextDeadline.label} · ${fmtDay(k.nextDeadline.date)}` : k ? t('nothing_waiting') : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* 3. Cash forecast */}
        <section className="surface min-w-0 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t('forecast_title')}</h2>
            <span className="flex gap-1 rounded-full border border-black/10 bg-white p-1" role="group" aria-label={t('forecast_title')}>
              {RANGES.map((d) => (
                <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold ${days === d ? 'bg-ink text-white' : 'text-stone-700 hover:bg-zinc-100'}`}>
                  {d} {t('days_short')}
                </button>
              ))}
            </span>
          </div>
          <Status loading={forecast.loading && !f} error={forecast.error} />
          {f && <CashChart f={f} />}
          <Term id="low_point" />
          <p className="mt-2 text-sm text-stone-600">{t('src_prefix')} {t('src_bank')}, {t('src_ksef')}, {t('src_rules')}</p>
        </section>

        {/* 4. Where the money goes */}
        <section className="surface min-w-0 p-6">
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
                    <Pie data={ex.byCategory} dataKey="amountPLN" nameKey="category" innerRadius="64%" outerRadius="100%"
                      paddingAngle={2} cornerRadius={6} stroke="none" isAnimationActive={false}>
                      {ex.byCategory.map((c) => <Cell key={c.category} fill={CAT_COLOR[c.category]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full min-w-0 space-y-2 text-[16px]">
                {ex.byCategory.slice(0, 5).map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CAT_COLOR[c.category] }} aria-hidden="true" />
                      {t(`cat_${c.category}`)}
                    </span>
                    <span className="tabular-nums"><strong>{Math.round(c.share * 100)}%</strong> · {fmtPLN(c.amountPLN)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-sm text-stone-600">{t('src_prefix')} {t('src_ksef')}, {t('src_bank')}</p>
        </section>
      </div>

      {/* 5. What the agents found – approvals first. Every card shows tier + execution + why (Commerzbank challenge). */}
      <section className="no-print space-y-4 pt-2">
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
        {log.length > 0 && (
          <div className="surface p-6"><ul className="space-y-1 text-stone-700">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        )}
        <Status loading={actions.loading && !actions.data} error={actions.error} />
        {actions.data && open.length === 0 && <p className="surface p-6 text-center text-lg text-stone-700">{t('all_quiet')}</p>}
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
/** One money tile: label, big number, one short note, where the number comes from. */
function Tile({ label, value, note, warn = false, source, term }: {
  label: string; value?: string | false; note?: string; warn?: boolean; source: string; term?: string;
}) {
  const { t } = useT();
  return (
    <section className="surface flex min-w-0 flex-col p-5">
      <h2 className="text-base font-medium text-stone-700">{label}</h2>
      {value ? <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{value}</p> : <div className="skeleton mt-2 h-8 w-3/4" />}
      {note && <p className={`mt-2 flex flex-wrap items-center gap-2 text-[16px] ${warn ? 'font-semibold text-warn' : 'text-stone-700'}`}>{warn && <WarnMark arrow={false} />}{note}</p>}
      <div className="mt-auto pt-2">
        {term && <Term id={term} />}
        <p className="text-sm text-stone-600">{t('src_prefix')} {t(source)}</p>
      </div>
    </section>
  );
}

/** Big, simple cash line: dark above zero, amber below, dashed safety buffer, the lowest day labelled on the chart. */
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
              <stop offset={zeroAt} stopColor="#B45309" stopOpacity={0.15} />
              <stop offset={1} stopColor="#B45309" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id="cashLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset={zeroAt} stopColor="#141414" />
              <stop offset={zeroAt} stopColor="#B45309" />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" ticks={xTicks} interval={0} tickFormatter={fmtDay} fontSize={16} fontWeight={600}
            tickLine={false} axisLine={false} stroke="#1d1d1f" dy={8} />
          <YAxis width={72} fontSize={16} ticks={yTicks} tickFormatter={short} tickLine={false} axisLine={false} stroke="#1d1d1f" />
          <Tooltip formatter={(v) => [fmtPLN(Number(v)), t('balance')]} labelFormatter={(d) => fmtDay(String(d))}
            contentStyle={{ borderRadius: 16, border: '1px solid rgb(0 0 0 / 0.1)', fontSize: 16 }} />
          <ReferenceLine y={0} stroke="#1d1d1f" strokeWidth={2} />
          <ReferenceLine y={f.bufferPLN} stroke="#0F5132" strokeDasharray="8 6" strokeWidth={2}>
            <Label value={`${t('buffer')} ${short(f.bufferPLN)}`} position="insideTopRight" fontSize={14} fontWeight={600} fill="#0F5132" />
          </ReferenceLine>
          <Area type="stepAfter" dataKey="balancePLN" stroke="url(#cashLine)" strokeWidth={4} fill="url(#cashFill)" isAnimationActive={false} />
          <ReferenceDot x={f.lowest.date} y={f.lowest.balancePLN} r={8} fill="#B45309" stroke="#fff" strokeWidth={3}>
            <Label value={`${t('lowest_point')} ${fmtDay(f.lowest.date)}`} position="left" fontSize={15} fontWeight={700} fill="#B45309" offset={12} />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Amber light is never colour alone: always the word "Attention" next to it. */
function WarnMark({ arrow = true }: { arrow?: boolean }) {
  const { t } = useT();
  return (
    <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-warn-soft px-2 py-0.5 text-base font-bold text-warn">
      <span className="h-3 w-3 rounded-full bg-warn" aria-hidden="true" /> {t('attention')} {arrow && <span aria-hidden="true">▼</span>}
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

// Dashboard – minimal and readable for every age: one big number, one plain sentence, three facts,
// then what the agents found and two simple charts. The UI computes nothing: every number comes from the API.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Action, ExpenseCategory, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { TypingDots } from '../components/AskBubble';
import { ActionCard, Card, Status, fmtDay, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';

const RANGES = [30, 60, 90] as const;
const PRIORITY: Record<Tier, number> = { NEEDS_APPROVAL: 0, RECOMMENDED: 1, ANALYSED: 2 };
// Calm palette: one strong colour for the biggest costs, the rest in quiet tones.
const CAT_COLOR: Record<ExpenseCategory, string> = {
  payroll: '#1c1917', taxes: '#b45309', parts: '#78716c', rent: '#a8a29e',
  leasing: '#d6d3d1', utilities: '#57534e', other: '#e7e5e4',
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
  const waiting = open.filter((a) => a.tier === 'NEEDS_APPROVAL').length;

  // One plain sentence about the money (comparison only – the numbers come from the rules engine).
  let verdict: { tone: 'ok' | 'warn' | 'bad'; text: string } | null = null;
  if (f) {
    if (f.lowest.balancePLN < 0) verdict = { tone: 'bad', text: `${t('verdict_short')} ${fmtDay(f.lowest.date)} (${fmtPLN(f.lowest.balancePLN)}).` };
    else if (f.lowest.balancePLN < f.bufferPLN) verdict = { tone: 'warn', text: `${t('verdict_low')} ${fmtDay(f.lowest.date)}.` };
    else verdict = { tone: 'ok', text: t('verdict_ok') };
  }

  return (
    <div className="space-y-10">
      <Status loading={state.loading && !s} error={state.error} />

      {/* Hero: the one number that matters */}
      {k && s && (
        <section className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-stone-200/70 px-3 py-1 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-stone-900" aria-hidden="true" /> {t('today')} {fmtDay(s.shop.today)}
            </span>
            <p className="mt-5 text-lg text-stone-600">{t('you_have')}</p>
            <p className="text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">{fmtPLN(k.balancePLN)}</p>
            {verdict && (
              <p className={`mt-4 max-w-md text-lg leading-snug ${verdict.tone === 'ok' ? 'text-emerald-800' : verdict.tone === 'warn' ? 'text-amber-800' : 'text-rose-700'}`}>
                {verdict.tone === 'ok' ? '✓' : '⚠'} {verdict.text}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <PillButton onClick={runCheck} disabled={running} dark>
                {running ? t('checking') : t('run_check')}
              </PillButton>
              <PillLink to="/ksef">{t('invoices')}</PillLink>
            </div>
            {running && (
              <p className="mt-4 flex items-center gap-3 text-stone-600" aria-live="polite"><TypingDots /> {t('agents_working')}</p>
            )}
          </div>

          <ul className="space-y-5">
            <Fact icon={<IconCalendar />} title={t('next_deadline')}
              text={k.nextDeadline ? `${k.nextDeadline.label} · ${fmtPLN(k.nextDeadline.amountPLN)} · ${fmtDay(k.nextDeadline.date)}` : '—'} />
            <Fact icon={<IconHand />} title={t('waiting_for_you')} to="/approvals"
              text={actions.data ? (waiting === 0 ? t('nothing_waits') : `${waiting} ${t(waiting === 1 ? 'matter_1' : 'matter_n')} →`) : '…'} />
            <Fact icon={<IconTrend />} title={`${t('lowest')} (${days} ${t('days')})`}
              text={f ? `${fmtPLN(f.lowest.balancePLN)} · ${fmtDay(f.lowest.date)}` : '…'} />
          </ul>
        </section>
      )}

      {log.length > 0 && (
        <Card><ul className="space-y-1 text-stone-700">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>
      )}

      {/* What the agents found – the 3 most important, approvals first */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('agents_found')}</h2>
            <p className="text-stone-600">🔍 {t('legend_analysed')} · 💡 {t('legend_recommended')} · ✋ {t('legend_approval')}</p>
          </div>
          {open.length > 3 && <PillLink to="/approvals">{t('see_all')} ({open.length})</PillLink>}
        </div>
        <Status loading={actions.loading && !actions.data} error={actions.error} />
        {actions.data && open.length === 0 && (
          <p className="rounded-3xl border border-stone-200 bg-white p-6 text-center text-lg text-stone-600">{t('all_quiet')}</p>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          {open.slice(0, 3).map((a) => (
            <div key={a.id} className="rounded-3xl border border-stone-200 bg-white p-1">
              <ActionCard action={a} onApprove={() => void decide(a, true)} onReject={() => void decide(a, false)} />
            </div>
          ))}
        </div>
      </section>

      {/* Two simple charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t('forecast_title')}
            <span className="flex gap-1 rounded-full bg-stone-100 p-1" role="group" aria-label={t('forecast_title')}>
              {RANGES.map((r) => (
                <button key={r} onClick={() => setDays(r)} aria-pressed={days === r}
                  className={`min-h-12 rounded-full px-3 text-sm font-medium ${days === r ? 'bg-stone-900 text-white' : 'text-stone-600'}`}>
                  {r} {t('days')}
                </button>
              ))}
            </span>
          </span>
        }>
          <Status loading={forecast.loading && !f} error={forecast.error} />
          {f && (
            <>
              <div className="h-52" role="img" aria-label={`${t('forecast_title')}: ${t('lowest')} ${fmtPLN(f.lowest.balancePLN)} ${fmtDay(f.lowest.date)}`}>
                <ResponsiveContainer>
                  <AreaChart data={f.points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={12} minTickGap={24} tickLine={false} axisLine={false} stroke="#78716c" />
                    <YAxis width={44} fontSize={12} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} stroke="#78716c" />
                    <Tooltip formatter={(v) => fmtPLN(Number(v))} labelFormatter={(d) => fmtDay(String(d))} />
                    <ReferenceLine y={0} stroke="#d6d3d1" />
                    <ReferenceLine y={f.bufferPLN} stroke="#be123c" strokeDasharray="5 5" />
                    <Area type="stepAfter" dataKey="balancePLN" stroke="#1c1917" strokeWidth={2} fill="#e7e5e4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-sm text-rose-700">┄ {t('buffer')}: {fmtPLN(f.bufferPLN)}</p>
            </>
          )}
        </Card>

        <Card title={t('expenses_30')}>
          <Status loading={expenses.loading && !ex} error={expenses.error} />
          {ex && ex.byCategory.length === 0 && <p className="text-stone-600">{t('nothing_here')}</p>}
          {ex && ex.byCategory.length > 0 && (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`${t('expenses_30')}: ${fmtPLN(ex.totalPLN)}`}>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-sm text-stone-600">{t('total')}</span>
                  <strong className="text-sm">{fmtPLN(ex.totalPLN)}</strong>
                </div>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={ex.byCategory} dataKey="amountPLN" nameKey="category" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
                      {ex.byCategory.map((c) => <Cell key={c.category} fill={CAT_COLOR[c.category]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmtPLN(Number(v)), t(`cat_${n}`)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2">
                {ex.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-stone-300" style={{ background: CAT_COLOR[c.category] }} />
                    <span className="flex-1">{t(`cat_${c.category}`)}</span>
                    <span className="font-medium tabular-nums">{fmtPLN(c.amountPLN)}</span>
                    <span className="w-10 text-right text-sm text-stone-600">{Math.round(c.share * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
      {toast}
    </div>
  );
}

// ---------- small pieces ----------
const PILL = 'inline-flex min-h-12 items-center gap-3 rounded-full px-6 text-base font-semibold transition disabled:opacity-60';

function PillButton({ children, onClick, disabled, dark }: { children: ReactNode; onClick: () => void; disabled?: boolean; dark?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${PILL} ${dark ? 'bg-stone-900 text-white hover:bg-stone-700' : 'border border-stone-300 bg-white hover:bg-stone-50'}`}>
      {children} <span aria-hidden="true">→</span>
    </button>
  );
}

function PillLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link to={to} className={`${PILL} border border-stone-300 bg-white hover:bg-stone-50`}>
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

function Fact({ icon, title, text, to }: { icon: ReactNode; title: string; text: string; to?: string }) {
  const body = (
    <>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-stone-300 bg-white text-stone-900">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-stone-600">{text}</span>
      </span>
    </>
  );
  return (
    <li>
      {to
        ? <Link to={to} className="flex min-h-14 items-center gap-4 rounded-2xl hover:bg-white/60">{body}</Link>
        : <div className="flex items-center gap-4">{body}</div>}
    </li>
  );
}

const svg = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const IconCalendar = () => (
  <svg {...svg}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const IconHand = () => (
  <svg {...svg}><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.6-2.2L4 15.5a1.6 1.6 0 0 1 2.4-2L8 15" /></svg>
);
const IconTrend = () => (
  <svg {...svg}><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></svg>
);

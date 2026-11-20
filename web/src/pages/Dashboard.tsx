// Dashboard „Autonomiczny CFO – Warsztat Wulkanizacyjny Marek”.
// Quiet-luxury layout on a 12-column grid: KPIs → 13-week liquidity → 4 AI agents (human in the loop) →
// Boardroom Lite → event log. Every number comes from the API (rules engine); the UI only shows and animates it.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Action, ActivityEntry, BoardroomResult, CfoId, Forecast, Tier } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { AGENT_ORDER, agentName, agentRole, initials } from '../lib/agents';
import { useSpringNumber, useSpringValues, usePrefersReducedMotion } from '../lib/motion';
import { fmtDay, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';

const PRIORITY: Record<Tier, number> = { NEEDS_APPROVAL: 0, RECOMMENDED: 1, ANALYSED: 2 };
const STAGES: Tier[] = ['ANALYSED', 'RECOMMENDED', 'NEEDS_APPROVAL'];

/** Cascading entrance: index → 0.06 s stagger (y 16 → 0, blur 4 → 0, opacity 0 → 1). See .enter in index.css. */
function Enter({ i, children }: { i: number; children: ReactNode }) {
  return <div className="enter" style={{ '--i': i } as CSSProperties}>{children}</div>;
}

export default function Dashboard() {
  const { t, lang } = useT();
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(90)); // 90 days ≈ 13 weeks
  const actions = useApi(() => api.actions('open'));
  const activity = useApi(api.activity);
  const { toast, showToast } = useToast();

  const reloadAll = () => Promise.all([state.reload(), forecast.reload(), actions.reload(), activity.reload()]);

  const k = state.data?.kpis;
  const f = forecast.data;
  const loading = state.loading && !state.data;

  return (
    <div className="space-y-10 pb-10 pt-2">
      <Enter i={1}>
        <p className="text-sm uppercase tracking-[0.14em] text-muted">{t('dash_kicker')}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">{t('dash_title')}</h1>
          <Link to="/ksef" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-ink px-5 font-medium text-white hover:bg-[#2a2a2a]">
            {t('invoices')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </Enter>

      {state.error && <ErrorBox text={state.error} onRetry={() => void state.reload()} />}

      {/* KPIs: typography only, thin dividers */}
      <Enter i={2}>
        <section aria-label={t('kpis')} className="grid grid-cols-1 border-y border-hairline sm:grid-cols-2 lg:grid-cols-4">
          <Kpi loading={loading} label={t('kpi_cash')} value={k?.balancePLN}
            note={f ? { tone: f.lowest.balancePLN < f.bufferPLN ? 'warn' : 'ok', text: `${t('lowest_short')} ${fmtPLN(f.lowest.balancePLN)} · ${fmtDay(f.lowest.date)}` } : undefined} />
          <Kpi loading={loading} label={t('kpi_overdue_fleet')} value={k?.overdueReceivablesPLN}
            note={k ? { tone: k.overdueReceivablesPLN > 0 ? 'warn' : 'ok', text: k.overdueReceivablesPLN > 0 ? t('kpi_overdue_note') : t('kpi_all_paid') } : undefined} />
          <Kpi loading={loading} label={t('kpi_tax_reserve')} value={k?.nextDeadline?.amountPLN}
            note={k?.nextDeadline ? { tone: 'muted', text: `${k.nextDeadline.label} · ${fmtDay(k.nextDeadline.date)}` } : undefined} />
          <Kpi loading={loading} label={t('kpi_ros')} value={undefined} empty={t('kpi_ros_soon')} />
        </section>
      </Enter>

      {/* 13-week liquidity */}
      <Enter i={3}>
        <section className="surface p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">{t('forecast_13w')}</h2>
            {f && <p className="text-[15px] text-muted">{t('buffer')}: <span className="num">{fmtPLN(f.bufferPLN)}</span></p>}
          </div>
          {forecast.loading && !f && <div className="skeleton mt-6 h-64 w-full" />}
          {forecast.error && <ErrorBox text={forecast.error} onRetry={() => void forecast.reload()} />}
          {f && <LiquidityChart f={f} />}
        </section>
      </Enter>

      {/* The four agents */}
      <Enter i={4}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-semibold">{t('agents_title')}</h2>
          <p className="text-[15px] text-muted">{t('stage_analysis')} → {t('stage_recommendation')} → {t('stage_approval')}</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {AGENT_ORDER.map((cfo) => (
            <AgentCard key={cfo} cfo={cfo} loading={actions.loading && !actions.data}
              action={(actions.data ?? []).filter((a) => a.cfo === cfo).sort((a, b) => PRIORITY[a.tier] - PRIORITY[b.tier])[0]}
              onDecided={async (msg) => { showToast(msg); await reloadAll(); }} />
          ))}
        </div>
      </Enter>

      {/* Boardroom Lite */}
      <Enter i={5}>
        <BoardroomLite onDone={async () => { await reloadAll(); }} />
      </Enter>

      {/* Event log */}
      <Enter i={6}>
        <section className="surface p-6 sm:p-8">
          <h2 className="text-xl font-semibold">{t('event_log')}</h2>
          {activity.loading && !activity.data && <div className="mt-4 space-y-3">{[0, 1, 2].map((n) => <div key={n} className="skeleton h-6 w-full" />)}</div>}
          {activity.data && activity.data.length === 0 && <p className="mt-4 text-muted">{t('nothing_here')}</p>}
          <ul className="mt-4 divide-y divide-hairline">
            {(activity.data ?? []).slice(0, 6).map((e) => <LogRow key={e.id} e={e} lang={lang} />)}
          </ul>
        </section>
      </Enter>
      {toast}
    </div>
  );
}

// ---------- KPI ----------
function Kpi({ label, value, note, loading, empty }: {
  label: string; value: number | undefined; loading: boolean; empty?: string;
  note?: { tone: 'ok' | 'warn' | 'muted'; text: string };
}) {
  const shown = useSpringNumber(value);
  return (
    <div className="kpi px-1 py-6 sm:px-6">
      <p className="text-[15px] text-muted">{label}</p>
      {loading ? <div className="skeleton mt-3 h-9 w-40" /> : (
        <p className="num mt-2 text-[28px] font-medium leading-none sm:text-[30px]" aria-label={value !== undefined ? fmtPLN(value) : undefined}>
          {value !== undefined && shown !== undefined ? fmtPLN(shown) : <span className="text-muted">—</span>}
        </p>
      )}
      {!loading && (note || empty) && (
        <p className={`mt-3 text-[15px] ${note?.tone === 'warn' ? 'text-warn' : note?.tone === 'ok' ? 'text-accent' : 'text-muted'}`}>
          {note?.tone === 'warn' && <span aria-hidden="true">▾ </span>}
          {note?.tone === 'ok' && <span aria-hidden="true">▴ </span>}
          {note?.text ?? empty}
        </p>
      )}
    </div>
  );
}

// ---------- 13-week liquidity chart (own SVG: draws in, then springs to new values) ----------
function LiquidityChart({ f }: { f: Forecast }) {
  const { t } = useT();
  // one point per week (every 7th day) – a selection of API values, nothing is calculated
  const weekly = useMemo(() => {
    const pts = f.points.filter((_, i) => i % 7 === 0);
    const last = f.points[f.points.length - 1];
    if (last && pts[pts.length - 1] !== last) pts.push(last);
    return pts.slice(0, 14);
  }, [f]);
  const values = useSpringValues(weekly.map((p) => p.balancePLN), { stiffness: 280, damping: 24 }, weekly.map((p) => p.balancePLN));

  const W = 760, H = 260, padL = 8, padR = 8, padT = 22, padB = 34;
  const all = [...weekly.map((p) => p.balancePLN), f.bufferPLN, 0];
  const max = Math.max(...all), min = Math.min(...all);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / (max - min || 1));
  const x = (i: number) => padL + ((W - padL - padR) * i) / Math.max(1, weekly.length - 1);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lowIdx = weekly.reduce((m, p, i) => (p.balancePLN < weekly[m].balancePLN ? i : m), 0);
  const ticks = [...new Set([0, Math.floor((weekly.length - 1) / 2), weekly.length - 1])];

  return (
    <figure className="mt-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="cash-chart h-auto w-full overflow-visible" role="img"
        aria-label={`${t('forecast_13w')}: ${t('lowest_short')} ${fmtPLN(f.lowest.balancePLN)}, ${fmtDay(f.lowest.date)}`}>
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#111" strokeOpacity=".25" strokeWidth="1" />
        <line x1={padL} x2={W - padR} y1={y(f.bufferPLN)} y2={y(f.bufferPLN)} stroke="#B45309" strokeOpacity=".7" strokeWidth="1" strokeDasharray="4 5" />
        <text x={W - padR} y={y(f.bufferPLN) - 8} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#B45309">{t('buffer')}</text>
        <text x={padL} y={y(0) - 8} fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#666">0 zł</text>
        <path d={d} fill="none" stroke="#111" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="recharts-line-curve" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === lowIdx ? 5 : 2.5} fill={v < 0 ? '#B45309' : '#0F5132'} />
        ))}
        {ticks.map((i) => weekly[i] && (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === weekly.length - 1 ? 'end' : 'middle'}
            fontFamily="JetBrains Mono, monospace" fontSize="14" fill="#666">
            {fmtDay(weekly[i].date)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
        <span className={f.lowest.balancePLN < 0 ? 'text-warn' : 'text-accent'}>
          {t('lowest_short')}: <span className="num">{fmtPLN(f.lowest.balancePLN)}</span> · <span className="num">{fmtDay(f.lowest.date)}</span>
        </span>
        <span className="text-muted">{t('weeks_13_note')}</span>
      </figcaption>
    </figure>
  );
}

// ---------- Agent card: Analysis → Recommendation (amount) → Approval ----------
type CardState = 'idle' | 'processing' | 'approved' | 'rejected';

function AgentCard({ cfo, action, loading, onDecided }: {
  cfo: CfoId; action?: Action; loading: boolean; onDecided: (toast: string) => Promise<void>;
}) {
  const { t, lang } = useT();
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<CardState>('idle');
  const [last, setLast] = useState<Action | null>(null);
  const ref = useRef<HTMLElement>(null);

  // a new task for this agent → back to the normal view
  useEffect(() => { if (action && state !== 'processing') { setState('idle'); setLast(null); } }, [action?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function track(e: MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || reduced) return;
    ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`);
  }

  async function decide(approve: boolean) {
    if (!action) return;
    setState('processing');
    setLast(action);
    try {
      await (approve ? api.approve(action.id) : api.reject(action.id));
      await new Promise((r) => setTimeout(r, reduced ? 0 : 700)); // let the "vLLM is processing" state be seen
      setState(approve ? 'approved' : 'rejected');
      await onDecided(approve ? `${t('approved_toast')} ${action.title}` : `${t('rejected_toast')} ${action.title}`);
    } catch {
      setState('idle');
      await onDecided(t('decision_failed'));
    }
  }

  const decided = state === 'approved' || state === 'rejected';
  const shown = decided ? last : action;
  const stage = !decided && state === 'idle' ? action?.tier ?? null : null;

  return (
    <article ref={ref} onMouseMove={track} className="agent-card surface relative overflow-hidden p-6">
      <header className="flex items-center gap-3">
        <span className="agent-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline font-display text-sm font-semibold">
          {initials(cfo)}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight">{agentName(cfo)}</h3>
          <p className="text-[15px] text-muted">{agentRole(cfo, lang)}</p>
        </div>
      </header>

      {/* stage indicator: the active stage has a green bar that slides between steps */}
      <ol className="relative mt-5 grid grid-cols-3 gap-2 text-[13px]" aria-label={t('stages')}>
        <span className="absolute inset-x-0 top-0 h-px bg-hairline" aria-hidden="true" />
        {stage && (
          <span aria-hidden="true" className="stage-bar absolute top-0 h-[2px] bg-accent"
            style={{ left: `calc(${STAGES.indexOf(stage)} * (100% + 0.5rem) / 3)`, width: 'calc((100% - 1rem) / 3)' }} />
        )}
        {STAGES.map((s, i) => (
          <li key={s} aria-current={stage === s ? 'step' : undefined}
            className={`pt-3 ${stage === s ? 'font-semibold text-ink' : stage && STAGES.indexOf(stage) > i ? 'text-ink' : 'text-muted'}`}>
            {t(i === 0 ? 'stage_analysis' : i === 1 ? 'stage_recommendation' : 'stage_approval')}
          </li>
        ))}
      </ol>

      <div className="mt-5 min-h-[7.5rem]">
        {loading && <><div className="skeleton h-5 w-3/4" /><div className="skeleton mt-3 h-8 w-40" /></>}

        {!loading && !shown && (
          <div className="flex items-center gap-3 text-muted">
            <Check animate={false} />
            <span>{t('agent_empty')}</span>
          </div>
        )}

        {!loading && shown && (
          <>
            <p className="text-[17px] leading-snug">{shown.title}</p>
            {shown.amountPLN !== undefined && (
              <p className="num mt-2 text-[28px] font-medium leading-none">{fmtPLN(shown.amountPLN)}</p>
            )}
            <p className="mt-2 text-[15px] text-muted">
              {shown.dueDate && <>{t('due')} <span className="num">{fmtDay(shown.dueDate)}</span> · </>}
              {shown.execution === 'simulated' ? t('simulated') : t('permitted')}
            </p>
            {shown.why[0] && state === 'idle' && <p className="mt-2 text-[15px] text-muted">{shown.why[0]}</p>}
          </>
        )}
      </div>

      {!loading && action && state === 'idle' && action.tier === 'NEEDS_APPROVAL' && (
        <div className="mt-5 flex gap-3">
          <button onClick={() => void decide(true)} className="min-h-14 flex-1 rounded-lg bg-accent text-lg font-medium text-white hover:bg-[#0b3f27]">
            {t('approve')}
          </button>
          <button onClick={() => void decide(false)} className="min-h-14 flex-1 rounded-lg border border-hairline bg-white text-lg font-medium hover:border-ink">
            {t('reject')}
          </button>
        </div>
      )}
      {!loading && action && state === 'idle' && action.tier !== 'NEEDS_APPROVAL' && (
        <p className="mt-5 border-t border-hairline pt-4 text-[15px] text-muted">{t('no_approval_needed')}</p>
      )}
      {state === 'processing' && (
        <p className="mt-5 flex min-h-14 items-center gap-3 border-t border-hairline pt-4" aria-live="polite">
          <span className="relative flex h-2.5 w-2.5"><span className="live-dot absolute inset-0 rounded-full bg-accent" /><span className="relative h-2.5 w-2.5 rounded-full bg-accent" /></span>
          <span className="ai-shimmer">{t('vllm_processing')}</span>
        </p>
      )}
      {decided && (
        <p className="pop-in mt-5 flex min-h-14 items-center gap-3 border-t border-hairline pt-4 font-medium" aria-live="polite">
          {state === 'approved' ? <Check animate /> : <span aria-hidden="true" className="text-2xl text-muted">×</span>}
          <span className={state === 'approved' ? 'text-accent' : 'text-muted'}>{t(state === 'approved' ? 'status_approved' : 'status_rejected')}</span>
        </p>
      )}
    </article>
  );
}

/** Check mark in a thin circle; with animate it draws itself (pathLength 0 → 1). */
function Check({ animate }: { animate: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="none" stroke="#0F5132" strokeOpacity=".3" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#0F5132" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} className={animate ? 'check-draw' : ''} />
    </svg>
  );
}

// ---------- Boardroom Lite (collapsible) ----------
const TOPICS = ['topic_december', 'topic_month', 'topic_fx', 'topic_margin'];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function BoardroomLite({ onDone }: { onDone: () => Promise<void> }) {
  const { t, lang } = useT();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [result, setResult] = useState<BoardroomResult | null>(null);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState<CfoId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const run = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // measure the content so the panel can animate its height smoothly
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { run.current++; }, []);

  async function start() {
    const id = ++run.current;
    setBusy(true); setError(false); setResult(null); setShown(0); setTyping(AGENT_ORDER[0]);
    try {
      const r = await api.boardroom(t(topic));
      if (id !== run.current) return;
      setResult(r);
      for (let i = 0; i < r.turns.length; i++) {
        setTyping(r.turns[i].cfo);
        await wait(reduced ? 0 : 850);
        if (id !== run.current) return;
        setTyping(null); setShown(i + 1);
        await wait(reduced ? 0 : 450);
      }
      await onDone();
    } catch {
      if (id === run.current) setError(true);
    } finally {
      if (id === run.current) { setBusy(false); setTyping(null); }
    }
  }

  return (
    <section className="surface">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="boardroom-lite"
        className="flex min-h-16 w-full items-center justify-between gap-4 rounded-[14px] px-6 py-4 text-left sm:px-8">
        <span>
          <span className="block font-display text-xl font-semibold">{t('boardroom_lite')}</span>
          <span className="block text-[15px] text-muted">{t('boardroom_lite_note')}</span>
        </span>
        <span aria-hidden="true" className={`plus text-3xl font-light text-muted ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      <div id="boardroom-lite" className="collapse-panel overflow-hidden" style={{ height: open ? height : 0 }} aria-hidden={!open}>
        <div ref={bodyRef} className="border-t border-hairline px-6 pb-6 pt-5 sm:px-8">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('topic')}>
            {TOPICS.map((k) => (
              <button key={k} role="radio" aria-checked={topic === k} disabled={busy} tabIndex={open ? 0 : -1} onClick={() => setTopic(k)}
                className={`min-h-12 rounded-lg border px-4 text-[15px] ${topic === k ? 'border-ink bg-ink text-white' : 'border-hairline bg-white hover:border-ink'}`}>
                {t(k)}
              </button>
            ))}
            <button onClick={() => void start()} disabled={busy} tabIndex={open ? 0 : -1}
              className="min-h-12 rounded-lg bg-accent px-5 text-[15px] font-medium text-white hover:bg-[#0b3f27] disabled:opacity-60">
              {busy ? t('meeting_running') : t('start_meeting')}
            </button>
          </div>

          {error && <ErrorBox text={t('meeting_failed')} onRetry={() => void start()} />}

          <ol className="mt-5 space-y-4" aria-live="polite">
            {result?.turns.slice(0, shown).map((turn, i) => (
              <li key={i} className="pop-in flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-[13px] font-semibold">{initials(turn.cfo)}</span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{agentName(turn.cfo)} <span className="font-normal text-muted">· {agentRole(turn.cfo, lang)}</span></p>
                  <p className="mt-1 text-[17px] leading-relaxed">{turn.text}</p>
                </div>
              </li>
            ))}
            {typing && (
              <li className="pop-in flex items-center gap-3 text-muted">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-[13px] font-semibold text-ink">{initials(typing)}</span>
                <span className="typing" aria-hidden="true"><i /><i /><i /></span>
                <span>{agentName(typing)} {t('is_typing')}</span>
              </li>
            )}
          </ol>

          {result && shown === result.turns.length && (
            <div className="pop-in mt-6 border-t border-hairline pt-5">
              <p className="text-sm uppercase tracking-[0.14em] text-muted">{t('joint_recommendation')}</p>
              <p className="mt-2 text-[17px] leading-relaxed">{result.summary}</p>
              {result.decisionActionIds.length > 0 && <p className="mt-2 text-[15px] text-muted">{t('decisions_above')}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------- small pieces ----------
function LogRow({ e, lang }: { e: ActivityEntry; lang: 'pl' | 'en' }) {
  const who = e.actor === 'user' ? (lang === 'pl' ? 'Ty' : 'You') : e.actor === 'system' ? 'System' : agentName(e.actor);
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
      <span className="num w-32 shrink-0 text-[14px] text-muted">{e.at.slice(8, 10)}.{e.at.slice(5, 7)} {e.at.slice(11, 16)}</span>
      <span className="w-20 shrink-0 text-[15px] font-medium">{who}</span>
      <span className="min-w-0 flex-1 text-[16px]">{e.text}</span>
    </li>
  );
}

function ErrorBox({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3">
      <p><span className="font-medium text-warn">{t('error_title')}</span> <span className="text-muted">— {text}</span></p>
      <button onClick={onRetry} className="min-h-12 rounded-lg border border-hairline bg-white px-4 font-medium hover:border-ink">{t('retry')}</button>
    </div>
  );
}

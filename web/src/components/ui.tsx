// Small shared building blocks. Pair 3 owns and polishes these.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CFOS, HATS, type Action, type CfoId, type Currency, type Execution, type Hat, type LlmHealth, type Tier } from '@cfo/shared';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import Icon, { type IconName } from './Icon';
import SpeakButton from './SpeakButton';

/** 4920 → „4 920,00 zł”. Hand-made because pl-PL Intl does not group 4-digit numbers („4920,00 zł”). */
export function fmtPLN(n: number): string {
  return fmtMoney(n, 'PLN');
}

const CURRENCY_SUFFIX: Record<Currency, string> = { PLN: 'zł', EUR: '€', USD: '$' };

/** Amount in the invoice's own currency: „1 300,00 €”. Converting to PLN is the server's job. */
export function fmtMoney(n: number, currency: Currency = 'PLN'): string {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${grouped},${dec} ${CURRENCY_SUFFIX[currency]}`;
}

/** ISO date → „DD.MM” (short, phone-friendly). */
export const fmtDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** Big page title on the left, optional pill / buttons on the right (same on every page). */
/** Animated number for display only: counts from 0 up to the API value. Instant when motion is reduced. */
export function useCountUp(target: number | undefined, ms = 900): number | undefined {
  const [v, setV] = useState(target);
  useEffect(() => {
    if (target === undefined) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(p === 1 ? target : Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-gradient pb-1 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`surface p-6 ${className}`}>
      {title && <h2 className="mb-4 text-lg font-bold tracking-tight">{title}</h2>}
      {children}
    </section>
  );
}

const TIER_STYLE: Record<Tier, { icon: IconName; cls: string }> = {
  ANALYSED: { icon: 'search' as IconName, cls: 'bg-zinc-100 text-ink' },
  RECOMMENDED: { icon: 'bulb' as IconName, cls: 'bg-zinc-100 text-ink' },
  NEEDS_APPROVAL: { icon: 'check-hand' as IconName, cls: 'bg-accent-soft text-accent-ink' },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useT();
  const s = TIER_STYLE[tier];
  return <span className={`rounded-full px-2 py-0.5 text-sm font-medium ${s.cls}`}><Icon name={s.icon} size={15} className="mr-1 align-[-2px]" />{t(`tier_${tier}`)}</span>;
}

export function ExecutionBadge({ execution }: { execution: Execution }) {
  const { t } = useT();
  return execution === 'simulated'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-sm text-ink"><Icon name="flask" size={15} />{t('simulated')}</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm text-accent-ink"><Icon name="check" size={15} />{t('permitted')}</span>;
}

/** Round avatar in the CFO's colour, wearing their thinking hat (HATS[CFOS[c].hat]). */
/** Pass live to show a small green "working" dot with a ripple. */
export function CfoAvatar({ cfo, size = 40, live = false }: { cfo: CfoId; size?: number; live?: boolean }) {
  const { lang } = useT();
  const c = CFOS[cfo];
  const hat = HATS[c.hat];
  const label = `${c.name} – ${lang === 'pl' ? c.rolePl : c.role} · ${lang === 'pl' ? hat.labelPl : hat.label}`;
  const avatar = <HatAvatar letter={c.name[0]} color={c.color} hat={c.hat} label={label} size={size} />;
  if (!live) return avatar;
  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <span className="live-dot absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-accent" aria-hidden="true" />
    </span>
  );
}

/** Animated "agent → action → you" strip: shows how a decision flows. Decorative, labels are readable text. */
export function FlowStrip({ steps }: { steps: string[] }) {
  return (
    <div className="surface glow-mint flex flex-wrap items-center gap-2 overflow-hidden p-4 sm:gap-3 sm:p-5" aria-label={steps.join(' → ')}>
      {steps.map((s, i) => (
        <span key={s} className="contents">
          {i > 0 && <span className="flow-line min-w-3 flex-1" aria-hidden="true" />}
          <span className="shrink-0 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-[15px] font-semibold sm:px-3 sm:text-base">{s}</span>
        </span>
      ))}
    </div>
  );
}

/** Any avatar with a hat – also used for the Blue-hat chair, who is not a CFO. */
/** 3D cartoon avatar per hat colour (web/public/avatars/<hat>-hat.png). The Blue-hat chair uses the yellow-hat picture. */
export const avatarSrc = (hat: Hat) => `/avatars/${hat}-hat.png`;

/** Any avatar with a hat – also used for the Blue-hat chair, who is not a CFO.
 *  Shows the 3D picture when it exists; falls back to a coloured circle with a drawn hat. */
export function HatAvatar({ letter, color, hat: hatId, label, size = 40 }: {
  letter: string; color: string; hat: Hat; label: string; size?: number;
}) {
  const [imgOk, setImgOk] = useState(true);
  const hat = HATS[hatId];
  if (imgOk) {
    // "Breaking the frame" with no seam: inside the circle the full-colour picture (its own background,
    // whole body coloured); above the circle the SAME picture without background, so hair + hat stick out.
    // Both pictures share exactly the same size and position (normalised in web/public/avatars).
    const S = Math.round(size * 1.6);
    const ring = hat.color === '#f8fafc' ? '#a1a1aa' : hat.color;
    const base = avatarSrc(hatId).replace('-hat.png', '');
    const img = { width: S * 1.32, height: S * 1.32, left: -S * 0.16, top: -S * 0.26 } as const;
    const ringW = Math.max(2, S / 28);
    // the cut-out covers everything outside the inner edge of the ring, so the hat sits IN FRONT of the ring
    const outside = `radial-gradient(circle ${S / 2}px at 50% ${S * 0.26 + S / 2}px, transparent ${S / 2 - ringW - 1}px, #000 ${S / 2 - ringW}px)`;
    return (
      <span title={label} role="img" aria-label={label} className="avatar-3d relative inline-block shrink-0"
        style={{ width: S, height: S, marginTop: S * 0.26 }}>
        <span className="avatar-fig absolute inset-0">
          {/* inside the circle: full picture */}
          <span className="absolute inset-0 overflow-hidden rounded-full">
            <img src={`${base}-full.png`} alt="" loading="lazy" decoding="async" onError={() => setImgOk(false)}
              className="absolute max-w-none" style={img} />
          </span>
          <span className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `inset 0 0 0 ${ringW}px ${ring}` }} />
          {/* outside the circle (top only): cut-out, so the hat breaks the frame */}
          <span className="absolute" style={{ left: img.left, top: img.top, width: img.width, height: S * 0.26 + S / 2,
            WebkitMaskImage: outside, maskImage: outside }}>
            <img src={`${base}-cut.png`} alt="" loading="lazy" decoding="async"
              className="absolute left-0 top-0 max-w-none" style={{ width: img.width, height: img.height }} />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} title={label} className="relative inline-flex shrink-0"
      style={{ width: size, height: size, marginTop: size * 0.3 }}>
      <svg viewBox="0 0 40 24" width={size * 0.72} aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2" style={{ top: -size * 0.36 }}>
        <rect x="9" y="1" width="22" height="16" rx="3" fill={hat.color} stroke="#0f172a" strokeOpacity="0.35" />
        <rect x="9" y="12" width="22" height="3" fill="#0f172a" fillOpacity="0.2" />
        <rect x="2" y="16" width="36" height="6" rx="3" fill={hat.color} stroke="#0f172a" strokeOpacity="0.35" />
      </svg>
      <span className="inline-flex h-full w-full items-center justify-center rounded-full font-bold text-white"
        style={{ background: color, fontSize: size * 0.42 }}>
        {letter}
      </span>
    </span>
  );
}

export function ActionCard({ action, onApprove, onReject }: { action: Action; onApprove?: () => void; onReject?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<'approve' | 'reject' | null>(null);
  const finish = (kind: 'approve' | 'reject', fn?: () => void) => { if (done) return; setDone(kind); setTimeout(() => fn?.(), 750); };
  const canDecide = action.tier === 'NEEDS_APPROVAL' && action.status === 'open';
  return (
    <article className="rounded-3xl bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex w-20 shrink-0 flex-col items-center pt-3 text-center">
          <span className="agent-hello"><CfoAvatar cfo={action.cfo} size={36} live /></span>
          <span className="mt-1 text-base font-bold leading-tight">{CFOS[action.cfo].name}</span>
          <span className="text-sm leading-tight text-zinc-700">{CFOS[action.cfo].role}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <TierBadge tier={action.tier} />
            <ExecutionBadge execution={action.execution} />
          </div>
          <p className="font-medium">{action.title}</p>
          <p className="text-sm text-stone-600">
            {action.amountPLN !== undefined && <strong>{fmtPLN(action.amountPLN)}</strong>}
            {action.dueDate && <> · {fmtDay(action.dueDate)}</>}
            {action.status !== 'open' && <> · {t(`status_${action.status}`)}</>}
          </p>
          <button className="min-h-12 text-sm font-medium text-stone-900 underline underline-offset-4" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t('why')}
          </button>
          {open && (
            <div className="mt-1 text-sm text-stone-700">
              {action.explanation && <p className="mb-1">{action.explanation}</p>}
              <ul className="list-disc pl-5">{action.why.map((w) => <li key={w}>{w}</li>)}</ul>
              <div className="mt-2">
                <SpeakButton text={[
                  action.title,
                  action.amountPLN !== undefined ? fmtPLN(action.amountPLN) : '',
                  action.dueDate ? `${t('due')} ${fmtDay(action.dueDate)}` : '',
                  action.explanation ?? '',
                  ...action.why,
                ].map((s) => s.trim().replace(/\.+$/, '')).filter(Boolean).join('. ')} />
              </div>
            </div>
          )}
        </div>
      </div>
      {canDecide && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => finish('approve', onApprove)} disabled={!!done} aria-live="polite"
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent py-2 text-lg font-bold text-white">
            {done === 'approve'
              ? <><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path className="check-draw" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>{t('done_approved')}</>
              : <>{t('approve')} →</>}
          </button>
          <button onClick={() => finish('reject', onReject)} disabled={!!done}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white py-2 font-semibold">
            {done === 'reject' ? <>{t('done_rejected')}</> : t('reject')}
          </button>
        </div>
      )}
    </article>
  );
}

export function LlmStatusBadge({ health }: { health: LlmHealth | null }) {
  if (!health) return null;
  const live = health.mode === 'openai_compat';
  const cls = !health.ok ? 'bg-warn' : live ? 'bg-accent' : 'bg-zinc-400';
  const ms = live && health.ok && health.latencyMs > 0 ? ` · ${health.latencyMs} ms` : '';
  const label = !health.ok ? 'Model offline' : live ? `Model: OpenShift AI · ${health.model}${ms}` : 'Model: mock (local)';
  // Click → Settings, section "Runs on Red Hat" with the full model and platform details.
  return (
    <Link to="/settings#platform" title={label}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-stone-300 bg-white px-2.5 py-1 text-sm text-stone-700 hover:border-stone-500">
      <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden="true" />
      {/* Full label only on wide screens; at 1024 px the menu needs the room (no horizontal scroll). */}
      <span className="hidden xl:inline">{label}</span>
      <span className="xl:hidden">{!health.ok ? 'Offline' : live ? 'OpenShift AI' : 'Mock'}</span>
    </Link>
  );
}

/** Toast: const { toast, showToast } = useToast(); … render {toast} somewhere on the page. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const showToast = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const toast = msg ? (
    <div role="status"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-full bg-[#1d1d1f]/90 px-5 py-3 text-white backdrop-blur md:bottom-6">
      {msg}
    </div>
  ) : null;
  return { toast, showToast };
}

/** Bottom sheet on phones, centred dialog on desktop. Esc / backdrop click closes it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-white md:rounded-3xl">
        <header className="flex items-center gap-2 border-b border-stone-200 py-2 pl-4 pr-2">
          <h2 className="flex-1 text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Zamknij" className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-stone-100"><Icon name="close" /></button>
        </header>
        <div className="space-y-3 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  const { t } = useT();
  if (error) return <p className="rounded-2xl bg-accent-soft p-3 text-accent-ink"><Icon name="alert" size={18} className="mr-1 align-[-3px]" />{error}</p>;
  if (loading) return <p className="text-stone-600">{t('loading')}</p>;
  return null;
}

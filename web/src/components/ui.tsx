// Small shared building blocks. Pair 3 owns and polishes these.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CFOS, HATS, type Action, type CfoId, type Currency, type Execution, type Hat, type LlmHealth, type Tier } from '@cfo/shared';
import { useT } from '../i18n';

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
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
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

const TIER_STYLE: Record<Tier, { icon: string; cls: string }> = {
  ANALYSED: { icon: '🔍', cls: 'bg-stone-100 text-stone-700' },
  RECOMMENDED: { icon: '💡', cls: 'bg-amber-50 text-amber-800' },
  NEEDS_APPROVAL: { icon: '✋', cls: 'bg-rose-50 text-rose-800' },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useT();
  const s = TIER_STYLE[tier];
  return <span className={`rounded-full px-2 py-0.5 text-sm font-medium ${s.cls}`}>{s.icon} {t(`tier_${tier}`)}</span>;
}

export function ExecutionBadge({ execution }: { execution: Execution }) {
  const { t } = useT();
  return execution === 'simulated'
    ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-sm text-stone-700">🧪 {t('simulated')}</span>
    : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800">✅ {t('permitted')}</span>;
}

/** Round avatar in the CFO's colour, wearing their thinking hat (HATS[CFOS[c].hat]). */
export function CfoAvatar({ cfo, size = 40 }: { cfo: CfoId; size?: number }) {
  const { lang } = useT();
  const c = CFOS[cfo];
  const hat = HATS[c.hat];
  const label = `${c.name} – ${lang === 'pl' ? c.rolePl : c.role} · ${lang === 'pl' ? hat.labelPl : hat.label}`;
  return <HatAvatar letter={c.name[0]} color={c.color} hat={c.hat} label={label} size={size} />;
}

/** Any avatar with a hat – also used for the Blue-hat chair, who is not a CFO. */
export function HatAvatar({ letter, color, hat: hatId, label, size = 40 }: {
  letter: string; color: string; hat: Hat; label: string; size?: number;
}) {
  const hat = HATS[hatId];
  const c = { color, name: letter };
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
        style={{ background: c.color, fontSize: size * 0.42 }}>
        {c.name[0]}
      </span>
    </span>
  );
}

export function ActionCard({ action, onApprove, onReject }: { action: Action; onApprove?: () => void; onReject?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const canDecide = action.tier === 'NEEDS_APPROVAL' && action.status === 'open';
  return (
    <article className="rounded-3xl bg-white p-4">
      <div className="flex items-start gap-3">
        <CfoAvatar cfo={action.cfo} size={36} />
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
            {open ? '▾' : '▸'} {t('why')}
          </button>
          {open && (
            <div className="mt-1 text-sm text-stone-700">
              {action.explanation && <p className="mb-1">{action.explanation}</p>}
              <ul className="list-disc pl-5">{action.why.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
      {canDecide && (
        <div className="mt-3 flex gap-2">
          <button onClick={onApprove} className="min-h-12 flex-1 rounded-full bg-[#0071e3] py-2 font-semibold text-white">{t('approve')} →</button>
          <button onClick={onReject} className="min-h-12 flex-1 rounded-full border border-stone-300 bg-white py-2 font-semibold">{t('reject')}</button>
        </div>
      )}
    </article>
  );
}

export function LlmStatusBadge({ health }: { health: LlmHealth | null }) {
  if (!health) return null;
  const live = health.mode === 'openai_compat';
  const cls = !health.ok ? 'bg-rose-500' : live ? 'bg-emerald-500' : 'bg-amber-400';
  const label = !health.ok ? 'Model offline' : live ? `Model: OpenShift AI · ${health.model}` : 'Model: mock (local)';
  return (
    <span title={label} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-stone-300 bg-white px-2.5 py-1 text-sm text-stone-700">
      <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{!health.ok ? 'Offline' : live ? 'OpenShift AI' : 'Mock'}</span>
    </span>
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
          <button onClick={onClose} aria-label="✕" className="h-12 w-12 rounded-full text-xl hover:bg-stone-100">✕</button>
        </header>
        <div className="space-y-3 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  const { t } = useT();
  if (error) return <p className="rounded-2xl bg-rose-50 p-3 text-rose-800">⚠️ {error}</p>;
  if (loading) return <p className="text-stone-600">{t('loading')}</p>;
  return null;
}

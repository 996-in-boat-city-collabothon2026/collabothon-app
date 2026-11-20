// Small shared building blocks. Pair 3 owns and polishes these.
import { useState, type ReactNode } from 'react';
import { CFOS, type Action, type CfoId, type Execution, type LlmHealth, type Tier } from '@cfo/shared';
import { useT } from '../i18n';

export const fmtPLN = (n: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n);

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

const TIER_STYLE: Record<Tier, { icon: string; cls: string }> = {
  ANALYSED: { icon: '🔍', cls: 'bg-sky-100 text-sky-800' },
  RECOMMENDED: { icon: '💡', cls: 'bg-amber-100 text-amber-800' },
  NEEDS_APPROVAL: { icon: '✋', cls: 'bg-rose-100 text-rose-800' },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { t } = useT();
  const s = TIER_STYLE[tier];
  return <span className={`rounded-full px-2 py-0.5 text-sm font-medium ${s.cls}`}>{s.icon} {t(`tier_${tier}`)}</span>;
}

export function ExecutionBadge({ execution }: { execution: Execution }) {
  const { t } = useT();
  return execution === 'simulated'
    ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-sm">🧪 {t('simulated')}</span>
    : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800">✅ {t('permitted')}</span>;
}

export function CfoAvatar({ cfo, size = 40 }: { cfo: CfoId; size?: number }) {
  const c = CFOS[cfo];
  return (
    <span
      title={`${c.name} – ${c.role}`}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ background: c.color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {c.name[0]}
    </span>
  );
}

export function ActionCard({ action, onApprove, onReject }: { action: Action; onApprove?: () => void; onReject?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const canDecide = action.tier === 'NEEDS_APPROVAL' && action.status === 'open';
  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start gap-3">
        <CfoAvatar cfo={action.cfo} size={36} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1.5">
            <TierBadge tier={action.tier} />
            <ExecutionBadge execution={action.execution} />
          </div>
          <p className="font-medium">{action.title}</p>
          <p className="text-sm text-slate-600">
            {action.amountPLN !== undefined && <strong>{fmtPLN(action.amountPLN)}</strong>}
            {action.dueDate && <> · {action.dueDate}</>}
            {action.status !== 'open' && <> · {action.status}</>}
          </p>
          <button className="mt-1 text-sm text-sky-700 underline" onClick={() => setOpen(!open)}>{t('why')}</button>
          {open && (
            <div className="mt-1 text-sm text-slate-700">
              {action.explanation && <p className="mb-1">{action.explanation}</p>}
              <ul className="list-disc pl-5">{action.why.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
      {canDecide && (
        <div className="mt-3 flex gap-2">
          <button onClick={onApprove} className="flex-1 rounded-lg bg-emerald-600 py-2 font-semibold text-white">{t('approve')}</button>
          <button onClick={onReject} className="flex-1 rounded-lg bg-slate-200 py-2 font-semibold">{t('reject')}</button>
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} /> {label}
    </span>
  );
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  const { t } = useT();
  if (error) return <p className="rounded-lg bg-rose-50 p-3 text-rose-800">⚠️ {error}</p>;
  if (loading) return <p className="text-slate-500">{t('loading')}</p>;
  return null;
}

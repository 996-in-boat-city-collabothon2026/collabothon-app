// Approval queue: Approve / Reject → toast, balance refreshes, decision shows in the log below.
import { useState } from 'react';
import type { Action } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { ActionCard, Card, CfoAvatar, Status, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';

export default function Approvals() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi(() => api.actions('open'));
  const state = useApi(api.state);
  const log = useApi(api.activity);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, showToast } = useToast();
  const queue = (data ?? []).filter((a) => a.tier === 'NEEDS_APPROVAL');

  async function decide(a: Action, approve: boolean) {
    setBusy(a.id);
    try {
      await (approve ? api.approve(a.id) : api.reject(a.id));
      showToast(`${t(approve ? 'approved_toast' : 'rejected_toast')} ${a.title}`);
    } catch {
      showToast(t('decision_failed'));
    } finally {
      setBusy(null);
      await Promise.all([reload(), state.reload(), log.reload()]); // balance + log update right away
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">✋ {t('approvals')}</h1>
        {data && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-sm text-rose-800">{queue.length} {t('waiting')}</span>}
      </div>

      <div aria-live="polite" className="flex items-baseline justify-between rounded-3xl border border-stone-200 bg-white px-5 py-4">
        <span className="text-stone-600">{t('balance')}</span>
        <strong className="text-xl tabular-nums">{state.data ? fmtPLN(state.data.kpis.balancePLN) : '…'}</strong>
      </div>

      <Card>
        <Status loading={loading && !data} error={error} />
        {data && queue.length === 0 && <p className="py-6 text-center text-lg text-stone-600">{t('all_done')}</p>}
        <div className="space-y-3">
          {queue.map((a) => (
            <div key={a.id} className={busy === a.id ? 'pointer-events-none opacity-60' : ''}>
              <ActionCard action={a} onApprove={() => void decide(a, true)} onReject={() => void decide(a, false)} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('recent_decisions')}>
        <Status loading={log.loading && !log.data} error={log.error} />
        {log.data && log.data.length === 0 && <p className="text-stone-600">{t('nothing_here')}</p>}
        <ul className="space-y-3">
          {(log.data ?? []).slice(0, 6).map((e) => (
            <li key={e.id} className="flex items-center gap-3 text-sm">
              {e.actor !== 'user' && e.actor !== 'system'
                ? <CfoAvatar cfo={e.actor} size={30} />
                : <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-slate-200">👤</span>}
              <span className="flex-1">{e.text}</span>
              {e.simulated && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-sm">🧪</span>}
            </li>
          ))}
        </ul>
      </Card>
      {toast}
    </div>
  );
}

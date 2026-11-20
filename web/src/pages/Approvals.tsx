// STARTER — Pair 3: add toasts ("Simulated payment done") and an empty-state illustration.
import { api, useApi } from '../api/client';
import { ActionCard, Card, Status } from '../components/ui';
import { useT } from '../i18n';

export default function Approvals() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi(() => api.actions('open'));
  const queue = (data ?? []).filter((a) => a.tier === 'NEEDS_APPROVAL');

  return (
    <Card title={`✋ ${t('tier_NEEDS_APPROVAL')}`}>
      <Status loading={loading && !data} error={error} />
      {data && queue.length === 0 && <p className="text-slate-500">{t('nothing_here')}</p>}
      <div className="space-y-3">
        {queue.map((a) => (
          <ActionCard key={a.id} action={a}
            onApprove={async () => { await api.approve(a.id); await reload(); }}
            onReject={async () => { await api.reject(a.id); await reload(); }} />
        ))}
      </div>
    </Card>
  );
}

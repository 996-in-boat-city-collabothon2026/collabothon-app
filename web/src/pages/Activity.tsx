// STARTER — Pair 3: timeline styling, filter by CFO.
import { CFOS, type CfoId } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { Card, CfoAvatar, Status } from '../components/ui';
import { useT } from '../i18n';

export default function Activity() {
  const { t } = useT();
  const { data, loading, error } = useApi(api.activity);
  return (
    <Card title={`📜 ${t('activity')}`}>
      <Status loading={loading && !data} error={error} />
      {data && data.length === 0 && <p className="text-slate-500">{t('nothing_here')}</p>}
      <ul className="space-y-2">
        {(data ?? []).map((e) => (
          <li key={e.id} className="flex items-start gap-3">
            {e.actor in CFOS ? <CfoAvatar cfo={e.actor as CfoId} size={28} /> : <span className="w-7 text-center">{e.actor === 'user' ? '👤' : '⚙️'}</span>}
            <div>
              <p>{e.text} {e.simulated && <span className="text-sm text-slate-500">🧪</span>}</p>
              <p className="text-xs text-slate-500">{e.at.replace('T', ' ').slice(0, 16)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

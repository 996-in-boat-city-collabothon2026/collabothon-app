// Activity log: everything the agents and the owner did, newest first. Filter by who did it.
import { useState } from 'react';
import { CFOS, type ActivityEntry, type CfoId } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { Card, CfoAvatar, Status, fmtDay } from '../components/ui';
import { useT } from '../i18n';

type Filter = 'all' | ActivityEntry['actor'];
const FILTERS: Filter[] = ['all', 'user', 'marek', 'anna', 'tomasz', 'kasia', 'system'];

export default function Activity() {
  const { t } = useT();
  const { data, loading, error } = useApi(api.activity);
  const [filter, setFilter] = useState<Filter>('all');
  const rows = (data ?? []).filter((e) => filter === 'all' || e.actor === filter);
  const label = (f: Filter) => (f === 'all' ? t('filter_all') : f === 'user' ? t('you') : f === 'system' ? t('system') : CFOS[f].name);

  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight">📜 {t('activity')}</h1>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('filter_by')}>
        {FILTERS.map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
            className={`min-h-12 rounded-full border px-4 text-sm font-medium ${filter === f ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white'}`}>
            {label(f)}
          </button>
        ))}
      </div>
      <Card>
        <Status loading={loading && !data} error={error} />
        {data && rows.length === 0 && <p className="text-stone-600">{t('nothing_here')}</p>}
        <ol className="space-y-4">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              {e.actor in CFOS
                ? <CfoAvatar cfo={e.actor as CfoId} size={32} />
                : <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200" aria-label={label(e.actor)}>
                    {e.actor === 'user' ? '👤' : '⚙️'}
                  </span>}
              <div className="min-w-0 flex-1">
                <p className="break-words">
                  {e.text} {e.simulated && <span className="ml-1 rounded-full bg-stone-200 px-2 py-0.5 text-sm">🧪 {t('simulated')}</span>}
                </p>
                <p className="text-sm text-stone-600">
                  {label(e.actor)} · {fmtDay(e.at)} {e.at.slice(11, 16)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

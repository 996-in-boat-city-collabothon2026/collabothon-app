// Settings: what the agents may do alone vs. must ask (everything is simulated), and demo reset for rehearsals.
import { useState } from 'react';
import type { ActionKind, AutonomyMode } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { Card, Status, useToast } from '../components/ui';
import { useT } from '../i18n';

const KINDS: { kind: ActionKind; icon: string }[] = [
  { kind: 'ksef_revalidate', icon: '🧾' },
  { kind: 'payment_reminder', icon: '✉️' },
  { kind: 'tax_payment', icon: '🏛️' },
  { kind: 'supplier_payment', icon: '🚚' },
  { kind: 'credit_line', icon: '🏦' },
];

export default function SettingsPage() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi(api.settings);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { toast, showToast } = useToast();

  async function setMode(kind: ActionKind, mode: AutonomyMode) {
    try {
      await api.saveSettings({ autonomy: { [kind]: mode } });
      showToast(t('saved'));
    } catch {
      showToast(t('save_failed'));
    }
    await reload();
  }

  async function reset() {
    setResetting(true);
    try {
      await api.resetDemo();
      location.reload();
    } catch {
      showToast(t('save_failed'));
      setResetting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-gradient pb-1 text-4xl font-semibold tracking-tight">⚙️ {t('settings')}</h1>

      <Card title={t('autonomy_title')}>
        <Status loading={loading && !data} error={error} />
        <p className="mb-4 text-stone-600">🧪 {t('autonomy_note')}</p>
        <ul className="space-y-3">
          {KINDS.map(({ kind, icon }) => {
            const mode = data?.autonomy[kind] ?? 'ask';
            return (
              <li key={kind} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span id={`kind-${kind}`} className="flex items-center gap-3">
                  <span className="text-xl" aria-hidden="true">{icon}</span> {t(`kind_${kind}`)}
                </span>
                <div role="radiogroup" aria-labelledby={`kind-${kind}`} className="flex shrink-0 gap-1 rounded-full bg-stone-100 p-1">
                  {(['ask', 'auto'] as AutonomyMode[]).map((m) => (
                    <button key={m} role="radio" aria-checked={mode === m} onClick={() => void setMode(kind, m)} disabled={!data}
                      className={`min-h-12 flex-1 rounded-full px-4 text-sm font-medium sm:flex-none ${mode === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}>
                      {t(m === 'auto' ? 'mode_auto' : 'mode_ask')}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={t('demo_title')}>
        <p className="mb-4 text-stone-600">{t('demo_note')}</p>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
            className="min-h-12 rounded-full border border-rose-300 bg-white px-6 font-semibold text-rose-700 hover:bg-rose-50">
            ↺ {t('reset_demo')}
          </button>
        ) : (
          <div role="alertdialog" aria-label={t('reset_confirm')} className="space-y-3 rounded-2xl bg-rose-50 p-4">
            <p className="font-semibold text-rose-900">{t('reset_confirm')}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void reset()} disabled={resetting}
                className="min-h-12 rounded-full bg-rose-600 px-6 font-semibold text-white disabled:opacity-60">
                {resetting ? t('loading') : t('reset_yes')}
              </button>
              <button onClick={() => setConfirmReset(false)} className="min-h-12 rounded-full border border-stone-300 bg-white px-6 font-semibold">
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
      </Card>
      {toast}
    </div>
  );
}

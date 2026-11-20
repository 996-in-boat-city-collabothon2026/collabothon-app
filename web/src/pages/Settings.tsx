// Settings: what the agents may do alone vs. must ask (everything is simulated), and demo reset for rehearsals.
import { useEffect, useState } from 'react';
import type { ActionKind, AutonomyMode, LlmHealth } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { Card, Status, useToast } from '../components/ui';
import { useT } from '../i18n';
import Icon, { type IconName } from '../components/Icon';

const KINDS: { kind: ActionKind; icon: IconName }[] = [
  { kind: 'ksef_revalidate', icon: 'receipt' as IconName },
  { kind: 'payment_reminder', icon: 'mail' as IconName },
  { kind: 'tax_payment', icon: 'building' as IconName },
  { kind: 'supplier_payment', icon: 'truck' as IconName },
  { kind: 'credit_line', icon: 'bank' as IconName },
  { kind: 'fx_hedge', icon: 'bank' as IconName },
];

export default function SettingsPage() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi(api.settings);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { toast, showToast } = useToast();
  const health = useApi(api.llmHealth);

  // The header model badge links here (#platform): scroll to that card once the page is drawn.
  useEffect(() => {
    if (location.hash === '#platform') document.getElementById('platform')?.scrollIntoView({ block: 'start' });
  }, []);

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
      <h1 className="text-gradient pb-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t('settings')}</h1>

      <Card title={t('autonomy_title')}>
        <Status loading={loading && !data} error={error} />
        <p className="mb-2 text-stone-600">{t('autonomy_note')}</p>
        <ul className="mb-4 space-y-1 text-sm text-stone-700">
          <li>• <strong>{t('mode_ask')}</strong> – {t('mode_ask_explain')}</li>
          <li>• <strong>{t('mode_auto')}</strong> – {t('mode_auto_explain')}</li>
        </ul>
        <ul className="space-y-3">
          {KINDS.map(({ kind, icon }) => {
            const mode = data?.autonomy[kind] ?? 'ask';
            return (
              <li key={kind} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-3">
                  <Icon name={icon} size={22} className="mt-0.5 shrink-0" />
                  <span>
                    <span id={`kind-${kind}`} className="block font-medium">{t(`kind_${kind}`)}</span>
                    <span className="block text-sm text-stone-600">{t(`hint_${kind}`)}</span>
                  </span>
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

      <div id="platform" className="scroll-mt-24">
        <Card title={t('platform_title')}>
          <p className="mb-4 text-stone-600">{t('platform_note')}</p>
          <PlatformRows h={health.data} />
          <p className="mt-4 text-sm text-stone-600">{t('platform_fallback')}</p>
        </Card>
      </div>

      <Card title={t('demo_title')}>
        <p className="mb-4 text-stone-600">{t('demo_note')}</p>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
            className="min-h-12 rounded-full border border-accent bg-white px-6 font-semibold text-accent-ink hover:bg-accent-soft">
            ↺ {t('reset_demo')}
          </button>
        ) : (
          <div role="alertdialog" aria-label={t('reset_confirm')} className="space-y-3 rounded-2xl bg-accent-soft p-4">
            <p className="font-semibold text-accent-ink">{t('reset_confirm')}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void reset()} disabled={resetting}
                className="min-h-12 rounded-full bg-accent px-6 font-semibold text-white disabled:opacity-60">
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

/** Model + platform facts straight from GET /api/llm/health (Pair 1). No numbers are invented here. */
function PlatformRows({ h }: { h: LlmHealth | null }) {
  const { t } = useT();
  if (!h) return <Status loading error={null} />;
  const live = h.mode === 'openai_compat';
  const status = !h.ok ? t('platform_down') : live ? t('platform_ok') : t('platform_mock');
  const rows: [string, string][] = [
    [t('platform_app'), t('platform_app_value')],
    [t('platform_ai'), live ? `Red Hat OpenShift AI · ${h.model}` : 'mock'],
    [t('platform_runtime'), live ? 'vLLM (OpenAI-compatible API)' : '–'],
    [t('platform_latency'), live && h.ok && h.latencyMs > 0 ? `${h.latencyMs} ms` : '–'],
    [t('platform_status'), status],
  ];
  return (
    <dl className="divide-y divide-stone-200 rounded-2xl border border-stone-200">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-sm text-stone-600">{k}</dt>
          <dd className="flex items-center gap-2 font-medium sm:text-right">
            {k === t('platform_status') && (
              <span className={`h-2 w-2 shrink-0 rounded-full ${!h.ok ? 'bg-rose-500' : live ? 'bg-accent' : 'bg-amber-400'}`} aria-hidden="true" />
            )}
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

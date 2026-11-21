// Settings: what the agents do on their own vs. what always waits for the owner (everything is simulated),
// the "Runs on Red Hat" card, and demo reset for rehearsals.
import { useEffect, useState } from 'react';
import type { ActionKind, LlmHealth } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { Card, Status, useToast } from '../components/ui';
import { useT } from '../i18n';
import Icon, { type IconName } from '../components/Icon';
import { applyComfort, loadComfort, type Comfort, type TextSize } from '../lib/comfort';

/**
 * What the autopilot really does with each operation – a copy of the server rules in
 * server/src/agents/autopilot.ts (Pair 2), keep in sync:
 * - 'auto': analysis (tier ANALYSED) always runs on its own and changes nothing.
 * - 'owner': in NEEDS_OWNER – it moves money or contacts a third party, so it always waits for the owner,
 *   whatever settings.autonomy says (an old saved 'auto' is ignored there too).
 * No operation shown here has a setting that changes what happens, so the page shows the behaviour and offers
 * no Auto / Ask switch. Add a switch only for an operation where the server would act on it.
 */
const OPERATIONS: { kind: ActionKind; icon: IconName; behaviour: 'auto' | 'owner' }[] = [
  { kind: 'ksef_revalidate', icon: 'receipt', behaviour: 'auto' },
  { kind: 'payment_reminder', icon: 'mail', behaviour: 'owner' },
  { kind: 'tax_payment', icon: 'building', behaviour: 'owner' },
  { kind: 'supplier_payment', icon: 'truck', behaviour: 'owner' },
  { kind: 'credit_line', icon: 'bank', behaviour: 'owner' },
  { kind: 'fx_hedge', icon: 'bank', behaviour: 'owner' },
];

export default function SettingsPage() {
  const { t } = useT();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { toast, showToast } = useToast();
  const health = useApi(api.llmHealth);

  // The header model badge links here (#platform): scroll to that card once the page is drawn.
  useEffect(() => {
    if (location.hash === '#platform') document.getElementById('platform')?.scrollIntoView({ block: 'start' });
  }, []);

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

      <ComfortCard />

      <Card title={t('autonomy_title')}>
        <p className="mb-4 text-stone-600">{t('autonomy_note')}</p>
        <ul className="space-y-3">
          {OPERATIONS.map(({ kind, icon, behaviour }) => (
            <li key={kind} data-kind={kind}
              className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-3">
                <Icon name={icon} size={22} className="mt-0.5 shrink-0" />
                <span>
                  <span className="block font-medium">{t(`kind_${kind}`)}</span>
                  <span className="block text-sm text-stone-600">{t(`hint_${kind}`)}</span>
                </span>
              </span>
              {/* Read-only: a status, not a control. */}
              <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm font-semibold sm:self-center ${
                behaviour === 'owner' ? 'bg-accent-soft text-accent-ink' : 'bg-stone-100 text-stone-700'}`}>
                <Icon name={behaviour === 'owner' ? 'check-hand' : 'search'} size={16} />
                {t(behaviour === 'owner' ? 'behaviour_owner' : 'behaviour_auto')}
              </span>
            </li>
          ))}
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

const SIZES: { size: TextSize; label: string }[] = [
  { size: 100, label: 'A' },
  { size: 120, label: 'A+' },
  { size: 140, label: 'A++' },
];

/** "Easier to read": text size A / A+ / A++ and a high-contrast switch. Saved on this device (lib/comfort.ts). */
function ComfortCard() {
  const { t } = useT();
  const [c, setC] = useState<Comfort>(loadComfort);
  const change = (next: Comfort) => {
    setC(next);
    applyComfort(next);
  };
  return (
    <Card title={t('comfort_title')}>
      <p className="mb-4 text-stone-600">{t('comfort_note')}</p>
      <p className="mb-2 font-medium" id="comfort-size">{t('comfort_size')}</p>
      <div role="group" aria-labelledby="comfort-size" className="mb-5 flex flex-wrap gap-2">
        {SIZES.map(({ size, label }) => (
          <button key={size} type="button" onClick={() => change({ ...c, textSize: size })}
            aria-pressed={c.textSize === size} aria-label={t(`comfort_size_${size}`)}
            className={`min-h-12 min-w-16 rounded-full border px-5 font-bold ${
              c.textSize === size ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white text-ink hover:bg-stone-100'}`}
            style={{ fontSize: `${size / 100}rem` }}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" role="switch" aria-checked={c.highContrast}
        onClick={() => change({ ...c, highContrast: !c.highContrast })}
        className="flex min-h-12 w-full items-center justify-between gap-4 rounded-2xl border border-stone-200 p-3 text-left">
        <span>
          <span className="block font-medium">{t('comfort_contrast')}</span>
          <span className="block text-sm text-stone-600">{t('comfort_contrast_hint')}</span>
        </span>
        <span aria-hidden="true"
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${c.highContrast ? 'bg-ink' : 'bg-stone-300'}`}>
          <span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${c.highContrast ? 'translate-x-7' : 'translate-x-1'}`} />
        </span>
      </button>
    </Card>
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
              <span className={`h-2 w-2 shrink-0 rounded-full ${!h.ok ? 'bg-warn' : live ? 'bg-accent' : 'bg-zinc-400'}`} aria-hidden="true" />
            )}
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

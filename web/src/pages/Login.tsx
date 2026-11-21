// Login screen. DEMO only: one "Sign in" button, no fields, no Google. Logs in as the demo workshop owner.
// Same look as the rest of the app (Ewelina, 21.11): light page, white top bar with the MANI logo, a black hero card
// like the dashboard's cash banner, red pill buttons, white cards with the round 3D agents. Texts by Nara (Pair 1).
// No numbers on this page: amounts in the app come from the rules.
import { useState } from 'react';
import type { User } from '@cfo/shared';
import { CFOS, type CfoId } from '@cfo/shared';
import { api } from '../api/client';
import { CfoAvatar } from '../components/ui';
import { useT } from '../i18n';

const AGENTS: CfoId[] = ['anna', 'tomasz', 'kasia', 'marek'];

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function login() {
    setBusy(true);
    setError(null);
    try {
      onLogin((await api.demoLogin()).user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Top bar: the same as inside the app */}
      <header className="sticky top-0 z-30 bg-paper/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 lg:px-8">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[38px] font-extrabold leading-none tracking-tight sm:text-[56px]">MANI</span>
            <span className="hidden text-sm font-semibold text-stone-600 sm:inline">{t('login_brand_tag')}</span>
          </span>
          <button onClick={() => void login()} disabled={busy}
            className="min-h-9 rounded-full bg-ink px-4 text-[15px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {t('login')}
          </button>
        </div>
      </header>

      <main className="page-in mx-auto max-w-6xl space-y-5 px-4 pb-16 pt-5 lg:px-8">
        {/* Hero: black card like the dashboard's cash banner */}
        <section className="grid gap-8 rounded-2xl bg-[#2f2a24] p-6 text-white sm:p-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="hero-date mb-6">
              <span className="inline-block h-2 w-2 rounded-full bg-[#8fd1a8]" aria-hidden="true" />{t('login_live')}
            </p>
            <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-6xl">
              <span className="block">{t('login_hero_1')}</span>
              <span className="block">{t('login_hero_2')}{' '}
                <span className="text-[#8fd1a8]">{t('login_hero_3')}</span>{t('login_hero_3b')}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#d4d4d4] sm:text-xl">{t('login_hero_sub')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button id="login" onClick={() => void login()} disabled={busy}
                className="inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-8 text-lg font-bold text-ink hover:bg-[#efe9df] disabled:opacity-60">
                {busy ? t('loading') : t('login')} <span aria-hidden="true">→</span>
              </button>
              <span className="text-[15px] leading-snug text-[#c7c7c7]">{t('login_cta_note_1')} · {t('login_cta_note_2')}</span>
            </div>
            {error && <p role="alert" className="mt-4 max-w-md rounded-2xl bg-white p-3 font-medium text-accent-ink">{error}</p>}
          </div>

          {/* What the owner gets: a short agents' meeting, as a white card (decorative) */}
          <div className="rounded-2xl bg-white p-5 text-ink" aria-hidden="true">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f2f2f2] px-3 py-1 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full bg-accent" />{t('login_phone_live')}
            </p>
            <div className="space-y-3">
              {([['anna', 'login_phone_anna'], ['marek', 'login_phone_marek'], ['kasia', 'login_phone_kasia']] as const).map(([id, key], i) => (
                <div key={id} className="log-in flex items-end gap-3" style={{ animationDelay: `${300 + i * 250}ms` }}>
                  <CfoAvatar cfo={id} size={34} />
                  <p className="rounded-2xl rounded-bl-sm bg-[#f2f2f2] px-3 py-2 text-[16px]">
                    <strong className="block text-sm text-stone-600">{CFOS[id].name}</strong>{t(key)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm font-semibold text-stone-600">{t('login_phone_ok')}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <span className="rounded-full bg-good py-2.5 text-center font-bold text-white">{t('approve')} →</span>
              <span className="rounded-full border border-ink py-2.5 text-center font-semibold">{t('why')}</span>
            </div>
          </div>
        </section>

        {/* The four agents, as white cards like the dashboard tiles */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('login_agents')}>
          {AGENTS.map((id) => (
            <li key={id} className="surface flex items-center gap-3 p-5">
              <CfoAvatar cfo={id} size={40} />
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight">{CFOS[id].name}</span>
                <span className="block text-[15px] leading-tight text-stone-700">{lang === 'pl' ? CFOS[id].rolePl : CFOS[id].role}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="text-center text-sm text-stone-600">{t('runs_on_redhat')}</p>
      </main>
    </div>
  );
}

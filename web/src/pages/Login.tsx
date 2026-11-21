// Login screen. DEMO only: one "Sign in" button, no fields, no Google. Logs in as the demo workshop owner.
// Layout (Pair 1, Nara): full-colour hero in our brand colours, big 3-line headline, white pill button,
// a tilted phone showing the agents' meeting, and the four agents in their hats floating in the background.
// Styles: index.css, block "Login page". No numbers on this page: amounts in the app come from the rules.
import { useState, type CSSProperties } from 'react';
import type { User } from '@cfo/shared';
import { CFOS, type CfoId } from '@cfo/shared';
import { api } from '../api/client';
import { CfoAvatar } from '../components/ui';
import { useT } from '../i18n';

const AGENTS: CfoId[] = ['anna', 'tomasz', 'kasia', 'marek'];
const step = (i: number) => ({ '--i': i }) as CSSProperties;

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const { t } = useT();
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
    <div className="login-hero flex min-h-screen flex-col text-white">
      {/* The four agents in their hats, floating softly in the background (decorative). */}
      {AGENTS.map((id, i) => (
        <img key={id} src={`/avatars/${CFOS[id].hat}-cut.png`} alt="" aria-hidden="true" className={`login-float login-float-${i}`} />
      ))}

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-extrabold tracking-tight">MANI</span>
          <span className="hidden text-xs font-bold uppercase tracking-[0.14em] text-white/70 sm:inline">{t('login_brand_tag')}</span>
        </span>
        <button onClick={() => void login()} disabled={busy}
          className="login-btn-white min-h-11 rounded-full px-5 text-base font-bold disabled:opacity-60">
          {t('login')}
        </button>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 pb-12 sm:px-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section>
          <span className="login-rise login-pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold" style={step(0)}>
            <span className="login-live-dot" aria-hidden="true" />
            {t('login_live')}
          </span>

          <h1 className="login-headline mt-6">
            <span className="login-rise block" style={step(1)}>{t('login_hero_1')}</span>
            <span className="login-rise block" style={step(2)}>{t('login_hero_2')}</span>
            <span className="login-rise block" style={step(3)}>
              <span className="login-accent">{t('login_hero_3')}</span>{t('login_hero_3b')}
            </span>
          </h1>

          <p className="login-rise mt-6 max-w-xl text-lg leading-relaxed text-white/85 sm:text-xl" style={step(4)}>{t('login_hero_sub')}</p>

          <div className="login-rise mt-8 flex flex-wrap items-center gap-4" style={step(5)}>
            <button id="login" onClick={() => void login()} disabled={busy}
              className="login-btn-white min-h-14 rounded-2xl px-7 text-lg font-extrabold disabled:opacity-60">
              {busy ? t('loading') : `${t('login')} →`}
            </button>
            <span className="text-sm leading-snug text-white/75">{t('login_cta_note_1')}<br />{t('login_cta_note_2')}</span>
          </div>
          {error && <p role="alert" className="mt-4 max-w-md rounded-2xl bg-white p-3 font-medium text-accent-ink">{error}</p>}

          {/* Phones and tablets: the agents as chips (the phone mock-up is shown on wide screens only). */}
          <ul className="login-rise mt-10 flex flex-wrap gap-2 lg:hidden" aria-label={t('login_agents')} style={step(6)}>
            {AGENTS.map((id) => (
              <li key={id} className="login-pill inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm">
                <CfoAvatar cfo={id} size={26} />
                <span><strong>{CFOS[id].name}</strong> · {CFOS[id].role}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Tilted phone: what the owner gets, the agents talking. Decorative, so hidden from screen readers. */}
        <div className="relative hidden justify-center lg:flex" aria-hidden="true">
          <div className="login-phone login-rise" style={step(3)}>
            <div className="login-screen flex h-full flex-col gap-4 p-5">
              <span className="login-pill self-center rounded-full px-3 py-1 text-xs font-semibold">
                <span className="login-live-dot mr-1.5 inline-block align-middle" />{t('login_phone_live')}
              </span>
              {([['anna', 'login_phone_anna'], ['marek', 'login_phone_marek'], ['kasia', 'login_phone_kasia']] as const).map(([id, key], i) => (
                <div key={id} className="login-bubble flex items-end gap-2" style={step(5 + i)}>
                  <CfoAvatar cfo={id} size={34} />
                  <p className="rounded-2xl rounded-bl-sm bg-white/95 px-3 py-2 text-sm font-medium text-ink">
                    <strong className="block text-xs text-stone-500">{CFOS[id].name}</strong>{t(key)}
                  </p>
                </div>
              ))}
              <div className="mt-auto space-y-2">
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-white/70">{t('login_phone_ok')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <span className="rounded-full bg-white py-2 text-center text-sm font-bold text-accent-ink">{t('approve')}</span>
                  <span className="rounded-full border border-white/40 py-2 text-center text-sm font-semibold">{t('why')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <p className="relative z-10 pb-6 text-center text-sm text-white/70">{t('runs_on_redhat')}</p>
    </div>
  );
}

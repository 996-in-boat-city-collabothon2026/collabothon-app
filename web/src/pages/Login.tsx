// Login screen. DEMO only: one "Zaloguj się" button, no fields, no Google. Logs in as the demo workshop owner.
import { useState } from 'react';
import type { User } from '@cfo/shared';
import { api } from '../api/client';
import { CFOS, type CfoId } from '@cfo/shared';
import { CfoAvatar } from '../components/ui';
import { useT } from '../i18n';
import AgentHub from '../components/AgentHub';
import Icon from '../components/Icon';

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

  const agents: CfoId[] = ['anna', 'tomasz', 'kasia', 'marek'];

  return (
    // Soft drifting colour background, big gradient logo, frosted login card (styles: index.css "Login page").
    <div className="login-bg flex min-h-screen flex-col px-4">
      <span className="login-blob" aria-hidden="true" />
      <div className="pt-4" />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-16">
        <div className="text-center">
          <div className="login-rise mx-auto -mt-4 max-w-[360px]" style={{ '--i': 0 } as React.CSSProperties}><AgentHub /></div>
          <h1 className="login-logo -mt-2 pb-2">MANI</h1>
          <p className="login-rise mt-1 text-xl font-medium text-stone-700" style={{ '--i': 2 } as React.CSSProperties}>{t('login_tagline')}</p>
          <span className="login-rise login-chip mt-4 inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-sm font-medium"
            style={{ '--i': 3 } as React.CSSProperties}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white"><Icon name="bolt" size={14} /></span>
            {t('login_demo_note')}
          </span>
        </div>

        <div id="login" className="login-rise login-card mt-8 space-y-4 p-6 sm:p-7" style={{ '--i': 4 } as React.CSSProperties}>
          {error && <p role="alert" className="rounded-2xl bg-accent-soft p-3 text-accent-ink">{error}</p>}
          <button onClick={() => void login()} disabled={busy}
            className="login-btn min-h-14 w-full rounded-full bg-accent text-lg font-bold text-white disabled:opacity-60">
            {busy ? t('loading') : `${t('login')} →`}
          </button>
          <p className="text-center text-stone-700">{t('login_hint')}</p>
        </div>

        {/* The four agents, quiet, under the form */}
        <ul className="login-rise mt-8 flex flex-wrap justify-center gap-2" aria-label={t('login_agents')} style={{ '--i': 5 } as React.CSSProperties}>
          {agents.map((id) => (
            <li key={id} className="login-chip inline-flex items-center gap-2 rounded-full border border-black/10 py-1 pl-1 pr-3 text-sm">
              <CfoAvatar cfo={id} size={26} />
              <span><strong>{CFOS[id].name}</strong> · {lang === 'pl' ? CFOS[id].rolePl : CFOS[id].role}</span>
            </li>
          ))}
        </ul>
        <p className="login-rise mt-6 text-center text-sm text-stone-600" style={{ '--i': 6 } as React.CSSProperties}>{t('runs_on_redhat')}</p>
      </main>
    </div>
  );
}

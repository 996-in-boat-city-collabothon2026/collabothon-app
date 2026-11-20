// Login screen. DEMO only: login + password form (prefilled "demo"), no Google. Logs in as the demo workshop owner.
import { useState, type FormEvent } from 'react';
import type { User } from '@cfo/shared';
import { api } from '../api/client';
import { CFOS, type CfoId } from '@cfo/shared';
import { CfoAvatar } from '../components/ui';
import { useT } from '../i18n';
import AgentHub from '../components/AgentHub';
import Icon from '../components/Icon';

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const { t, lang, setLang } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('demo');
  const [password, setPassword] = useState('demo');

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t('login_missing'));
      return;
    }
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
    <div className="dot-grid flex min-h-screen flex-col bg-white px-4">
      <div className="flex justify-end pt-4">
        <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
          className="min-h-12 rounded-full border border-black/10 bg-white px-4 text-sm font-semibold">
          {lang === 'pl' ? 'EN' : 'PL'}
        </button>
      </div>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-16">
        <div className="text-center">
          <div className="reveal mx-auto -mt-4 mb-1 max-w-[220px]"><AgentHub /></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-sm font-medium">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white"><Icon name="bolt" size={14} /></span>
            {t('login_demo_note')}
          </span>
          <h1 className="text-gradient mt-3 pb-1 text-4xl font-semibold tracking-tight">WarsztatCFO</h1>
          <p className="mt-2 text-lg text-stone-700">{t('login_tagline')}</p>
        </div>

        <form id="login" onSubmit={login} noValidate className="mt-8 space-y-4 reveal glow-mint rounded-[22px] border border-black/10 p-6 shadow-sm">
          <label className="block space-y-1.5 font-semibold">
            <span>{t('login_user')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
              className="min-h-14 w-full rounded-2xl border border-black/15 bg-white px-4 text-lg font-normal" />
          </label>
          <label className="block space-y-1.5 font-semibold">
            <span>{t('login_pass')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              className="min-h-14 w-full rounded-2xl border border-black/15 bg-white px-4 text-lg font-normal" />
          </label>
          {error && <p role="alert" className="rounded-2xl bg-accent-soft p-3 text-accent-ink">{error}</p>}
          <button disabled={busy}
            className="min-h-14 w-full rounded-full bg-accent text-lg font-bold text-white hover:brightness-95 disabled:opacity-60">
            {busy ? t('loading') : t('login')}
          </button>
          <p className="text-center text-stone-700">{t('login_hint')}</p>
        </form>

        {/* The four agents, quiet, under the form */}
        <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label={t('login_agents')}>
          {agents.map((id) => (
            <li key={id} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white py-1 pl-1 pr-3 text-sm">
              <CfoAvatar cfo={id} size={26} />
              <span><strong>{CFOS[id].name}</strong> · {lang === 'pl' ? CFOS[id].rolePl : CFOS[id].role}</span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

// Login screen. DEMO only: login + password form (prefilled "demo"), no Google. Logs in as the demo workshop owner.
import { useState, type FormEvent } from 'react';
import type { User } from '@cfo/shared';
import { api } from '../api/client';
import { useT } from '../i18n';

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

  return (
    <div className="relative flex min-h-screen flex-col justify-center px-6 py-16">
      <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
        className="absolute right-4 top-4 min-h-12 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium">
        {lang === 'pl' ? 'EN' : 'PL'}
      </button>
      <div className="mx-auto w-full max-w-sm">
        <span className="inline-flex items-center gap-2 rounded-full bg-stone-200/70 px-3 py-1 text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> {t('login_demo_note')}
        </span>
        <h1 className="mt-6 text-5xl font-extrabold leading-[0.95] tracking-tight">WarsztatCFO</h1>
        <p className="mt-4 text-lg text-stone-600">{t('login_tagline')}</p>
        <form onSubmit={login} noValidate className="mt-10 space-y-4">
          <label className="block space-y-1 text-sm font-semibold">
            <span>{t('login_user')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
              className="min-h-12 w-full rounded-full border border-stone-300 bg-white px-5 text-base font-normal" />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            <span>{t('login_pass')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              className="min-h-12 w-full rounded-full border border-stone-300 bg-white px-5 text-base font-normal" />
          </label>
          {error && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-rose-800">⚠️ {error}</p>}
          <button disabled={busy}
            className="mt-2 min-h-14 w-full rounded-full bg-stone-900 py-3 text-lg font-semibold text-white hover:bg-stone-700 disabled:opacity-60">
            {busy ? t('loading') : `${t('login')} →`}
          </button>
        </form>
        <p className="mt-4 text-sm text-stone-600">{t('login_hint')}</p>
      </div>
    </div>
  );
}

// Login screen. DEMO only: login + password form (prefilled "demo"), no Google. Logs in as the demo workshop owner.
import { useState, type FormEvent } from 'react';
import type { User } from '@cfo/shared';
import { api } from '../api/client';
import { CFOS, type CfoId } from '@cfo/shared';
import { CfoAvatar } from '../components/ui';
import { useT } from '../i18n';
import DotBlob from '../components/DotBlob';

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
  // Where each floating agent label sits around the dotted shape (phone-safe percentages)
  const spots = ['left-0 top-4', 'right-0 top-20', 'left-0 bottom-20', 'right-0 bottom-4'];

  return (
    <div className="min-h-screen bg-white px-4 pb-16 pt-4">
      {/* Slim floating top bar */}
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-full border border-stone-200 bg-white py-1.5 pl-5 pr-1.5 shadow-sm">
        <span className="whitespace-nowrap text-lg font-extrabold tracking-tight">WarsztatCFO</span>
        <span className="flex items-center gap-1.5">
          <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
            className="min-h-12 rounded-full px-4 text-sm font-semibold hover:bg-stone-100">
            {lang === 'pl' ? 'EN' : 'PL'}
          </button>
          <a href="#login" className="flex min-h-12 items-center whitespace-nowrap rounded-full bg-[#0071e3] px-5 text-sm font-semibold text-white">
            {t('login')}
          </a>
        </span>
      </nav>

      <main className="mx-auto max-w-3xl text-center">
        <span className="mt-10 inline-flex items-center gap-2 rounded-full border border-stone-200 px-3 py-1 text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> {t('login_demo_note')}
        </span>
        <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          {t('login_h1a')}{' '}
          <span className="inline-block rounded-2xl bg-stone-100 px-3 py-0.5">{t('login_h1b')}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-stone-700">{t('login_tagline')}</p>

        {/* Dotted shape with the four agents floating around it */}
        <div className="relative mx-auto mt-6 h-80 max-w-lg">
          <div className="absolute inset-8 rounded-full bg-stone-100 blur-3xl" aria-hidden="true" />
          <DotBlob className="absolute inset-0 h-full w-full" />
          {agents.map((id, i) => {
            const c = CFOS[id];
            return (
              <span key={id} className={`absolute ${spots[i]} inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/85 py-1.5 pl-1.5 pr-4 text-base font-semibold backdrop-blur`}>
                <CfoAvatar cfo={id} size={30} />
                {c.name}<span className="hidden font-normal text-stone-700 sm:inline"> · {lang === 'pl' ? c.rolePl : c.role}</span>
              </span>
            );
          })}
        </div>

        <form id="login" onSubmit={login} noValidate className="mx-auto mt-6 max-w-sm space-y-4 text-left">
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
            className="mt-2 min-h-14 w-full rounded-full bg-[#0071e3] py-3 text-lg font-semibold text-white hover:bg-[#0077ed] disabled:opacity-60">
            {busy ? t('loading') : `${t('login')} →`}
          </button>
          <p className="text-center text-sm text-stone-600">{t('login_hint')}</p>
        </form>
      </main>
    </div>
  );
}

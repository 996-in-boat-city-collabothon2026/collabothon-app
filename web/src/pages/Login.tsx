// Login screen. DEMO only: one button, no password. Logs in as the demo workshop owner.
import { useState } from 'react';
import type { User } from '@cfo/shared';
import { api } from '../api/client';
import { useT } from '../i18n';

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const { t, lang, setLang } = useT();
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4 text-white">
      <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
        className="absolute right-4 top-4 min-h-11 rounded-lg bg-white/10 px-3 text-sm">
        {lang === 'pl' ? 'EN' : 'PL'}
      </button>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900 shadow-lg">
        <p className="text-3xl font-bold">🔧 WarsztatCFO</p>
        <p className="mt-2 text-slate-600">{t('login_tagline')}</p>
        <button onClick={login} disabled={busy}
          className="mt-6 min-h-12 w-full rounded-xl bg-pink-600 py-3 text-lg font-semibold text-white hover:bg-pink-700 disabled:opacity-60">
          {busy ? t('loading') : t('login')}
        </button>
        <p className="mt-3 text-center text-sm text-slate-500">🧪 {t('login_demo_note')}</p>
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-rose-800">⚠️ {error}</p>}
      </div>
    </div>
  );
}

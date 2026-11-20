// App shell: sidebar on desktop, bottom tab bar on mobile.
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import type { User } from '@cfo/shared';
import { api, useApi } from './api/client';
import AskBubble from './components/AskBubble';
import { LlmStatusBadge } from './components/ui';
import { useT } from './i18n';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Approvals from './pages/Approvals';
import Boardroom from './pages/Boardroom';
import Ksef from './pages/Ksef';
import SettingsPage from './pages/Settings';

const NAV = [
  { to: '/', key: 'dashboard', icon: '🏠' },
  { to: '/approvals', key: 'approvals', icon: '✋' },
  { to: '/boardroom', key: 'boardroom', icon: '👥' },
  { to: '/ksef', key: 'ksef', icon: '🧾' },
  { to: '/settings', key: 'settings', icon: '⚙️' },
];

export default function App() {
  const { t, lang, setLang } = useT();
  const { data: health } = useApi(api.llmHealth);
  const navigate = useNavigate();
  // undefined = still checking, null = not logged in
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  async function logout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }

  if (user === undefined) return <p className="p-4 text-stone-600">{t('loading')}</p>;
  if (user === null) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={(u) => { setUser(u); navigate('/'); }} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Bottom padding: room for the mobile tab bar + the 💬 bubble, so it never covers the last buttons */}
      <div className="pb-40 md:pb-24">
        {/* Floating top bar: logo, menu pills (desktop), model, language, sign out */}
        <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/75 backdrop-blur-xl backdrop-saturate-150">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 py-1 pl-4 pr-2">
            <span className="whitespace-nowrap text-lg font-extrabold tracking-tight"><span aria-hidden="true" className="sm:hidden">🔧</span><span className="sr-only sm:not-sr-only">WarsztatCFO</span></span>
            <nav aria-label="Menu" className="hidden items-center gap-1 lg:flex">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end className={({ isActive }) =>
                  `flex min-h-12 items-center whitespace-nowrap rounded-full px-4 font-medium ${isActive ? 'bg-black/[0.07] font-semibold text-stone-900' : 'text-stone-700 hover:bg-zinc-100'}`}>
                  {t(n.key)}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-1.5">
              <LlmStatusBadge health={health} />
              <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')} aria-label={lang === 'pl' ? 'Switch to English' : 'Przełącz na polski'}
                className="min-h-12 rounded-full px-3 text-sm font-semibold hover:bg-zinc-100">
                {lang === 'pl' ? 'EN' : 'PL'}
              </button>
              <button onClick={logout} title={`${user.name} · demo`}
                className="min-h-12 whitespace-nowrap rounded-full bg-black/[0.06] px-4 text-sm font-semibold text-stone-900 hover:bg-black/10">{t('logout')}</button>
            </div>
          </div>
        </header>
        <main className="mx-auto min-h-screen max-w-6xl px-4 pt-8 lg:border-x lg:border-black/[0.07] lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/boardroom" element={<Boardroom />} />
            <Route path="/ksef" element={<Ksef />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <AskBubble />

      {/* Mobile bottom tabs */}
      <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-black/[0.06] bg-white/80 backdrop-blur-xl lg:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) =>
            `flex min-h-14 flex-col items-center justify-center py-1 text-center text-[13px] leading-tight ${isActive ? 'font-semibold text-stone-900' : 'text-stone-600'}`}>
            <span className="text-lg">{n.icon}</span>
            {t(n.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

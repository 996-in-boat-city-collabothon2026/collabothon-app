// App shell: sidebar on desktop, bottom tab bar on mobile.
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import type { User } from '@cfo/shared';
import { api, useApi } from './api/client';
import AskBubble from './components/AskBubble';
import Icon, { type IconName } from './components/Icon';
import { LlmStatusBadge } from './components/ui';
import { useT } from './i18n';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Report from './pages/Report';
import Approvals from './pages/Approvals';
import Boardroom from './pages/Boardroom';
import Ksef from './pages/Ksef';
import SettingsPage from './pages/Settings';

const NAV = [
  { to: '/', key: 'dashboard', icon: 'home' as IconName },
  { to: '/approvals', key: 'nav_approvals', icon: 'check-hand' as IconName },
  { to: '/boardroom', key: 'nav_boardroom', icon: 'users' as IconName },
  { to: '/ksef', key: 'ksef', icon: 'receipt' as IconName },
  { to: '/settings', key: 'settings', icon: 'settings' as IconName },
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
      {/* Bottom padding: room for the mobile tab bar + the advice bubble, so it never covers the last buttons */}
      <div className="pb-40 md:pb-24">
        {/* Floating top bar: logo, menu pills (desktop), model, language, sign out */}
        <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 py-1 pl-4 pr-2">
            <span className="whitespace-nowrap text-lg font-extrabold tracking-tight"><span aria-hidden="true" className="sm:hidden">W</span><span className="sr-only sm:not-sr-only">WarsztatCFO</span></span>
            <nav aria-label="Menu" className="hidden items-center gap-1 lg:flex">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end className={({ isActive }) =>
                  `flex min-h-12 items-center whitespace-nowrap rounded-full px-4 font-medium ${isActive ? 'bg-accent font-semibold text-white' : 'text-stone-700 hover:bg-zinc-100'}`}>
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
                className="min-h-12 whitespace-nowrap rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-zinc-800">{t('logout')}</button>
            </div>
          </div>
        </header>
        <main className="mx-auto min-h-screen max-w-6xl px-4 pt-5 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/boardroom" element={<Boardroom />} />
            <Route path="/ksef" element={<Ksef />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/report" element={<Report />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <AskBubble />

      {/* Mobile bottom tabs */}
      <nav aria-label="Menu" className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-full bg-ink p-1.5 shadow-xl lg:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) =>
            `flex min-h-14 flex-col items-center justify-center rounded-full text-center text-[13px] font-medium leading-tight ${isActive ? 'bg-accent text-white' : 'text-zinc-300'}`}>
            <Icon name={n.icon} size={22} />
            <span className="max-w-full px-0.5 text-[12px] leading-[1.1]">{t(n.key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

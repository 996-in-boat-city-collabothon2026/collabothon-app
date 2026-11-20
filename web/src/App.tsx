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
import Activity from './pages/Activity';
import SettingsPage from './pages/Settings';

const NAV = [
  { to: '/', key: 'dashboard', icon: '🏠' },
  { to: '/approvals', key: 'approvals', icon: '✋' },
  { to: '/boardroom', key: 'boardroom', icon: '👥' },
  { to: '/ksef', key: 'ksef', icon: '🧾' },
  { to: '/activity', key: 'activity', icon: '📜' },
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
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-stone-200 bg-stone-50 p-4 md:block">
        <p className="mb-6 text-xl font-extrabold tracking-tight">🔧 WarsztatCFO</p>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end className={({ isActive }) =>
              `flex min-h-12 items-center gap-2 rounded-full px-4 ${isActive ? 'bg-stone-900 font-semibold text-white' : 'hover:bg-stone-200/70'}`}>
              {n.icon} {t(n.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Bottom padding: room for the mobile tab bar + the 💬 bubble, so it never covers the last buttons */}
      <div className="min-w-0 flex-1 pb-40 md:pb-24">
        <header className="flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-100/90 px-4 py-3 backdrop-blur">
          <span className="font-extrabold tracking-tight md:hidden">🔧 WarsztatCFO</span>
          <LlmStatusBadge health={health} />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-stone-600 sm:inline">{user.name} · demo</span>
            <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')} aria-label={lang === 'pl' ? 'Switch to English' : 'Przełącz na polski'}
              className="min-h-12 rounded-full border border-stone-300 bg-white px-3 text-sm font-medium">
              {lang === 'pl' ? 'EN' : 'PL'}
            </button>
            <button onClick={logout} className="min-h-12 rounded-full bg-stone-900 px-4 text-sm font-medium text-white">{t('logout')}</button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl p-4">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/boardroom" element={<Boardroom />} />
            <Route path="/ksef" element={<Ksef />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <AskBubble />

      {/* Mobile bottom tabs */}
      <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-stone-200 bg-white md:hidden">
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

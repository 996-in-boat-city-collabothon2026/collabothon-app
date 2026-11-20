// App shell: sidebar on desktop, bottom tab bar on mobile.
import { NavLink, Route, Routes } from 'react-router-dom';
import { api, useApi } from './api/client';
import { LlmStatusBadge } from './components/ui';
import { useT } from './i18n';
import Dashboard from './pages/Dashboard';
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

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 bg-slate-900 p-4 text-white md:block">
        <p className="mb-6 text-xl font-bold">🔧 WarsztatCFO</p>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end className={({ isActive }) =>
              `block rounded-lg px-3 py-2 ${isActive ? 'bg-white/15 font-semibold' : 'hover:bg-white/10'}`}>
              {n.icon} {t(n.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="flex items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
          <span className="font-bold md:hidden">🔧 WarsztatCFO</span>
          <LlmStatusBadge health={health} />
          <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')} className="rounded-lg bg-white/10 px-3 py-1 text-sm">
            {lang === 'pl' ? 'EN' : 'PL'}
          </button>
        </header>
        <main className="mx-auto max-w-5xl p-4">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/boardroom" element={<Boardroom />} />
            <Route path="/ksef" element={<Ksef />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-6 border-t border-slate-200 bg-white md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) =>
            `flex flex-col items-center py-2 text-[11px] ${isActive ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
            <span className="text-lg">{n.icon}</span>
            {t(n.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

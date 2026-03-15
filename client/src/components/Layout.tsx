import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '../auth';
import { getProfile, getCityStats } from '../api';
import { fmtMoney } from '../types';
import { useTickRefresh } from '../hooks/useTickRefresh';
import SettingsModal from './SettingsModal';

const NAV = [
  { to: '/dashboard',    label: 'Dashboard'    },
  { to: '/performance',  label: 'Performance'  },
  { to: '/agreements',   label: 'Agreements'   },
  { to: '/research',     label: 'Research'     },
  { to: '/marketing',    label: 'Marketing'    },
  { to: '/map',          label: 'City Map'     },
];

function TickCountdown({ nextTickAt }: { nextTickAt: number }) {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.ceil((nextTickAt - Date.now()) / 1000))
  );

  useEffect(() => {
    const update = () =>
      setSecsLeft(Math.max(0, Math.ceil((nextTickAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [nextTickAt]);

  const urgent = secsLeft <= 5;
  return (
    <span
      title="Next day"
      className={`font-mono text-xs tabular-nums transition-colors ${
        urgent ? 'text-amber-400' : 'text-gray-500'
      }`}
    >
      ⏱ {String(Math.floor(secsLeft / 60)).padStart(2, '0')}:{String(secsLeft % 60).padStart(2, '0')}
    </span>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { auth, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const isMapPage  = location.pathname === '/map';
  const isChatPage = location.pathname === '/chat';

  const { nextTickAt } = useTickRefresh();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    refetchInterval: 60_000,
  });

  const { data: city } = useQuery({
    queryKey: ['city', auth?.city_id],
    queryFn: () => getCityStats(auth!.city_id),
    enabled: !!auth?.city_id,
    refetchInterval: 60_000,
  });

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">

      {/* ── Top navigation bar ─────────────────────────────────────────────── */}
      <header className="shrink-0 h-12 bg-gray-100 border-b border-gray-200 flex items-center px-4 gap-6 z-[500]">

        {/* Logo */}
        <NavLink to="/dashboard" className="flex items-center gap-1 shrink-0 mr-2">
          <span className="text-indigo-400 font-bold text-sm tracking-widest">BOTTOM</span>
          <span className="text-gray-600 font-bold text-sm tracking-widest">LINE</span>
        </NavLink>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-gray-900 bg-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right: tick timer + city info + balance + logout */}
        <div className="flex items-center gap-4 shrink-0 text-xs">
          <TickCountdown nextTickAt={nextTickAt} />
          {city && (
            <span className="text-gray-500 hidden sm:block">
              {city.name}
            </span>
          )}
          {profile && (
            <span className="font-mono text-emerald-400">{fmtMoney(profile.balance)}</span>
          )}
          <span className="text-gray-600 hidden md:block">{auth?.username}</span>
          <button
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              className="text-gray-500 hover:text-gray-900 transition-colors p-1"
            >
              <Settings size={15} />
            </button>
            <button
            onClick={handleLogout}
            title="Logout"
            className="text-gray-500 hover:text-red-400 transition-colors p-1"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className={`flex-1 min-h-0 ${(isMapPage || isChatPage) ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-6'}`}>
        {children}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

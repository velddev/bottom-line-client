import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useAuth } from '../auth';
import { getProfile, getCityStats } from '../api';
import { fmtMoney } from '../types';

const NAV = [
  { to: '/dashboard',  label: 'Dashboard'   },
  { to: '/agreements', label: 'Agreements'  },
  { to: '/research',   label: 'Research'    },
  { to: '/marketing',  label: 'Marketing'   },
  { to: '/politics',   label: 'Politics'    },
  { to: '/map',        label: 'City Map'    },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { auth, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const isMapPage = location.pathname === '/map';

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
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950">

      {/* ── Top navigation bar ─────────────────────────────────────────────── */}
      <header className="shrink-0 h-12 bg-gray-950 border-b border-gray-800 flex items-center px-4 gap-6 z-[500]">

        {/* Logo */}
        <NavLink to="/dashboard" className="flex items-center gap-1 shrink-0 mr-2">
          <span className="text-indigo-400 font-bold text-sm tracking-widest">TRADE</span>
          <span className="text-gray-400 font-bold text-sm tracking-widest">MMO</span>
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
                    ? 'text-white bg-gray-800'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right: city info + balance + logout */}
        <div className="flex items-center gap-4 shrink-0 text-xs">
          {city && (
            <span className="text-gray-500 hidden sm:block">
              {city.name}
              <span className="text-gray-700 mx-1">·</span>
              <span className="text-gray-400">Tick {city.current_tick.toLocaleString()}</span>
            </span>
          )}
          {profile && (
            <span className="font-mono text-emerald-400">{fmtMoney(profile.balance)}</span>
          )}
          <span className="text-gray-400 hidden md:block">{auth?.username}</span>
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
      <main className={`flex-1 min-h-0 ${isMapPage ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-6'}`}>
        {children}
      </main>
    </div>
  );
}

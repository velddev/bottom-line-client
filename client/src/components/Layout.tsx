import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Building2, ShoppingCart, Handshake,
  FlaskConical, Megaphone, Landmark, Map, LogOut,
} from 'lucide-react';
import { useAuth } from '../auth';
import { getProfile, getCityStats } from '../api';
import { fmtMoney, fmtPct } from '../types';
import EventFeed from './EventFeed';

const NAV = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/buildings',  icon: Building2,        label: 'Buildings'   },
  { to: '/market',     icon: ShoppingCart,     label: 'Market'      },
  { to: '/agreements', icon: Handshake,        label: 'Agreements'  },
  { to: '/research',   icon: FlaskConical,     label: 'Research'    },
  { to: '/marketing',  icon: Megaphone,        label: 'Marketing'   },
  { to: '/politics',   icon: Landmark,         label: 'Politics'    },
  { to: '/map',        icon: Map,              label: 'City Map'    },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

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
    <div className="flex h-screen overflow-hidden bg-gray-950">

      {/* ── Sidebar ── */}
      <aside className="flex flex-col w-52 shrink-0 bg-gray-900 border-r border-gray-800">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-800">
          <span className="text-indigo-400 font-bold text-lg tracking-widest">TRADE</span>
          <span className="text-gray-400 font-bold text-lg tracking-widest">MMO</span>
        </div>

        {/* Player quick-info */}
        <div className="px-4 py-3 border-b border-gray-800 text-xs">
          <p className="text-white font-semibold truncate">{auth?.username ?? '—'}</p>
          <p className="text-gray-500 truncate">📍 {city?.name ?? '…'}</p>
          {profile && (
            <p className="text-emerald-400 mt-1 font-mono">{fmtMoney(profile.balance)}</p>
          )}
          {profile && (
            <p className="text-gray-500 mt-0.5">
              Reputation <span className={profile.public_perception >= 0.5 ? 'text-amber-400' : 'text-rose-400'}>
                {fmtPct(profile.public_perception)}
              </span>
            </p>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 border-t border-gray-800 transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-6 text-xs text-gray-400">
            {city && (
              <span>🏙️ <span className="text-white font-semibold">{city.name}</span>
                <span className="text-gray-600 ml-1">· {city.population.toLocaleString()} residents</span>
              </span>
            )}
            {city && (
              <span>Round <span className="text-white font-semibold">{city.current_tick.toLocaleString()}</span></span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>

        {/* Live event feed */}
        <EventFeed cityId={auth?.city_id ?? ''} apiKey={auth?.api_key ?? ''} />
      </div>
    </div>
  );
}

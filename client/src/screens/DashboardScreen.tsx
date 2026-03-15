import { useQuery } from '@tanstack/react-query';
import { getProfile, listBuildings, listResearch, getCityStats, getInventory } from '../api';
import { fmtMoney, fmtPct, BUILDING_ICONS } from '../types';
import { useAuth } from '../auth';
import { Building2, FlaskConical, Package } from 'lucide-react';
import MarketShareChart from '../components/MarketShareChart';
import EtaCountdown from '../components/EtaCountdown';
import { useTickRefresh } from '../hooks/useTickRefresh';

const RESOURCE_ICONS: Record<string, string> = {
  water: '💧', grain: '🌾', animal_feed: '🌿', cattle: '🐄',
  meat: '🥩', leather: '🪨', food: '🍞',
};

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-gray-300 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  producing:          'Producing',
  under_construction: 'Building',
  idle:               'Idle',
  paused:             'Paused',
  missing_resources:  '⚠️ Missing Resources',
};

export default function DashboardScreen() {
  const { auth } = useAuth();
  const { nextTickAt } = useTickRefresh();
  const { data: profile, isLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const { data: buildingsResp } = useQuery({ queryKey: ['buildings'], queryFn: listBuildings });
  const { data: researchResp } = useQuery({ queryKey: ['research'], queryFn: listResearch });
  const { data: invResp } = useQuery({ queryKey: ['inventory'], queryFn: () => getInventory() });
  const { data: city } = useQuery({
    queryKey: ['city', auth?.city_id],
    queryFn: () => getCityStats(auth!.city_id),
    enabled: !!auth?.city_id,
  });

  const buildings = buildingsResp?.buildings ?? [];
  const research  = researchResp?.projects ?? [];
  const activeResearch = research.filter((r) => r.is_active);

  if (isLoading) return <div className="text-gray-500 text-sm animate-pulse">Loading profile…</div>;
  if (!profile)  return <div className="text-rose-400 text-sm">Failed to load profile.</div>;

  const buildingsByStatus = buildings.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});

  // Aggregate inventory across all buildings, group by resource type
  const resourceTotals = (invResp?.items ?? [])
    .filter((i) => i.quantity > 0)
    .reduce<Record<string, number>>((acc, i) => {
      acc[i.resource_type] = (acc[i.resource_type] ?? 0) + i.quantity;
      return acc;
    }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome back, {profile.username}!</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {city ? `Playing in ${city.name} · ${city.player_count} other traders in town` : 'Loading city info…'}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <StatCard
          label="Your Balance"
          value={fmtMoney(profile.balance)}
          accent="text-emerald-400"
        />
        <StatCard
          label="Reputation"
          value={fmtPct(profile.public_perception)}
          sub={profile.public_perception >= 0.7 ? 'Well regarded' : profile.public_perception >= 0.4 ? 'Neutral' : 'Poor standing'}
          accent={profile.public_perception >= 0.5 ? 'text-emerald-400' : 'text-rose-400'}
        />
        <StatCard
          label="Buildings"
          value={String(buildings.length)}
          sub={Object.entries(buildingsByStatus).map(([s, c]) => `${c} ${STATUS_LABEL[s] ?? s}`).join(' · ') || 'None yet'}
        />
        <StatCard
          label="Active Research"
          value={String(activeResearch.length)}
          sub={activeResearch.map((r) => r.resource_type).join(', ') || 'None running'}
        />
      </div>

      {/* City snapshot */}
      {city && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-white mb-3">🏙️ {city.name} at a Glance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-gray-300 uppercase tracking-wider mb-0.5">Population</p>
              <p className="text-white font-semibold">{city.population.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-300 uppercase tracking-wider mb-0.5">Traders</p>
              <p className="text-white font-semibold">{city.player_count}</p>
            </div>
            <div>
              <p className="text-gray-300 uppercase tracking-wider mb-0.5">Buildings</p>
              <p className="text-white font-semibold">{city.building_count}</p>
            </div>
            <div>
              <p className="text-gray-300 uppercase tracking-wider mb-0.5">Economy</p>
              <p className="text-emerald-400 font-semibold font-mono">{fmtMoney(city.gdp_per_tick)}</p>
            </div>
            <div>
              <p className="text-gray-300 uppercase tracking-wider mb-0.5">Tick</p>
              <p className="text-white font-semibold font-mono">#{city.current_tick}</p>
            </div>
          </div>
        </div>
      )}

      {/* Resources overview */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package size={14} className="text-teal-400" />
          <h2 className="text-sm font-semibold text-white">Your Resources</h2>
          <span className="text-gray-400 text-xs ml-1">(across all buildings)</span>
        </div>
        {Object.keys(resourceTotals).length === 0 ? (
          <p className="text-gray-400 text-xs">No resources in stock. Produce or buy from the market.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(resourceTotals).map(([type, qty]) => (
              <div key={type} className="bg-gray-800 rounded px-3 py-2 text-xs min-w-[90px]">
                <span className="text-base mr-1">{RESOURCE_ICONS[type] ?? '📦'}</span>
                <span className="text-white font-semibold font-mono">{qty % 1 === 0 ? qty : qty.toFixed(1)}</span>
                <p className="text-gray-500 mt-0.5 capitalize">{type}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buildings overview */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <Building2 size={14} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Your Buildings</h2>
          <span className="ml-auto text-xs text-gray-400">{buildings.length} total</span>
        </div>
        {buildings.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-3xl mb-2">🏗️</p>
            <p className="text-sm">No buildings yet — head to the City Map to purchase a tile and construct your first building.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-800">
                  {['Name', 'Type', 'Status', 'Recipe / Capacity', 'Workers', 'Level'].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => (
                  <tr key={b.building_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-2 text-white font-medium max-w-[160px] truncate" title={b.name}>{b.name}</td>
                    <td className="px-4 py-2 text-gray-400 capitalize">{BUILDING_ICONS[b.building_type] ?? '🏗️'} {b.building_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        b.status === 'producing'          ? 'bg-emerald-900/40 text-emerald-400' :
                        b.status === 'under_construction' ? 'bg-amber-900/40 text-amber-400' :
                        b.status === 'paused'             ? 'bg-yellow-900/40 text-yellow-400' :
                        b.status === 'missing_resources'  ? 'bg-rose-900/40 text-rose-400' :
                                                            'bg-gray-800 text-gray-500'
                      }`}>{STATUS_LABEL[b.status] ?? b.status}</span>
                      {b.status === 'under_construction' && b.construction_ticks_remaining > 0 && (
                        <span className="ml-1 text-gray-500 text-xs">
                          (<EtaCountdown ticks={b.construction_ticks_remaining} nextTickAt={nextTickAt} />)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {b.population_capacity > 0
                        ? <span className="text-blue-400">👥 {b.population_capacity.toLocaleString()} capacity</span>
                        : (b.active_recipe || '—')}
                    </td>
                    <td className="px-4 py-2 text-gray-300">{b.workers}</td>
                    <td className="px-4 py-2 text-gray-300">{b.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Research overview */}
      {activeResearch.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
            <FlaskConical size={14} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Active Research</h2>
          </div>
          <div className="p-4 space-y-3">
            {activeResearch.map((r) => (
              <div key={r.resource_type}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 capitalize">{r.resource_type} <span className="text-gray-500">Level {r.level}</span></span>
                  <span className="text-gray-400">{(r.progress * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${r.progress * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market share chart */}
      {auth?.city_id && <MarketShareChart cityId={auth.city_id} />}
    </div>
  );
}

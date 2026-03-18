import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProfile, listBuildings, listResearch, getCityStats, getInventory, listOfferings, cancelOffering, purchase, getDemandUtilization, getUtilities } from '../api';
import { fmtMoney, fmtPct, fmtQuality, resourceColor, BUILDING_ICONS, tickToDate, type DemandUtilizationPoint, type UtilityInfo } from '../types';
import { useAuth } from '../auth';
import { Building2, FlaskConical, Package, ShoppingCart, X, Zap, Droplets } from 'lucide-react';
import MarketShareChart from '../components/MarketShareChart';
import EtaCountdown from '../components/EtaCountdown';
import { useTickRefresh } from '../hooks/useTickRefresh';
import Modal, { Field, Input, Select } from '../components/Modal';

const RESOURCES = ['grain', 'animal_feed', 'cattle', 'meat', 'leather', 'food'];

const RESOURCE_ICONS: Record<string, string> = {
  grain: '🌾', animal_feed: '🌿', cattle: '🐄',
  meat: '🥩', leather: '🪨', food: '🍞',
};

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
      <p className="text-gray-700 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
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
  const qc = useQueryClient();
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

  const [resourceFilter, setResourceFilter] = useState('');
  const { data: offeringsResp, isLoading: offeringsLoading } = useQuery({
    queryKey: ['offerings', auth?.city_id, resourceFilter],
    queryFn: () => listOfferings(auth!.city_id, resourceFilter || undefined),
    enabled: !!auth?.city_id,
    refetchInterval: 30_000,
  });
  const offerings = offeringsResp?.offerings ?? [];

  const { data: demandResp } = useQuery({
    queryKey: ['demand-utilization', auth?.city_id],
    queryFn: () => getDemandUtilization(auth!.city_id, 1),
    enabled: !!auth?.city_id,
    refetchInterval: 60_000,
  });
  const latestDemand = Object.values(
    (demandResp?.data ?? []).reduce<Record<string, DemandUtilizationPoint>>((acc, p) => {
      if (!acc[p.resource_type] || p.tick > acc[p.resource_type].tick) acc[p.resource_type] = p;
      return acc;
    }, {})
  );

  const { data: utilitiesResp } = useQuery({
    queryKey: ['utilities', auth?.city_id],
    queryFn: () => getUtilities(auth!.city_id),
    enabled: !!auth?.city_id,
    refetchInterval: 60_000,
  });
  const utilities = utilitiesResp?.utilities ?? [];

  const [buyTarget, setBuyTarget] = useState<typeof offerings[0] | null>(null);
  const [buyForm, setBuyForm] = useState({ building_id: '', quantity: '' });
  const buyMut = useMutation({
    mutationFn: () => purchase(buyForm.building_id, buyTarget!.offering_id, parseFloat(buyForm.quantity)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['offerings'] }); setBuyTarget(null); },
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelOffering(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offerings'] }),
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
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {profile.username}!</h1>
        <p className="text-gray-600 text-sm mt-0.5">
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
        <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">🏙️ {city.name} at a Glance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-gray-700 uppercase tracking-wider mb-0.5">Population</p>
              <p className="text-gray-900 font-semibold">{city.population.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-700 uppercase tracking-wider mb-0.5">Traders</p>
              <p className="text-gray-900 font-semibold">{city.player_count}</p>
            </div>
            <div>
              <p className="text-gray-700 uppercase tracking-wider mb-0.5">Buildings</p>
              <p className="text-gray-900 font-semibold">{city.building_count}</p>
            </div>
            <div>
              <p className="text-gray-700 uppercase tracking-wider mb-0.5">Economy</p>
              <p className="text-emerald-400 font-semibold font-mono">{fmtMoney(city.gdp_per_tick)}</p>
            </div>
            <div>
              <p className="text-gray-700 uppercase tracking-wider mb-0.5">Day</p>
              <p className="text-gray-900 font-semibold font-mono">{tickToDate(city.current_tick)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Utilities */}
      {utilities.length > 0 && (
        <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-900">City-wide Utilities</h2>
            <span className="text-[10px] text-gray-500 font-normal">(shared across all players)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {utilities.map((u) => {
              const icon = u.name === 'Electricity' ? <Zap size={16} className="text-amber-400" /> : <Droplets size={16} className="text-cyan-400" />;
              const utilizationColor = u.is_overloaded ? 'text-rose-400' : u.utilization_pct > 60 ? 'text-amber-400' : 'text-emerald-400';
              return (
                <div key={u.name} className="bg-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {icon}
                    <span className="text-sm font-semibold text-gray-900">{u.name}</span>
                    {u.is_overloaded && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-medium">OVERLOADED</span>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {u.capacity > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Consumption</span>
                          <span className="text-gray-900 font-mono">{Math.round(u.consumption).toLocaleString()} / {u.capacity.toLocaleString()} units</span>
                        </div>
                        <div className="w-full bg-gray-300 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${u.is_overloaded ? 'bg-rose-400' : u.utilization_pct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(u.utilization_pct, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Grid Utilization</span>
                          <span className={`font-semibold font-mono ${utilizationColor}`}>{u.utilization_pct.toFixed(1)}%</span>
                        </div>
                      </>
                    )}
                    {u.capacity === 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Consumption</span>
                        <span className="text-gray-900 font-mono">{Math.round(u.consumption).toLocaleString()} units/tick</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Rate</span>
                      <span className="text-gray-900 font-mono">{fmtMoney(u.effective_rate_cents)}/unit</span>
                    </div>
                    {u.is_overloaded && u.effective_rate_cents !== u.rate_cents && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Base Rate</span>
                        <span className="text-gray-500 font-mono line-through">{fmtMoney(u.rate_cents)}/unit</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resources overview */}
      <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package size={14} className="text-teal-400" />
          <h2 className="text-sm font-semibold text-gray-900">Your Resources</h2>
          <span className="text-gray-600 text-xs ml-1">(across all buildings)</span>
        </div>
        {Object.keys(resourceTotals).length === 0 ? (
          <p className="text-gray-600 text-xs">No resources in stock. Produce or buy from the market.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(resourceTotals).map(([type, qty]) => (
              <div key={type} className="bg-gray-100 rounded px-3 py-2 text-xs min-w-[90px]">
                <span className="text-base mr-1">{RESOURCE_ICONS[type] ?? '📦'}</span>
                <span className="text-gray-900 font-semibold font-mono">{qty % 1 === 0 ? qty : qty.toFixed(1)}</span>
                <p className="text-gray-500 mt-0.5 capitalize">{type}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buildings overview */}
      <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <Building2 size={14} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-gray-900">Your Buildings</h2>
          <span className="ml-auto text-xs text-gray-600">{buildings.length} total</span>
        </div>
        {buildings.length === 0 ? (
          <div className="text-center py-10 text-gray-600">
            <p className="text-3xl mb-2">🏗️</p>
            <p className="text-sm">No buildings yet — head to the City Map to purchase a tile and construct your first building.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-gray-200">
                  {['Name', 'Type', 'Status', 'Recipe / Capacity', 'Workers', 'Level'].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => (
                  <tr key={b.building_id} className="border-b border-gray-200 hover:bg-gray-100/30">
                    <td className="px-4 py-2 text-gray-900 font-medium max-w-[160px] truncate" title={b.name}>{b.name}</td>
                    <td className="px-4 py-2 text-gray-600 capitalize">{BUILDING_ICONS[b.building_type] ?? '🏗️'} {b.building_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        b.status === 'producing'          ? 'bg-emerald-900/40 text-emerald-400' :
                        b.status === 'under_construction' ? 'bg-amber-900/40 text-amber-400' :
                        b.status === 'paused'             ? 'bg-yellow-900/40 text-yellow-400' :
                        b.status === 'missing_resources'  ? 'bg-rose-900/40 text-rose-400' :
                                                            'bg-gray-100 text-gray-500'
                      }`}>{STATUS_LABEL[b.status] ?? b.status}</span>
                      {b.status === 'under_construction' && b.construction_ticks_remaining > 0 && (
                        <span className="ml-1 text-gray-500 text-xs">
                          (<EtaCountdown ticks={b.construction_ticks_remaining} nextTickAt={nextTickAt} />)
                        </span>
                      )}
                      {b.status === 'producing' && b.ticks_to_ready > 0 && (
                        <span className="ml-1 text-gray-500 text-xs">
                          (<EtaCountdown ticks={b.ticks_to_ready} nextTickAt={nextTickAt} />)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {b.population_capacity > 0
                        ? <span className="text-blue-400">👥 {b.population_capacity.toLocaleString()} capacity</span>
                        : (b.active_recipe || '—')}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{b.workers}</td>
                    <td className="px-4 py-2 text-gray-700">{b.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Research overview */}
      {activeResearch.length > 0 && (
        <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
            <FlaskConical size={14} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-gray-900">Active Research</h2>
          </div>
          <div className="p-4 space-y-3">
            {activeResearch.map((r) => (
              <div key={r.resource_type}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-700 capitalize">{r.resource_type} <span className="text-gray-500">Level {r.level}</span></span>
                  <span className="text-gray-600">{(r.progress * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${r.progress * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Demand utilization — quick summary across all resources */}
      {latestDemand.length > 0 && (
        <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">📊 Demand Overview (this tick)</h2>
          </div>
          <div className="grid grid-cols-3 gap-px bg-gray-300">
            {latestDemand.map((p) => {
              const pct = p.utilization_pct;
              const unmet = Math.max(0, p.total_demand - p.fulfilled_demand);
              return (
                <div key={p.resource_type} className="bg-gray-200 px-3 py-2.5">
                  <p className={`text-[10px] font-semibold uppercase tracking-wider capitalize ${resourceColor(p.resource_type)}`}>
                    {p.resource_type.replace(/_/g, ' ')}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-gray-300 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-rose-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className={`font-mono text-xs font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between mt-0.5 text-[9px] text-gray-500">
                    <span>{p.fulfilled_demand.toFixed(0)} / {p.total_demand.toFixed(0)}</span>
                    {unmet > 0 && <span className="text-rose-500">{unmet.toFixed(0)} unmet</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Market share chart — detailed per-resource view with unfulfilled demand */}
      {auth?.city_id && <MarketShareChart cityId={auth.city_id} />}

      {/* City market — live offerings */}
      <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <ShoppingCart size={14} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-gray-900">City Market</h2>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <button
              onClick={() => setResourceFilter('')}
              className={`px-2 py-0.5 rounded border text-xs transition-colors ${!resourceFilter ? 'border-indigo-500 text-indigo-300 bg-indigo-900/20' : 'border-gray-200 text-gray-600 hover:border-gray-500'}`}
            >All</button>
            {RESOURCES.map((r) => (
              <button key={r} onClick={() => setResourceFilter(r === resourceFilter ? '' : r)}
                className={`px-2 py-0.5 rounded border text-xs capitalize transition-colors ${r === resourceFilter ? 'border-indigo-500 text-indigo-300 bg-indigo-900/20' : 'border-gray-200 text-gray-600 hover:border-gray-500'} ${resourceColor(r)}`}
              >{r}</button>
            ))}
          </div>
        </div>
        {offeringsLoading && <p className="text-gray-500 text-xs px-4 py-3 animate-pulse">Loading market…</p>}
        {!offeringsLoading && offerings.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-xs">
            <p className="text-2xl mb-2">📭</p>No offerings in this city right now.
          </div>
        )}
        {offerings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-gray-200">
                  {['Seller', 'Resource', 'Price/Unit', 'Qty', 'Quality', 'Brand', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offerings.map((o) => (
                  <tr key={o.offering_id} className="border-b border-gray-200 hover:bg-gray-100/20">
                    <td className="px-4 py-2 text-gray-700">{o.seller_name}</td>
                    <td className={`px-4 py-2 capitalize font-medium ${resourceColor(o.resource_type)}`}>{o.resource_type}</td>
                    <td className="px-4 py-2 text-emerald-400 font-mono">{fmtMoney(o.price_per_unit)}</td>
                    <td className="px-4 py-2 text-gray-700 font-mono">{o.quantity.toFixed(1)}</td>
                    <td className="px-4 py-2 text-gray-700 font-mono">{fmtQuality(o.quality)}</td>
                    <td className="px-4 py-2 text-gray-600">{o.brand_name || '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setBuyTarget(o); setBuyForm({ building_id: '', quantity: '1' }); }}
                          className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                        ><ShoppingCart size={11} /> Buy</button>
                        <button onClick={() => cancelMut.mutate(o.offering_id)} title="Cancel offering"
                          className="text-gray-600 hover:text-rose-400 transition-colors"><X size={11} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {buyTarget && (
        <Modal
          title={`Buy ${buyTarget.resource_type} from ${buyTarget.seller_name}`}
          onClose={() => setBuyTarget(null)}
          onSubmit={() => buyMut.mutate()}
          submitLabel={buyMut.isPending ? 'Purchasing…' : 'Purchase'}
          submitDisabled={buyMut.isPending}
        >
          <div className="bg-gray-100 rounded p-3 text-xs space-y-1 text-gray-700">
            <p>Price: <span className="text-emerald-400 font-mono">{fmtMoney(buyTarget.price_per_unit)}</span> per unit</p>
            <p>Available: <span className="text-gray-900 font-mono">{buyTarget.quantity.toFixed(1)}</span></p>
            <p>Quality: <span className="text-gray-900 font-mono">{fmtQuality(buyTarget.quality)}</span></p>
          </div>
          <Field label="Deliver to Building">
            <Select value={buyForm.building_id} onChange={(e) => setBuyForm((f) => ({ ...f, building_id: e.target.value }))}>
              <option value="">— Select —</option>
              {buildings.map((b) => <option key={b.building_id} value={b.building_id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Quantity">
            <Input type="number" min="0.1" step="0.1" max={buyTarget.quantity} value={buyForm.quantity}
              onChange={(e) => setBuyForm((f) => ({ ...f, quantity: e.target.value }))} />
          </Field>
          {buyForm.quantity && (
            <p className="text-xs text-gray-600">Total: <span className="text-emerald-400 font-mono">{fmtMoney(parseFloat(buyForm.quantity) * buyTarget.price_per_unit)}</span></p>
          )}
          {buyMut.isError && <p className="text-rose-400 text-xs">{(buyMut.error as Error).message}</p>}
        </Modal>
      )}
    </div>
  );
}

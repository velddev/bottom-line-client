import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';
import { getPriceHistory, listOfferings, getProfile } from '../api';
import type { PriceHistoryPoint, Offering } from '../types';
import { fmtMoney, RESOURCE_COLORS } from '../types';
import { Spinner } from '../components/ui';

// BG-fill colors for sparkline area charts
const RESOURCE_BG_COLORS: Record<string, string> = {
  grain:       'rgba(250, 204,  21, 0.2)',
  water:       'rgba( 96, 165, 250, 0.2)',
  animal_feed: 'rgba(163, 230,  53, 0.2)',
  cattle:      'rgba(251, 146,  60, 0.2)',
  meat:        'rgba(248, 113, 113, 0.2)',
  leather:     'rgba(245, 158,  11, 0.2)',
  food:        'rgba( 74, 222, 128, 0.2)',
};

const RESOURCE_STROKE_COLORS: Record<string, string> = {
  grain:       '#facc15',
  water:       '#60a5fa',
  animal_feed: '#a3e635',
  cattle:      '#fb923c',
  meat:        '#f87171',
  leather:     '#f59e0b',
  food:        '#4ade80',
};

// Ordered display
const RESOURCE_ORDER = ['food', 'meat', 'leather', 'grain', 'animal_feed', 'cattle', 'water'];

interface ResourceSummary {
  resource: string;
  latestAvg: number;
  prevAvg: number;
  minPrice: number;
  maxPrice: number;
  totalVolume: number;
  points: PriceHistoryPoint[];
  currentOfferings: Offering[];
}

// Mini sparkline SVG
function Sparkline({ points, resource }: { points: PriceHistoryPoint[]; resource: string }) {
  if (points.length < 2) return null;

  const prices = points.map(p => p.avg_price_cents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const w = 120;
  const h = 32;
  const pad = 2;

  const pts = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((p - min) / range) * (h - 2 * pad);
    return { x, y };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L ${pts[pts.length - 1].x.toFixed(1)} ${h} L ${pts[0].x.toFixed(1)} ${h} Z`;

  const stroke = RESOURCE_STROKE_COLORS[resource] ?? '#94a3b8';
  const fill = RESOURCE_BG_COLORS[resource] ?? 'rgba(148, 163, 184, 0.2)';

  return (
    <svg width={w} height={h} className="block">
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function TrendIcon({ change }: { change: number }) {
  if (change > 0.5) return <TrendingUp size={14} className="text-emerald-400" />;
  if (change < -0.5) return <TrendingDown size={14} className="text-rose-400" />;
  return <Minus size={14} className="text-gray-500" />;
}

function formatPctChange(latest: number, prev: number): string {
  if (prev === 0) return '—';
  const pct = ((latest - prev) / prev) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export default function StockMarketScreen() {
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  });

  const cityId = profile?.city_id ?? '';

  const { data: priceData, isLoading: loadingPrices } = useQuery({
    queryKey: ['price-history', cityId],
    queryFn: () => getPriceHistory(cityId, 30),
    enabled: !!cityId,
    staleTime: 30_000,
  });

  const { data: offeringsData, isLoading: loadingOfferings } = useQuery({
    queryKey: ['all-offerings', cityId],
    queryFn: () => listOfferings(cityId),
    enabled: !!cityId,
    staleTime: 30_000,
  });

  const [selectedResource, setSelectedResource] = useState<string | null>(null);

  const summaries = useMemo<ResourceSummary[]>(() => {
    const points = priceData?.data ?? [];
    const offerings = offeringsData?.offerings ?? [];

    const byResource: Record<string, PriceHistoryPoint[]> = {};
    for (const p of points) {
      const r = p.resource_type;
      if (!byResource[r]) byResource[r] = [];
      byResource[r].push(p);
    }

    const offeringsByResource: Record<string, Offering[]> = {};
    for (const o of offerings) {
      const r = o.resource_type;
      if (!offeringsByResource[r]) offeringsByResource[r] = [];
      offeringsByResource[r].push(o);
    }

    const allResources = new Set([...Object.keys(byResource), ...Object.keys(offeringsByResource)]);

    return RESOURCE_ORDER
      .filter(r => allResources.has(r))
      .map(resource => {
        const pts = (byResource[resource] ?? []).sort((a, b) => a.tick - b.tick);
        const latest = pts[pts.length - 1];
        const prev = pts.length >= 2 ? pts[pts.length - 2] : undefined;

        return {
          resource,
          latestAvg: latest?.avg_price_cents ?? 0,
          prevAvg: prev?.avg_price_cents ?? latest?.avg_price_cents ?? 0,
          minPrice: pts.length > 0 ? Math.min(...pts.map(p => p.min_price_cents)) : 0,
          maxPrice: pts.length > 0 ? Math.max(...pts.map(p => p.max_price_cents)) : 0,
          totalVolume: pts.reduce((s, p) => s + p.total_volume, 0),
          points: pts,
          currentOfferings: offeringsByResource[resource] ?? [],
        };
      });
  }, [priceData, offeringsData]);

  const selected = selectedResource
    ? summaries.find(s => s.resource === selectedResource)
    : null;

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <BarChart2 size={18} className="text-indigo-400" />
        <h1 className="text-lg font-bold text-gray-900 uppercase tracking-wider">
          Market
        </h1>
        <span className="text-xs text-gray-500 ml-2">Last 30 days</span>
      </div>

      {(loadingPrices || loadingOfferings) && (
        <div className="flex items-center gap-2 text-gray-500 text-xs mb-4">
          <Spinner size="sm" /> Loading market data…
        </div>
      )}

      {/* Resource table */}
      <div className="bg-gray-200 border border-gray-300 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-300 text-[10px] uppercase tracking-wider text-gray-600">
              <th className="text-left py-2 px-3">Resource</th>
              <th className="text-right px-3">Avg Price</th>
              <th className="text-right px-3">Change</th>
              <th className="text-right px-3">Low</th>
              <th className="text-right px-3">High</th>
              <th className="text-right px-3">Volume</th>
              <th className="text-center px-3">Trend</th>
              <th className="text-right px-3">Listings</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map(s => {
              const isSelected = selectedResource === s.resource;
              const change = s.prevAvg > 0
                ? ((s.latestAvg - s.prevAvg) / s.prevAvg) * 100
                : 0;

              return (
                <tr
                  key={s.resource}
                  onClick={() => setSelectedResource(isSelected ? null : s.resource)}
                  className={`border-b border-gray-300/40 cursor-pointer transition-colors ${
                    isSelected ? 'bg-gray-300/60' : 'hover:bg-gray-300/30'
                  }`}
                >
                  <td className="py-2 px-3">
                    <span className={`font-semibold capitalize ${RESOURCE_COLORS[s.resource] ?? 'text-gray-900'}`}>
                      {s.resource.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="text-right px-3 font-mono text-gray-900">
                    {s.latestAvg > 0 ? fmtMoney(s.latestAvg) : '—'}
                  </td>
                  <td className={`text-right px-3 font-mono ${
                    change > 0 ? 'text-emerald-400' : change < 0 ? 'text-rose-400' : 'text-gray-500'
                  }`}>
                    {s.latestAvg > 0 ? formatPctChange(s.latestAvg, s.prevAvg) : '—'}
                  </td>
                  <td className="text-right px-3 font-mono text-gray-500">
                    {s.minPrice > 0 ? fmtMoney(s.minPrice) : '—'}
                  </td>
                  <td className="text-right px-3 font-mono text-gray-500">
                    {s.maxPrice > 0 ? fmtMoney(s.maxPrice) : '—'}
                  </td>
                  <td className="text-right px-3 font-mono text-gray-700">
                    {s.totalVolume > 0 ? s.totalVolume.toFixed(0) : '—'}
                  </td>
                  <td className="text-center px-3">
                    <div className="inline-flex items-center gap-1">
                      <Sparkline points={s.points} resource={s.resource} />
                      <TrendIcon change={change} />
                    </div>
                  </td>
                  <td className="text-right px-3 font-mono text-gray-700">
                    {s.currentOfferings.length}
                  </td>
                </tr>
              );
            })}
            {summaries.length === 0 && !loadingPrices && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">
                  No market data yet — trades will appear after the first sales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mt-4 bg-gray-200 border border-gray-300 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-sm font-bold capitalize ${RESOURCE_COLORS[selected.resource] ?? 'text-gray-900'}`}>
              {selected.resource.replace('_', ' ')}
            </h2>
            <button
              onClick={() => setSelectedResource(null)}
              className="text-gray-500 hover:text-gray-700 text-xs"
            >
              Close
            </button>
          </div>

          {/* Price history table */}
          <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">
            Price History
          </p>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-[10px] text-gray-500">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-0.5 pr-3 uppercase tracking-wider">Day</th>
                  <th className="text-right pr-3 uppercase tracking-wider">Avg</th>
                  <th className="text-right pr-3 uppercase tracking-wider">Min</th>
                  <th className="text-right pr-3 uppercase tracking-wider">Max</th>
                  <th className="text-right pr-3 uppercase tracking-wider">Volume</th>
                  <th className="text-right uppercase tracking-wider">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {[...selected.points].reverse().map(p => (
                  <tr key={p.tick} className="border-b border-gray-300/40">
                    <td className="py-0.5 pr-3 font-mono text-gray-700">{p.tick}</td>
                    <td className="text-right pr-3 font-mono text-gray-900">{fmtMoney(p.avg_price_cents)}</td>
                    <td className="text-right pr-3 font-mono text-gray-500">{fmtMoney(p.min_price_cents)}</td>
                    <td className="text-right pr-3 font-mono text-gray-500">{fmtMoney(p.max_price_cents)}</td>
                    <td className="text-right pr-3 font-mono text-gray-700">{p.total_volume.toFixed(1)}</td>
                    <td className="text-right font-mono text-emerald-400">{fmtMoney(p.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Current listings */}
          {selected.currentOfferings.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2 mt-4">
                Current Listings ({selected.currentOfferings.length})
              </p>
              <div className="space-y-1">
                {selected.currentOfferings
                  .sort((a, b) => a.price_per_unit - b.price_per_unit)
                  .map(o => (
                    <div key={o.offering_id} className="flex items-center justify-between bg-gray-100 rounded px-2 py-1 text-xs">
                      <span className="text-gray-700 truncate max-w-[160px]">{o.seller_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-gray-900">{fmtMoney(o.price_per_unit)}</span>
                        <span className="text-gray-500">×{o.quantity.toFixed(0)}</span>
                        {o.quality > 0 && (
                          <span className="text-indigo-400 text-[10px]">Q{o.quality.toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

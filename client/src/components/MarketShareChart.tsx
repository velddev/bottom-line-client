import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { getMarketShare, getDemandUtilization } from '../api';
import { fmtMoney } from '../types';
import type { DemandUtilizationPoint } from '../types';

const CONSUMER_RESOURCES = ['food', 'meat', 'leather'];

const PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];
const UNFULFILLED_COLOR = '#d1d5db';
const GOV_COLOR = '#94a3b8';

interface Props {
  cityId: string;
  historyTicks?: number;
}

export default function MarketShareChart({ cityId, historyTicks = 30 }: Props) {
  const [resourceType, setResourceType] = useState('food');

  const { data: shareData, isLoading: shareLoading } = useQuery({
    queryKey: ['market-share', cityId, resourceType, historyTicks],
    queryFn: () => getMarketShare(cityId, resourceType, historyTicks),
    enabled: !!cityId,
    refetchInterval: 30_000,
  });

  const { data: demandData, isLoading: demandLoading } = useQuery({
    queryKey: ['demand-utilization', cityId, historyTicks],
    queryFn: () => getDemandUtilization(cityId, historyTicks),
    enabled: !!cityId,
    refetchInterval: 30_000,
  });

  const isLoading = shareLoading || demandLoading;

  const { chartData, players, totals } = useMemo(() => {
    const points = shareData?.data ?? [];
    const demandPoints = demandData?.data ?? [];

    // Demand index: tick → DemandUtilizationPoint for selected resource
    const demandByTick: Record<number, DemandUtilizationPoint> = {};
    for (const dp of demandPoints) {
      if (dp.resource_type === resourceType) {
        demandByTick[dp.tick] = dp;
      }
    }

    // Collect unique players (separate government)
    const playerList: { id: string; name: string; isGov: boolean }[] = [];
    const seen = new Set<string>();
    for (const pt of points) {
      if (!seen.has(pt.player_id)) {
        seen.add(pt.player_id);
        const isGov = pt.player_name.toLowerCase().includes('government')
          || pt.player_name.toLowerCase().includes('gov port');
        playerList.push({ id: pt.player_id, name: pt.player_name, isGov });
      }
    }

    // Sort: government last, then alphabetical
    playerList.sort((a, b) => {
      if (a.isGov !== b.isGov) return a.isGov ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    // All ticks from both sources
    const allTicks = new Set<number>();
    for (const pt of points) allTicks.add(pt.tick);
    for (const dp of demandPoints) {
      if (dp.resource_type === resourceType) allTicks.add(dp.tick);
    }
    const ticks = [...allTicks].sort((a, b) => a - b);

    // Build chart rows
    const rows = ticks.map((tick) => {
      const row: Record<string, number | string> = { tick: String(tick) };
      let soldTotal = 0;

      for (const { id, name } of playerList) {
        const pt = points.find((d) => d.tick === tick && d.player_id === id);
        const vol = pt ? pt.sale_volume : 0;
        row[name] = Math.round(vol * 100) / 100;
        soldTotal += vol;
      }

      const demand = demandByTick[tick];
      const totalDemand = demand ? demand.total_demand : soldTotal;
      const unfulfilled = Math.max(0, totalDemand - soldTotal);
      row['Unfulfilled'] = Math.round(unfulfilled * 100) / 100;
      row['_totalDemand'] = Math.round(totalDemand * 100) / 100;
      row['_soldTotal'] = Math.round(soldTotal * 100) / 100;

      return row;
    });

    // Compute period totals
    let totalSold = 0;
    let totalDemand = 0;
    let totalUnfulfilled = 0;
    for (const row of rows) {
      totalSold += row['_soldTotal'] as number;
      totalDemand += row['_totalDemand'] as number;
      totalUnfulfilled += row['Unfulfilled'] as number;
    }

    return {
      chartData: rows,
      players: playerList,
      totals: { sold: totalSold, demand: totalDemand, unfulfilled: totalUnfulfilled, ticks: rows.length },
    };
  }, [shareData, demandData, resourceType]);

  const utilPct = totals.demand > 0 ? (totals.sold / totals.demand) * 100 : 0;

  return (
    <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">🛒 Market Demand & Supply</h2>
        <select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          className="bg-gray-100 border border-gray-200 text-gray-900 text-xs rounded px-2 py-1"
        >
          {CONSUMER_RESOURCES.map((r) => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      {!isLoading && chartData.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total demand</p>
            <p className="text-sm font-bold font-mono text-gray-900">{totals.demand.toFixed(0)}</p>
            <p className="text-[10px] text-gray-400">units / {totals.ticks} days</p>
          </div>
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Fulfilled</p>
            <p className={`text-sm font-bold font-mono ${utilPct >= 80 ? 'text-emerald-600' : utilPct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
              {utilPct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400">{totals.sold.toFixed(0)} units sold</p>
          </div>
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Unmet demand</p>
            <p className={`text-sm font-bold font-mono ${totals.unfulfilled > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {totals.unfulfilled.toFixed(0)}
            </p>
            <p className="text-[10px] text-gray-400">units wasted</p>
          </div>
        </div>
      )}

      {isLoading && (
        <p className="text-gray-500 text-xs animate-pulse py-6 text-center">Loading…</p>
      )}

      {!isLoading && chartData.length === 0 && (
        <p className="text-gray-600 text-xs py-6 text-center">
          No data yet — citizen demand runs each tick.
        </p>
      )}

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="tick" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#f3f4f6', border: '1px solid #d1d5db', fontSize: 11, borderRadius: 6 }}
              formatter={(value, name) => {
                const v = Number(value ?? 0);
                if (name === 'Unfulfilled') return [`${v.toFixed(1)} units`, '⬜ Unfulfilled'];
                return [`${v.toFixed(1)} units`, name];
              }}
              labelFormatter={(label) => `Day ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => {
                if (value === 'Unfulfilled') return <span style={{ color: '#9ca3af' }}>⬜ Unfulfilled</span>;
                return value;
              }}
            />
            {players.map(({ name, isGov }, i) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="demand"
                fill={isGov ? GOV_COLOR : PALETTE[i % PALETTE.length]}
                fillOpacity={isGov ? 0.7 : 0.85}
              />
            ))}
            <Bar
              dataKey="Unfulfilled"
              stackId="demand"
              fill={UNFULFILLED_COLOR}
              fillOpacity={0.5}
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Per-player breakdown */}
      {!isLoading && players.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Seller breakdown (last {totals.ticks} days)</p>
          {players.map(({ name, isGov }, i) => {
            const playerTotal = chartData.reduce((sum, row) => sum + ((row[name] as number) || 0), 0);
            const sharePct = totals.demand > 0 ? (playerTotal / totals.demand) * 100 : 0;
            return (
              <div key={name} className="flex items-center gap-2 text-xs">
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: isGov ? GOV_COLOR : PALETTE[i % PALETTE.length] }}
                />
                <span className="flex-1 text-gray-700 truncate">
                  {name} {isGov && <span className="text-[9px] text-gray-400">(Gov)</span>}
                </span>
                <span className="font-mono text-gray-600 w-16 text-right">{playerTotal.toFixed(1)}</span>
                <span className="font-mono text-gray-500 w-14 text-right">{sharePct.toFixed(1)}%</span>
              </div>
            );
          })}
          {totals.unfulfilled > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-sm shrink-0 bg-gray-300" />
              <span className="flex-1 text-gray-500">Unfulfilled demand</span>
              <span className="font-mono text-rose-500 w-16 text-right">{totals.unfulfilled.toFixed(1)}</span>
              <span className="font-mono text-rose-500 w-14 text-right">{(totals.demand > 0 ? (totals.unfulfilled / totals.demand) * 100 : 0).toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

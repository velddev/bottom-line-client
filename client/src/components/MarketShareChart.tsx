import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { getMarketShare } from '../api';

const RESOURCE_TYPES = ['food', 'grain', 'water', 'animal_feed', 'cattle', 'meat', 'leather'];

const PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

interface Props {
  cityId: string;
  historyTicks?: number;
}

export default function MarketShareChart({ cityId, historyTicks = 20 }: Props) {
  const [resourceType, setResourceType] = useState('food');

  const { data, isLoading } = useQuery({
    queryKey: ['market-share', cityId, resourceType, historyTicks],
    queryFn: () => getMarketShare(cityId, resourceType, historyTicks),
    enabled: !!cityId,
    refetchInterval: 30_000,
  });

  // Collect unique players in order of first appearance
  const players: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const pt of data?.data ?? []) {
    if (!seen.has(pt.player_id)) {
      seen.add(pt.player_id);
      players.push({ id: pt.player_id, name: pt.player_name });
    }
  }

  // Pivot: one entry per tick → { tick, [playerName]: share_percent }
  const ticks = [...new Set((data?.data ?? []).map((pt) => pt.tick))].sort((a, b) => a - b);
  const chartData = ticks.map((tick) => {
    const row: Record<string, number | string> = { tick: String(tick) };
    for (const { id, name } of players) {
      const pt = data!.data.find((d) => d.tick === tick && d.player_id === id);
      row[name] = pt ? Math.round(pt.share_percent * 10) / 10 : 0;
    }
    return row;
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">
          🛒 Citizen Market Share
        </h2>
        <select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1"
        >
          {RESOURCE_TYPES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <p className="text-gray-500 text-xs animate-pulse py-6 text-center">Loading…</p>
      )}

      {!isLoading && chartData.length === 0 && (
        <p className="text-gray-600 text-xs py-6 text-center">
          No data yet — citizen demand runs each tick.
        </p>
      )}

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="tick" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 11 }}
              formatter={(value, name) => [`${value}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {players.map(({ name }, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stackId="1"
                stroke={PALETTE[i % PALETTE.length]}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

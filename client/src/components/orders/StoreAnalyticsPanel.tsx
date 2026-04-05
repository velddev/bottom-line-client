import { useState } from 'react';
import { ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getBuildingSales } from '../../api';
import type { SalesTick } from '../../types';
import { fmtMoney } from '../../types';
import { Button, Spinner } from '../ui';

export function StoreAnalyticsPanel({ buildingId }: { buildingId: string }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['building-sales', buildingId],
    queryFn: () => getBuildingSales(buildingId, 20),
    enabled: open,
    staleTime: 30_000,
  });

  const ticks: SalesTick[] = data?.ticks ?? [];

  const byResource = ticks.reduce<Record<string, SalesTick[]>>((acc, t) => {
    if (!acc[t.resource_type]) acc[t.resource_type] = [];
    acc[t.resource_type].push(t);
    return acc;
  }, {});

  const resources = Object.keys(byResource);

  return (
    <div className="mt-4 border-t border-gray-300 pt-3">
      <Button
        size="sm"
        variant="secondary"
        icon={<BarChart2 size={11} />}
        onClick={() => setOpen(o => !o)}
      >
        Performance {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </Button>

      {open && (
        <div className="mt-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <Spinner size="sm" /> Loading…
            </div>
          )}
          {!isLoading && ticks.length === 0 && (
            <p className="text-xs text-gray-500">No sales recorded yet.</p>
          )}
          {resources.map(res => {
            const rows = byResource[res].slice(0, 10);
            const totalUnits = rows.reduce((s, r) => s + r.sale_volume, 0);
            const totalRev   = rows.reduce((s, r) => s + r.revenue_cents, 0);
            return (
              <div key={res} className="mb-3">
                <p className="text-xs font-semibold text-gray-900 mb-1 capitalize">{res}</p>
                <div className="text-xs text-gray-500 flex gap-4 mb-1">
                  <span>Last {rows.length} days</span>
                  <span>Units: <span className="text-gray-900 font-mono">{totalUnits.toFixed(1)}</span></span>
                  <span>Revenue: <span className="text-emerald-400 font-mono">{fmtMoney(totalRev)}</span></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-gray-500">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-left py-0.5 pr-3 uppercase tracking-wider">Day</th>
                        <th className="text-right pr-3 uppercase tracking-wider">Units sold</th>
                        <th className="text-right uppercase tracking-wider">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.tick} className="border-b border-gray-300/40">
                          <td className="py-0.5 pr-3 font-mono text-gray-700">{r.tick}</td>
                          <td className="text-right pr-3 font-mono text-gray-900">{r.sale_volume.toFixed(2)}</td>
                          <td className="text-right font-mono text-emerald-400">{fmtMoney(r.revenue_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

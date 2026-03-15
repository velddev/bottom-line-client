import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, X } from 'lucide-react';
import { listOfferings, cancelOffering, purchase, listBuildings, getDemandUtilization } from '../api';
import { useAuth } from '../auth';
import { fmtMoney, fmtQuality, resourceColor, type DemandUtilizationPoint } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';

const RESOURCES = ['grain', 'water', 'animal_feed', 'cattle', 'meat', 'leather', 'food'];

export default function MarketScreen() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const [resourceFilter, setResourceFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['offerings', auth?.city_id, resourceFilter],
    queryFn: () => listOfferings(auth!.city_id, resourceFilter || undefined),
    enabled: !!auth?.city_id,
    refetchInterval: 30_000,
  });
  const offerings = data?.offerings ?? [];

  const { data: buildingsResp } = useQuery({ queryKey: ['buildings'], queryFn: listBuildings });
  const buildings = buildingsResp?.buildings ?? [];

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

  const { data: demandResp } = useQuery({
    queryKey: ['demand-utilization', auth?.city_id],
    queryFn: () => getDemandUtilization(auth!.city_id, 1),
    enabled: !!auth?.city_id,
    refetchInterval: 60_000,
  });

  // Latest tick per resource: highest tick wins
  const latestDemand = Object.values(
    (demandResp?.data ?? []).reduce<Record<string, DemandUtilizationPoint>>((acc, p) => {
      if (!acc[p.resource_type] || p.tick > acc[p.resource_type].tick) acc[p.resource_type] = p;
      return acc;
    }, {})
  );

  return (
    <div className="max-w-6xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Market</h1>

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => setResourceFilter('')}
          className={`px-3 py-1.5 rounded border transition-colors ${!resourceFilter ? 'border-indigo-500 text-indigo-300 bg-indigo-900/20' : 'border-gray-200 text-gray-600 hover:border-gray-500'}`}
        >
          All
        </button>
        {RESOURCES.map((r) => (
          <button
            key={r}
            onClick={() => setResourceFilter(r === resourceFilter ? '' : r)}
            className={`px-3 py-1.5 rounded border capitalize transition-colors ${r === resourceFilter ? 'border-indigo-500 text-indigo-300 bg-indigo-900/20' : 'border-gray-200 text-gray-600 hover:border-gray-500'} ${resourceColor(r)}`}
          >
            {r}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-500 text-sm animate-pulse">Loading market...</p>}

      {!isLoading && offerings.length === 0 && (
        <div className="text-center py-16 text-gray-600 border border-dashed border-gray-200 rounded-lg">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">No offerings in this city right now.</p>
        </div>
      )}

      {offerings.length > 0 && (
        <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600 border-b border-gray-200">
                {['Seller', 'Resource', 'Price/Unit', 'Quantity', 'Quality', 'Brand', ''].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offerings.map((o) => (
                <tr key={o.offering_id} className="border-b border-gray-200 hover:bg-gray-100/20">
                  <td className="px-3 py-2.5 text-gray-700">{o.seller_name}</td>
                  <td className={`px-3 py-2.5 capitalize font-medium ${resourceColor(o.resource_type)}`}>{o.resource_type}</td>
                  <td className="px-3 py-2.5 text-emerald-400 font-mono">{fmtMoney(o.price_per_unit)}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-mono">{o.quantity.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-mono">{fmtQuality(o.quality)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{o.brand_name || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setBuyTarget(o); setBuyForm({ building_id: buildings[0]?.building_id ?? '', quantity: '1' }); }}
                        className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <ShoppingCart size={12} /> Buy
                      </button>
                      <button
                        onClick={() => cancelMut.mutate(o.offering_id)}
                        title="Cancel offering"
                        className="text-gray-600 hover:text-rose-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {buyTarget && (
        <Modal
          title={`Buy ${buyTarget.resource_type} from ${buyTarget.seller_name}`}
          onClose={() => setBuyTarget(null)}
          onSubmit={() => buyMut.mutate()}
          submitLabel={buyMut.isPending ? 'Purchasing...' : 'Purchase'}
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
            <p className="text-xs text-gray-600">
              Total: <span className="text-emerald-400 font-mono">{fmtMoney(parseFloat(buyForm.quantity) * buyTarget.price_per_unit)}</span>
            </p>
          )}
          {buyMut.isError && <p className="text-rose-400 text-xs">{(buyMut.error as Error).message}</p>}
        </Modal>
      )}

      {/* Citizen demand utilization — shows how much of each resource's demand is being met */}
      {latestDemand.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Citizen Demand Utilization</h2>
          <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-gray-200">
                  {['Resource', 'Demand', 'Fulfilled', 'Utilization'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latestDemand.map((p) => {
                  const pct = p.utilization_pct;
                  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-rose-500';
                  return (
                    <tr key={p.resource_type} className="border-b border-gray-200">
                      <td className={`px-3 py-2 capitalize font-medium ${resourceColor(p.resource_type)}`}>{p.resource_type.replace('_', ' ')}</td>
                      <td className="px-3 py-2 text-gray-700 font-mono">{p.total_demand.toFixed(1)}</td>
                      <td className="px-3 py-2 text-gray-700 font-mono">{p.fulfilled_demand.toFixed(1)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-300 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className={`font-mono text-xs ${pct >= 80 ? 'text-emerald-400' : pct >= 40 ? 'text-yellow-400' : 'text-rose-400'}`}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
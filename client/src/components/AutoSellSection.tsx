import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAutoSellConfigs, setAutoSellConfig } from '../api';
import type { AutoSellConfigInfo } from '../types';

const ALL_RESOURCES = ['food', 'grain', 'animal_feed', 'cattle', 'meat', 'leather'];
const CONSUMER_GOODS = ['food', 'meat', 'leather'];

function AutoSellRow({
  buildingId,
  resourceType,
  config,
}: {
  buildingId: string;
  resourceType: string;
  config?: AutoSellConfigInfo;
}) {
  const qc = useQueryClient();
  const [price, setPrice] = useState<string>(
    config ? (config.price_per_unit / 100).toFixed(2) : ''
  );

  const mut = useMutation({
    mutationFn: ({ enabled, priceEuros }: { enabled: boolean; priceEuros: number }) =>
      setAutoSellConfig(buildingId, resourceType, Math.round(priceEuros * 100), enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-sell', buildingId] }),
  });

  const priceCents = Math.round(parseFloat(price) * 100);
  const isEnabled = config?.is_enabled ?? false;
  const validPrice = !isNaN(priceCents) && priceCents > 0;

  const toggle = () => {
    if (!validPrice) return;
    mut.mutate({ enabled: !isEnabled, priceEuros: parseFloat(price) });
  };

  const savePrice = () => {
    if (!validPrice) return;
    mut.mutate({ enabled: isEnabled, priceEuros: parseFloat(price) });
  };

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-200/60 last:border-0">
      <span className="text-gray-700 text-xs w-24 capitalize shrink-0">{resourceType}</span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        placeholder="€0.00"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={savePrice}
        className="w-20 px-2 py-1 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500"
      />
      <button
        disabled={mut.isPending || !validPrice}
        onClick={toggle}
        className={`ml-auto px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
          isEnabled
            ? 'bg-emerald-700 hover:bg-emerald-600 text-gray-900'
            : 'bg-gray-200 hover:bg-gray-600 text-gray-700'
        }`}
      >
        {isEnabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}

export default function AutoSellSection({
  buildingId,
  buildingType,
}: {
  buildingId: string;
  buildingType: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['auto-sell', buildingId],
    queryFn: () => getAutoSellConfigs(buildingId),
    staleTime: 30_000,
  });

  const configs = data?.configs ?? [];
  const resources = buildingType === 'store' ? CONSUMER_GOODS : ALL_RESOURCES;

  return (
    <div>
      <p className="text-xs text-gray-600 mb-2">
        Set a price and toggle On to auto-sell inventory each tick.
      </p>
      {isLoading && <p className="text-gray-600 text-xs animate-pulse">Loading…</p>}
      {!isLoading && (
        <div>
          {resources.map((r) => (
            <AutoSellRow
              key={r}
              buildingId={buildingId}
              resourceType={r}
              config={configs.find((c) => c.resource_type === r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

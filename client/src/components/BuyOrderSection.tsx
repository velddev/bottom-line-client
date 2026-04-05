import { useState, useEffect } from 'react';
import { Plus, Trash2, X, ChevronDown, ChevronUp, BarChart2, Droplets, Zap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBuilding, listRecipes, getBuyOrders, setBuyOrder,
  removeBuyOrder, configureBuilding, createOffering,
  getBuildingSales, getUtilities, getInventory,
} from '../api';
import type { RecipeInfo, BuyOrderInfo, SalesTick } from '../types';
import { fmtMoney } from '../types';
import { Button, Badge, EmptyState, Spinner } from './ui';

const CONSUMER_GOODS = ['food', 'meat', 'leather'];

const MATCH_STEPS = ['lowest_price', 'best_value', 'highest_quality'] as const;
const MATCH_LABELS: Record<string, string> = {
  lowest_price: 'Price',
  best_value: 'Value',
  highest_quality: 'Quality',
};

// ── 3-step match slider ───────────────────────────────────────────────────────
function MatchSlider({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const idx = MATCH_STEPS.indexOf(value as typeof MATCH_STEPS[number]);
  const current = idx >= 0 ? idx : 0;

  return (
    <div className="flex items-center gap-0">
      {MATCH_STEPS.map((step, i) => {
        const isActive = i === current;
        return (
          <button
            key={step}
            onClick={() => onChange(step)}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors border ${
              i === 0 ? 'rounded-l' : i === MATCH_STEPS.length - 1 ? 'rounded-r' : ''
            } ${
              isActive
                ? 'bg-indigo-600 text-gray-900 border-indigo-600'
                : 'bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-300'
            }`}
          >
            {MATCH_LABELS[step]}
          </button>
        );
      })}
    </div>
  );
}

// ── Currency input with € prefix ──────────────────────────────────────────────
function CurrencyInput({
  value,
  onChange,
  onBlur,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center bg-gray-100 border border-gray-200 rounded focus-within:border-indigo-500 ${className}`}>
      <span className="text-[10px] text-gray-500 pl-1.5 select-none">€</span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-14 px-1 py-0.5 text-xs bg-transparent text-gray-900 outline-none"
      />
    </div>
  );
}

// ── Single buy order row ──────────────────────────────────────────────────────
function BuyOrderRow({
  order,
  buildingId,
  currentStock,
}: {
  order: BuyOrderInfo;
  buildingId: string;
  currentStock: number;
}) {
  const qc = useQueryClient();
  const [maxPrice, setMaxPrice] = useState((order.max_price_per_unit / 100).toFixed(2));
  const [qty, setQty] = useState(String(order.quantity_per_tick));
  const [matchPref, setMatchPref] = useState(order.match_preference);
  const [isActive, setIsActive] = useState(order.is_active);

  useEffect(() => {
    setMaxPrice((order.max_price_per_unit / 100).toFixed(2));
    setQty(String(order.quantity_per_tick));
    setMatchPref(order.match_preference);
    setIsActive(order.is_active);
  }, [order]);

  const updateMut = useMutation({
    mutationFn: (overrides: Partial<{ price: number; quantity: number; match: string; active: boolean }>) =>
      setBuyOrder(
        buildingId,
        order.resource_type,
        overrides.price ?? Math.round(parseFloat(maxPrice) * 100),
        overrides.quantity ?? (parseInt(qty, 10) || order.quantity_per_tick),
        order.visibility,
        overrides.match ?? matchPref,
        overrides.active ?? isActive,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buy-orders', buildingId] }),
  });

  const removeMut = useMutation({
    mutationFn: () => removeBuyOrder(order.buy_order_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buy-orders', buildingId] }),
  });

  const savePriceQty = () => {
    const priceCents = Math.round(parseFloat(maxPrice) * 100);
    const quantity = parseInt(qty, 10);
    if (isNaN(priceCents) || priceCents <= 0 || isNaN(quantity) || quantity <= 0) return;
    updateMut.mutate({ price: priceCents, quantity });
  };

  const priceCents = Math.round(parseFloat(maxPrice) * 100);
  const targetQty = parseInt(qty, 10) || 0;
  const dailyCost = !isNaN(priceCents) && targetQty > 0 ? priceCents * targetQty : 0;

  return (
    <div className="bg-gray-200 border border-gray-300 rounded-lg px-3 py-2 mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-900 capitalize">{order.resource_type}</span>
        <div className="flex items-center gap-2">
          <Badge
            variant={isActive ? 'success' : 'paused'}
            className="cursor-pointer select-none"
          >
            <button
              disabled={updateMut.isPending}
              onClick={() => {
                const next = !isActive;
                setIsActive(next);
                updateMut.mutate({ active: next });
              }}
            >
              {isActive ? 'Active' : 'Paused'}
            </button>
          </Badge>
          <button
            disabled={removeMut.isPending}
            onClick={() => removeMut.mutate()}
            className="text-gray-500 hover:text-rose-400 transition-colors disabled:opacity-40"
            title="Remove buy order"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Max price
          <CurrencyInput value={maxPrice} onChange={setMaxPrice} onBlur={savePriceQty} className="mt-0.5" />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Target stock
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={e => setQty(e.target.value)}
              onBlur={savePriceQty}
              className="w-14 px-1.5 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 outline-none focus:border-indigo-500"
            />
            <span className="text-[10px] text-gray-500">
              ({currentStock.toFixed(0)} in stock)
            </span>
          </div>
        </label>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-0.5">Priority</p>
          <MatchSlider
            value={matchPref}
            onChange={v => {
              setMatchPref(v);
              updateMut.mutate({ match: v });
            }}
          />
        </div>
      </div>

      {dailyCost > 0 && (
        <p className="text-[10px] text-gray-500 mt-1.5">
          Max daily spend: <span className="text-indigo-400 font-mono">{fmtMoney(dailyCost)}</span>
        </p>
      )}

      {(updateMut.isError || removeMut.isError) && (
        <p className="text-rose-400 text-[10px] mt-1">
          {((updateMut.error ?? removeMut.error) as Error).message}
        </p>
      )}
    </div>
  );
}

// ── Create buy order inline ───────────────────────────────────────────────────
function CreateBuyOrderInline({
  buildingId,
  availableResources,
  onClose,
}: {
  buildingId: string;
  availableResources: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [resource, setResource] = useState(availableResources[0] ?? '');
  const [maxPrice, setMaxPrice] = useState('0.10');
  const [qty, setQty] = useState('10');
  const [matchPref, setMatchPref] = useState('lowest_price');

  const mut = useMutation({
    mutationFn: () =>
      setBuyOrder(
        buildingId,
        resource,
        Math.round(parseFloat(maxPrice) * 100),
        parseInt(qty, 10),
        'public',
        matchPref,
        true,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buy-orders', buildingId] });
      onClose();
    },
  });

  const priceCents = Math.round(parseFloat(maxPrice) * 100);
  const quantity = parseInt(qty, 10);
  const valid = resource && !isNaN(priceCents) && priceCents > 0 && !isNaN(quantity) && quantity > 0;
  const dailyCost = valid ? priceCents * quantity : 0;

  return (
    <div className="bg-gray-200 border border-gray-300 rounded-lg px-3 py-2 mt-2 relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 transition-colors"
        title="Close"
      >
        <X size={13} />
      </button>
      <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">New Buy Order</p>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Resource
          <select
            value={resource}
            onChange={e => setResource(e.target.value)}
            className="block mt-0.5 px-1 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 outline-none focus:border-indigo-500 capitalize"
          >
            {availableResources.map(r => (
              <option key={r} value={r} className="capitalize">{r}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Max price
          <CurrencyInput value={maxPrice} onChange={setMaxPrice} className="mt-0.5" />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Target stock
          <input
            type="number"
            min="1"
            step="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="block mt-0.5 w-14 px-1.5 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 outline-none focus:border-indigo-500"
          />
        </label>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-0.5">Priority</p>
          <MatchSlider value={matchPref} onChange={setMatchPref} />
        </div>
        <Button size="sm" loading={mut.isPending} disabled={!valid} onClick={() => mut.mutate()}>
          Create
        </Button>
      </div>
      {dailyCost > 0 && (
        <p className="text-[10px] text-gray-500 mt-1.5">
          Max daily spend: <span className="text-indigo-400 font-mono">{fmtMoney(dailyCost)}</span>
        </p>
      )}
      {mut.isError && (
        <p className="text-rose-400 text-[10px] mt-1">{(mut.error as Error).message}</p>
      )}
    </div>
  );
}

// ── Auto-sell offering row ────────────────────────────────────────────────────
function AutoSellOfferingRow({
  buildingId,
  resourceType,
}: {
  buildingId: string;
  resourceType: string;
}) {
  const qc = useQueryClient();
  const [price, setPrice] = useState('0.10');
  const [listed, setListed] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      createOffering(
        buildingId,
        resourceType,
        Math.round(parseFloat(price) * 100),
        'public',
        true,
      ),
    onSuccess: () => {
      setListed(true);
      qc.invalidateQueries({ queryKey: ['offerings'] });
    },
  });

  const priceCents = Math.round(parseFloat(price) * 100);
  const validPrice = !isNaN(priceCents) && priceCents > 0;

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-300">
      <span className="text-xs text-gray-600 shrink-0">Auto-sell at</span>
      <CurrencyInput value={price} onChange={setPrice} />
      <Button
        size="sm"
        variant={listed ? 'secondary' : 'primary'}
        loading={mut.isPending}
        disabled={!validPrice}
        onClick={() => mut.mutate()}
      >
        {listed ? 'Listed' : 'Create Listing'}
      </Button>
    </div>
  );
}

// ── Water utility row ─────────────────────────────────────────────────────────
function WaterUtilityRow({ quantity, waterRateCents }: { quantity: number; waterRateCents: number | null }) {
  return (
    <div className="mb-3">
      <div className="w-full flex items-center justify-between text-xs font-semibold text-gray-700 mb-1.5">
        <span className="flex items-center gap-1 capitalize">
          <Droplets size={12} className="text-cyan-400" />
          water
          <span className="text-gray-500 font-normal ml-1">× {quantity} per run</span>
        </span>
      </div>
      <div className="pl-2">
        <div className="flex items-center gap-1.5 text-xs bg-cyan-900/20 rounded px-2 py-1">
          <Droplets size={11} className="text-cyan-400" />
          <span className="flex-1 text-gray-700 truncate">
            City Water Works
            <span className="text-gray-500 ml-1 font-normal">— utility</span>
          </span>
          {waterRateCents !== null && (
            <span className="font-mono text-xs text-cyan-400 shrink-0">
              {fmtMoney(waterRateCents)}/u
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Base electricity consumption per day by building type ─────────────────────
const BASE_ELECTRICITY: Record<string, number> = {
  factory: 30, store: 15, warehouse: 10, bank: 10,
  field: 5, landmark: 5,
  residential_low: 5, residential_medium: 10, residential_high: 15,
};

function ElectricityUtilityRow({ buildingType, electricityRateCents }: { buildingType: string; electricityRateCents: number | null }) {
  const baseConsumption = BASE_ELECTRICITY[buildingType] ?? 5;
  return (
    <div className="mb-3">
      <div className="w-full flex items-center justify-between text-xs font-semibold text-gray-700 mb-1.5">
        <span className="flex items-center gap-1 capitalize">
          <Zap size={12} className="text-amber-400" />
          electricity
          <span className="text-gray-500 font-normal ml-1">× {baseConsumption} kWh/day</span>
        </span>
      </div>
      <div className="pl-2">
        <div className="flex items-center gap-1.5 text-xs bg-amber-900/20 rounded px-2 py-1">
          <Zap size={11} className="text-amber-400" />
          <span className="flex-1 text-gray-700 truncate">
            City Power Grid
            <span className="text-gray-500 ml-1 font-normal">— utility</span>
          </span>
          {electricityRateCents !== null && (
            <span className="font-mono text-xs text-amber-400 shrink-0">
              {fmtMoney(electricityRateCents)}/kWh
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline recipe picker (no recipe active) ───────────────────────────────────
function RecipePicker({
  buildingId,
  buildingType,
  currentWorkers,
  recipes,
}: {
  buildingId: string;
  buildingType: string;
  currentWorkers: number;
  recipes: RecipeInfo[];
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const configureMut = useMutation({
    mutationFn: (recipe_id: string) =>
      configureBuilding(buildingId, recipe_id, currentWorkers || 1),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['building', buildingId] }),
  });

  const filtered = recipes.filter(r =>
    r.output_type.toLowerCase().includes(search.toLowerCase())
  );

  if (recipes.length === 0) {
    return <EmptyState icon="📋" message="No recipes available for this building type." />;
  }

  return (
    <div>
      <p className="text-xs text-gray-600 mb-2">Select a recipe to configure orders</p>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search recipes…"
        className="w-full px-2 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 mb-2"
      />
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {filtered.map(r => (
          <button
            key={r.recipe_id}
            disabled={configureMut.isPending}
            onClick={() => configureMut.mutate(r.recipe_id)}
            className="w-full text-left px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 border border-gray-300 transition-colors disabled:opacity-40 relative"
          >
            {configureMut.isPending && configureMut.variables === r.recipe_id && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2"><Spinner size="sm" /></span>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-900 text-xs font-medium capitalize">{r.output_type}</span>
              <span className="text-gray-600 text-xs font-mono">
                ×{r.output_min}–{r.output_max} / {r.ticks_required}d
              </span>
            </div>
            {r.ingredients.length > 0 && (
              <p className="text-gray-500 text-xs mt-0.5">
                Needs: {r.ingredients.map(i => `${i.resource_type} ×${i.quantity}`).join(', ')}
              </p>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-xs px-1">No matches</p>
        )}
      </div>
      {configureMut.isError && (
        <p className="text-rose-400 text-xs mt-2">{(configureMut.error as Error).message}</p>
      )}
    </div>
  );
}

// ── Buy orders list for a given resource set ──────────────────────────────────
function BuyOrdersList({
  buildingId,
  orders,
  availableResources,
  stockMap,
}: {
  buildingId: string;
  orders: BuyOrderInfo[];
  availableResources: string[];
  stockMap: Record<string, number>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const existing = new Set(orders.map(o => o.resource_type));
  const remaining = availableResources.filter(r => !existing.has(r));

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">
        Buy Orders
        <span className="font-normal normal-case tracking-normal ml-1 text-gray-500">— auto-purchase from market each day</span>
      </p>

      {orders.length === 0 && !showCreate && (
        <EmptyState
          icon="📦"
          message="No buy orders — resources won't be purchased automatically."
          border="dashed"
          action={
            remaining.length > 0 ? (
              <Button size="sm" icon={<Plus size={12} />} onClick={() => setShowCreate(true)}>
                Add buy order
              </Button>
            ) : undefined
          }
          className="py-5"
        />
      )}

      {orders.map(o => (
        <BuyOrderRow
          key={o.buy_order_id}
          order={o}
          buildingId={buildingId}
          currentStock={stockMap[o.resource_type] ?? 0}
        />
      ))}

      {orders.length > 0 && remaining.length > 0 && !showCreate && (
        <Button size="sm" icon={<Plus size={12} />} onClick={() => setShowCreate(true)} className="mt-1">
          Add buy order
        </Button>
      )}

      {showCreate && remaining.length > 0 && (
        <CreateBuyOrderInline
          buildingId={buildingId}
          availableResources={remaining}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ── Store performance analytics panel ─────────────────────────────────────────
function StoreAnalyticsPanel({ buildingId }: { buildingId: string }) {
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

// ── Main BuyOrderSection component ────────────────────────────────────────────
export default function BuyOrderSection({
  buildingId,
  buildingType,
  cityId,
}: {
  buildingId: string;
  buildingType: string;
  cityId: string;
}) {
  const { data: bldg } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => getBuilding(buildingId),
  });

  const { data: recipesResp } = useQuery({
    queryKey: ['recipes', buildingType],
    queryFn: () => listRecipes(buildingType),
    enabled: !!buildingType,
    staleTime: 300_000,
  });

  const { data: buyOrdersResp } = useQuery({
    queryKey: ['buy-orders', buildingId],
    queryFn: () => getBuyOrders(buildingId),
    staleTime: 30_000,
  });

  const { data: inventoryResp } = useQuery({
    queryKey: ['inventory', buildingId],
    queryFn: () => getInventory(buildingId),
    staleTime: 30_000,
  });

  const orders: BuyOrderInfo[] = buyOrdersResp?.orders ?? [];

  // Build stock map: resource_type → total quantity in this building
  const stockMap: Record<string, number> = {};
  for (const item of inventoryResp?.items ?? []) {
    stockMap[item.resource_type] = (stockMap[item.resource_type] ?? 0) + item.quantity;
  }

  const { data: utilitiesData } = useQuery({
    queryKey: ['utilities', cityId],
    queryFn: () => getUtilities(cityId),
    staleTime: 60_000,
  });
  const electricityRateCents = utilitiesData?.utilities?.find(
    (u: { name: string }) => u.name.toLowerCase() === 'electricity'
  )?.rate_cents ?? null;

  if (!bldg) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-xs">
        <Spinner size="sm" /> Loading…
      </div>
    );
  }

  // Stores: buy consumer goods
  if (buildingType === 'store') {
    return (
      <div>
        <ElectricityUtilityRow buildingType={buildingType} electricityRateCents={electricityRateCents} />
        <BuyOrdersList buildingId={buildingId} orders={orders} availableResources={CONSUMER_GOODS} stockMap={stockMap} />
        <StoreAnalyticsPanel buildingId={buildingId} />
      </div>
    );
  }

  const recipe = (recipesResp?.recipes ?? []).find((r: RecipeInfo) => r.recipe_id === bldg.active_recipe);

  if (!recipe) {
    return (
      <div>
        <ElectricityUtilityRow buildingType={buildingType} electricityRateCents={electricityRateCents} />
        <RecipePicker
          buildingId={buildingId}
          buildingType={buildingType}
          currentWorkers={bldg.workers}
          recipes={recipesResp?.recipes ?? []}
        />
      </div>
    );
  }

  const waterIngredient = recipe.ingredients.find((i: { resource_type: string }) => i.resource_type === 'water');
  const nonWaterIngredients = recipe.ingredients.filter((i: { resource_type: string }) => i.resource_type !== 'water');

  const waterRateCents = utilitiesData?.utilities?.find(
    (u: { name: string }) => u.name.toLowerCase() === 'water'
  )?.rate_cents ?? null;

  return (
    <div>
      <ElectricityUtilityRow buildingType={buildingType} electricityRateCents={electricityRateCents} />

      {/* Recipe summary + auto-sell offering */}
      <div className="mb-3 pb-3 border-b border-gray-300">
        <p className="text-xs text-gray-600">
          Produces <span className="text-gray-900 font-semibold capitalize">{recipe.output_type}</span>
          <span className="text-gray-500 ml-1 font-mono">× {recipe.output_min}–{recipe.output_max} / {recipe.ticks_required}d</span>
        </p>
        <AutoSellOfferingRow buildingId={buildingId} resourceType={recipe.output_type} />
      </div>

      {/* Water utility row */}
      {waterIngredient && (
        <WaterUtilityRow quantity={waterIngredient.quantity} waterRateCents={waterRateCents} />
      )}

      {recipe.ingredients.length === 0 && (
        <p className="text-gray-500 text-xs">No ingredients needed — no buy orders required.</p>
      )}

      {nonWaterIngredients.length > 0 && (
        <BuyOrdersList
          buildingId={buildingId}
          orders={orders}
          availableResources={nonWaterIngredients.map((i: { resource_type: string }) => i.resource_type)}
          stockMap={stockMap}
        />
      )}
    </div>
  );
}

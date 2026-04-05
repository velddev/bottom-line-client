import { useState, useEffect, useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { setBuyOrder, createOffering, getBuildingSales } from '../../api';
import type { BuyOrderInfo, Offering, SalesTick } from '../../types';
import { fmtMoney } from '../../types';
import { Button, Badge } from '../ui';
import { CurrencyInput } from './CurrencyInput';
import { MatchSlider } from './MatchSlider';

const MAX_STORE_CAPACITY = 100;
const STORE_KWH_PER_DAY = 15;

// Tiny inline SVG sparkline
function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 60;
  const h = 16;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function StoreResourceCard({
  buildingId,
  resourceType,
  currentStock,
  existingOrder,
  existingOffering,
  electricityRateCents,
}: {
  buildingId: string;
  resourceType: string;
  currentStock: number;
  existingOrder: BuyOrderInfo | undefined;
  existingOffering: Offering | undefined;
  electricityRateCents: number | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [sellPrice, setSellPrice] = useState(
    existingOffering ? (existingOffering.price_per_unit / 100).toFixed(2) : '1.00',
  );
  const [buyPrice, setBuyPrice] = useState(
    existingOrder ? (existingOrder.max_price_per_unit / 100).toFixed(2) : '0.10',
  );
  const [targetStock, setTargetStock] = useState(
    existingOrder ? existingOrder.quantity_per_tick : 10,
  );
  const [matchPref, setMatchPref] = useState(
    existingOrder?.match_preference ?? 'best_value',
  );
  const [sellSaved, setSellSaved] = useState(!!existingOffering);

  // Fetch per-resource sales history for this building
  const { data: salesData } = useQuery({
    queryKey: ['building-sales', buildingId],
    queryFn: () => getBuildingSales(buildingId, 10),
    staleTime: 30_000,
  });

  const resourceSales = useMemo(() => {
    const ticks: SalesTick[] = salesData?.ticks ?? [];
    return ticks
      .filter(t => t.resource_type === resourceType)
      .sort((a, b) => a.tick - b.tick);
  }, [salesData, resourceType]);

  const avgVolume = resourceSales.length > 0
    ? resourceSales.reduce((s, t) => s + t.sale_volume, 0) / resourceSales.length
    : 0;
  const totalRevenue = resourceSales.reduce((s, t) => s + t.revenue_cents, 0);
  const avgRevPerUnit = avgVolume > 0
    ? totalRevenue / resourceSales.reduce((s, t) => s + t.sale_volume, 0)
    : 0;

  useEffect(() => {
    if (existingOffering) {
      setSellPrice((existingOffering.price_per_unit / 100).toFixed(2));
      setSellSaved(true);
    }
  }, [existingOffering]);

  useEffect(() => {
    if (existingOrder) {
      setBuyPrice((existingOrder.max_price_per_unit / 100).toFixed(2));
      setTargetStock(existingOrder.quantity_per_tick);
      setMatchPref(existingOrder.match_preference);
    }
  }, [existingOrder]);

  const sellMut = useMutation({
    mutationFn: () =>
      createOffering(buildingId, resourceType, Math.round(parseFloat(sellPrice) * 100), 'public', true),
    onSuccess: () => {
      setSellSaved(true);
      qc.invalidateQueries({ queryKey: ['offerings'] });
      qc.invalidateQueries({ queryKey: ['building-offerings', buildingId] });
    },
  });

  const buyMut = useMutation({
    mutationFn: () =>
      setBuyOrder(
        buildingId,
        resourceType,
        Math.round(parseFloat(buyPrice) * 100),
        targetStock || 10,
        'public',
        matchPref,
        true,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buy-orders', buildingId] });
    },
  });

  const save = () => {
    buyMut.mutate();
    sellMut.mutate();
    setEditing(false);
  };

  const sellPriceCents = Math.round(parseFloat(sellPrice) * 100);
  const buyPriceCents = Math.round(parseFloat(buyPrice) * 100);
  const validSell = !isNaN(sellPriceCents) && sellPriceCents > 0;
  const validBuy = !isNaN(buyPriceCents) && buyPriceCents > 0 && targetStock > 0;

  const electricityCostPerUnit = electricityRateCents !== null && targetStock > 0
    ? (STORE_KWH_PER_DAY * electricityRateCents) / (targetStock * 3)
    : 0;
  const rawMargin = validSell && validBuy ? sellPriceCents - buyPriceCents : 0;
  const netMargin = rawMargin - electricityCostPerUnit;

  const isListed = sellSaved && !!existingOrder;

  // Revenue sparkline values
  const revenueValues = resourceSales.map(t => t.revenue_cents);

  // Auto-open edit if nothing is configured yet
  const needsSetup = !existingOrder && !existingOffering;

  return (
    <div className="py-3.5 border-b border-gray-300 last:border-b-0">
      {/* Header: resource name + status + edit toggle */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-bold text-gray-900 capitalize">{resourceType}</span>
        <div className="flex items-center gap-2">
          <Badge variant={isListed ? 'success' : 'warning'}>
            {isListed ? 'Listed' : 'Draft'}
          </Badge>
          {!needsSetup && (
            <button
              onClick={() => setEditing(e => !e)}
              className={`p-1 rounded transition-colors ${editing ? 'bg-indigo-600 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              title={editing ? 'Close editor' : 'Edit settings'}
            >
              <Settings2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Default: Stats view */}
      {!editing && !needsSetup && (
        <div className="flex items-center gap-4 flex-wrap text-[10px]">
          <div>
            <span className="text-gray-500">Avg sold </span>
            <span className="font-mono text-gray-900">{avgVolume > 0 ? avgVolume.toFixed(1) : '—'}</span>
            <span className="text-gray-500">/day</span>
          </div>
          <div>
            <span className="text-gray-500">Sell </span>
            <span className="font-mono text-gray-900">{fmtMoney(sellPriceCents)}</span>
          </div>
          <div className={netMargin > 0 ? 'text-emerald-400' : netMargin < 0 ? 'text-rose-400' : 'text-gray-500'}>
            <span className="font-mono">~{fmtMoney(Math.abs(netMargin))}</span>
            <span> {netMargin >= 0 ? 'profit' : 'loss'}/u</span>
          </div>
          <div>
            <span className="text-gray-500">Stock </span>
            <span className="font-mono text-gray-900">{currentStock.toFixed(0)}</span>
            <span className="text-gray-500">/{targetStock}</span>
          </div>
          {revenueValues.length >= 2 && (
            <MiniSparkline values={revenueValues} color={netMargin >= 0 ? '#4ade80' : '#fb7185'} />
          )}
        </div>
      )}

      {/* Edit mode (or first-time setup) */}
      {(editing || needsSetup) && (
        <div className="mt-1">
          {/* Buy at + Priority */}
          <div className="flex items-center gap-3 mb-2.5 flex-wrap">
            <label className="text-[10px] uppercase tracking-wider text-gray-600 shrink-0">
              Buy at
              <CurrencyInput
                value={buyPrice}
                onChange={v => { setBuyPrice(v); }}
                className="mt-0.5"
              />
            </label>
            <div className="shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-0.5">Priority</p>
              <MatchSlider
                value={matchPref}
                onChange={v => { setMatchPref(v); }}
              />
            </div>
          </div>

          {/* Max stock — compact */}
          <div className="mb-2.5 max-w-[200px]">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-600">Max stock</span>
              <span className="text-[10px] font-mono text-gray-700">{targetStock}</span>
            </div>
            <input
              type="range"
              min="0"
              max={MAX_STORE_CAPACITY}
              step="1"
              value={targetStock}
              onChange={e => { setTargetStock(parseInt(e.target.value, 10)); }}
              className="w-full h-1 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* Sell at + margin + save */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-[10px] uppercase tracking-wider text-gray-600 shrink-0">
              Sell at
              <CurrencyInput
                value={sellPrice}
                onChange={v => { setSellPrice(v); setSellSaved(false); }}
                className="mt-0.5"
              />
            </label>
            <div className="flex-1 min-w-0">
              {validSell && validBuy && (
                <span className={`text-[10px] font-mono ${netMargin > 0 ? 'text-emerald-400' : netMargin < 0 ? 'text-rose-400' : 'text-gray-500'}`}>
                  ~{fmtMoney(Math.abs(netMargin))} {netMargin >= 0 ? 'profit' : 'loss'}/u
                </span>
              )}
            </div>
            <Button
              size="sm"
              loading={buyMut.isPending || sellMut.isPending}
              disabled={!validBuy || !validSell}
              onClick={save}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Errors */}
      {(buyMut.isError || sellMut.isError) && (
        <p className="text-rose-400 text-[10px] mt-1">
          {((buyMut.error ?? sellMut.error) as Error).message}
        </p>
      )}
    </div>
  );
}

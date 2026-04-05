import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setBuyOrder, removeBuyOrder, createOffering } from '../../api';
import type { BuyOrderInfo, Offering } from '../../types';
import { fmtMoney } from '../../types';
import { Button, Badge } from '../ui';
import { CurrencyInput } from './CurrencyInput';
import { MatchSlider } from './MatchSlider';

const MAX_STORE_CAPACITY = 100;

// Electricity cost per day for a store (kWh × rate)
const STORE_KWH_PER_DAY = 15;

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
  const [dirty, setDirty] = useState(false);

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
      setDirty(false);
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
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['buy-orders', buildingId] });
    },
  });

  const save = () => {
    buyMut.mutate();
    sellMut.mutate();
  };

  const sellPriceCents = Math.round(parseFloat(sellPrice) * 100);
  const buyPriceCents = Math.round(parseFloat(buyPrice) * 100);
  const validSell = !isNaN(sellPriceCents) && sellPriceCents > 0;
  const validBuy = !isNaN(buyPriceCents) && buyPriceCents > 0 && targetStock > 0;

  // Margin calculation including utility overhead
  const electricityCostPerUnit = electricityRateCents !== null && targetStock > 0
    ? (STORE_KWH_PER_DAY * electricityRateCents) / (targetStock * 3) // split across 3 goods
    : 0;
  const rawMargin = validSell && validBuy ? sellPriceCents - buyPriceCents : 0;
  const netMargin = rawMargin - electricityCostPerUnit;

  const isListed = sellSaved && !!existingOrder;
  const status = isListed ? 'Listed' : 'Draft';

  return (
    <div className="py-3 border-b border-gray-300 last:border-b-0">
      {/* Row 1: Resource name + status */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-gray-900 capitalize">{resourceType}</span>
        <div className="flex items-center gap-2">
          {currentStock > 0 && (
            <span className="text-[10px] text-gray-500 font-mono">{currentStock.toFixed(0)} in stock</span>
          )}
          <Badge variant={isListed ? 'success' : 'warning'}>
            {status}
          </Badge>
        </div>
      </div>

      {/* Row 2: Buy at + Priority slider */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <label className="text-[10px] uppercase tracking-wider text-gray-600 shrink-0">
          Buy at
          <CurrencyInput
            value={buyPrice}
            onChange={v => { setBuyPrice(v); setDirty(true); }}
            className="mt-0.5"
          />
        </label>
        <div className="shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-0.5">Priority</p>
          <MatchSlider
            value={matchPref}
            onChange={v => { setMatchPref(v); setDirty(true); }}
          />
        </div>
      </div>

      {/* Row 3: Max stock slider */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] uppercase tracking-wider text-gray-600">Max stock</span>
          <span className="text-[10px] font-mono text-gray-700">{targetStock} / {MAX_STORE_CAPACITY}</span>
        </div>
        <input
          type="range"
          min="0"
          max={MAX_STORE_CAPACITY}
          step="1"
          value={targetStock}
          onChange={e => { setTargetStock(parseInt(e.target.value, 10)); setDirty(true); }}
          className="w-full h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-indigo-500"
        />
      </div>

      {/* Row 4: Sell at + margin breakdown */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[10px] uppercase tracking-wider text-gray-600 shrink-0">
          Sell at
          <CurrencyInput
            value={sellPrice}
            onChange={v => { setSellPrice(v); setSellSaved(false); setDirty(true); }}
            className="mt-0.5"
          />
        </label>
        <div className="flex-1 min-w-0">
          {validSell && validBuy && (
            <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
              <span className={netMargin > 0 ? 'text-emerald-400' : netMargin < 0 ? 'text-rose-400' : 'text-gray-500'}>
                {netMargin > 0 ? '+' : ''}{fmtMoney(netMargin)}/u net
              </span>
              <span className="text-gray-500">
                (buy {fmtMoney(buyPriceCents)}
                {electricityCostPerUnit > 0 && <> + ⚡{fmtMoney(electricityCostPerUnit)}</>}
                {' → '}sell {fmtMoney(sellPriceCents)})
              </span>
            </div>
          )}
        </div>
        <Button
          size="sm"
          loading={buyMut.isPending || sellMut.isPending}
          disabled={!validBuy || !validSell || (!dirty && isListed)}
          onClick={save}
        >
          {dirty ? 'Save' : 'Saved ✓'}
        </Button>
      </div>

      {/* Errors */}
      {(buyMut.isError || sellMut.isError) && (
        <p className="text-rose-400 text-[10px] mt-1">
          {((buyMut.error ?? sellMut.error) as Error).message}
        </p>
      )}
    </div>
  );
}

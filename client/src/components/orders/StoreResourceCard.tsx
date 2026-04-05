import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setBuyOrder, removeBuyOrder, createOffering } from '../../api';
import type { BuyOrderInfo, Offering } from '../../types';
import { fmtMoney } from '../../types';
import { Button, Badge } from '../ui';
import { CurrencyInput } from './CurrencyInput';

export function StoreResourceCard({
  buildingId,
  resourceType,
  currentStock,
  existingOrder,
  existingOffering,
}: {
  buildingId: string;
  resourceType: string;
  currentStock: number;
  existingOrder: BuyOrderInfo | undefined;
  existingOffering: Offering | undefined;
}) {
  const qc = useQueryClient();
  const [sellPrice, setSellPrice] = useState(
    existingOffering ? (existingOffering.price_per_unit / 100).toFixed(2) : '1.00',
  );
  const [buyPrice, setBuyPrice] = useState(
    existingOrder ? (existingOrder.max_price_per_unit / 100).toFixed(2) : '0.10',
  );
  const [targetStock, setTargetStock] = useState(
    existingOrder ? String(existingOrder.quantity_per_tick) : '10',
  );
  const [sellSaved, setSellSaved] = useState(!!existingOffering);

  useEffect(() => {
    if (existingOffering) {
      setSellPrice((existingOffering.price_per_unit / 100).toFixed(2));
      setSellSaved(true);
    }
  }, [existingOffering]);

  useEffect(() => {
    if (existingOrder) {
      setBuyPrice((existingOrder.max_price_per_unit / 100).toFixed(2));
      setTargetStock(String(existingOrder.quantity_per_tick));
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
        parseInt(targetStock, 10) || 10,
        'public',
        'best_value',
        true,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buy-orders', buildingId] }),
  });

  const removeMut = useMutation({
    mutationFn: () => existingOrder ? removeBuyOrder(existingOrder.buy_order_id) : Promise.resolve({ success: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buy-orders', buildingId] }),
  });

  const sellPriceCents = Math.round(parseFloat(sellPrice) * 100);
  const buyPriceCents = Math.round(parseFloat(buyPrice) * 100);
  const qty = parseInt(targetStock, 10) || 0;
  const validSell = !isNaN(sellPriceCents) && sellPriceCents > 0;
  const validBuy = !isNaN(buyPriceCents) && buyPriceCents > 0 && qty > 0;
  const margin = validSell && validBuy ? sellPriceCents - buyPriceCents : 0;

  return (
    <div className="bg-gray-200 border border-gray-300 rounded-lg px-3 py-2 mb-2">
      {/* Header: resource name + stock */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-900 capitalize">{resourceType}</span>
          <span className="text-[10px] text-gray-500 font-mono">
            {currentStock.toFixed(0)} in stock
          </span>
        </div>
        {sellSaved && <Badge variant="success">Listed ✓</Badge>}
        {margin > 0 && validSell && validBuy && (
          <span className="text-[10px] font-mono text-emerald-400">
            +{fmtMoney(margin)}/u margin
          </span>
        )}
        {margin < 0 && validSell && validBuy && (
          <span className="text-[10px] font-mono text-rose-400">
            {fmtMoney(margin)}/u margin
          </span>
        )}
      </div>

      {/* Buy + Sell controls in one row */}
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Buy at
          <CurrencyInput value={buyPrice} onChange={setBuyPrice} className="mt-0.5" />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Target
          <input
            type="number" min="1" step="1"
            value={targetStock}
            onChange={e => setTargetStock(e.target.value)}
            className="block mt-0.5 w-12 px-1 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 outline-none focus:border-indigo-500"
          />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Sell at
          <CurrencyInput value={sellPrice} onChange={v => { setSellPrice(v); setSellSaved(false); }} className="mt-0.5" />
        </label>
        <div className="flex gap-1 pt-2">
          <Button size="sm" loading={buyMut.isPending || sellMut.isPending} disabled={!validBuy || !validSell}
            onClick={() => { buyMut.mutate(); sellMut.mutate(); }}>
            Save
          </Button>
          {existingOrder && (
            <Button size="sm" variant="danger" loading={removeMut.isPending}
              onClick={() => removeMut.mutate()}>
              <Trash2 size={11} />
            </Button>
          )}
        </div>
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

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setBuyOrder, removeBuyOrder } from '../../api';
import type { BuyOrderInfo } from '../../types';
import { Button, Badge } from '../ui';
import { CurrencyInput } from './CurrencyInput';

export function IngredientBuyRow({
  buildingId,
  resourceType,
  recipeQuantity,
  currentStock,
  existingOrder,
}: {
  buildingId: string;
  resourceType: string;
  recipeQuantity: number;
  currentStock: number;
  existingOrder: BuyOrderInfo | undefined;
}) {
  const qc = useQueryClient();
  const [maxPrice, setMaxPrice] = useState(
    existingOrder ? (existingOrder.max_price_per_unit / 100).toFixed(2) : '0.10',
  );
  const [qty, setQty] = useState(
    existingOrder ? String(existingOrder.quantity_per_tick) : String(recipeQuantity * 2),
  );

  useEffect(() => {
    if (existingOrder) {
      setMaxPrice((existingOrder.max_price_per_unit / 100).toFixed(2));
      setQty(String(existingOrder.quantity_per_tick));
    }
  }, [existingOrder]);

  const saveMut = useMutation({
    mutationFn: () =>
      setBuyOrder(
        buildingId,
        resourceType,
        Math.round(parseFloat(maxPrice) * 100),
        parseInt(qty, 10) || recipeQuantity,
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

  const priceCents = Math.round(parseFloat(maxPrice) * 100);
  const quantity = parseInt(qty, 10);
  const valid = !isNaN(priceCents) && priceCents > 0 && !isNaN(quantity) && quantity > 0;

  return (
    <div className="bg-gray-200 border border-gray-300 rounded-lg px-3 py-2 mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-900 capitalize">{resourceType}</span>
          <span className="text-[10px] text-gray-500">
            × {recipeQuantity}/run
          </span>
          <span className="text-[10px] text-gray-500 font-mono">
            ({currentStock.toFixed(0)} in stock)
          </span>
        </div>
        {existingOrder && (
          <Badge variant={existingOrder.is_active ? 'success' : 'paused'}>
            {existingOrder.is_active ? 'Active' : 'Paused'}
          </Badge>
        )}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Max price
          <CurrencyInput value={maxPrice} onChange={setMaxPrice} className="mt-0.5" />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-gray-600">
          Target
          <input
            type="number" min="1" step="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="block mt-0.5 w-12 px-1 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 outline-none focus:border-indigo-500"
          />
        </label>
        <div className="flex gap-1 pt-2">
          <Button size="sm" loading={saveMut.isPending} disabled={!valid} onClick={() => saveMut.mutate()}>
            {existingOrder ? 'Update' : 'Create'}
          </Button>
          {existingOrder && (
            <button
              disabled={removeMut.isPending}
              onClick={() => removeMut.mutate()}
              className="text-gray-500 hover:text-rose-400 transition-colors disabled:opacity-40 p-1"
              title="Remove buy order"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      {(saveMut.isError || removeMut.isError) && (
        <p className="text-rose-400 text-[10px] mt-1">
          {((saveMut.error ?? removeMut.error) as Error).message}
        </p>
      )}
    </div>
  );
}

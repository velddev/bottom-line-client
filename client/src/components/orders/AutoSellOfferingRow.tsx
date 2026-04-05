import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createOffering } from '../../api';
import type { Offering } from '../../types';
import { Button } from '../ui';
import { CurrencyInput } from './CurrencyInput';

export function AutoSellOfferingRow({
  buildingId,
  resourceType,
  existingOffering,
}: {
  buildingId: string;
  resourceType: string;
  existingOffering: Offering | undefined;
}) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(
    existingOffering ? (existingOffering.price_per_unit / 100).toFixed(2) : '0.10',
  );
  const [listed, setListed] = useState(!!existingOffering);

  useEffect(() => {
    if (existingOffering) {
      setPrice((existingOffering.price_per_unit / 100).toFixed(2));
      setListed(true);
    }
  }, [existingOffering]);

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
      qc.invalidateQueries({ queryKey: ['building-offerings', buildingId] });
    },
  });

  const priceCents = Math.round(parseFloat(price) * 100);
  const validPrice = !isNaN(priceCents) && priceCents > 0;

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-300">
      <span className="text-xs text-gray-600 shrink-0">Sell at</span>
      <CurrencyInput value={price} onChange={v => { setPrice(v); setListed(false); }} />
      <Button
        size="sm"
        variant={listed ? 'secondary' : 'primary'}
        loading={mut.isPending}
        disabled={!validPrice}
        onClick={() => mut.mutate()}
      >
        {listed ? 'Listed ✓' : 'List for Sale'}
      </Button>
    </div>
  );
}

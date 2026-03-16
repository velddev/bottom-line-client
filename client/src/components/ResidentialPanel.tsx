import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fmtMoney, type BuildingStatus } from '../types';
import { setRent, renovate } from '../api';

interface Props {
  buildingType: string;
  populationCapacity: number;
  buildingName: string;
  ownerName: string;
  isOwned: boolean;
  building?: BuildingStatus;
}

const TIER_INFO: Record<string, { label: string; icon: string; color: string }> = {
  residential_low:    { label: 'Small House',  icon: '🏠', color: 'text-gray-500' },
  residential_medium: { label: 'Townhouse',    icon: '🏘️', color: 'text-blue-400' },
  residential_high:   { label: 'Skyscraper',   icon: '🏙️', color: 'text-amber-400' },
};

const SHOPPING_RADIUS = 8;

export default function ResidentialPanel({
  buildingType,
  populationCapacity,
  buildingName,
  ownerName,
  isOwned,
  building,
}: Props) {
  const tier = TIER_INFO[buildingType.toLowerCase()] ?? TIER_INFO.residential_low;
  const qc = useQueryClient();

  // Rent editing state
  const [editingRent, setEditingRent] = useState(false);
  const [rentInput, setRentInput] = useState('');

  const units = building?.units ?? 0;
  const occupiedUnits = building?.occupied_units ?? 0;
  const rentPerUnitCents = building?.rent_per_unit_cents ?? 0;
  const freshness = building?.freshness ?? 100;
  const constructionCostCents = building?.construction_cost_cents ?? 0;
  const isRenovating = building?.is_renovating ?? false;
  const renovationTicksRemaining = building?.renovation_ticks_remaining ?? 0;

  // Monthly rent per unit in dollars
  const monthlyRentPerUnit = rentPerUnitCents / 100;
  // Daily income = (monthly_rent / 30) × occupied_units × (freshness / 100)
  const dailyIncome = units > 0 ? (rentPerUnitCents / 30) * occupiedUnits * (freshness / 100) : 0;
  const occupancyPct = units > 0 ? Math.round((occupiedUnits / units) * 100) : 0;
  const renovationCost = constructionCostCents * 0.10;

  const rentMut = useMutation({
    mutationFn: () => setRent(building!.building_id, Math.round(parseFloat(rentInput) * 100)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buildings'] }); setEditingRent(false); },
  });

  const renovateMut = useMutation({
    mutationFn: () => renovate(building!.building_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });

  // Freshness color
  const freshnessColor = freshness > 70 ? 'bg-emerald-500' : freshness > 40 ? 'bg-amber-500' : 'bg-rose-500';
  const freshnessTextColor = freshness > 70 ? 'text-emerald-400' : freshness > 40 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="flex flex-col gap-4">
      {/* Tier badge */}
      <div className="flex items-center gap-2">
        <span className="text-lg">{tier.icon}</span>
        <div>
          <p className={`text-sm font-semibold ${tier.color}`}>{tier.label}</p>
          <p className="text-gray-600 text-xs">Residential</p>
        </div>
      </div>

      {/* Occupancy & Freshness */}
      {units > 0 && (
        <div className="flex flex-col gap-2">
          {/* Occupancy bar */}
          <div>
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-600 mb-1">
              <span>Occupancy</span>
              <span className="text-gray-800 font-mono">{occupiedUnits}/{units} units ({occupancyPct}%)</span>
            </div>
            <div className="h-1.5 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${occupancyPct}%` }} />
            </div>
          </div>

          {/* Freshness bar */}
          <div>
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-600 mb-1">
              <span>Condition</span>
              <span className={`font-mono ${freshnessTextColor}`}>
                {isRenovating ? `🔧 Renovating (${renovationTicksRemaining} ticks)` : `${freshness.toFixed(0)}%`}
              </span>
            </div>
            <div className="h-1.5 bg-gray-300 rounded-full overflow-hidden">
              <div className={`h-full ${freshnessColor} rounded-full transition-all`} style={{ width: `${freshness}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Population Cap." value={populationCapacity.toLocaleString()} />
        <Stat label="Daily Spending" value={fmtMoney(populationCapacity * 10)} sub="at nearby stores" />
        {units > 0 && (
          <>
            <Stat label="Monthly Rent/Unit" value={fmtMoney(monthlyRentPerUnit)} />
            <Stat label="Daily Income" value={fmtMoney(dailyIncome / 100)} sub={freshness < 100 ? `× ${(freshness/100).toFixed(0)}% condition` : undefined} />
            {constructionCostCents > 0 && (
              <Stat label="Building Cost" value={fmtMoney(constructionCostCents / 100)} />
            )}
            <Stat label="Shopping Radius" value={`${SHOPPING_RADIUS} tiles`} />
          </>
        )}
      </div>

      {/* Owner controls */}
      {isOwned && building && units > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-300">
          {/* Set rent */}
          {editingRent ? (
            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-xs">$/mo/unit:</span>
              <input
                type="number"
                className="flex-1 bg-gray-200 text-gray-900 text-xs rounded px-2 py-1 border border-gray-400 font-mono"
                value={rentInput}
                onChange={(e) => setRentInput(e.target.value)}
                placeholder={monthlyRentPerUnit.toFixed(0)}
                min={0}
              />
              <button
                className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-1 rounded disabled:opacity-50"
                onClick={() => rentMut.mutate()}
                disabled={rentMut.isPending || !rentInput}
              >
                Set
              </button>
              <button
                className="text-xs text-gray-600 hover:text-gray-800 px-1"
                onClick={() => setEditingRent(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              className="text-xs text-indigo-400 hover:text-indigo-300 text-left"
              onClick={() => { setRentInput((monthlyRentPerUnit).toFixed(0)); setEditingRent(true); }}
            >
              ✏️ Adjust Rent
            </button>
          )}

          {/* Renovate */}
          {!isRenovating && freshness < 90 && (
            <button
              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1.5 rounded border border-gray-400 disabled:opacity-50"
              onClick={() => renovateMut.mutate()}
              disabled={renovateMut.isPending}
            >
              🔧 Renovate ({fmtMoney(renovationCost / 100)})
            </button>
          )}

          {renovateMut.isError && (
            <p className="text-rose-400 text-[10px]">{(renovateMut.error as Error).message}</p>
          )}
          {rentMut.isError && (
            <p className="text-rose-400 text-[10px]">{(rentMut.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Owner info */}
      <div className="text-xs text-gray-600">
        <span>Managed by </span>
        <span className="text-gray-800">{ownerName || 'AI Government'}</span>
        {isOwned && <span className="text-indigo-400 ml-1">← You</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-gray-600 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-gray-900 text-sm font-semibold font-mono">{value}</p>
      {sub && <p className="text-gray-500 text-[10px]">{sub}</p>}
    </div>
  );
}

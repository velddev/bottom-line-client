import { Droplets, Zap } from 'lucide-react';
import { fmtMoney } from '../../types';

export function WaterUtilityRow({ quantity, waterRateCents }: { quantity: number; waterRateCents: number | null }) {
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

const BASE_ELECTRICITY: Record<string, number> = {
  factory: 30, store: 15, warehouse: 10, bank: 10,
  field: 5, landmark: 5,
  residential_low: 5, residential_medium: 10, mixed_use_residential: 12, mixeduseresidential: 12, residential_high: 15,
};

export function ElectricityUtilityRow({ buildingType, electricityRateCents }: { buildingType: string; electricityRateCents: number | null }) {
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

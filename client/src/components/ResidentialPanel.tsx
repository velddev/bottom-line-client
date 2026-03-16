import { fmtMoney } from '../types';

interface Props {
  buildingType: string;
  populationCapacity: number;
  buildingName: string;
  ownerName: string;
  isOwned: boolean;
}

const TIER_INFO: Record<string, { label: string; icon: string; color: string }> = {
  residential_low:    { label: 'Low-Rise',  icon: '🏠', color: 'text-gray-500' },
  residential_medium: { label: 'Mid-Rise',  icon: '🏘️', color: 'text-blue-400' },
  residential_high:   { label: 'High-Rise', icon: '🏙️', color: 'text-amber-400' },
};

const SHOPPING_RADIUS = 8;

export default function ResidentialPanel({
  buildingType,
  populationCapacity,
  buildingName,
  ownerName,
  isOwned,
}: Props) {
  const { auth } = useAuth();
  const tier = TIER_INFO[buildingType.toLowerCase()] ?? TIER_INFO.residential_low;

  // Each citizen spends €10/day (1000 cents)
  const dailySpending = populationCapacity * 10;

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

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Units" value={populationCapacity.toLocaleString()} />
        <Stat label="Residents" value={populationCapacity.toLocaleString()} />
        <Stat label="Daily Spending" value={fmtMoney(dailySpending)} sub="across nearby stores" />
        <Stat label="Shopping Radius" value={`${SHOPPING_RADIUS} tiles`} />
      </div>

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

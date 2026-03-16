import { BUILDING_ICONS } from '../types';
import type { BuildingCategory } from '../utils/tilePlacement';

const CATEGORIES: { type: BuildingCategory; label: string }[] = [
  { type: 'store', label: 'Store' },
  { type: 'factory', label: 'Factory' },
  { type: 'field', label: 'Field' },
  { type: 'warehouse', label: 'Warehouse' },
  { type: 'residential_low', label: 'House' },
  { type: 'residential_medium', label: 'Apartments' },
  { type: 'residential_high', label: 'High-Rise' },
];

interface Props {
  activeBuildType: BuildingCategory | null;
  onSelect: (type: BuildingCategory | null) => void;
}

export default function BuildToolbar({ activeBuildType, onSelect }: Props) {
  return (
    <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-2 py-1.5">
      {CATEGORIES.map(({ type, label }) => {
        const isActive = activeBuildType === type;
        return (
          <button
            key={type}
            onClick={() => onSelect(isActive ? null : type)}
            title={label}
            className={`
              flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-xs transition-all
              ${isActive
                ? 'bg-indigo-100 text-indigo-900 ring-2 ring-indigo-400 shadow-sm'
                : 'hover:bg-gray-100 text-gray-700'}
            `}
          >
            <span className="text-lg leading-none">{BUILDING_ICONS[type] ?? '🏢'}</span>
            <span className="text-[10px] leading-tight font-medium">{label}</span>
          </button>
        );
      })}
      {activeBuildType && (
        <button
          onClick={() => onSelect(null)}
          className="ml-1 text-gray-400 hover:text-gray-600 text-xs px-1.5 py-1 rounded hover:bg-gray-100"
          title="Cancel placement"
        >
          ✕
        </button>
      )}
    </div>
  );
}

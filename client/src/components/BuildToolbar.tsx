import { useState } from 'react';
import { BUILDING_ICONS } from '../types';
import type { BuildingCategory } from '../utils/tilePlacement';

const CATEGORIES: { type: BuildingCategory; label: string; desc: string }[] = [
  { type: 'store', label: 'Store', desc: 'Sells goods directly to citizens. Place near residential areas for maximum foot traffic.' },
  { type: 'factory', label: 'Factory', desc: 'Processes raw materials into finished goods. Turns grain into food, cattle into leather, etc.' },
  { type: 'field', label: 'Field', desc: 'Grows raw resources like grain and cattle. Best placed away from the city center.' },
];

interface Props {
  activeBuildType: BuildingCategory | null;
  onSelect: (type: BuildingCategory | null) => void;
}

export default function BuildToolbar({ activeBuildType, onSelect }: Props) {
  const [hoveredType, setHoveredType] = useState<BuildingCategory | null>(null);

  return (
    <div className="relative flex flex-col items-center">
      {/* Tooltip */}
      {hoveredType && !activeBuildType && (
        <div className="absolute bottom-full mb-2 bg-gray-200 border border-gray-300 rounded-lg shadow-xl px-3 py-2 text-xs text-gray-700 max-w-[220px] text-center pointer-events-none">
          <p className="font-semibold text-gray-900 mb-0.5">
            {BUILDING_ICONS[hoveredType]} {CATEGORIES.find(c => c.type === hoveredType)?.label}
          </p>
          <p className="leading-relaxed">{CATEGORIES.find(c => c.type === hoveredType)?.desc}</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 bg-gray-200/95 backdrop-blur-sm border border-gray-300 rounded-xl shadow-lg px-2 py-1.5">
        {CATEGORIES.map(({ type, label }) => {
          const isActive = activeBuildType === type;
          return (
            <button
              key={type}
              onClick={() => onSelect(isActive ? null : type)}
              onMouseEnter={() => setHoveredType(type)}
              onMouseLeave={() => setHoveredType(null)}
              className={`
                flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs transition-all
                ${isActive
                  ? 'bg-indigo-900 text-indigo-400 ring-2 ring-indigo-400 shadow-sm'
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
    </div>
  );
}

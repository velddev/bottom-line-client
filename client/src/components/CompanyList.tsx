import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import type { TileInfo } from '../types';
import { BUILDING_ICONS } from '../types';

interface CompanyListProps {
  tiles: Map<string, TileInfo>;
  myPlayerId: string;
  onSelectTile: (tile: TileInfo) => void;
  selectedTileId?: string;
}

interface OwnerGroup {
  ownerId: string;
  ownerName: string;
  buildings: TileInfo[];
  isMine: boolean;
}

const STATUS_DOT: Record<string, string> = {
  Producing: 'bg-emerald-400',
  Idle: 'bg-gray-500',
  UnderConstruction: 'bg-amber-400',
  Paused: 'bg-yellow-400',
  MissingResources: 'bg-rose-400',
};

export default function CompanyList({ tiles, myPlayerId, onSelectTile, selectedTileId }: CompanyListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(true);

  const groups = useMemo(() => {
    const byOwner = new Map<string, OwnerGroup>();

    for (const tile of tiles.values()) {
      if (!tile.building_id) continue;

      const ownerId = tile.owner_player_id || 'government';
      if (!byOwner.has(ownerId)) {
        byOwner.set(ownerId, {
          ownerId,
          ownerName: tile.owner_name || 'Government',
          buildings: [],
          isMine: ownerId === myPlayerId,
        });
      }
      byOwner.get(ownerId)!.buildings.push(tile);
    }

    // Sort: my company first, then alphabetical
    return [...byOwner.values()].sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      return a.ownerName.localeCompare(b.ownerName);
    });
  }, [tiles, myPlayerId]);

  const toggle = (ownerId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  };

  if (!panelOpen) {
    return (
      <button
        onClick={() => setPanelOpen(true)}
        className="absolute top-3 left-3 z-[1000] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs text-gray-300 hover:text-white transition-colors flex items-center gap-1.5"
      >
        <Building2 size={14} />
        Companies
      </button>
    );
  }

  return (
    <div className="absolute top-3 left-3 z-[1000] w-64 max-h-[calc(100%-1.5rem)] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg flex flex-col overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-white font-semibold text-xs flex items-center gap-1.5">
          <Building2 size={14} /> Companies
        </h2>
        <button
          onClick={() => setPanelOpen(false)}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <p className="text-gray-500 text-xs p-3">No buildings yet</p>
        )}

        {groups.map(group => {
          const isOpen = !collapsed.has(group.ownerId);

          return (
            <div key={group.ownerId}>
              {/* Owner header */}
              <button
                onClick={() => toggle(group.ownerId)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs hover:bg-gray-800/60 transition-colors border-b border-gray-800/50"
              >
                {isOpen
                  ? <ChevronDown size={12} className="text-gray-500 shrink-0" />
                  : <ChevronRight size={12} className="text-gray-500 shrink-0" />}
                <span className={`font-medium truncate ${group.isMine ? 'text-emerald-400' : 'text-gray-300'}`}>
                  {group.ownerName}
                </span>
                <span className="text-gray-600 ml-auto shrink-0">{group.buildings.length}</span>
              </button>

              {/* Building list */}
              {isOpen && (
                <div className="bg-gray-950/30">
                  {group.buildings.map(tile => {
                    const icon = BUILDING_ICONS[tile.building_type?.toLowerCase() ?? ''] ?? '🏢';
                    const isSelected = tile.tile_id === selectedTileId;
                    const dotClass = STATUS_DOT[tile.building_status] ?? 'bg-gray-600';

                    return (
                      <button
                        key={tile.tile_id}
                        onClick={() => onSelectTile(tile)}
                        className={`w-full flex items-center gap-2 px-4 py-1.5 text-xs transition-colors ${
                          isSelected
                            ? 'bg-indigo-900/40 text-white'
                            : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                        }`}
                      >
                        <span className="shrink-0">{icon}</span>
                        <span className="truncate">{tile.building_name}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ml-auto shrink-0 ${dotClass}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

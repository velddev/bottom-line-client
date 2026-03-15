import { useState, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, Building2, Users, Layers } from 'lucide-react';
import type { TileInfo } from '../types';
import { BUILDING_ICONS } from '../types';
import Panel from './Panel';

interface CompanyListProps {
  tiles: Map<string, TileInfo>;
  myPlayerId: string;
  onSelectTile: (tile: TileInfo) => void;
  selectedTileId?: string;
}

interface ListGroup {
  id: string;
  label: string;
  icon?: string;
  buildings: TileInfo[];
  highlight?: boolean;
}

type GroupMode = 'company' | 'building';

const STATUS_DOT: Record<string, string> = {
  Producing: 'bg-emerald-400',
  Idle: 'bg-gray-500',
  UnderConstruction: 'bg-amber-400',
  Paused: 'bg-yellow-400',
  MissingResources: 'bg-rose-400',
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CompanyList({ tiles, myPlayerId, onSelectTile, selectedTileId }: CompanyListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(true);
  const [groupMode, setGroupMode] = useState<GroupMode>('company');
  const collapsedInit = useRef<GroupMode | null>(null);

  const groups = useMemo((): ListGroup[] => {
    if (groupMode === 'company') {
      const byOwner = new Map<string, ListGroup>();

      for (const tile of tiles.values()) {
        if (!tile.building_id) continue;
        const ownerId = tile.owner_player_id || 'government';
        if (!byOwner.has(ownerId)) {
          byOwner.set(ownerId, {
            id: ownerId,
            label: tile.owner_name || 'Government',
            buildings: [],
            highlight: ownerId === myPlayerId,
          });
        }
        byOwner.get(ownerId)!.buildings.push(tile);
      }

      return [...byOwner.values()].sort((a, b) => {
        if (a.highlight !== b.highlight) return a.highlight ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    } else {
      const byType = new Map<string, ListGroup>();

      for (const tile of tiles.values()) {
        if (!tile.building_id) continue;
        const type = tile.building_type?.toLowerCase() ?? 'unknown';
        if (!byType.has(type)) {
          byType.set(type, {
            id: type,
            label: capitalize(type),
            icon: BUILDING_ICONS[type] ?? '🏢',
            buildings: [],
          });
        }
        byType.get(type)!.buildings.push(tile);
      }

      return [...byType.values()].sort((a, b) => a.label.localeCompare(b.label));
    }
  }, [tiles, myPlayerId, groupMode]);

  // Collapse all groups except player's own on first load (per mode)
  if (collapsedInit.current !== groupMode && groups.length > 0) {
    collapsedInit.current = groupMode;
    const initialCollapsed = new Set<string>();
    if (groupMode === 'company') {
      for (const g of groups) {
        if (!g.highlight) initialCollapsed.add(g.id);
      }
    }
    // For building mode, start all expanded
    setCollapsed(initialCollapsed);
  }

  const toggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        Buildings
      </button>
    );
  }

  return (
    <Panel
      className="absolute top-3 left-3 z-[1000] w-64 max-h-[calc(100%-1.5rem)]"
      title={<><Building2 size={14} /> Buildings</>}
      onClose={() => setPanelOpen(false)}
      headerActions={
        <>
          <button
            onClick={() => setGroupMode('company')}
            title="Group by company"
            className={`p-1 rounded transition-colors ${groupMode === 'company' ? 'text-white bg-gray-700' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Users size={12} />
          </button>
          <button
            onClick={() => setGroupMode('building')}
            title="Group by type"
            className={`p-1 rounded transition-colors ${groupMode === 'building' ? 'text-white bg-gray-700' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Layers size={12} />
          </button>
        </>
      }
      bodyClassName=""
    >
        {groups.length === 0 && (
          <p className="text-gray-500 text-xs p-3">No buildings yet</p>
        )}

        {groups.map(group => {
          const isOpen = !collapsed.has(group.id);

          return (
            <div key={group.id}>
              {/* Group header */}
              <button
                onClick={() => toggle(group.id)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs hover:bg-gray-800/60 transition-colors border-b border-gray-800/50"
              >
                {isOpen
                  ? <ChevronDown size={12} className="text-gray-500 shrink-0" />
                  : <ChevronRight size={12} className="text-gray-500 shrink-0" />}
                {group.icon && <span className="shrink-0">{group.icon}</span>}
                <span className={`font-medium truncate ${group.highlight ? 'text-emerald-400' : 'text-gray-300'}`}>
                  {group.label}
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
                        <span className="truncate">
                          {groupMode === 'building' ? (tile.owner_name || tile.building_name) : tile.building_name}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ml-auto shrink-0 ${dotClass}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Panel>
    );
}

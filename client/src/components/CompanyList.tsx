import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Building2, Users, Layers, Eye, EyeOff } from 'lucide-react';
import type { TileInfo } from '../types';
import { BUILDING_ICONS } from '../types';
import Panel from './Panel';

interface CompanyListProps {
  tiles: Map<string, TileInfo>;
  myPlayerId: string;
  onSelectTile: (tile: TileInfo) => void;
  onToggleCompanyVisibility?: (playerId: string) => void;
  selectedTileId?: string;
  visibleCompanyIds?: Set<string>;
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

export default function CompanyList({ tiles, myPlayerId, onSelectTile, onToggleCompanyVisibility, selectedTileId, visibleCompanyIds }: CompanyListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(true);
  const [groupMode, setGroupMode] = useState<GroupMode>('company');

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
  const hasInitialized = useRef<string | null>(null);
  useEffect(() => {
    if (groups.length === 0) return;
    // Only auto-collapse once per mode switch (or on first load)
    if (hasInitialized.current === groupMode) return;
    hasInitialized.current = groupMode;

    const initialCollapsed = new Set<string>();
    if (groupMode === 'company') {
      for (const g of groups) {
        if (!g.highlight) initialCollapsed.add(g.id);
      }
    }
    // For building mode, start all expanded
    setCollapsed(initialCollapsed);
  }, [groupMode, groups]);

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
        className="pointer-events-auto overlay-panel rounded-lg px-3 py-2 shadow-xl text-xs text-gray-700 hover:text-gray-900 transition-colors flex items-center gap-1.5"
      >
        <Building2 size={14} />
        Buildings
      </button>
    );
  }

  return (
    <Panel
      className="pointer-events-auto w-64 h-full"
      title={<><Building2 size={14} /> Buildings</>}
      onClose={() => setPanelOpen(false)}
      headerActions={
        <>
          <button
            onClick={() => setGroupMode('company')}
            title="Group by company"
            className={`p-1 rounded transition-colors ${groupMode === 'company' ? 'text-gray-900 bg-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Users size={12} />
          </button>
          <button
            onClick={() => setGroupMode('building')}
            title="Group by type"
            className={`p-1 rounded transition-colors ${groupMode === 'building' ? 'text-gray-900 bg-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Layers size={12} />
          </button>
        </>
      }
      bodyClassName=""
    >
        {groups.length === 0 && (
          <p className="text-gray-600 text-xs p-3">No buildings yet</p>
        )}

        {groups.map(group => {
          const isOpen = !collapsed.has(group.id);

          return (
            <div key={group.id}>
              {/* Group header */}
              <div className={`flex items-center border-b border-gray-200 ${
                visibleCompanyIds?.has(group.id) ? 'bg-indigo-900/30' : ''
              }`}>
                <button
                  onClick={() => toggle(group.id)}
                  className="flex-1 flex items-center gap-1.5 px-3 py-2 text-xs hover:bg-gray-100/60 transition-colors"
                >
                  {isOpen
                    ? <ChevronDown size={12} className="text-gray-500 shrink-0" />
                    : <ChevronRight size={12} className="text-gray-500 shrink-0" />}
                  {group.icon && <span className="shrink-0">{group.icon}</span>}
                  <span className={`font-medium truncate ${group.highlight ? 'text-emerald-400' : 'text-gray-700'}`}>
                    {group.label}
                  </span>
                  <span className="text-gray-600 ml-auto shrink-0">{group.buildings.length}</span>
                </button>
                {groupMode === 'company' && onToggleCompanyVisibility && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCompanyVisibility(group.id);
                    }}
                    className="px-2 py-2 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                    title={visibleCompanyIds?.has(group.id) ? 'Hide buildings' : 'Show buildings'}
                  >
                    {visibleCompanyIds?.has(group.id)
                      ? <Eye size={14} />
                      : <EyeOff size={14} className="opacity-40" />}
                  </button>
                )}
              </div>

              {/* Building list */}
              {isOpen && (
                <div className="bg-gray-100/30">
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
                            ? 'bg-indigo-900/40 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-100/40 hover:text-gray-800'
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

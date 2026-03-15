import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Package } from 'lucide-react';
import { useAuth } from '../auth';
import {
  listTiles, purchaseTile, listCities,
  constructBuilding, configureBuilding, listRecipes, getInventory,
  listBuildings,
} from '../api';
import type { TileInfo, RecipeInfo, BuildingStatus, CityInfo } from '../types';
import { BUILDING_ICONS, BUILDING_TYPES, fmtMoney } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';
import PoliticsPanel from '../components/PoliticsPanel';
import BankPanel from '../components/BankPanel';
import SupplySection from '../components/SupplySection';
import EtaCountdown from '../components/EtaCountdown';
import { useTickRefresh } from '../hooks/useTickRefresh';
import CityScene3D from '../components/CityScene3D';
import TileGrid3D from '../components/TileGrid3D';
import Badge from '../components/ui/Badge';
import BuildingMeshes from '../components/BuildingMeshes';
import TileTooltip3D from '../components/TileTooltip3D';
import RoadNetwork3D from '../components/RoadNetwork3D';
import TileDecorations from '../components/TileDecorations';
import MapBorder from '../components/MapBorder';
import FarmAnimals from '../components/FarmAnimals';
import TileSelector3D from '../components/TileSelector3D';
import CompanyList from '../components/CompanyList';
import Panel from '../components/Panel';
import UnifiedChatPanel from '../components/UnifiedChatPanel';
import SupplyVehicles3D from '../components/SupplyVehicles3D';
import { useAllPlayerSupplyLinks } from '../hooks/useAllPlayerSupplyLinks';
import { tileToWorld } from '../components/cityGrid';

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';
const CHUNK_SIZE = 20;
const GRID_COLS = 120;
const GRID_ROWS = 120;

const WARNING_STATUSES = new Set(['MissingResources', 'Paused']);

function StatusBadge({ status }: { status: string }) {
  const LABELS: Record<string, string> = {
    Producing: 'Producing', Idle: 'Idle',
    UnderConstruction: 'Building…', Paused: 'Paused',
    MissingResources: '⚠️ Missing',
  };
  const VARIANT_MAP: Record<string, 'success' | 'warning' | 'paused' | 'danger' | 'default'> = {
    Producing: 'success',
    UnderConstruction: 'warning',
    Paused: 'paused',
    MissingResources: 'danger',
    Idle: 'default',
  };
  return <Badge variant={VARIANT_MAP[status] ?? 'default'}>{LABELS[status] ?? status}</Badge>;
}

// ── Configure modal ────────────────────────────────────────────────────────────
function ConfigureModal({
  buildingId, buildingType, buildingName, currentRecipe, currentWorkers, onClose,
}: {
  buildingId: string; buildingType: string; buildingName: string;
  currentRecipe: string; currentWorkers: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ recipe_id: currentRecipe, workers_assigned: currentWorkers || 1 });
  const { data: recipesResp } = useQuery({
    queryKey: ['recipes', buildingType],
    queryFn: () => listRecipes(buildingType),
  });
  const mut = useMutation({
    mutationFn: () => configureBuilding(buildingId, form.recipe_id, form.workers_assigned),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['building', buildingId] });
      qc.invalidateQueries({ queryKey: ['buildings'] });
      onClose();
    },
  });
  const selectedRecipe = (recipesResp?.recipes ?? []).find((r: RecipeInfo) => r.recipe_id === form.recipe_id);

  return (
    <Modal
      title={`Configure — ${buildingName}`}
      onClose={onClose}
      onSubmit={() => mut.mutate()}
      submitLabel={mut.isPending ? 'Saving…' : 'Save'}
      submitDisabled={mut.isPending}
    >
      <Field label="Recipe">
        <Select value={form.recipe_id} onChange={(e) => setForm((f) => ({ ...f, recipe_id: e.target.value }))}>
          <option value="">— None —</option>
          {(recipesResp?.recipes ?? []).map((r: RecipeInfo) => (
            <option key={r.recipe_id} value={r.recipe_id}>{r.name} ({r.output_type}, {r.ticks_required}d)</option>
          ))}
        </Select>
      </Field>
      <Field label="Workers">
        <Input type="number" min={0} value={form.workers_assigned}
          onChange={(e) => setForm((f) => ({ ...f, workers_assigned: parseInt(e.target.value) || 0 }))} />
      </Field>
      {selectedRecipe && (
        <div className="bg-gray-100 rounded p-3 text-xs space-y-1">
          <p className="text-gray-700">Output: <span className="text-gray-900">{selectedRecipe.output_min}–{selectedRecipe.output_max} {selectedRecipe.output_type}</span></p>
          <p className="text-gray-700">Needs: {selectedRecipe.ingredients.map((i) => `${i.quantity}× ${i.resource_type}`).join(', ') || 'none'}</p>
        </div>
      )}
      {mut.isError && <p className="text-rose-400 text-xs">{(mut.error as Error).message}</p>}
    </Modal>
  );
}

// ── Inventory modal ────────────────────────────────────────────────────────────
function InventoryModal({ buildingId, buildingName, onClose }: { buildingId: string; buildingName: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['inventory', buildingId], queryFn: () => getInventory(buildingId) });
  return (
    <Modal title={`Inventory — ${buildingName}`} onClose={onClose}>
      {!data && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
      {data && data.items.length === 0 && <p className="text-gray-600 text-xs">Empty</p>}
      {data && data.items.length > 0 && (
        <table className="w-full text-xs">
          <thead><tr className="text-gray-500 border-b border-gray-200">
            {['Resource', 'Qty', 'Quality', 'Brand'].map((h) => (
              <th key={h} className="text-left py-1.5 pr-3 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>{data.items.map((item, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-1.5 pr-3 text-gray-900 capitalize">{item.resource_type}</td>
              <td className="py-1.5 pr-3 font-mono text-gray-700">{item.quantity.toFixed(1)}</td>
              <td className="py-1.5 pr-3 font-mono text-gray-700">{item.quality.toFixed(2)}</td>
              <td className="py-1.5 text-gray-500">{item.brand_id || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function TilesScreen() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const { nextTickAt } = useTickRefresh();
  const { data: myBuildingsData } = useQuery({ queryKey: ['buildings'], queryFn: listBuildings, staleTime: 60_000, enabled: !!auth });
  const myBuildings = (myBuildingsData?.buildings ?? []) as BuildingStatus[];
  const supplyRoutes = useAllPlayerSupplyLinks(myBuildings);
  const [citiesData, setCitiesData] = useState<{ cities: CityInfo[] } | null>(null);
  useEffect(() => { listCities().then(setCitiesData).catch(() => {}); }, []);
  const cityId = citiesData?.cities?.[0]?.city_id ?? '';
  const currentTick = citiesData?.cities?.[0]?.current_tick ?? 0;

  // Tile data cache — shared across SSE + chunk loading
  const tileCache = useRef<Map<string, TileInfo>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<Set<string>>(new Set());
  const [tiles, setTiles] = useState<Map<string, TileInfo>>(new Map());

  const [selectedTile, setSelectedTile] = useState<TileInfo | null>(null);
  const [hoveredTile, setHoveredTile] = useState<TileInfo | null>(null);

  // Clear caches when cityId changes
  useEffect(() => {
    tileCache.current.clear();
    fetchedRef.current.clear();
    fetchingRef.current.clear();
    setTiles(new Map());
  }, [cityId]);

  // Load only chunks that overlap the visible tile bounds
  const loadVisibleChunks = useCallback(async (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => {
    if (!cityId) return;
    const minCX = Math.floor(bounds.minX / CHUNK_SIZE);
    const maxCX = Math.floor(bounds.maxX / CHUNK_SIZE);
    const minCY = Math.floor(bounds.minY / CHUNK_SIZE);
    const maxCY = Math.floor(bounds.maxY / CHUNK_SIZE);

    const chunks: Promise<void>[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = `${cx}_${cy}`;
        if (fetchedRef.current.has(key) || fetchingRef.current.has(key)) continue;
        chunks.push((async () => {
          fetchingRef.current.add(key);
          const minX = cx * CHUNK_SIZE, minY = cy * CHUNK_SIZE;
          const maxX = Math.min(minX + CHUNK_SIZE - 1, GRID_COLS - 1);
          const maxY = Math.min(minY + CHUNK_SIZE - 1, GRID_ROWS - 1);
          try {
            const res = await listTiles(cityId, minX, minY, maxX, maxY);
            res.tiles.forEach(t => tileCache.current.set(`${t.grid_x}_${t.grid_y}`, t));
            fetchedRef.current.add(key);
          } finally {
            fetchingRef.current.delete(key);
          }
        })());
      }
    }
    if (chunks.length > 0) {
      await Promise.all(chunks);
      setTiles(new Map(tileCache.current));
    }
  }, [cityId]);

  // Stable callback ref for visible bounds changes (avoids re-renders in CityScene3D)
  const loadVisibleChunksRef = useRef(loadVisibleChunks);
  loadVisibleChunksRef.current = loadVisibleChunks;
  const lastVisibleBoundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const handleVisibleBoundsChange = useCallback(
    (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => {
      lastVisibleBoundsRef.current = bounds;
      loadVisibleChunksRef.current(bounds);
    }, []
  );

  // SSE subscription for live tile updates
  useEffect(() => {
    if (!auth?.api_key || !cityId) return;

    const es = new EventSource(
      `/api/events/stream?api_key=${encodeURIComponent(auth.api_key)}&city_id=${encodeURIComponent(cityId)}`
    );

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data as string);
        if (evt.tileChanged) {
          const tc = evt.tileChanged;
          const key = `${tc.gridX ?? 0}_${tc.gridY ?? 0}`;
          const existing = tileCache.current.get(key);

          const updated: TileInfo = {
            tile_id:                      tc.tileId       ?? '',
            city_id:                      tc.cityId       ?? '',
            grid_x:                       tc.gridX        ?? 0,
            grid_y:                       tc.gridY        ?? 0,
            owner_player_id:              tc.ownerPlayerId ?? '',
            owner_name:                   tc.ownerName    ?? '',
            is_for_sale:                  tc.isForSale    ?? false,
            purchase_price:               tc.purchasePrice ?? 0,
            building_id:                  tc.buildingId   ?? '',
            building_name:                tc.buildingName ?? '',
            building_type:                tc.buildingType ?? '',
            building_status:              tc.buildingStatus ?? '',
            is_reserved_for_citizens:     tc.isReservedForCitizens ?? false,
            building_player_id:           tc.buildingPlayerId ?? '',
            building_player_name:         tc.buildingPlayerName ?? '',
            building_level:               tc.buildingLevel ?? 0,
            construction_ready_at_tick:   tc.constructionReadyAtTick ?? 0,
            population_capacity:          tc.populationCapacity ?? 0,
            is_government_port:           tc.isGovernmentPort ?? false,
          };

          // Skip update if tile data hasn't changed
          if (existing
            && existing.building_status === updated.building_status
            && existing.building_id === updated.building_id
            && existing.owner_player_id === updated.owner_player_id
            && existing.owner_name === updated.owner_name
            && existing.is_for_sale === updated.is_for_sale
            && existing.purchase_price === updated.purchase_price
            && existing.building_name === updated.building_name
            && existing.building_type === updated.building_type
          ) return;

          tileCache.current.set(key, updated);
          setTiles(new Map(tileCache.current));
        }
      } catch { /* ignore parse errors */ }
    };

    // 60-second fallback refresh — re-fetch visible chunks
    const refresh = setInterval(() => {
      fetchedRef.current.clear();
      if (lastVisibleBoundsRef.current) {
        loadVisibleChunksRef.current(lastVisibleBoundsRef.current);
      }
    }, 60_000);

    return () => { es.close(); clearInterval(refresh); };
  }, [auth?.api_key, cityId]);

  // Refresh tile chunk after purchase/build
  const refreshTileChunk = useCallback((tile: TileInfo) => {
    const cx = Math.floor(tile.grid_x / CHUNK_SIZE);
    const cy = Math.floor(tile.grid_y / CHUNK_SIZE);
    fetchedRef.current.delete(`${cx}_${cy}`);
    loadVisibleChunks({
      minX: cx * CHUNK_SIZE,
      maxX: cx * CHUNK_SIZE + CHUNK_SIZE - 1,
      minY: cy * CHUNK_SIZE,
      maxY: cy * CHUNK_SIZE + CHUNK_SIZE - 1,
    });
  }, [loadVisibleChunks]);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const [isPurchasing, setIsPurchasing] = useState(false);
  async function handlePurchase() {
    if (!selectedTile) return;
    setIsPurchasing(true);
    try {
      const res = await purchaseTile(selectedTile.tile_id);
      setFlash({ ok: true, msg: `Tile purchased! Balance: ${fmtMoney(res.new_balance)}` });
      refreshTileChunk(selectedTile);
      setSelectedTile(null);
    } catch (err) {
      setFlash({ ok: false, msg: err instanceof Error ? err.message : 'Purchase failed' });
    } finally {
      setIsPurchasing(false);
    }
  }

  const [buildForm, setBuildForm] = useState({ building_type: 'factory', name: '' });
  const [showBuildForm, setShowBuildForm] = useState(false);
  const buildMut = useMutation({
    mutationFn: () => constructBuilding(auth!.city_id, buildForm.building_type, buildForm.name, selectedTile!.tile_id),
    onSuccess: (res) => {
      setFlash({ ok: true, msg: `Building started! Ready in ${res.construction_ticks_remaining} days.` });
      qc.invalidateQueries({ queryKey: ['buildings'] });
      refreshTileChunk(selectedTile!);
      setSelectedTile(null);
      setShowBuildForm(false);
    },
    onError: (err) => setFlash({ ok: false, msg: (err as Error).message }),
  });

  const [configTarget, setConfigTarget] = useState<TileInfo | null>(null);
  const [invTarget, setInvTarget] = useState<TileInfo | null>(null);

  const [activeTab, setActiveTab] = useState<'supply' | 'info'>('supply');
  useEffect(() => { setActiveTab('supply'); }, [selectedTile?.tile_id]);

  const isMine = !!selectedTile && selectedTile.owner_player_id === auth?.player_id;
  const hasBuilding = !!selectedTile?.building_id;
  const selectedBldInfo = hasBuilding
    ? myBuildings.find((b) => b.building_id === selectedTile!.building_id)
    : undefined;
  const isLandmark = selectedTile?.building_type?.toLowerCase() === 'landmark';
  const isBank = selectedTile?.building_type?.toLowerCase() === 'bank';
  const isGovBuilding = isLandmark || isBank;

  // Remaining construction ticks — prefer myBuildings data, fall back to tile data
  const constructionTicksRemaining =
    selectedBldInfo?.construction_ticks_remaining
    ?? (selectedTile?.construction_ready_at_tick && currentTick
        ? Math.max(0, selectedTile.construction_ready_at_tick - currentTick)
        : 0);

  // Camera focus — only triggered by company list clicks, not map tile clicks
  const [focusTile, setFocusTile] = useState<TileInfo | null>(null);
  const initialFocusDone = useRef(false);
  const [snapCamera, setSnapCamera] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const focusWorldPos = useMemo<[number, number] | null>(() => {
    if (!focusTile) return null;
    return tileToWorld(focusTile.grid_x, focusTile.grid_y);
  }, [focusTile?.tile_id]);

  // On first load, center on a player-owned tile (if any)
  useEffect(() => {
    if (initialFocusDone.current || tiles.size === 0 || !auth?.player_id) return;
    initialFocusDone.current = true;
    let found = false;
    for (const tile of tiles.values()) {
      if (tile.owner_player_id === auth.player_id && tile.building_id) {
        setFocusTile(tile);
        found = true;
        break;
      }
    }
    if (!found) {
      for (const tile of tiles.values()) {
        if (tile.owner_player_id === auth.player_id) {
          setFocusTile(tile);
          found = true;
          break;
        }
      }
    }
    // After initial focus, disable snap for subsequent focuses
    if (found) {
      requestAnimationFrame(() => setSnapCamera(false));
    }
    // Reveal map after a brief delay for models to render
    setTimeout(() => setMapReady(true), 200);
  }, [tiles, auth?.player_id]);

  const handleCompanyListSelect = useCallback((tile: TileInfo) => {
    setSelectedTile(tile);
    setFocusTile(tile);
  }, []);

  return (
    <>
    <div className="flex-1 min-h-0 relative" style={{ backgroundColor: '#f3f4f6' }}>
      {/* Full-bleed 3D city map */}
      <div
        className="absolute inset-0"
        style={{
          opacity: mapReady ? 1 : 0,
          transition: 'opacity 0.5s ease-in',
        }}
      >
        <CityScene3D focusWorldPos={focusWorldPos} snapNextFocus={snapCamera} onVisibleBoundsChange={handleVisibleBoundsChange}>
          <TileGrid3D
            tiles={tiles}
            myPlayerId={auth?.player_id ?? ''}
            selectedTile={selectedTile}
            hoveredTile={hoveredTile}
            onSelect={setSelectedTile}
            onHover={setHoveredTile}
          />
          <BuildingMeshes
            tiles={tiles}
            myPlayerId={auth?.player_id ?? ''}
          />
          <RoadNetwork3D />
          <TileDecorations />
          <MapBorder />
          <FarmAnimals tiles={tiles} buildings={myBuildings} />
          <SupplyVehicles3D routes={supplyRoutes} />
          {selectedTile && (
            <TileSelector3D gridX={selectedTile.grid_x} gridY={selectedTile.grid_y} />
          )}
          <TileTooltip3D
            hoveredTile={hoveredTile}
            selectedTile={selectedTile}
          />
        </CityScene3D>
      </div>

      {/* Left overlay column: buildings (top, flex-1) + chat (bottom, shrink-0) */}
      <div
        className="absolute top-3 left-3 bottom-4 z-[1001] flex flex-col gap-2 pointer-events-none items-start"
        style={{
          opacity: mapReady ? 1 : 0,
          transform: mapReady ? 'translateX(0)' : 'translateX(-1rem)',
          transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
        }}
      >
        {/* Buildings panel fills all remaining height above chat */}
        <div className="pointer-events-none flex-1 min-h-0 w-64 flex flex-col">
          <CompanyList
            tiles={tiles}
            myPlayerId={auth?.player_id ?? ''}
            onSelectTile={handleCompanyListSelect}
            selectedTileId={selectedTile?.tile_id}
          />
        </div>

        {/* Chat panel anchored to the bottom of the column */}
        {auth?.city_id && (
          <div className="pointer-events-none shrink-0">
            <UnifiedChatPanel cityId={auth.city_id} apiKey={auth.api_key} />
          </div>
        )}
      </div>

      {/* Flash toast (top-center) */}
      {flash && (
        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-[1001] text-xs px-4 py-2 rounded-lg border shadow-xl ${flash.ok ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300' : 'bg-rose-900/90 border-rose-600 text-rose-300'}`}>
          {flash.ok ? '✅' : '❌'} {flash.msg}
        </div>
      )}

        {selectedTile && (
          <Panel
            className="absolute top-3 right-3 w-80 max-h-[calc(100%-1.5rem)] z-[1000]"
            title={
              hasBuilding
                ? `${BUILDING_ICONS[selectedTile.building_type?.toLowerCase() ?? ''] ?? '🏢'} ${selectedTile.building_name}`
                : `Tile (${selectedTile.grid_x}, ${selectedTile.grid_y})`
            }
            onClose={() => { setSelectedTile(null); setShowBuildForm(false); }}
            subheader={
              <div className="text-xs text-gray-600 flex items-center gap-2">
                <span className="truncate">{selectedTile.owner_name || 'Unowned'}</span>
                {hasBuilding && <StatusBadge status={selectedTile.building_status} />}
                {hasBuilding && selectedTile.building_status === 'UnderConstruction' && constructionTicksRemaining > 0 && (
                  <EtaCountdown ticks={constructionTicksRemaining} nextTickAt={nextTickAt} />
                )}
                {selectedTile.is_for_sale && (
                  <span className="text-cyan-400 shrink-0">{fmtMoney(selectedTile.purchase_price)}</span>
                )}
              </div>
            }
            footer={
              isMine && hasBuilding && !isGovBuilding ? (
                <div className="flex gap-2">
                  <button onClick={() => setConfigTarget(selectedTile)}
                    className="flex-1 flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs py-1.5 rounded transition-colors">
                    <Settings size={12} /> Config
                  </button>
                  <button onClick={() => setInvTarget(selectedTile)}
                    className="flex-1 flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs py-1.5 rounded transition-colors">
                    <Package size={12} /> Stock
                  </button>
                </div>
              ) : undefined
            }
          >
            {/* Purchase */}
            {selectedTile.is_for_sale && auth && (
              <button disabled={isPurchasing} onClick={handlePurchase}
                className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-gray-900 text-xs font-semibold py-2 rounded transition-colors">
                {isPurchasing ? 'Buying…' : `Buy for ${fmtMoney(selectedTile.purchase_price)}`}
              </button>
            )}

            {/* Build on vacant tile */}
            {isMine && !hasBuilding && (
              !showBuildForm ? (
                <button onClick={() => setShowBuildForm(true)}
                  className="w-full text-xs bg-indigo-700 hover:bg-indigo-600 text-gray-900 py-2 rounded transition-colors">
                  ⚒️ Build here
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-gray-600 text-xs font-semibold">New building</p>
                  <select value={buildForm.building_type}
                    onChange={(e) => setBuildForm((f) => ({ ...f, building_type: e.target.value }))}
                    className="w-full bg-gray-100 border border-gray-200 text-gray-900 text-xs rounded px-2 py-1.5">
                    {BUILDING_TYPES.map((t) => (
                      <option key={t} value={t}>{BUILDING_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                    <optgroup label="Residential">
                      {(['residential_low', 'residential_medium', 'residential_high'] as const).map((t) => (
                        <option key={t} value={t}>{BUILDING_ICONS[t]} {t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </optgroup>
                  </select>
                  <input placeholder="Building name" value={buildForm.name}
                    onChange={(e) => setBuildForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-gray-100 border border-gray-200 text-gray-900 text-xs rounded px-2 py-1.5 placeholder-gray-400" />
                  <div className="flex gap-2">
                    <button disabled={buildMut.isPending || !buildForm.name.trim()} onClick={() => buildMut.mutate()}
                      className="flex-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-gray-900 text-xs py-1.5 rounded">
                      {buildMut.isPending ? 'Starting…' : 'Build'}
                    </button>
                    <button onClick={() => setShowBuildForm(false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs py-1.5 rounded">Cancel</button>
                  </div>
                </div>
              )
            )}

            {/* Building supply section */}
            {isMine && hasBuilding && !isGovBuilding && (
              <SupplySection
                buildingId={selectedTile.building_id}
                buildingType={selectedTile.building_type?.toLowerCase() ?? ''}
                cityId={cityId}
              />
            )}

            {isMine && hasBuilding && !isGovBuilding && activeTab === 'info' && (
              <div className="space-y-2 text-xs">
                <p className="text-gray-700">Type: <span className="text-gray-900 capitalize">{selectedTile.building_type?.toLowerCase()}</span></p>
                <p className="text-gray-700 flex items-center gap-2">
                  Status: <StatusBadge status={selectedTile.building_status} />
                  {selectedTile.building_status === 'UnderConstruction' && constructionTicksRemaining > 0 && (
                    <span className="text-gray-500">ready in <EtaCountdown ticks={constructionTicksRemaining} nextTickAt={nextTickAt} /></span>
                  )}
                </p>
              </div>
            )}

            {/* Government landmark — politics panel */}
            {isLandmark && <PoliticsPanel />}
            {isBank     && <BankPanel />}
          </Panel>
        )}
    </div>

      {configTarget?.building_id && (
        <ConfigureModal
          buildingId={configTarget.building_id}
          buildingType={configTarget.building_type?.toLowerCase() ?? ''}
          buildingName={configTarget.building_name}
          currentRecipe=""
          currentWorkers={1}
          onClose={() => setConfigTarget(null)}
        />
      )}
      {invTarget?.building_id && (
        <InventoryModal
          buildingId={invTarget.building_id}
          buildingName={invTarget.building_name}
          onClose={() => setInvTarget(null)}
        />
      )}
    </>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer as LeafletTileLayer, useMap } from 'react-leaflet';
import type { Map as LeafletMap, LatLngBounds } from 'leaflet';
import L from 'leaflet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Package } from 'lucide-react';
import { useAuth } from '../auth';
import {
  listTiles, purchaseTile, listCities,
  constructBuilding, configureBuilding, listRecipes, getInventory,
} from '../api';
import type { TileInfo, ListTilesResponse, RecipeInfo } from '../types';
import { BUILDING_ICONS, BUILDING_TYPES, fmtMoney } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';
import PoliticsPanel from '../components/PoliticsPanel';
import BankPanel from '../components/BankPanel';
import SupplySection from '../components/SupplySection';

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';
const CHUNK_SIZE = 20;
const MIN_TILE_ZOOM = 14;
const MIN_MARKER_ZOOM = 16;

const WARNING_STATUSES = new Set(['MissingResources', 'Paused']);

function tileColor(tile: TileInfo, myPlayerId: string): string {
  if (tile.owner_player_id === myPlayerId) {
    if (WARNING_STATUSES.has(tile.building_status)) return '#92400e'; // amber for warning
    return '#166534';
  }
  if (tile.is_for_sale) return '#1e3a5f';
  return '#1f2937';
}

function tileFillOpacity(tile: TileInfo, myPlayerId: string): number {
  if (tile.owner_player_id && tile.owner_player_id !== myPlayerId && tile.owner_player_id !== GOVERNMENT_ID) return 0;
  return 0.55;
}

type TileMeta = Pick<ListTilesResponse,
  'tile_origin_lat' | 'tile_origin_lon' | 'tile_grid_cols' | 'tile_grid_rows' | 'tile_size_meters'
>;

function gridToLatLon(x: number, y: number, meta: TileMeta) {
  return {
    lat: meta.tile_origin_lat + y * meta.tile_size_meters / 111_000,
    lon: meta.tile_origin_lon + x * meta.tile_size_meters / 67_600,
  };
}

function boundsToGrid(bounds: LatLngBounds, meta: TileMeta) {
  const tileLat = meta.tile_size_meters / 111_000;
  const tileLon = meta.tile_size_meters / 67_600;
  return {
    minX: Math.max(0, Math.floor((bounds.getWest()  - meta.tile_origin_lon) / tileLon)),
    maxX: Math.min(meta.tile_grid_cols - 1, Math.ceil((bounds.getEast()  - meta.tile_origin_lon) / tileLon)),
    minY: Math.max(0, Math.floor((bounds.getSouth() - meta.tile_origin_lat) / tileLat)),
    maxY: Math.min(meta.tile_grid_rows - 1, Math.ceil((bounds.getNorth() - meta.tile_origin_lat) / tileLat)),
  };
}

function StatusBadge({ status }: { status: string }) {
  const LABELS: Record<string, string> = {
    Producing: 'Producing', Idle: 'Idle',
    UnderConstruction: 'Building…', Paused: 'Paused',
    MissingResources: '⚠️ Missing',
  };
  const cls =
    status === 'Producing'         ? 'bg-emerald-900/40 text-emerald-400' :
    status === 'UnderConstruction' ? 'bg-amber-900/40 text-amber-400' :
    status === 'Paused'            ? 'bg-yellow-900/40 text-yellow-400' :
    status === 'MissingResources'  ? 'bg-rose-900/40 text-rose-400' :
                                     'bg-gray-800 text-gray-400';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{LABELS[status] ?? status}</span>;
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
            <option key={r.recipe_id} value={r.recipe_id}>{r.name} ({r.output_type}, {r.ticks_required}t)</option>
          ))}
        </Select>
      </Field>
      <Field label="Workers">
        <Input type="number" min={0} value={form.workers_assigned}
          onChange={(e) => setForm((f) => ({ ...f, workers_assigned: parseInt(e.target.value) || 0 }))} />
      </Field>
      {selectedRecipe && (
        <div className="bg-gray-800 rounded p-3 text-xs space-y-1">
          <p className="text-gray-400">Output: <span className="text-white">{selectedRecipe.output_min}–{selectedRecipe.output_max} {selectedRecipe.output_type}</span></p>
          <p className="text-gray-400">Needs: {selectedRecipe.ingredients.map((i) => `${i.quantity}× ${i.resource_type}`).join(', ') || 'none'}</p>
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
      {data && data.items.length === 0 && <p className="text-gray-500 text-xs">Empty</p>}
      {data && data.items.length > 0 && (
        <table className="w-full text-xs">
          <thead><tr className="text-gray-500 border-b border-gray-700">
            {['Resource', 'Qty', 'Quality', 'Brand'].map((h) => (
              <th key={h} className="text-left py-1.5 pr-3 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>{data.items.map((item, i) => (
            <tr key={i} className="border-b border-gray-800">
              <td className="py-1.5 pr-3 text-white capitalize">{item.resource_type}</td>
              <td className="py-1.5 pr-3 font-mono text-gray-300">{item.quantity.toFixed(1)}</td>
              <td className="py-1.5 pr-3 font-mono text-gray-300">{item.quality.toFixed(2)}</td>
              <td className="py-1.5 text-gray-500">{item.brand_id || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Modal>
  );
}

// ── Sell (auto-sell config) modal ─────────────────────────────────────────────
// Removed: auto-sell config is now inline in the Supply section.

// ── Map layer component ────────────────────────────────────────────────────────
function TileLayer_({
  cityId, meta, myPlayerId, selectedTile, onSelect, apiKey,
}: {
  cityId: string; meta: TileMeta; myPlayerId: string;
  selectedTile: TileInfo | null; onSelect: (t: TileInfo | null) => void;
  apiKey: string;
}) {
  const map = useMap();
  const cacheRef    = useRef<Map<string, TileInfo>>(new Map());
  const fetchedRef  = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<Set<string>>(new Set());
  const tileLayerRef   = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const rendererRef    = useRef<L.Canvas | null>(null);
  const redrawRef      = useRef<(() => void) | null>(null);
  const fetchMissingRef = useRef<(() => void) | null>(null);
  const stateRef = useRef({ selectedTile, onSelect, meta, cityId, myPlayerId });
  useEffect(() => { stateRef.current = { selectedTile, onSelect, meta, cityId, myPlayerId }; });

  // SSE subscription for live tile updates + 60s fallback full refresh
  useEffect(() => {
    if (!apiKey || !cityId) return;

    const es = new EventSource(
      `/api/events/stream?api_key=${encodeURIComponent(apiKey)}&city_id=${encodeURIComponent(cityId)}`
    );

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data as string);
        if (evt.tileChanged) {
          const tc = evt.tileChanged;
          const updated: TileInfo = {
            tile_id:                 tc.tileId       ?? '',
            city_id:                 tc.cityId       ?? '',
            grid_x:                  tc.gridX        ?? 0,
            grid_y:                  tc.gridY        ?? 0,
            owner_player_id:         tc.ownerPlayerId ?? '',
            owner_name:              tc.ownerName    ?? '',
            is_for_sale:             tc.isForSale    ?? false,
            purchase_price:          tc.purchasePrice ?? 0,
            building_id:             tc.buildingId   ?? '',
            building_name:           tc.buildingName ?? '',
            building_type:           tc.buildingType ?? '',
            building_status:         tc.buildingStatus ?? '',
            is_reserved_for_citizens: false,
          };
          cacheRef.current.set(`${updated.grid_x}_${updated.grid_y}`, updated);
          redrawRef.current?.();
        }
      } catch { /* ignore parse errors */ }
    };

    // 60-second fallback: re-fetch all visible chunks
    const refresh = setInterval(() => {
      fetchedRef.current.clear();
      fetchMissingRef.current?.();
    }, 60_000);

    return () => { es.close(); clearInterval(refresh); };
  }, [apiKey, cityId]); // eslint-disable-line

  const redraw = useCallback(() => {
    const tileLayer   = tileLayerRef.current;
    const markerLayer = markerLayerRef.current;
    const renderer    = rendererRef.current;
    if (!tileLayer || !markerLayer || !renderer) return;

    const { meta, selectedTile, myPlayerId } = stateRef.current;
    const zoom = map.getZoom();

    tileLayer.clearLayers();
    markerLayer.clearLayers();
    if (zoom < MIN_TILE_ZOOM) return;

    const gv = boundsToGrid(map.getBounds(), meta);

    for (let x = gv.minX; x <= gv.maxX; x++) {
      for (let y = gv.minY; y <= gv.maxY; y++) {
        const tile = cacheRef.current.get(`${x}_${y}`);
        if (!tile || tile.is_reserved_for_citizens) continue;

        const sw = gridToLatLon(x,     y,     meta);
        const ne = gridToLatLon(x + 1, y + 1, meta);
        const isSelected = selectedTile?.tile_id === tile.tile_id;

        L.rectangle(
          [[sw.lat, sw.lon], [ne.lat, ne.lon]],
          {
            renderer,
            fillColor: tileColor(tile, myPlayerId),
            fillOpacity: tileFillOpacity(tile, myPlayerId),
            stroke: isSelected,
            color: '#f9fafb',
            weight: 2,
            interactive: false,
          },
        ).addTo(tileLayer);

        if (zoom >= MIN_MARKER_ZOOM && tile.building_id && tile.building_type) {
          const emoji = BUILDING_ICONS[tile.building_type.toLowerCase()] ?? '🏢';
          const isWarning = tile.owner_player_id === myPlayerId && WARNING_STATUSES.has(tile.building_status);
          const centerLat = (sw.lat + ne.lat) / 2;
          const centerLon = (sw.lon + ne.lon) / 2;
          L.marker([centerLat, centerLon], {
            icon: L.divIcon({
              html: isWarning
                ? `<div style="font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;gap:1px"><span>${emoji}</span><span>⚠️</span></div>`
                : `<span style="font-size:12px;line-height:1;display:block;text-align:center">${emoji}</span>`,
              className: '',
              iconSize: isWarning ? [24, 14] : [14, 14],
              iconAnchor: isWarning ? [12, 7] : [7, 7],
            }),
            interactive: false,
          }).addTo(markerLayer);
        }
      }
    }
  }, [map]);

  const fetchMissing = useCallback(async () => {
    const { meta, cityId } = stateRef.current;
    const gv = boundsToGrid(map.getBounds(), meta);
    const toFetch: { cx: number; cy: number }[] = [];

    for (let cx = Math.floor(gv.minX / CHUNK_SIZE); cx <= Math.floor(gv.maxX / CHUNK_SIZE); cx++) {
      for (let cy = Math.floor(gv.minY / CHUNK_SIZE); cy <= Math.floor(gv.maxY / CHUNK_SIZE); cy++) {
        const key = `${cx}_${cy}`;
        if (!fetchedRef.current.has(key) && !fetchingRef.current.has(key))
          toFetch.push({ cx, cy });
      }
    }

    if (!toFetch.length) { redraw(); return; }

    await Promise.all(toFetch.map(async ({ cx, cy }) => {
      const key = `${cx}_${cy}`;
      fetchingRef.current.add(key);
      const m = stateRef.current.meta;
      const minX = cx * CHUNK_SIZE, minY = cy * CHUNK_SIZE;
      const maxX = Math.min(minX + CHUNK_SIZE - 1, m.tile_grid_cols - 1);
      const maxY = Math.min(minY + CHUNK_SIZE - 1, m.tile_grid_rows - 1);
      try {
        const res = await listTiles(cityId, minX, minY, maxX, maxY);
        res.tiles.forEach(t => cacheRef.current.set(`${t.grid_x}_${t.grid_y}`, t));
        fetchedRef.current.add(key);
      } finally {
        fetchingRef.current.delete(key);
      }
    }));

    redraw();
  }, [map, redraw]);

  // Keep refs current so SSE effect can call latest versions without stale closures
  useEffect(() => { redrawRef.current = redraw; });
  useEffect(() => { fetchMissingRef.current = fetchMissing; });

  useEffect(() => {
    const renderer    = L.canvas({ padding: 0.1 });
    const tileLayer   = L.layerGroup().addTo(map);
    const markerLayer = L.layerGroup().addTo(map);
    rendererRef.current    = renderer;
    tileLayerRef.current   = tileLayer;
    markerLayerRef.current = markerLayer;

    const onViewChange = () => fetchMissing();
    map.on('moveend zoomend', onViewChange);

    const onClick = (e: L.LeafletMouseEvent) => {
      const { meta, onSelect } = stateRef.current;
      const { lat, lng } = e.latlng;
      const gx = Math.floor((lng - meta.tile_origin_lon) / (meta.tile_size_meters / 67_600));
      const gy = Math.floor((lat - meta.tile_origin_lat) / (meta.tile_size_meters / 111_000));
      if (gx < 0 || gx >= meta.tile_grid_cols || gy < 0 || gy >= meta.tile_grid_rows) {
        onSelect(null); return;
      }
      const tile = cacheRef.current.get(`${gx}_${gy}`);
      const cur  = stateRef.current.selectedTile;
      onSelect(tile ? (cur?.tile_id === tile.tile_id ? null : tile) : null);
    };
    map.on('click', onClick);

    (map as unknown as { _refreshTileChunk?: (t: TileInfo) => void })._refreshTileChunk =
      (tile: TileInfo) => {
        const cx = Math.floor(tile.grid_x / CHUNK_SIZE);
        const cy = Math.floor(tile.grid_y / CHUNK_SIZE);
        fetchedRef.current.delete(`${cx}_${cy}`);
        fetchMissing();
      };

    fetchMissing();

    return () => {
      map.off('moveend zoomend', onViewChange);
      map.off('click', onClick);
      tileLayer.remove();
      markerLayer.remove();
    };
  }, [map, fetchMissing]); // eslint-disable-line

  useEffect(() => { redraw(); }, [selectedTile, redraw]);

  return null;
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function TilesScreen() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const mapRef = useRef<LeafletMap | null>(null);

  const [citiesData, setCitiesData] = useState<{ cities: { city_id: string }[] } | null>(null);
  useEffect(() => { listCities().then(setCitiesData).catch(() => {}); }, []);
  const cityId = auth?.city_id ?? citiesData?.cities?.[0]?.city_id ?? '';

  const [selectedTile, setSelectedTile] = useState<TileInfo | null>(null);
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
      const m = mapRef.current as unknown as { _refreshTileChunk?: (t: TileInfo) => void };
      m._refreshTileChunk?.(selectedTile);
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
      setFlash({ ok: true, msg: `Building started! Ready in ${res.construction_ticks_remaining} ticks.` });
      qc.invalidateQueries({ queryKey: ['buildings'] });
      const m = mapRef.current as unknown as { _refreshTileChunk?: (t: TileInfo) => void };
      m._refreshTileChunk?.(selectedTile!);
      setSelectedTile(null);
      setShowBuildForm(false);
    },
    onError: (err) => setFlash({ ok: false, msg: (err as Error).message }),
  });

  const [configTarget, setConfigTarget] = useState<TileInfo | null>(null);
  const [invTarget, setInvTarget] = useState<TileInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'supply' | 'info'>('supply');
  useEffect(() => { setActiveTab('supply'); }, [selectedTile?.tile_id]);

  const meta: TileMeta = {
    tile_origin_lat: 52.35670,
    tile_origin_lon: 4.87300,
    tile_grid_cols: 120,
    tile_grid_rows: 120,
    tile_size_meters: 25,
  };
  const centerLat = meta.tile_origin_lat + (meta.tile_grid_rows * meta.tile_size_meters) / 111_000 / 2;
  const centerLon = meta.tile_origin_lon + (meta.tile_grid_cols * meta.tile_size_meters) / 67_600 / 2;

  const isMine = !!selectedTile && selectedTile.owner_player_id === auth?.player_id;
  const hasBuilding = !!selectedTile?.building_id;
  const isLandmark = selectedTile?.building_type?.toLowerCase() === 'landmark';
  const isBank = selectedTile?.building_type?.toLowerCase() === 'bank';
  const isGovBuilding = isLandmark || isBank;

  return (
    <>
    <div className="flex-1 min-h-0 relative">
      {/* Full-bleed map */}
      <MapContainer center={[centerLat, centerLon]} zoom={15} zoomControl={false}
        className="absolute inset-0 h-full w-full" ref={mapRef}>
        <LeafletTileLayer
          attribution='<a href="https://www.openstreetmap.org/copyright" style="opacity:0.3;font-size:9px">© OSM / CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd" maxZoom={20}
        />
        {cityId && (
          <TileLayer_
            cityId={cityId} meta={meta}
            myPlayerId={auth?.player_id ?? ''}
            selectedTile={selectedTile} onSelect={setSelectedTile}
            apiKey={auth?.api_key ?? ''}
          />
        )}
      </MapContainer>


      {/* Flash toast (top-center) */}
      {flash && (
        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-[1001] text-xs px-4 py-2 rounded-lg border shadow-xl ${flash.ok ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300' : 'bg-rose-900/90 border-rose-600 text-rose-300'}`}>
          {flash.ok ? '✅' : '❌'} {flash.msg}
        </div>
      )}

        {selectedTile && (
          <div className="absolute top-3 right-3 w-80 max-h-[calc(100%-1.5rem)] z-[1000] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg flex flex-col overflow-hidden shadow-2xl">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-semibold text-sm">
                {hasBuilding
                  ? `${BUILDING_ICONS[selectedTile.building_type?.toLowerCase() ?? ''] ?? '🏢'} ${selectedTile.building_name}`
                  : `Tile (${selectedTile.grid_x}, ${selectedTile.grid_y})`}
              </h2>
              <button onClick={() => { setSelectedTile(null); setShowBuildForm(false); }}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
            </div>

            {/* Status / owner row */}
            <div className="px-4 py-2 border-b border-gray-700/50 text-xs text-gray-400 flex items-center gap-2">
              <span className="truncate">{selectedTile.owner_name || 'Unowned'}</span>
              {hasBuilding && <StatusBadge status={selectedTile.building_status} />}
              {selectedTile.is_for_sale && (
                <span className="text-cyan-400 shrink-0">{fmtMoney(selectedTile.purchase_price)}</span>
              )}
            </div>

            {/* Tab bar (only for own non-landmark buildings) */}
            {isMine && hasBuilding && !isGovBuilding && (
              <div className="flex border-b border-gray-700">
                {(['supply', 'info'] as const).map((tab) => (
                  <button key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 text-xs py-2 capitalize transition-colors ${activeTab === tab ? 'text-white border-b-2 border-indigo-500 -mb-px' : 'text-gray-500 hover:text-gray-300'}`}>
                    {tab === 'supply' ? '🛒 Supply' : 'ℹ️ Info'}
                  </button>
                ))}
              </div>
            )}

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Purchase */}
              {selectedTile.is_for_sale && auth && (
                <button disabled={isPurchasing} onClick={handlePurchase}
                  className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded transition-colors">
                  {isPurchasing ? 'Buying…' : `Buy for ${fmtMoney(selectedTile.purchase_price)}`}
                </button>
              )}

              {/* Build on vacant tile */}
              {isMine && !hasBuilding && (
                !showBuildForm ? (
                  <button onClick={() => setShowBuildForm(true)}
                    className="w-full text-xs bg-indigo-700 hover:bg-indigo-600 text-white py-2 rounded transition-colors">
                    ⚒️ Build here
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-gray-400 text-xs font-semibold">New building</p>
                    <select value={buildForm.building_type}
                      onChange={(e) => setBuildForm((f) => ({ ...f, building_type: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5">
                      {BUILDING_TYPES.map((t) => (
                        <option key={t} value={t}>{BUILDING_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                    <input placeholder="Building name" value={buildForm.name}
                      onChange={(e) => setBuildForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 placeholder-gray-600" />
                    <div className="flex gap-2">
                      <button disabled={buildMut.isPending || !buildForm.name.trim()} onClick={() => buildMut.mutate()}
                        className="flex-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs py-1.5 rounded">
                        {buildMut.isPending ? 'Starting…' : 'Build'}
                      </button>
                      <button onClick={() => setShowBuildForm(false)}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded">Cancel</button>
                    </div>
                  </div>
                )
              )}

              {/* Building tabs */}
              {isMine && hasBuilding && !isGovBuilding && activeTab === 'supply' && (
                <SupplySection
                  buildingId={selectedTile.building_id}
                  buildingType={selectedTile.building_type?.toLowerCase() ?? ''}
                  cityId={cityId}
                />
              )}

              {isMine && hasBuilding && !isGovBuilding && activeTab === 'info' && (
                <div className="space-y-2 text-xs">
                  <p className="text-gray-400">Type: <span className="text-white capitalize">{selectedTile.building_type?.toLowerCase()}</span></p>
                  <p className="text-gray-400">Status: <StatusBadge status={selectedTile.building_status} /></p>
                </div>
              )}

              {/* Government landmark — politics panel */}
              {isLandmark && <PoliticsPanel />}
              {isBank     && <BankPanel />}
            </div>

            {/* Action bar for own non-landmark buildings */}
            {isMine && hasBuilding && !isGovBuilding && (
              <div className="border-t border-gray-700 px-4 py-2 flex gap-2">
                <button onClick={() => setConfigTarget(selectedTile)}
                  className="flex-1 flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded transition-colors">
                  <Settings size={12} /> Config
                </button>
                <button onClick={() => setInvTarget(selectedTile)}
                  className="flex-1 flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded transition-colors">
                  <Package size={12} /> Stock
                </button>
              </div>
            )}
          </div>
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

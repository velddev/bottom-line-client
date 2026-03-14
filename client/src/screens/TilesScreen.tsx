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
import { BUILDING_ICONS, BUILDING_TYPES } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';
const CHUNK_SIZE = 20;
const MIN_TILE_ZOOM = 14;
const MIN_MARKER_ZOOM = 16; // show building emoji only when tiles are large enough

function tileColor(tile: TileInfo, myPlayerId: string): string {
  if (tile.owner_player_id === myPlayerId) return '#166534';
  if (tile.owner_player_id && tile.owner_player_id !== GOVERNMENT_ID) return '#92400e';
  if (tile.is_for_sale) return '#1e3a5f';
  return '#1f2937';
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buildings'] }); onClose(); },
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
            <option key={r.recipe_id} value={r.recipe_id}>
              {r.name} ({r.output_type}, {r.ticks_required}t)
            </option>
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
  const { data } = useQuery({
    queryKey: ['inventory', buildingId],
    queryFn: () => getInventory(buildingId),
  });
  return (
    <Modal title={`Inventory — ${buildingName}`} onClose={onClose}>
      {!data && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
      {data && data.items.length === 0 && <p className="text-gray-500 text-xs">Empty</p>}
      {data && data.items.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              {['Resource', 'Qty', 'Quality', 'Brand'].map((h) => (
                <th key={h} className="text-left py-1.5 pr-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-800">
                <td className="py-1.5 pr-3 text-white capitalize">{item.resource_type}</td>
                <td className="py-1.5 pr-3 font-mono text-gray-300">{item.quantity.toFixed(1)}</td>
                <td className="py-1.5 pr-3 font-mono text-gray-300">{item.quality.toFixed(2)}</td>
                <td className="py-1.5 text-gray-500">{item.brand_id || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// ── Map layer component ────────────────────────────────────────────────────────
function TileLayer_({
  cityId, meta, myPlayerId, selectedTile, onSelect,
}: {
  cityId: string;
  meta: TileMeta;
  myPlayerId: string;
  selectedTile: TileInfo | null;
  onSelect: (t: TileInfo | null) => void;
}) {
  const map = useMap();
  const cacheRef    = useRef<Map<string, TileInfo>>(new Map());
  const fetchedRef  = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<Set<string>>(new Set());
  const tileLayerRef   = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const rendererRef    = useRef<L.Canvas | null>(null);
  const stateRef = useRef({ selectedTile, onSelect, meta, cityId, myPlayerId });
  useEffect(() => { stateRef.current = { selectedTile, onSelect, meta, cityId, myPlayerId }; });

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
            fillOpacity: 0.55,
            stroke: isSelected,
            color: '#f9fafb',
            weight: 2,
            interactive: false,
          },
        ).addTo(tileLayer);

        // Building emoji marker at tile center (only visible at higher zoom)
        if (zoom >= MIN_MARKER_ZOOM && tile.building_id && tile.building_type) {
          const emoji = BUILDING_ICONS[tile.building_type.toLowerCase()] ?? '🏢';
          const centerLat = (sw.lat + ne.lat) / 2;
          const centerLon = (sw.lon + ne.lon) / 2;
          L.marker([centerLat, centerLon], {
            icon: L.divIcon({
              html: `<span style="font-size:12px;line-height:1;display:block;text-align:center">${emoji}</span>`,
              className: '',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
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
      setFlash({ ok: true, msg: `Tile purchased! Balance: €${res.new_balance.toFixed(2)}` });
      const m = mapRef.current as unknown as { _refreshTileChunk?: (t: TileInfo) => void };
      m._refreshTileChunk?.(selectedTile);
      setSelectedTile(null);
    } catch (err) {
      setFlash({ ok: false, msg: err instanceof Error ? err.message : 'Purchase failed' });
    } finally {
      setIsPurchasing(false);
    }
  }

  // Build-on-tile form state
  const [buildForm, setBuildForm] = useState({ building_type: 'factory', name: '' });
  const [showBuildForm, setShowBuildForm] = useState(false);
  const buildMut = useMutation({
    mutationFn: () => constructBuilding(
      auth!.city_id, buildForm.building_type, buildForm.name, selectedTile!.tile_id
    ),
    onSuccess: (res) => {
      setFlash({ ok: true, msg: `Building started! Ready in ${res.construction_ticks_remaining} rounds.` });
      qc.invalidateQueries({ queryKey: ['buildings'] });
      const m = mapRef.current as unknown as { _refreshTileChunk?: (t: TileInfo) => void };
      m._refreshTileChunk?.(selectedTile!);
      setSelectedTile(null);
      setShowBuildForm(false);
    },
    onError: (err) => setFlash({ ok: false, msg: (err as Error).message }),
  });

  // Configure / Inventory modal targets
  const [configTarget, setConfigTarget] = useState<TileInfo | null>(null);
  const [invTarget, setInvTarget] = useState<TileInfo | null>(null);

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

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">🗺️ City Map</h1>
          <p className="text-gray-400 text-sm mt-0.5">Purchase land and build your empire.</p>
        </div>
        <div className="flex gap-3 text-xs text-gray-300">
          {[
            { color: '#1e3a5f', label: 'For sale' },
            { color: '#166534', label: 'Yours' },
            { color: '#92400e', label: "Other's" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color, opacity: 0.8 }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`shrink-0 text-sm px-4 py-2 rounded border ${flash.ok ? 'bg-emerald-900/50 border-emerald-600 text-emerald-300' : 'bg-rose-900/50 border-rose-600 text-rose-300'}`}>
          {flash.ok ? '✅' : '❌'} {flash.msg}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 rounded-lg overflow-hidden border border-gray-700">
          <MapContainer center={[centerLat, centerLon]} zoom={15}
            className="h-full w-full" style={{ minHeight: '500px' }} ref={mapRef}>
            <LeafletTileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd" maxZoom={20}
            />
            {cityId && (
              <TileLayer_
                cityId={cityId} meta={meta}
                myPlayerId={auth?.player_id ?? ''}
                selectedTile={selectedTile} onSelect={setSelectedTile}
              />
            )}
          </MapContainer>
        </div>

        {/* Right panel */}
        {selectedTile && (
          <div className="w-64 shrink-0 bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-sm">
                Tile ({selectedTile.grid_x}, {selectedTile.grid_y})
              </h2>
              <button onClick={() => { setSelectedTile(null); setShowBuildForm(false); }}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
            </div>

            <div className="text-xs space-y-1 text-gray-300">
              <p><span className="text-gray-500">Owner:</span> {selectedTile.owner_name}</p>
              <p>
                <span className="text-gray-500">Status:</span>{' '}
                {selectedTile.is_for_sale
                  ? <span className="text-cyan-400">For sale — €{selectedTile.purchase_price.toFixed(2)}</span>
                  : selectedTile.is_reserved_for_citizens
                    ? <span className="text-gray-500">Reserved</span>
                    : <span className="text-gray-400">Private</span>}
              </p>
            </div>

            {/* Purchase */}
            {selectedTile.is_for_sale && auth && (
              <button disabled={isPurchasing} onClick={handlePurchase}
                className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded transition-colors">
                {isPurchasing ? 'Buying…' : `Buy for €${selectedTile.purchase_price.toFixed(2)}`}
              </button>
            )}

            {/* Mine + no building */}
            {isMine && !hasBuilding && (
              <>
                <hr className="border-gray-700" />
                {!showBuildForm ? (
                  <button onClick={() => setShowBuildForm(true)}
                    className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white py-2 rounded transition-colors">
                    ⚒️ Build here
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-gray-400 text-xs font-semibold">New building</p>
                    <select
                      value={buildForm.building_type}
                      onChange={(e) => setBuildForm((f) => ({ ...f, building_type: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5">
                      {BUILDING_TYPES.map((t) => (
                        <option key={t} value={t}>{BUILDING_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Building name"
                      value={buildForm.name}
                      onChange={(e) => setBuildForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 placeholder-gray-600"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={buildMut.isPending || !buildForm.name.trim()}
                        onClick={() => buildMut.mutate()}
                        className="flex-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs py-1.5 rounded">
                        {buildMut.isPending ? 'Starting…' : 'Build'}
                      </button>
                      <button onClick={() => setShowBuildForm(false)}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Mine + has building */}
            {isMine && hasBuilding && (
              <>
                <hr className="border-gray-700" />
                <div className="space-y-1.5">
                  <p className="text-white text-sm font-semibold">
                    {BUILDING_ICONS[selectedTile.building_type?.toLowerCase() ?? ''] ?? '🏢'} {selectedTile.building_name}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">{selectedTile.building_type?.toLowerCase()}</p>
                  {selectedTile.building_status && <StatusBadge status={selectedTile.building_status} />}
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setConfigTarget(selectedTile)}
                    className="flex-1 flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded transition-colors">
                    <Settings size={12} /> Configure
                  </button>
                  <button
                    onClick={() => setInvTarget(selectedTile)}
                    className="flex-1 flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded transition-colors">
                    <Package size={12} /> Inventory
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {configTarget && configTarget.building_id && (
        <ConfigureModal
          buildingId={configTarget.building_id}
          buildingType={configTarget.building_type?.toLowerCase() ?? ''}
          buildingName={configTarget.building_name}
          currentRecipe={configTarget.building_status === 'Producing' ? '' : ''}
          currentWorkers={1}
          onClose={() => setConfigTarget(null)}
        />
      )}
      {invTarget && invTarget.building_id && (
        <InventoryModal
          buildingId={invTarget.building_id}
          buildingName={invTarget.building_name}
          onClose={() => setInvTarget(null)}
        />
      )}
    </div>
  );
}

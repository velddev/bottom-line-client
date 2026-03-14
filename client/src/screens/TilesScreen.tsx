import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, SVGOverlay, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap, LatLngBounds } from 'leaflet';
import { useAuth } from '../auth';
import { listTiles, purchaseTile, listCities } from '../api';
import type { TileInfo, ListTilesResponse } from '../types';

// Government player ID as defined in GovernmentPortSeeder
const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';

// Chunk size in grid cells. 120×120 grid → 6×6 = 36 chunks
const CHUNK_SIZE = 20;

function tileColor(tile: TileInfo, myPlayerId: string): string {
  if (tile.is_reserved_for_citizens) return '#374151';
  if (tile.owner_player_id === myPlayerId) return '#059669';
  if (tile.owner_player_id && tile.owner_player_id !== GOVERNMENT_ID) return '#d97706';
  if (tile.is_for_sale) return '#0891b2';
  return '#1e3a5f';
}

type TileMeta = Pick<ListTilesResponse,
  'tile_origin_lat' | 'tile_origin_lon' | 'tile_grid_cols' | 'tile_grid_rows' | 'tile_size_meters'
>;

/** Convert a grid coordinate to lat/lon */
function gridToLatLon(
  x: number, y: number, meta: TileMeta,
): { lat: number; lon: number } {
  const latPerMeter = 1 / 111_000;
  const lonPerMeter = 1 / 67_600;
  return {
    lat: meta.tile_origin_lat + y * meta.tile_size_meters * latPerMeter,
    lon: meta.tile_origin_lon + x * meta.tile_size_meters * lonPerMeter,
  };
}

/** Convert map LatLngBounds to grid coordinate bounds, clamped to the city grid */
function boundsToGrid(bounds: LatLngBounds, meta: TileMeta) {
  const latPerMeter = 1 / 111_000;
  const lonPerMeter = 1 / 67_600;
  const tileLat = meta.tile_size_meters * latPerMeter;
  const tileLon = meta.tile_size_meters * lonPerMeter;

  return {
    minX: Math.max(0, Math.floor((bounds.getWest()  - meta.tile_origin_lon) / tileLon)),
    maxX: Math.min(meta.tile_grid_cols - 1, Math.ceil((bounds.getEast()  - meta.tile_origin_lon) / tileLon)),
    minY: Math.max(0, Math.floor((bounds.getSouth() - meta.tile_origin_lat) / tileLat)),
    maxY: Math.min(meta.tile_grid_rows - 1, Math.ceil((bounds.getNorth() - meta.tile_origin_lat) / tileLat)),
  };
}

/** The inner map component: listens to viewport changes, fetches chunks, renders */
function TileOverlay({
  cityId, meta, myPlayerId,
  selectedTile, onSelect,
}: {
  cityId: string;
  meta: TileMeta;
  myPlayerId: string;
  selectedTile: TileInfo | null;
  onSelect: (t: TileInfo | null) => void;
}) {
  // Permanent session cache: key = `${gridX}_${gridY}`
  const cacheRef = useRef<Map<string, TileInfo>>(new Map());
  // Which chunks (key = `${cx}_${cy}`) have been fully fetched
  const fetchedRef = useRef<Set<string>>(new Set());
  // Force a re-render after cache updates
  const [renderTick, setRenderTick] = useState(0);
  // Current grid viewport
  const [gridView, setGridView] = useState({ minX: 0, minY: 0, maxX: 59, maxY: 59 });
  const fetchingRef = useRef<Set<string>>(new Set()); // chunks currently in-flight

  const map = useMapEvents({
    moveend: () => updateViewport(),
    zoomend: () => updateViewport(),
  });

  const updateViewport = useCallback(() => {
    const bounds = map.getBounds();
    const gv = boundsToGrid(bounds, meta);
    setGridView(gv);
    fetchMissingChunks(gv, bounds);
  }, [map, meta, cityId]); // eslint-disable-line

  async function fetchMissingChunks(
    gv: { minX: number; minY: number; maxX: number; maxY: number },
    _bounds: LatLngBounds,
  ) {
    const minCX = Math.floor(gv.minX / CHUNK_SIZE);
    const maxCX = Math.floor(gv.maxX / CHUNK_SIZE);
    const minCY = Math.floor(gv.minY / CHUNK_SIZE);
    const maxCY = Math.floor(gv.maxY / CHUNK_SIZE);

    const toFetch: { cx: number; cy: number }[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = `${cx}_${cy}`;
        if (!fetchedRef.current.has(key) && !fetchingRef.current.has(key)) {
          toFetch.push({ cx, cy });
        }
      }
    }

    if (toFetch.length === 0) return;

    await Promise.all(toFetch.map(async ({ cx, cy }) => {
      const key = `${cx}_${cy}`;
      fetchingRef.current.add(key);

      const minX = cx * CHUNK_SIZE;
      const minY = cy * CHUNK_SIZE;
      const maxX = Math.min(minX + CHUNK_SIZE - 1, meta.tile_grid_cols - 1);
      const maxY = Math.min(minY + CHUNK_SIZE - 1, meta.tile_grid_rows - 1);

      try {
        const result = await listTiles(cityId, minX, minY, maxX, maxY);
        result.tiles.forEach(t => {
          cacheRef.current.set(`${t.grid_x}_${t.grid_y}`, t);
        });
        fetchedRef.current.add(key);
      } finally {
        fetchingRef.current.delete(key);
      }
    }));

    setRenderTick(n => n + 1);
  }

  // Initial load on mount
  useEffect(() => {
    updateViewport();
  }, []); // eslint-disable-line

  // When a tile is purchased, refresh the affected chunk
  const refreshTile = useCallback((tileId: string) => {
    const tile = [...cacheRef.current.values()].find(t => t.tile_id === tileId);
    if (!tile) return;
    const cx = Math.floor(tile.grid_x / CHUNK_SIZE);
    const cy = Math.floor(tile.grid_y / CHUNK_SIZE);
    fetchedRef.current.delete(`${cx}_${cy}`);
    fetchMissingChunks(gridView, map.getBounds());
  }, [gridView, map]); // eslint-disable-line

  // Expose refreshTile so the parent can call it
  useEffect(() => {
    (map as unknown as { _tileOverlayRefresh?: (id: string) => void })._tileOverlayRefresh = refreshTile;
  }, [refreshTile, map]);

  const zoom = map.getZoom();
  if (zoom < 14) return null;

  // Collect tiles visible in the current viewport from cache
  const visibleTiles: TileInfo[] = [];
  for (let x = gridView.minX; x <= gridView.maxX; x++) {
    for (let y = gridView.minY; y <= gridView.maxY; y++) {
      const t = cacheRef.current.get(`${x}_${y}`);
      if (t) visibleTiles.push(t);
    }
  }

  if (visibleTiles.length === 0) return null;

  // Compute SVGOverlay bounds from visible grid extent
  const sw = gridToLatLon(gridView.minX,     gridView.minY,     meta);
  const ne = gridToLatLon(gridView.maxX + 1, gridView.maxY + 1, meta);
  const overlayBounds: [[number, number], [number, number]] = [
    [sw.lat, sw.lon], [ne.lat, ne.lon],
  ];

  const latPerMeter = 1 / 111_000;
  const lonPerMeter = 1 / 67_600;
  const tileLat = meta.tile_size_meters * latPerMeter;
  const tileLon = meta.tile_size_meters * lonPerMeter;

  // Map bounds extent in lat/lon for the SVG coordinate space
  const totalLat = (gridView.maxY - gridView.minY + 1) * tileLat;
  const totalLon = (gridView.maxX - gridView.minX + 1) * tileLon;

  // SVG viewBox maps 0..1000 to the extent
  const VW = 1000, VH = 1000;

  void renderTick; // suppress unused warning — used to force re-renders

  return (
    <SVGOverlay bounds={overlayBounds} attributes={{ xmlns: 'http://www.w3.org/2000/svg' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: '100%' }}>
        {visibleTiles.map(tile => {
          const relX = tile.grid_x - gridView.minX;
          const relY = tile.grid_y - gridView.minY;

          // SVG y goes top→bottom, map lat goes bottom→top — flip y
          const svgX = (relX / (gridView.maxX - gridView.minX + 1)) * VW;
          const svgY = (1 - (relY + 1) / (gridView.maxY - gridView.minY + 1)) * VH;
          const svgW = tileLon / totalLon * VW;
          const svgH = tileLat / totalLat * VH;

          const isSelected = selectedTile?.tile_id === tile.tile_id;

          return (
            <rect
              key={tile.tile_id}
              x={svgX}
              y={svgY}
              width={svgW}
              height={svgH}
              fill={tileColor(tile, myPlayerId)}
              fillOpacity={0.55}
              stroke={isSelected ? '#fff' : 'none'}
              strokeWidth={isSelected ? 2 : 0}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(isSelected ? null : tile)}
            />
          );
        })}
      </svg>
    </SVGOverlay>
  );
}

export default function TilesScreen() {
  const { auth } = useAuth();
  const mapRef = useRef<LeafletMap | null>(null);

  const [citiesData, setCitiesData] = useState<{ cities: { city_id: string }[] } | null>(null);
  useEffect(() => {
    listCities().then(setCitiesData).catch(() => {});
  }, []);

  // Use player's city if available; fall back to first city in list
  const cityId =
    auth?.city_id ??
    citiesData?.cities?.[0]?.city_id ?? '';

  const [selectedTile, setSelectedTile] = useState<TileInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Use Amsterdam defaults; the TileOverlay fetches real meta on mount
  const meta: TileMeta = {
    tile_origin_lat: 52.35670,
    tile_origin_lon: 4.87300,
    tile_grid_cols: 120,
    tile_grid_rows: 120,
    tile_size_meters: 25,
  };

  // Centre of the tile grid
  const centerLat = meta.tile_origin_lat + (meta.tile_grid_rows * meta.tile_size_meters) / 111_000 / 2;
  const centerLon = meta.tile_origin_lon + (meta.tile_grid_cols * meta.tile_size_meters) / 67_600 / 2;

  async function handlePurchase() {
    if (!selectedTile) return;
    setIsPurchasing(true);
    try {
      const res = await purchaseTile(selectedTile.tile_id);
      setSuccessMsg(`Tile purchased! New balance: €${res.new_balance.toFixed(2)}`);
      setErrorMsg('');
      // Invalidate the chunk cache for the purchased tile
      const m = mapRef.current as unknown as { _tileOverlayRefresh?: (id: string) => void };
      m._tileOverlayRefresh?.(selectedTile.tile_id);
      setSelectedTile(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Purchase failed');
      setSuccessMsg('');
    } finally {
      setIsPurchasing(false);
    }
  }

  // Clear flash messages after 4s
  useEffect(() => {
    if (!successMsg && !errorMsg) return;
    const t = setTimeout(() => { setSuccessMsg(''); setErrorMsg(''); }, 4000);
    return () => clearTimeout(t);
  }, [successMsg, errorMsg]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🗺️ City Map</h1>
          <p className="text-gray-400 text-sm mt-1">
            Purchase tiles to expand your empire. Zoom in to see individual tiles.
          </p>
        </div>
        {/* Legend */}
        <div className="flex gap-3 text-xs text-gray-300">
          {[
            { color: '#0891b2', label: 'For sale' },
            { color: '#059669', label: 'Yours' },
            { color: '#d97706', label: "Other player's" },
            { color: '#374151', label: 'Reserved' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Flash messages */}
      {successMsg && (
        <div className="bg-emerald-900/50 border border-emerald-600 text-emerald-300 text-sm px-4 py-2 rounded">
          ✅ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-900/50 border border-rose-600 text-rose-300 text-sm px-4 py-2 rounded">
          ❌ {errorMsg}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 rounded-lg overflow-hidden border border-gray-700">
          <MapContainer
            center={[centerLat, centerLon]}
            zoom={15}
            className="h-full w-full"
            style={{ minHeight: '500px', background: '#0f172a' }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {cityId && (
              <TileOverlay
                cityId={cityId}
                meta={meta}
                myPlayerId={auth?.player_id ?? ''}
                selectedTile={selectedTile}
                onSelect={setSelectedTile}
              />
            )}
          </MapContainer>
        </div>

        {/* Tile info panel */}
        {selectedTile && (
          <div className="w-64 shrink-0 bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Tile Info</h2>
              <button
                onClick={() => setSelectedTile(null)}
                className="text-gray-500 hover:text-gray-300 text-lg leading-none"
              >×</button>
            </div>

            <div className="text-sm space-y-1 text-gray-300">
              <p><span className="text-gray-500">Grid:</span> ({selectedTile.grid_x}, {selectedTile.grid_y})</p>
              <p><span className="text-gray-500">Owner:</span> {selectedTile.owner_name || 'Government'}</p>
              <p>
                <span className="text-gray-500">Status:</span>{' '}
                {selectedTile.is_reserved_for_citizens
                  ? <span className="text-gray-400">Reserved</span>
                  : selectedTile.is_for_sale
                    ? <span className="text-cyan-400">For sale</span>
                    : <span className="text-gray-400">Not for sale</span>}
              </p>
              {selectedTile.is_for_sale && (
                <p>
                  <span className="text-gray-500">Price:</span>{' '}
                  <span className="text-emerald-400 font-mono">€{selectedTile.purchase_price.toFixed(2)}</span>
                </p>
              )}
              {selectedTile.building_id && (
                <p><span className="text-gray-500">Building:</span> {selectedTile.building_id.slice(0, 8)}…</p>
              )}
            </div>

            {selectedTile.is_for_sale && auth && (
              <button
                disabled={isPurchasing}
                onClick={handlePurchase}
                className="mt-auto bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded transition-colors"
              >
                {isPurchasing ? 'Buying…' : `Buy for €${selectedTile.purchase_price.toFixed(2)}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Rectangle, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression, Map as LeafletMap, LatLngBounds } from 'leaflet';
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

/** Compute lat/lon bounds for a single tile */
function tileBounds(tile: TileInfo, meta: TileMeta): LatLngBoundsExpression {
  const sw = gridToLatLon(tile.grid_x,     tile.grid_y,     meta);
  const ne = gridToLatLon(tile.grid_x + 1, tile.grid_y + 1, meta);
  return [[sw.lat, sw.lon], [ne.lat, ne.lon]];
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

/** Single memoized tile rectangle — only re-renders when tile data or selection changes */
const TileRect = memo(function TileRect({
  tile, meta, myPlayerId, isSelected, onSelect,
}: {
  tile: TileInfo;
  meta: TileMeta;
  myPlayerId: string;
  isSelected: boolean;
  onSelect: (t: TileInfo) => void;
}) {
  return (
    <Rectangle
      bounds={tileBounds(tile, meta)}
      pathOptions={{
        fillColor: tileColor(tile, myPlayerId),
        fillOpacity: 0.55,
        color: isSelected ? '#fff' : 'transparent',
        weight: isSelected ? 1.5 : 0,
      }}
      eventHandlers={{ click: () => onSelect(tile) }}
    />
  );
});

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
  // Chunks currently in-flight
  const fetchingRef = useRef<Set<string>>(new Set());
  // Force a re-render after cache updates
  const [renderTick, setRenderTick] = useState(0);
  // Current grid viewport
  const [gridView, setGridView] = useState({ minX: 0, minY: 0, maxX: 59, maxY: 59 });

  const map = useMapEvents({
    moveend: () => updateViewport(),
    zoomend: () => updateViewport(),
  });

  const fetchMissingChunks = useCallback(async (
    gv: { minX: number; minY: number; maxX: number; maxY: number },
  ) => {
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
  }, [cityId, meta]); // eslint-disable-line

  const updateViewport = useCallback(() => {
    const gv = boundsToGrid(map.getBounds(), meta);
    setGridView(gv);
    fetchMissingChunks(gv);
  }, [map, meta, fetchMissingChunks]);

  // Initial load on mount
  useEffect(() => { updateViewport(); }, []); // eslint-disable-line

  // Expose a refresh hook for post-purchase invalidation
  useEffect(() => {
    (map as unknown as { _refreshTileChunk?: (tile: TileInfo) => void })._refreshTileChunk =
      (tile: TileInfo) => {
        const cx = Math.floor(tile.grid_x / CHUNK_SIZE);
        const cy = Math.floor(tile.grid_y / CHUNK_SIZE);
        fetchedRef.current.delete(`${cx}_${cy}`);
        fetchMissingChunks(gridView);
      };
  }, [map, gridView, fetchMissingChunks]);

  void renderTick; // used to force re-renders after cache update

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

  return (
    <>
      {visibleTiles.map(tile => (
        <TileRect
          key={tile.tile_id}
          tile={tile}
          meta={meta}
          myPlayerId={myPlayerId}
          isSelected={selectedTile?.tile_id === tile.tile_id}
          onSelect={t => onSelect(selectedTile?.tile_id === t.tile_id ? null : t)}
        />
      ))}
    </>
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
      // Invalidate the chunk so it re-fetches with updated ownership
      const m = mapRef.current as unknown as { _refreshTileChunk?: (t: TileInfo) => void };
      m._refreshTileChunk?.(selectedTile);
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

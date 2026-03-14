import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Map as LeafletMap, LatLngBounds } from 'leaflet';
import L from 'leaflet';
import { useAuth } from '../auth';
import { listTiles, purchaseTile, listCities } from '../api';
import type { TileInfo, ListTilesResponse } from '../types';

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';
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

/** Canvas-based tile renderer — draws all visible tiles in one paint call */
function TileCanvas({
  cityId, meta, myPlayerId,
  selectedTile, onSelect,
}: {
  cityId: string;
  meta: TileMeta;
  myPlayerId: string;
  selectedTile: TileInfo | null;
  onSelect: (t: TileInfo | null) => void;
}) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheRef = useRef<Map<string, TileInfo>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());
  const fetchingRef = useRef<Set<string>>(new Set());
  // Keep latest selectedTile + handlers accessible inside event listeners
  const stateRef = useRef({ selectedTile, onSelect, meta, cityId, myPlayerId });
  useEffect(() => { stateRef.current = { selectedTile, onSelect, meta, cityId, myPlayerId }; });

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { meta, selectedTile, myPlayerId } = stateRef.current;
    const zoom = map.getZoom();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (zoom < 14) return;

    const gv = boundsToGrid(map.getBounds(), meta);

    for (let x = gv.minX; x <= gv.maxX; x++) {
      for (let y = gv.minY; y <= gv.maxY; y++) {
        const tile = cacheRef.current.get(`${x}_${y}`);
        if (!tile) continue;

        const sw = gridToLatLon(x,     y,     meta);
        const ne = gridToLatLon(x + 1, y + 1, meta);
        const pSW = map.latLngToContainerPoint([sw.lat, sw.lon]);
        const pNE = map.latLngToContainerPoint([ne.lat, ne.lon]);

        const px = Math.round(pSW.x);
        const py = Math.round(pNE.y);        // north = smaller y
        const pw = Math.round(pNE.x - pSW.x);
        const ph = Math.round(pSW.y - pNE.y); // south y > north y

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = tileColor(tile, myPlayerId);
        ctx.fillRect(px, py, pw, ph);

        if (selectedTile?.tile_id === tile.tile_id) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
        }
      }
    }
    ctx.globalAlpha = 1;
  }, [map]);

  // ── Chunk fetch ───────────────────────────────────────────────────────────
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

    if (!toFetch.length) return;

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

    draw();
  }, [map, draw]);

  // ── Canvas setup & event wiring ───────────────────────────────────────────
  useEffect(() => {
    const container = map.getContainer();
    const { width, height } = container.getBoundingClientRect();

    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:400';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const onViewChange = () => { fetchMissing(); draw(); };

    // Use ResizeObserver for reliable detection of any container resize
    // (CSS layout changes like closing the event feed are invisible to Leaflet's resize event)
    const resizeObserver = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      canvas.width  = r.width;
      canvas.height = r.height;
      map.invalidateSize(); // let Leaflet update its viewport too
      draw();
    });
    resizeObserver.observe(container);

    map.on('moveend zoomend', onViewChange);
    // Redraw during smooth pan/zoom animation
    map.on('move zoom', draw);

    // Click handling — convert container point → lat/lon → grid
    const onClick = (e: L.LeafletMouseEvent) => {
      const { meta, onSelect } = stateRef.current;
      const { lat, lng } = e.latlng;
      const tileLat = meta.tile_size_meters / 111_000;
      const tileLon = meta.tile_size_meters / 67_600;
      const gx = Math.floor((lng - meta.tile_origin_lon) / tileLon);
      const gy = Math.floor((lat - meta.tile_origin_lat) / tileLat);

      if (gx < 0 || gx >= meta.tile_grid_cols || gy < 0 || gy >= meta.tile_grid_rows) {
        onSelect(null);
        return;
      }

      const tile = cacheRef.current.get(`${gx}_${gy}`);
      const cur = stateRef.current.selectedTile;
      onSelect(tile ? (cur?.tile_id === tile.tile_id ? null : tile) : null);
    };

    map.on('click', onClick);

    // Expose chunk refresh for post-purchase
    (map as unknown as { _refreshTileChunk?: (t: TileInfo) => void })._refreshTileChunk =
      (tile: TileInfo) => {
        const cx = Math.floor(tile.grid_x / CHUNK_SIZE);
        const cy = Math.floor(tile.grid_y / CHUNK_SIZE);
        fetchedRef.current.delete(`${cx}_${cy}`);
        fetchMissing();
      };

    fetchMissing();

    return () => {
      resizeObserver.disconnect();
      map.off('moveend zoomend', onViewChange);
      map.off('move zoom', draw);
      map.off('click', onClick);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map, draw, fetchMissing]); // eslint-disable-line

  // Redraw when selectedTile changes
  useEffect(() => { draw(); }, [selectedTile, draw]);

  return null; // all rendering is on the canvas
}

export default function TilesScreen() {
  const { auth } = useAuth();
  const mapRef = useRef<LeafletMap | null>(null);

  const [citiesData, setCitiesData] = useState<{ cities: { city_id: string }[] } | null>(null);
  useEffect(() => { listCities().then(setCitiesData).catch(() => {}); }, []);

  const cityId = auth?.city_id ?? citiesData?.cities?.[0]?.city_id ?? '';

  const [selectedTile, setSelectedTile] = useState<TileInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);

  const meta: TileMeta = {
    tile_origin_lat: 52.35670,
    tile_origin_lon: 4.87300,
    tile_grid_cols: 120,
    tile_grid_rows: 120,
    tile_size_meters: 25,
  };

  const centerLat = meta.tile_origin_lat + (meta.tile_grid_rows * meta.tile_size_meters) / 111_000 / 2;
  const centerLon = meta.tile_origin_lon + (meta.tile_grid_cols * meta.tile_size_meters) / 67_600 / 2;

  async function handlePurchase() {
    if (!selectedTile) return;
    setIsPurchasing(true);
    try {
      const res = await purchaseTile(selectedTile.tile_id);
      setSuccessMsg(`Tile purchased! New balance: €${res.new_balance.toFixed(2)}`);
      setErrorMsg('');
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
        <div className="flex-1 rounded-lg overflow-hidden border border-gray-700">
          <MapContainer
            center={[centerLat, centerLon]}
            zoom={15}
            className="h-full w-full"
            style={{ minHeight: '500px' }}
            ref={mapRef}
          >
            {/* CartoDB Positron — clean, minimal, dark-UI friendly */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
            />
            {cityId && (
              <TileCanvas
                cityId={cityId}
                meta={meta}
                myPlayerId={auth?.player_id ?? ''}
                selectedTile={selectedTile}
                onSelect={setSelectedTile}
              />
            )}
          </MapContainer>
        </div>

        {selectedTile && (
          <div className="w-64 shrink-0 bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">Tile Info</h2>
              <button onClick={() => setSelectedTile(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
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
                <p><span className="text-gray-500">Price:</span>{' '}
                  <span className="text-emerald-400 font-mono">€{selectedTile.purchase_price.toFixed(2)}</span></p>
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

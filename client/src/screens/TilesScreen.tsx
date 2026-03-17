import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Package, Link, BarChart2, Lightbulb } from 'lucide-react';
import Tabs from '../components/ui/Tabs';
import { useAuth } from '../auth';
import {
  listTiles, purchaseTile, listCities,
  constructBuilding, configureBuilding, listRecipes, getInventory, getBuilding,
  listBuildings, getStoreInsights,
} from '../api';
import type { TileInfo, RecipeInfo, BuildingStatus, CityInfo, StoreInsightsResponse, ResourceInsight } from '../types';
import { BUILDING_ICONS, BUILDING_TYPES, fmtMoney } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';
import PoliticsPanel from '../components/PoliticsPanel';
import BankPanel from '../components/BankPanel';
import ResidentialPanel from '../components/ResidentialPanel';
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
import SelectedBuildingOutline from '../components/SelectedBuildingOutline';
import CompanyList from '../components/CompanyList';
import Panel from '../components/Panel';
import UnifiedChatPanel from '../components/UnifiedChatPanel';
import SupplyVehicles3D from '../components/SupplyVehicles3D';
import { useAllPlayerSupplyLinks } from '../hooks/useAllPlayerSupplyLinks';
import { tileToWorld } from '../components/cityGrid';
import BuildToolbar from '../components/BuildToolbar';
import BuildConfirmDialog from '../components/BuildConfirmDialog';
import PlacementOverlay3D from '../components/PlacementOverlay3D';
import GhostBuilding3D from '../components/GhostBuilding3D';
import type { BuildingCategory } from '../utils/tilePlacement';
import { canBuildOnTile, computeHeatmap } from '../utils/tilePlacement';

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

// ── Inline config tab ──────────────────────────────────────────────────────────
function InlineConfig({ buildingId, buildingType }: { buildingId: string; buildingType: string }) {
  const qc = useQueryClient();
  const { data: bldg } = useQuery({ queryKey: ['building', buildingId], queryFn: () => getBuilding(buildingId) });
  const { data: recipesResp } = useQuery({
    queryKey: ['recipes', buildingType],
    queryFn: () => listRecipes(buildingType),
    enabled: !!buildingType,
    staleTime: 300_000,
  });
  const [form, setForm] = useState({ recipe_id: '', workers_assigned: 1 });

  // Sync form with current building data
  useEffect(() => {
    if (bldg) {
      setForm({ recipe_id: bldg.active_recipe ?? '', workers_assigned: bldg.workers ?? 1 });
    }
  }, [bldg?.active_recipe, bldg?.workers]);

  const mut = useMutation({
    mutationFn: () => configureBuilding(buildingId, form.recipe_id, form.workers_assigned),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['building', buildingId] });
      qc.invalidateQueries({ queryKey: ['buildings'] });
    },
  });

  const selectedRecipe = (recipesResp?.recipes ?? []).find((r: RecipeInfo) => r.recipe_id === form.recipe_id);
  if (!bldg) return <p className="text-gray-500 text-xs animate-pulse">Loading…</p>;

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Recipe</label>
        <select
          value={form.recipe_id}
          onChange={(e) => setForm((f) => ({ ...f, recipe_id: e.target.value }))}
          className="w-full bg-gray-100 border border-gray-300 text-gray-900 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          <option value="">— None —</option>
          {(recipesResp?.recipes ?? []).map((r: RecipeInfo) => (
            <option key={r.recipe_id} value={r.recipe_id}>{r.name} ({r.output_type}, {r.ticks_required}d)</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Workers</label>
        <input
          type="number"
          min={0}
          value={form.workers_assigned}
          onChange={(e) => setForm((f) => ({ ...f, workers_assigned: parseInt(e.target.value) || 0 }))}
          className="w-full bg-gray-100 border border-gray-300 text-gray-900 text-xs rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-indigo-500"
        />
      </div>

      {selectedRecipe && (
        <div className="bg-gray-100 rounded-lg p-3 text-xs space-y-1 border border-gray-200">
          <p className="text-gray-700">Output: <span className="text-gray-900 font-medium">{selectedRecipe.output_min}–{selectedRecipe.output_max} {selectedRecipe.output_type}</span></p>
          <p className="text-gray-700">Needs: {selectedRecipe.ingredients.map((i) => `${i.quantity}× ${i.resource_type}`).join(', ') || 'none'}</p>
        </div>
      )}

      <button
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg transition-colors"
      >
        {mut.isPending ? 'Saving…' : 'Save Configuration'}
      </button>
      {mut.isError && <p className="text-rose-400 text-xs">{(mut.error as Error).message}</p>}
      {mut.isSuccess && <p className="text-emerald-400 text-xs">✓ Saved</p>}
    </div>
  );
}

// ── Inline stock tab ──────────────────────────────────────────────────────────
function InlineStock({ buildingId }: { buildingId: string }) {
  const { data } = useQuery({ queryKey: ['inventory', buildingId], queryFn: () => getInventory(buildingId), refetchInterval: 30_000 });

  if (!data) return <p className="text-gray-500 text-xs animate-pulse">Loading inventory…</p>;
  if (data.items.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-2xl mb-2">📦</p>
        <p className="text-gray-500 text-xs">No items in stock</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-300">
            {['Resource', 'Qty', 'Quality', 'Brand'].map((h) => (
              <th key={h} className="text-left py-2 pr-3 font-medium text-[10px] uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="border-b border-gray-200 hover:bg-gray-100/40 transition-colors">
              <td className="py-2 pr-3 text-gray-900 capitalize font-medium">{item.resource_type}</td>
              <td className="py-2 pr-3 font-mono text-gray-700">{item.quantity.toFixed(1)}</td>
              <td className="py-2 pr-3 font-mono text-gray-700">{item.quality.toFixed(2)}</td>
              <td className="py-2 text-gray-500">{item.brand_id || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Store Insights Panel ──────────────────────────────────────────────────────

function PriceBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-16 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right font-mono text-gray-700">{fmtMoney(value)}</span>
    </div>
  );
}

function ResourceInsightCard({ ri }: { ri: ResourceInsight }) {
  const priceMax = Math.max(ri.your_price_cents, ri.fair_price_cents, ri.market_avg_cents) * 1.2;
  const qualityPct = ri.median_quality > 0
    ? Math.min((ri.your_quality / ri.median_quality) * 100, 200)
    : 0;
  const brandPct = Math.min(ri.your_brand_share * 100, 100);
  const demandCapture = ri.daily_demand > 0
    ? Math.min((ri.your_last_sale / ri.daily_demand) * 100, 100)
    : 0;

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-800 capitalize">{ri.resource_type}</p>

      {/* Price comparison */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Price</p>
        <PriceBar label="Your price" value={ri.your_price_cents} max={priceMax} color="bg-indigo-500" />
        <PriceBar label="Fair value" value={ri.fair_price_cents} max={priceMax} color="bg-emerald-500" />
        <PriceBar label="Market avg" value={ri.market_avg_cents} max={priceMax} color="bg-amber-500" />
      </div>

      {/* Quality & Brand */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Quality</p>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${qualityPct >= 100 ? 'bg-emerald-500' : qualityPct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(qualityPct, 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-700">{ri.your_quality.toFixed(2)}</span>
          </div>
          <p className="text-[9px] text-gray-400 mt-0.5">Median: {ri.median_quality.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Brand</p>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${brandPct >= 20 ? 'bg-purple-500' : brandPct >= 5 ? 'bg-amber-500' : 'bg-red-400'}`}
                style={{ width: `${Math.max(brandPct, 2)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-700">{(ri.your_brand_share * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Demand capture */}
      <div>
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Demand capture</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${demandCapture >= 20 ? 'bg-emerald-500' : demandCapture >= 5 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.max(demandCapture, 1)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-gray-700">{demandCapture.toFixed(1)}%</span>
        </div>
        <p className="text-[9px] text-gray-400 mt-0.5">
          Sold {ri.your_last_sale.toFixed(1)} / {ri.daily_demand.toFixed(1)} nearby demand
        </p>
      </div>
    </div>
  );
}

function StoreInsightsPanel({ buildingId }: { buildingId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['store-insights', buildingId],
    queryFn: () => getStoreInsights(buildingId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-gray-500 text-xs animate-pulse">Analyzing store performance…</p>;
  if (isError || !data) return <p className="text-red-400 text-xs">Failed to load insights.</p>;

  const insights = data as StoreInsightsResponse;

  return (
    <div className="space-y-4">
      {/* Nearby population summary */}
      <div className="border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-800">👥 Catchment Area</p>
          <span className="text-xs font-mono text-indigo-600">{insights.nearby_population.toLocaleString()} citizens</span>
        </div>

        {insights.nearby_population === 0 ? (
          <p className="text-[10px] text-gray-500">No citizens live within shopping distance (8 tiles).</p>
        ) : (
          <div className="space-y-1">
            {insights.nearby_by_class.map((cp) => {
              const pct = insights.nearby_population > 0
                ? (cp.count / insights.nearby_population) * 100
                : 0;
              return (
                <div key={cp.citizen_class} className="flex items-center gap-2 text-[10px]">
                  <span className="w-24 text-gray-600 capitalize">{cp.citizen_class.replace(/_/g, ' ')}</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono text-gray-700">{cp.count}</span>
                  <span className="w-16 text-right text-gray-400">{fmtMoney(cp.daily_budget_cents)}/day</span>
                </div>
              );
            })}
          </div>
        )}

        {insights.competitor_count > 0 && (
          <p className="text-[10px] text-gray-500 mt-2">
            🏪 {insights.competitor_count} competing store{insights.competitor_count !== 1 ? 's' : ''} nearby
          </p>
        )}
      </div>

      {/* Per-resource insights */}
      {insights.resource_insights.length > 0 ? (
        insights.resource_insights.map((ri) => (
          <ResourceInsightCard key={ri.resource_type} ri={ri} />
        ))
      ) : (
        <div className="text-center py-4">
          <p className="text-2xl mb-2">🏷️</p>
          <p className="text-gray-500 text-xs">No items listed for sale. Enable auto-sell to see insights.</p>
        </div>
      )}

      {/* Tips */}
      {insights.tips.length > 0 && (
        <div className="border border-indigo-400/30 bg-indigo-900 rounded-lg p-3">
          <p className="text-xs font-semibold text-indigo-400 mb-2">💡 Tips</p>
          <ul className="space-y-1.5">
            {insights.tips.map((tip, i) => (
              <li key={i} className="text-[11px] text-gray-700 leading-snug">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
  const [visibleCompanyIds, setVisibleCompanyIds] = useState<Set<string>>(new Set());

  // Panel close animation: keep panel mounted during exit animation
  const [panelClosing, setPanelClosing] = useState(false);
  const panelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displayedTile, setDisplayedTile] = useState<TileInfo | null>(null);

  // When selectedTile changes, manage enter/exit states
  useEffect(() => {
    if (panelTimeoutRef.current) {
      clearTimeout(panelTimeoutRef.current);
      panelTimeoutRef.current = null;
    }
    if (selectedTile) {
      setPanelClosing(false);
      setDisplayedTile(selectedTile);
    } else if (displayedTile) {
      setPanelClosing(true);
      panelTimeoutRef.current = setTimeout(() => {
        setDisplayedTile(null);
        setPanelClosing(false);
      }, 150); // matches sheet-out duration
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTile]);

  // Persist selected tile position in URL query params (?x=..&y=..)
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTileRestoredRef = useRef(false);

  const toggleCompanyVisibility = useCallback((playerId: string) => {
    setVisibleCompanyIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

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
            active_recipe:                tc.activeRecipe ?? '',
            output_type:                  tc.outputType ?? '',
            building_output_types:        (tc.buildingOutputTypes ?? []).map((s: string) => s.replace(/^RESOURCE_TYPE_/i, '').toLowerCase()),
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
            && existing.active_recipe === updated.active_recipe
            && existing.output_type === updated.output_type
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

  // ── Placement mode ──────────────────────────────────────────────────────────
  const [activeBuildType, setActiveBuildType] = useState<BuildingCategory | null>(null);
  const [placementTarget, setPlacementTarget] = useState<TileInfo | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [placementPending, setPlacementPending] = useState(false);

  // Compute heatmap when placement mode is active
  const placementHeatmap = useMemo(() => {
    if (!activeBuildType || !auth?.player_id) return [];
    return computeHeatmap(activeBuildType, tiles, auth.player_id);
  }, [activeBuildType, tiles, auth?.player_id]);

  // Handle tile click during placement mode
  const handleTileSelect = useCallback((tile: TileInfo | null) => {
    if (activeBuildType && tile && auth?.player_id) {
      if (canBuildOnTile(tile, auth.player_id)) {
        setPlacementTarget(tile);
        setPlacementError(null);
        return;
      }
    }
    setSelectedTile(tile);
    // Persist tile position in URL
    if (tile) {
      setSearchParams({ x: String(tile.grid_x), y: String(tile.grid_y) }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [activeBuildType, auth?.player_id, setSearchParams]);

  // Handle placement confirmation (purchase if needed + build)
  async function handlePlacementConfirm(name: string) {
    if (!placementTarget || !activeBuildType || !auth) return;
    setPlacementPending(true);
    setPlacementError(null);
    try {
      // Purchase tile first if not owned
      if (placementTarget.owner_player_id !== auth.player_id) {
        await purchaseTile(placementTarget.tile_id);
      }
      // Build
      const res = await constructBuilding(auth.city_id, activeBuildType, name, placementTarget.tile_id);
      setFlash({ ok: true, msg: `Building started! Ready in ${res.construction_ticks_remaining} days.` });
      qc.invalidateQueries({ queryKey: ['buildings'] });
      refreshTileChunk(placementTarget);
      setPlacementTarget(null);
      setActiveBuildType(null);
    } catch (err) {
      setPlacementError(err instanceof Error ? err.message : 'Build failed');
    } finally {
      setPlacementPending(false);
    }
  }

  // Cancel placement mode when Escape is pressed
  useEffect(() => {
    if (!activeBuildType) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveBuildType(null);
        setPlacementTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeBuildType]);

  const [activeTab, setActiveTab] = useState<'supply' | 'config' | 'stock' | 'insights'>('supply');
  useEffect(() => { setActiveTab('supply'); }, [selectedTile?.tile_id]);

  const isMine = !!selectedTile && selectedTile.owner_player_id === auth?.player_id;
  const hasBuilding = !!selectedTile?.building_id;
  // panelTile: used for rendering the Panel — keeps data during close animation
  const panelTile = selectedTile ?? displayedTile;
  const selectedBldInfo = hasBuilding
    ? myBuildings.find((b) => b.building_id === selectedTile!.building_id)
    : undefined;
  const isLandmark = selectedTile?.building_type?.toLowerCase() === 'landmark';
  const isBank = selectedTile?.building_type?.toLowerCase() === 'bank';
  const isResidential = selectedTile?.building_type?.toLowerCase().startsWith('residential');
  const isStore = selectedTile?.building_type?.toLowerCase() === 'store';
  const isGovBuilding = isLandmark || isBank;

  // Remaining construction ticks — prefer myBuildings data, fall back to tile data
  const constructionTicksRemaining =
    selectedBldInfo?.construction_ticks_remaining
    ?? (selectedTile?.construction_ready_at_tick && currentTick
        ? Math.max(0, selectedTile.construction_ready_at_tick - currentTick)
        : 0);

  // Production ticks remaining (from myBuildings data)
  const productionTicksRemaining = selectedBldInfo?.ticks_to_ready ?? 0;

  // Camera focus — only triggered by company list clicks, not map tile clicks
  const [focusTile, setFocusTile] = useState<TileInfo | null>(null);
  const initialFocusDone = useRef(false);
  const [snapCamera, setSnapCamera] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  // Q/E rotation pivot: rotate around the center of the selected tile
  const rotationPivot = useMemo<[number, number] | null>(() => {
    if (!selectedTile) return null;
    const [wx, wz] = tileToWorld(selectedTile.grid_x, selectedTile.grid_y);
    return [wx + 0.5, wz + 0.5];
  }, [selectedTile?.grid_x, selectedTile?.grid_y]);

  const focusWorldPos = useMemo<[number, number] | null>(() => {
    if (visibleCompanyIds.size > 0) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let count = 0;
      for (const tile of tiles.values()) {
        if (visibleCompanyIds.has(tile.owner_player_id) && tile.building_id) {
          const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);
          minX = Math.min(minX, wx);
          maxX = Math.max(maxX, wx);
          minZ = Math.min(minZ, wz);
          maxZ = Math.max(maxZ, wz);
          count++;
        }
      }
      if (count > 0) {
        return [(minX + maxX) / 2, (minZ + maxZ) / 2];
      }
    }
    if (!focusTile) return null;
    return tileToWorld(focusTile.grid_x, focusTile.grid_y);
  }, [focusTile?.tile_id, visibleCompanyIds, tiles]);

  // Bounding box of visible company buildings (world coords) for viewport fitting
  const focusBounds = useMemo<{ minX: number; maxX: number; minZ: number; maxZ: number } | null>(() => {
    if (visibleCompanyIds.size === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let count = 0;
    for (const tile of tiles.values()) {
      if (visibleCompanyIds.has(tile.owner_player_id) && tile.building_id) {
        const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);
        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx + 1);
        minZ = Math.min(minZ, wz);
        maxZ = Math.max(maxZ, wz + 1);
        count++;
      }
    }
    if (count === 0) return null;
    return { minX, maxX, minZ, maxZ };
  }, [visibleCompanyIds, tiles]);

  // On first load, restore tile from URL params or center on a player-owned tile
  useEffect(() => {
    if (initialFocusDone.current || tiles.size === 0 || !auth?.player_id) return;
    initialFocusDone.current = true;

    // Priority 1: restore from URL query params
    if (!urlTileRestoredRef.current) {
      urlTileRestoredRef.current = true;
      const urlX = searchParams.get('x');
      const urlY = searchParams.get('y');
      if (urlX !== null && urlY !== null) {
        const key = `${urlX}_${urlY}`;
        const tile = tiles.get(key);
        if (tile) {
          setSelectedTile(tile);
          setFocusTile(tile);
          requestAnimationFrame(() => setSnapCamera(false));
          setTimeout(() => setMapReady(true), 200);
          return;
        }
      }
    }

    // Priority 2: player-owned tile with a building
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
        <CityScene3D focusWorldPos={focusWorldPos} focusBounds={focusBounds} snapNextFocus={snapCamera} onVisibleBoundsChange={handleVisibleBoundsChange} rotationPivot={rotationPivot} onRotationEnd={() => setHoveredTile(null)}>
          <TileGrid3D
            tiles={tiles}
            myPlayerId={auth?.player_id ?? ''}
            selectedTile={selectedTile}
            hoveredTile={hoveredTile}
            onSelect={handleTileSelect}
            onHover={setHoveredTile}
          />
          {activeBuildType && placementHeatmap.length > 0 && (
            <PlacementOverlay3D heatmap={placementHeatmap} />
          )}
          <BuildingMeshes
            tiles={tiles}
            myPlayerId={auth?.player_id ?? ''}
            selectedTile={selectedTile}
            highlightedPlayerIds={visibleCompanyIds}
          />
          <RoadNetwork3D />
          <TileDecorations />
          <MapBorder />
          <FarmAnimals tiles={[...tiles.values()]} />
          <SupplyVehicles3D routes={supplyRoutes} />
          {selectedTile && (
            <TileSelector3D gridX={selectedTile.grid_x} gridY={selectedTile.grid_y} />
          )}
          {selectedTile?.building_type && (
            <SelectedBuildingOutline
              buildingType={selectedTile.building_type}
              gridX={selectedTile.grid_x}
              gridY={selectedTile.grid_y}
            />
          )}
          {activeBuildType && hoveredTile && canBuildOnTile(hoveredTile, auth?.player_id ?? '') && (
            <GhostBuilding3D
              buildingType={activeBuildType}
              gridX={hoveredTile.grid_x}
              gridY={hoveredTile.grid_y}
            />
          )}
          <TileTooltip3D
            hoveredTile={hoveredTile}
            selectedTile={selectedTile}
          />
        </CityScene3D>
      </div>

      {/* Left overlay column: buildings (top, flex-1) + chat (bottom, shrink-0) — desktop only */}
      <div
        className="hidden md:flex absolute top-3 left-3 bottom-4 z-[1001] flex-col gap-2 pointer-events-none items-start"
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
            onToggleCompanyVisibility={toggleCompanyVisibility}
            selectedTileId={selectedTile?.tile_id}
            visibleCompanyIds={visibleCompanyIds}
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

        {displayedTile && (
          <Panel
            className={`absolute inset-x-0 bottom-0 max-h-[60vh] rounded-b-none rounded-t-2xl ${panelClosing ? 'animate-sheet-out' : 'animate-sheet-in'} md:animate-none md:inset-x-auto md:max-h-none md:top-3 md:right-3 md:bottom-3 md:w-96 md:rounded-b-lg md:rounded-t-lg z-[1002] md:z-[1000] shadow-xl`}
            title={
              hasBuilding
                ? `${BUILDING_ICONS[panelTile!.building_type?.toLowerCase() ?? ''] ?? '🏢'} ${panelTile!.building_name}`
                : `Tile (${panelTile!.grid_x}, ${panelTile!.grid_y})`
            }
            onClose={() => { setSelectedTile(null); setShowBuildForm(false); }}
            subheader={
              <div className="flex flex-col gap-1.5">
                <div className="text-xs text-gray-600 flex items-center gap-2">
                  <span className="truncate">{panelTile!.owner_name || 'Unowned'}</span>
                  {isMine && hasBuilding && <StatusBadge status={panelTile!.building_status} />}
                  {isMine && hasBuilding && panelTile!.building_status === 'UnderConstruction' && constructionTicksRemaining > 0 && (
                    <EtaCountdown ticks={constructionTicksRemaining} nextTickAt={nextTickAt} />
                  )}
                  {isMine && hasBuilding && panelTile!.building_status === 'Producing' && productionTicksRemaining > 0 && (
                    <EtaCountdown ticks={productionTicksRemaining} nextTickAt={nextTickAt} className="text-emerald-500 text-xs font-mono" />
                  )}
                  {panelTile!.is_for_sale && (
                    <span className="text-cyan-400 shrink-0">{fmtMoney(panelTile!.purchase_price)}</span>
                  )}
                </div>
                {isMine && hasBuilding && !isGovBuilding && !isResidential && (
                  <Tabs
                    tabs={[
                      { value: 'supply' as const, label: <span className="flex items-center gap-1"><Link size={11} /> Supply</span> },
                      { value: 'config' as const, label: <span className="flex items-center gap-1"><Settings size={11} /> Config</span> },
                      { value: 'stock' as const, label: <span className="flex items-center gap-1"><Package size={11} /> Stock</span> },
                      ...(isStore ? [{ value: 'insights' as const, label: <span className="flex items-center gap-1"><Lightbulb size={11} /> Insights</span> }] : []),
                    ]}
                    value={activeTab}
                    onChange={setActiveTab}
                  />
                )}
              </div>
            }
            bodyClassName="p-4 space-y-3 flex-1 overflow-y-auto"
          >
            {/* Purchase */}
            {panelTile!.is_for_sale && auth && (
              <button disabled={isPurchasing} onClick={handlePurchase}
                className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-gray-900 text-xs font-semibold py-2 rounded transition-colors">
                {isPurchasing ? 'Buying…' : `Buy for ${fmtMoney(panelTile!.purchase_price)}`}
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

            {/* ── Tab: Supply ─────────────────────────────────────────────── */}
            {isMine && hasBuilding && !isGovBuilding && activeTab === 'supply' && (
              <SupplySection
                buildingId={panelTile!.building_id}
                buildingType={panelTile!.building_type?.toLowerCase() ?? ''}
                cityId={cityId}
              />
            )}

            {/* ── Tab: Config ─────────────────────────────────────────────── */}
            {isMine && hasBuilding && !isGovBuilding && activeTab === 'config' && (
              <InlineConfig
                buildingId={panelTile!.building_id}
                buildingType={panelTile!.building_type?.toLowerCase() ?? ''}
              />
            )}

            {/* ── Tab: Stock ──────────────────────────────────────────────── */}
            {isMine && hasBuilding && !isGovBuilding && activeTab === 'stock' && (
              <InlineStock buildingId={panelTile!.building_id} />
            )}

            {/* ── Tab: Insights (stores only) ────────────────────────────── */}
            {isMine && hasBuilding && isStore && activeTab === 'insights' && (
              <StoreInsightsPanel buildingId={panelTile!.building_id} />
            )}

            {/* Government landmark — politics panel */}
            {isLandmark && <PoliticsPanel />}
            {isBank     && <BankPanel />}
            {isResidential && panelTile && (
              <ResidentialPanel
                buildingType={panelTile.building_type}
                populationCapacity={panelTile.population_capacity}
                buildingName={panelTile.building_name}
                ownerName={panelTile.building_player_name || panelTile.owner_name}
                isOwned={isMine}
                building={selectedBldInfo}
              />
            )}
          </Panel>
        )}

        {/* Build toolbar (bottom-center) */}
        <div
          className="absolute bottom-2 left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-4 z-[1001]"
          style={{
            opacity: mapReady ? 1 : 0,
            transition: 'opacity 0.5s ease-out',
          }}
        >
          <BuildToolbar activeBuildType={activeBuildType} onSelect={setActiveBuildType} />
        </div>

        {/* Placement mode hint */}
        {activeBuildType && !placementTarget && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-gray-200 text-gray-700 text-xs px-4 py-2 rounded-lg border border-gray-300 shadow-xl">
            Tap a highlighted tile to place your building · <span className="text-indigo-400 hidden md:inline">ESC</span><span className="md:hidden">tap elsewhere</span> to cancel
          </div>
        )}
    </div>

      {placementTarget && activeBuildType && (
        <BuildConfirmDialog
          tile={placementTarget}
          buildingType={activeBuildType}
          myPlayerId={auth?.player_id ?? ''}
          isPending={placementPending}
          error={placementError}
          onConfirm={handlePlacementConfirm}
          onCancel={() => { setPlacementTarget(null); setPlacementError(null); }}
        />
      )}
    </>
  );
}

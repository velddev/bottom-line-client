import { useState, useEffect, useRef } from 'react';
import { Plus, X, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBuilding, listRecipes, getSupplyLinks, addSupplyLink,
  removeSupplyLink, listPotentialSuppliers, configureBuilding,
  getAutoSellConfigs, setAutoSellConfig, getBuildingSales,
} from '../api';
import type { RecipeInfo, SupplyLinkInfo, PotentialSupplier, SalesTick } from '../types';
import { fmtMoney, fmtQuality } from '../types';

const ALL_RESOURCES = ['food', 'grain', 'water', 'animal_feed', 'cattle', 'meat', 'leather'];
const CONSUMER_GOODS = ['food', 'meat', 'leather'];

// ── Supplier picker modal ─────────────────────────────────────────────────────
function SupplierPickerModal({
  cityId,
  resourceType,
  buildingId,
  onClose,
}: {
  cityId: string;
  resourceType: string;
  buildingId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['potential-suppliers', cityId, resourceType],
    queryFn: () => listPotentialSuppliers(cityId, resourceType),
    staleTime: 30_000,
    retry: false,
  });

  const addMut = useMutation({
    mutationFn: (supplierBuildingId: string) =>
      addSupplyLink(buildingId, resourceType, supplierBuildingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supply-links', buildingId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-80 max-h-[70vh] flex flex-col shadow-2xl">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm capitalize">
            Add supplier — {resourceType}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && <p className="text-gray-600 text-xs p-2 animate-pulse">Loading…</p>}
          {isError && (
            <p className="text-rose-400 text-xs p-2">Error: {(error as Error).message}</p>
          )}
          {!isLoading && !isError && (!data?.suppliers || data.suppliers.length === 0) && (
            <p className="text-gray-500 text-xs p-2">No active listings for {resourceType}</p>
          )}
          {data?.suppliers.map((s: PotentialSupplier) => (
            <button
              key={s.building_id}
              disabled={addMut.isPending}
              onClick={() => addMut.mutate(s.building_id)}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-xs font-medium">{s.building_name}</p>
                  <p className="text-gray-500 text-xs">
                    {s.owner_name} · ({s.tile_x},{s.tile_y})
                  </p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-emerald-400 text-xs font-mono">{fmtMoney(s.price_per_unit)}/u</p>
                  <p className="text-gray-500 text-xs">{s.quantity_available.toFixed(0)} avail</p>
                </div>
              </div>
            </button>
          ))}
          {addMut.isError && (
            <p className="text-rose-400 text-xs px-2">{(addMut.error as Error).message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Single ingredient row with supplier management ────────────────────────────
function IngredientSupplyRow({
  ingredient,
  buildingId,
  cityId,
  links,
}: {
  ingredient: { resource_type: string; quantity: number };
  buildingId: string;
  cityId: string;
  links: SupplyLinkInfo[];
}) {
  const qc = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);

  const removeMut = useMutation({
    mutationFn: (linkId: string) => removeSupplyLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supply-links', buildingId] }),
  });

  const myLinks = links.filter(l => l.resource_type === ingredient.resource_type);

  return (
    <>
      {showPicker && (
        <SupplierPickerModal
          cityId={cityId}
          resourceType={ingredient.resource_type}
          buildingId={buildingId}
          onClose={() => setShowPicker(false)}
        />
      )}
      <div className="mb-3">
        {/* Ingredient header */}
        <div className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 mb-1.5">
          <span className="capitalize">
            {ingredient.resource_type}
            <span className="text-gray-500 font-normal ml-1">× {ingredient.quantity} per run</span>
          </span>
        </div>

        <div className="pl-2 space-y-1">
            {myLinks.length === 0 && (
              <p className="text-gray-600 text-xs italic">No suppliers — auto-buy disabled</p>
            )}
            {myLinks.map((link) => (
              <div key={link.supply_link_id}
                className="flex items-center gap-1.5 text-xs bg-gray-800/50 rounded px-2 py-1">
                <span className="text-emerald-400 font-mono text-xs w-4 text-center">
                  {link.priority + 1}
                </span>
                <span className="flex-1 text-gray-300 truncate">
                  {link.supplier_building_name}
                  <span className="text-gray-600 ml-1">({link.supplier_tile_x},{link.supplier_tile_y})</span>
                </span>
                <span className={`font-mono text-xs shrink-0 ${link.supplier_current_price > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                  {link.supplier_current_price > 0 ? `${fmtMoney(link.supplier_current_price)}/u` : 'no listing'}
                </span>
                <button
                  disabled={removeMut.isPending}
                  onClick={() => removeMut.mutate(link.supply_link_id)}
                  className="text-gray-600 hover:text-rose-400 transition-colors disabled:opacity-50 shrink-0"
                  title="Remove supplier"
                >
                  <X size={11} />
                </button>
              </div>
            ))}

            {/* Add supplier button */}
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-0.5"
            >
              <Plus size={11} />
              <span>Add supplier</span>
            </button>
          </div>
      </div>
    </>
  );
}

// ── Searchable item picker (dropdown) ─────────────────────────────────────────
function ResourcePickerDropdown({
  options,
  onSelect,
  onClose,
}: {
  options: string[];
  onSelect: (r: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 w-52 bg-gray-800 border border-gray-700 rounded shadow-lg z-50"
    >
      <input
        autoFocus
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search…"
        className="w-full px-2 py-1.5 text-xs bg-transparent border-b border-gray-700 text-white placeholder-gray-600 outline-none"
      />
      <div className="max-h-40 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <p className="text-gray-600 text-xs px-2 py-1">No results</p>
        )}
        {filtered.map(g => (
          <button
            key={g}
            onClick={() => { onSelect(g); onClose(); }}
            className="w-full text-left px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors capitalize"
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Store supply section — user picks which goods to configure ─────────────────
function StoreSupplySection({
  buildingId,
  cityId,
  links,
}: {
  buildingId: string;
  cityId: string;
  links: SupplyLinkInfo[];
}) {
  const [activeItems, setActiveItems] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // When supply links load, add any items that already have links
  useEffect(() => {
    const linked = new Set(links.map(l => l.resource_type));
    const fromLinks = CONSUMER_GOODS.filter(g => linked.has(g));
    setActiveItems(prev => {
      const toAdd = fromLinks.filter(g => !prev.includes(g));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, [links]);

  const remaining = CONSUMER_GOODS.filter(g => !activeItems.includes(g));

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">Configure suppliers for items you want to sell</p>
      {activeItems.map(r => (
        <div key={r} className="mb-3 border-b border-gray-700/30 pb-3 last:border-0 last:pb-0">
          <IngredientSupplyRow
            ingredient={{ resource_type: r, quantity: 10 }}
            buildingId={buildingId}
            cityId={cityId}
            links={links}
          />
          <AutoSellRow buildingId={buildingId} resourceType={r} />
        </div>
      ))}
      {remaining.length > 0 && (
        <div className="relative inline-block">
          <button
            onClick={() => setShowPicker(p => !p)}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
          >
            <Plus size={11} />
            <span>Add item</span>
          </button>
          {showPicker && (
            <ResourcePickerDropdown
              options={remaining}
              onSelect={r => setActiveItems(prev => [...prev, r])}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline recipe picker (shown when no recipe is active) ─────────────────────
function RecipePicker({
  buildingId,
  buildingType,
  currentWorkers,
  recipes,
}: {
  buildingId: string;
  buildingType: string;
  currentWorkers: number;
  recipes: RecipeInfo[];
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const configureMut = useMutation({
    mutationFn: (recipe_id: string) =>
      configureBuilding(buildingId, recipe_id, currentWorkers || 1),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['building', buildingId] });
    },
  });

  const filtered = recipes.filter(r =>
    r.output_type.toLowerCase().includes(search.toLowerCase())
  );

  if (recipes.length === 0) {
    return <p className="text-gray-500 text-xs">No recipes available for this building type.</p>;
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">Select a recipe to configure supply</p>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search recipes…"
        className="w-full px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 outline-none focus:border-indigo-500 mb-2"
      />
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {filtered.map(r => (
          <button
            key={r.recipe_id}
            disabled={configureMut.isPending}
            onClick={() => configureMut.mutate(r.recipe_id)}
            className="w-full text-left px-3 py-2 rounded bg-gray-800/50 hover:bg-gray-700 transition-colors disabled:opacity-50 relative"
          >
            {configureMut.isPending && configureMut.variables === r.recipe_id && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs animate-pulse">saving…</span>
            )}
            <div className="flex items-center justify-between">
              <span className="text-white text-xs font-medium capitalize">{r.output_type}</span>
              <span className="text-gray-500 text-xs">
                ×{r.output_min}–{r.output_max} / {r.ticks_required}t
              </span>
            </div>
            {r.ingredients.length > 0 && (
              <p className="text-gray-600 text-xs mt-0.5">
                Needs: {r.ingredients.map(i => `${i.resource_type} ×${i.quantity}`).join(', ')}
              </p>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-600 text-xs px-1">No matches</p>
        )}
      </div>
      {configureMut.isError && (
        <p className="text-rose-400 text-xs mt-2">{(configureMut.error as Error).message}</p>
      )}
    </div>
  );
}

// ── Production supply section (fields / factories) ─────────────────────────────
type RecipeIngredient = { resource_type: string; quantity: number };

function ProductionSupplySection({
  buildingId,
  cityId,
  links,
  ingredients,
}: {
  buildingId: string;
  cityId: string;
  links: SupplyLinkInfo[];
  ingredients: RecipeIngredient[];
}) {
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  // Pre-populate from existing supply links
  useEffect(() => {
    const linked = new Set(links.map(l => l.resource_type));
    const fromLinks = ingredients.filter(i => linked.has(i.resource_type)).map(i => i.resource_type);
    setActiveTypes(prev => {
      const toAdd = fromLinks.filter(r => !prev.includes(r));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, [links, ingredients]);

  const remaining = ingredients.filter(i => !activeTypes.includes(i.resource_type));
  const activeIngredients = ingredients.filter(i => activeTypes.includes(i.resource_type));

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2 font-medium">
        AUTO-SUPPLY
        <span className="font-normal ml-1 text-gray-600">— buy automatically when production restarts</span>
      </p>
      {activeIngredients.map(ing => (
        <IngredientSupplyRow
          key={ing.resource_type}
          ingredient={ing}
          buildingId={buildingId}
          cityId={cityId}
          links={links}
        />
      ))}
      {remaining.length > 0 && (
        <div className="relative inline-block mt-1">
          <button
            onClick={() => setShowPicker(p => !p)}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Plus size={11} />
            <span>Add ingredient</span>
          </button>
          {showPicker && (
            <ResourcePickerDropdown
              options={remaining.map(i => i.resource_type)}
              onSelect={r => setActiveTypes(prev => [...prev, r])}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline auto-sell row ──────────────────────────────────────────────────────
function AutoSellRow({ buildingId, resourceType }: { buildingId: string; resourceType: string }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['auto-sell', buildingId],
    queryFn: () => getAutoSellConfigs(buildingId),
    staleTime: 30_000,
  });

  const config = (data?.configs ?? []).find((c: { resource_type: string }) => c.resource_type === resourceType);
  const [price, setPrice] = useState('');

  // Sync price from server once loaded
  useEffect(() => {
    if (config?.price_per_unit != null && price === '') {
      setPrice((config.price_per_unit / 100).toFixed(2));
    }
  }, [config?.price_per_unit]);

  const mut = useMutation({
    mutationFn: ({ enabled, priceCents }: { enabled: boolean; priceCents: number }) =>
      setAutoSellConfig(buildingId, resourceType, priceCents, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-sell', buildingId] }),
  });

  const priceCents = Math.round(parseFloat(price) * 100);
  const validPrice = !isNaN(priceCents) && priceCents > 0;
  const isEnabled = config?.is_enabled ?? false;

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700/40">
      <span className="text-xs text-gray-500 shrink-0">Auto-sell at</span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        placeholder="€0.00"
        value={price}
        onChange={e => setPrice(e.target.value)}
        onBlur={() => validPrice && mut.mutate({ enabled: isEnabled, priceCents })}
        className="w-20 px-2 py-0.5 text-xs bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 outline-none focus:border-indigo-500"
      />
      <button
        disabled={mut.isPending || !validPrice}
        onClick={() => mut.mutate({ enabled: !isEnabled, priceCents })}
        className={`px-2 py-0.5 text-xs rounded transition-colors disabled:opacity-40 ${
          isEnabled ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
        }`}
      >
        {isEnabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}

// ── Store performance analytics panel ─────────────────────────────────────────
function StoreAnalyticsPanel({ buildingId }: { buildingId: string }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['building-sales', buildingId],
    queryFn: () => getBuildingSales(buildingId, 20),
    enabled: open,
    staleTime: 30_000,
  });

  const ticks: SalesTick[] = data?.ticks ?? [];

  // Group by resource then by tick for a simple table
  const byResource = ticks.reduce<Record<string, SalesTick[]>>((acc, t) => {
    if (!acc[t.resource_type]) acc[t.resource_type] = [];
    acc[t.resource_type].push(t);
    return acc;
  }, {});

  const resources = Object.keys(byResource);

  return (
    <div className="mt-4 border-t border-gray-700/50 pt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        <BarChart2 size={11} />
        <span>Performance</span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="mt-2">
          {isLoading && <p className="text-xs text-gray-600 animate-pulse">Loading…</p>}
          {!isLoading && ticks.length === 0 && (
            <p className="text-xs text-gray-600">No sales recorded yet.</p>
          )}
          {resources.map(res => {
            const rows = byResource[res].slice(0, 10);
            const totalUnits = rows.reduce((s, r) => s + r.sale_volume, 0);
            const totalRev   = rows.reduce((s, r) => s + r.revenue_cents, 0);
            return (
              <div key={res} className="mb-3">
                <p className="text-xs font-medium text-gray-300 mb-1 capitalize">{res}</p>
                <div className="text-xs text-gray-500 flex gap-4 mb-1">
                  <span>Last {rows.length} ticks</span>
                  <span>Units: <span className="text-white font-mono">{totalUnits.toFixed(1)}</span></span>
                  <span>Revenue: <span className="text-green-400 font-mono">{fmtMoney(totalRev)}</span></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-gray-500">
                    <thead>
                      <tr className="border-b border-gray-700/40">
                        <th className="text-left py-0.5 pr-3">Tick</th>
                        <th className="text-right pr-3">Units sold</th>
                        <th className="text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.tick} className="border-b border-gray-800/40">
                          <td className="py-0.5 pr-3 font-mono">{r.tick}</td>
                          <td className="text-right pr-3 font-mono text-white">{r.sale_volume.toFixed(2)}</td>
                          <td className="text-right font-mono text-green-400">{fmtMoney(r.revenue_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main SupplySection component ──────────────────────────────────────────────
export default function SupplySection({
  buildingId,
  buildingType,
  cityId,
}: {
  buildingId: string;
  buildingType: string;
  cityId: string;
}) {
  const { data: bldg } = useQuery({
    queryKey: ['building', buildingId],
    queryFn: () => getBuilding(buildingId),
  });

  const { data: recipesResp } = useQuery({
    queryKey: ['recipes', buildingType],
    queryFn: () => listRecipes(buildingType),
    enabled: !!buildingType,
    staleTime: 300_000,
  });

  const { data: supplyLinksResp } = useQuery({
    queryKey: ['supply-links', buildingId],
    queryFn: () => getSupplyLinks(buildingId),
    staleTime: 30_000,
  });

  const links: SupplyLinkInfo[] = supplyLinksResp?.links ?? [];

  if (!bldg) return <p className="text-gray-600 text-xs animate-pulse">Loading…</p>;

  // Stores: only consumer goods have supply chain meaning
  if (buildingType === 'store') {
    return (
      <div>
        <StoreSupplySection buildingId={buildingId} cityId={cityId} links={links} />
        <StoreAnalyticsPanel buildingId={buildingId} />
      </div>
    );
  }

  const recipe = (recipesResp?.recipes ?? []).find((r: RecipeInfo) => r.recipe_id === bldg.active_recipe);

  if (!recipe) {
    return (
      <RecipePicker
        buildingId={buildingId}
        buildingType={buildingType}
        currentWorkers={bldg.workers}
        recipes={recipesResp?.recipes ?? []}
      />
    );
  }

  return (
    <div>
      {/* Recipe summary + auto-sell */}
      <div className="mb-3 pb-3 border-b border-gray-700/50">
        <p className="text-xs text-gray-500">
          Produces <span className="text-white font-medium">{recipe.output_type}</span>
          <span className="text-gray-600 ml-1">× {recipe.output_min}–{recipe.output_max} / {recipe.ticks_required}t</span>
        </p>
        {(() => {
          // Calculate input cost per run using cheapest linked supplier for each ingredient
          const costItems = recipe.ingredients.map((ing: { resource_type: string; quantity: number }) => {
            const myLinks = links.filter(l => l.resource_type === ing.resource_type && l.supplier_current_price > 0);
            const cheapest = myLinks.length > 0 ? Math.min(...myLinks.map(l => l.supplier_current_price)) : null;
            return { ...ing, cheapestPrice: cheapest };
          });
          const allPriced = costItems.every((c: { cheapestPrice: number | null }) => c.cheapestPrice !== null);
          const totalCentsCost = allPriced
            ? costItems.reduce((sum: number, c: { quantity: number; cheapestPrice: number | null }) => sum + c.quantity * (c.cheapestPrice ?? 0), 0)
            : null;
          const avgOutput = (recipe.output_min + recipe.output_max) / 2;
          const costPerUnit = totalCentsCost !== null && avgOutput > 0 ? totalCentsCost / avgOutput : null;
          if (recipe.ingredients.length === 0 || totalCentsCost === null) return null;
          return (
            <p className="text-xs text-gray-500 mt-1">
              Input cost: <span className="text-amber-400 font-mono">{fmtMoney(totalCentsCost)}/run</span>
              {costPerUnit !== null && (
                <span className="ml-2 text-gray-600">≈ <span className="text-amber-300 font-mono">{fmtMoney(costPerUnit)}/unit</span> produced</span>
              )}
            </p>
          );
        })()}
        <AutoSellRow buildingId={buildingId} resourceType={recipe.output_type} />
      </div>

      {recipe.ingredients.length === 0 && (
        <p className="text-gray-500 text-xs">No ingredients needed — no suppliers required.</p>
      )}

      {recipe.ingredients.length > 0 && (
        <ProductionSupplySection
          buildingId={buildingId}
          cityId={cityId}
          links={links}
          ingredients={recipe.ingredients}
        />
      )}
    </div>
  );
}

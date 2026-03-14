import { useState, useEffect, useRef } from 'react';
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBuilding, listRecipes, getSupplyLinks, addSupplyLink,
  removeSupplyLink, listPotentialSuppliers,
} from '../api';
import type { RecipeInfo, SupplyLinkInfo, PotentialSupplier } from '../types';
import { fmtMoney, fmtQuality } from '../types';

const ALL_RESOURCES = ['Food', 'Grain', 'Water', 'AnimalFeed', 'Cattle', 'Meat', 'Leather'];
const CONSUMER_GOODS = ['Food', 'Meat', 'Leather'];

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
  const [expanded, setExpanded] = useState(true);

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
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 mb-1.5 hover:text-white transition-colors"
        >
          <span className="capitalize">
            {ingredient.resource_type}
            <span className="text-gray-500 font-normal ml-1">× {ingredient.quantity} per run</span>
          </span>
          <span className="text-gray-600">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>

        {expanded && (
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
        )}
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
        <IngredientSupplyRow
          key={r}
          ingredient={{ resource_type: r, quantity: 10 }}
          buildingId={buildingId}
          cityId={cityId}
          links={links}
        />
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
    return <StoreSupplySection buildingId={buildingId} cityId={cityId} links={links} />;
  }

  const recipe = (recipesResp?.recipes ?? []).find((r: RecipeInfo) => r.recipe_id === bldg.active_recipe);

  if (!recipe) {
    return (
      <p className="text-gray-500 text-xs">
        Configure a recipe first to set up automatic supply.
      </p>
    );
  }

  return (
    <div>
      {/* Recipe summary */}
      <div className="mb-3 pb-3 border-b border-gray-700/50">
        <p className="text-xs text-gray-500">
          Produces <span className="text-white font-medium">{recipe.output_type}</span>
          <span className="text-gray-600 ml-1">× {recipe.output_min}–{recipe.output_max} / {recipe.ticks_required}t</span>
        </p>
      </div>

      {recipe.ingredients.length === 0 && (
        <p className="text-gray-500 text-xs">No ingredients needed — no suppliers required.</p>
      )}

      {recipe.ingredients.length > 0 && (
        <>
          <p className="text-xs text-gray-500 mb-2 font-medium">
            AUTO-SUPPLY
            <span className="font-normal ml-1 text-gray-600">— buy automatically when production restarts</span>
          </p>
          {recipe.ingredients.map((ing) => (
            <IngredientSupplyRow
              key={ing.resource_type}
              ingredient={ing}
              buildingId={buildingId}
              cityId={cityId}
              links={links}
            />
          ))}
        </>
      )}
    </div>
  );
}

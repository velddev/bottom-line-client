import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings, Package } from 'lucide-react';
import { listBuildings, constructBuilding, configureBuilding, listRecipes, getInventory } from '../api';
import { useAuth } from '../auth';
import { BUILDING_TYPES, BUILDING_ICONS, type BuildingStatus } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';

function StatusBadge({ status }: { status: string }) {
  const LABELS: Record<string, string> = {
    Producing: 'Producing',
    Idle: 'Idle',
    UnderConstruction: 'Building…',
    Paused: 'Paused',
    MissingResources: '⚠️ Missing Resources',
    // legacy lowercase (kept for safety)
    active: 'Producing', constructing: 'Building…', idle: 'Idle',
  };
  const cls =
    status === 'Producing'          ? 'bg-emerald-900/40 text-emerald-400' :
    status === 'active'             ? 'bg-emerald-900/40 text-emerald-400' :
    status === 'UnderConstruction'  ? 'bg-amber-900/40 text-amber-400' :
    status === 'constructing'       ? 'bg-amber-900/40 text-amber-400' :
    status === 'Paused'             ? 'bg-yellow-900/40 text-yellow-400' :
    status === 'MissingResources'   ? 'bg-rose-900/40 text-rose-400' :
    status === 'Idle'               ? 'bg-gray-800 text-gray-400' :
                                      'bg-gray-800 text-gray-500';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{LABELS[status] ?? status}</span>;
}

export default function BuildingsScreen() {
  const { auth } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['buildings'], queryFn: listBuildings });
  const buildings = data?.buildings ?? [];

  // ── Construct modal ──
  const [showConstruct, setShowConstruct] = useState(false);
  const [cForm, setCForm] = useState({ building_type: 'factory', name: '' });
  const constructMut = useMutation({
    mutationFn: () => constructBuilding(auth!.city_id, cForm.building_type, cForm.name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buildings'] }); setShowConstruct(false); },
  });

  // ── Configure modal ──
  const [configTarget, setConfigTarget] = useState<BuildingStatus | null>(null);
  const [cfgForm, setCfgForm] = useState({ recipe_id: '', workers_assigned: 1 });
  const { data: recipesResp } = useQuery({
    queryKey: ['recipes', configTarget?.building_type],
    queryFn: () => listRecipes(configTarget!.building_type),
    enabled: !!configTarget,
  });
  const configureMut = useMutation({
    mutationFn: () => configureBuilding(configTarget!.building_id, cfgForm.recipe_id, cfgForm.workers_assigned),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buildings'] }); setConfigTarget(null); },
  });

  // ── Inventory modal ──
  const [invTarget, setInvTarget] = useState<BuildingStatus | null>(null);
  const { data: invResp } = useQuery({
    queryKey: ['inventory', invTarget?.building_id],
    queryFn: () => getInventory(invTarget!.building_id),
    enabled: !!invTarget,
  });

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Buildings</h1>
        <button
          onClick={() => setShowConstruct(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded text-sm transition-colors"
        >
          <Plus size={14} /> Construct
        </button>
      </div>

      {isLoading && <p className="text-gray-500 text-sm animate-pulse">Loading…</p>}

      {!isLoading && buildings.length === 0 && (
        <div className="text-center py-16 text-gray-600 border border-dashed border-gray-800 rounded-lg">
          <p className="text-4xl mb-3">🏗️</p>
          <p className="text-sm">No buildings yet. Construct your first one!</p>
        </div>
      )}

      {buildings.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                {['', 'Name', 'Type', 'Status', 'Recipe', 'Workers', 'Level', 'Ready In', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => (
                <tr key={b.building_id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-3 py-2.5 text-base">{BUILDING_ICONS[b.building_type] ?? '🏢'}</td>
                  <td className="px-3 py-2.5 text-white font-medium">{b.name}</td>
                  <td className="px-3 py-2.5 text-gray-400 capitalize">{b.building_type}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={b.status} /></td>
                  <td className="px-3 py-2.5 text-gray-400">{b.active_recipe || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-300">{b.workers}</td>
                  <td className="px-3 py-2.5 text-gray-300">{b.level}</td>
                  <td className="px-3 py-2.5 text-gray-500">
                    {b.ticks_to_ready > 0 ? `${b.ticks_to_ready} rounds` : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        title="Configure"
                        onClick={() => { setConfigTarget(b); setCfgForm({ recipe_id: b.active_recipe, workers_assigned: b.workers || 1 }); }}
                        className="text-gray-500 hover:text-indigo-400 transition-colors"
                      >
                        <Settings size={13} />
                      </button>
                      <button
                        title="Inventory"
                        onClick={() => setInvTarget(b)}
                        className="text-gray-500 hover:text-emerald-400 transition-colors"
                      >
                        <Package size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Construct modal */}
      {showConstruct && (
        <Modal
          title="Construct Building"
          onClose={() => setShowConstruct(false)}
          onSubmit={() => constructMut.mutate()}
          submitLabel={constructMut.isPending ? 'Constructing…' : 'Build'}
          submitDisabled={constructMut.isPending || !cForm.name.trim()}
        >
          <Field label="Building Type">
            <Select value={cForm.building_type} onChange={(e) => setCForm((f) => ({ ...f, building_type: e.target.value }))}>
              {BUILDING_TYPES.map((t) => (
                <option key={t} value={t}>{BUILDING_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Name">
            <Input placeholder="My Factory #1" value={cForm.name} onChange={(e) => setCForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          {constructMut.isError && (
            <p className="text-rose-400 text-xs">{(constructMut.error as Error).message}</p>
          )}
        </Modal>
      )}

      {/* Configure modal */}
      {configTarget && (
        <Modal
          title={`Configure — ${configTarget.name}`}
          onClose={() => setConfigTarget(null)}
          onSubmit={() => configureMut.mutate()}
          submitLabel={configureMut.isPending ? 'Saving…' : 'Save'}
          submitDisabled={configureMut.isPending}
        >
          <Field label="Recipe">
            <Select value={cfgForm.recipe_id} onChange={(e) => setCfgForm((f) => ({ ...f, recipe_id: e.target.value }))}>
              <option value="">— None —</option>
              {(recipesResp?.recipes ?? []).map((r) => (
                <option key={r.recipe_id} value={r.recipe_id}>
                  {r.name} ({r.output_type}, {r.ticks_required}t)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Workers">
            <Input type="number" min={0} value={cfgForm.workers_assigned}
              onChange={(e) => setCfgForm((f) => ({ ...f, workers_assigned: parseInt(e.target.value) || 0 }))} />
          </Field>
          {cfgForm.recipe_id && (recipesResp?.recipes ?? []).find((r) => r.recipe_id === cfgForm.recipe_id) && (
            <div className="bg-gray-800 rounded p-3 text-xs space-y-1">
              {(() => {
                const r = recipesResp!.recipes.find((r) => r.recipe_id === cfgForm.recipe_id)!;
                return <>
                  <p className="text-gray-400">Output: <span className="text-white">{r.output_min}–{r.output_max} {r.output_type}</span></p>
                  <p className="text-gray-400">Ingredients: {r.ingredients.map((i) => `${i.quantity}× ${i.resource_type}`).join(', ') || 'none'}</p>
                </>;
              })()}
            </div>
          )}
          {configureMut.isError && (
            <p className="text-rose-400 text-xs">{(configureMut.error as Error).message}</p>
          )}
        </Modal>
      )}

      {/* Inventory modal */}
      {invTarget && (
        <Modal title={`Inventory — ${invTarget.name}`} onClose={() => setInvTarget(null)}>
          {!invResp && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
          {invResp && invResp.items.length === 0 && <p className="text-gray-500 text-xs">Empty</p>}
          {invResp && invResp.items.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  {['Resource', 'Qty', 'Quality', 'Brand'].map((h) => (
                    <th key={h} className="text-left py-1.5 pr-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invResp.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="py-1.5 pr-3 text-white capitalize">{item.resource_type}</td>
                    <td className="py-1.5 pr-3 text-gray-300 font-mono">{item.quantity.toFixed(1)}</td>
                    <td className="py-1.5 pr-3 text-gray-300 font-mono">{item.quality.toFixed(2)}</td>
                    <td className="py-1.5 text-gray-500">{item.brand_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

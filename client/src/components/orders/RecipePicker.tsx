import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { configureBuilding } from '../../api';
import type { RecipeInfo } from '../../types';
import { EmptyState, Spinner } from '../ui';

export function RecipePicker({
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['building', buildingId] }),
  });

  const filtered = recipes.filter(r =>
    r.output_type.toLowerCase().includes(search.toLowerCase())
  );

  if (recipes.length === 0) {
    return <EmptyState icon="📋" message="No recipes available for this building type." />;
  }

  return (
    <div>
      <p className="text-xs text-gray-600 mb-2">Select a recipe to configure orders</p>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search recipes…"
        className="w-full px-2 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-500 mb-2"
      />
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {filtered.map(r => (
          <button
            key={r.recipe_id}
            disabled={configureMut.isPending}
            onClick={() => configureMut.mutate(r.recipe_id)}
            className="w-full text-left px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 border border-gray-300 transition-colors disabled:opacity-40 relative"
          >
            {configureMut.isPending && configureMut.variables === r.recipe_id && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2"><Spinner size="sm" /></span>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-900 text-xs font-medium capitalize">{r.output_type}</span>
              <span className="text-gray-600 text-xs font-mono">
                ×{r.output_min}–{r.output_max} / {r.ticks_required}d
              </span>
            </div>
            {r.ingredients.length > 0 && (
              <p className="text-gray-500 text-xs mt-0.5">
                Needs: {r.ingredients.map(i => `${i.resource_type} ×${i.quantity}`).join(', ')}
              </p>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-xs px-1">No matches</p>
        )}
      </div>
      {configureMut.isError && (
        <p className="text-rose-400 text-xs mt-2">{(configureMut.error as Error).message}</p>
      )}
    </div>
  );
}

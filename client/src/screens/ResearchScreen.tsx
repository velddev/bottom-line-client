import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause } from 'lucide-react';
import { listResearch, startResearch, pauseResearch } from '../api';
import Modal, { Field, Input } from '../components/Modal';
import { fmtMoney } from '../types';

const RESOURCES = ['grain', 'water', 'feed', 'cattle', 'meat', 'leather', 'food'];

export default function ResearchScreen() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['research'],
    queryFn: listResearch,
    refetchInterval: 30_000,
  });
  const projects = data?.projects ?? [];

  const [showStart, setShowStart] = useState(false);
  const [form, setForm] = useState({ resource_type: 'grain', workers_assigned: '1', budget_per_tick: '10' });

  const startMut = useMutation({
    mutationFn: () => startResearch(form.resource_type, parseInt(form.workers_assigned) || 0, parseFloat(form.budget_per_tick) || 0),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['research'] }); setShowStart(false); },
  });

  const pauseMut = useMutation({
    mutationFn: ({ id, pause }: { id: string; pause: boolean }) => pauseResearch(id, pause),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research'] }),
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Research</h1>
        <button
          onClick={() => setShowStart(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded text-sm transition-colors"
        >
          <Plus size={14} /> Start Research
        </button>
      </div>

      <p className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded p-3">
        Research improves the quality of your produced resources. Higher quality means better demand and higher prices.
        Quality is benchmarked against the city median — being above average gives you a demand bonus of up to 100%.
      </p>

      {isLoading && <p className="text-gray-500 text-sm animate-pulse">Loading…</p>}

      {!isLoading && projects.length === 0 && (
        <div className="text-center py-12 text-gray-600 border border-dashed border-gray-800 rounded-lg">
          <p className="text-4xl mb-3">🔬</p>
          <p className="text-sm">No research projects started yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.resource_type} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-white font-semibold capitalize text-sm">{p.resource_type}</h3>
                <p className="text-gray-500 text-xs mt-0.5">Level {p.level} · {p.workers} workers · {fmtMoney(p.budget_per_tick)}/tick</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${p.is_active ? 'text-emerald-400 bg-emerald-900/20' : 'text-gray-500 bg-gray-800'}`}>
                  {p.is_active ? 'Active' : 'Paused'}
                </span>
                <button
                  onClick={() => pauseMut.mutate({ id: p.resource_type, pause: p.is_active })}
                  className={`transition-colors ${p.is_active ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                  title={p.is_active ? 'Pause' : 'Resume'}
                >
                  {p.is_active ? <Pause size={15} /> : <Play size={15} />}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Progress to Lv{p.level + 1}</span>
                <span className="font-mono">{(p.progress * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${p.progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {showStart && (
        <Modal
          title="Start Research Project"
          onClose={() => setShowStart(false)}
          onSubmit={() => startMut.mutate()}
          submitLabel={startMut.isPending ? 'Starting…' : 'Start Research'}
          submitDisabled={startMut.isPending}
        >
          <Field label="Resource Type">
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              value={form.resource_type}
              onChange={(e) => setForm((f) => ({ ...f, resource_type: e.target.value }))}
            >
              {RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workers">
              <Input type="number" min="0" value={form.workers_assigned}
                onChange={(e) => setForm((f) => ({ ...f, workers_assigned: e.target.value }))} />
            </Field>
            <Field label="Budget / Tick ($)">
              <Input type="number" min="0" step="1" value={form.budget_per_tick}
                onChange={(e) => setForm((f) => ({ ...f, budget_per_tick: e.target.value }))} />
            </Field>
          </div>
          {startMut.isError && <p className="text-rose-400 text-xs">{(startMut.error as Error).message}</p>}
        </Modal>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { listAgreements, createAgreement, respondAgreement, cancelAgreement } from '../api';
import { useAuth } from '../auth';
import { fmtPct, fmtMoney } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';

const RESOURCES = ['grain', 'water', 'animal_feed', 'cattle', 'meat', 'leather', 'food'];
const STATUS_COLORS: Record<string, string> = {
  pending:  'text-amber-400 bg-amber-900/20',
  accepted: 'text-emerald-400 bg-emerald-900/20',
  rejected: 'text-rose-400 bg-rose-900/20',
  cancelled:'text-gray-500 bg-gray-800',
};

export default function AgreementsScreen() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'creator' | 'buyer'>('creator');

  const { data, isLoading } = useQuery({
    queryKey: ['agreements', tab],
    queryFn: () => listAgreements(tab),
  });
  const agreements = data?.agreements ?? [];

  // ── Create modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    buyer_player_id: '', resource_type: 'grain', discount_rate: '0',
    require_non_competition: false, require_msrp: false, msrp_price: '0',
    disallow_white_labeling: false, expires_at_tick: '',
  });

  const createMut = useMutation({
    mutationFn: () => createAgreement({
      buyer_player_id: form.buyer_player_id,
      resource_type: form.resource_type,
      discount_rate: parseFloat(form.discount_rate) / 100,
      require_non_competition: form.require_non_competition,
      require_msrp: form.require_msrp,
      msrp_price: parseFloat(form.msrp_price),
      disallow_white_labeling: form.disallow_white_labeling,
      expires_at_tick: parseInt(form.expires_at_tick) || 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agreements'] }); setShowCreate(false); },
  });

  const respondMut = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) => respondAgreement(id, response),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agreements'] }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelAgreement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agreements'] }),
  });

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Trade Agreements</h1>
        {tab === 'creator' && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded text-sm transition-colors"
          >
            <Plus size={14} /> New Agreement
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border border-gray-800 rounded w-fit p-0.5 bg-gray-900">
        {(['creator', 'buyer'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm capitalize transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            As {t}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-500 text-sm animate-pulse">Loading…</p>}

      {!isLoading && agreements.length === 0 && (
        <div className="text-center py-12 text-gray-600 border border-dashed border-gray-800 rounded-lg">
          <p className="text-4xl mb-3">🤝</p>
          <p className="text-sm">No agreements {tab === 'creator' ? 'created' : 'received'} yet.</p>
        </div>
      )}

      {agreements.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                {['ID', 'Resource', 'Discount', 'Status', 'Flags', 'Expires', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agreements.map((a) => {
                const flags = [
                  a.require_non_competition && 'Non-compete',
                  a.require_msrp           && `MSRP ${fmtMoney(a.msrp_price)}`,
                  a.disallow_white_labeling && 'No WL',
                ].filter(Boolean);

                return (
                  <tr key={a.agreement_id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="px-3 py-2.5 text-gray-500 font-mono">{a.agreement_id.slice(0, 8)}…</td>
                    <td className="px-3 py-2.5 text-white capitalize">{a.resource_type}</td>
                    <td className="px-3 py-2.5 text-emerald-400 font-mono">{fmtPct(a.discount_rate)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[a.status] ?? 'text-gray-400'}`}>{a.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{flags.join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{a.expires_at_tick ? `t${a.expires_at_tick}` : '∞'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {tab === 'buyer' && a.status === 'pending' && (
                          <>
                            <button onClick={() => respondMut.mutate({ id: a.agreement_id, response: 'accept' })} className="text-emerald-400 hover:text-emerald-300 transition-colors" title="Accept">
                              <CheckCircle size={13} />
                            </button>
                            <button onClick={() => respondMut.mutate({ id: a.agreement_id, response: 'reject' })} className="text-rose-400 hover:text-rose-300 transition-colors" title="Reject">
                              <XCircle size={13} />
                            </button>
                          </>
                        )}
                        {tab === 'creator' && a.status !== 'cancelled' && (
                          <button onClick={() => cancelMut.mutate(a.agreement_id)} className="text-gray-500 hover:text-rose-400 transition-colors" title="Cancel">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal
          title="New Trade Agreement"
          onClose={() => setShowCreate(false)}
          onSubmit={() => createMut.mutate()}
          submitLabel={createMut.isPending ? 'Creating…' : 'Create'}
          submitDisabled={createMut.isPending || !form.buyer_player_id}
        >
          <Field label="Buyer Player ID">
            <Input placeholder="uuid of buyer" value={form.buyer_player_id}
              onChange={(e) => setForm((f) => ({ ...f, buyer_player_id: e.target.value }))} />
          </Field>
          <Field label="Resource">
            <Select value={form.resource_type} onChange={(e) => setForm((f) => ({ ...f, resource_type: e.target.value }))}>
              {RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount (%)">
              <Input type="number" min="0" max="100" step="0.1" value={form.discount_rate}
                onChange={(e) => setForm((f) => ({ ...f, discount_rate: e.target.value }))} />
            </Field>
            <Field label="Expires at Tick">
              <Input type="number" min="0" placeholder="0 = never" value={form.expires_at_tick}
                onChange={(e) => setForm((f) => ({ ...f, expires_at_tick: e.target.value }))} />
            </Field>
          </div>
          {/* Terms checkboxes */}
          <div className="space-y-2">
            {[
              { key: 'require_non_competition', label: 'Require non-competition' },
              { key: 'disallow_white_labeling', label: 'Disallow white-labeling' },
              { key: 'require_msrp',            label: 'Require MSRP price' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={(form as Record<string, unknown>)[key] as boolean}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          {form.require_msrp && (
            <Field label="MSRP Price">
              <Input type="number" min="0" step="0.01" value={form.msrp_price}
                onChange={(e) => setForm((f) => ({ ...f, msrp_price: e.target.value }))} />
            </Field>
          )}
          {createMut.isError && <p className="text-rose-400 text-xs">{(createMut.error as Error).message}</p>}
        </Modal>
      )}
    </div>
  );
}

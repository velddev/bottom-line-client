import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause, BarChart3 } from 'lucide-react';
import { listBrands, createBrand, getBrandValue, createCampaign, pauseCampaign } from '../api';
import { type BrandSummary, fmtPct } from '../types';
import Modal, { Field, Input, Select } from '../components/Modal';

const RESOURCES = ['grain', 'water', 'feed', 'cattle', 'meat', 'leather', 'food'];

export default function MarketingScreen() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const brands = data?.brands ?? [];

  // ── Create brand modal ──
  const [showBrand, setShowBrand] = useState(false);
  const [brandForm, setBrandForm] = useState({ name: '', resource_type: 'grain' });
  const brandMut = useMutation({
    mutationFn: () => createBrand(brandForm.name, brandForm.resource_type),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['brands'] }); setShowBrand(false); },
  });

  // ── Campaign modal ──
  const [campaignTarget, setCampaignTarget] = useState<BrandSummary | null>(null);
  const [campaignForm, setCampaignForm] = useState({ campaign_name: '', budget_per_tick: '50', workers_allocated: '1' });
  const campaignMut = useMutation({
    mutationFn: () => createCampaign(
      campaignTarget!.brand_id,
      campaignForm.campaign_name,
      parseFloat(campaignForm.budget_per_tick),
      parseInt(campaignForm.workers_allocated),
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['brands'] }); setCampaignTarget(null); },
  });

  // ── Brand value detail ──
  const [detailBrand, setDetailBrand] = useState<BrandSummary | null>(null);
  const { data: brandValue } = useQuery({
    queryKey: ['brand-value', detailBrand?.brand_id],
    queryFn: () => getBrandValue(detailBrand!.brand_id),
    enabled: !!detailBrand,
  });

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Marketing</h1>
        <button
          onClick={() => setShowBrand(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded text-sm transition-colors"
        >
          <Plus size={14} /> Create Brand
        </button>
      </div>

      <p className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded p-3">
        Branded items command higher prices via brand power. Brand weight is relative to all brands in the same category per city.
        Without competition, only the government default brand competes with you.
      </p>

      {isLoading && <p className="text-gray-500 text-sm animate-pulse">Loading…</p>}

      {!isLoading && brands.length === 0 && (
        <div className="text-center py-12 text-gray-600 border border-dashed border-gray-800 rounded-lg">
          <p className="text-4xl mb-3">📣</p>
          <p className="text-sm">No brands created yet.</p>
        </div>
      )}

      {brands.length > 0 && (
        <div className="grid gap-3">
          {brands.map((b) => (
            <div key={b.brand_id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-semibold text-sm">{b.name}</h3>
                  <p className="text-gray-500 text-xs mt-0.5 capitalize">{b.resource}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDetailBrand(b)}
                    className="text-gray-500 hover:text-indigo-400 transition-colors" title="View value"
                  >
                    <BarChart3 size={14} />
                  </button>
                  <button
                    onClick={() => { setCampaignTarget(b); setCampaignForm({ campaign_name: '', budget_per_tick: '50', workers_allocated: '1' }); }}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/20 px-2 py-1 rounded transition-colors"
                  >
                    <Plus size={11} /> Campaign
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-gray-500 mb-1">Brand Weight</p>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500 rounded-full" style={{ width: `${Math.min(b.brand_weight * 100, 100)}%` }} />
                  </div>
                  <p className="text-pink-400 font-mono mt-1">{b.brand_weight.toFixed(3)}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Market Share</p>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(b.market_share * 100, 100)}%` }} />
                  </div>
                  <p className="text-purple-400 font-mono mt-1">{fmtPct(b.market_share)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create brand modal */}
      {showBrand && (
        <Modal
          title="Create Brand"
          onClose={() => setShowBrand(false)}
          onSubmit={() => brandMut.mutate()}
          submitLabel={brandMut.isPending ? 'Creating…' : 'Create Brand'}
          submitDisabled={brandMut.isPending || !brandForm.name.trim()}
        >
          <Field label="Brand Name">
            <Input placeholder="e.g. Golden Grain Co." value={brandForm.name}
              onChange={(e) => setBrandForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Resource Type">
            <Select value={brandForm.resource_type} onChange={(e) => setBrandForm((f) => ({ ...f, resource_type: e.target.value }))}>
              {RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          {brandMut.isError && <p className="text-rose-400 text-xs">{(brandMut.error as Error).message}</p>}
        </Modal>
      )}

      {/* Create campaign modal */}
      {campaignTarget && (
        <Modal
          title={`New Campaign for ${campaignTarget.name}`}
          onClose={() => setCampaignTarget(null)}
          onSubmit={() => campaignMut.mutate()}
          submitLabel={campaignMut.isPending ? 'Launching…' : 'Launch Campaign'}
          submitDisabled={campaignMut.isPending || !campaignForm.campaign_name.trim()}
        >
          <Field label="Campaign Name">
            <Input placeholder="Spring Promo" value={campaignForm.campaign_name}
              onChange={(e) => setCampaignForm((f) => ({ ...f, campaign_name: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget / Tick ($)">
              <Input type="number" min="0" step="1" value={campaignForm.budget_per_tick}
                onChange={(e) => setCampaignForm((f) => ({ ...f, budget_per_tick: e.target.value }))} />
            </Field>
            <Field label="Workers">
              <Input type="number" min="0" value={campaignForm.workers_allocated}
                onChange={(e) => setCampaignForm((f) => ({ ...f, workers_allocated: e.target.value }))} />
            </Field>
          </div>
          {campaignMut.isError && <p className="text-rose-400 text-xs">{(campaignMut.error as Error).message}</p>}
        </Modal>
      )}

      {/* Brand value detail modal */}
      {detailBrand && (
        <Modal title={`Brand Value — ${detailBrand.name}`} onClose={() => setDetailBrand(null)}>
          {!brandValue && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
          {brandValue && (
            <div className="space-y-3 text-sm">
              {[
                { label: 'Brand Name',      value: brandValue.brand_name },
                { label: 'Resource',        value: brandValue.resource_category },
                { label: 'Brand Weight',    value: brandValue.brand_weight.toFixed(4), cls: 'text-pink-400 font-mono' },
                { label: 'Market Share',    value: fmtPct(brandValue.market_share),    cls: 'text-purple-400 font-mono' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className={cls ?? 'text-white'}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

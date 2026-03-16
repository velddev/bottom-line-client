import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Vote, Settings } from 'lucide-react';
import { getGovernment, getElection, runForElection, enactPolicy } from '../api';
import { useAuth } from '../auth';
import { fmtPct } from '../types';
import Modal, { Field, Input } from './Modal';

function TaxBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="text-amber-400 font-mono">{fmtPct(value)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
    </div>
  );
}

function ApprovalBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className={`${color} font-mono`}>{fmtPct(value)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color.replace('text-', 'bg-').replace('-400', '-500')}/60 rounded-full`} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      </div>
    </div>
  );
}

export default function PoliticsPanel() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    consumer_tax_rate: '0', profit_tax_rate: '0', land_tax_rate: '0', employee_tax_rate: '0',
  });

  const { data: gov, isLoading: govLoading } = useQuery({
    queryKey: ['government', auth?.city_id],
    queryFn: () => getGovernment(auth!.city_id),
    enabled: !!auth?.city_id,
    refetchInterval: 60_000,
  });

  const { data: election, isLoading: elecLoading } = useQuery({
    queryKey: ['election', auth?.city_id],
    queryFn: () => getElection(auth!.city_id),
    enabled: !!auth?.city_id,
    refetchInterval: 60_000,
  });

  const runMut = useMutation({
    mutationFn: () => runForElection(election!.election_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['election'] }),
  });

  const policyMut = useMutation({
    mutationFn: () => enactPolicy(
      auth!.city_id,
      parseFloat(policyForm.consumer_tax_rate) / 100,
      parseFloat(policyForm.profit_tax_rate) / 100,
      parseFloat(policyForm.land_tax_rate) / 100,
      parseFloat(policyForm.employee_tax_rate) / 100,
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['government'] }); setShowPolicy(false); },
  });

  const isRuler    = gov?.ruling_player_id === auth?.player_id;
  const isCandidate = election?.candidates?.some((c) => c.player_id === auth?.player_id);

  return (
    <div className="space-y-3">
      {govLoading && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
      {gov && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-gray-600 text-xs">Current Ruler</p>
              {isRuler && (
                <button
                  onClick={() => {
                    setPolicyForm({
                      consumer_tax_rate: String((gov.consumer_tax_rate * 100).toFixed(1)),
                      profit_tax_rate:   String((gov.profit_tax_rate   * 100).toFixed(1)),
                      land_tax_rate:     String((gov.land_tax_rate     * 100).toFixed(1)),
                      employee_tax_rate: String((gov.employee_tax_rate * 100).toFixed(1)),
                    });
                    setShowPolicy(true);
                  }}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Settings size={11} /> Set Policy
                </button>
              )}
            </div>
            <p className="text-gray-900 text-sm font-semibold">{gov.ruling_player_name || 'AI Government'}</p>
            {isRuler && <span className="text-indigo-400 text-xs">← You</span>}
            <p className="text-gray-600 text-xs mt-0.5">Term: Day {gov.term_start_tick} – Day {gov.term_end_tick}</p>
          </div>

          <div className="space-y-2">
            <p className="text-gray-600 text-xs uppercase tracking-wider">Tax Rates</p>
            <TaxBar label="Consumer Tax"  value={gov.consumer_tax_rate}  />
            <TaxBar label="Profit Tax"    value={gov.profit_tax_rate}    />
            <TaxBar label="Land Tax"      value={gov.land_tax_rate}      />
            <TaxBar label="Employee Tax"  value={gov.employee_tax_rate}  />
          </div>

          <div className="space-y-2">
            <p className="text-gray-600 text-xs uppercase tracking-wider">Approval Ratings</p>
            <ApprovalBar label="City"     value={gov.approval_city}     color="text-blue-400"    />
            <ApprovalBar label="People"   value={gov.approval_people}   color="text-emerald-400" />
            <ApprovalBar label="Business" value={gov.approval_business} color="text-amber-400"   />
          </div>
        </>
      )}

      {/* Election */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-gray-600 text-xs uppercase tracking-wider">Election</p>
          {election && election.status === 'open' && !isCandidate && (
            <button
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending}
              className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-gray-900 px-2 py-1 rounded transition-colors"
            >
              <Vote size={11} /> Run
            </button>
          )}
        </div>

        {elecLoading && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
        {election && (
          <>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs ${
                election.status === 'open'       ? 'bg-emerald-900/40 text-emerald-400' :
                election.status === 'concluded'  ? 'bg-gray-100 text-gray-600' :
                                                    'bg-amber-900/40 text-amber-400'
              }`}>{election.status}</span>
              <span className="text-gray-600 text-xs">t{election.voting_start} – t{election.voting_end}</span>
            </div>

            {election.winner_player_id && (
              <p className="text-xs text-gray-600">
                Winner: <span className="text-gray-900">{election.winner_player_id.slice(0, 8)}…</span>
              </p>
            )}

            {isCandidate && (
              <p className="text-xs text-indigo-400">✓ You are a candidate</p>
            )}

            {(election.candidates?.length ?? 0) > 0 && (
              <div className="space-y-2">
                {election.candidates.map((c) => (
                  <div key={c.player_id} className="flex items-center justify-between text-xs">
                    <span className={c.player_id === auth?.player_id ? 'text-indigo-300 font-semibold' : 'text-gray-800'}>
                      {c.player_name}
                    </span>
                    <div className="flex items-center gap-2 text-gray-600">
                      <span>👁 {fmtPct(c.perception)}</span>
                      <span>🗳 {c.votes}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(election.candidates?.length ?? 0) === 0 && (
              <p className="text-gray-600 text-xs">No candidates yet.</p>
            )}
          </>
        )}
        {!election && !elecLoading && (
          <p className="text-gray-600 text-xs">No election currently scheduled.</p>
        )}
        {runMut.isError  && <p className="text-rose-400 text-xs">{(runMut.error as Error).message}</p>}
        {runMut.data     && <p className="text-emerald-400 text-xs">{runMut.data.message}</p>}
      </div>

      {/* Policy modal (ruler only) */}
      {showPolicy && (
        <Modal
          title="Enact Policy"
          onClose={() => setShowPolicy(false)}
          onSubmit={() => policyMut.mutate()}
          submitLabel={policyMut.isPending ? 'Enacting…' : 'Enact Policy'}
          submitDisabled={policyMut.isPending}
        >
          <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800 rounded px-3 py-2">
            Warning: Tax changes directly affect city GDP and your approval ratings.
          </p>
          {[
            { key: 'consumer_tax_rate', label: 'Consumer Tax Rate (%)' },
            { key: 'profit_tax_rate',   label: 'Profit Tax Rate (%)'   },
            { key: 'land_tax_rate',     label: 'Land Tax Rate (%)'     },
            { key: 'employee_tax_rate', label: 'Employee Tax Rate (%)'  },
          ].map(({ key, label }) => (
            <Field key={key} label={label}>
              <Input
                type="number" min="0" max="100" step="0.1"
                value={(policyForm as Record<string, string>)[key]}
                onChange={(e) => setPolicyForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </Field>
          ))}
          {policyMut.isError   && <p className="text-rose-400 text-xs">{(policyMut.error as Error).message}</p>}
          {policyMut.isSuccess && <p className="text-emerald-400 text-xs">{policyMut.data?.message}</p>}
        </Modal>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Vote, Settings } from 'lucide-react';
import { getGovernment, getElection, runForElection, enactPolicy, castVote } from '../api';
import { useAuth } from '../auth';
import { fmtPct, fmtMoney } from '../types';
import Modal, { Field, Input } from '../components/Modal';

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

function PollBar({ name, pollPct, playerVotes, citizenVotes, isMe, isLeader }:
  { name: string; pollPct: number; playerVotes: number; citizenVotes: number; isMe: boolean; isLeader: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={isMe ? 'text-indigo-300 font-semibold' : 'text-gray-700'}>
          {isLeader && '🏆 '}{name}{isMe && ' (you)'}
        </span>
        <span className="text-gray-900 font-mono font-bold">{pollPct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isMe ? 'bg-indigo-500' : 'bg-blue-600/70'}`}
          style={{ width: `${Math.min(pollPct, 100)}%` }}
        />
      </div>
      <div className="flex gap-3 text-[10px] text-gray-600">
        <span>👥 {citizenVotes.toLocaleString()} citizens</span>
        <span>🗳️ {playerVotes} players</span>
      </div>
    </div>
  );
}

export default function PoliticsScreen() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const [showPolicy, setShowPolicy] = useState(false);
  const [votingFor, setVotingFor] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState({
    consumer_tax_rate: '0', profit_tax_rate: '0', land_tax_rate: '0', employee_tax_rate: '0',
  });

  const { data: gov, isLoading: govLoading } = useQuery({
    queryKey: ['government', auth?.city_id],
    queryFn: () => getGovernment(auth!.city_id),
    enabled: !!auth?.city_id,
    refetchInterval: 30_000,
  });

  const { data: election, isLoading: elecLoading } = useQuery({
    queryKey: ['election', auth?.city_id],
    queryFn: () => getElection(auth!.city_id),
    enabled: !!auth?.city_id,
    refetchInterval: 30_000,
  });

  const runMut = useMutation({
    mutationFn: () => runForElection(election!.election_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['election'] }),
  });

  const voteMut = useMutation({
    mutationFn: (candidate_id: string) => castVote(election!.election_id, candidate_id),
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

  const isRuler     = gov?.ruling_player_id === auth?.player_id;
  const isCandidate = election?.candidates?.some((c) => c.player_id === auth?.player_id);
  const inCampaign  = election?.status === 'campaigning';
  const inVoting    = election?.status === 'voting';

  // Sort candidates by poll_percent desc for display
  const sortedCandidates = [...(election?.candidates ?? [])].sort((a, b) => b.poll_percent - a.poll_percent);
  const leader = sortedCandidates[0];

  const statusColor = (s: string) => ({
    campaigning: 'bg-sky-900/40 text-sky-400',
    voting:      'bg-emerald-900/40 text-emerald-400',
    concluded:   'bg-gray-100 text-gray-600',
  }[s] ?? 'bg-gray-100 text-gray-500');

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Politics</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Government panel */}
        <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">🏛️ Government</h2>
            {isRuler && (
              <button
                onClick={() => {
                  setPolicyForm({
                    consumer_tax_rate: String((gov!.consumer_tax_rate * 100).toFixed(1)),
                    profit_tax_rate:   String((gov!.profit_tax_rate   * 100).toFixed(1)),
                    land_tax_rate:     String((gov!.land_tax_rate     * 100).toFixed(1)),
                    employee_tax_rate: String((gov!.employee_tax_rate * 100).toFixed(1)),
                  });
                  setShowPolicy(true);
                }}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Settings size={12} /> Set Policy
              </button>
            )}
          </div>
          <div className="p-4 space-y-4">
            {govLoading && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
            {gov && (
              <>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Current Ruler</p>
                  <p className="text-gray-900 font-semibold">{gov.ruling_player_name || 'AI Government'}</p>
                  {isRuler && <span className="text-indigo-400 text-xs">← You</span>}
                  <p className="text-gray-600 text-xs">Term: Day {gov.term_start_tick} – Day {gov.term_end_tick}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Tax Rates</p>
                  <TaxBar label="Consumer Tax"  value={gov.consumer_tax_rate}  />
                  <TaxBar label="Profit Tax"    value={gov.profit_tax_rate}    />
                  <TaxBar label="Land Tax"      value={gov.land_tax_rate}      />
                  <TaxBar label="Employee Tax"  value={gov.employee_tax_rate}  />
                </div>

                <div className="space-y-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Approval Ratings</p>
                  <ApprovalBar label="City"     value={gov.approval_city}     color="text-blue-400"   />
                  <ApprovalBar label="People"   value={gov.approval_people}   color="text-emerald-400" />
                  <ApprovalBar label="Business" value={gov.approval_business} color="text-amber-400"  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Election panel */}
        <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">🗳️ Election</h2>
            <div className="flex items-center gap-2">
              {election && inCampaign && !isCandidate && (
                <button
                  onClick={() => runMut.mutate()}
                  disabled={runMut.isPending}
                  className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-gray-900 px-2.5 py-1.5 rounded transition-colors"
                >
                  <Vote size={12} /> Run for Office
                </button>
              )}
              {election && inVoting && !election.player_has_voted && (
                <span className="text-xs text-emerald-400 animate-pulse">Voting open!</span>
              )}
              {election && election.player_has_voted && (
                <span className="text-xs text-gray-500">✓ Voted</span>
              )}
            </div>
          </div>
          <div className="p-4">
            {elecLoading && <p className="text-gray-500 text-xs animate-pulse">Loading…</p>}
            {election && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-2 py-0.5 rounded text-xs ${statusColor(election.status)}`}>
                    {election.status}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {inVoting ? 'Voting ends' : 'Voting starts'} t{inVoting ? election.voting_end : election.voting_start}
                  </span>
                  {election.last_polled_tick > 0 && (
                    <span className="text-gray-700 text-xs">· polled Day {election.last_polled_tick}</span>
                  )}
                </div>

                {election.winner_player_id && (
                  <p className="text-xs text-amber-400 mb-3">
                    🏆 Winner: <span className="text-gray-900 font-semibold">
                      {sortedCandidates.find(c => c.player_id === election.winner_player_id)?.player_name
                        ?? election.winner_player_id.slice(0, 8) + '…'}
                    </span>
                  </p>
                )}

                {isCandidate && (
                  <p className="text-xs text-indigo-400 mb-3">✓ You are a candidate</p>
                )}

                {/* Polling / candidates */}
                {sortedCandidates.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-gray-500 text-xs uppercase tracking-wider">
                      {inVoting ? '📊 Live Results' : '📊 Tracking Poll'}
                    </p>
                    {sortedCandidates.map((c) => (
                      <div key={c.player_id} className="space-y-1">
                        <PollBar
                          name={c.player_name}
                          pollPct={c.poll_percent}
                          playerVotes={c.player_votes}
                          citizenVotes={c.citizen_votes}
                          isMe={c.player_id === auth?.player_id}
                          isLeader={c.player_id === leader?.player_id}
                        />
                        {/* Vote button */}
                        {inVoting && !election.player_has_voted && c.player_id !== auth?.player_id && (
                          <button
                            onClick={() => {
                              setVotingFor(c.player_id);
                              voteMut.mutate(c.player_id);
                            }}
                            disabled={voteMut.isPending}
                            className="text-[11px] px-2 py-0.5 rounded bg-emerald-800/40 hover:bg-emerald-700/40 text-emerald-300 disabled:opacity-50 transition-colors"
                          >
                            {voteMut.isPending && votingFor === c.player_id ? 'Voting…' : 'Vote for ' + c.player_name}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {sortedCandidates.length === 0 && (
                  <p className="text-gray-600 text-xs">No candidates yet. Be the first to run!</p>
                )}
              </>
            )}
            {!election && !elecLoading && (
              <p className="text-gray-600 text-xs">No election currently active.</p>
            )}
            {(runMut.isError || voteMut.isError) && (
              <p className="text-rose-400 text-xs mt-2">
                {((runMut.error ?? voteMut.error) as Error).message}
              </p>
            )}
            {runMut.data && <p className="text-emerald-400 text-xs mt-2">{runMut.data.message}</p>}
            {voteMut.data && <p className={`text-xs mt-2 ${voteMut.data.success ? 'text-emerald-400' : 'text-rose-400'}`}>{voteMut.data.message}</p>}
          </div>
        </div>
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
          {policyMut.isError  && <p className="text-rose-400 text-xs">{(policyMut.error as Error).message}</p>}
          {policyMut.isSuccess && <p className="text-emerald-400 text-xs">{policyMut.data?.message}</p>}
        </Modal>
      )}
    </div>
  );
}

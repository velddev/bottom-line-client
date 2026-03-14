import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLoan, borrowCapital, repayDebt } from '../api';
import { useAuth } from '../auth';
import { fmtMoney, fmtPct } from '../types';

export default function BankPanel() {
  const { auth } = useAuth();
  const qc = useQueryClient();

  const [borrowInput, setBorrowInput] = useState('');
  const [repaySlider, setRepaySlider] = useState(0);

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan', auth?.city_id],
    queryFn: () => getLoan(auth!.city_id),
    enabled: !!auth?.city_id,
    refetchInterval: 30_000,
  });

  const borrowMut = useMutation({
    mutationFn: (amount: number) => borrowCapital(auth!.city_id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      setBorrowInput('');
    },
  });
  const repayMut = useMutation({
    mutationFn: (amount: number) => repayDebt(auth!.city_id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      setRepaySlider(0);
    },
  });

  const borrowAmount = parseFloat(borrowInput) || 0;
  const maxRepay     = Math.min(loan?.balance ?? 0, loan?.player_balance ?? 0);

  if (isLoading) return <p className="text-gray-500 text-xs animate-pulse">Loading…</p>;

  return (
    <div className="space-y-4">
      {/* Loan status */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-800">
          <h2 className="text-xs font-semibold text-white">🏦 Your Loan</h2>
        </div>
        <div className="p-3 space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Outstanding</span>
            <span className={`font-mono font-semibold ${(loan?.balance ?? 0) > 0 ? 'text-rose-400' : 'text-gray-400'}`}>
              {fmtMoney(loan?.balance ?? 0)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Interest rate</span>
            <span className="font-mono text-amber-400">{fmtPct(loan?.interest_rate ?? 0.005)} / tick</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Cost per tick</span>
            <span className="font-mono text-amber-400">{fmtMoney(loan?.interest_per_tick ?? 0)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Your balance</span>
            <span className="font-mono text-emerald-400">{fmtMoney(loan?.player_balance ?? 0)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Max borrow</span>
            <span className="font-mono text-gray-300">{fmtMoney(loan?.max_borrow ?? 50000)}</span>
          </div>
        </div>
      </div>

      {/* Borrow capital */}
      {(loan?.max_borrow ?? 0) > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-white">💰 Borrow Capital</h2>
          </div>
          <div className="p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max={loan?.max_borrow}
                step="100"
                placeholder="Amount"
                value={borrowInput}
                onChange={(e) => setBorrowInput(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 placeholder-gray-600"
              />
              <button
                disabled={borrowMut.isPending || borrowAmount <= 0 || Math.round(borrowAmount * 100) > (loan?.max_borrow ?? 0)}
                onClick={() => borrowMut.mutate(Math.round(borrowAmount * 100))}
                className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded transition-colors"
              >
                {borrowMut.isPending ? 'Processing…' : 'Borrow'}
              </button>
            </div>
            {borrowMut.isError  && <p className="text-rose-400 text-xs">{(borrowMut.error as Error).message}</p>}
            {borrowMut.data     && <p className="text-emerald-400 text-xs">{borrowMut.data.message}</p>}
          </div>
        </div>
      )}

      {/* Repay debt */}
      {(loan?.balance ?? 0) > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-white">💳 Repay Debt</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Repay</span>
                <span className="font-mono text-white">{fmtMoney(repaySlider)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxRepay}
                step={100}
                value={repaySlider}
                onChange={(e) => setRepaySlider(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>{fmtMoney(0)}</span>
                <span>{fmtMoney(maxRepay)}</span>
              </div>
            </div>
            <button
              disabled={repayMut.isPending || repaySlider <= 0}
              onClick={() => repayMut.mutate(repaySlider)}
              className="w-full bg-rose-900/60 hover:bg-rose-800/60 disabled:opacity-50 text-white text-xs py-2 rounded transition-colors"
            >
              {repayMut.isPending ? 'Processing…' : `Repay ${fmtMoney(repaySlider)}`}
            </button>
            {repayMut.isError  && <p className="text-rose-400 text-xs">{(repayMut.error as Error).message}</p>}
            {repayMut.data     && <p className="text-emerald-400 text-xs">{repayMut.data.message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';

export interface StatCardProps {
  /** Short all-caps label above the value. */
  label: string;
  /** Primary formatted value (use fmtMoney / fmtPct from types.ts). */
  value: string;
  /** Optional sub-line below the value. */
  sub?: string;
  /** Tailwind text-colour class applied to the value. */
  accent?: string;
  /** Optional icon rendered beside the label. */
  icon?: React.ReactNode;
}

/**
 * KPI summary card. Place inside a `grid gap-4` row.
 *
 * @example
 * <StatCard label="Balance"     value={fmtMoney(balance)} accent="text-emerald-400" />
 * <StatCard label="Reputation"  value={fmtPct(rep)} sub="Well regarded" accent="text-emerald-400" />
 */
export default function StatCard({ label, value, sub, accent, icon }: StatCardProps) {
  return (
    <div className="bg-gray-200 border border-gray-300 rounded-lg p-4">
      <p className="text-gray-600 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
        {icon && <span className="shrink-0">{icon}</span>}
        {label}
      </p>
      <p className={`text-xl font-bold font-mono ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getCompanyHistory } from '../api';
import { fmtMoney, type CompanyTickSnapshot } from '../types';

const LIMIT = 60;

function dollar(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDollar(cents: number) {
  const abs = Math.abs(cents / 100);
  if (abs >= 1_000_000) return `$${(cents / 100_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `$${(cents / 100_000).toFixed(1)}K`;
  return `$${(cents / 100).toFixed(0)}`;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded p-2 text-xs space-y-1">
      <p className="font-semibold text-gray-700">Tick {label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {dollar(p.value)}
        </p>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, color = 'text-gray-900' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-1">
      <p className="text-xs text-gray-700">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

export default function PerformanceScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['company-history', LIMIT],
    queryFn: () => getCompanyHistory(LIMIT),
    refetchInterval: 15_000,
  });

  const snapshots: CompanyTickSnapshot[] = data?.snapshots ?? [];

  // Most-recent-first from API; reverse for charting oldest→newest
  const sorted = [...snapshots].reverse();

  const latest = sorted[sorted.length - 1];
  const prev   = sorted[sorted.length - 2];

  const totalRevenue  = snapshots.reduce((s, r) => s + r.total_revenue_cents, 0);
  const totalExpenses = snapshots.reduce((s, r) => s + r.total_expenses_cents, 0);
  const totalProfit   = snapshots.reduce((s, r) => s + r.net_profit_cents, 0);

  const chartData = sorted.map((s) => ({
    tick:       s.tick,
    Revenue:    s.total_revenue_cents,
    Expenses:   s.total_expenses_cents,
    Profit:     s.net_profit_cents,
    Balance:    s.balance_after_tick,
    'Store':              s.store_revenue_cents,
    'Supply Sales':       s.supply_line_sales_cents,
    'Consumer Tax':       s.consumer_tax_cents,
    'Land Tax':           s.land_tax_cents,
    'Supply Buys':        s.supply_purchases_cents,
    'Marketing':          s.marketing_spend_cents,
    'Research':           s.research_spend_cents,
    'Loan Interest':      s.loan_interest_cents,
  }));

  if (isLoading) return <div className="text-gray-600 text-sm animate-pulse">Loading performance data…</div>;
  if (error)     return <div className="text-rose-400 text-sm">Failed to load performance data.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Company Performance</h1>
      <p className="text-gray-600 text-sm">Last {LIMIT} ticks — refreshes every 15 s</p>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Current Balance"
          value={latest ? dollar(latest.balance_after_tick) : '—'}
          sub={latest && prev ? `${latest.balance_after_tick >= prev.balance_after_tick ? '▲' : '▼'} ${dollar(Math.abs(latest.balance_after_tick - prev.balance_after_tick))} vs prev tick` : undefined}
          color={latest?.balance_after_tick >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          label={`Revenue (last ${snapshots.length} ticks)`}
          value={dollar(totalRevenue)}
          color="text-sky-400"
        />
        <StatCard
          label={`Expenses (last ${snapshots.length} ticks)`}
          value={dollar(totalExpenses)}
          color="text-orange-400"
        />
        <StatCard
          label={`Net Profit (last ${snapshots.length} ticks)`}
          value={dollar(totalProfit)}
          color={totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      {snapshots.length === 0 && (
        <p className="text-gray-600 text-sm">No tick data yet — wait for the next game tick to see data.</p>
      )}

      {/* Balance over time */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Balance Over Time</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="tick" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tickFormatter={shortDollar} tick={{ fill: '#6b7280', fontSize: 10 }} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="Balance" stroke="#38bdf8" fill="url(#balGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenue vs Expenses vs Profit per tick */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Revenue / Expenses / Profit per Tick</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="tick" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tickFormatter={shortDollar} tick={{ fill: '#6b7280', fontSize: 10 }} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar dataKey="Revenue"  fill="#38bdf8" stackId="a" />
              <Bar dataKey="Expenses" fill="#f97316" stackId="b" />
              <Bar dataKey="Profit"   fill="#34d399" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Expense breakdown */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Expense Breakdown per Tick</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="tick" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tickFormatter={shortDollar} tick={{ fill: '#6b7280', fontSize: 10 }} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar dataKey="Consumer Tax"  stackId="x" fill="#f43f5e" />
              <Bar dataKey="Land Tax"      stackId="x" fill="#e11d48" />
              <Bar dataKey="Supply Buys"   stackId="x" fill="#f59e0b" />
              <Bar dataKey="Marketing"     stackId="x" fill="#a78bfa" />
              <Bar dataKey="Research"      stackId="x" fill="#60a5fa" />
              <Bar dataKey="Loan Interest" stackId="x" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tick-by-tick table */}
      {snapshots.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Tick History (newest first)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-700 border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="text-left py-2 px-2">Tick</th>
                  <th className="text-right py-2 px-2">Store Rev</th>
                  <th className="text-right py-2 px-2">Supply Sales</th>
                  <th className="text-right py-2 px-2">Total Rev</th>
                  <th className="text-right py-2 px-2">Con. Tax</th>
                  <th className="text-right py-2 px-2">Land Tax</th>
                  <th className="text-right py-2 px-2">Supply Buys</th>
                  <th className="text-right py-2 px-2">Marketing</th>
                  <th className="text-right py-2 px-2">Research</th>
                  <th className="text-right py-2 px-2">Loan Int.</th>
                  <th className="text-right py-2 px-2">Total Exp</th>
                  <th className="text-right py-2 px-2 font-semibold">Net Profit</th>
                  <th className="text-right py-2 px-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.tick} className="border-b border-gray-200 hover:bg-gray-100/30">
                    <td className="py-1.5 px-2 text-gray-600">{s.tick}</td>
                    <td className="py-1.5 px-2 text-right text-sky-400">{fmtMoney(s.store_revenue_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-sky-300">{fmtMoney(s.supply_line_sales_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-sky-200 font-medium">{fmtMoney(s.total_revenue_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-rose-400">{fmtMoney(s.consumer_tax_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-rose-500">{fmtMoney(s.land_tax_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-amber-400">{fmtMoney(s.supply_purchases_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-violet-400">{fmtMoney(s.marketing_spend_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-blue-400">{fmtMoney(s.research_spend_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-600">{fmtMoney(s.loan_interest_cents)}</td>
                    <td className="py-1.5 px-2 text-right text-orange-400 font-medium">{fmtMoney(s.total_expenses_cents)}</td>
                    <td className={`py-1.5 px-2 text-right font-semibold ${s.net_profit_cents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtMoney(s.net_profit_cents)}
                    </td>
                    <td className={`py-1.5 px-2 text-right ${s.balance_after_tick >= 0 ? 'text-gray-900' : 'text-red-400'}`}>
                      {fmtMoney(s.balance_after_tick)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

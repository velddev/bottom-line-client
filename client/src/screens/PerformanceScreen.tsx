import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { getCompanyHistory } from '../api';
import { fmtMoney, type CompanyTickSnapshot } from '../types';
import { useColorMode } from '../hooks/useTheme';

const LIMIT = 60;

function dollar(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents / 100);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDollar(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents / 100);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

const CHART_COLORS = {
  dark: {
    grid:    '#44403c',
    tick:    '#a8a29e',
    ttBg:    '#292524',
    ttBorder:'#44403c',
    ttText:  '#d6d3d1',
  },
  light: {
    grid:    '#d6d3d1',
    tick:    '#78716c',
    ttBg:    '#e7e5e4',
    ttBorder:'#d6d3d1',
    ttText:  '#525252',
  },
};

interface TooltipPayload { name: string; value: number; color: string; }

function ChartTooltip({ active, payload, label, colors }: {
  active?: boolean; payload?: TooltipPayload[]; label?: number;
  colors: typeof CHART_COLORS.dark;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: colors.ttBg, border: `1px solid ${colors.ttBorder}`, color: colors.ttText }}
      className="rounded p-2 text-xs space-y-1 shadow-panel"
    >
      <p className="font-semibold" style={{ color: colors.ttText }}>Day {label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {shortDollar(p.value)}</p>
      ))}
    </div>
  );
}

// ── P&L line item ─────────────────────────────────────────────────────────────
function Row({ label, value, indent, total, colorBySign, dim }: {
  label: string; value: number;
  indent?: boolean; total?: boolean; colorBySign?: boolean; dim?: boolean;
}) {
  const labelCls = total
    ? 'font-semibold text-gray-900'
    : dim ? 'text-gray-500' : indent ? 'text-gray-700 pl-4' : 'text-gray-700';
  const valueCls = total
    ? colorBySign
      ? value >= 0 ? 'font-semibold text-emerald-500 dark:text-emerald-400'
                   : 'font-semibold text-rose-500 dark:text-rose-400'
      : 'font-semibold text-gray-900'
    : colorBySign
      ? value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
      : dim ? 'text-gray-500' : 'text-gray-700';
  return (
    <tr>
      <td className={`py-1 pr-6 text-sm ${labelCls}`}>{label}</td>
      <td className={`py-1 text-right tabular-nums font-mono text-sm ${valueCls}`}>{dollar(value)}</td>
    </tr>
  );
}

function Divider() {
  return <tr><td colSpan={2} className="py-0"><div className="border-t border-gray-300 my-1" /></td></tr>;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="pt-3 pb-1">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">{label}</span>
      </td>
    </tr>
  );
}

export default function PerformanceScreen() {
  const mode = useColorMode();
  const C = CHART_COLORS[mode];

  const { data, isLoading, error } = useQuery({
    queryKey: ['company-history', LIMIT],
    queryFn: () => getCompanyHistory(LIMIT),
    refetchInterval: 15_000,
  });

  const snapshots: CompanyTickSnapshot[] = data?.snapshots ?? [];
  const sorted = [...snapshots].reverse();

  const latest = sorted[sorted.length - 1];
  const prev   = sorted[sorted.length - 2];

  const sum = (key: keyof CompanyTickSnapshot) =>
    snapshots.reduce((s, r) => s + (r[key] as number), 0);

  const totalStoreRev    = sum('store_revenue_cents');
  const totalSupplySales = sum('supply_line_sales_cents');
  const totalRevenue     = sum('total_revenue_cents');
  const totalConTax      = sum('consumer_tax_cents');
  const totalLandTax     = sum('land_tax_cents');
  const totalSupplyBuys  = sum('supply_purchases_cents');
  const totalMarketing   = sum('marketing_spend_cents');
  const totalResearch    = sum('research_spend_cents');
  const totalLoanInt     = sum('loan_interest_cents');
  const totalTransport   = sum('transport_fees_cents');
  const totalExpenses    = sum('total_expenses_cents');
  const totalProfit      = sum('net_profit_cents');

  const chartData = sorted.map((s) => ({
    tick:     s.tick,
    Balance:  s.balance_after_tick,
    Revenue:  s.total_revenue_cents,
    Expenses: s.total_expenses_cents,
    Profit:   s.net_profit_cents,
  }));

  const balDelta = latest && prev
    ? latest.balance_after_tick - prev.balance_after_tick
    : null;

  if (isLoading) return <div className="text-gray-600 text-sm animate-pulse">Loading performance data…</div>;
  if (error)     return <div className="text-rose-400 text-sm">Failed to load performance data.</div>;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Income Statement</h1>
          <p className="text-xs text-gray-500 mt-0.5">Last {snapshots.length} days · refreshes every 15 s</p>
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-2xl font-bold font-mono tabular-nums text-gray-900">
              {dollar(latest.balance_after_tick)}
            </p>
            {balDelta !== null && (
              <p className={`text-xs font-mono ${balDelta >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {balDelta >= 0 ? '▲' : '▼'} {dollar(Math.abs(balDelta))} vs prev day
              </p>
            )}
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Current Balance</p>
          </div>
        )}
      </div>

      {snapshots.length === 0 && (
        <p className="text-gray-600 text-sm">No day data yet — wait for the next game day to see data.</p>
      )}

      {snapshots.length > 0 && (
        <div className="flex gap-6 items-start">

          {/* ── Left: P&L + ledger ─────────────────────────────────────── */}
          <div className="min-w-0 flex-1 space-y-6">

            {/* Income statement table */}
            <div className="bg-gray-200 border border-gray-200 rounded-lg p-5">
              <table className="w-full">
                <tbody>
                  <SectionLabel label="Revenue" />
                  <Row label="Store Sales"         value={totalStoreRev}    indent />
                  <Row label="Supply Line Sales"   value={totalSupplySales} indent />
                  <Divider />
                  <Row label="Total Revenue"       value={totalRevenue}     total />

                  <SectionLabel label="Expenses" />
                  <Row label="Consumer Tax"        value={totalConTax}     indent />
                  <Row label="Land Tax"            value={totalLandTax}    indent />
                  <Row label="Supply Purchases"    value={totalSupplyBuys} indent />
                  <Row label="Marketing"           value={totalMarketing}  indent />
                  <Row label="Research"            value={totalResearch}   indent />
                  <Row label="Loan Interest"       value={totalLoanInt}    indent />
                  <Row label="Transport"           value={totalTransport}  indent />
                  <Divider />
                  <Row label="Total Expenses"      value={totalExpenses}   total />

                  <Divider />
                  <Row label="Net Profit / Loss"   value={totalProfit}     total colorBySign />
                </tbody>
              </table>
            </div>

            {/* Day ledger */}
            <div className="bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-500">Day Ledger</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                      <th className="text-left py-2 px-3 font-medium">Day</th>
                      <th className="text-right py-2 px-3 font-medium">Revenue</th>
                      <th className="text-right py-2 px-3 font-medium">Expenses</th>
                      <th className="text-right py-2 px-3 font-medium">Net Profit</th>
                      <th className="text-right py-2 px-3 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr
                        key={s.tick}
                        className="border-b border-gray-200 hover:bg-gray-100/40 transition-colors"
                      >
                        <td className="py-1.5 px-3 text-gray-600 tabular-nums">{s.tick}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums font-mono text-gray-700">{fmtMoney(s.total_revenue_cents)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums font-mono text-gray-700">{fmtMoney(s.total_expenses_cents)}</td>
                        <td className={`py-1.5 px-3 text-right tabular-nums font-mono font-medium ${s.net_profit_cents >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                          {fmtMoney(s.net_profit_cents)}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums font-mono text-gray-700">{fmtMoney(s.balance_after_tick)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Right: Charts ────────────────────────────────────────────── */}
          {chartData.length > 0 && (
            <div className="w-[640px] shrink-0 space-y-4">

              {/* Balance */}
              <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">Balance</p>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="tick" tick={{ fill: C.tick, fontSize: 9 }} />
                    <YAxis tickFormatter={shortDollar} tick={{ fill: C.tick, fontSize: 9 }} width={50} />
                    <Tooltip content={<ChartTooltip colors={C} />} />
                    <Area type="monotone" dataKey="Balance" stroke="#38bdf8" fill="url(#balGrad)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue vs Expenses */}
              <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">Revenue vs Expenses</p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="tick" tick={{ fill: C.tick, fontSize: 9 }} />
                    <YAxis tickFormatter={shortDollar} tick={{ fill: C.tick, fontSize: 9 }} width={50} />
                    <Tooltip content={<ChartTooltip colors={C} />} />
                    <Bar dataKey="Revenue"  fill="#38bdf8" />
                    <Bar dataKey="Expenses" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Net Profit */}
              <div className="bg-gray-200 border border-gray-200 rounded-lg p-4">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">Net Profit per Day</p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="tick" tick={{ fill: C.tick, fontSize: 9 }} />
                    <YAxis tickFormatter={shortDollar} tick={{ fill: C.tick, fontSize: 9 }} width={50} />
                    <Tooltip content={<ChartTooltip colors={C} />} />
                    <Bar dataKey="Profit" fill="#34d399" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}


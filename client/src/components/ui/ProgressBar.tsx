import React from 'react';

export type ProgressVariant = 'default' | 'research' | 'profit' | 'danger';

export interface ProgressBarProps {
  /** 0–1 fraction. Values outside this range are clamped. */
  value: number;
  variant?: ProgressVariant;
  size?: 'sm' | 'md';
  /** Label rendered on the left above the bar. */
  label?: React.ReactNode;
  /** When true, shows the percentage on the right above the bar. */
  showPct?: boolean;
  className?: string;
}

const FILL: Record<ProgressVariant, string> = {
  default:  'bg-indigo-500',
  research: 'bg-gradient-to-r from-purple-600 to-indigo-500',
  profit:   'bg-emerald-400',
  danger:   'bg-rose-400',
};

const HEIGHT: Record<'sm' | 'md', string> = {
  sm: 'h-1',
  md: 'h-1.5',
};

/**
 * Themed progress bar.
 *
 * @example
 * <ProgressBar value={project.progress} variant="research" label="Grain" showPct />
 * <ProgressBar value={0.7} variant="profit" size="sm" />
 */
export default function ProgressBar({
  value,
  variant  = 'default',
  size     = 'md',
  label,
  showPct  = false,
  className = '',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));

  return (
    <div className={`space-y-1 ${className}`}>
      {(label !== undefined || showPct) && (
        <div className="flex justify-between text-xs text-gray-600">
          {label !== undefined && <span>{label}</span>}
          {showPct && <span className="font-mono">{pct.toFixed(1)}%</span>}
        </div>
      )}
      <div className={`${HEIGHT[size]} bg-gray-200 rounded-full overflow-hidden`}>
        <div
          className={`h-full ${FILL[variant]} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

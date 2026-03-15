import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'paused'
  | 'info'
  | 'research'
  | 'outline';

export interface BadgeProps {
  variant?: BadgeVariant;
  /** Dot-only mode — renders a small filled circle with no label. */
  dot?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const VARIANT: Record<BadgeVariant, string> = {
  default:  'bg-gray-200 text-gray-600',
  success:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  warning:  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  danger:   'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  paused:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  info:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
  research: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  outline:  'border border-gray-300 text-gray-600',
};

const DOT_VARIANT: Record<BadgeVariant, string> = {
  default:  'bg-gray-400',
  success:  'bg-emerald-600 dark:bg-emerald-400',
  warning:  'bg-amber-600 dark:bg-amber-400',
  danger:   'bg-rose-600 dark:bg-rose-400',
  paused:   'bg-yellow-600 dark:bg-yellow-400',
  info:     'bg-indigo-600 dark:bg-indigo-400',
  research: 'bg-purple-600 dark:bg-purple-400',
  outline:  'bg-gray-400',
};

/** Maps building/entity status strings to a BadgeVariant. */
export const BUILDING_STATUS_VARIANT: Record<string, BadgeVariant> = {
  producing:          'success',
  under_construction: 'warning',
  paused:             'paused',
  missing_resources:  'danger',
  idle:               'default',
};

export default function Badge({ variant = 'default', dot = false, children, className = '' }: BadgeProps) {
  if (dot) {
    return (
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${DOT_VARIANT[variant]} ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium ${VARIANT[variant]} ${className}`}>
      {children}
    </span>
  );
}

import React from 'react';

export interface AlertBubbleProps {
  /** The count to display. Renders nothing when ≤ 0. */
  count: number;
  /** Clamp label at this value, showing "N+" above it. Default: 99. */
  max?: number;
  /**
   * 'md' (default) — 18 × 18 px, used as absolute overlay on icon buttons.
   * 'sm' — 14 × 14 px, used inline inside tab labels.
   */
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE = {
  md: 'min-w-[18px] h-[18px] text-[10px] px-1',
  sm: 'min-w-[14px] h-[14px] text-[9px] px-0.5',
};

/**
 * Small notification count badge.
 *
 * Background uses `bg-indigo-500` which maps to the gold accent in the Ledger
 * design system. Text uses `text-gray-900` which inverts correctly in both
 * light and dark mode (near-black on gold in light, near-white on amber in dark).
 *
 * @example
 * // Overlay on a button (absolute positioning via className)
 * <AlertBubble count={unread} className="absolute -top-1.5 -right-1.5" />
 *
 * // Inline inside a tab label
 * <AlertBubble count={unread} size="sm" />
 */
export default function AlertBubble({ count, max = 99, size = 'md', className = '' }: AlertBubbleProps) {
  if (count <= 0) return null;
  const label = count > max ? `${max}+` : String(count);
  return (
    <span
      className={`${SIZE[size]} bg-indigo-500 text-gray-900 font-bold rounded-full inline-flex items-center justify-center leading-none shrink-0 ${className}`}
      aria-label={`${count} unread`}
    >
      {label}
    </span>
  );
}

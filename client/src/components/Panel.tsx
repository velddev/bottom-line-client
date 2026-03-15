import React from 'react';

// ── Variant styles ─────────────────────────────────────────────────────────────
// 'panel'  — frosted-glass floating overlay (default)
// 'card'   — solid inline sub-section card
const STYLES = {
  panel: {
    root:             'bg-gray-900/95 backdrop-blur-sm border border-gray-700 shadow-2xl',
    headerPad:        'px-4 py-3',
    headerBorder:     'border-gray-700',
    subheaderBorder:  'border-gray-700/50',
    subheaderPad:     'px-4 py-2',
    titleCls:         'text-sm',
    footerBorder:     'border-gray-700',
    footerPad:        'px-4 py-2',
    defaultBodyCls:   'p-4 space-y-3',
  },
  card: {
    root:             'bg-gray-900 border border-gray-800',
    headerPad:        'px-3 py-2',
    headerBorder:     'border-gray-800',
    subheaderBorder:  'border-gray-800/50',
    subheaderPad:     'px-3 py-2',
    titleCls:         'text-xs',
    footerBorder:     'border-gray-800',
    footerPad:        'px-3 py-2',
    defaultBodyCls:   'p-3 space-y-3',
  },
} as const;

export type PanelVariant = keyof typeof STYLES;

export interface PanelProps {
  /** Title text or node rendered in the header */
  title?: React.ReactNode;
  /** Called when the × close button is clicked. Omit to hide the close button. */
  onClose?: () => void;
  /** Extra controls rendered to the right of the title (e.g. icon toggle buttons) */
  headerActions?: React.ReactNode;
  /** Secondary info row rendered between header and body */
  subheader?: React.ReactNode;
  /** Sticky action bar fixed to the bottom of the panel */
  footer?: React.ReactNode;
  /** Body content (scrollable) */
  children: React.ReactNode;
  /** Additional classes for the panel root — use for positioning/sizing */
  className?: string;
  /** Override the body container classes. Defaults to the variant default. */
  bodyClassName?: string;
  /** Visual variant. 'panel' = frosted glass overlay; 'card' = solid inline card */
  variant?: PanelVariant;
}

export default function Panel({
  title,
  onClose,
  headerActions,
  subheader,
  footer,
  children,
  className = '',
  bodyClassName,
  variant = 'panel',
}: PanelProps) {
  const s = STYLES[variant];
  const hasHeader = title !== undefined || onClose !== undefined || headerActions !== undefined;

  return (
    <div className={`rounded-lg flex flex-col overflow-hidden ${s.root} ${className}`}>

      {hasHeader && (
        <div className={`${s.headerPad} border-b ${s.headerBorder} flex items-center gap-2 shrink-0`}>
          {title !== undefined && (
            <h2 className={`text-white font-semibold ${s.titleCls} truncate flex-1 flex items-center gap-1.5`}>
              {title}
            </h2>
          )}
          {headerActions && (
            <div className="flex items-center gap-1 shrink-0">{headerActions}</div>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0 transition-colors ml-auto"
            >
              ×
            </button>
          )}
        </div>
      )}

      {subheader !== undefined && (
        <div className={`${s.subheaderPad} border-b ${s.subheaderBorder} shrink-0`}>
          {subheader}
        </div>
      )}

      <div className={`flex-1 overflow-y-auto min-h-0 ${bodyClassName ?? s.defaultBodyCls}`}>
        {children}
      </div>

      {footer !== undefined && (
        <div className={`border-t ${s.footerBorder} ${s.footerPad} shrink-0`}>
          {footer}
        </div>
      )}
    </div>
  );
}

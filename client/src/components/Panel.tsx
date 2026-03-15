import React from 'react';

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
  /** Additional classes for the panel root — use for positioning, sizing, shadow, blur */
  className?: string;
  /** Override the body container classes. Default: 'p-4 space-y-3' */
  bodyClassName?: string;
  /** When true, uses compact header padding (px-3 py-2) and xs title — for nested sub-cards */
  compact?: boolean;
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
  compact = false,
}: PanelProps) {
  const hasHeader = title !== undefined || onClose !== undefined || headerActions !== undefined;
  const headerPad   = compact ? 'px-3 py-2'   : 'px-4 py-3';
  const titleSize   = compact ? 'text-xs'      : 'text-sm';
  const subPad      = compact ? 'px-3 py-1.5'  : 'px-4 py-2';
  const footerPad   = compact ? 'px-3 py-2'    : 'px-4 py-2';
  const defaultBody = compact ? 'p-3 space-y-3' : 'p-4 space-y-3';

  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-lg flex flex-col overflow-hidden ${className}`}>

      {hasHeader && (
        <div className={`${headerPad} border-b border-gray-700 flex items-center gap-2 shrink-0`}>
          {title !== undefined && (
            <h2 className={`text-white font-semibold ${titleSize} truncate flex-1 flex items-center gap-1.5`}>
              {title}
            </h2>
          )}
          {headerActions && (
            <div className="flex items-center gap-1 shrink-0">{headerActions}</div>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-lg leading-none shrink-0 transition-colors ml-auto"
            >
              ×
            </button>
          )}
        </div>
      )}

      {subheader !== undefined && (
        <div className={`${subPad} border-b border-gray-700/50 shrink-0`}>
          {subheader}
        </div>
      )}

      <div className={`flex-1 overflow-y-auto min-h-0 ${bodyClassName ?? defaultBody}`}>
        {children}
      </div>

      {footer !== undefined && (
        <div className={`border-t border-gray-700 ${footerPad} shrink-0`}>
          {footer}
        </div>
      )}
    </div>
  );
}

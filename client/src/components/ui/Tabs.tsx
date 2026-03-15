import React from 'react';

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** Optional count badge rendered beside the label. */
  count?: number;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Underline tab strip. Use for section-level navigation inside a panel or overlay.
 *
 * @example
 * const TABS = [
 *   { value: 'city', label: 'City'  },
 *   { value: 'dm',   label: 'DM', count: unread },
 * ];
 * <Tabs tabs={TABS} value={tab} onChange={setTab} />
 */
export default function Tabs<T extends string>({ tabs, value, onChange, className = '' }: TabsProps<T>) {
  return (
    <div className={`flex border-b border-gray-200 ${className}`} role="tablist">
      {tabs.map(({ value: v, label, count }) => {
        const isActive = v === value;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(v)}
            className={`
              flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors whitespace-nowrap
              ${isActive
                ? 'border-indigo-500 text-gray-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
            `.replace(/\s+/g, ' ').trim()}
          >
            {label}
            {count != null && count > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-gray-900 text-[9px] font-bold flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

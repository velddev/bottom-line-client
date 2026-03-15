import React from 'react';

export interface SectionHeaderProps {
  /** Page or section title. */
  title: React.ReactNode;
  /** Subtitle or context line rendered below the title. */
  sub?: React.ReactNode;
  /** Content rendered flush-right (usually a Button). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent screen-level section header row.
 *
 * @example
 * <SectionHeader
 *   title="Research"
 *   sub="Improve quality to beat the city median."
 *   action={<Button icon={<Plus size={14} />}>Start Research</Button>}
 * />
 */
export default function SectionHeader({ title, sub, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {sub && <p className="text-gray-600 text-sm mt-0.5">{sub}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

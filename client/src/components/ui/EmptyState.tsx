import React from 'react';

export interface EmptyStateProps {
  /** Large emoji rendered as a visual anchor. */
  icon?: string;
  /** Primary message — keep it short and actionable. */
  message: string;
  /** Optional call-to-action rendered below the message (e.g. a Button). */
  action?: React.ReactNode;
  /** Use 'dashed' for areas where content will eventually appear (e.g. empty lists). */
  border?: 'none' | 'dashed';
  className?: string;
}

/**
 * Empty / zero-state placeholder.
 *
 * @example
 * <EmptyState icon="🏗️" message="No buildings yet — buy a tile on the City Map." border="dashed" />
 * <EmptyState icon="🔬" message="No research running." action={<Button onClick={…}>Start Research</Button>} />
 */
export default function EmptyState({ icon, message, action, border = 'none', className = '' }: EmptyStateProps) {
  const borderClass = border === 'dashed'
    ? 'border border-dashed border-gray-300 rounded-lg'
    : '';

  return (
    <div className={`text-center py-10 text-gray-600 ${borderClass} ${className}`}>
      {icon && <p className="text-4xl mb-3">{icon}</p>}
      <p className="text-sm">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

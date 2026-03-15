import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered to the left of the label. */
  icon?: React.ReactNode;
  /** Replaces the label with a spinner and disables interaction. */
  loading?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600 text-gray-900',
  secondary: 'bg-gray-200 hover:bg-gray-300 disabled:bg-gray-200 text-gray-900',
  ghost:     'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 disabled:text-gray-400',
  danger:    'bg-rose-900/40 hover:bg-rose-900/60 disabled:bg-rose-900/30 text-rose-400',
};

const SIZE: Record<ButtonSize, string> = {
  sm:  'px-2.5 py-1   text-xs  rounded gap-1.5',
  md:  'px-3   py-2   text-sm  rounded-md gap-2',
  lg:  'px-4   py-2.5 text-sm  rounded-md gap-2',
};

export default function Button({
  variant  = 'primary',
  size     = 'md',
  icon,
  loading  = false,
  children,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center font-medium transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${VARIANT[variant]} ${SIZE[size]} ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
}

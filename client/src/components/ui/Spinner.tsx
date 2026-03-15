/**
 * Spinner — inline animated loading indicator.
 *
 * @example
 * <Spinner />               // medium, default gold colour
 * <Spinner size="sm" />     // small
 * <Spinner className="text-emerald-400" />  // custom colour
 */
export default function Spinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dim: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'w-3   h-3   border-[1.5px]',
    md: 'w-4   h-4   border-2',
    lg: 'w-5   h-5   border-2',
  };

  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-current border-t-transparent animate-spin ${dim[size]} ${className || 'text-indigo-400'}`}
    />
  );
}

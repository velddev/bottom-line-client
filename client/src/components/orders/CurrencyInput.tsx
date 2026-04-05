export function CurrencyInput({
  value,
  onChange,
  onBlur,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center bg-gray-100 border border-gray-200 rounded focus-within:border-indigo-500 ${className}`}>
      <span className="text-[10px] text-gray-500 pl-1.5 select-none">€</span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-14 px-1 py-0.5 text-xs bg-transparent text-gray-900 outline-none"
      />
    </div>
  );
}

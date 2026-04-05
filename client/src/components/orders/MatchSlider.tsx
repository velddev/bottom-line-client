const MATCH_STEPS = ['lowest_price', 'best_value', 'highest_quality'] as const;
const MATCH_LABELS: Record<string, string> = {
  lowest_price: 'Price',
  best_value: 'Value',
  highest_quality: 'Quality',
};

export function MatchSlider({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const idx = MATCH_STEPS.indexOf(value as typeof MATCH_STEPS[number]);
  const current = idx >= 0 ? idx : 0;

  return (
    <div className="flex items-center gap-0">
      {MATCH_STEPS.map((step, i) => {
        const isActive = i === current;
        return (
          <button
            key={step}
            onClick={() => onChange(step)}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors border ${
              i === 0 ? 'rounded-l' : i === MATCH_STEPS.length - 1 ? 'rounded-r' : ''
            } ${
              isActive
                ? 'bg-indigo-600 text-gray-900 border-indigo-600'
                : 'bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-300'
            }`}
          >
            {MATCH_LABELS[step]}
          </button>
        );
      })}
    </div>
  );
}

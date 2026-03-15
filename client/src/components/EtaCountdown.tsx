import { useState, useEffect } from 'react';

interface Props {
  /** Number of game ticks remaining (1 tick = 60 s). */
  ticks: number;
  /** Epoch ms when the next tick fires (from useTickRefresh). */
  nextTickAt: number;
  className?: string;
}

/** Live countdown that re-renders every second until the building is ready. */
export default function EtaCountdown({ ticks, nextTickAt, className }: Props) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (ticks <= 0) return null;

  const secsUntilNextTick = Math.max(0, Math.ceil((nextTickAt - Date.now()) / 1000));
  const totalSecs = Math.max(0, (ticks - 1) * 60 + secsUntilNextTick);

  const label =
    totalSecs === 0
      ? 'almost done'
      : totalSecs < 60
      ? `${totalSecs}s`
      : `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`;

  return (
    <span className={className ?? 'text-amber-400 text-xs font-mono'}>
      {label}
    </span>
  );
}

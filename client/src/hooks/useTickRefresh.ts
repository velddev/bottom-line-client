import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth';

const TICK_INTERVAL_MS = 60_000;

/**
 * Opens a single SSE connection for the current session and invalidates
 * React Query caches whenever the server fires a tickCompleted event.
 * Returns nextTickAt (epoch ms) so callers can render a countdown.
 * Mount this once in Layout so all screens stay fresh.
 */
export function useTickRefresh() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  // Seed with a rough estimate; corrected to exact timing on every real tick event.
  const [nextTickAt, setNextTickAt] = useState<number>(() => Date.now() + TICK_INTERVAL_MS);

  useEffect(() => {
    if (!auth?.api_key || !auth?.city_id) return;

    const es = new EventSource(
      `/api/events/stream?api_key=${encodeURIComponent(auth.api_key)}&city_id=${encodeURIComponent(auth.city_id)}`
    );

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data as string);
        if (evt.tickCompleted) {
          setNextTickAt(Date.now() + TICK_INTERVAL_MS);
          queryClient.invalidateQueries({ queryKey: ['buildings'] });
          queryClient.invalidateQueries({ queryKey: ['city'] });
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['research'] });
          queryClient.invalidateQueries({ queryKey: ['market-share'] });
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do
    };

    return () => es.close();
  }, [auth?.api_key, auth?.city_id, queryClient]);

  return { nextTickAt };
}

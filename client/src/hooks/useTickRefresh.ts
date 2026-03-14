import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth';

/**
 * Opens a single SSE connection for the current session and invalidates
 * React Query caches whenever the server fires a tickCompleted event.
 * Mount this once in Layout so all screens stay fresh.
 */
export function useTickRefresh() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!auth?.api_key || !auth?.city_id) return;

    const es = new EventSource(
      `/api/events/stream?api_key=${encodeURIComponent(auth.api_key)}&city_id=${encodeURIComponent(auth.city_id)}`
    );

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data as string);
        if (evt.tickCompleted) {
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
}

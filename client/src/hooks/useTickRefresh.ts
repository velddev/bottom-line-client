import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth';
import { api } from '../api';

const TICK_INTERVAL_MS = 60_000;

/**
 * Subscribes to the game event stream for the current session and invalidates
 * React Query caches whenever the server fires a tick_completed event.
 * Returns nextTickAt (epoch ms) so callers can render a countdown.
 * Mount this once in Layout so all screens stay fresh.
 */
export function useTickRefresh() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [nextTickAt, setNextTickAt] = useState<number>(() => Date.now() + TICK_INTERVAL_MS);

  useEffect(() => {
    if (!auth?.api_key || !auth?.city_id) return;

    const unsubscribe = api.subscribeToEvents(auth.city_id, auth.api_key, (evt) => {
      if (evt.tick_completed) {
        setNextTickAt(Date.now() + TICK_INTERVAL_MS);
        queryClient.invalidateQueries({ queryKey: ['buildings'] });
        queryClient.invalidateQueries({ queryKey: ['city'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['research'] });
        queryClient.invalidateQueries({ queryKey: ['market-share'] });
      }
    });

    return unsubscribe;
  }, [auth?.api_key, auth?.city_id, queryClient]);

  return { nextTickAt };
}

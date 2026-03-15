import { useState, useCallback, useEffect } from 'react';

export type ColorMode = 'dark' | 'light';

/**
 * Reads and writes the current color mode.
 * Syncs with the `dark` class on <html> and localStorage('bl-theme').
 */
export function useTheme() {
  const [mode, setMode] = useState<ColorMode>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const applyMode = useCallback((next: ColorMode) => {
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('bl-theme', next);
    setMode(next);
  }, []);

  return { mode, applyMode };
}

/**
 * Reactive color mode observer — re-renders the consumer whenever the
 * `dark` class on <html> changes (e.g. after the user switches themes).
 */
export function useColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMode(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

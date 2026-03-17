import { useEffect, useState, useRef } from 'react';
import { DefaultLoadingManager } from 'three';
import { useGLTF } from '@react-three/drei';
import { ALL_PRELOAD_URLS } from '../preloadManifest';

/** Kick off all preloads at module level so they start immediately */
ALL_PRELOAD_URLS.forEach(u => useGLTF.preload(u));

interface Props {
  onReady: () => void;
}

export default function PreloadScreen({ onReady }: Props) {
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const readyFired = useRef(false);

  useEffect(() => {
    const prevOnProgress = DefaultLoadingManager.onProgress;
    const prevOnLoad = DefaultLoadingManager.onLoad;

    DefaultLoadingManager.onProgress = (_url, itemsLoaded, itemsTotal) => {
      setLoaded(itemsLoaded);
      setTotal(itemsTotal);
      setProgress(Math.round((itemsLoaded / itemsTotal) * 100));
    };

    DefaultLoadingManager.onLoad = () => {
      setProgress(100);
      if (!readyFired.current) {
        readyFired.current = true;
        // Small delay for the bar to visually reach 100%
        setTimeout(onReady, 300);
      }
    };

    // If no items to load (all cached), fire immediately
    const checkTimer = setTimeout(() => {
      if (!readyFired.current && progress === 0) {
        readyFired.current = true;
        onReady();
      }
    }, 3000);

    return () => {
      DefaultLoadingManager.onProgress = prevOnProgress;
      DefaultLoadingManager.onLoad = prevOnLoad;
      clearTimeout(checkTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-100 flex flex-col items-center justify-center gap-6">
      {/* Logo */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-indigo-400 font-bold text-2xl tracking-[0.25em]">VENTURED</span>
        <span className="text-gray-500 text-xs tracking-wide">Loading city assets…</span>
      </div>

      {/* Progress bar */}
      <div className="w-64 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress text */}
      <span className="text-gray-500 text-xs font-mono tabular-nums">
        {total > 0 ? `${loaded} / ${total}` : 'Initializing…'}
      </span>
    </div>
  );
}

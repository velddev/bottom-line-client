import { useEffect, useState, useRef, useCallback } from 'react';
import { DefaultLoadingManager } from 'three';
import { useGLTF } from '@react-three/drei';
import { ALL_PRELOAD_URLS } from '../preloadManifest';

interface Props {
  onReady: () => void;
}

export default function PreloadScreen({ onReady }: Props) {
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const readyFired = useRef(false);

  const markReady = useCallback(() => {
    if (!readyFired.current) {
      readyFired.current = true;
      setTimeout(onReady, 300);
    }
  }, [onReady]);

  useEffect(() => {
    // Install handlers BEFORE triggering preloads
    const prevOnProgress = DefaultLoadingManager.onProgress;
    const prevOnLoad = DefaultLoadingManager.onLoad;

    DefaultLoadingManager.onProgress = (_url, itemsLoaded, itemsTotal) => {
      setLoaded(itemsLoaded);
      setTotal(itemsTotal);
      setProgress(Math.round((itemsLoaded / itemsTotal) * 100));
    };

    DefaultLoadingManager.onLoad = () => {
      setProgress(100);
      markReady();
    };

    // Now trigger the preloads (after handlers are installed)
    ALL_PRELOAD_URLS.forEach(u => useGLTF.preload(u));

    // Fallback: if all assets are cached and onLoad fires synchronously or before effect
    const checkTimer = setTimeout(() => {
      if (!readyFired.current) markReady();
    }, 5000);

    return () => {
      DefaultLoadingManager.onProgress = prevOnProgress;
      DefaultLoadingManager.onLoad = prevOnLoad;
      clearTimeout(checkTimer);
    };
  }, [markReady]);

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-100 flex flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-indigo-400 font-bold text-2xl tracking-[0.25em]">VENTURED</span>
        <span className="text-gray-500 text-xs tracking-wide">Loading city assets…</span>
      </div>

      <div className="w-64 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className="text-gray-500 text-xs font-mono tabular-nums">
        {total > 0 ? `${loaded} / ${total}` : 'Initializing…'}
      </span>
    </div>
  );
}

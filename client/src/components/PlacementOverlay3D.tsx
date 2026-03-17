import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { TilePlacementScore } from '../utils/tilePlacement';
import { tileToWorld, GAME_GRID } from './cityGrid';

interface Props {
  heatmap: TilePlacementScore[];
}

const CHUNK = 20; // tiles per chunk side
const CHUNKS_PER_AXIS = GAME_GRID / CHUNK; // 6

// Compute world-space bounds for a chunk (inclusive of tile width)
function chunkWorldBounds(cx: number, cy: number) {
  const tMinX = cx * CHUNK;
  const tMinY = cy * CHUNK;
  const tMaxX = Math.min(tMinX + CHUNK - 1, GAME_GRID - 1);
  const tMaxY = Math.min(tMinY + CHUNK - 1, GAME_GRID - 1);
  const [wMinX, wMinZ] = tileToWorld(tMinX, tMinY);
  const [wMaxX, wMaxZ] = tileToWorld(tMaxX, tMaxY);
  return { wMinX, wMinZ, wMaxX: wMaxX + 1, wMaxZ: wMaxZ + 1 };
}

// Build a canvas texture sized to the chunk's world extent.
// Each pixel = 1 world unit. Tiles paint at their correct world-relative position.
function buildChunkTexture(
  cx: number,
  cy: number,
  bounds: ReturnType<typeof chunkWorldBounds>,
  tileScores: Map<string, number>,
): THREE.CanvasTexture | null {
  const canvasW = bounds.wMaxX - bounds.wMinX;
  const canvasH = bounds.wMaxZ - bounds.wMinZ;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvasW, canvasH);

  const tMinX = cx * CHUNK;
  const tMinY = cy * CHUNK;
  let painted = false;

  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const gx = tMinX + tx;
      const gy = tMinY + ty;
      const key = `${gx}_${gy}`;
      const norm = tileScores.get(key);
      if (norm === undefined) continue;

      const [wx, wz] = tileToWorld(gx, gy);
      const px = Math.round(wx - bounds.wMinX);
      const py = Math.round(wz - bounds.wMinZ);
      if (px < 0 || px >= canvasW || py < 0 || py >= canvasH) continue;

      const hue = Math.round(norm * 120); // 0°=red → 120°=green
      ctx.fillStyle = `hsla(${hue}, 85%, 55%, 0.55)`;
      ctx.fillRect(px, py, 1, 1);
      painted = true;
    }
  }

  if (!painted) return null;

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export default function PlacementOverlay3D({ heatmap }: Props) {
  const tileScores = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of heatmap) {
      map.set(`${entry.tile.grid_x}_${entry.tile.grid_y}`, entry.normalized);
    }
    return map;
  }, [heatmap]);

  const chunks = useMemo(() => {
    const result: { key: string; bounds: ReturnType<typeof chunkWorldBounds>; texture: THREE.CanvasTexture }[] = [];
    for (let cy = 0; cy < CHUNKS_PER_AXIS; cy++) {
      for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
        const bounds = chunkWorldBounds(cx, cy);
        const texture = buildChunkTexture(cx, cy, bounds, tileScores);
        if (!texture) continue;
        result.push({ key: `${cx}_${cy}`, bounds, texture });
      }
    }
    return result;
  }, [tileScores]);

  // Dispose old GPU textures when chunks change or on unmount
  const prevTexturesRef = useRef<THREE.CanvasTexture[]>([]);
  useEffect(() => {
    prevTexturesRef.current.forEach(t => t.dispose());
    prevTexturesRef.current = chunks.map(c => c.texture);
    return () => { prevTexturesRef.current.forEach(t => t.dispose()); };
  }, [chunks]);

  return (
    <group>
      {chunks.map(({ key, bounds, texture }) => {
        const w = bounds.wMaxX - bounds.wMinX;
        const h = bounds.wMaxZ - bounds.wMinZ;
        return (
          <mesh
            key={key}
            position={[bounds.wMinX + w / 2, 0.025, bounds.wMinZ + h / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => {}}
          >
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial
              map={texture}
              transparent
              depthWrite={false}
              toneMapped={false}
              side={THREE.FrontSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

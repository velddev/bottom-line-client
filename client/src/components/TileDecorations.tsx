import { useRef, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { tileToWorld, GAME_GRID, RENDER_CHUNK, CHUNKS_PER_AXIS } from './cityGrid';

// Seeded PRNG for deterministic decoration placement
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const _tempMatrix = new THREE.Matrix4();
const _tempScale = new THREE.Vector3();

interface DecoPlacement {
  wx: number;
  wz: number;
  gx: number;
  gy: number;
  rotation: number;
  scale: number;
}

// Pre-compute decoration placements with grid coordinates for chunking
function computeDecorations(density: number, seed: number): DecoPlacement[] {
  const rng = mulberry32(seed);
  const placements: DecoPlacement[] = [];

  for (let gx = 0; gx < GAME_GRID; gx++) {
    for (let gy = 0; gy < GAME_GRID; gy++) {
      if (rng() > density) continue;
      const [wx, wz] = tileToWorld(gx, gy);
      placements.push({
        wx: wx + 0.15 + rng() * 0.7,
        wz: wz + 0.15 + rng() * 0.7,
        gx, gy,
        rotation: rng() * Math.PI * 2,
        scale: 0.25 + rng() * 0.35,
      });
    }
  }
  return placements;
}

// Group placements into chunks
function chunkPlacements(placements: DecoPlacement[]): Map<string, DecoPlacement[]> {
  const chunks = new Map<string, DecoPlacement[]>();
  for (const p of placements) {
    const cx = Math.floor(p.gx / RENDER_CHUNK);
    const cy = Math.floor(p.gy / RENDER_CHUNK);
    const key = `${cx}_${cy}`;
    let arr = chunks.get(key);
    if (!arr) { arr = []; chunks.set(key, arr); }
    arr.push(p);
  }
  return chunks;
}

/** Extract all meshes with baked transforms */
function extractMeshes(scene: THREE.Group) {
  const results: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }> = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry.clone();
      mesh.updateWorldMatrix(true, false);
      geo.applyMatrix4(mesh.matrixWorld);
      results.push({ geometry: geo, material: mesh.material });
    }
  });
  return results;
}

function DecoChunk({
  parts,
  bounds,
  placements,
}: {
  parts: ReturnType<typeof extractMeshes>;
  bounds: THREE.Box3;
  placements: DecoPlacement[];
}) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const { invalidate } = useThree();

  useEffect(() => {
    if (parts.length === 0) return;

    const cx = (bounds.max.x + bounds.min.x) / 2;
    const cz = (bounds.max.z + bounds.min.z) / 2;

    meshRefs.current.forEach(mesh => {
      if (!mesh) return;

      placements.forEach((p, i) => {
        _tempMatrix.identity();
        _tempMatrix.makeRotationY(p.rotation);
        _tempMatrix.scale(_tempScale.set(p.scale, p.scale, p.scale));
        _tempMatrix.setPosition(
          p.wx - cx * p.scale,
          -bounds.min.y * p.scale + 0.06,
          p.wz - cz * p.scale,
        );
        mesh.setMatrixAt(i, _tempMatrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    invalidate();
  }, [placements, parts, bounds, invalidate]);

  if (parts.length === 0 || placements.length === 0) return null;

  return (
    <>
      {parts.map((part, idx) => (
        <instancedMesh
          name="Decoration"
          key={idx}
          ref={el => { meshRefs.current[idx] = el; }}
          args={[part.geometry, part.material, placements.length]}
        />
      ))}
    </>
  );
}

// Preload
useGLTF.preload('/models/buildings/farm/grass.glb');

export default function TileDecorations() {
  const { scene } = useGLTF('/models/buildings/farm/grass.glb');
  const parts = useMemo(() => extractMeshes(scene), [scene]);

  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    parts.forEach(p => {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    });
    return box;
  }, [parts]);

  const grassPlacements = useMemo(() => computeDecorations(0.25, 42), []);
  const chunks = useMemo(() => chunkPlacements(grassPlacements), [grassPlacements]);

  const chunkKeys = useMemo(() => {
    const keys: string[] = [];
    for (let cy = 0; cy < CHUNKS_PER_AXIS; cy++) {
      for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
        keys.push(`${cx}_${cy}`);
      }
    }
    return keys;
  }, []);

  return (
    <group>
      {chunkKeys.map(key => {
        const placements = chunks.get(key);
        if (!placements || placements.length === 0) return null;
        return (
          <DecoChunk
            key={key}
            parts={parts}
            bounds={bounds}
            placements={placements}
          />
        );
      })}
    </group>
  );
}

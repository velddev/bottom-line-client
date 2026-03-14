import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { tileToWorld, GAME_GRID } from './cityGrid';

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

interface DecoPlacement {
  wx: number;
  wz: number;
  rotation: number;
  scale: number;
}

// Pre-compute decoration placements
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
        rotation: rng() * Math.PI * 2,
        scale: 0.25 + rng() * 0.35,
      });
    }
  }
  return placements;
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

function DecoInstances({
  modelPath,
  placements,
}: {
  modelPath: string;
  placements: DecoPlacement[];
}) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const { scene } = useGLTF(modelPath);
  const parts = useMemo(() => extractMeshes(scene), [scene]);

  // Compute bounding box for centering
  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    parts.forEach(p => {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    });
    return box;
  }, [parts]);

  useEffect(() => {
    if (parts.length === 0) return;

    const cx = (bounds.max.x + bounds.min.x) / 2;
    const cz = (bounds.max.z + bounds.min.z) / 2;

    meshRefs.current.forEach(mesh => {
      if (!mesh) return;

      placements.forEach((p, i) => {
        _tempMatrix.identity();
        _tempMatrix.makeRotationY(p.rotation);
        _tempMatrix.scale(new THREE.Vector3(p.scale, p.scale, p.scale));
        _tempMatrix.setPosition(
          p.wx - cx * p.scale,
          -bounds.min.y * p.scale,
          p.wz - cz * p.scale,
        );
        mesh.setMatrixAt(i, _tempMatrix);
      });

      for (let i = placements.length; i < mesh.count; i++) {
        _tempMatrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _tempMatrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [placements, parts, bounds]);

  if (parts.length === 0 || placements.length === 0) return null;

  const count = Math.max(placements.length, 1);

  return (
    <group>
      {parts.map((part, idx) => (
        <instancedMesh
          key={idx}
          ref={el => { meshRefs.current[idx] = el; }}
          args={[part.geometry, part.material, count]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

// Preload
useGLTF.preload('/models/buildings/farm/grass.glb');
useGLTF.preload('/models/buildings/farm/patch-grass.glb');

export default function TileDecorations() {
  // Grass tufts (~25% of tiles)
  const grassPlacements = useMemo(() => computeDecorations(0.25, 42), []);
  // Ground patches (~12% of tiles)
  const patchPlacements = useMemo(() => computeDecorations(0.12, 137), []);

  return (
    <group>
      <DecoInstances
        modelPath="/models/buildings/farm/grass.glb"
        placements={grassPlacements}
      />
      <DecoInstances
        modelPath="/models/buildings/farm/patch-grass.glb"
        placements={patchPlacements}
      />
    </group>
  );
}

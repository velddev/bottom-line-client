import { useRef, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { GAME_GRID, WORLD_SIZE, CHUNKS_PER_AXIS, tileToWorld } from './cityGrid';

const HEDGE_MODEL = '/models/nature/hedge.glb';
const HEDGE_SX = 1.0;
const HEDGE_SY = 0.8;
const HEDGE_SZ = 1.0;
const CHUNK_WORLD = WORLD_SIZE / CHUNKS_PER_AXIS;

function extractMesh(scene: THREE.Group) {
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

interface Placement { x: number; z: number; rot: number }

function computeBorderPlacements(): Placement[] {
  const placements: Placement[] = [];

  const [startX] = tileToWorld(0, 0);
  const [endX] = tileToWorld(GAME_GRID - 1, 0);
  const [, startZ] = tileToWorld(0, 0);
  const [, endZ] = tileToWorld(0, GAME_GRID - 1);

  const xMin = startX;
  const xMax = endX + 1;
  const zMin = startZ;
  const zMax = endZ + 1;
  const off = 0.15;

  // North edge (rotated PI/2 so model runs along X)
  for (let x = xMin; x < xMax; x++) {
    placements.push({ x: x + 0.5, z: zMin - off, rot: Math.PI / 2 });
  }
  // South edge
  for (let x = xMin; x < xMax; x++) {
    placements.push({ x: x + 0.5, z: zMax + off, rot: Math.PI / 2 });
  }
  // West edge (rot=0, model runs along Z)
  for (let z = zMin; z < zMax; z++) {
    placements.push({ x: xMin - off, z: z + 0.5, rot: 0 });
  }
  // East edge
  for (let z = zMin; z < zMax; z++) {
    placements.push({ x: xMax + off, z: z + 0.5, rot: 0 });
  }

  // Corner pieces — one hedge at each corner to seal the gap
  placements.push({ x: xMin - off, z: zMin - off, rot: Math.PI / 4 });   // NW
  placements.push({ x: xMax + off, z: zMin - off, rot: -Math.PI / 4 });  // NE
  placements.push({ x: xMin - off, z: zMax + off, rot: 3 * Math.PI / 4 }); // SW
  placements.push({ x: xMax + off, z: zMax + off, rot: -3 * Math.PI / 4 }); // SE

  return placements;
}

const _m = new THREE.Matrix4();
const _center = new THREE.Matrix4();
const _scale = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _pos = new THREE.Matrix4();

useGLTF.preload(HEDGE_MODEL);

function chunkBorder(placements: Placement[]): Map<string, Placement[]> {
  const chunks = new Map<string, Placement[]>();
  for (const p of placements) {
    const cx = Math.min(Math.floor(p.x / CHUNK_WORLD), CHUNKS_PER_AXIS - 1);
    const cz = Math.min(Math.floor(p.z / CHUNK_WORLD), CHUNKS_PER_AXIS - 1);
    const key = `${Math.max(0, cx)}_${Math.max(0, cz)}`;
    let arr = chunks.get(key);
    if (!arr) { arr = []; chunks.set(key, arr); }
    arr.push(p);
  }
  return chunks;
}

function BorderChunk({ placements, parts, bounds }: {
  placements: Placement[];
  parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }>;
  bounds: THREE.Box3;
}) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const { invalidate } = useThree();

  useEffect(() => {
    if (parts.length === 0 || placements.length === 0) return;

    const cx = (bounds.max.x + bounds.min.x) / 2;
    const cy = bounds.min.y;
    const cz = (bounds.max.z + bounds.min.z) / 2;

    meshRefs.current.forEach(mesh => {
      if (!mesh) return;
      placements.forEach((p, i) => {
        _center.makeTranslation(-cx, -cy, -cz);
        _scale.makeScale(HEDGE_SX, HEDGE_SY, HEDGE_SZ);
        _rot.makeRotationY(p.rot);
        _pos.makeTranslation(p.x, 0, p.z);
        _m.copy(_pos).multiply(_rot).multiply(_scale).multiply(_center);
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    invalidate();
  }, [placements, parts, bounds, invalidate]);

  return (
    <>
      {parts.map((part, idx) => (
        <instancedMesh
          name="MapBorder"
          key={idx}
          ref={el => { meshRefs.current[idx] = el; }}
          args={[part.geometry, part.material, placements.length]}
        />
      ))}
    </>
  );
}

export default function MapBorder() {
  const { scene } = useGLTF(HEDGE_MODEL) as any;
  const parts = useMemo(() => extractMesh(scene), [scene]);
  const placements = useMemo(() => computeBorderPlacements(), []);

  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    parts.forEach(p => {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    });
    return box;
  }, [parts]);

  const chunks = useMemo(() => chunkBorder(placements), [placements]);

  if (parts.length === 0 || placements.length === 0) return null;

  return (
    <group>
      {Array.from(chunks.entries()).map(([key, chunkPlacements]) => (
        <BorderChunk
          key={key}
          placements={chunkPlacements}
          parts={parts}
          bounds={bounds}
        />
      ))}
    </group>
  );
}

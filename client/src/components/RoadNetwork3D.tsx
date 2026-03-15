import { useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { computeRoadPlacements, type RoadPlacement, WORLD_SIZE, CHUNKS_PER_AXIS } from './cityGrid';

const ROAD_MODELS = {
  straight: '/models/roads/road-straight.glb',
  crossroad: '/models/roads/road-crossroad.glb',
};

Object.values(ROAD_MODELS).forEach((url) => useGLTF.preload(url));

const CHUNK_WORLD = WORLD_SIZE / CHUNKS_PER_AXIS;

function extractMesh(scene: THREE.Group): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
  let found: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;
  scene.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) {
      found = { geometry: child.geometry, material: child.material as THREE.Material };
    }
  });
  return found;
}

/** Bucket road placements into chunks by world position */
function chunkRoads(placements: RoadPlacement[]): Map<string, RoadPlacement[]> {
  const chunks = new Map<string, RoadPlacement[]>();
  for (const p of placements) {
    const cx = Math.min(Math.floor(p.x / CHUNK_WORLD), CHUNKS_PER_AXIS - 1);
    const cz = Math.min(Math.floor(p.z / CHUNK_WORLD), CHUNKS_PER_AXIS - 1);
    const key = `${cx}_${cz}`;
    let arr = chunks.get(key);
    if (!arr) { arr = []; chunks.set(key, arr); }
    arr.push(p);
  }
  return chunks;
}

function RoadChunk({ placements, modelUrl }: { placements: RoadPlacement[]; modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const meshData = useMemo(() => extractMesh(scene), [scene]);
  const { invalidate } = useThree();

  useEffect(() => {
    if (!meshRef.current || placements.length === 0) return;

    const rotM = new THREE.Matrix4();
    const posM = new THREE.Matrix4();
    const mat = new THREE.Matrix4();

    placements.forEach((p, i) => {
      rotM.makeRotationY(p.rotation);
      posM.makeTranslation(p.x + 0.5, 0.001, p.z + 0.5);
      mat.multiplyMatrices(posM, rotM);
      meshRef.current!.setMatrixAt(i, mat);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
    invalidate();
  }, [placements, invalidate]);

  if (!meshData || placements.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[meshData.geometry, meshData.material, placements.length]}
      receiveShadow
    />
  );
}

export default function RoadNetwork3D() {
  const { straights, crossroads } = useMemo(() => computeRoadPlacements(), []);
  const straightChunks = useMemo(() => chunkRoads(straights), [straights]);
  const crossroadChunks = useMemo(() => chunkRoads(crossroads), [crossroads]);

  const chunkKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const k of straightChunks.keys()) keys.add(k);
    for (const k of crossroadChunks.keys()) keys.add(k);
    return Array.from(keys);
  }, [straightChunks, crossroadChunks]);

  return (
    <group>
      {chunkKeys.map(key => {
        const sp = straightChunks.get(key);
        const cp = crossroadChunks.get(key);
        return (
          <group key={key}>
            {sp && sp.length > 0 && (
              <RoadChunk placements={sp} modelUrl={ROAD_MODELS.straight} />
            )}
            {cp && cp.length > 0 && (
              <RoadChunk placements={cp} modelUrl={ROAD_MODELS.crossroad} />
            )}
          </group>
        );
      })}
    </group>
  );
}

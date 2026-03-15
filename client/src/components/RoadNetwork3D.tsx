import { useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { computeRoadPlacements, type RoadPlacement, WORLD_SIZE, CHUNKS_PER_AXIS } from './cityGrid';

const CHUNK_WORLD = WORLD_SIZE / CHUNKS_PER_AXIS;

// Simple procedural road geometry: flat plane, 2 tris each (was 44/116 from GLTF)
const ROAD_COLOR = '#4a4f5c';
const roadGeometry = new THREE.PlaneGeometry(1, 1);
roadGeometry.rotateX(-Math.PI / 2); // lay flat
const roadMaterial = new THREE.MeshStandardMaterial({
  color: ROAD_COLOR,
  roughness: 0.9,
  metalness: 0.0,
});

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

function RoadChunk({ placements, type }: { placements: RoadPlacement[]; type: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    if (!meshRef.current || placements.length === 0) return;

    const mat = new THREE.Matrix4();

    placements.forEach((p, i) => {
      mat.makeTranslation(p.x + 0.5, 0.001, p.z + 0.5);
      meshRef.current!.setMatrixAt(i, mat);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
    invalidate();
  }, [placements, invalidate]);

  if (placements.length === 0) return null;

  return (
    <instancedMesh
      name={`Road-${type}`}
      ref={meshRef}
      args={[roadGeometry, roadMaterial, placements.length]}
      receiveShadow
    />
  );
}

export default function RoadNetwork3D() {
  const { straights, crossroads } = useMemo(() => computeRoadPlacements(), []);

  // Merge all road placements and chunk them together (same geometry now)
  const allRoads = useMemo(() => [...straights, ...crossroads], [straights, crossroads]);
  const chunks = useMemo(() => chunkRoads(allRoads), [allRoads]);

  return (
    <group>
      {Array.from(chunks.entries()).map(([key, placements]) => (
        <RoadChunk key={key} placements={placements} type="road" />
      ))}
    </group>
  );
}

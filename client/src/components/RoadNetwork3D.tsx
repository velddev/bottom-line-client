import { useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { computeRoadPlacements, type RoadPlacement } from './cityGrid';
import { getRoadNetwork } from '../api';

const ROAD_MODELS = {
  straight: '/models/roads/road-straight.glb',
  crossroad: '/models/roads/road-crossroad.glb',
};

Object.values(ROAD_MODELS).forEach((url) => useGLTF.preload(url));

// Extract first mesh geometry & material from a GLTF scene
function extractMesh(scene: THREE.Group): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
  let found: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;
  scene.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) {
      found = { geometry: child.geometry, material: child.material as THREE.Material };
    }
  });
  return found;
}

function RoadInstancedMesh({ placements, modelUrl }: { placements: RoadPlacement[]; modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const meshData = useMemo(() => extractMesh(scene), [scene]);

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
  }, [placements]);

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
  const { data: serverRoads } = useQuery({
    queryKey: ['road-network'],
    queryFn: getRoadNetwork,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Fallback to local computation until the server responds
  const localRoads = useMemo(() => computeRoadPlacements(), []);

  const { straights, crossroads } = useMemo(() => {
    if (serverRoads) {
      const straights: RoadPlacement[] = [];
      const crossroads: RoadPlacement[] = [];
      for (const t of serverRoads.tiles) {
        const p: RoadPlacement = { x: t.world_x, z: t.world_z, rotation: t.rotation };
        if (t.road_type === 'crossroad') crossroads.push(p);
        else straights.push(p);
      }
      return { straights, crossroads };
    }
    return localRoads;
  }, [serverRoads, localRoads]);

  return (
    <group>
      <RoadInstancedMesh placements={straights} modelUrl={ROAD_MODELS.straight} />
      <RoadInstancedMesh placements={crossroads} modelUrl={ROAD_MODELS.crossroad} />
    </group>
  );
}

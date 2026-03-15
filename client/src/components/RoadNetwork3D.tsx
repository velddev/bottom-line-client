import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { computeRoadPlacements, type RoadPlacement } from './cityGrid';

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
      frustumCulled={false}
    />
  );
}

export default function RoadNetwork3D() {
  const { straights, crossroads } = useMemo(() => computeRoadPlacements(), []);

  return (
    <group>
      <RoadInstancedMesh placements={straights} modelUrl={ROAD_MODELS.straight} />
      <RoadInstancedMesh placements={crossroads} modelUrl={ROAD_MODELS.crossroad} />
    </group>
  );
}

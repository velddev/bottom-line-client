import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { tileToWorld } from './cityGrid';

interface ModelMapping {
  path: string;
  scale: number;
  yOffset: number;
}

const MODEL_MAP: Record<string, ModelMapping> = {
  factory:             { path: '/models/buildings/industrial/building-a.glb',             scale: 0.5, yOffset: 0 },
  store:               { path: '/models/buildings/commercial/building-a.glb',             scale: 0.5, yOffset: 0 },
  warehouse:           { path: '/models/buildings/industrial/building-d.glb',             scale: 0.5, yOffset: 0 },
  field:               { path: '/models/buildings/farm/fence.glb',                        scale: 0.5, yOffset: 0 },
  residential_low:     { path: '/models/buildings/suburban/building-type-a.glb',          scale: 0.5, yOffset: 0 },
  residential_medium:  { path: '/models/buildings/commercial/building-c.glb',             scale: 0.5, yOffset: 0 },
  residential_high:    { path: '/models/buildings/commercial/building-skyscraper-b.glb',  scale: 0.5, yOffset: 0 },
};

const ghostMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color('#60a5fa'),
  transparent: true,
  opacity: 0.4,
  roughness: 0.8,
  metalness: 0.1,
  depthWrite: false,
});

function extractMeshes(scene: THREE.Group): Array<{ geometry: THREE.BufferGeometry }> {
  const results: Array<{ geometry: THREE.BufferGeometry }> = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry.clone();
      mesh.updateWorldMatrix(true, false);
      geo.applyMatrix4(mesh.matrixWorld);
      results.push({ geometry: geo });
    }
  });
  return results;
}

interface Props {
  buildingType: string;
  gridX: number;
  gridY: number;
}

export default function GhostBuilding3D({ buildingType, gridX, gridY }: Props) {
  const mapping = MODEL_MAP[buildingType];
  if (!mapping) return null;

  return <GhostBuildingInner mapping={mapping} gridX={gridX} gridY={gridY} />;
}

function GhostBuildingInner({ mapping, gridX, gridY }: { mapping: ModelMapping; gridX: number; gridY: number }) {
  const { scene } = useGLTF(mapping.path);
  const meshParts = useMemo(() => extractMeshes(scene as unknown as THREE.Group), [scene]);

  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    meshParts.forEach(p => {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    });
    return box;
  }, [meshParts]);

  const [wx, wz] = useMemo(() => tileToWorld(gridX, gridY), [gridX, gridY]);

  const modelWidth = bounds.max.x - bounds.min.x;
  const modelDepth = bounds.max.z - bounds.min.z;
  const maxDim = Math.max(modelWidth, modelDepth);
  const fitScale = maxDim > 0 ? 0.85 / maxDim : mapping.scale;
  const cx = (bounds.max.x + bounds.min.x) / 2;
  const cz = (bounds.max.z + bounds.min.z) / 2;

  return (
    <group
      position={[
        wx + 0.5 - cx * fitScale,
        mapping.yOffset - bounds.min.y * fitScale,
        wz + 0.5 - cz * fitScale,
      ]}
      scale={[fitScale, fitScale, fitScale]}
    >
      {meshParts.map((part, idx) => (
        <mesh
          key={idx}
          geometry={part.geometry}
          material={ghostMaterial}
        />
      ))}
    </group>
  );
}

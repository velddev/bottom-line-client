import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { tileToWorld } from './cityGrid';
import { getModelVariant, getBuildingRotation } from './buildingVariants';

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
  const variant = getModelVariant(buildingType, gridX, gridY);
  if (!variant) return null;

  return <GhostBuildingInner variant={variant} gridX={gridX} gridY={gridY} />;
}

function GhostBuildingInner({ variant, gridX, gridY }: { variant: { path: string; scale: number; yOffset: number }; gridX: number; gridY: number }) {
  const { scene } = useGLTF(variant.path);
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
  const fitScale = maxDim > 0 ? 0.85 / maxDim : variant.scale;
  const cx = (bounds.max.x + bounds.min.x) / 2;
  const cz = (bounds.max.z + bounds.min.z) / 2;

  const rotation = getBuildingRotation(gridX, gridY);
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const scx = cx * fitScale;
  const scz = cz * fitScale;
  const rscx = cosR * scx + sinR * scz;
  const rscz = -sinR * scx + cosR * scz;

  return (
    <group
      position={[
        wx + 0.5 - rscx,
        variant.yOffset - bounds.min.y * fitScale,
        wz + 0.5 - rscz,
      ]}
      rotation={[0, rotation, 0]}
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

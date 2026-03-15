import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { tileToWorld } from './cityGrid';

const SELECTOR_MODEL = '/models/selection/selection-a.glb';

interface Props {
  gridX: number;
  gridY: number;
}

function extractMesh(scene: THREE.Group) {
  let geo: THREE.BufferGeometry | null = null;
  let mat: THREE.Material | null = null;
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !geo) {
      const m = child as THREE.Mesh;
      child.updateWorldMatrix(true, false);
      geo = m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      mat = m.material as THREE.Material;
    }
  });
  return { geo: geo!, mat: mat! };
}

export default function TileSelector3D({ gridX, gridY }: Props) {
  const gltf = useGLTF(SELECTOR_MODEL);
  const meshRef = useRef<THREE.Mesh>(null!);

  const { geo, mat } = useMemo(
    () => extractMesh(gltf.scene as unknown as THREE.Group),
    [gltf.scene]
  );

  const [wx, wz] = useMemo(() => tileToWorld(gridX, gridY), [gridX, gridY]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Gentle pulse: scale between 0.95 and 1.05, slower speed
    const pulse = 1.0 + Math.sin(t * 1.5) * 0.05;
    meshRef.current.scale.set(pulse, pulse, pulse);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geo}
      material={mat}
      position={[wx + 0.5, 0.01, wz + 0.5]}
    />
  );
}

useGLTF.preload(SELECTOR_MODEL);

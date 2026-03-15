import { useRef, useEffect, useMemo, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { tileToWorld } from './cityGrid';

const SELECTOR_MODEL = '/models/selection/selection-a.glb';

const ANIM_FPS = 30;
const PULSE_DURATION = 600; // single grow+shrink in 600ms
const PAUSE_DURATION = 1500; // rest for 1.5s
const CYCLE = PULSE_DURATION + PAUSE_DURATION;

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

  const { invalidate } = useThree();

  // Drive animation at ~30 FPS during pulse, idle during pause
  useEffect(() => {
    const id = setInterval(() => {
      const phase = performance.now() % CYCLE;
      if (phase < PULSE_DURATION) invalidate();
    }, 1000 / ANIM_FPS);
    return () => clearInterval(id);
  }, [invalidate]);

  useFrame(() => {
    if (!meshRef.current) return;
    const phase = performance.now() % CYCLE;
    // One full grow + shrink using half-sine (0→1→0)
    const pulse = phase < PULSE_DURATION
      ? 1.0 + Math.sin((phase / PULSE_DURATION) * Math.PI) * 0.05
      : 1.0;
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

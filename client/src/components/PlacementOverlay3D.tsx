import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TilePlacementScore } from '../utils/tilePlacement';
import { tileToWorld } from './cityGrid';

const TILE_UNIT = 1;

interface Props {
  heatmap: TilePlacementScore[]; // all scored tiles with normalized 0..1 values
}

const _tempMatrix = new THREE.Matrix4();
const _tempColor = new THREE.Color();

// Interpolate from red (0) → yellow (0.5) → green (1)
function heatColor(t: number): THREE.Color {
  const color = new THREE.Color();
  if (t < 0.5) {
    // red → yellow
    const f = t * 2;
    color.setRGB(0.9, 0.2 + f * 0.6, 0.1);
  } else {
    // yellow → green
    const f = (t - 0.5) * 2;
    color.setRGB(0.8 - f * 0.6, 0.8, 0.1 + f * 0.2);
  }
  return color;
}

export default function PlacementOverlay3D({ heatmap }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => new THREE.PlaneGeometry(TILE_UNIT * 0.92, TILE_UNIT * 0.92), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.45,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.FrontSide,
      depthWrite: false,
    }),
    []
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    heatmap.forEach((entry, i) => {
      const [wx, wz] = tileToWorld(entry.tile.grid_x, entry.tile.grid_y);
      _tempMatrix.identity();
      _tempMatrix.makeRotationX(-Math.PI / 2);
      _tempMatrix.setPosition(wx + TILE_UNIT / 2, 0.03, wz + TILE_UNIT / 2);
      mesh.setMatrixAt(i, _tempMatrix);

      _tempColor.copy(heatColor(entry.normalized));
      mesh.setColorAt(i, _tempColor);
    });

    // Hide unused
    for (let i = heatmap.length; i < mesh.count; i++) {
      _tempMatrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [heatmap]);

  const maxInstances = Math.max(heatmap.length, 1);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, maxInstances]}
      frustumCulled={false}
      raycast={() => {}} // Don't intercept clicks
    />
  );
}

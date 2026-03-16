import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TilePlacementScore } from '../utils/tilePlacement';
import { tileToWorld } from './cityGrid';

const TILE_UNIT = 1;

interface Props {
  heatmap: TilePlacementScore[];
}

const _tempMatrix = new THREE.Matrix4();
const _tempColor = new THREE.Color();

// Vivid gradient: red → orange → yellow → lime → green using HSL
// HSL hue: 0 (red) → 120 (green), saturation 90%, lightness 50%
function heatColor(t: number): THREE.Color {
  const color = new THREE.Color();
  const hue = t * 0.33; // 0 = red (0), 1 = green (~120°=0.33)
  color.setHSL(hue, 0.85, 0.55);
  return color;
}

export default function PlacementOverlay3D({ heatmap }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => new THREE.PlaneGeometry(TILE_UNIT * 0.92, TILE_UNIT * 0.92), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.5,
      side: THREE.FrontSide,
      depthWrite: false,
      toneMapped: false, // keep colors vivid, bypass tone mapping
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
      raycast={() => {}}
    />
  );
}

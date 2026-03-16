import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TileInfo } from '../types';
import type { TilePlacementScore } from '../utils/tilePlacement';
import { tileToWorld } from './cityGrid';

const TILE_UNIT = 1;

// Placement overlay: shows valid tiles with a subtle overlay, recommended tiles with a pulsing glow
interface Props {
  validTiles: Set<string>; // tile_id set of all valid (buildable) tiles
  recommended: TilePlacementScore[]; // top N scored tiles
  tiles: Map<string, TileInfo>;
}

const COLOR_VALID = new THREE.Color('#818cf8'); // indigo-400
const COLOR_RECOMMENDED = new THREE.Color('#6366f1'); // indigo-500
const _tempMatrix = new THREE.Matrix4();
const _tempColor = new THREE.Color();

export default function PlacementOverlay3D({ validTiles, recommended, tiles }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const recommendedSet = useMemo(
    () => new Set(recommended.map(r => r.tile.tile_id)),
    [recommended]
  );

  const allOverlayTiles = useMemo(() => {
    const result: { tileId: string; gx: number; gy: number; isRecommended: boolean }[] = [];
    for (const tileId of validTiles) {
      const tile = tiles.get(tileId);
      if (!tile) continue;
      result.push({
        tileId,
        gx: tile.grid_x,
        gy: tile.grid_y,
        isRecommended: recommendedSet.has(tileId),
      });
    }
    return result;
  }, [validTiles, recommendedSet, tiles]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(TILE_UNIT * 0.9, TILE_UNIT * 0.9), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.35,
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

    allOverlayTiles.forEach((t, i) => {
      const [wx, wz] = tileToWorld(t.gx, t.gy);
      _tempMatrix.identity();
      _tempMatrix.makeRotationX(-Math.PI / 2);
      _tempMatrix.setPosition(wx + TILE_UNIT / 2, 0.03, wz + TILE_UNIT / 2);
      mesh.setMatrixAt(i, _tempMatrix);

      const color = t.isRecommended ? COLOR_RECOMMENDED : COLOR_VALID;
      mesh.setColorAt(i, color);
    });

    // Hide unused
    for (let i = allOverlayTiles.length; i < mesh.count; i++) {
      _tempMatrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [allOverlayTiles]);

  // Animate recommended tiles with a pulse
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || allOverlayTiles.length === 0) return;

    const t = clock.getElapsedTime();
    const pulse = 0.25 + Math.sin(t * 2) * 0.15; // 0.10 → 0.40

    allOverlayTiles.forEach((tile, i) => {
      if (tile.isRecommended) {
        _tempColor.copy(COLOR_RECOMMENDED);
        // Animate opacity via alpha-like brightness
        const brightness = 0.7 + Math.sin(t * 2) * 0.3;
        _tempColor.multiplyScalar(brightness);
        mesh.setColorAt(i, _tempColor);
      }
    });

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    material.opacity = pulse;
  });

  const maxInstances = Math.max(allOverlayTiles.length, 1);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, maxInstances]}
      frustumCulled={false}
      raycast={() => {}} // Don't intercept clicks
    />
  );
}

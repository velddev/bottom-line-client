import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TilePlacementScore } from '../utils/tilePlacement';
import { tileToWorld, WORLD_SIZE } from './cityGrid';

interface Props {
  heatmap: TilePlacementScore[];
}

// Build a WORLD_SIZE × WORLD_SIZE RGBA texture where each pixel = 1 world unit.
// Tile positions get the heatmap color; road/empty positions stay transparent.
function buildHeatTexture(heatmap: TilePlacementScore[]): THREE.DataTexture {
  const size = WORLD_SIZE;
  const data = new Uint8Array(size * size * 4); // RGBA, initialized to 0 (transparent)

  for (const entry of heatmap) {
    const [wx, wz] = tileToWorld(entry.tile.grid_x, entry.tile.grid_y);
    const px = Math.round(wx);
    const py = Math.round(wz);
    if (px < 0 || px >= size || py < 0 || py >= size) continue;

    // HSL hue: 0 (red) → 0.33 (green), 85% sat, 55% lightness
    const hue = entry.normalized * 0.33;
    const color = new THREE.Color();
    color.setHSL(hue, 0.85, 0.55);

    const idx = (py * size + px) * 4;
    data[idx]     = Math.round(color.r * 255);
    data[idx + 1] = Math.round(color.g * 255);
    data[idx + 2] = Math.round(color.b * 255);
    data[idx + 3] = 140; // ~55% opacity
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export default function PlacementOverlay3D({ heatmap }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const texture = useMemo(() => buildHeatTexture(heatmap), [heatmap]);

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.FrontSide,
    }),
    [texture]
  );

  // Update texture when heatmap changes
  useEffect(() => {
    const newTex = buildHeatTexture(heatmap);
    material.map = newTex;
    material.needsUpdate = true;
    return () => newTex.dispose();
  }, [heatmap, material]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[WORLD_SIZE / 2, 0.025, WORLD_SIZE / 2]}
      raycast={() => {}}
    />
  );
}

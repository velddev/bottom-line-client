import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TileInfo } from '../types';
import { tileToWorld } from './cityGrid';

const TILE_UNIT = 1;
const TILE_GAP = 0.02;
const TILE_SIZE = TILE_UNIT - TILE_GAP;

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';

// Simple hash for deterministic per-tile color variation
function tileHash(gx: number, gy: number): number {
  let h = (gx * 374761393 + gy * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
const WARNING_STATUSES = new Set(['MissingResources', 'Paused']);

const COLOR_PLAYER  = new THREE.Color('#4ade80');
const COLOR_WARNING = new THREE.Color('#f59e0b');
const COLOR_FORSALE = new THREE.Color('#60a5fa');
const COLOR_DEFAULT = new THREE.Color('#86c280');
const COLOR_HOVER   = new THREE.Color('#a3d99c');
function tileColor(tile: TileInfo, myPlayerId: string): THREE.Color {
  if (tile.owner_player_id === myPlayerId) {
    if (WARNING_STATUSES.has(tile.building_status)) return COLOR_WARNING;
    return COLOR_PLAYER;
  }
  if (tile.is_for_sale) return COLOR_FORSALE;
  return COLOR_DEFAULT;
}

interface TileGrid3DProps {
  tiles: Map<string, TileInfo>;
  myPlayerId: string;
  selectedTile: TileInfo | null;
  hoveredTile: TileInfo | null;
  onSelect: (tile: TileInfo | null) => void;
  onHover: (tile: TileInfo | null) => void;
}

const _tempMatrix = new THREE.Matrix4();
const _tempColor = new THREE.Color();

export default function TileGrid3D({
  tiles,
  myPlayerId,
  selectedTile,
  hoveredTile,
  onSelect,
  onHover,
}: TileGrid3DProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tileIndexMap = useRef<Map<number, string>>(new Map());
  const indexTileMap = useRef<Map<string, number>>(new Map());

  const geometry = useMemo(() => new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.FrontSide,
    }),
    []
  );

  // Update instances when tiles change
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const entries = Array.from(tiles.entries());
    tileIndexMap.current.clear();
    indexTileMap.current.clear();

    entries.forEach(([key, tile], i) => {
      tileIndexMap.current.set(i, key);
      indexTileMap.current.set(key, i);

      const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);

      _tempMatrix.identity();
      _tempMatrix.makeRotationX(-Math.PI / 2);
      _tempMatrix.setPosition(wx + TILE_UNIT / 2, 0.01, wz + TILE_UNIT / 2);
      mesh.setMatrixAt(i, _tempMatrix);

      const isSelected = selectedTile?.tile_id === tile.tile_id;
      const isHovered = hoveredTile?.tile_id === tile.tile_id;

      if (isSelected) {
        const base = tileColor(tile, myPlayerId);
        const brighten = 0.25;
        _tempColor.setRGB(
          Math.min(1, base.r + brighten),
          Math.min(1, base.g + brighten),
          Math.min(1, base.b + brighten)
        );
        mesh.setColorAt(i, _tempColor);
      } else if (isHovered) {
        mesh.setColorAt(i, COLOR_HOVER);
      } else {
        // Add subtle per-tile color variation
        const base = tileColor(tile, myPlayerId);
        const variation = tileHash(tile.grid_x, tile.grid_y) * 0.06 - 0.03;
        _tempColor.setRGB(
          Math.min(1, Math.max(0, base.r + variation)),
          Math.min(1, Math.max(0, base.g + variation * 1.5)),
          Math.min(1, Math.max(0, base.b + variation * 0.5))
        );
        mesh.setColorAt(i, _tempColor);
      }
    });

    // Hide unused instances
    for (let i = entries.length; i < mesh.count; i++) {
      _tempMatrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles, myPlayerId, selectedTile, hoveredTile]);

  const maxInstances = 120 * 120; // 14,400

  // Track pointer down position to distinguish click from drag
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: any) => {
    pointerDownPos.current = { x: e.clientX ?? e.nativeEvent?.clientX ?? 0, y: e.clientY ?? e.nativeEvent?.clientY ?? 0 };
  };

  const handlePointerMove = (e: { instanceId?: number; stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    if (e.instanceId === undefined) {
      onHover(null);
      return;
    }
    const key = tileIndexMap.current.get(e.instanceId);
    if (key) {
      const tile = tiles.get(key);
      onHover(tile ?? null);
    }
  };

  const handleClick = (e: any) => {
    e.stopPropagation?.();

    // Ignore if pointer moved significantly (user was dragging/panning)
    if (pointerDownPos.current) {
      const dx = (e.clientX ?? e.nativeEvent?.clientX ?? 0) - pointerDownPos.current.x;
      const dy = (e.clientY ?? e.nativeEvent?.clientY ?? 0) - pointerDownPos.current.y;
      if (dx * dx + dy * dy > 25) return; // >5px movement = drag, not click
    }

    if (e.instanceId === undefined) {
      onSelect(null);
      return;
    }
    const key = tileIndexMap.current.get(e.instanceId);
    if (key) {
      const tile = tiles.get(key);
      if (tile) {
        onSelect(selectedTile?.tile_id === tile.tile_id ? null : tile);
      }
    }
  };

  const handlePointerLeave = () => {
    onHover(null);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, maxInstances]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      onPointerLeave={handlePointerLeave}
      frustumCulled={false}
    />
  );
}

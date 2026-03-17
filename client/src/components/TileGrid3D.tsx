import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { TileInfo } from '../types';
import { tileToWorld, RENDER_CHUNK, CHUNKS_PER_AXIS } from './cityGrid';

const TILE_UNIT = 1;
const TILE_GAP = 0.02;
const TILE_SIZE = TILE_UNIT - TILE_GAP;
const TILES_PER_CHUNK = RENDER_CHUNK * RENDER_CHUNK; // 400

const GOVERNMENT_ID = '00000000-0000-0000-0000-000000000001';

// Simple hash for deterministic per-tile color variation
function tileHash(gx: number, gy: number): number {
  let h = (gx * 374761393 + gy * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
const WARNING_STATUSES = new Set(['MissingResources', 'Paused']);

const COLOR_PLAYER       = new THREE.Color('#4ade80');
const COLOR_WARNING      = new THREE.Color('#f59e0b');
const COLOR_CONSTRUCTION = new THREE.Color('#60a5fa'); // blue-400 for under construction
const COLOR_DEFAULT      = new THREE.Color('#86c280');
const COLOR_HOVER        = new THREE.Color('#a3d99c');
function tileColor(tile: TileInfo, myPlayerId: string): THREE.Color {
  if (tile.building_status === 'UnderConstruction') return COLOR_CONSTRUCTION;
  if (tile.owner_player_id === myPlayerId) {
    if (WARNING_STATUSES.has(tile.building_status)) return COLOR_WARNING;
    return COLOR_PLAYER;
  }
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

/* ── Single chunk of tiles ────────────────────────────────────── */

interface TileChunkProps {
  chunkX: number;
  chunkY: number;
  tiles: Map<string, TileInfo>;
  myPlayerId: string;
  selectedTile: TileInfo | null;
  hoveredTile: TileInfo | null;
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshStandardMaterial;
  onTileEvent: (type: 'click' | 'hover' | 'leave', e: any) => void;
}

function TileChunk({
  chunkX, chunkY, tiles, myPlayerId, selectedTile, hoveredTile,
  geometry, material, onTileEvent,
}: TileChunkProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tileIndexMap = useRef<Map<number, string>>(new Map());
  const { invalidate } = useThree();

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    tileIndexMap.current.clear();
    const minGx = chunkX * RENDER_CHUNK;
    const minGy = chunkY * RENDER_CHUNK;
    let idx = 0;

    for (let dy = 0; dy < RENDER_CHUNK; dy++) {
      for (let dx = 0; dx < RENDER_CHUNK; dx++) {
        const gx = minGx + dx;
        const gy = minGy + dy;
        const key = `${gx}_${gy}`;
        const tile = tiles.get(key);

        if (tile) {
          tileIndexMap.current.set(idx, key);
          const [wx, wz] = tileToWorld(gx, gy);
          _tempMatrix.identity();
          _tempMatrix.makeRotationX(-Math.PI / 2);
          _tempMatrix.setPosition(wx + TILE_UNIT / 2, 0.01, wz + TILE_UNIT / 2);
          mesh.setMatrixAt(idx, _tempMatrix);

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
            mesh.setColorAt(idx, _tempColor);
          } else if (isHovered) {
            mesh.setColorAt(idx, COLOR_HOVER);
          } else {
            const base = tileColor(tile, myPlayerId);
            const variation = tileHash(gx, gy) * 0.06 - 0.03;
            _tempColor.setRGB(
              Math.min(1, Math.max(0, base.r + variation)),
              Math.min(1, Math.max(0, base.g + variation * 1.5)),
              Math.min(1, Math.max(0, base.b + variation * 0.5))
            );
            mesh.setColorAt(idx, _tempColor);
          }
          idx++;
        }
      }
    }

    // Hide unused instances
    for (let i = idx; i < TILES_PER_CHUNK; i++) {
      _tempMatrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _tempMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [tiles, myPlayerId, selectedTile, hoveredTile, chunkX, chunkY, invalidate]);

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: any) => {
    pointerDownPos.current = { x: e.clientX ?? e.nativeEvent?.clientX ?? 0, y: e.clientY ?? e.nativeEvent?.clientY ?? 0 };
  };

  const handlePointerMove = (e: any) => {
    e.stopPropagation?.();
    if (e.instanceId === undefined) {
      onTileEvent('leave', e);
      return;
    }
    const key = tileIndexMap.current.get(e.instanceId);
    if (key) {
      onTileEvent('hover', { ...e, _tileKey: key });
    }
  };

  const handleClick = (e: any) => {
    e.stopPropagation?.();
    if (pointerDownPos.current) {
      const dx = (e.clientX ?? e.nativeEvent?.clientX ?? 0) - pointerDownPos.current.x;
      const dy = (e.clientY ?? e.nativeEvent?.clientY ?? 0) - pointerDownPos.current.y;
      if (dx * dx + dy * dy > 25) return;
    }
    if (e.instanceId === undefined) {
      onTileEvent('click', { ...e, _tileKey: null });
      return;
    }
    const key = tileIndexMap.current.get(e.instanceId);
    if (key) {
      onTileEvent('click', { ...e, _tileKey: key });
    }
  };

  const handlePointerLeave = () => {
    onTileEvent('leave', null);
  };

  return (
    <instancedMesh
      name="TileGrid"
      ref={meshRef}
      args={[geometry, material, TILES_PER_CHUNK]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      onPointerLeave={handlePointerLeave}
    />
  );
}

/* ── Main grid: renders 36 chunks ─────────────────────────────── */

export default function TileGrid3D({
  tiles,
  myPlayerId,
  selectedTile,
  hoveredTile,
  onSelect,
  onHover,
}: TileGrid3DProps) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.FrontSide,
    }),
    []
  );

  const chunks = useMemo(() => {
    const result: { cx: number; cy: number }[] = [];
    for (let cy = 0; cy < CHUNKS_PER_AXIS; cy++) {
      for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
        result.push({ cx, cy });
      }
    }
    return result;
  }, []);

  const handleTileEvent = useCallback((type: 'click' | 'hover' | 'leave', e: any) => {
    if (type === 'leave') {
      onHover(null);
      return;
    }
    const key: string | null = e?._tileKey ?? null;
    if (type === 'hover') {
      onHover(key ? tiles.get(key) ?? null : null);
    } else {
      const tile = key ? tiles.get(key) ?? null : null;
      if (tile) {
        onSelect(selectedTile?.tile_id === tile.tile_id ? null : tile);
      } else {
        onSelect(null);
      }
    }
  }, [tiles, selectedTile, onSelect, onHover]);

  return (
    <>
      {chunks.map(({ cx, cy }) => (
        <TileChunk
          key={`${cx}_${cy}`}
          chunkX={cx}
          chunkY={cy}
          tiles={tiles}
          myPlayerId={myPlayerId}
          selectedTile={selectedTile}
          hoveredTile={hoveredTile}
          geometry={geometry}
          material={material}
          onTileEvent={handleTileEvent}
        />
      ))}
    </>
  );
}

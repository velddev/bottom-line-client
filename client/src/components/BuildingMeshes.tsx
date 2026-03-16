import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { TileInfo } from '../types';
import { tileToWorld } from './cityGrid';
import {
  type ModelVariant,
  VARIANT_MAP,
  ALL_MODEL_PATHS,
  getVariantIndex,
  getBuildingRotation,
} from './buildingVariants';

const _tempMatrix = new THREE.Matrix4();
const _tempScale = new THREE.Vector3();

// Preload all variant models
ALL_MODEL_PATHS.forEach(p => useGLTF.preload(p));

// ── Mesh extraction ────────────────────────────────────────────────────

interface MeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

function extractMeshes(scene: THREE.Group): MeshPart[] {
  const results: MeshPart[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry.clone();
      mesh.updateWorldMatrix(true, false);
      geo.applyMatrix4(mesh.matrixWorld);
      results.push({ geometry: geo, material: mesh.material });
    }
  });
  return results;
}

// ── Per-variant instanced component ────────────────────────────────────

interface BuildingMeshesProps {
  tiles: Map<string, TileInfo>;
  myPlayerId: string;
}

function BuildingVariantGLB({
  variant,
  buildings,
}: {
  variant: ModelVariant;
  buildings: TileInfo[];
}) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const { scene } = useGLTF(variant.path);

  const meshParts = useMemo(() => extractMeshes(scene), [scene]);

  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    meshParts.forEach(p => {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    });
    return box;
  }, [meshParts]);

  useEffect(() => {
    if (meshParts.length === 0) return;

    const modelWidth = bounds.max.x - bounds.min.x;
    const modelDepth = bounds.max.z - bounds.min.z;
    const maxDim = Math.max(modelWidth, modelDepth);
    const fitScale = maxDim > 0 ? 0.85 / maxDim : variant.scale;

    const cx = (bounds.max.x + bounds.min.x) / 2;
    const cz = (bounds.max.z + bounds.min.z) / 2;

    meshRefs.current.forEach(mesh => {
      if (!mesh) return;

      buildings.forEach((tile, i) => {
        const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);
        const rotation = getBuildingRotation(tile.grid_x, tile.grid_y);
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);

        const scx = cx * fitScale;
        const scz = cz * fitScale;
        const rscx = cosR * scx + sinR * scz;
        const rscz = -sinR * scx + cosR * scz;

        _tempMatrix.makeRotationY(rotation);
        _tempScale.set(fitScale, fitScale, fitScale);
        _tempMatrix.scale(_tempScale);
        _tempMatrix.setPosition(
          wx + 0.5 - rscx,
          variant.yOffset - bounds.min.y * fitScale,
          wz + 0.5 - rscz,
        );

        mesh.setMatrixAt(i, _tempMatrix);
      });

      for (let i = buildings.length; i < mesh.count; i++) {
        _tempMatrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _tempMatrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [buildings, variant, meshParts, bounds]);

  if (meshParts.length === 0) return null;

  const maxCount = Math.max(buildings.length, 1);

  return (
    <group>
      {meshParts.map((part, idx) => (
        <instancedMesh
          key={idx}
          ref={el => { meshRefs.current[idx] = el; }}
          args={[part.geometry, part.material, maxCount]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export default function BuildingMeshes({ tiles }: BuildingMeshesProps) {
  const buildingGroups = useMemo(() => {
    const groups: Record<string, { variant: ModelVariant; tiles: TileInfo[] }> = {};
    for (const [, tile] of tiles) {
      if (!tile.building_id || !tile.building_type) continue;
      const type = tile.building_type.toLowerCase();
      const variants = VARIANT_MAP[type];
      if (!variants || variants.length === 0) continue;
      const idx = getVariantIndex(tile.grid_x, tile.grid_y, variants.length);
      const key = `${type}:${idx}`;
      if (!groups[key]) groups[key] = { variant: variants[idx], tiles: [] };
      groups[key].tiles.push(tile);
    }
    return groups;
  }, [tiles]);

  return (
    <group>
      {Object.entries(buildingGroups).map(([key, group]) => {
        if (group.tiles.length === 0) return null;
        return (
          <BuildingVariantGLB
            key={key}
            variant={group.variant}
            buildings={group.tiles}
          />
        );
      })}
    </group>
  );
}

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { TileInfo } from '../types';
import { tileToWorld } from './cityGrid';

const _tempMatrix = new THREE.Matrix4();
const _tempScale = new THREE.Vector3();
const WARNING_STATUSES = new Set(['MissingResources', 'Paused']);

interface ModelMapping {
  path: string;
  scale: number;       // uniform scale to fit ~1×1 tile
  yOffset: number;     // vertical offset (some models don't sit at y=0)
}

// Map game building types → Kenney GLB models
const MODEL_MAP: Record<string, ModelMapping> = {
  factory:             { path: '/models/buildings/industrial/building-a.glb',             scale: 0.5, yOffset: 0 },
  store:               { path: '/models/buildings/commercial/building-a.glb',             scale: 0.5, yOffset: 0 },
  warehouse:           { path: '/models/buildings/industrial/building-d.glb',             scale: 0.5, yOffset: 0 },
  landmark:            { path: '/models/buildings/commercial/building-skyscraper-a.glb',  scale: 0.5, yOffset: 0 },
  bank:                { path: '/models/buildings/commercial/building-d.glb',             scale: 0.5, yOffset: 0 },
  // Residential tiers — government-built citizen housing
  residential_low:      { path: '/models/buildings/suburban/building-type-a.glb',          scale: 0.5, yOffset: 0 },
  residential_medium:   { path: '/models/buildings/commercial/building-c.glb',             scale: 0.5, yOffset: 0 },
  residential_high:     { path: '/models/buildings/commercial/building-skyscraper-b.glb',  scale: 0.5, yOffset: 0 },
};

// Preload all models
Object.values(MODEL_MAP).forEach(m => useGLTF.preload(m.path));

/** Extract all meshes from a GLTF scene */
function extractMeshes(scene: THREE.Group): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }> {
  const results: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }> = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      // Apply parent transforms to geometry
      const geo = mesh.geometry.clone();
      mesh.updateWorldMatrix(true, false);
      geo.applyMatrix4(mesh.matrixWorld);
      results.push({ geometry: geo, material: mesh.material });
    }
  });
  return results;
}

interface BuildingMeshesProps {
  tiles: Map<string, TileInfo>;
  myPlayerId: string;
}

function BuildingTypeGLB({
  type,
  mapping,
  buildings,
  myPlayerId,
}: {
  type: string;
  mapping: ModelMapping;
  buildings: TileInfo[];
  myPlayerId: string;
}) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const { scene } = useGLTF(mapping.path);

  const meshParts = useMemo(() => extractMeshes(scene), [scene]);

  // Compute unified bounding box across all parts
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
    const fitScale = maxDim > 0 ? 0.85 / maxDim : mapping.scale;

    const cx = (bounds.max.x + bounds.min.x) / 2;
    const cz = (bounds.max.z + bounds.min.z) / 2;

    meshRefs.current.forEach(mesh => {
      if (!mesh) return;

      buildings.forEach((tile, i) => {
        const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);

        _tempMatrix.identity();
        _tempScale.set(fitScale, fitScale, fitScale);
        _tempMatrix.scale(_tempScale);
        _tempMatrix.setPosition(
          wx + 0.5 - cx * fitScale,
          mapping.yOffset - bounds.min.y * fitScale,
          wz + 0.5 - cz * fitScale
        );

        mesh.setMatrixAt(i, _tempMatrix);
      });

      for (let i = buildings.length; i < mesh.count; i++) {
        _tempMatrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _tempMatrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [buildings, mapping, meshParts, bounds, myPlayerId]);

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

export default function BuildingMeshes({ tiles, myPlayerId }: BuildingMeshesProps) {
  const buildingsByType = useMemo(() => {
    const groups: Record<string, TileInfo[]> = {};
    for (const [, tile] of tiles) {
      if (!tile.building_id || !tile.building_type) continue;
      const type = tile.building_type.toLowerCase();
      if (!groups[type]) groups[type] = [];
      groups[type].push(tile);
    }
    return groups;
  }, [tiles]);

  return (
    <group>
      {Object.entries(MODEL_MAP).map(([type, mapping]) => {
        const buildings = buildingsByType[type] ?? [];
        if (buildings.length === 0) return null;
        return (
          <BuildingTypeGLB
            key={type}
            type={type}
            mapping={mapping}
            buildings={buildings}
            myPlayerId={myPlayerId}
          />
        );
      })}
    </group>
  );
}

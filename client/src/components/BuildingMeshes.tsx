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

// ── Fresnel cutout shader injection ────────────────────────────────────

// GLSL injected into MeshStandardMaterial vertex shader
const CUTOUT_VERTEX_PREAMBLE = /* glsl */ `
  uniform vec3  uSelectedPos;
  uniform float uHasSelection;
  varying float vOcclude;
  varying vec3  vViewNormal2;
`;

const CUTOUT_VERTEX_BODY = /* glsl */ `
  vViewNormal2 = normalize(transformedNormal);
  vOcclude = 0.0;
  if (uHasSelection > 0.5) {
    vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    // Isometric 45° azimuth: depth = x + z, lateral = x - z
    float iDepth = iPos.x + iPos.z;
    float sDepth = uSelectedPos.x + uSelectedPos.z;
    float latDiff = abs((iPos.x - iPos.z) - (uSelectedPos.x - uSelectedPos.z));
    float dist = length(iPos.xz - uSelectedPos.xz);
    // Block if closer to camera, laterally close, and not the selected building itself
    if (iDepth > sDepth + 0.7 && latDiff < 1.8 && dist > 0.3) {
      vOcclude = 1.0;
    }
  }
`;

// GLSL injected into MeshStandardMaterial fragment shader
const CUTOUT_FRAG_PREAMBLE = /* glsl */ `
  varying float vOcclude;
  varying vec3  vViewNormal2;
`;

const CUTOUT_FRAG_BODY = /* glsl */ `
  if (vOcclude > 0.5) {
    float NdotV = abs(dot(vec3(0.0, 0.0, 1.0), normalize(vViewNormal2)));
    float fresnel = pow(1.0 - NdotV, 2.0);
    gl_FragColor.a = mix(0.06, 0.45, fresnel);
  }
`;

/** Clone a material and inject the fresnel cutout shader */
function injectCutoutShader(
  original: THREE.Material,
  uniforms: { uSelectedPos: { value: THREE.Vector3 }; uHasSelection: { value: number } },
): THREE.Material {
  const mat = original.clone();
  (mat as THREE.MeshStandardMaterial).transparent = true;
  (mat as THREE.MeshStandardMaterial).depthWrite = true;
  mat.customProgramCacheKey = () => 'building-fresnel-cutout';

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSelectedPos = uniforms.uSelectedPos;
    shader.uniforms.uHasSelection = uniforms.uHasSelection;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + CUTOUT_VERTEX_PREAMBLE,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + CUTOUT_VERTEX_BODY,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' + CUTOUT_FRAG_PREAMBLE,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      CUTOUT_FRAG_BODY + '\n#include <dithering_fragment>',
    );
  };
  return mat;
}

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
  selectedTile?: TileInfo | null;
}

function BuildingVariantGLB({
  variant,
  buildings,
  cutoutUniforms,
}: {
  variant: ModelVariant;
  buildings: TileInfo[];
  cutoutUniforms: { uSelectedPos: { value: THREE.Vector3 }; uHasSelection: { value: number } };
}) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const { scene } = useGLTF(variant.path);

  const meshParts = useMemo(() => extractMeshes(scene), [scene]);

  // Clone materials with fresnel cutout shader injected
  const processedMaterials = useMemo(() => {
    return meshParts.map(part => {
      if (Array.isArray(part.material)) {
        return part.material.map(m => injectCutoutShader(m, cutoutUniforms));
      }
      return injectCutoutShader(part.material, cutoutUniforms);
    });
  }, [meshParts, cutoutUniforms]);

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
          args={[part.geometry, processedMaterials[idx], maxCount]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export default function BuildingMeshes({ tiles, myPlayerId, selectedTile }: BuildingMeshesProps) {
  // Shared uniforms for the fresnel cutout — all materials reference these
  const cutoutUniforms = useMemo(() => ({
    uSelectedPos: { value: new THREE.Vector3(0, 0, 0) },
    uHasSelection: { value: 0 as number },
  }), []);

  // Update cutout uniforms when selection changes
  useEffect(() => {
    if (selectedTile?.building_id) {
      const [wx, wz] = tileToWorld(selectedTile.grid_x, selectedTile.grid_y);
      cutoutUniforms.uSelectedPos.value.set(wx + 0.5, 0, wz + 0.5);
      cutoutUniforms.uHasSelection.value = 1.0;
    } else {
      cutoutUniforms.uHasSelection.value = 0.0;
    }
  }, [selectedTile, cutoutUniforms]);

  // Group buildings by (type, variantIndex) for instanced rendering
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
            cutoutUniforms={cutoutUniforms}
          />
        );
      })}
    </group>
  );
}

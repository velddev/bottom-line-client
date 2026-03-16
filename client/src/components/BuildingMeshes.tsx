import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
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
const _projVec = new THREE.Vector3();

// Preload all variant models
ALL_MODEL_PATHS.forEach(p => useGLTF.preload(p));

// ── Fresnel cutout shader injection ────────────────────────────────────
//
// Two-stage approach:
//   Vertex: coarse instance-level check — is this building in front of selected?
//   Fragment: precise screen-space gradient + fresnel on surface normals.

interface CutoutUniforms {
  uSelectedPos:       { value: THREE.Vector3 };   // world pos (for instance check)
  uSelectedScreenPos: { value: THREE.Vector2 };   // screen-space pos (gl_FragCoord)
  uGradientRadius:    { value: number };           // gradient radius in pixels
  uHasSelection:      { value: number };
}

const CUTOUT_VERTEX_PREAMBLE = /* glsl */ `
  uniform vec3  uSelectedPos;
  uniform float uHasSelection;
  varying float vBlocking;
  varying vec3  vViewNormal2;
`;

// Coarse per-instance check: is this instance in front of the selected building?
// Only marks it as potentially blocking — the precise gradient is in the fragment.
const CUTOUT_VERTEX_BODY = /* glsl */ `
  vViewNormal2 = normalize(transformedNormal);
  vBlocking = 0.0;
  if (uHasSelection > 0.5) {
    vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float dist = length(iPos.xz - uSelectedPos.xz);
    // Isometric 45° azimuth: depth along camera = x + z
    float iDepth = iPos.x + iPos.z;
    float sDepth = uSelectedPos.x + uSelectedPos.z;
    // Only potentially blocking if in front of selected building and not the same tile
    if (iDepth > sDepth + 0.3 && dist > 0.3) {
      vBlocking = 1.0;
    }
  }
`;

const CUTOUT_FRAG_PREAMBLE = /* glsl */ `
  uniform vec2  uSelectedScreenPos;
  uniform float uGradientRadius;
  uniform float uHasSelection;
  varying float vBlocking;
  varying vec3  vViewNormal2;
`;

// Per-fragment: screen-space radial gradient + fresnel edge glow
const CUTOUT_FRAG_BODY = /* glsl */ `
  if (vBlocking > 0.5 && uGradientRadius > 0.0) {
    float screenDist = length(gl_FragCoord.xy - uSelectedScreenPos);
    if (screenDist < uGradientRadius) {
      // Smooth gradient: 0 at center → 1 at edge of radius
      float fade = smoothstep(0.0, uGradientRadius, screenDist);
      // Fresnel: edges of geometry stay slightly more visible
      float NdotV = abs(dot(vec3(0.0, 0.0, 1.0), normalize(vViewNormal2)));
      float fresnel = pow(1.0 - NdotV, 2.0);
      float baseAlpha = mix(0.04, 0.25, fresnel);
      gl_FragColor.a = mix(baseAlpha, 1.0, fade);
    }
  }
`;

/** Clone a material and inject the fresnel cutout shader */
function injectCutoutShader(original: THREE.Material, uniforms: CutoutUniforms): THREE.Material {
  const mat = original.clone();
  (mat as THREE.MeshStandardMaterial).transparent = true;
  (mat as THREE.MeshStandardMaterial).depthWrite = true;
  mat.customProgramCacheKey = () => 'building-fresnel-cutout-v2';

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSelectedPos       = uniforms.uSelectedPos;
    shader.uniforms.uSelectedScreenPos = uniforms.uSelectedScreenPos;
    shader.uniforms.uGradientRadius    = uniforms.uGradientRadius;
    shader.uniforms.uHasSelection      = uniforms.uHasSelection;

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
  cutoutUniforms: CutoutUniforms;
}) {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const { scene } = useGLTF(variant.path);

  const meshParts = useMemo(() => extractMeshes(scene), [scene]);

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
  const cutoutUniforms = useMemo<CutoutUniforms>(() => ({
    uSelectedPos:       { value: new THREE.Vector3(0, 0, 0) },
    uSelectedScreenPos: { value: new THREE.Vector2(0, 0) },
    uGradientRadius:    { value: 0 },
    uHasSelection:      { value: 0 },
  }), []);

  // Compute selected world position (memoized, changes only on selection)
  const selectedWorldPos = useMemo(() => {
    if (!selectedTile?.building_id) return null;
    const [wx, wz] = tileToWorld(selectedTile.grid_x, selectedTile.grid_y);
    return new THREE.Vector3(wx + 0.5, 0, wz + 0.5);
  }, [selectedTile]);

  // Update uniforms every frame — camera may pan/zoom, changing screen projection
  useFrame(({ camera, size }) => {
    if (selectedWorldPos) {
      cutoutUniforms.uSelectedPos.value.copy(selectedWorldPos);
      cutoutUniforms.uHasSelection.value = 1.0;

      // Project selected building to screen-space (gl_FragCoord coordinates)
      _projVec.copy(selectedWorldPos);
      _projVec.project(camera);
      cutoutUniforms.uSelectedScreenPos.value.set(
        (_projVec.x * 0.5 + 0.5) * size.width,
        (_projVec.y * 0.5 + 0.5) * size.height,
      );

      // Gradient radius: ~2 world units scaled to current zoom
      const ortho = camera as THREE.OrthographicCamera;
      const pixelsPerUnit = (size.height * ortho.zoom) / (ortho.top - ortho.bottom);
      cutoutUniforms.uGradientRadius.value = pixelsPerUnit * 2.0;
    } else {
      cutoutUniforms.uHasSelection.value = 0.0;
    }
  });

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

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

// ── Dithered cutout for blocking buildings ─────────────────────────────
//
// Buildings in front of the selected building get their fragments discarded
// inside a capsule-shaped screen-space region derived from the selected
// building's projected bounding box. Animates in/out smoothly.

interface CutoutUniforms {
  uSelectedPos:       { value: THREE.Vector3 };
  uHasSelection:      { value: number };
  uSelectedScreenMin: { value: THREE.Vector2 };
  uSelectedScreenMax: { value: THREE.Vector2 };
  uCutoutProgress:    { value: number };
}

const CUTOUT_VERTEX_PREAMBLE = /* glsl */ `
  uniform vec3  uSelectedPos;
  uniform float uHasSelection;
  varying float vBlocking;
`;

const CUTOUT_VERTEX_BODY = /* glsl */ `
  vBlocking = 0.0;
  if (uHasSelection > 0.5) {
    vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float iDepth = iPos.x + iPos.z;
    float sDepth = uSelectedPos.x + uSelectedPos.z;
    float lateral = abs((iPos.x - iPos.z) - (uSelectedPos.x - uSelectedPos.z));
    if (iDepth > sDepth + 0.3 && lateral < 4.0) {
      vBlocking = 1.0;
    }
  }
`;

const CUTOUT_FRAG_PREAMBLE = /* glsl */ `
  uniform vec2  uSelectedScreenMin;
  uniform vec2  uSelectedScreenMax;
  uniform float uCutoutProgress;
  varying float vBlocking;
`;

// Capsule-shaped signed distance field in screen space.
// Fully discard inside, dithered gradient at the border, animated by progress.
const CUTOUT_FRAG_BODY = /* glsl */ `
  if (vBlocking > 0.5 && uCutoutProgress > 0.01) {
    vec2 center = (uSelectedScreenMin + uSelectedScreenMax) * 0.5;
    float w = uSelectedScreenMax.x - uSelectedScreenMin.x;
    float h = uSelectedScreenMax.y - uSelectedScreenMin.y;
    float radius = w * 0.5;
    float segHalf = max(h * 0.5 - radius, 0.0);

    vec2 p = gl_FragCoord.xy - center;
    p.y = max(abs(p.y) - segHalf, 0.0);
    float dist = length(p) - radius;

    float FADE_PX = 30.0;
    float keepChance = smoothstep(0.0, FADE_PX, dist);
    keepChance = mix(1.0, keepChance, uCutoutProgress);

    float igNoise = fract(52.9829189 * fract(0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y));
    if (igNoise > keepChance) discard;
  }
`;

function injectCutoutShader(original: THREE.Material, uniforms: CutoutUniforms): THREE.Material {
  const mat = original.clone();
  mat.customProgramCacheKey = () => 'building-dither-cutout';
  mat.needsUpdate = true;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSelectedPos       = uniforms.uSelectedPos;
    shader.uniforms.uHasSelection      = uniforms.uHasSelection;
    shader.uniforms.uSelectedScreenMin = uniforms.uSelectedScreenMin;
    shader.uniforms.uSelectedScreenMax = uniforms.uSelectedScreenMax;
    shader.uniforms.uCutoutProgress    = uniforms.uCutoutProgress;

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

export default function BuildingMeshes({ tiles, selectedTile }: BuildingMeshesProps) {
  const cutoutUniforms = useMemo<CutoutUniforms>(() => ({
    uSelectedPos:       { value: new THREE.Vector3(0, 0, 0) },
    uHasSelection:      { value: 0 },
    uSelectedScreenMin: { value: new THREE.Vector2(0, 0) },
    uSelectedScreenMax: { value: new THREE.Vector2(0, 0) },
    uCutoutProgress:    { value: 0 },
  }), []);

  // Animation state — persists across renders
  const lastWxRef = useRef(0);
  const lastWzRef = useRef(0);
  const progressRef = useRef(0);
  const lastBuildingIdRef = useRef<string | null>(null);

  // Animate the cutout capsule in/out and project the bounding box
  useFrame(({ camera, size }, delta) => {
    const hasSelection = !!selectedTile?.building_id;
    const currentId = selectedTile?.building_id ?? null;

    // Reset animation when switching between different buildings
    if (currentId !== lastBuildingIdRef.current) {
      if (currentId && lastBuildingIdRef.current) {
        progressRef.current = 0;
      }
      lastBuildingIdRef.current = currentId;
    }

    if (hasSelection) {
      const [wx, wz] = tileToWorld(selectedTile.grid_x, selectedTile.grid_y);
      lastWxRef.current = wx;
      lastWzRef.current = wz;
      cutoutUniforms.uSelectedPos.value.set(wx + 0.5, 0, wz + 0.5);
    }

    // Smooth lerp toward target (0 or 1)
    const target = hasSelection ? 1 : 0;
    const speed = 1 - Math.pow(0.001, delta);
    progressRef.current += (target - progressRef.current) * speed;
    if (Math.abs(progressRef.current - target) < 0.01) progressRef.current = target;

    cutoutUniforms.uCutoutProgress.value = progressRef.current;
    cutoutUniforms.uHasSelection.value = progressRef.current > 0.01 ? 1.0 : 0.0;

    // Project bounding box while cutout is active (including fade-out)
    if (progressRef.current > 0.01) {
      const wx = lastWxRef.current;
      const wz = lastWzRef.current;
      const BUILDING_HEIGHT = 4.0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        _projVec.set(
          i & 1 ? wx + 1 : wx,
          i & 2 ? BUILDING_HEIGHT : 0,
          i & 4 ? wz + 1 : wz,
        ).project(camera);
        const sx = (_projVec.x * 0.5 + 0.5) * size.width;
        const sy = (_projVec.y * 0.5 + 0.5) * size.height;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      const PAD = 10;
      cutoutUniforms.uSelectedScreenMin.value.set(minX - PAD, minY - PAD);
      cutoutUniforms.uSelectedScreenMax.value.set(maxX + PAD, maxY + PAD);
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

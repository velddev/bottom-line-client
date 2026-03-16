// Renders selection effects for the selected building:
// - Pre-render at renderOrder -1 — fills the depth buffer so the building
//   shows through dithered holes in blocking geometry
// - Brightened by 40% to visually distinguish the selected building

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { tileToWorld } from './cityGrid';
import { getModelVariant, getBuildingRotation } from './buildingVariants';

interface MeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

function extractMeshParts(scene: THREE.Group): MeshPart[] {
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

/** Clone a material and brighten it by multiplying final RGB.
 *  polygonOffset -1 prevents z-fighting with the instanced copy. */
function makeBrightenedMaterial(original: THREE.Material): THREE.Material {
  const mat = original.clone();
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  mat.customProgramCacheKey = () => 'building-bright';
  mat.needsUpdate = true;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `gl_FragColor.rgb *= 1.4;
      #include <dithering_fragment>`,
    );
  };
  return mat;
}

interface Props {
  buildingType: string;
  gridX: number;
  gridY: number;
}

export default function SelectedBuildingOutline({ buildingType, gridX, gridY }: Props) {
  const variant = getModelVariant(buildingType.toLowerCase(), gridX, gridY);
  if (!variant) return null;
  return <OutlineInner path={variant.path} scale={variant.scale} yOffset={variant.yOffset} gridX={gridX} gridY={gridY} />;
}

function OutlineInner({
  path, scale, yOffset, gridX, gridY,
}: {
  path: string; scale: number; yOffset: number; gridX: number; gridY: number;
}) {
  const { scene } = useGLTF(path);
  const meshParts = useMemo(
    () => extractMeshParts(scene as unknown as THREE.Group),
    [scene],
  );

  const brightenedMaterials = useMemo(() => {
    return meshParts.map(part => {
      if (Array.isArray(part.material)) {
        return part.material.map(m => makeBrightenedMaterial(m));
      }
      return makeBrightenedMaterial(part.material);
    });
  }, [meshParts]);

  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    meshParts.forEach(p => {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    });
    return box;
  }, [meshParts]);

  const [wx, wz] = useMemo(() => tileToWorld(gridX, gridY), [gridX, gridY]);

  const modelWidth = bounds.max.x - bounds.min.x;
  const modelDepth = bounds.max.z - bounds.min.z;
  const maxDim = Math.max(modelWidth, modelDepth);
  const fitScale = maxDim > 0 ? 0.85 / maxDim : scale;
  const cx = (bounds.max.x + bounds.min.x) / 2;
  const cz = (bounds.max.z + bounds.min.z) / 2;

  const rotation = getBuildingRotation(gridX, gridY);
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const scx = cx * fitScale;
  const scz = cz * fitScale;
  const rscx = cosR * scx + sinR * scz;
  const rscz = -sinR * scx + cosR * scz;

  return (
    <group
      position={[
        wx + 0.5 - rscx,
        yOffset - bounds.min.y * fitScale,
        wz + 0.5 - rscz,
      ]}
      rotation={[0, rotation, 0]}
      scale={[fitScale, fitScale, fitScale]}
    >
      {/* Pre-render with brightness: fills depth buffer before blocking
          buildings render, shows through their dithered cutout holes */}
      {meshParts.map((part, idx) => (
        <mesh
          key={`prerender-${idx}`}
          geometry={part.geometry}
          material={brightenedMaterials[idx]}
          renderOrder={-1}
        />
      ))}
    </group>
  );
}

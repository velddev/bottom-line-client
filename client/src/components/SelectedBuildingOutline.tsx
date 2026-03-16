// Renders effects for the selected building:
// 1. Gold backface-extruded outline (inverted hull technique)
// 2. Depth-based reveal — renders with depthFunc: GreaterEqual so the
//    building shows through any occluding geometry. No dithering, no
//    shader injection on other materials, pixel-perfect for any height.

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { tileToWorld } from './cityGrid';
import { getModelVariant, getBuildingRotation } from './buildingVariants';

const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color('#fbbf24') }, // amber-400 gold
    uThickness: { value: 0.06 },
  },
  vertexShader: /* glsl */ `
    uniform float uThickness;
    void main() {
      vec3 pos = position + normal * uThickness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthTest: true,
  depthWrite: true,
});

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

/** Clone a material and configure it for the depth-reveal pass */
function makeRevealMaterial(original: THREE.Material): THREE.Material {
  const mat = original.clone();
  mat.depthFunc = THREE.GreaterEqualDepth;
  mat.depthWrite = false;
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

  const revealMaterials = useMemo(() => {
    return meshParts.map(part => {
      if (Array.isArray(part.material)) {
        return part.material.map(m => makeRevealMaterial(m));
      }
      return makeRevealMaterial(part.material);
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
      {/* Gold outline (inverted hull) */}
      {meshParts.map((part, idx) => (
        <mesh key={`outline-${idx}`} geometry={part.geometry} material={outlineMaterial} />
      ))}
      {/* Reveal pass: renders only where the building is occluded by other geometry.
          depthFunc: GreaterEqual means fragments only pass where they are BEHIND
          what's already in the depth buffer — i.e. occluded by blocking buildings.
          renderOrder 999 ensures this runs after all normal scene geometry. */}
      {meshParts.map((part, idx) => (
        <mesh
          key={`reveal-${idx}`}
          geometry={part.geometry}
          material={revealMaterials[idx]}
          renderOrder={999}
        />
      ))}
    </group>
  );
}

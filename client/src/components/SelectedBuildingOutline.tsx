// Renders a backface-extruded outline around the selected building.
// Uses the "inverted hull" technique: slightly scaled-up geometry rendered
// with BackSide only, producing a visible outline behind the real mesh.

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

function extractGeometries(scene: THREE.Group): THREE.BufferGeometry[] {
  const results: THREE.BufferGeometry[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry.clone();
      mesh.updateWorldMatrix(true, false);
      geo.applyMatrix4(mesh.matrixWorld);
      results.push(geo);
    }
  });
  return results;
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
  const geometries = useMemo(
    () => extractGeometries(scene as unknown as THREE.Group),
    [scene],
  );

  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    geometries.forEach(g => {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    });
    return box;
  }, [geometries]);

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
      {geometries.map((geo, idx) => (
        <mesh key={idx} geometry={geo} material={outlineMaterial} />
      ))}
    </group>
  );
}

import { useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { computeRoadPlacements, type RoadPlacement, WORLD_SIZE, CHUNKS_PER_AXIS } from './cityGrid';

const CHUNK_WORLD = WORLD_SIZE / CHUNKS_PER_AXIS;
const ROAD_MODEL = '/models/roads/road-straight.glb';
useGLTF.preload(ROAD_MODEL);

// UV coordinates from Kenney colormap
const ROAD_UV: [number, number] = [0.0312, 0.875];       // #515566 road surface
const SIDEWALK_UV: [number, number] = [0.96875, 0.90625]; // #d5d5e5 curb highlight
const MARKING_UV: [number, number] = [0.28125, 0.90625];  // #8e95b3 center line marking

// Base plane geometries (rotated to XZ plane)
function makePlane(w: number, h: number, uv: [number, number]): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  const uvAttr = geo.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) uvAttr.setXY(i, uv[0], uv[1]);
  return geo;
}
const sidewalkPlane = makePlane(1, 1, SIDEWALK_UV);
const roadPlane     = makePlane(1, 0.8, ROAD_UV);
const markingPlane  = makePlane(0.5, 0.03, MARKING_UV);

/** Merge multiple sub-geometries (with Y offsets and optional Y rotation) into one. */
function mergeLayered(parts: { geo: THREE.BufferGeometry; y: number; rotY?: number }[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  let vOff = 0;
  for (const { geo, y, rotY = 0 } of parts) {
    const p = geo.attributes.position, u = geo.attributes.uv, n = geo.attributes.normal, ix = geo.index;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      pos.push(x * c - z * s, p.getY(i) + y, x * s + z * c);
      uv.push(u.getX(i), u.getY(i));
      if (n) {
        const nx = n.getX(i), nz = n.getZ(i);
        nrm.push(nx * c - nz * s, n.getY(i), nx * s + nz * c);
      } else {
        nrm.push(0, 1, 0);
      }
    }
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.array[i] + vOff);
    vOff += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setIndex(idx);
  return merged;
}

// Merged geometries: one draw call per tile type per chunk
const straightMerged = mergeLayered([
  { geo: sidewalkPlane, y: 0.015 },
  { geo: roadPlane,     y: 0.02 },
  { geo: markingPlane,  y: 0.021 },
]);  // 6 tris

const crossroadMerged = mergeLayered([
  { geo: sidewalkPlane, y: 0.015 },
  { geo: roadPlane,     y: 0.02 },
  { geo: roadPlane,     y: 0.02,  rotY: Math.PI / 2 },
  { geo: markingPlane,  y: 0.021 },
  { geo: markingPlane,  y: 0.021, rotY: Math.PI / 2 },
]);  // 10 tris


/** Bucket road placements into chunks by world position */
function chunkRoads(placements: RoadPlacement[]): Map<string, RoadPlacement[]> {
  const chunks = new Map<string, RoadPlacement[]>();
  for (const p of placements) {
    const cx = Math.min(Math.floor(p.x / CHUNK_WORLD), CHUNKS_PER_AXIS - 1);
    const cz = Math.min(Math.floor(p.z / CHUNK_WORLD), CHUNKS_PER_AXIS - 1);
    const key = `${cx}_${cz}`;
    let arr = chunks.get(key);
    if (!arr) { arr = []; chunks.set(key, arr); }
    arr.push(p);
  }
  return chunks;
}

/** Set instance matrices with rotation support */
function applyMatrices(mesh: THREE.InstancedMesh, placements: RoadPlacement[], y: number) {
  const rotM = new THREE.Matrix4();
  const posM = new THREE.Matrix4();
  const mat = new THREE.Matrix4();
  placements.forEach((p, i) => {
    rotM.makeRotationY(p.rotation);
    posM.makeTranslation(p.x + 0.5, y, p.z + 0.5);
    mat.multiplyMatrices(posM, rotM);
    mesh.setMatrixAt(i, mat);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function RoadChunk({ placements, material, geometry, name }: {
  placements: RoadPlacement[]; material: THREE.Material; geometry: THREE.BufferGeometry; name: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    if (placements.length === 0 || !meshRef.current) return;
    applyMatrices(meshRef.current, placements, 0);
    invalidate();
  }, [placements, invalidate]);

  if (placements.length === 0) return null;

  return (
    <instancedMesh
      name={name}
      ref={meshRef}
      args={[geometry, material, placements.length]}
      receiveShadow
    />
  );
}

export default function RoadNetwork3D() {
  // Extract the material from the GLTF model to guarantee identical color processing
  const { scene } = useGLTF(ROAD_MODEL);
  const material = useMemo(() => {
    let mat: THREE.Material | null = null;
    scene.traverse((child) => {
      if (!mat && child instanceof THREE.Mesh) {
        mat = child.material as THREE.Material;
      }
    });
    return mat!;
  }, [scene]);

  const { straights, crossroads } = useMemo(() => computeRoadPlacements(), []);
  const straightChunks = useMemo(() => chunkRoads(straights), [straights]);
  const crossroadChunks = useMemo(() => chunkRoads(crossroads), [crossroads]);

  const chunkKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const k of straightChunks.keys()) keys.add(k);
    for (const k of crossroadChunks.keys()) keys.add(k);
    return Array.from(keys);
  }, [straightChunks, crossroadChunks]);

  return (
    <group>
      {chunkKeys.map(key => {
        const sp = straightChunks.get(key);
        const cp = crossroadChunks.get(key);
        return (
          <group key={key}>
            {sp && sp.length > 0 && <RoadChunk placements={sp} material={material} geometry={straightMerged} name="Road-straight" />}
            {cp && cp.length > 0 && <RoadChunk placements={cp} material={material} geometry={crossroadMerged} name="Road-crossroad" />}
          </group>
        );
      })}
    </group>
  );
}

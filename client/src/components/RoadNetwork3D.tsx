import { useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { computeRoadPlacements, type RoadPlacement, WORLD_SIZE, CHUNKS_PER_AXIS } from './cityGrid';

const CHUNK_WORLD = WORLD_SIZE / CHUNKS_PER_AXIS;
const ROAD_MODEL = '/models/roads/road-straight.glb';
useGLTF.preload(ROAD_MODEL);

// Procedural geometries (2 tris each instead of 44/116 from GLTF)
// Straight road surface: narrower (0.8 perpendicular to road direction)
const straightGeometry = new THREE.PlaneGeometry(1, 0.8);
straightGeometry.rotateX(-Math.PI / 2);
// Crossroad surface: full tile
const crossroadGeometry = new THREE.PlaneGeometry(1, 1);
crossroadGeometry.rotateX(-Math.PI / 2);
// Sidewalk: full tile behind road surface
const sidewalkGeometry = new THREE.PlaneGeometry(1, 1);
sidewalkGeometry.rotateX(-Math.PI / 2);

// UV coordinates from Kenney colormap — shifted brighter to compensate for
// GLTF multi-UV interpolation that single-point sampling can't replicate
const ROAD_UV: [number, number] = [0.0312, 0.875];       // #515566 road surface
const SIDEWALK_UV: [number, number] = [0.96875, 0.90625]; // #d5d5e5 curb highlight (row 14, col 15)
const MARKING_UV: [number, number] = [0.28125, 0.90625];  // #8e95b3 center line marking

// Center line marking: short strip for dashed effect (gaps between tiles)
const markingGeometry = new THREE.PlaneGeometry(0.5, 0.03);
markingGeometry.rotateX(-Math.PI / 2);

function setPlaneUVs(geo: THREE.PlaneGeometry, uv: [number, number]) {
  const uvAttr = geo.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uv[0], uv[1]);
  }
}
setPlaneUVs(straightGeometry, ROAD_UV);
setPlaneUVs(crossroadGeometry, ROAD_UV);
setPlaneUVs(sidewalkGeometry, SIDEWALK_UV);
setPlaneUVs(markingGeometry, MARKING_UV);

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

function StraightChunk({ placements, material }: { placements: RoadPlacement[]; material: THREE.Material }) {
  const sidewalkRef = useRef<THREE.InstancedMesh>(null);
  const roadRef = useRef<THREE.InstancedMesh>(null);
  const markingRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    if (placements.length === 0) return;
    if (sidewalkRef.current) applyMatrices(sidewalkRef.current, placements, 0.015);
    if (roadRef.current) applyMatrices(roadRef.current, placements, 0.02);
    if (markingRef.current) applyMatrices(markingRef.current, placements, 0.021);
    invalidate();
  }, [placements, invalidate]);

  if (placements.length === 0) return null;

  return (
    <group>
      <instancedMesh
        name="Road-sidewalk"
        ref={sidewalkRef}
        args={[sidewalkGeometry, material, placements.length]}
        receiveShadow
      />
      <instancedMesh
        name="Road-straight"
        ref={roadRef}
        args={[straightGeometry, material, placements.length]}
        receiveShadow
      />
      <instancedMesh
        name="Road-marking"
        ref={markingRef}
        args={[markingGeometry, material, placements.length]}
        receiveShadow
      />
    </group>
  );
}

function CrossroadChunk({ placements, material }: { placements: RoadPlacement[]; material: THREE.Material }) {
  const sidewalkRef = useRef<THREE.InstancedMesh>(null);
  const bar1Ref = useRef<THREE.InstancedMesh>(null);
  const bar2Ref = useRef<THREE.InstancedMesh>(null);
  const mark1Ref = useRef<THREE.InstancedMesh>(null);
  const mark2Ref = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();

  // Build rotated placements for the perpendicular bar/marking
  const crossPlacements = useMemo(() =>
    placements.map(p => ({ ...p, rotation: p.rotation + Math.PI / 2 })),
    [placements]
  );

  useEffect(() => {
    if (placements.length === 0) return;
    if (sidewalkRef.current) applyMatrices(sidewalkRef.current, placements, 0.015);
    if (bar1Ref.current) applyMatrices(bar1Ref.current, placements, 0.02);
    if (bar2Ref.current) applyMatrices(bar2Ref.current, crossPlacements, 0.02);
    if (mark1Ref.current) applyMatrices(mark1Ref.current, placements, 0.021);
    if (mark2Ref.current) applyMatrices(mark2Ref.current, crossPlacements, 0.021);
    invalidate();
  }, [placements, crossPlacements, invalidate]);

  if (placements.length === 0) return null;

  return (
    <group>
      <instancedMesh
        name="Road-crossroad-sidewalk"
        ref={sidewalkRef}
        args={[sidewalkGeometry, material, placements.length]}
        receiveShadow
      />
      <instancedMesh
        name="Road-crossroad-bar1"
        ref={bar1Ref}
        args={[straightGeometry, material, placements.length]}
        receiveShadow
      />
      <instancedMesh
        name="Road-crossroad-bar2"
        ref={bar2Ref}
        args={[straightGeometry, material, placements.length]}
        receiveShadow
      />
      <instancedMesh
        name="Road-crossroad-mark1"
        ref={mark1Ref}
        args={[markingGeometry, material, placements.length]}
        receiveShadow
      />
      <instancedMesh
        name="Road-crossroad-mark2"
        ref={mark2Ref}
        args={[markingGeometry, material, placements.length]}
        receiveShadow
      />
    </group>
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
            {sp && sp.length > 0 && <StraightChunk placements={sp} material={material} />}
            {cp && cp.length > 0 && <CrossroadChunk placements={cp} material={material} />}
          </group>
        );
      })}
    </group>
  );
}

import { useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { getBuilding } from '../api';
import type { TileInfo, BuildingStatus } from '../types';
import { tileToWorld } from './cityGrid';

const COW_MODEL = '/models/animals/animal-cow.glb';
const DIRT_MODEL = '/models/buildings/farm/graveyard/grave.glb';
const GRASS_MODELS = [
  '/models/buildings/farm/pirate/grass.glb',
  '/models/buildings/farm/pirate/grass-plant.glb',
];

const COWS_PER_FARM = 1;
const COW_SCALE = 0.15;
const WANDER_RADIUS = 0.3;
const COW_SPEED = 0.12;
const IDLE_MIN = 2.0;
const IDLE_MAX = 5.0;
const GRASS_PER_TILE = 3;
const GRASS_SCALE = 0.2;
const DIRT_SCALE = 0.45;
const MOUNDS_PER_TILE = 2;

interface CowState {
  position: THREE.Vector3;
  target: THREE.Vector3;
  scene: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  walkAction: THREE.AnimationAction | null;
  idleAction: THREE.AnimationAction | null;
  centerX: number;
  centerZ: number;
  phase: 'walk' | 'idle';
  idleTimer: number;
  angle: number;
}

interface Props {
  tiles: Map<string, TileInfo>;
  buildings: BuildingStatus[];
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Static grass scattered on all field tiles ────────────────── */

const _m = new THREE.Matrix4();

function extractMesh(scene: THREE.Group) {
  let geo: THREE.BufferGeometry | null = null;
  let mat: THREE.Material | THREE.Material[] | null = null;
  scene.traverse((c) => {
    if (!geo && (c as THREE.Mesh).isMesh) {
      const m = c as THREE.Mesh;
      geo = m.geometry.clone();
      geo.applyMatrix4(c.matrixWorld);
      mat = m.material;
    }
  });
  return { geo: geo!, mat: mat! };
}

interface Placement { x: number; z: number; rot: number; s: number; y: number }

function FarmGrass({ fieldTiles, cattleTileIds }: { fieldTiles: TileInfo[]; cattleTileIds: Set<string> }) {
  const grass0 = useGLTF(GRASS_MODELS[0]);
  const grass1 = useGLTF(GRASS_MODELS[1]);
  const dirtGltf = useGLTF(DIRT_MODEL);
  const ref0 = useRef<THREE.InstancedMesh>(null!);
  const ref1 = useRef<THREE.InstancedMesh>(null!);
  const dirtRef = useRef<THREE.InstancedMesh>(null!);

  // Split: crop tiles get dirt + grass, cattle tiles get small grass only
  const cropTiles = useMemo(
    () => fieldTiles.filter((t) => !cattleTileIds.has(t.tile_id)),
    [fieldTiles, cattleTileIds]
  );
  const cattleTilesArr = useMemo(
    () => fieldTiles.filter((t) => cattleTileIds.has(t.tile_id)),
    [fieldTiles, cattleTileIds]
  );

  const { dirtGeo, dirtMat, geo0, mat0, geo1, mat1, placements0, placements1, dirtPlacements } = useMemo(() => {
    const { geo: dg, mat: dm } = extractMesh(dirtGltf.scene as unknown as THREE.Group);
    const { geo: g0, mat: m0 } = extractMesh(grass0.scene as unknown as THREE.Group);
    const { geo: g1, mat: m1 } = extractMesh(grass1.scene as unknown as THREE.Group);

    const p0: Placement[] = [];
    const p1: Placement[] = [];
    const dp: Placement[] = [];

    // Crop tiles: 2 dirt mounds side-by-side + grass on top
    for (const tile of cropTiles) {
      const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);
      const rng = mulberry32(tile.grid_x * 7919 + tile.grid_y * 6271);
      const tinyRot = () => (rng() - 0.5) * (10 * Math.PI / 180); // ±5 degrees

      // 2 mounds side by side, each with its own random offset
      const baseX = wx + 0.5;
      const gap = 0.12;
      const xOff1 = -(DIRT_SCALE * 0.5 + gap / 2);
      const xOff2 = DIRT_SCALE * 0.5 + gap / 2;

      const m1x = baseX + xOff1 + (rng() - 0.5) * 0.08;
      const m1z = wz + 0.4 + rng() * 0.2;
      dp.push({ x: m1x, z: m1z, rot: tinyRot(), s: DIRT_SCALE, y: 0.001 });
      // 1-2 grass on this mound, randomly offset from center
      const grassCount1 = rng() > 0.5 ? 2 : 1;
      for (let g = 0; g < grassCount1; g++) {
        const gs = GRASS_SCALE * (0.7 + rng() * 0.3);
        const gx = m1x + (rng() - 0.5) * DIRT_SCALE * 0.4;
        const gz = m1z + (rng() - 0.5) * DIRT_SCALE * 0.4;
        const target = rng() > 0.5 ? p0 : p1;
        target.push({ x: gx, z: gz, rot: tinyRot(), s: gs, y: 0.04 });
      }

      const m2x = baseX + xOff2 + (rng() - 0.5) * 0.08;
      const m2z = wz + 0.4 + rng() * 0.2;
      dp.push({ x: m2x, z: m2z, rot: tinyRot(), s: DIRT_SCALE, y: 0.001 });
      // 1-2 grass on this mound, randomly offset from center
      const grassCount2 = rng() > 0.5 ? 2 : 1;
      for (let g = 0; g < grassCount2; g++) {
        const gs = GRASS_SCALE * (0.7 + rng() * 0.3);
        const gx = m2x + (rng() - 0.5) * DIRT_SCALE * 0.4;
        const gz = m2z + (rng() - 0.5) * DIRT_SCALE * 0.4;
        const target = rng() > 0.5 ? p0 : p1;
        target.push({ x: gx, z: gz, rot: tinyRot(), s: gs, y: 0.04 });
      }
    }

    // Cattle tiles: 2 small grass pieces (no dirt)
    for (const tile of cattleTilesArr) {
      const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);
      const rng = mulberry32(tile.grid_x * 3571 + tile.grid_y * 2293);
      for (let i = 0; i < 2; i++) {
        const gx = wx + 0.15 + rng() * 0.7;
        const gz = wz + 0.15 + rng() * 0.7;
        const gs = GRASS_SCALE * 0.6;
        const target = rng() > 0.5 ? p0 : p1;
        target.push({ x: gx, z: gz, rot: rng() * Math.PI * 2, s: gs, y: 0 });
      }
    }

    return { dirtGeo: dg, dirtMat: dm, geo0: g0, mat0: m0, geo1: g1, mat1: m1, placements0: p0, placements1: p1, dirtPlacements: dp };
  }, [cropTiles, cattleTilesArr, grass0.scene, grass1.scene, dirtGltf.scene]);

  // Place dirt mounds
  useEffect(() => {
    const mesh = dirtRef.current;
    for (let i = 0; i < dirtPlacements.length; i++) {
      const p = dirtPlacements[i];
      _m.identity();
      _m.makeRotationY(p.rot);
      _m.scale(new THREE.Vector3(p.s, p.s, p.s));
      _m.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [dirtPlacements]);

  useEffect(() => {
    const mesh0 = ref0.current;
    for (let i = 0; i < placements0.length; i++) {
      const p = placements0[i];
      _m.identity();
      _m.makeRotationY(p.rot);
      _m.scale(new THREE.Vector3(p.s, p.s, p.s));
      _m.setPosition(p.x, p.y, p.z);
      mesh0.setMatrixAt(i, _m);
    }
    mesh0.instanceMatrix.needsUpdate = true;
  }, [placements0]);

  useEffect(() => {
    const mesh1 = ref1.current;
    for (let i = 0; i < placements1.length; i++) {
      const p = placements1[i];
      _m.identity();
      _m.makeRotationY(p.rot);
      _m.scale(new THREE.Vector3(p.s, p.s, p.s));
      _m.setPosition(p.x, p.y, p.z);
      mesh1.setMatrixAt(i, _m);
    }
    mesh1.instanceMatrix.needsUpdate = true;
  }, [placements1]);

  if (cropTiles.length === 0 || !dirtGeo || !geo0 || !geo1) return null;
  return (
    <>
      <instancedMesh ref={dirtRef} args={[dirtGeo, dirtMat as THREE.Material, dirtPlacements.length]} frustumCulled={false} />
      <instancedMesh ref={ref0} args={[geo0, mat0 as THREE.Material, placements0.length]} frustumCulled={false} />
      <instancedMesh ref={ref1} args={[geo1, mat1 as THREE.Material, placements1.length]} frustumCulled={false} />
    </>
  );
}

/* ── Animated cows on cattle farms ────────────────────────────── */

function CattleCows({ cattleTiles, cowScene, cowAnimations }: {
  cattleTiles: TileInfo[];
  cowScene: THREE.Object3D;
  cowAnimations: THREE.AnimationClip[];
}) {
  const cowsRef = useRef<CowState[]>([]);
  const groupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    if (cattleTiles.length === 0) return;
    const group = groupRef.current;
    while (group.children.length) group.remove(group.children[0]);
    cowsRef.current = [];

    const walkClip = cowAnimations.find((a) => a.name === 'walk');
    const idleClip = cowAnimations.find((a) => a.name === 'static');

    for (const tile of cattleTiles) {
      const [wx, wz] = tileToWorld(tile.grid_x, tile.grid_y);
      const centerX = wx + 0.5;
      const centerZ = wz + 0.5;
      const rng = mulberry32(tile.grid_x * 1000 + tile.grid_y);

      for (let i = 0; i < COWS_PER_FARM; i++) {
        const clone = skeletonClone(cowScene);
        clone.scale.setScalar(COW_SCALE);

        const angle = rng() * Math.PI * 2;
        const dist = rng() * WANDER_RADIUS;
        const startX = centerX + Math.cos(angle) * dist;
        const startZ = centerZ + Math.sin(angle) * dist;
        clone.position.set(startX, 0, startZ);
        clone.rotation.y = rng() * Math.PI * 2;

        const mixer = new THREE.AnimationMixer(clone);
        let walkAction: THREE.AnimationAction | null = null;
        let idleAction: THREE.AnimationAction | null = null;

        if (walkClip) {
          walkAction = mixer.clipAction(walkClip);
          walkAction.timeScale = 0.8 + rng() * 0.4;
        }
        if (idleClip) {
          idleAction = mixer.clipAction(idleClip);
          idleAction.play();
        }

        group.add(clone);
        cowsRef.current.push({
          position: new THREE.Vector3(startX, 0, startZ),
          target: new THREE.Vector3(startX, 0, startZ),
          scene: clone, mixer, walkAction, idleAction,
          centerX, centerZ,
          phase: 'idle',
          idleTimer: rng() * IDLE_MAX,
          angle: clone.rotation.y,
        });
      }
    }

    return () => {
      while (group.children.length) group.remove(group.children[0]);
      cowsRef.current = [];
    };
  }, [cattleTiles, cowScene, cowAnimations]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    for (const cow of cowsRef.current) {
      cow.mixer.update(dt);

      if (cow.phase === 'idle') {
        cow.idleTimer -= dt;
        if (cow.idleTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * WANDER_RADIUS;
          cow.target.set(cow.centerX + Math.cos(a) * r, 0, cow.centerZ + Math.sin(a) * r);
          cow.phase = 'walk';
          if (cow.walkAction && cow.idleAction) {
            cow.idleAction.fadeOut(0.3);
            cow.walkAction.reset().fadeIn(0.3).play();
          }
        }
      }

      if (cow.phase === 'walk') {
        const dx = cow.target.x - cow.position.x;
        const dz = cow.target.z - cow.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.02) {
          cow.phase = 'idle';
          cow.idleTimer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
          if (cow.walkAction && cow.idleAction) {
            cow.walkAction.fadeOut(0.3);
            cow.idleAction.reset().fadeIn(0.3).play();
          }
        } else {
          const step = Math.min(COW_SPEED * dt, dist);
          cow.position.x += (dx / dist) * step;
          cow.position.z += (dz / dist) * step;
          cow.scene.position.set(cow.position.x, 0, cow.position.z);
          const targetAngle = Math.atan2(dx, dz);
          cow.angle = targetAngle;
          cow.scene.rotation.y = targetAngle;
        }
      }
    }
  });

  return <group ref={groupRef} />;
}

/* ── Main component ───────────────────────────────────────────── */

export default function FarmAnimals({ tiles, buildings }: Props) {
  const { scene: cowScene, animations: cowAnimations } = useGLTF(COW_MODEL) as any;
  const [cattleTiles, setCattleTiles] = useState<TileInfo[]>([]);

  // All field tiles (for grass) — stabilized to prevent unnecessary re-renders
  const prevFieldKey = useRef('');
  const [fieldTiles, setFieldTiles] = useState<TileInfo[]>([]);
  useEffect(() => {
    const fields = Array.from(tiles.values()).filter(
      (t) => t.building_type?.toLowerCase() === 'field' && t.building_id
    );
    const key = fields.map(t => t.building_id).sort().join(',');
    if (key !== prevFieldKey.current) {
      prevFieldKey.current = key;
      setFieldTiles(fields);
    }
  }, [tiles]);

  // Stable lookup of own building output types (avoids re-running cattle detection on React Query refetches)
  const prevBuildingsKey = useRef('');
  const [outputByOwnBuilding, setOutputByOwnBuilding] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const key = buildings.map(b => `${b.building_id}:${b.output_type ?? ''}`).sort().join(',');
    if (key !== prevBuildingsKey.current) {
      prevBuildingsKey.current = key;
      const map = new Map<string, string>();
      for (const b of buildings) {
        if (b.output_type) map.set(b.building_id, b.output_type.toLowerCase());
      }
      setOutputByOwnBuilding(map);
    }
  }, [buildings]);

  // Identify cattle farms: use own buildings lookup, fetch others via API
  const prevCattleKey = useRef('');
  useEffect(() => {
    if (fieldTiles.length === 0) { setCattleTiles([]); return; }

    let cancelled = false;
    (async () => {
      const combined = new Map(outputByOwnBuilding);

      // For field tiles not in our buildings, fetch via API
      const unknownTiles = fieldTiles.filter(t => !combined.has(t.building_id));
      if (unknownTiles.length > 0) {
        const details = await Promise.all(
          unknownTiles.map(t => getBuilding(t.building_id).catch(() => null))
        );
        details.forEach((b) => {
          if (b?.building_id && b.output_type) {
            combined.set(b.building_id, b.output_type.toLowerCase());
          }
        });
      }

      if (cancelled) return;
      const result = fieldTiles.filter(t => combined.get(t.building_id) === 'cattle');
      // Only update state if the cattle tile set actually changed
      const key = result.map(t => t.tile_id).sort().join(',');
      if (key !== prevCattleKey.current) {
        prevCattleKey.current = key;
        setCattleTiles(result);
      }
    })();
    return () => { cancelled = true; };
  }, [fieldTiles, outputByOwnBuilding]);

  const cattleTileIds = useMemo(
    () => new Set(cattleTiles.map((t) => t.tile_id)),
    [cattleTiles]
  );

  if (fieldTiles.length === 0) return null;

  return (
    <>
      <FarmGrass fieldTiles={fieldTiles} cattleTileIds={cattleTileIds} />
      {cattleTiles.length > 0 && (
        <CattleCows
          cattleTiles={cattleTiles}
          cowScene={cowScene}
          cowAnimations={cowAnimations as THREE.AnimationClip[]}
        />
      )}
    </>
  );
}

useGLTF.preload(COW_MODEL);
useGLTF.preload(DIRT_MODEL);
GRASS_MODELS.forEach((m) => useGLTF.preload(m));

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { tileToWorld, BLOCK_SIZE, ROAD_WIDTH, GAME_GRID } from './cityGrid';
import type { SupplyRoute } from '../hooks/useAllPlayerSupplyLinks';

const CARS_PER_LINK = 2;
// Full round-trip: 3 s each way + 1 s dwell at destination = 7 s total.
const TRIP_DURATION = 7;
const DWELL_TIME    = 1.0;
const T_TRAVEL      = (TRIP_DURATION - DWELL_TIME) / 2; // 3 s per one-way trip

const CAR_Y        = 0.05;
const VEHICLE_SCALE = 0.20;
const LANE_OFFSET   = 0.25; // half-lane width offset from road centre

// ── Vehicle model URLs ────────────────────────────────────────────────────────
const VEHICLE_URLS = {
  van:          '/models/vehicles/van.glb',
  truck:        '/models/vehicles/truck.glb',
  truckFlat:    '/models/vehicles/truck-flat.glb',
  taxi:         '/models/vehicles/taxi.glb',
  suv:          '/models/vehicles/suv.glb',
  sedan:        '/models/vehicles/sedan.glb',
  sedanSports:  '/models/vehicles/sedan-sports.glb',
  delivery:     '/models/vehicles/delivery.glb',
  deliveryFlat: '/models/vehicles/delivery-flat.glb',
} as const;

type VehicleUrl = (typeof VEHICLE_URLS)[keyof typeof VEHICLE_URLS];
const ALL_URLS = Object.values(VEHICLE_URLS) as VehicleUrl[];
ALL_URLS.forEach((url) => useGLTF.preload(url));

function getModelUrl(resourceType: string, routeIndex: number): VehicleUrl {
  const r = resourceType.toLowerCase();
  if (r.includes('grain') || r.includes('wheat') || r.includes('flour') || r.includes('feed'))
    return VEHICLE_URLS.truckFlat;
  if (r.includes('cattle') || r.includes('meat') || r.includes('leather'))
    return VEHICLE_URLS.truck;
  if (r.includes('food'))  return VEHICLE_URLS.delivery;
  if (r.includes('water')) return VEHICLE_URLS.van;
  const civilians: VehicleUrl[] = [VEHICLE_URLS.sedan, VEHICLE_URLS.suv, VEHICLE_URLS.taxi, VEHICLE_URLS.sedanSports];
  return civilians[routeIndex % civilians.length];
}

// ── Road centre positions (world coords) ──────────────────────────────────────
const BLOCKS_PER_AXIS = GAME_GRID / BLOCK_SIZE;
const X_ROAD_CENTERS: number[] = [];
for (let b = 0; b < BLOCKS_PER_AXIS - 1; b++) {
  X_ROAD_CENTERS.push((b + 1) * BLOCK_SIZE + b * ROAD_WIDTH + 0.5);
}

const Y_CYCLE = 10, Y_BLUE = 3, Y_CYCLES = GAME_GRID / Y_CYCLE;
const Z_ROAD_CENTERS: number[] = [];
for (let c = 0; c < Y_CYCLES; c++) {
  Z_ROAD_CENTERS.push(c * (Y_CYCLE + 2) + Y_BLUE + 0.5);
  if (c < Y_CYCLES - 1) Z_ROAD_CENTERS.push(c * (Y_CYCLE + 2) + Y_CYCLE + 1 + 0.5);
}

function nearest(centers: number[], value: number): number {
  let best = centers[0], bestDist = Math.abs(centers[0] - value);
  for (const c of centers) {
    const d = Math.abs(c - value);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

// ── Right-side lane path builder ──────────────────────────────────────────────
// Takes 2-D waypoints (xz pairs) and returns 3-D Vector3 positions offset to
// the right-hand lane of each segment.  At corners the offset changes, which
// produces a natural-looking tight turn.
function buildLanePath(pts: [number, number][]): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    // Right-side offset: rotate direction 90° CW about Y → (dz, -dx) / len * OFFSET
    const [ox, oz] = len > 0.001
      ? [dz / len * LANE_OFFSET, -dx / len * LANE_OFFSET]
      : [0, 0];
    if (i === 0) result.push(new THREE.Vector3(ax + ox, CAR_Y, az + oz));
    result.push(new THREE.Vector3(bx + ox, CAR_Y, bz + oz));
  }
  return result;
}

// Base 2-D road waypoints (road-centre, no lane offset yet):
//   [0] horizontal road edge nearest source  (dwell A on return trip)
//   [1] crossroads corner
//   [2] vertical road edge nearest destination (dwell B on forward trip)
function getRoadWaypoints(fromWorld: [number, number], toWorld: [number, number]): [number, number][] {
  const [fx, fz] = fromWorld, [tx, tz] = toWorld;
  const fromX = fx + 0.5, fromZ = fz + 0.5;
  const toX   = tx + 0.5, toZ   = tz + 0.5;
  const nearZ = nearest(Z_ROAD_CENTERS, (fromZ + toZ) / 2);
  const nearX = nearest(X_ROAD_CENTERS, (fromX + toX) / 2);
  return [[fromX, nearZ], [nearX, nearZ], [nearX, toZ]];
}

function pathLength(path: THREE.Vector3[]): number {
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) len += path[i].distanceTo(path[i + 1]);
  return len;
}

// Module-level temporaries (safe: useFrame is single-threaded).
const _seg    = new THREE.Vector3();
const _outPos = new THREE.Vector3();
let   _outAngle = 0;

function samplePath(path: THREE.Vector3[], dist: number): void {
  let remaining = Math.max(0, dist);
  for (let i = 0; i < path.length - 1; i++) {
    _seg.subVectors(path[i + 1], path[i]);
    const segLen = _seg.length();
    if (remaining <= segLen || i === path.length - 2) {
      const t = segLen > 0.001 ? Math.min(remaining / segLen, 1) : 0;
      _outPos.lerpVectors(path[i], path[i + 1], t);
      if (segLen > 0.001) _outAngle = Math.atan2(_seg.x, _seg.z);
      return;
    }
    remaining -= segLen;
  }
  _outPos.copy(path[path.length - 1]);
}

// ── Per-vehicle animated mesh ─────────────────────────────────────────────────
interface VehicleProps {
  path: THREE.Vector3[];
  reversedPath: THREE.Vector3[];
  totalLen: number;
  phase: number;
  scene: THREE.Group;
}

function Vehicle({ path, reversedPath, totalLen, phase, scene }: VehicleProps) {
  const groupRef  = useRef<THREE.Group>(null!);
  const cloned    = useMemo(() => scene.clone(true), [scene]);
  const lastAngle = useRef(0);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const raw    = clock.getElapsedTime() + phase * TRIP_DURATION;
    const cycleT = ((raw % TRIP_DURATION) + TRIP_DURATION) % TRIP_DURATION;

    // 0..T_TRAVEL          → forward travel
    // T_TRAVEL..T_TRAVEL+DWELL → dwell at destination road edge
    // rest                 → return travel (no dwell at source)
    const T1 = T_TRAVEL;
    const T2 = T1 + DWELL_TIME;

    if (cycleT < T1) {
      samplePath(path, (cycleT / T1) * totalLen);
      lastAngle.current = _outAngle;
    } else if (cycleT < T2) {
      _outPos.copy(path[path.length - 1]);
    } else {
      samplePath(reversedPath, ((cycleT - T2) / T_TRAVEL) * totalLen);
      lastAngle.current = _outAngle;
    }

    group.position.copy(_outPos);
    group.rotation.y = lastAngle.current;
  });

  return (
    <group ref={groupRef} scale={VEHICLE_SCALE}>
      <primitive object={cloned} />
    </group>
  );
}

// ── One component per model URL (fixed count = fixed hooks) ───────────────────
interface VehicleEntry {
  id: string;
  path: THREE.Vector3[];
  reversedPath: THREE.Vector3[];
  totalLen: number;
  phase: number;
  modelUrl: VehicleUrl;
}

function VehicleGroupByModel({ modelUrl, all }: { modelUrl: VehicleUrl; all: VehicleEntry[] }) {
  const { scene } = useGLTF(modelUrl);
  const matching  = all.filter((v) => v.modelUrl === modelUrl);
  if (matching.length === 0) return null;
  return (
    <>
      {matching.map((v) => (
        <Vehicle
          key={v.id}
          path={v.path}
          reversedPath={v.reversedPath}
          totalLen={v.totalLen}
          phase={v.phase}
          scene={scene as THREE.Group}
        />
      ))}
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface Props { routes: SupplyRoute[] }

export default function SupplyVehicles3D({ routes }: Props) {
  const all = useMemo<VehicleEntry[]>(() => {
    const out: VehicleEntry[] = [];
    routes.forEach((r, ri) => {
      const wp      = getRoadWaypoints(tileToWorld(r.fromX, r.fromY), tileToWorld(r.toX, r.toY));
      const fwd     = buildLanePath(wp);
      const rev     = buildLanePath([...wp].reverse() as [number, number][]);
      const total   = pathLength(fwd);
      const url     = getModelUrl(r.resourceType, ri);
      for (let i = 0; i < CARS_PER_LINK; i++) {
        out.push({ id: `${r.id}-${i}`, path: fwd, reversedPath: rev, totalLen: total, phase: i / CARS_PER_LINK, modelUrl: url });
      }
    });
    return out;
  }, [routes]);

  if (all.length === 0) return null;

  return (
    <>
      {ALL_URLS.map((url) => (
        <VehicleGroupByModel key={url} modelUrl={url} all={all} />
      ))}
    </>
  );
}

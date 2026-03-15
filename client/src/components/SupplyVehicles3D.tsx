import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { tileToWorld, BLOCK_SIZE, ROAD_WIDTH, GAME_GRID } from './cityGrid';
import type { SupplyRoute } from '../hooks/useAllPlayerSupplyLinks';

const CARS_PER_LINK   = 1;
const VEHICLE_SPEED   = 1;   // world-units per second (same for every vehicle)
const DWELL_TIME      = 3.5; // seconds parked at destination road edge
const LANE_OFFSET     = 0.25; // metres from road centre to lane centre

const CAR_Y         = 0.05;
const VEHICLE_SCALE = 0.20;

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

<<<<<<< HEAD
function nearest(centers: number[], value: number): number {
  let best = centers[0], bestDist = Math.abs(centers[0] - value);
  for (const c of centers) {
    const d = Math.abs(c - value);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

// ── Lane path builder ─────────────────────────────────────────────────────────
// Shape per segment: start-centre → mid-lane → end.
// Intermediate waypoints (crossings) always use road centre for clean turns.
// The last waypoint optionally stays in lane (set stayInLaneAtEnd=true for the
// forward path so the vehicle arrives in lane without drifting toward the building).
function buildLanePath(pts: [number, number][], stayInLaneAtEnd = false): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  const last = pts.length - 2; // index of last segment
  for (let i = 0; i <= last; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    // Right-hand lane offset: rotate direction 90° CCW about Y → (-dz, dx)
    const [ox, oz] = len > 0.001
      ? [-dz / len * LANE_OFFSET, dx / len * LANE_OFFSET]
      : [0, 0];

    // Segment start: always road centre
    if (i === 0) result.push(new THREE.Vector3(ax, CAR_Y, az));

    // Mid-segment: in the right lane
    const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
    result.push(new THREE.Vector3(midX + ox, CAR_Y, midZ + oz));

    // Segment end: road centre at crossings; stay in lane at the dwell point
    if (i === last && stayInLaneAtEnd) {
      result.push(new THREE.Vector3(bx + ox, CAR_Y, bz + oz));
    } else {
      result.push(new THREE.Vector3(bx, CAR_Y, bz));
    }
  }
  return result;
}

// Base 2-D road waypoints (road centre, no lane offset):
//   [0]  horizontal road edge nearest source  (stop on return)
//   [1]  crossroads corner
//   [2]  vertical road edge nearest destination (dwell stop)
function getRoadWaypoints(fromWorld: [number, number], toWorld: [number, number]): [number, number][] {
  const [fx, fz] = fromWorld, [tx, tz] = toWorld;
  const nearZ = nearest(Z_ROAD_CENTERS, fz + 0.5); // Z road nearest source tile
  const nearX = nearest(X_ROAD_CENTERS, tx + 0.5); // X road nearest destination tile
  return [[fx + 0.5, nearZ], [nearX, nearZ], [nearX, tz + 0.5]];
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
// Dwell sub-phase fractions (of DWELL_TIME):
const DPARK_ROT_END  = 0.25; // 0.00–0.25 rotate to park angle
const DPARK_BACK_END = 0.50; // 0.25–0.50 reverse toward building
const DPARK_HOLD_END = 0.70; // 0.50–0.70 hold at parked spot
                              // 0.70–1.00 drive forward back to road centre
const PARK_REVERSE_DIST = 0.45; // units to back toward building from road centre

const _parkVec = new THREE.Vector3(); // reusable temp for parking offset

interface VehicleProps {
  path: THREE.Vector3[];
  reversedPath: THREE.Vector3[];
  totalLen: number;
  tTravel: number;
  tripDuration: number;
  phase: number;
  parkAngle: number; // rotation angle when backed up to building (rear toward destination tile)
  scene: THREE.Group;
}

function Vehicle({ path, reversedPath, totalLen, tTravel, tripDuration, phase, parkAngle, scene }: VehicleProps) {
  const groupRef      = useRef<THREE.Group>(null!);
  const cloned        = useMemo(() => scene.clone(true), [scene]);
  const dwellPos      = useRef(new THREE.Vector3());
  const approachAngle = useRef(0);

  // The first point of the reversed path is road centre at the dwell location —
  // Phase 4 ends here so the return trip begins with no teleport.
  const returnStart = useMemo(() => reversedPath[0].clone(), [reversedPath]);

  // Departure heading: direction from dwell road-centre (index 0) to the
  // crossing road-centre (index 2), ignoring the lane-offset midpoint (index 1).
  const departureAngle = useMemo(() => {
    if (reversedPath.length < 3) {
      if (reversedPath.length < 2) return 0;
      return Math.atan2(reversedPath[1].x - reversedPath[0].x, reversedPath[1].z - reversedPath[0].z);
    }
    return Math.atan2(reversedPath[2].x - reversedPath[0].x, reversedPath[2].z - reversedPath[0].z);
  }, [reversedPath]);

  // Direction the vehicle reverses toward: rear faces building, so back = -front
  // parkAngle is ±π/2, so sin(parkAngle) = ±1, cos = 0 → reverse is purely in X
  const reverseDirX = -Math.sin(parkAngle);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    const raw    = clock.getElapsedTime() + phase * tripDuration;
    const cycleT = ((raw % tripDuration) + tripDuration) % tripDuration;

    const T1 = tTravel;
    const T2 = T1 + DWELL_TIME;

    if (cycleT < T1) {
      samplePath(path, (cycleT / T1) * totalLen);
      dwellPos.current.copy(_outPos);
      approachAngle.current = _outAngle;
      group.position.copy(_outPos);
      group.rotation.y = _outAngle;
    } else if (cycleT < T2) {
      const dwellFrac = (cycleT - T1) / DWELL_TIME;

      if (dwellFrac < DPARK_ROT_END) {
        // Phase 1: rotate from approach angle to park angle
        group.position.copy(dwellPos.current);
        const t = dwellFrac / DPARK_ROT_END;
        const smooth = t * t * (3 - 2 * t);
        const delta = ((parkAngle - approachAngle.current) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        group.rotation.y = approachAngle.current + delta * smooth;
      } else if (dwellFrac < DPARK_BACK_END) {
        // Phase 2: reverse toward building
        const t = (dwellFrac - DPARK_ROT_END) / (DPARK_BACK_END - DPARK_ROT_END);
        const smooth = t * t * (3 - 2 * t);
        _parkVec.set(reverseDirX * PARK_REVERSE_DIST * smooth, 0, 0);
        group.position.copy(dwellPos.current).add(_parkVec);
        group.rotation.y = parkAngle;
      } else if (dwellFrac < DPARK_HOLD_END) {
        // Phase 3: hold at parked spot
        _parkVec.set(reverseDirX * PARK_REVERSE_DIST, 0, 0);
        group.position.copy(dwellPos.current).add(_parkVec);
        group.rotation.y = parkAngle;
      } else {
        // Phase 4: pull forward from parked spot → return-trip start (road centre),
        // rotating to departure heading. Ends exactly at reversedPath[0] → no teleport.
        const t = (dwellFrac - DPARK_HOLD_END) / (1.0 - DPARK_HOLD_END);
        const smooth = t * t * (3 - 2 * t);
        const px = dwellPos.current.x + reverseDirX * PARK_REVERSE_DIST;
        const pz = dwellPos.current.z;
        group.position.set(
          px + (returnStart.x - px) * smooth,
          CAR_Y,
          pz + (returnStart.z - pz) * smooth,
        );
        const delta = ((departureAngle - parkAngle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        group.rotation.y = parkAngle + delta * smooth;
      }
    } else {
      samplePath(reversedPath, ((cycleT - T2) / tTravel) * totalLen);
      group.position.copy(_outPos);
      group.rotation.y = _outAngle;
    }
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
  tTravel: number;
  tripDuration: number;
  phase: number;
  parkAngle: number;
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
          tTravel={v.tTravel}
          tripDuration={v.tripDuration}
          phase={v.phase}
          parkAngle={v.parkAngle}
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
      const toWorld  = tileToWorld(r.toX, r.toY);
      const wp       = getRoadWaypoints(tileToWorld(r.fromX, r.fromY), toWorld);
      const fwd      = buildLanePath(wp, true);   // arrives in lane at dwell point
      const rev      = buildLanePath([...wp].reverse() as [number, number][]);
      const len      = pathLength(fwd);
      const tT       = len / VEHICLE_SPEED;
      const trip     = tT * 2 + DWELL_TIME;
      const url      = getModelUrl(r.resourceType, ri);
      // Rear of vehicle faces the destination tile: front faces away from building
      const nearX    = wp[1][0]; // vertical road X (dwell point X)
      const toXctr   = toWorld[0] + 0.5; // destination tile centre X
      const parkAngle = Math.atan2(nearX - toXctr, 0);
      for (let i = 0; i < CARS_PER_LINK; i++) {
        out.push({ id: `${r.id}-${i}`, path: fwd, reversedPath: rev, totalLen: len, tTravel: tT, tripDuration: trip, phase: i / CARS_PER_LINK, parkAngle, modelUrl: url });
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

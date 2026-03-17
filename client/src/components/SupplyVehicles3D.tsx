import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
const _tempMatrix = new THREE.Matrix4();
const _tempScale = new THREE.Vector3();

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

// ── Mesh extraction for instanced rendering ───────────────────────────────────

// Dwell sub-phase fractions (of DWELL_TIME):
const DPARK_ROT_END  = 0.25; // 0.00–0.25 rotate to park angle
const DPARK_BACK_END = 0.50; // 0.25–0.50 reverse toward building
const DPARK_HOLD_END = 0.70; // 0.50–0.70 hold at parked spot
                              // 0.70–1.00 drive forward back to road centre
const PARK_REVERSE_DIST = 0.45; // units to back toward building from road centre

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

// ── Per-vehicle animation state ───────────────────────────────────────────────

interface VehicleAnimState {
  dwellPos: THREE.Vector3;
  approachAngle: number;
}

// ── Vehicle entry with precomputed animation data ─────────────────────────────

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
  returnStart: THREE.Vector3;
  departureAngle: number;
  reverseDirX: number;
}

// ── Instanced vehicle group per model URL ─────────────────────────────────────

function VehicleGroupByModel({ modelUrl, vehicles }: { modelUrl: VehicleUrl; vehicles: VehicleEntry[] }) {
  const { scene } = useGLTF(modelUrl);
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  const meshParts = useMemo(() => extractMeshes(scene as THREE.Group), [scene]);

  const animState = useRef<VehicleAnimState[]>([]);
  useEffect(() => {
    animState.current = vehicles.map(() => ({
      dwellPos: new THREE.Vector3(),
      approachAngle: 0,
    }));
  }, [vehicles]);

  useFrame(({ clock }) => {
    const count = vehicles.length;
    if (count === 0 || animState.current.length !== count) return;

    for (let vi = 0; vi < count; vi++) {
      const v = vehicles[vi];
      const s = animState.current[vi];

      const raw = clock.getElapsedTime() + v.phase * v.tripDuration;
      const cycleT = ((raw % v.tripDuration) + v.tripDuration) % v.tripDuration;
      const T1 = v.tTravel;
      const T2 = T1 + DWELL_TIME;

      let posX: number, posZ: number, rotY: number;

      if (cycleT < T1) {
        // Forward travel
        samplePath(v.path, (cycleT / T1) * v.totalLen);
        s.dwellPos.copy(_outPos);
        s.approachAngle = _outAngle;
        posX = _outPos.x; posZ = _outPos.z;
        rotY = _outAngle;
      } else if (cycleT < T2) {
        const dwellFrac = (cycleT - T1) / DWELL_TIME;

        if (dwellFrac < DPARK_ROT_END) {
          // Rotate from approach angle to park angle
          posX = s.dwellPos.x; posZ = s.dwellPos.z;
          const t = dwellFrac / DPARK_ROT_END;
          const smooth = t * t * (3 - 2 * t);
          const delta = ((v.parkAngle - s.approachAngle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          rotY = s.approachAngle + delta * smooth;
        } else if (dwellFrac < DPARK_BACK_END) {
          // Reverse toward building
          const t = (dwellFrac - DPARK_ROT_END) / (DPARK_BACK_END - DPARK_ROT_END);
          const smooth = t * t * (3 - 2 * t);
          posX = s.dwellPos.x + v.reverseDirX * PARK_REVERSE_DIST * smooth;
          posZ = s.dwellPos.z;
          rotY = v.parkAngle;
        } else if (dwellFrac < DPARK_HOLD_END) {
          // Hold at parked spot
          posX = s.dwellPos.x + v.reverseDirX * PARK_REVERSE_DIST;
          posZ = s.dwellPos.z;
          rotY = v.parkAngle;
        } else {
          // Pull forward to road centre, rotating to departure heading
          const t = (dwellFrac - DPARK_HOLD_END) / (1.0 - DPARK_HOLD_END);
          const smooth = t * t * (3 - 2 * t);
          const px = s.dwellPos.x + v.reverseDirX * PARK_REVERSE_DIST;
          const pz = s.dwellPos.z;
          posX = px + (v.returnStart.x - px) * smooth;
          posZ = pz + (v.returnStart.z - pz) * smooth;
          const delta = ((v.departureAngle - v.parkAngle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          rotY = v.parkAngle + delta * smooth;
        }
      } else {
        // Return travel
        samplePath(v.reversedPath, ((cycleT - T2) / v.tTravel) * v.totalLen);
        posX = _outPos.x; posZ = _outPos.z;
        rotY = _outAngle;
      }

      _tempMatrix.makeRotationY(rotY);
      _tempScale.set(VEHICLE_SCALE, VEHICLE_SCALE, VEHICLE_SCALE);
      _tempMatrix.scale(_tempScale);
      _tempMatrix.setPosition(posX, CAR_Y, posZ);

      for (const mesh of meshRefs.current) {
        if (mesh) mesh.setMatrixAt(vi, _tempMatrix);
      }
    }

    for (const mesh of meshRefs.current) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (vehicles.length === 0 || meshParts.length === 0) return null;

  return (
    <>
      {meshParts.map((part, idx) => (
        <instancedMesh
          key={idx}
          ref={el => { meshRefs.current[idx] = el; }}
          args={[part.geometry, part.material as THREE.Material, vehicles.length]}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

const MIN_FPS = 30;

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

      // Precompute per-vehicle animation constants
      const returnStart = rev[0].clone();
      const departureAngle = rev.length < 3
        ? (rev.length < 2 ? 0 : Math.atan2(rev[1].x - rev[0].x, rev[1].z - rev[0].z))
        : Math.atan2(rev[2].x - rev[0].x, rev[2].z - rev[0].z);
      const reverseDirX = -Math.sin(parkAngle);

      for (let i = 0; i < CARS_PER_LINK; i++) {
        out.push({
          id: `${r.id}-${i}`, path: fwd, reversedPath: rev, totalLen: len,
          tTravel: tT, tripDuration: trip, phase: i / CARS_PER_LINK, parkAngle,
          modelUrl: url, returnStart, departureAngle, reverseDirX,
        });
      }
    });
    return out;
  }, [routes]);

  const vehiclesByUrl = useMemo(() => {
    const map = new Map<VehicleUrl, VehicleEntry[]>();
    for (const v of all) {
      let arr = map.get(v.modelUrl);
      if (!arr) { arr = []; map.set(v.modelUrl, arr); }
      arr.push(v);
    }
    return map;
  }, [all]);

  if (all.length === 0) return null;

  return <VehicleRenderer all={all} vehiclesByUrl={vehiclesByUrl} />;
}

function VehicleRenderer({ all, vehiclesByUrl }: { all: VehicleEntry[]; vehiclesByUrl: Map<VehicleUrl, VehicleEntry[]> }) {
  const { invalidate } = useThree();

  // Drive render loop at MIN_FPS when vehicles are on screen
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / MIN_FPS);
    return () => clearInterval(id);
  }, [invalidate]);

  return (
    <>
      {ALL_URLS.map((url) => {
        const vehicles = vehiclesByUrl.get(url);
        if (!vehicles || vehicles.length === 0) return null;
        return <VehicleGroupByModel key={url} modelUrl={url} vehicles={vehicles} />;
      })}
    </>
  );
}

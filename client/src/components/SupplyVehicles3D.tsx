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
const X_ROADS: number[] = [];
for (let b = 0; b < BLOCKS_PER_AXIS - 1; b++) {
  X_ROADS.push((b + 1) * BLOCK_SIZE + b * ROAD_WIDTH + 0.5);
}

const Y_CYCLE = 10, Y_BLUE = 3, Y_CYCLES = GAME_GRID / Y_CYCLE;
const Z_ROADS: number[] = [];
for (let c = 0; c < Y_CYCLES; c++) {
  Z_ROADS.push(c * (Y_CYCLE + 2) + Y_BLUE + 0.5);
  if (c < Y_CYCLES - 1) Z_ROADS.push(c * (Y_CYCLE + 2) + Y_CYCLE + 1 + 0.5);
}


function nearest(centers: number[], value: number): number {
  let best = centers[0], bestDist = Math.abs(centers[0] - value);
  for (const c of centers) {
    const d = Math.abs(c - value);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

// ── Road-graph pathfinding ────────────────────────────────────────────────────
// Nodes are intersections + endpoints along roads.
// Find a Manhattan-style path from source road edge to destination road edge,
// following actual road lines and turning only at intersections.

function findRoadPath(fromWorld: [number, number], toWorld: [number, number]): [number, number][] {
  const [fx, fz] = fromWorld;
  const [tx, tz] = toWorld;

  // Find nearest roads to source and destination
  const srcX = fx + 0.5;
  const srcZ = nearest(Z_ROADS, fz + 0.5);
  const dstX = nearest(X_ROADS, tx + 0.5);
  const dstZ = tz + 0.5;

  // If source and destination are on the same horizontal road, go direct
  if (Math.abs(srcZ - dstZ) < 0.01) {
    return [[srcX, srcZ], [dstX, dstZ]];
  }

  // If source and destination share the same vertical road
  if (Math.abs(srcX - dstX) < 0.01) {
    return [[srcX, srcZ], [dstX, dstZ]];
  }

  // Standard L-shaped path: horizontal to intersection, then vertical
  // But check if a better path exists via BFS on intersections

  // Gather all intersections reachable
  const intersections: [number, number][] = [];
  for (const rx of X_ROADS) {
    for (const rz of Z_ROADS) {
      intersections.push([rx, rz]);
    }
  }

  // Simple approach: pick the intersection that minimizes total distance
  // while creating a natural-looking route

  // For most routes, the L-shape through (dstX, srcZ) or (srcX-road, dstZ-road) works.
  // Let's pick the nearest X-road to source for the vertical leg,
  // and nearest Z-road to destination for the horizontal leg.

  const nearSrcX = nearest(X_ROADS, srcX);
  const nearDstZ = nearest(Z_ROADS, dstZ);

  // Option A: go to nearest vertical road, travel vertically, then horizontally
  const pathA: [number, number][] = [
    [srcX, srcZ],
    [nearSrcX, srcZ],  // drive to nearest vertical road on source's horizontal road
    [nearSrcX, nearDstZ], // travel down the vertical road
    [dstX, nearDstZ],  // travel on destination's horizontal road
    [dstX, dstZ],
  ];

  // Option B: go horizontally to destination's vertical road, then vertically
  const pathB: [number, number][] = [
    [srcX, srcZ],
    [dstX, srcZ],       // drive along source horizontal road
    [dstX, dstZ],       // drive down destination vertical road
  ];

  // Remove redundant waypoints (same position)
  function dedupe(pts: [number, number][]): [number, number][] {
    const result: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [px, pz] = result[result.length - 1];
      const [cx, cz] = pts[i];
      if (Math.abs(px - cx) > 0.01 || Math.abs(pz - cz) > 0.01) {
        result.push(pts[i]);
      }
    }
    return result;
  }

  const a = dedupe(pathA);
  const b = dedupe(pathB);

  // Pick the shorter path
  const lenA = a.reduce((s, p, i) => i === 0 ? 0 : s + Math.hypot(p[0] - a[i-1][0], p[1] - a[i-1][1]), 0);
  const lenB = b.reduce((s, p, i) => i === 0 ? 0 : s + Math.hypot(p[0] - b[i-1][0], p[1] - b[i-1][1]), 0);

  return lenA < lenB ? a : b;
}

// ── Lane-offset waypoints ─────────────────────────────────────────────────────
// Apply right-hand-drive lane offset to road-centre waypoints.
// Each straight segment gets offset perpendicular to travel direction.

function applyLaneOffset(pts: [number, number][]): THREE.Vector3[] {
  if (pts.length < 2) return pts.map(([x, z]) => new THREE.Vector3(x, CAR_Y, z));

  const result: THREE.Vector3[] = [];

  for (let i = 0; i < pts.length; i++) {
    const [cx, cz] = pts[i];

    // Determine direction at this point (average of incoming and outgoing)
    let dx = 0, dz = 0;
    if (i < pts.length - 1) {
      dx += pts[i + 1][0] - cx;
      dz += pts[i + 1][1] - cz;
    }
    if (i > 0) {
      dx += cx - pts[i - 1][0];
      dz += cz - pts[i - 1][1];
    }
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) {
      // Right-hand offset: perpendicular CCW in XZ plane → (-dz, dx)
      const ox = (-dz / len) * LANE_OFFSET;
      const oz = (dx / len) * LANE_OFFSET;
      result.push(new THREE.Vector3(cx + ox, CAR_Y, cz + oz));
    } else {
      result.push(new THREE.Vector3(cx, CAR_Y, cz));
    }
  }

  return result;
}

// ── Smooth curve from waypoints ───────────────────────────────────────────────
// Uses CatmullRomCurve3 for smooth turns at intersections.

const CURVE_DIVISIONS = 64; // samples per curve for even spacing

interface SmoothPath {
  points: THREE.Vector3[];   // evenly spaced sample points
  totalLen: number;
}

function buildSmoothPath(laneWaypoints: THREE.Vector3[]): SmoothPath {
  if (laneWaypoints.length < 2) {
    return { points: laneWaypoints, totalLen: 0 };
  }

  // For 2 points, just use linear
  if (laneWaypoints.length === 2) {
    const pts = [laneWaypoints[0].clone(), laneWaypoints[1].clone()];
    return { points: pts, totalLen: laneWaypoints[0].distanceTo(laneWaypoints[1]) };
  }

  const curve = new THREE.CatmullRomCurve3(laneWaypoints, false, 'centripetal', 0.35);
  const pts = curve.getSpacedPoints(CURVE_DIVISIONS);
  let totalLen = 0;
  for (let i = 0; i < pts.length - 1; i++) totalLen += pts[i].distanceTo(pts[i + 1]);
  return { points: pts, totalLen };
}

// Module-level temporaries (safe: useFrame is single-threaded).
const _outPos = new THREE.Vector3();
let   _outAngle = 0;
const _tempMatrix = new THREE.Matrix4();
const _tempScale = new THREE.Vector3();

function sampleSmoothPath(points: THREE.Vector3[], totalLen: number, dist: number): void {
  if (points.length < 2) {
    if (points.length === 1) _outPos.copy(points[0]);
    _outAngle = 0;
    return;
  }

  let remaining = Math.max(0, Math.min(dist, totalLen));
  for (let i = 0; i < points.length - 1; i++) {
    const segLen = points[i].distanceTo(points[i + 1]);
    if (remaining <= segLen || i === points.length - 2) {
      const t = segLen > 0.001 ? Math.min(remaining / segLen, 1) : 0;
      _outPos.lerpVectors(points[i], points[i + 1], t);
      // Tangent-based rotation from segment direction
      const dx = points[i + 1].x - points[i].x;
      const dz = points[i + 1].z - points[i].z;
      if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) {
        _outAngle = Math.atan2(dx, dz);
      }
      return;
    }
    remaining -= segLen;
  }
  _outPos.copy(points[points.length - 1]);
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
  fwdPoints: THREE.Vector3[];
  revPoints: THREE.Vector3[];
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
        // Forward travel along smooth curve
        sampleSmoothPath(v.fwdPoints, v.totalLen, (cycleT / T1) * v.totalLen);
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
        // Return travel along smooth curve
        sampleSmoothPath(v.revPoints, v.totalLen, ((cycleT - T2) / v.tTravel) * v.totalLen);
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
      const fromW = tileToWorld(r.fromX, r.fromY);
      const toW   = tileToWorld(r.toX, r.toY);

      // Build road-following waypoints
      const wp = findRoadPath(fromW, toW);
      const revWp = [...wp].reverse() as [number, number][];

      // Apply lane offsets and smooth into curves
      const fwdLane = applyLaneOffset(wp);
      const revLane = applyLaneOffset(revWp);
      const fwd = buildSmoothPath(fwdLane);
      const rev = buildSmoothPath(revLane);

      const len = fwd.totalLen;
      const tT  = len / VEHICLE_SPEED;
      const trip = tT * 2 + DWELL_TIME;
      const url  = getModelUrl(r.resourceType, ri);

      // Park angle: rear faces destination tile
      const lastWp = wp[wp.length - 1];
      const toXctr = toW[0] + 0.5;
      const parkAngle = Math.atan2(lastWp[0] - toXctr, 0);

      // Precompute return animation constants
      const returnStart = rev.points[0].clone();
      const departureAngle = rev.points.length < 3
        ? (rev.points.length < 2 ? 0 : Math.atan2(rev.points[1].x - rev.points[0].x, rev.points[1].z - rev.points[0].z))
        : Math.atan2(rev.points[2].x - rev.points[0].x, rev.points[2].z - rev.points[0].z);
      const reverseDirX = -Math.sin(parkAngle);

      for (let i = 0; i < CARS_PER_LINK; i++) {
        out.push({
          id: `${r.id}-${i}`,
          fwdPoints: fwd.points,
          revPoints: rev.points,
          totalLen: len,
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

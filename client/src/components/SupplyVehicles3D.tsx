import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { tileToWorld } from './cityGrid';
import type { SupplyRoute } from '../hooks/useAllPlayerSupplyLinks';

// Two vehicles per supply link, evenly spaced so they never meet.
const CARS_PER_LINK = 2;
// Route cycles per second — full trip (supplier → consumer) in ~7 s.
const CAR_SPEED = 0.14;
const CAR_HEIGHT = 0.25;

const RESOURCE_COLORS: Record<string, string> = {
  grain:       '#D4AC0D',
  water:       '#2196F3',
  animal_feed: '#8D6E63',
  cattle:      '#6D4C41',
  meat:        '#C62828',
  leather:     '#A1887F',
  food:        '#EF6C00',
};

function routeColor(resourceType: string): THREE.Color {
  const hex = RESOURCE_COLORS[resourceType.toLowerCase()] ?? '#9E9E9E';
  return new THREE.Color(hex);
}

interface CarEntry {
  from: THREE.Vector3;
  to: THREE.Vector3;
  phase: number; // 0..1 initial phase so vehicles are evenly spaced
  color: THREE.Color;
}

// Reuse temporaries to avoid per-frame allocation.
const _matrix = new THREE.Matrix4();
const _pos    = new THREE.Vector3();
const _quat   = new THREE.Quaternion();
const _scale  = new THREE.Vector3(1, 1, 1);
const _euler  = new THREE.Euler();

interface Props {
  routes: SupplyRoute[];
}

export default function SupplyVehicles3D({ routes }: Props) {
  const cars = useMemo<CarEntry[]>(() => {
    const out: CarEntry[] = [];
    for (const r of routes) {
      const [fx, fz] = tileToWorld(r.fromX, r.fromY);
      const [tx, tz] = tileToWorld(r.toX,   r.toY);
      const from  = new THREE.Vector3(fx + 0.5, CAR_HEIGHT, fz + 0.5);
      const to    = new THREE.Vector3(tx + 0.5, CAR_HEIGHT, tz + 0.5);
      const color = routeColor(r.resourceType);
      for (let i = 0; i < CARS_PER_LINK; i++) {
        out.push({ from, to, phase: i / CARS_PER_LINK, color });
      }
    }
    return out;
  }, [routes]);

  const meshRef = useRef<THREE.InstancedMesh>(null!);

  // Set per-instance colors whenever the car list changes.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cars.forEach((car, i) => mesh.setColorAt(i, car.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cars]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || cars.length === 0) return;

    const t = clock.getElapsedTime();
    for (let i = 0; i < cars.length; i++) {
      const { from, to, phase } = cars[i];
      const progress = ((t * CAR_SPEED + phase) % 1 + 1) % 1;

      _pos.lerpVectors(from, to, progress);

      // Orient the vehicle to face its direction of travel.
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      _euler.set(0, Math.atan2(dx, dz), 0);
      _quat.setFromEuler(_euler);

      _matrix.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (cars.length === 0) return null;

  return (
    // key=cars.length forces buffer reallocation when route count changes.
    <instancedMesh
      key={cars.length}
      ref={meshRef}
      args={[undefined, undefined, cars.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.35, 0.2, 0.55]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

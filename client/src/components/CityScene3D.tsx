import { useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_SIZE } from './cityGrid';

interface CityScene3DProps {
  children?: React.ReactNode;
  focusWorldPos?: [number, number] | null;
  /** If true, the next focusWorldPos change will snap instantly (no animation). */
  snapNextFocus?: boolean;
}

function IsometricCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      const aspect = size.width / size.height;
      const frustum = 30;
      camera.left = -frustum * aspect;
      camera.right = frustum * aspect;
      camera.top = frustum;
      camera.bottom = -frustum;
      camera.near = 0.1;
      camera.far = 1000;
      camera.updateProjectionMatrix();
    }
  }, [camera, size]);

  return null;
}

/** WASD / Arrow-key panning with gentle acceleration */
function KeyboardControls({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const keysDown = useRef(new Set<string>());
  const holdTime = useRef(0); // seconds keys have been held
  const { camera } = useThree();

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      keysDown.current.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.toLowerCase());
      if (keysDown.current.size === 0) holdTime.current = 0;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const keys = keysDown.current;
    const moving = keys.has('w') || keys.has('s') || keys.has('a') || keys.has('d')
      || keys.has('arrowup') || keys.has('arrowdown') || keys.has('arrowleft') || keys.has('arrowright');

    if (!moving) {
      holdTime.current = 0;
      return;
    }

    holdTime.current += delta;

    // Start slow, ramp up over ~2 seconds, cap at 3× base speed
    const accel = Math.min(0.15 + holdTime.current * 0.5, 1.5);
    const zoom = (camera as THREE.OrthographicCamera).zoom ?? 15;
    const speed = (80 / zoom) * accel * delta;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, forward).normalize().negate();

    const pan = new THREE.Vector3();

    if (keys.has('w') || keys.has('arrowup')) pan.add(forward.clone().multiplyScalar(speed));
    if (keys.has('s') || keys.has('arrowdown')) pan.add(forward.clone().multiplyScalar(-speed));
    if (keys.has('a') || keys.has('arrowleft')) pan.add(right.clone().multiplyScalar(-speed));
    if (keys.has('d') || keys.has('arrowright')) pan.add(right.clone().multiplyScalar(speed));

    if (pan.lengthSq() > 0) {
      camera.position.add(pan);
      controls.target.add(pan);
    }
  });

  return null;
}

/** Smoothly pans camera to a world position when focusWorldPos changes.
 *  If far away (>30 units), snaps most of the way and animates the last bit. */
function CameraFocus({ controlsRef, focusWorldPos, snap }: { controlsRef: React.RefObject<any>; focusWorldPos?: [number, number] | null; snap?: boolean }) {
  const { camera } = useThree();
  const animating = useRef(false);
  const targetPos = useRef(new THREE.Vector3());
  const prevFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!focusWorldPos || !controlsRef.current) return;
    const key = `${focusWorldPos[0]}_${focusWorldPos[1]}`;
    if (key === prevFocus.current) return;
    prevFocus.current = key;

    const dest = new THREE.Vector3(focusWorldPos[0] + 0.5, 0, focusWorldPos[1] + 0.5);
    const controls = controlsRef.current;
    const target = controls.target as THREE.Vector3;
    const offset = new THREE.Vector3().subVectors(camera.position, target);

    if (snap) {
      // Instant snap — no animation
      target.copy(dest);
      camera.position.copy(dest).add(offset);
      return;
    }

    const dist = target.distanceTo(dest);

    if (dist > 30) {
      const dir = new THREE.Vector3().subVectors(dest, target).normalize();
      const snapTo = dest.clone().sub(dir.multiplyScalar(8));
      target.copy(snapTo);
      camera.position.copy(snapTo).add(offset);
    }

    targetPos.current.copy(dest);
    animating.current = true;
  }, [focusWorldPos, controlsRef, snap]);

  useFrame((_, delta) => {
    if (!animating.current || !controlsRef.current) return;

    const controls = controlsRef.current;
    const target = controls.target as THREE.Vector3;
    const dest = targetPos.current;

    const t = 1 - Math.pow(0.01, delta);
    const offset = new THREE.Vector3().subVectors(camera.position, target);

    target.lerp(dest, t);
    camera.position.copy(target).add(offset);

    if (target.distanceTo(dest) < 0.05) {
      target.copy(dest);
      camera.position.copy(target).add(offset);
      animating.current = false;
    }
  });

  return null;
}

function GridGround() {
  const gridRef = useRef<THREE.GridHelper>(null);

  return (
    <group position={[WORLD_SIZE / 2, 0, WORLD_SIZE / 2]}>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
        <meshStandardMaterial color="#5a8a50" />
      </mesh>

      {/* Grid lines */}
      <gridHelper
        ref={gridRef}
        args={[WORLD_SIZE, WORLD_SIZE, '#6b9a60', '#5a8a50']}
      />
    </group>
  );
}

const ISO_ANGLE = Math.PI / 6;
const ISO_DISTANCE = 140;

export default function CityScene3D({ children, focusWorldPos, snapNextFocus }: CityScene3DProps) {
  const controlsRef = useRef<any>(null);

  const cameraPosition = useMemo(() => {
    const cx = WORLD_SIZE / 2;
    const cz = WORLD_SIZE / 2;
    return [
      cx + ISO_DISTANCE * Math.cos(ISO_ANGLE) * Math.sin(Math.PI / 4),
      ISO_DISTANCE * Math.sin(ISO_ANGLE),
      cz + ISO_DISTANCE * Math.cos(ISO_ANGLE) * Math.cos(Math.PI / 4),
    ] as [number, number, number];
  }, []);

  const cameraTarget = useMemo(
    () => new THREE.Vector3(WORLD_SIZE / 2, 0, WORLD_SIZE / 2),
    []
  );

  return (
    <Canvas
      orthographic
      camera={{
        position: cameraPosition,
        zoom: 8,
        near: 0.1,
        far: 1000,
      }}
      shadows={{ type: THREE.PCFShadowMap }}
      style={{ background: '#87CEEB' }}
      gl={{ antialias: true, alpha: false }}
    >
      <IsometricCamera />
      <KeyboardControls controlsRef={controlsRef} />
      <CameraFocus controlsRef={controlsRef} focusWorldPos={focusWorldPos} snap={snapNextFocus} />

      {/* Sky color */}
      <color attach="background" args={['#87CEEB']} />

      {/* Bright, warm lighting */}
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[80, 120, 60]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <directionalLight position={[-40, 80, -30]} intensity={0.4} />
      <hemisphereLight args={['#87CEEB', '#5a8a50', 0.3]} />

      <GridGround />

      {/* Camera controls — isometric pan/zoom with limited rotation */}
      <MapControls
        ref={controlsRef}
        target={cameraTarget}
        enableRotate={false}
        enableDamping
        dampingFactor={0.1}
        minZoom={2}
        maxZoom={60}
        screenSpacePanning
        zoomSpeed={1.5}
      />

      {children}
    </Canvas>
  );
}

export { WORLD_SIZE };

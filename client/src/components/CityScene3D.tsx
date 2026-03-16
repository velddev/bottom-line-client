import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_SIZE, worldToTile, GAME_GRID } from './cityGrid';

interface CityScene3DProps {
  children?: React.ReactNode;
  focusWorldPos?: [number, number] | null;
  /** Optional zoom level to set when focusing. */
  focusZoom?: number | null;
  /** Bounding box of buildings to fit in viewport (world coords). Overrides focusZoom. */
  focusBounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  /** If true, the next focusWorldPos change will snap instantly (no animation). */
  snapNextFocus?: boolean;
  /** Called when the visible tile bounds change (debounced). */
  onVisibleBoundsChange?: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
}

function IsometricCamera() {
  const { camera, size, invalidate } = useThree();

  // Enforce frustum every frame to prevent resize flash
  useFrame(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      const aspect = size.width / size.height;
      const frustum = 30;
      const l = -frustum * aspect;
      const r = frustum * aspect;
      if (camera.left !== l || camera.right !== r || camera.top !== frustum || camera.bottom !== -frustum) {
        camera.left = l;
        camera.right = r;
        camera.top = frustum;
        camera.bottom = -frustum;
        camera.near = 0.1;
        camera.far = 1000;
        camera.updateProjectionMatrix();
        invalidate();
      }
    }
  });

  return null;
}

/** WASD / Arrow-key panning with gentle acceleration */
function KeyboardControls({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const keysDown = useRef(new Set<string>());
  const holdTime = useRef(0); // seconds keys have been held
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      keysDown.current.add(e.key.toLowerCase());
      invalidate();
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
      invalidate();
    }
  });

  return null;
}

/** Q / E — rotate the camera 90° around the Y axis, orbiting the controls target */
function CameraRotation({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera, invalidate } = useThree();
  const targetAzimuth = useRef(Math.PI / 4);
  const currentAzimuth = useRef(Math.PI / 4);
  const animating = useRef(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === 'q') {
        targetAzimuth.current -= Math.PI / 2;
        animating.current = true;
        invalidate();
      } else if (key === 'e') {
        targetAzimuth.current += Math.PI / 2;
        animating.current = true;
        invalidate();
      }
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [invalidate]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const diff = targetAzimuth.current - currentAzimuth.current;
    if (Math.abs(diff) < 0.001) {
      currentAzimuth.current = targetAzimuth.current;
      animating.current = false;
      return;
    }

    const t = 1 - Math.pow(0.02, delta);
    currentAzimuth.current += diff * t;

    const target = controls.target as THREE.Vector3;
    const dy = ISO_DISTANCE * Math.sin(ISO_ANGLE);
    const horizontalDist = ISO_DISTANCE * Math.cos(ISO_ANGLE);
    const dx = horizontalDist * Math.sin(currentAzimuth.current);
    const dz = horizontalDist * Math.cos(currentAzimuth.current);

    camera.position.set(target.x + dx, target.y + dy, target.z + dz);
    controls.update();
    invalidate();
  });

  return null;
}

/** Smoothly pans camera to a world position when focusWorldPos changes.
 *  If far away (>30 units), snaps most of the way and animates the last bit.
 *  If focusBounds is provided, computes the zoom to fit all points in the viewport. */
function CameraFocus({ controlsRef, focusWorldPos, focusZoom, focusBounds, snap }: {
  controlsRef: React.RefObject<any>;
  focusWorldPos?: [number, number] | null;
  focusZoom?: number | null;
  focusBounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  snap?: boolean;
}) {
  const { camera, size, invalidate } = useThree();
  const animating = useRef(false);
  const targetPos = useRef(new THREE.Vector3());
  const targetZoom = useRef<number | null>(null);
  const prevFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!focusWorldPos || !controlsRef.current) return;

    // Compute zoom from bounds using the camera's actual view matrix
    let computedZoom = focusZoom ?? null;
    if (focusBounds && camera instanceof THREE.OrthographicCamera) {
      const frustum = 30;
      const aspect = size.width / size.height;
      // Get the camera's view matrix (without zoom/projection)
      const viewMatrix = camera.matrixWorldInverse;
      // Project all 4 corners of the bounding box into view space
      const corners = [
        new THREE.Vector3(focusBounds.minX, 0, focusBounds.minZ),
        new THREE.Vector3(focusBounds.maxX, 0, focusBounds.minZ),
        new THREE.Vector3(focusBounds.minX, 0, focusBounds.maxZ),
        new THREE.Vector3(focusBounds.maxX, 0, focusBounds.maxZ),
        // Include some height for buildings
        new THREE.Vector3(focusBounds.minX, 3, focusBounds.minZ),
        new THREE.Vector3(focusBounds.maxX, 3, focusBounds.maxZ),
      ];
      let minVX = Infinity, maxVX = -Infinity;
      let minVY = Infinity, maxVY = -Infinity;
      for (const c of corners) {
        const v = c.applyMatrix4(viewMatrix);
        minVX = Math.min(minVX, v.x);
        maxVX = Math.max(maxVX, v.x);
        minVY = Math.min(minVY, v.y);
        maxVY = Math.max(maxVY, v.y);
      }
      const extentX = (maxVX - minVX) / 2;
      const extentY = (maxVY - minVY) / 2;
      // Zoom needed to fit: frustum*aspect/zoom >= extentX AND frustum/zoom >= extentY
      const zoomX = extentX > 0 ? (frustum * aspect) / extentX : 30;
      const zoomY = extentY > 0 ? frustum / extentY : 30;
      // Add some padding (0.85 factor)
      computedZoom = Math.max(2, Math.min(30, Math.min(zoomX, zoomY) * 0.85));
    }

    const key = `${focusWorldPos[0]}_${focusWorldPos[1]}_${computedZoom ?? ''}`;
    if (key === prevFocus.current) return;
    prevFocus.current = key;

    const dest = new THREE.Vector3(focusWorldPos[0] + 0.5, 0, focusWorldPos[1] + 0.5);
    const controls = controlsRef.current;
    const target = controls.target as THREE.Vector3;
    const offset = new THREE.Vector3().subVectors(camera.position, target);

    targetZoom.current = computedZoom;

    if (snap) {
      target.copy(dest);
      camera.position.copy(dest).add(offset);
      if (computedZoom && camera instanceof THREE.OrthographicCamera) {
        camera.zoom = computedZoom;
        camera.updateProjectionMatrix();
      }
      controls.update();
      invalidate();
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
    invalidate();
  }, [focusWorldPos, focusZoom, focusBounds, controlsRef, snap, camera, size, invalidate]);

  useFrame((_, delta) => {
    if (!animating.current || !controlsRef.current) return;

    const controls = controlsRef.current;
    const target = controls.target as THREE.Vector3;
    const dest = targetPos.current;

    const t = 1 - Math.pow(0.01, delta);
    const offset = new THREE.Vector3().subVectors(camera.position, target);

    target.lerp(dest, t);
    camera.position.copy(target).add(offset);

    // Animate zoom
    if (targetZoom.current != null && camera instanceof THREE.OrthographicCamera) {
      camera.zoom += (targetZoom.current - camera.zoom) * t;
      if (Math.abs(camera.zoom - targetZoom.current) < 0.05) {
        camera.zoom = targetZoom.current;
        targetZoom.current = null;
      }
      camera.updateProjectionMatrix();
    }

    if (target.distanceTo(dest) < 0.05 && targetZoom.current == null) {
      target.copy(dest);
      camera.position.copy(target).add(offset);
      animating.current = false;
    }
    invalidate();
  });

  return null;
}

/** Tracks which tile grid range is visible and reports changes via callback. */
function VisibleBoundsTracker({ onChange }: { onChange: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void }) {
  const { camera, size } = useThree();
  const lastBounds = useRef('');
  const throttleRef = useRef(0);

  useFrame(() => {
    // Throttle to ~4 checks per second
    const now = Date.now();
    if (now - throttleRef.current < 250) return;
    throttleRef.current = now;

    if (!(camera instanceof THREE.OrthographicCamera)) return;

    // Compute visible world rectangle from orthographic camera
    const halfW = (camera.right - camera.left) / (2 * camera.zoom);
    const halfH = (camera.top - camera.bottom) / (2 * camera.zoom);

    // Camera target is where the camera looks at on the ground plane
    const target = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    // Ray from camera to ground plane (y=0)
    if (dir.y !== 0) {
      const t = -target.y / dir.y;
      target.addScaledVector(dir, t);
    }

    // The visible area in world-space (conservative estimate using larger extent)
    const extent = Math.max(halfW, halfH) * 1.5;
    const minWX = Math.max(0, target.x - extent);
    const maxWX = Math.min(WORLD_SIZE, target.x + extent);
    const minWZ = Math.max(0, target.z - extent);
    const maxWZ = Math.min(WORLD_SIZE, target.z + extent);

    // Convert world bounds to tile grid bounds
    const [tMinX, tMinY] = worldToTile(minWX, minWZ);
    const [tMaxX, tMaxY] = worldToTile(maxWX, maxWZ);

    const bounds = {
      minX: Math.max(0, tMinX - 5),
      maxX: Math.min(GAME_GRID - 1, tMaxX + 5),
      minY: Math.max(0, tMinY - 5),
      maxY: Math.min(GAME_GRID - 1, tMaxY + 5),
    };

    const key = `${bounds.minX}_${bounds.maxX}_${bounds.minY}_${bounds.maxY}`;
    if (key !== lastBounds.current) {
      lastBounds.current = key;
      onChange(bounds);
    }
  });

  return null;
}

function GridGround() {
  const gridRef = useRef<THREE.GridHelper>(null);

  return (
    <group position={[WORLD_SIZE / 2, 0, WORLD_SIZE / 2]}>
      {/* Ground plane */}
      <mesh name="Ground" rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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

/** Counts actual GPU frames rendered and writes stats to an external DOM element. */
function FrameCounterInternal({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const frames = useRef(0);
  const lastCalls = useRef(0);
  const lastTris = useRef(0);

  useFrame(({ gl }) => {
    frames.current++;
    lastCalls.current = gl.info.render.calls;
    lastTris.current = gl.info.render.triangles;
  });

  // Update the display every second via requestAnimationFrame (doesn't cause R3F renders)
  useEffect(() => {
    let raf = 0;
    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      if (now - lastTime >= 1000) {
        if (targetRef.current) {
          const tris = lastTris.current > 1000
            ? `${(lastTris.current / 1000).toFixed(1)}k`
            : `${lastTris.current}`;
          targetRef.current.textContent =
            `${frames.current} FPS | ${lastCalls.current} draws | ${tris} tris`;
        }
        frames.current = 0;
        lastTime = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetRef]);

  return null;
}

interface MeshInfo { name: string; tris: number; instances: number; culled: boolean; radius: number; visible: boolean }

/** Walk up the scene graph to find a meaningful component/group name. */
function findComponentName(obj: THREE.Object3D): string {
  let node: THREE.Object3D | null = obj;
  while (node) {
    const r3f = (node as any).__r3f;
    if (r3f?.type && typeof r3f.type === 'string' && r3f.type !== 'group' && r3f.type !== 'instancedMesh' && r3f.type !== 'mesh') {
      return r3f.type;
    }
    if (node.name && node.name !== '' && !/^Object3D|Group|Scene|Mesh/.test(node.name)) {
      return node.name;
    }
    node = node.parent;
  }
  return obj.type;
}

/** Traverses the scene to build a per-component triangle breakdown. */
function SceneAnalysisInternal({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const { scene, gl, camera, invalidate } = useThree();
  const renderedTris = useRef(0);
  const renderedCalls = useRef(0);

  useFrame(() => {
    renderedTris.current = gl.info.render.triangles;
    renderedCalls.current = gl.info.render.calls;
  });

  useEffect(() => {
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();

    const run = () => {
      projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreenMatrix);

      const raw: MeshInfo[] = [];
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry;
        if (!geo) return;

        const posCount = geo.attributes.position?.count ?? 0;
        const idxCount = geo.index?.count ?? 0;
        const baseTris = idxCount > 0 ? idxCount / 3 : posCount / 3;
        if (!isFinite(baseTris) || baseTris === 0) return;

        const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh;
        const count = instanced ? (mesh as THREE.InstancedMesh).count : 1;
        const totalTris = baseTris * count;
        if (!isFinite(totalTris) || totalTris === 0) return;

        let actualRadius = -1;
        if (instanced) {
          const iMesh = mesh as THREE.InstancedMesh;
          try { iMesh.computeBoundingSphere(); } catch { /* empty */ }
          if (iMesh.boundingSphere) actualRadius = iMesh.boundingSphere.radius;
        } else {
          try { geo.computeBoundingSphere(); } catch { /* empty */ }
          if (geo.boundingSphere) actualRadius = geo.boundingSphere.radius;
        }

        let isVisible = true;
        if (mesh.frustumCulled) {
          if (instanced) {
            const iMesh = mesh as THREE.InstancedMesh;
            if (iMesh.boundingSphere) {
              isVisible = frustum.intersectsSphere(iMesh.boundingSphere);
            }
          } else {
            if (geo.boundingSphere) {
              const sphere = geo.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
              isVisible = frustum.intersectsSphere(sphere);
            }
          }
        }

        raw.push({
          name: findComponentName(mesh),
          tris: totalTris,
          instances: count,
          culled: mesh.frustumCulled,
          radius: actualRadius,
          visible: isVisible,
        });
      });

      const agg = new Map<string, { tris: number; visTris: number; instances: number; meshes: number; minR: number; maxR: number; allCulled: boolean }>();
      for (const item of raw) {
        const existing = agg.get(item.name);
        if (existing) {
          existing.tris += item.tris;
          if (item.visible) existing.visTris += item.tris;
          existing.instances += item.instances;
          existing.meshes++;
          if (item.radius >= 0) {
            existing.minR = existing.minR >= 0 ? Math.min(existing.minR, item.radius) : item.radius;
            existing.maxR = Math.max(existing.maxR, item.radius);
          }
          existing.allCulled = existing.allCulled && item.culled;
        } else {
          agg.set(item.name, {
            tris: item.tris,
            visTris: item.visible ? item.tris : 0,
            instances: item.instances,
            meshes: 1,
            minR: item.radius,
            maxR: item.radius,
            allCulled: item.culled,
          });
        }
      }

      const sorted = [...agg.entries()].sort((a, b) => b[1].tris - a[1].tris);

      if (targetRef.current) {
        const totalTris = sorted.reduce((s, [, v]) => s + v.tris, 0);
        const totalVisTris = sorted.reduce((s, [, v]) => s + v.visTris, 0);
        const totalMeshes = sorted.reduce((s, [, v]) => s + v.meshes, 0);
        const fmtTris = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

        const lines = sorted.map(([name, v]) => {
          const tStr = fmtTris(v.tris).padStart(7);
          const vStr = fmtTris(v.visTris).padStart(7);
          const fc = v.allCulled ? '✓' : '✗';
          let rStr: string;
          if (v.maxR < 0) {
            rStr = '—'.padStart(8);
          } else if (v.minR === v.maxR || v.minR < 0) {
            rStr = `r=${v.maxR.toFixed(0)}`.padStart(8);
          } else {
            rStr = `r=${v.minR.toFixed(0)}-${v.maxR.toFixed(0)}`.padStart(8);
          }
          const mStr = `${v.meshes}m`.padStart(4);
          return `${tStr} ${vStr} ${fc} ${rStr} ${mStr}  ${name}`;
        });
        const header = `${'total'.padStart(7)} ${'visible'.padStart(7)} fc ${'radius'.padStart(8)} ${'#m'.padStart(4)}  component`;
        const visTris = fmtTris(renderedTris.current);
        const visCalls = renderedCalls.current;
        targetRef.current.textContent =
          `Scene Analysis (${totalMeshes} meshes, ${fmtTris(totalTris)} total, ${fmtTris(totalVisTris)} visible, ${visCalls} draws)\n${header}\n${'─'.repeat(60)}\n${lines.join('\n')}`;
      }
    };

    const timeout = setTimeout(run, 100);
    const interval = setInterval(() => { invalidate(); setTimeout(run, 50); }, 2000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [scene, targetRef, invalidate]);

  return null;
}

export default function CityScene3D({ children, focusWorldPos, focusZoom, focusBounds, snapNextFocus, onVisibleBoundsChange }: CityScene3DProps) {
  const controlsRef = useRef<any>(null);
  const [showFps, setShowFps] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const fpsRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3' && !e.shiftKey) { e.preventDefault(); setShowFps(v => !v); }
      if (e.key === 'F3' && e.shiftKey) { e.preventDefault(); setShowAnalysis(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    <>
      {showFps && (
        <div
          ref={fpsRef}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.7)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: 14,
            padding: '4px 8px',
            borderRadius: 4,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          0 FPS
        </div>
      )}
      {showAnalysis && (
        <div
          ref={analysisRef}
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: 12,
            padding: '8px 12px',
            borderRadius: 4,
            zIndex: 9999,
            pointerEvents: 'none',
            whiteSpace: 'pre',
            lineHeight: 1.4,
          }}
        >
          Analyzing...
        </div>
      )}
      <Canvas
        orthographic
        frameloop="demand"
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
        <CameraRotation controlsRef={controlsRef} />
        <CameraFocus controlsRef={controlsRef} focusWorldPos={focusWorldPos} focusZoom={focusZoom} focusBounds={focusBounds} snap={snapNextFocus} />
        {onVisibleBoundsChange && <VisibleBoundsTracker onChange={onVisibleBoundsChange} />}
        {showFps && <FrameCounterInternal targetRef={fpsRef} />}
        {showAnalysis && <SceneAnalysisInternal targetRef={analysisRef} />}

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
          makeDefault
          target={cameraTarget}
          enableRotate={false}
          enableDamping
          dampingFactor={0.1}
          minZoom={2}
          maxZoom={60}
          screenSpacePanning
          zoomSpeed={1.5}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
        />

        {children}
      </Canvas>
    </>
  );
}

export { WORLD_SIZE };

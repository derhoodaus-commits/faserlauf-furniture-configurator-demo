// The WebGL viewer. Loaded lazily (separate chunk) by the configurator island.

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Config, ViewState } from '../../lib/types.ts';
import { layoutScene, type SceneLayout } from './layout.ts';
import { Furniture } from './Furniture.tsx';
import { Room, ROOM_SIZE } from './Room.tsx';
import { Person } from './Person.tsx';
import { Dimensions, VariantTag } from './Dimensions.tsx';
import { disposeAll, setAnisotropy, type Quality } from './materials.ts';
import { exportGLB, snapshot, type SnapshotOptions } from './exporters.ts';
import { PERSON_HEIGHT_MM } from '../../data/room.ts';

export type ViewPreset = 'front' | 'side' | 'three-quarter' | 'top';

export interface ViewerHandle {
  snapshot(o?: SnapshotOptions): string | null;
  exportGLB(): Promise<Blob>;
  rotate(deg: number): void;
  zoom(factor: number): void;
  preset(p: ViewPreset): void;
  reset(): void;
}

export interface ViewerProps {
  variants: { config: Config; label: 'A' | 'B' | null }[];
  view: ViewState;
  quality: Quality;
  handleRef?: Ref<ViewerHandle | null>;
  onReadyChange?: (ready: boolean) => void;
  mode?: 'interactive' | 'render';
  background?: string;
  /** Initial camera preset (render mode). */
  initialPreset?: ViewPreset;
  /** Fixed device pixel ratio (render mode, for crisp preview images). */
  fixedDpr?: number;
}

const FOV = 32;
const DEG = Math.PI / 180;
const PRESETS: Record<ViewPreset, { az: number; polar: number }> = {
  front: { az: 0, polar: 84 },
  side: { az: 90, polar: 84 },
  'three-quarter': { az: 34, polar: 66 },
  top: { az: 0, polar: 6 },
};

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Environment lighting from three's procedural RoomEnvironment: no HDR download. */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Lights({ layout, quality }: { layout: SceneLayout; quality: Quality }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const span = Math.max(layout.width, layout.depth, layout.height) * 0.75 + 0.6;
  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.near = 0.5;
    cam.far = 14;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [span]);
  const size = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={['#fff6ea', '#8a7864', 0.55]} />
      <directionalLight
        ref={ref}
        position={[2.6, 4.6, 3.2]}
        intensity={2.1}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[size, size]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-radius={4}
      />
      <directionalLight position={[-3, 2.2, -1.5]} intensity={0.35} color="#e8eef5" />
    </>
  );
}

function StudioFloor({ visible }: { visible: boolean }) {
  return (
    <mesh visible={visible} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <shadowMaterial transparent opacity={0.16} color="#3b2a1c" />
    </mesh>
  );
}

interface RigProps {
  fitScale?: number;
  mode: 'interactive' | 'render';
  layout: SceneLayout;
  view: ViewState;
  fitKey: string;
  handleRef?: Ref<ViewerHandle | null>;
  initialPreset?: ViewPreset;
}

/** Camera fitting, presets and button controls; also exposes snapshot/GLB to the UI. */
function Rig({ layout, view, fitKey, handleRef, initialPreset, fitScale = 1, mode }: RigProps) {
  const { camera, gl, scene, invalidate, size } = useThree();
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const anim = useRef<{ fromPos: THREE.Vector3; toPos: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t0: number; dur: number } | null>(null);

  // Box around everything that should be in view: the furniture plus the scale figure
  const bounds = useMemo(() => {
    const persH = view.person ? PERSON_HEIGHT_MM / 1000 : 0;
    const minX = -layout.width / 2;
    const maxX = view.person ? layout.personX + 0.3 : layout.width / 2;
    return { minX, maxX, w: maxX - minX, h: Math.max(layout.height, persH), d: layout.depth };
  }, [layout, view.person]);

  const target = useMemo(
    () => new THREE.Vector3((bounds.minX + bounds.maxX) / 2, Math.max(bounds.h * 0.46, 0.25), 0),
    [bounds],
  );

  // Corners of everything that has to stay in view: each piece (plus its dimension lines and A/B tag)
  // and the scale figure
  const corners = useMemo(() => {
    const boxes: [number, number, number, number, number, number][] = layout.variants.map((v) => {
      const [L, H, W] = v.size;
      const dim = view.dims ? 0.14 : 0;
      const tag = layout.variants.length > 1 ? 0.3 : 0;
      return [v.x - L / 2, v.x + L / 2 + dim, 0, H + tag, v.z - W / 2, v.z + W / 2 + dim];
    });
    if (view.person) boxes.push([layout.personX - 0.28, layout.personX + 0.28, 0, PERSON_HEIGHT_MM / 1000, -0.18, 0.18]);
    const pts: THREE.Vector3[] = [];
    for (const [x0, x1, y0, y1, z0, z1] of boxes)
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(new THREE.Vector3(x, y, z));
    return pts;
  }, [layout, view.dims, view.person]);

  /** Camera distance (from the target, along `dir`) at which every corner is on screen and clear of the overlays. */
  const fitDistance = useCallback(
    (dir: THREE.Vector3) => {
      const vf = FOV * DEG;
      const aspect = size.width / Math.max(1, size.height);
      if (mode === 'render') {
        // Preview images: the original bounding-sphere fit (keeps the generated images unchanged)
        const r = 0.5 * Math.sqrt(bounds.w * bounds.w + bounds.h * bounds.h + bounds.d * bounds.d);
        const f = Math.min(vf, 2 * Math.atan(Math.tan(vf / 2) * aspect));
        return ((r / Math.sin(f / 2)) * (view.room ? 1.12 : 1.06) * (view.dims ? 1.08 : 1) + (view.dims ? 0.2 : 0)) * fitScale;
      }
      // Pixels kept free at the edges: toolbar on top, camera buttons at the bottom, room for labels
      const halfH = size.height / 2;
      const halfW = size.width / 2;
      const label = view.dims ? 16 : 0;
      const mV = Math.min(halfH * 0.5, 66 + label);
      const mH = Math.min(halfW * 0.4, 18 + (view.dims ? 40 : 0));
      const tV = Math.tan(vf / 2) * ((halfH - mV) / halfH);
      const tH = Math.tan(vf / 2) * aspect * ((halfW - mH) / halfW);
      const back = dir.clone().normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const up = back.clone().cross(right).normalize();
      let d = 0.5;
      const p = new THREE.Vector3();
      for (const c of corners) {
        p.copy(c).sub(target);
        const z = p.dot(back);
        d = Math.max(d, z + Math.abs(p.dot(right)) / tH, z + Math.abs(p.dot(up)) / tV);
      }
      return d * (view.room ? 1.04 : 1);
    },
    [bounds, corners, target, view.room, view.dims, size.width, size.height, fitScale, mode],
  );

  // OrbitControls clamps the distance; a long piece next to the scale figure (or two pieces in compare
  // mode) can need more than the default limit, so the limit grows with the fitted distance
  const allowDistance = useCallback(
    (dist: number) => {
      if (controls && controls.maxDistance < dist * 1.25) controls.maxDistance = dist * 1.25;
    },
    [controls],
  );

  const moveTo = useCallback(
    (pos: THREE.Vector3, tgt: THREE.Vector3, animate = true) => {
      if (!controls) {
        camera.position.copy(pos);
        camera.lookAt(tgt);
        invalidate();
        return;
      }
      if (!animate || reducedMotion()) {
        camera.position.copy(pos);
        controls.target.copy(tgt);
        controls.update();
        anim.current = null;
        invalidate();
        return;
      }
      anim.current = { fromPos: camera.position.clone(), toPos: pos, fromT: controls.target.clone(), toT: tgt.clone(), t0: performance.now(), dur: 650 };
      invalidate();
    },
    [camera, controls, invalidate],
  );

  const posFor = useCallback(
    (azDeg: number, polarDeg: number, dist: number, tgt: THREE.Vector3) => {
      const s = new THREE.Spherical(dist, polarDeg * DEG, azDeg * DEG);
      return new THREE.Vector3().setFromSpherical(s).add(tgt);
    },
    [],
  );

  const applyPreset = useCallback(
    (p: ViewPreset, animate = true) => {
      const pr = PRESETS[p];
      const polar = view.room ? Math.max(pr.polar, p === 'top' ? 25 : 70) : pr.polar;
      const dist = fitDistance(posFor(pr.az, polar, 1, new THREE.Vector3()));
      allowDistance(dist);
      moveTo(posFor(pr.az, polar, dist, target), target, animate);
    },
    [fitDistance, allowDistance, moveTo, posFor, target, view.room],
  );

  // Fit when the furniture type, compare mode or room mode changes (not on every size change),
  // and silently when the canvas aspect ratio changes a lot (first layout, rotating a phone)
  const first = useRef(true);
  const aspectBucket = Math.round((size.width / Math.max(1, size.height)) * 4);
  useEffect(() => {
    applyPreset(initialPreset ?? 'three-quarter', !first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, controls]);
  // When the piece grows or shrinks a lot (e.g. 200 → 300 cm), move the camera back or closer,
  // keeping the current viewing angle
  const sizeBucket = Math.round(Math.log(Math.max(bounds.w, bounds.h, 0.3)) / Math.log(1.18));
  const lastSize = useRef(sizeBucket);
  useEffect(() => {
    if (lastSize.current === sizeBucket || !controls) return;
    lastSize.current = sizeBucket;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = fitDistance(dir);
    allowDistance(dist);
    moveTo(target.clone().add(dir.multiplyScalar(dist)), target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeBucket]);
  const lastBucket = useRef(aspectBucket);
  useEffect(() => {
    if (lastBucket.current === aspectBucket) return;
    lastBucket.current = aspectBucket;
    applyPreset(initialPreset ?? 'three-quarter', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectBucket]);

  useFrame(() => {
    const a = anim.current;
    if (!a || !controls) return;
    const t = Math.min(1, (performance.now() - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.target.lerpVectors(a.fromT, a.toT, e);
    controls.update();
    if (t >= 1) anim.current = null;
    invalidate();
  });

  useImperativeHandle(
    handleRef,
    () => ({
      snapshot: (o) => snapshot(gl, scene, camera, o),
      exportGLB: () => exportGLB(scene),
      rotate: (deg) => {
        if (!controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const s = new THREE.Spherical().setFromVector3(offset);
        s.theta += deg * DEG;
        if (view.room) s.theta = Math.min(controls.maxAzimuthAngle, Math.max(controls.minAzimuthAngle, s.theta));
        moveTo(new THREE.Vector3().setFromSpherical(s).add(controls.target), controls.target.clone());
      },
      zoom: (factor) => {
        if (!controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor));
        moveTo(controls.target.clone().add(offset.setLength(len)), controls.target.clone());
      },
      preset: (p) => applyPreset(p),
      reset: () => applyPreset('three-quarter'),
    }),
    [gl, scene, camera, controls, moveTo, applyPreset, view.room],
  );
  return null;
}

/** Marks the viewer as ready once textures are in and a frame has been drawn (used by tests and renders). */
function ReadyProbe({ loading, onReady }: { loading: boolean; onReady: (r: boolean) => void }) {
  const frames = useRef(0);
  const { invalidate } = useThree();
  useEffect(() => {
    frames.current = 0;
    if (!loading) invalidate();
    else onReady(false);
  }, [loading, invalidate, onReady]);
  useFrame(() => {
    if (loading) return;
    frames.current++;
    if (frames.current === 2) onReady(true);
    if (frames.current < 3) invalidate();
  });
  return null;
}

export default function Viewer({ variants, view, quality, handleRef, onReadyChange, mode = 'interactive', background = '#efe8dc', initialPreset, fixedDpr }: ViewerProps) {
  const layout = useMemo(() => layoutScene(variants), [variants]);
  // Capped DPR: 1.5 on desktops, 1.25 on phones; the PerformanceMonitor adjusts it at runtime
  const [dpr, setDpr] = useState(() => fixedDpr ?? Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, quality === 'high' ? 1.5 : 1.25));
  const [loadingCount, setLoadingCount] = useState(0);
  const loadingSet = useRef(new Set<string>());
  const setLoading = useCallback((key: string, l: boolean) => {
    const s = loadingSet.current;
    if (l) s.add(key);
    else s.delete(key);
    setLoadingCount(s.size);
  }, []);
  useEffect(() => () => disposeAll(), []);

  const fitKey = `${variants.map((v) => v.config.product + (v.label ?? '')).join('+')}|${view.room}|${view.person}`;
  const room = view.room;
  const interactive = mode === 'interactive';

  return (
    <Canvas
      frameloop="demand"
      shadows="percentage"
      dpr={dpr}
      camera={{ fov: FOV, near: 0.05, far: 60, position: [3, 2, 4] }}
      gl={{ antialias: true, preserveDrawingBuffer: mode === 'render', powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        setAnisotropy(gl.capabilities.getMaxAnisotropy());
      }}
      aria-hidden
    >
      <Environment />
      <Lights layout={layout} quality={quality} />
      <color attach="background" args={[room ? '#d9d2c7' : background]} />
      <StudioFloor visible={!room} />
      <Room wall={view.wall} floor={view.floor} backWallZ={layout.backWallZ} leftWallX={layout.leftWallX} quality={quality} visible={room} />
      {layout.variants.map((v) => (
        <Furniture
          key={v.label ?? 'main'}
          name={`furniture-${v.label ?? 'main'}`}
          config={v.config}
          model={v.model}
          quality={quality}
          position={[v.x, 0, v.z]}
          onLoading={(l) => setLoading(`f-${v.label ?? 'main'}`, l)}
        />
      ))}
      {view.dims && layout.variants.map((v) => <Dimensions key={`d-${v.label ?? 'main'}`} variant={v} />)}
      {layout.variants.length > 1 && layout.variants.map((v) => <VariantTag key={`t-${v.label}`} variant={v} />)}
      <Person x={layout.personX} z={0} visible={view.person} />
      <ContactShadows
        position={[0, 0.0015, 0]}
        scale={[layout.width + 2.4, layout.depth + 2.4]}
        resolution={quality === 'high' ? 1024 : 512}
        blur={2.2}
        far={0.9}
        opacity={room ? 0.5 : 0.62}
        color="#2a1d12"
      />
      <OrbitControls
        makeDefault
        enabled={interactive}
        enableDamping
        dampingFactor={0.09}
        screenSpacePanning
        minDistance={0.5}
        maxDistance={room ? 6.2 : 9}
        maxPolarAngle={88 * DEG}
        minAzimuthAngle={room ? -42 * DEG : -Infinity}
        maxAzimuthAngle={room ? 88 * DEG : Infinity}
      />
      <Rig layout={layout} view={view} fitKey={fitKey} mode={mode} fitScale={mode === 'render' ? 0.86 : 1} {...(handleRef ? { handleRef } : {})} {...(initialPreset ? { initialPreset } : {})} />
      {onReadyChange ? <ReadyProbe loading={loadingCount > 0} onReady={onReadyChange} /> : null}
      {interactive ? (
        <PerformanceMonitor
          onIncline={() => setDpr(Math.min(2, devicePixelRatio))}
          onDecline={() => setDpr(1)}
          flipflops={3}
          onFallback={() => setDpr(1)}
        />
      ) : null}
    </Canvas>
  );
}

export { ROOM_SIZE };

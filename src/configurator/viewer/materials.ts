// Texture and material cache. Textures are generated once per species (in a Web Worker) and shared by
// every part; materials are cached per species × finish. Nothing is created per mesh.

import * as THREE from 'three';
import { FINISHES } from '../../data/finishes.ts';
import type { FinishId, FloorId, SpeciesId } from '../../lib/types.ts';
import type { TextureSet } from '../../lib/wood/generator.ts';
import type { WorkerJob, WorkerResponse } from '../wood.worker.ts';

export type Quality = 'high' | 'low';

interface SpeciesTextures {
  long: { map: THREE.DataTexture; normal: THREE.DataTexture; rough: THREE.DataTexture };
  end: { map: THREE.DataTexture; normal: THREE.DataTexture; rough: THREE.DataTexture };
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, (r: WorkerResponse) => void>();
const speciesCache = new Map<string, Promise<SpeciesTextures>>();
const floorCache = new Map<string, Promise<SpeciesTextures['long']>>();
const materialCache = new Map<string, THREE.MeshPhysicalMaterial[]>();
let anisotropy = 4;

export function setAnisotropy(a: number) {
  anisotropy = Math.max(1, Math.min(8, a));
}

/** Last generation timings (ms) – shown in the debug info and used by the tests. */
export const timings: Record<string, number> = {};

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('../wood.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      cb?.(e.data);
    });
    worker.addEventListener('error', () => {
      workerFailed = true;
      worker = null;
    });
  } catch {
    workerFailed = true;
    worker = null;
  }
  return worker;
}

async function request(req: WorkerJob): Promise<WorkerResponse> {
  const w = getWorker();
  const id = nextId++;
  if (!w) {
    // Fallback: generate on the main thread (older browsers without module workers)
    const { generate } = await import('../wood.worker.ts');
    return { id, ...generate(req) };
  }
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ ...req, id });
  });
}

function dataTexture(data: Uint8ClampedArray, w: number, h: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function toTextures(set: TextureSet) {
  return {
    map: dataTexture(set.color, set.width, set.height, true),
    normal: dataTexture(set.normal, set.width, set.height, false),
    rough: dataTexture(set.roughness, set.width, set.height, false),
  };
}

export function loadSpeciesTextures(species: SpeciesId, quality: Quality): Promise<SpeciesTextures> {
  const key = `${species}|${quality}`;
  let p = speciesCache.get(key);
  if (!p) {
    p = request({ kind: 'species', species, quality }).then((r) => {
      timings[key] = r.ms;
      return { long: toTextures(r.long), end: toTextures(r.end!) };
    });
    speciesCache.set(key, p);
  }
  return p;
}

export function loadFloorTextures(floor: FloorId, quality: Quality): Promise<SpeciesTextures['long']> {
  const key = `${floor}|${quality}`;
  let p = floorCache.get(key);
  if (!p) {
    p = request({ kind: 'floor', floor, quality }).then((r) => {
      timings[key] = r.ms;
      return toTextures(r.long);
    });
    floorCache.set(key, p);
  }
  return p;
}

/** [long grain, end grain] materials for a species and finish. Shared by all parts. */
export function woodMaterials(tex: SpeciesTextures, species: SpeciesId, finish: FinishId, quality: Quality): THREE.MeshPhysicalMaterial[] {
  const key = `${species}|${finish}|${quality}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const f = FINISHES[finish].render;
  const make = (t: SpeciesTextures['long'], end: boolean) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: t.map,
      normalMap: t.normal,
      roughnessMap: t.rough,
      color: new THREE.Color(f.tint[0], f.tint[1], f.tint[2]).multiplyScalar(end ? 0.92 : 1),
      roughness: Math.min(1, f.roughness * (end ? 1.15 : 1) * 1.25),
      metalness: 0,
      clearcoat: end ? f.clearcoat * 0.5 : f.clearcoat,
      clearcoatRoughness: f.clearcoatRoughness,
      envMapIntensity: 0.9,
    });
    m.normalScale.set(0.6, 0.6);
    m.name = `${species}-${finish}-${end ? 'end' : 'long'}`;
    return m;
  };
  const mats = [make(tex.long, false), make(tex.end, true)];
  materialCache.set(key, mats);
  return mats;
}

/** Disposes everything (when the viewer unmounts). */
export function disposeAll() {
  for (const mats of materialCache.values()) mats.forEach((m) => m.dispose());
  materialCache.clear();
  const dispose = (t: { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture }) => {
    t.map.dispose();
    t.normal.dispose();
    t.rough.dispose();
  };
  for (const p of speciesCache.values()) p.then((t) => { dispose(t.long); dispose(t.end); }).catch(() => {});
  for (const p of floorCache.values()) p.then(dispose).catch(() => {});
  speciesCache.clear();
  floorCache.clear();
}

/// <reference lib="webworker" />
// Generates wood and floor textures off the main thread, so the UI stays responsive.

import { SPECIES } from '../data/species.ts';
import {
  END_GRAIN_TILE,
  FLOOR_TILE_MM,
  LONG_GRAIN_TILE,
  generateConcrete,
  generateEndGrain,
  generateLongGrain,
  generateTerracotta,
  type TextureSet,
} from '../lib/wood/generator.ts';
import type { FloorId, SpeciesId } from '../lib/types.ts';

export type WorkerJob =
  | { kind: 'species'; species: SpeciesId; quality: 'high' | 'low' }
  | { kind: 'floor'; floor: FloorId; quality: 'high' | 'low' };
export type WorkerRequest = WorkerJob & { id: number };

export interface WorkerResponse {
  id: number;
  long: TextureSet;
  end?: TextureSet;
  ms: number;
}

export function generate(req: WorkerJob): Omit<WorkerResponse, 'id'> {
  const t0 = performance.now();
  const hi = req.quality === 'high';
  if (req.kind === 'species') {
    const look = SPECIES[req.species].look;
    const long = generateLongGrain({ look, seed: 1, width: hi ? 2048 : 1024, height: hi ? 1024 : 512, ...LONG_GRAIN_TILE });
    const end = generateEndGrain({ look, seed: 2, width: hi ? 1024 : 512, height: hi ? 160 : 80, ...END_GRAIN_TILE });
    return { long, end, ms: performance.now() - t0 };
  }
  const size = hi ? 1024 : 512;
  let long: TextureSet;
  if (req.floor === 'concrete') long = generateConcrete({ seed: 3, width: size, height: size, sizeMm: FLOOR_TILE_MM });
  else if (req.floor === 'terracotta') long = generateTerracotta({ seed: 3, width: size, height: size, sizeMm: FLOOR_TILE_MM });
  else
    long = generateLongGrain({
      look: { ...SPECIES.oak.look, rays: 0.3, toneJitter: 0.6 },
      seed: 9,
      width: size,
      height: size,
      uMm: FLOOR_TILE_MM,
      vMm: FLOOR_TILE_MM,
      boardMm: [200, 200],
      planks: true,
    });
  return { long, ms: performance.now() - t0 };
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
if (typeof ctx.addEventListener === 'function' && typeof (ctx as { document?: unknown }).document === 'undefined') {
  ctx.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
    const res = generate(e.data);
    const transfer: Transferable[] = [res.long.color.buffer, res.long.normal.buffer, res.long.roughness.buffer];
    if (res.end) transfer.push(res.end.color.buffer, res.end.normal.buffer, res.end.roughness.buffer);
    ctx.postMessage({ id: e.data.id, ...res } satisfies WorkerResponse, transfer);
  });
}

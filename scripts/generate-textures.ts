// Writes the wood swatch images of the website with the SAME generator the 3D configurator uses.
// Usage: npm run generate:textures   (output: public/generated/wood/*.webp, committed)
//
// Runs on Node's built-in TypeScript support (Node ≥ 22.18), no extra tooling.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SPECIES, SPECIES_IDS } from '../src/data/species.ts';
import { FINISHES } from '../src/data/finishes.ts';
import { applyFinishPreview, generateConcrete, generateEndGrain, generateLongGrain, generateTerracotta, END_GRAIN_TILE, LONG_GRAIN_TILE } from '../src/lib/wood/generator.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'generated', 'wood');
mkdirSync(out, { recursive: true });

async function write(name: string, data: Uint8ClampedArray, w: number, h: number, opts: { resize?: [number, number]; quality?: number } = {}) {
  let img = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: w, height: h, channels: 4 } }).removeAlpha();
  if (opts.resize) img = img.resize(opts.resize[0], opts.resize[1], { fit: 'cover' });
  const file = join(out, name);
  await img.webp({ quality: opts.quality ?? 80, effort: 6 }).toFile(file);
  return file;
}

const timings: string[] = [];
for (const id of SPECIES_IDS) {
  const sp = SPECIES[id];
  // Swatch: 600 mm along the grain × 300 mm across, 2.13 px/mm (enough for crisp 640 px images)
  const t0 = performance.now();
  const tex = generateLongGrain({ look: sp.look, seed: 11, width: 1440, height: 640, uMm: 900, vMm: 400 });
  const ms = performance.now() - t0;
  timings.push(`${id}: 1440×640 swatch ${ms.toFixed(0)} ms`);
  // Configurator resolution timing (same call the Web Worker makes)
  const t1 = performance.now();
  generateLongGrain({ look: sp.look, seed: 1, width: 2048, height: 1024, ...LONG_GRAIN_TILE });
  timings.push(`${id}: 2048×1024 configurator texture (desktop) ${(performance.now() - t1).toFixed(0)} ms`);

  for (const fid of ['raw', 'oiled', 'lacquered'] as const) {
    const f = FINISHES[fid].preview;
    const c = applyFinishPreview(tex.color, f.multiply, f.saturation);
    await write(`${id}-${fid}.webp`, c, tex.width, tex.height, { resize: [720, 320] });
  }
  // Small square swatch for option buttons and cards (oiled)
  const oiled = applyFinishPreview(tex.color, FINISHES.oiled.preview.multiply, FINISHES.oiled.preview.saturation);
  await write(`${id}-chip.webp`, oiled, tex.width, tex.height, { resize: [96, 96], quality: 82 });
  const end = generateEndGrain({ look: sp.look, seed: 5, width: 640, height: 200, uMm: END_GRAIN_TILE.uMm / 2, vMm: 110 });
  const endOiled = applyFinishPreview(end.color, FINISHES.oiled.preview.multiply, FINISHES.oiled.preview.saturation);
  await write(`${id}-end.webp`, endOiled, end.width, end.height, { quality: 80 });
}

// Decorative strip (footer) and floor previews
const strip = generateLongGrain({ look: SPECIES.walnut.look, seed: 3, width: 1600, height: 48, uMm: 1600, vMm: 48, boardMm: [200, 200] });
await write('strip-walnut.webp', applyFinishPreview(strip.color, FINISHES.oiled.preview.multiply, FINISHES.oiled.preview.saturation), 1600, 48, { quality: 70 });
const conc = generateConcrete({ seed: 4, width: 256, height: 256, sizeMm: 600 });
await write('floor-concrete.webp', conc.color, 256, 256, { resize: [96, 96] });
const terra = generateTerracotta({ seed: 4, width: 256, height: 256, sizeMm: 600 });
await write('floor-terracotta.webp', terra.color, 256, 256, { resize: [96, 96] });
const planks = generateLongGrain({ look: SPECIES.oak.look, seed: 8, width: 512, height: 512, uMm: 1200, vMm: 1200, boardMm: [180, 180], planks: true });
await write('floor-oak-planks.webp', applyFinishPreview(planks.color, FINISHES.oiled.preview.multiply, 1.1), 512, 512, { resize: [96, 96] });

writeFileSync(join(out, 'timings.txt'), `Generated ${new Date().toISOString()} with Node ${process.version}\n` + timings.join('\n') + '\n');
console.log(timings.join('\n'));
console.log('Wrote swatches to', out);

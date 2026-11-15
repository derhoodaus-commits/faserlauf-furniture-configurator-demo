import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { SPECIES, SPECIES_IDS } from '../../src/data/species.ts';
import { generateConcrete, generateEndGrain, generateLongGrain, generateTerracotta } from '../../src/lib/wood/generator.ts';
import { perlin2 } from '../../src/lib/wood/noise.ts';

const small = (id: keyof typeof SPECIES, seed = 1) => generateLongGrain({ look: SPECIES[id].look, seed, width: 256, height: 128, uMm: 600, vMm: 300 });
const mean = (d: Uint8ClampedArray) => {
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
  return s / (d.length / 4);
};
const sha = (d: Uint8ClampedArray) => createHash('sha1').update(d).digest('hex');

describe('procedural wood', () => {
  it('is deterministic: same seed, same texture; other seed, other boards', () => {
    expect(sha(small('oak', 5).color)).toBe(sha(small('oak', 5).color));
    expect(sha(small('oak', 5).color)).not.toBe(sha(small('oak', 6).color));
  });

  it('gives each species its own brightness: walnut darkest, ash and pine lightest', () => {
    const m = Object.fromEntries(SPECIES_IDS.map((id) => [id, mean(small(id).color)]));
    expect(m['walnut']).toBeLessThan(m['oak']! - 40);
    expect(m['oak']).toBeLessThan(m['ash']!);
    expect(m['oak']).toBeLessThan(m['pine']!);
  });

  it('shows visible growth rings (contrast across the grain) but stays smooth along the grain', () => {
    const t = small('ash');
    const lum = (x: number, y: number) => t.color[(y * t.width + x) * 4]!;
    let across = 0;
    let along = 0;
    for (let y = 1; y < t.height; y++) for (let x = 1; x < t.width; x++) {
      across += Math.abs(lum(x, y) - lum(x, y - 1));
      along += Math.abs(lum(x, y) - lum(x - 1, y));
    }
    expect(across).toBeGreaterThan(along * 1.3);
  });

  it('produces valid normal and roughness maps', () => {
    const t = small('oak');
    for (let i = 0; i < t.normal.length; i += 4) expect(t.normal[i + 2]!).toBeGreaterThan(127);
    const r = mean(t.roughness);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(250);
  });

  it('generates end grain and floor textures of the requested size', () => {
    const e = generateEndGrain({ look: SPECIES.walnut.look, seed: 1, width: 128, height: 32, uMm: 700, vMm: 110 });
    expect(e.color.length).toBe(128 * 32 * 4);
    expect(generateConcrete({ seed: 1, width: 64, height: 64, sizeMm: 600 }).color.length).toBe(64 * 64 * 4);
    expect(generateTerracotta({ seed: 1, width: 64, height: 64, sizeMm: 600 }).color.length).toBe(64 * 64 * 4);
  });

  it('noise is periodic, so floor textures tile without seams', () => {
    for (const [x, y] of [[0.3, 0.7], [2.1, 1.4], [3.9, 0.2]] as const) {
      expect(perlin2(x, y, 4, 2, 9)).toBeCloseTo(perlin2(x + 4, y + 2, 4, 2, 9), 10);
    }
  });
});

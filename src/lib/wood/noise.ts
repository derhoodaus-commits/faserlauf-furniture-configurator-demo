// Small, dependency-free noise toolkit for the wood generator.
// Everything is seeded (deterministic) and periodic, so textures tile without seams.

/** mulberry32: tiny, fast, good-enough PRNG. Returns a function producing floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of a lattice point (any integers, any period). */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const GRAD_X = new Float32Array(16);
const GRAD_Y = new Float32Array(16);
for (let i = 0; i < 16; i++) {
  GRAD_X[i] = Math.cos((i / 16) * Math.PI * 2);
  GRAD_Y[i] = Math.sin((i / 16) * Math.PI * 2);
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Periodic 2D gradient (Perlin) noise. The pattern repeats every `px` units in x and `py` units in y.
 * Output range is roughly [-0.7, 0.7].
 */
export function perlin2(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ix0 = mod(x0, px);
  const iy0 = mod(y0, py);
  const ix1 = mod(x0 + 1, px);
  const iy1 = mod(y0 + 1, py);
  const g00 = hash2(ix0, iy0, seed) & 15;
  const g10 = hash2(ix1, iy0, seed) & 15;
  const g01 = hash2(ix0, iy1, seed) & 15;
  const g11 = hash2(ix1, iy1, seed) & 15;
  const n00 = GRAD_X[g00]! * fx + GRAD_Y[g00]! * fy;
  const n10 = GRAD_X[g10]! * (fx - 1) + GRAD_Y[g10]! * fy;
  const n01 = GRAD_X[g01]! * fx + GRAD_Y[g01]! * (fy - 1);
  const n11 = GRAD_X[g11]! * (fx - 1) + GRAD_Y[g11]! * (fy - 1);
  const u = fade(fx);
  const v = fade(fy);
  const a = n00 + u * (n10 - n00);
  const b = n01 + u * (n11 - n01);
  return a + v * (b - a);
}

/** Fractal sum of periodic noise. */
export function fbm2(x: number, y: number, px: number, py: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin2(x * f, y * f, px * f, py * f, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** 1D smooth value noise (non-periodic), for ring width variation along the radius. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = (hash2(i, 0, seed) / 4294967296) * 2 - 1;
  const b = (hash2(i + 1, 0, seed) / 4294967296) * 2 - 1;
  const u = fade(f);
  return a + u * (b - a);
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

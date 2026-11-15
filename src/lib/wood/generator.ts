// Procedural wood texture generator.
//
// One pure-TypeScript implementation used in two places:
//  - in the browser (inside a Web Worker) to create the textures of the 3D configurator,
//  - in Node (scripts/generate-textures.ts) to write the swatch images of the website.
//
// Model: a glued panel of several boards. Each board is a plane cut through a log; the growth rings are
// the distance from the (virtual) pith, warped by noise. Flat-sawn boards show cathedral arches,
// quarter-sawn boards straight stripes plus ray flecks. See docs/RESEARCH.md §5.

import type { RGB, WoodLook } from '../../data/species.ts';
import { clamp01, fbm2, noise1, perlin2, rng, smoothstep } from './noise.ts';

export interface TextureSet {
  width: number;
  height: number;
  /** sRGB color, RGBA8. */
  color: Uint8ClampedArray;
  /** Tangent-space normal map, RGBA8. */
  normal: Uint8ClampedArray;
  /** Roughness factor in the green channel (as three.js expects), RGBA8. */
  roughness: Uint8ClampedArray;
}

export interface LongGrainOptions {
  look: WoodLook;
  seed: number;
  /** Pixel size. */
  width: number;
  height: number;
  /** Physical size of the texture tile: along the grain (u) and across (v), mm. */
  uMm: number;
  vMm: number;
  /** Board widths range in mm (glued panel). */
  boardMm?: [number, number];
  /** Floor planks: draw end joints and seams. */
  planks?: boolean;
}

interface Board {
  v0: number;
  v1: number;
  pithV: number;
  /** Distance of the board face from the pith at the board's middle (mm). */
  d0: number;
  /** Change of that distance along the board (mm per mm): the board is sawn slightly askew to the log
   *  axis, which produces the nested cathedral arches of flat-sawn boards. */
  slope: number;
  wobAmp: number;
  wobFreq: number;
  wobPhase: number;
  ringMm: number;
  tone: number;
  warm: number;
  quarter: boolean;
  sapSide: number;
  sapMm: number;
  /** Plank end joints (floor): x positions in mm. */
  joints: number[];
  jointTones: number[];
}

interface Knot {
  x: number;
  v: number;
  r: number;
  ex: number;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function makeBoards(o: LongGrainOptions, rand: () => number): Board[] {
  const [bmin, bmax] = o.boardMm ?? [90, 140];
  const widths: number[] = [];
  let sum = 0;
  do {
    const w = bmin + rand() * (bmax - bmin);
    widths.push(w);
    sum += w;
  } while (sum < o.vMm - bmin * 0.5);
  const scale = o.vMm / sum;
  const boards: Board[] = [];
  let v = 0;
  for (const w0 of widths) {
    const w = w0 * scale;
    const r = rand();
    const kind = r < 0.62 ? 'flat' : r < 0.84 ? 'rift' : 'quarter';
    const center = v + w / 2;
    const side = rand() < 0.5 ? -1 : 1;
    const pithV = kind === 'flat' ? center + (rand() - 0.5) * 0.5 * w : center + side * (w / 2 + 30 + rand() * 140);
    const slope = (rand() < 0.5 ? -1 : 1) * (kind === 'flat' ? 0.003 + rand() * 0.005 : rand() * 0.002);
    const minD = Math.abs(slope) * o.uMm * 0.5 + 12;
    const d0 = kind === 'flat' ? minD + 15 + rand() * 70 : kind === 'rift' ? minD + rand() * 40 : rand() * 8;
    const joints: number[] = [];
    const jointTones: number[] = [];
    if (o.planks) {
      let x = rand() * 900;
      while (x < o.uMm) {
        joints.push(x);
        jointTones.push(1 + (rand() - 0.5) * 0.16);
        x += 1100 + rand() * 900;
      }
      if (joints.length === 0) {
        joints.push(rand() * o.uMm);
        jointTones.push(1);
      }
    }
    const board: Board = {
      v0: v,
      v1: v + w,
      pithV,
      d0,
      slope,
      // keep d(x) monotonic (wobble slope < board slope), otherwise rings close into "eyes"
      wobFreq: 0.4 + rand() * 0.8,
      wobAmp: 0,
      wobPhase: rand() * Math.PI * 2,
      ringMm: o.look.ringMm * (0.8 + rand() * 0.45),
      tone: 1 + (rand() - 0.5) * 0.18 * o.look.toneJitter * 2,
      warm: (rand() - 0.5) * 0.06 * o.look.toneJitter,
      quarter: kind !== 'flat',
      sapSide: o.look.sapwood && rand() < 0.08 ? (rand() < 0.5 ? -1 : 1) : 0,
      sapMm: 6 + rand() * 12,
      joints,
      jointTones,
    };
    board.wobAmp = (0.6 * Math.abs(slope) * 1000) / (2 * Math.PI * board.wobFreq);
    if (o.planks) {
      // Floor tiles repeat in both directions: no slope, a whole number of wobble cycles per tile
      board.slope = 0;
      board.wobFreq = ((1 + Math.floor(rand() * 2)) * 1000) / o.uMm;
      board.wobAmp = 3 + rand() * 4;
      board.d0 = Math.max(board.d0, board.wobAmp + 12);
    }
    boards.push(board);
    v += w;
  }
  return boards;
}

/** Periodic noise channel in millimeter space with a feature size (mm) along u and v. */
function channel(uMm: number, vMm: number, featU: number, featV: number, seed: number) {
  const px = Math.max(1, Math.round(uMm / featU));
  const py = Math.max(1, Math.round(vMm / featV));
  return {
    at: (x: number, v: number) => perlin2((x / uMm) * px, (v / vMm) * py, px, py, seed),
    fbm: (x: number, v: number, oct: number) => fbm2((x / uMm) * px, (v / vMm) * py, px, py, seed, oct),
  };
}

/** Shared ring profile: 0 = earlywood, 1 = latewood, within one ring (f in [0, 1)). */
function lateAmount(f: number, look: WoodLook): number {
  const start = 1 - look.lateShare;
  const soft = 0.04 + (1 - look.sharpness) * 0.32;
  const rise = smoothstep(start - soft, start + soft * 0.2, f);
  const end = 0.015 + (1 - look.sharpness) * 0.14;
  return rise * (1 - smoothstep(1 - end, 1, f));
}

/** Long-grain (face) texture of a glued panel. Grain runs along the texture's u (x) axis. */
export function generateLongGrain(o: LongGrainOptions): TextureSet {
  const { look, width: W, height: H, uMm, vMm } = o;
  const rand = rng(o.seed);
  const boards = makeBoards(o, rand);
  const seed = o.seed * 7919;

  const warpN = channel(uMm, vMm, uMm / 3, 60, seed + 1);
  const streakN = channel(uMm, vMm, 140, 1.6, seed + 2);
  const streak2N = channel(uMm, vMm, 40, 0.9, seed + 3);
  const poreN = channel(uMm, vMm, 9, 1.1, seed + 4);
  const rayN = look.rayStyle === 'silver' ? channel(uMm, vMm, 16, 2.4, seed + 5) : channel(uMm, vMm, 4.5, 1.4, seed + 5);
  const sapN = channel(uMm, vMm, 120, 30, seed + 6);
  const toneN = channel(uMm, vMm, uMm / 2, vMm / 3, seed + 7);

  // Knots (pine): positions in mm, wrapped
  const knots: Knot[] = [];
  const nKnots = Math.round((look.knots * uMm * vMm) / 1e6);
  for (let k = 0; k < nKnots; k++) {
    knots.push({ x: rand() * uMm, v: rand() * vMm, r: 4 + rand() * 8, ex: 1.4 + rand() * 1.0 });
  }

  const color = new Uint8ClampedArray(W * H * 4);
  const rough = new Uint8ClampedArray(W * H * 4);
  const heightF = new Float32Array(W * H);
  const early = look.early;
  const late = look.late;
  const pore = look.pore;
  const ray = look.ray;
  const sap = look.sapwood;

  let bi = 0;
  for (let j = 0; j < H; j++) {
    const v = ((j + 0.5) / H) * vMm;
    while (bi < boards.length - 1 && v > boards[bi]!.v1) bi++;
    while (bi > 0 && v < boards[bi]!.v0) bi--;
    const b = boards[bi]!;
    const dv = v - b.pithV;
    const distEdge = Math.min(v - b.v0, b.v1 - v);
    for (let i = 0; i < W; i++) {
      const x = ((i + 0.5) / W) * uMm;
      const idx = j * W + i;

      // Distance of the face from the pith varies along the board: cathedral arches
      // Lateral wander of the rings (wavy lines) and a little in depth
      const wander = warpN.fbm(x, v, 3) * look.wander;
      const dvw = dv + wander * 7;
      const d = Math.max(1, b.d0 + b.slope * (x - uMm / 2) + b.wobAmp * Math.sin((x / 1000) * Math.PI * 2 * b.wobFreq + b.wobPhase) + wander * 0.6);
      let r = Math.sqrt(dvw * dvw + d * d);

      // Knots deflect the rings and have their own dark core
      let knotCore = 0;
      let knotRing = 0;
      for (const k of knots) {
        let kx = x - k.x;
        if (kx > uMm / 2) kx -= uMm;
        else if (kx < -uMm / 2) kx += uMm;
        let kv = v - k.v;
        if (kv > vMm / 2) kv -= vMm;
        else if (kv < -vMm / 2) kv += vMm;
        const e = Math.sqrt((kx / k.ex) * (kx / k.ex) + kv * kv) / k.r;
        if (e < 6) {
          r += 9 * Math.exp(-e * e * 0.35) * look.ringMm;
          if (e < 1.15) {
            knotCore = Math.max(knotCore, 1 - smoothstep(0.85, 1.15, e));
            knotRing = 0.5 + 0.5 * Math.sin(e * 22);
          }
        }
      }

      const ringPos = r / b.ringMm + 0.9 * noise1(r / b.ringMm / 6, o.seed + bi) + 0.25 * noise1(r / b.ringMm / 1.7, o.seed + 31 + bi);
      const ringIdx = Math.floor(ringPos);
      const f = ringPos - ringIdx;
      // Every ring is a different year: vary latewood strength ring by ring
      const year = 0.55 + 0.45 * (noise1(ringIdx * 0.5 + 0.25, o.seed + 77 + bi) * 0.5 + 0.5);
      const lw = lateAmount(f, look) * look.contrast * year;

      let cr = mix(early[0], late[0], lw);
      let cg = mix(early[1], late[1], lw);
      let cb = mix(early[2], late[2], lw);

      // Pores: ring-porous species have a band of large pores at the start of each ring
      let poreAmt = 0;
      if (look.pores > 0) {
        const pn = poreN.at(x, v);
        if (look.ringPorous) {
          const zone = 1 - smoothstep(0.02, 0.2, f);
          poreAmt = zone * smoothstep(-0.15, 0.35, pn) * look.pores * 0.85 + smoothstep(0.35, 0.6, pn) * look.pores * 0.18;
        } else {
          poreAmt = smoothstep(0.3, 0.6, pn) * look.pores * 0.55;
        }
        cr = mix(cr, pore[0], poreAmt);
        cg = mix(cg, pore[1], poreAmt);
        cb = mix(cb, pore[2], poreAmt);
      }

      // Medullary rays: silver flecks on quarter-sawn oak, small dark dots in beech
      let fleck = 0;
      if (look.rays > 0) {
        const q = r > 0 ? Math.abs(dv) / r : 0;
        const rn = rayN.at(x, v);
        if (look.rayStyle === 'silver') fleck = smoothstep(0.32, 0.5, rn) * q * q * look.rays * (b.quarter ? 1 : 0.35);
        else fleck = smoothstep(0.38, 0.55, rn) * (0.35 + 0.65 * q) * look.rays;
        cr = mix(cr, ray[0], fleck);
        cg = mix(cg, ray[1], fleck);
        cb = mix(cb, ray[2], fleck);
      }

      // Sapwood band along one edge of some boards (walnut, pine)
      if (sap && b.sapSide !== 0) {
        const edgeDist = b.sapSide > 0 ? b.v1 - v : v - b.v0;
        const limit = b.sapMm + sapN.at(x, v) * 10;
        const s = 1 - smoothstep(limit - 3, limit + 3, edgeDist);
        if (s > 0) {
          const lwS = lw * 0.35;
          cr = mix(cr, mix(sap[0], late[0], lwS), s);
          cg = mix(cg, mix(sap[1], late[1], lwS), s);
          cb = mix(cb, mix(sap[2], late[2], lwS), s);
        }
      }

      if (knotCore > 0) {
        // knots: dark, desaturated brown (resin-rich wood of the branch)
        const kr = mix(late[0] * 0.45, 78, 0.5);
        const kg = mix(late[1] * 0.42, 52, 0.5);
        const kb = mix(late[2] * 0.4, 34, 0.5);
        const t = knotCore * (0.75 + 0.25 * knotRing);
        cr = mix(cr, kr, t);
        cg = mix(cg, kg, t);
        cb = mix(cb, kb, t);
      }

      // Fiber streaks and slow tone variation
      const s1 = streakN.at(x, v) * look.streaks * 0.11 + streak2N.at(x, v) * look.streaks * 0.05;
      const tone = b.tone * (1 + s1 + toneN.at(x, v) * 0.05 * look.toneJitter);
      cr *= tone * (1 + b.warm);
      cg *= tone;
      cb *= tone * (1 - b.warm);

      // Glue lines between boards (very subtle), plank seams for floors
      let seam = 0;
      if (distEdge < 0.8) seam = o.planks ? 0.45 : 0.06;
      if (o.planks) {
        for (let jn = 0; jn < b.joints.length; jn++) {
          let dx = Math.abs(x - b.joints[jn]!);
          if (dx > uMm / 2) dx = uMm - dx;
          if (dx < 1.2) seam = Math.max(seam, 0.45);
        }
        // tone per plank segment
        let seg = 0;
        for (let jn = 0; jn < b.joints.length; jn++) if (x > b.joints[jn]!) seg = jn;
        const segTone = b.jointTones[seg] ?? 1;
        cr *= segTone;
        cg *= segTone;
        cb *= segTone;
      }
      cr *= 1 - seam;
      cg *= 1 - seam;
      cb *= 1 - seam;

      const p = idx * 4;
      color[p] = cr;
      color[p + 1] = cg;
      color[p + 2] = cb;
      color[p + 3] = 255;

      const hgt = -poreAmt * 1.0 - seam * 2 - knotCore * 0.2 + lw * 0.12;
      heightF[idx] = hgt;
      const ro = clamp01(0.62 + poreAmt * 0.3 - fleck * 0.25 + seam * 0.3);
      rough[p] = rough[p + 1] = rough[p + 2] = ro * 255;
      rough[p + 3] = 255;
    }
  }
  return { width: W, height: H, color, roughness: rough, normal: heightToNormal(heightF, W, H, 1.4) };
}

export interface EndGrainOptions {
  look: WoodLook;
  seed: number;
  width: number;
  height: number;
  /** Physical size (u across boards, v = board thickness direction), mm. */
  uMm: number;
  vMm: number;
}

/** End grain: the cut ends of the boards, with ring arcs, rays and pores. Tiles along u. */
export function generateEndGrain(o: EndGrainOptions): TextureSet {
  const { look, width: W, height: H, uMm, vMm } = o;
  const rand = rng(o.seed + 99);
  const boards: { u0: number; u1: number; cx: number; cy: number; ringMm: number; tone: number }[] = [];
  let u = 0;
  while (u < uMm - 45) {
    const w = 90 + rand() * 50;
    boards.push({ u0: u, u1: u + w, cx: 0, cy: 0, ringMm: look.ringMm * (0.8 + rand() * 0.45), tone: 1 + (rand() - 0.5) * 0.15 * look.toneJitter * 2 });
    u += w;
  }
  const scale = uMm / u;
  for (const b of boards) {
    b.u0 *= scale;
    b.u1 *= scale;
    const below = rand() < 0.5;
    b.cx = (b.u0 + b.u1) / 2 + (rand() - 0.5) * 80;
    b.cy = below ? -(30 + rand() * 180) : vMm + 30 + rand() * 180;
  }
  const seed = o.seed * 104729;
  const poreN = channel(uMm, vMm * 8, 1.0, 1.0, seed + 1);
  const warpN = channel(uMm, vMm * 8, 30, 30, seed + 2);
  const color = new Uint8ClampedArray(W * H * 4);
  const rough = new Uint8ClampedArray(W * H * 4);
  const heightF = new Float32Array(W * H);
  let bi = 0;
  for (let i = 0; i < W; i++) {
    const x = ((i + 0.5) / W) * uMm;
    bi = 0;
    while (bi < boards.length - 1 && x > boards[bi]!.u1) bi++;
    const b = boards[bi]!;
    for (let j = 0; j < H; j++) {
      const y = ((j + 0.5) / H) * vMm;
      const dx = x - b.cx;
      const dy = y - b.cy;
      const r = Math.sqrt(dx * dx + dy * dy) + warpN.at(x, y) * look.wander * 3;
      const ringPos = r / b.ringMm + 0.8 * noise1(r / b.ringMm / 6, o.seed + bi);
      const f = ringPos - Math.floor(ringPos);
      const lw = lateAmount(f, look) * look.contrast;
      // End grain soaks up finish: darker and less saturated than the face
      let cr = mix(look.early[0], look.late[0], lw) * 0.86;
      let cg = mix(look.early[1], look.late[1], lw) * 0.84;
      let cb = mix(look.early[2], look.late[2], lw) * 0.84;
      const pn = poreN.at(x, y);
      const zone = look.ringPorous ? 1 - smoothstep(0.02, 0.22, f) : 0.6;
      const pa = smoothstep(0.25, 0.5, pn) * zone * look.pores * 0.7;
      cr = mix(cr, look.pore[0], pa);
      cg = mix(cg, look.pore[1], pa);
      cb = mix(cb, look.pore[2], pa);
      // Rays: thin radial lines
      if (look.rays > 0.2) {
        const ang = Math.atan2(dy, dx);
        const rl = perlin2(ang * 160, r / 4, 1e6, 1e6, seed + 3);
        const ray = smoothstep(0.42, 0.55, rl) * look.rays * 0.7;
        cr = mix(cr, look.ray[0] * 0.9, ray);
        cg = mix(cg, look.ray[1] * 0.9, ray);
        cb = mix(cb, look.ray[2] * 0.9, ray);
      }
      const edge = Math.min(x - b.u0, b.u1 - x) < 0.7 ? 0.9 : 1;
      const p = (j * W + i) * 4;
      color[p] = cr * b.tone * edge;
      color[p + 1] = cg * b.tone * edge;
      color[p + 2] = cb * b.tone * edge;
      color[p + 3] = 255;
      heightF[j * W + i] = -pa;
      const ro = clamp01(0.78 + pa * 0.2);
      rough[p] = rough[p + 1] = rough[p + 2] = ro * 255;
      rough[p + 3] = 255;
    }
  }
  return { width: W, height: H, color, roughness: rough, normal: heightToNormal(heightF, W, H, 1.0) };
}

/** Tangent-space normal map from a height field (wraps around the edges, so it tiles). */
export function heightToNormal(h: Float32Array, W: number, H: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) {
    const jm = (j - 1 + H) % H;
    const jp = (j + 1) % H;
    for (let i = 0; i < W; i++) {
      const im = (i - 1 + W) % W;
      const ip = (i + 1) % W;
      const dx = (h[j * W + ip]! - h[j * W + im]!) * strength;
      const dy = (h[jp * W + i]! - h[jm * W + i]!) * strength;
      const nx = -dx;
      const ny = dy; // texture v runs downwards in the image, UV v upwards
      const nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const p = (j * W + i) * 4;
      out[p] = (nx / len) * 127.5 + 127.5;
      out[p + 1] = (ny / len) * 127.5 + 127.5;
      out[p + 2] = (nz / len) * 127.5 + 127.5;
      out[p + 3] = 255;
    }
  }
  return out;
}

export interface FlatOptions {
  seed: number;
  width: number;
  height: number;
  sizeMm: number;
}

/** Polished concrete floor. */
export function generateConcrete(o: FlatOptions): TextureSet {
  const { width: W, height: H, sizeMm } = o;
  const n1 = channel(sizeMm, sizeMm, 600, 600, o.seed + 1);
  const n2 = channel(sizeMm, sizeMm, 40, 40, o.seed + 2);
  const n3 = channel(sizeMm, sizeMm, 3, 3, o.seed + 3);
  const color = new Uint8ClampedArray(W * H * 4);
  const rough = new Uint8ClampedArray(W * H * 4);
  const hf = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = ((i + 0.5) / W) * sizeMm;
      const y = ((j + 0.5) / H) * sizeMm;
      const big = n1.fbm(x, y, 3);
      const mid = n2.fbm(x, y, 2);
      const speck = n3.at(x, y);
      let g = 158 + big * 30 + mid * 10;
      const dark = smoothstep(0.42, 0.55, speck);
      g -= dark * 28;
      const light = smoothstep(0.45, 0.6, -speck);
      g += light * 12;
      const p = (j * W + i) * 4;
      color[p] = g * 1.0;
      color[p + 1] = g * 0.985;
      color[p + 2] = g * 0.955;
      color[p + 3] = 255;
      hf[j * W + i] = -dark * 0.4;
      const ro = clamp01(0.5 + big * 0.2 + dark * 0.2);
      rough[p] = rough[p + 1] = rough[p + 2] = ro * 255;
      rough[p + 3] = 255;
    }
  }
  return { width: W, height: H, color, roughness: rough, normal: heightToNormal(hf, W, H, 1.2) };
}

/** Terracotta tiles (300 mm) with grout. */
export function generateTerracotta(o: FlatOptions): TextureSet {
  const { width: W, height: H, sizeMm } = o;
  const tile = 300;
  const grout = 5;
  const rand = rng(o.seed);
  const n = Math.round(sizeMm / tile);
  const tones: number[] = [];
  for (let k = 0; k < n * n; k++) tones.push(rand());
  const n1 = channel(sizeMm, sizeMm, 90, 90, o.seed + 1);
  const n2 = channel(sizeMm, sizeMm, 6, 6, o.seed + 2);
  const color = new Uint8ClampedArray(W * H * 4);
  const rough = new Uint8ClampedArray(W * H * 4);
  const hf = new Float32Array(W * H);
  const base: RGB = [176, 98, 66];
  const alt: RGB = [196, 122, 82];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = ((i + 0.5) / W) * sizeMm;
      const y = ((j + 0.5) / H) * sizeMm;
      const tx = Math.floor(x / tile);
      const ty = Math.floor(y / tile);
      const lx = x - tx * tile;
      const ly = y - ty * tile;
      const edge = Math.min(lx, ly, tile - lx, tile - ly);
      const inGrout = edge < grout / 2;
      const t = tones[(ty % n) * n + (tx % n)] ?? 0.5;
      const cloud = n1.fbm(x, y, 3);
      const grain = n2.at(x, y);
      let r = mix(base[0], alt[0], t) * (1 + cloud * 0.12 + grain * 0.04);
      let g = mix(base[1], alt[1], t) * (1 + cloud * 0.14 + grain * 0.04);
      let b = mix(base[2], alt[2], t) * (1 + cloud * 0.14 + grain * 0.04);
      // Worn, slightly lighter centre, darker bevel at the edges
      const bevel = smoothstep(grout / 2, grout / 2 + 6, edge);
      r *= 0.88 + 0.12 * bevel;
      g *= 0.88 + 0.12 * bevel;
      b *= 0.88 + 0.12 * bevel;
      if (inGrout) {
        r = 168;
        g = 160;
        b = 148;
      }
      const p = (j * W + i) * 4;
      color[p] = r;
      color[p + 1] = g;
      color[p + 2] = b;
      color[p + 3] = 255;
      hf[j * W + i] = inGrout ? -1.5 : bevel * 0.3 - 0.3 + grain * 0.05;
      const ro = inGrout ? 0.95 : 0.7 + cloud * 0.1;
      rough[p] = rough[p + 1] = rough[p + 2] = clamp01(ro) * 255;
      rough[p + 3] = 255;
    }
  }
  return { width: W, height: H, color, roughness: rough, normal: heightToNormal(hf, W, H, 1.5) };
}

/** sRGB color transform for build-time previews of a finish (multiply + saturation). */
export function applyFinishPreview(color: Uint8ClampedArray, multiply: [number, number, number], saturation: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(color.length);
  for (let p = 0; p < color.length; p += 4) {
    let r = color[p]! * multiply[0];
    let g = color[p + 1]! * multiply[1];
    let b = color[p + 2]! * multiply[2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * saturation;
    g = l + (g - l) * saturation;
    b = l + (b - l) * saturation;
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = 255;
  }
  return out;
}

/** Texture tile sizes used by the configurator (physical mm) – shared with the UV mapping. */
// Along the grain the texture is longer than the longest part (3 m), so it never repeats lengthwise
// and the cathedral arches can run in one direction; across the grain it tiles seamlessly (glue joint).
export const LONG_GRAIN_TILE = { uMm: 3200, vMm: 700 };
export const END_GRAIN_TILE = { uMm: 700, vMm: 110 };
export const FLOOR_TILE_MM = 2400;

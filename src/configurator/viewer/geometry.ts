// three.js geometry for the parametric parts.
//
// Every part is built as a "profiled slab": a rectangular board whose edges follow a cross-section
// profile (eased, rounded, chamfered, undercut). The grain runs along the slab's local x axis; parts with
// vertical or depth-wise grain are rotated. UVs are in real-world units (one texture = 3.2 m × 0.7 m of
// wood), so nothing is ever stretched, and the end faces use a separate end-grain material (group 1).

import * as THREE from 'three';
import type { EdgeProfile, Part } from '../../lib/types.ts';
import { END_GRAIN_TILE, LONG_GRAIN_TILE } from '../../lib/wood/generator.ts';

/** Profile point: inset from the outer edge (mm) and height (mm, top = +T/2). */
type P2 = [number, number];

export function edgeProfile(edge: EdgeProfile, T: number): P2[] {
  const h = T / 2;
  const e = Math.min(1.5, T / 6);
  switch (edge) {
    case 'rounded': {
      const r = Math.min(7, T / 3);
      const pts: P2[] = [];
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const a = (Math.PI / 2) * (i / n);
        // arc from (r, h) to (0, h - r), centred at (r, h - r)
        pts.push([r - Math.sin(a) * r, h - r + Math.cos(a) * r]);
      }
      pts.push([0, -h + e], [e, -h]);
      return pts;
    }
    case 'chamfer': {
      const c = Math.min(6, T / 4);
      return [[c, h], [0, h - c], [0, -h + e], [e, -h]];
    }
    case 'undercut': {
      const edgeH = Math.min(10, T * 0.35);
      const bevel = Math.min(60, (T - edgeH) * 2.2);
      return [[e, h], [0, h - e], [0, h - edgeH], [bevel, -h]];
    }
    case 'eased':
    default:
      return [[e, h], [0, h - e], [0, -h + e], [e, -h]];
  }
}

export interface SlabOptions {
  /** Length along the grain, thickness (local y) and width (local z), mm. */
  L: number;
  T: number;
  W: number;
  profile: P2[];
  /** UV offsets (0–1) so that parts don't all show the same piece of wood. */
  uOffset: number;
  vOffset: number;
  /** Taper (legs): cross-section scale at the local -x end and which corner stays flush (local y, z signs). */
  taper?: { ratioY: number; ratioZ: number; flushY: number; flushZ: number };
}

const SMOOTH_COS = Math.cos((40 * Math.PI) / 180);

/** Builds the slab in meters, centred at the origin, grain along +x. Group 0 = long grain, group 1 = end grain. */
export function createSlabGeometry(o: SlabOptions): THREE.BufferGeometry {
  const { L, T, W, profile } = o;
  const U = LONG_GRAIN_TILE.uMm;
  const V = LONG_GRAIN_TILE.vMm;
  const EU = END_GRAIN_TILE.uMm;
  const EV = END_GRAIN_TILE.vMm;

  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idxLong: number[] = [];
  const idxEnd: number[] = [];

  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => {
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };
  const quad = (list: number[], a: number, b: number, c: number, d: number) => {
    // a-b-c-d counter-clockwise seen from outside
    list.push(a, b, c, a, c, d);
  };

  // Segment normals in the (outward, up) plane and arc length along the profile
  const segN: [number, number][] = [];
  const arc: number[] = [0];
  for (let i = 0; i < profile.length - 1; i++) {
    const [a0, y0] = profile[i]!;
    const [a1, y1] = profile[i + 1]!;
    const vo = -(a1 - a0); // outward component of the segment vector
    const vy = y1 - y0;
    const len = Math.hypot(vo, vy) || 1;
    // rotate the (downward-running) segment vector to point outwards
    segN.push([-vy / len, vo / len]);
    arc.push(arc[i]! + len);
  }
  const rowNormal = (seg: number, atStart: boolean): [number, number] => {
    const n = segN[seg]!;
    const other = atStart ? segN[seg - 1] : segN[seg + 1];
    if (!other) return n;
    const dot = n[0] * other[0] + n[1] * other[1];
    if (dot < SMOOTH_COS) return n;
    const sx = n[0] + other[0];
    const sy = n[1] + other[1];
    const l = Math.hypot(sx, sy) || 1;
    return [sx / l, sy / l];
  };

  const hx = L / 2;
  const hz = W / 2;
  // Long-grain UVs: u along x, v along z (caps) or along the profile (sides)
  const uOf = (x: number) => (x + hx) / U + o.uOffset;

  // ---- Caps
  const [aTop, yTop] = profile[0]!;
  const [aBot, yBot] = profile[profile.length - 1]!;
  {
    const x0 = -hx + aTop, x1 = hx - aTop, z0 = -hz + aTop, z1 = hz - aTop;
    const a = vert(x0, yTop, z1, 0, 1, 0, uOf(x0), (z1 + hz) / V + o.vOffset);
    const b = vert(x1, yTop, z1, 0, 1, 0, uOf(x1), (z1 + hz) / V + o.vOffset);
    const c = vert(x1, yTop, z0, 0, 1, 0, uOf(x1), (z0 + hz) / V + o.vOffset);
    const d = vert(x0, yTop, z0, 0, 1, 0, uOf(x0), (z0 + hz) / V + o.vOffset);
    quad(idxLong, a, b, c, d);
  }
  {
    const x0 = -hx + aBot, x1 = hx - aBot, z0 = -hz + aBot, z1 = hz - aBot;
    const a = vert(x0, yBot, z0, 0, -1, 0, uOf(x0), (z0 + hz) / V + o.vOffset + 0.37);
    const b = vert(x1, yBot, z0, 0, -1, 0, uOf(x1), (z0 + hz) / V + o.vOffset + 0.37);
    const c = vert(x1, yBot, z1, 0, -1, 0, uOf(x1), (z1 + hz) / V + o.vOffset + 0.37);
    const d = vert(x0, yBot, z1, 0, -1, 0, uOf(x0), (z1 + hz) / V + o.vOffset + 0.37);
    quad(idxLong, a, b, c, d);
  }

  // ---- Side walls, one strip per profile segment and side
  for (let s = 0; s < profile.length - 1; s++) {
    const [a0, y0] = profile[s]!;
    const [a1, y1] = profile[s + 1]!;
    const n0 = rowNormal(s, true);
    const n1 = rowNormal(s, false);
    const s0 = arc[s]!;
    const s1 = arc[s + 1]!;

    // Front (+z) and back (-z): long grain
    for (const side of [1, -1]) {
      const z0 = side * (hz - a0);
      const z1 = side * (hz - a1);
      const xa0 = hx - a0, xa1 = hx - a1;
      const vo = side > 0 ? 0.11 : 0.53;
      const p00 = vert(-xa0, y0, z0, 0, n0[1], side * n0[0], uOf(-xa0), s0 / V + vo);
      const p10 = vert(xa0, y0, z0, 0, n0[1], side * n0[0], uOf(xa0), s0 / V + vo);
      const p11 = vert(xa1, y1, z1, 0, n1[1], side * n1[0], uOf(xa1), s1 / V + vo);
      const p01 = vert(-xa1, y1, z1, 0, n1[1], side * n1[0], uOf(-xa1), s1 / V + vo);
      if (side > 0) quad(idxLong, p00, p01, p11, p10);
      else quad(idxLong, p00, p10, p11, p01);
    }
    // Ends (+x / -x): end grain
    for (const side of [1, -1]) {
      const x0 = side * (hx - a0);
      const x1 = side * (hx - a1);
      const za0 = hz - a0, za1 = hz - a1;
      const eo = side > 0 ? 0.0 : 0.5;
      const p00 = vert(x0, y0, -za0, side * n0[0], n0[1], 0, (-za0 + hz) / EU + eo, s0 / EV);
      const p10 = vert(x0, y0, za0, side * n0[0], n0[1], 0, (za0 + hz) / EU + eo, s0 / EV);
      const p11 = vert(x1, y1, za1, side * n1[0], n1[1], 0, (za1 + hz) / EU + eo, s1 / EV);
      const p01 = vert(x1, y1, -za1, side * n1[0], n1[1], 0, (-za1 + hz) / EU + eo, s1 / EV);
      if (side > 0) quad(idxEnd, p00, p10, p11, p01);
      else quad(idxEnd, p00, p01, p11, p10);
    }
  }

  // ---- Taper (legs): shrink the cross-section towards the bottom (local -x), one corner stays flush
  if (o.taper) {
    const { ratioY, ratioZ, flushY, flushZ } = o.taper;
    const fy = flushY * (T / 2);
    const fz = flushZ * (W / 2);
    for (let i = 0; i < pos.length; i += 3) {
      const t = (pos[i]! + hx) / L; // 0 at the bottom end, 1 at the top end
      const sy = ratioY + (1 - ratioY) * t;
      const sz = ratioZ + (1 - ratioZ) * t;
      pos[i + 1] = fy + (pos[i + 1]! - fy) * sy;
      pos[i + 2] = fz + (pos[i + 2]! - fz) * sz;
    }
  }

  const g = new THREE.BufferGeometry();
  const scale = 0.001; // mm → m
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.map((v) => v * scale), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...idxLong, ...idxEnd]);
  g.addGroup(0, idxLong.length, 0);
  g.addGroup(idxLong.length, idxEnd.length, 1);
  if (o.taper) g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Deterministic 0–1 hash of a string (part ids → texture offsets). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface PartGeometry {
  geometry: THREE.BufferGeometry;
  /** Rotation that turns the local grain axis (x) into the part's grain axis. */
  rotation: [number, number, number];
  key: string;
}

/** Maps a model part (world-aligned box + grain axis) to a slab geometry and rotation. */
export function partGeometry(part: Part): PartGeometry {
  const [sx, sy, sz] = part.size;
  let L: number, T: number, W: number;
  let rotation: [number, number, number] = [0, 0, 0];
  let flushY = 0;
  let flushZ = 0;
  if (part.grain === 'x') {
    L = sx;
    T = sy;
    W = sz;
  } else if (part.grain === 'y') {
    // rotate +90° about z: local x → world y, local y → world -x
    L = sy;
    T = sx;
    W = sz;
    rotation = [0, 0, Math.PI / 2];
    if (part.taper) {
      flushY = -part.taper.flush[0];
      flushZ = part.taper.flush[1];
    }
  } else {
    // rotate -90° about y: local x → world z, local z → world -x
    L = sz;
    T = sy;
    W = sx;
    rotation = [0, -Math.PI / 2, 0];
  }
  const edge = part.edge ?? 'eased';
  const profile = edgeProfile(edge, T);
  const h = hash01(part.id);
  const uOffset = h * Math.max(0, 1 - L / LONG_GRAIN_TILE.uMm);
  const vOffset = hash01(part.id + 'v');
  const taper = part.taper
    ? { ratioY: part.taper.bottom[0] / T, ratioZ: part.taper.bottom[1] / W, flushY, flushZ }
    : undefined;
  const key = `${L}|${T}|${W}|${edge}|${part.id}|${taper ? `${taper.ratioY},${flushY},${flushZ}` : ''}`;
  return { geometry: createSlabGeometry({ L, T, W, profile, uOffset, vOffset, ...(taper ? { taper } : {}) }), rotation, key };
}

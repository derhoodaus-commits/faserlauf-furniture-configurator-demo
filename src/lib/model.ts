// Parametric furniture model: turns a Config into a list of physical parts (mm).
// The same parts drive the 3D view, the price (material volume, surface, joints),
// the cut list in the PDF and the GLB export. No three.js in here.

import type { Config, EdgeProfile, Part } from './types.ts';

export interface Structure {
  /** Unsupported span of the top / seat between supports (mm). */
  topSpanMm: number;
  /** Rails under the top that stiffen it along the span (apron or back rail), or null. */
  apron: { height: number; thickness: number; count: number } | null;
  /** Bookcase: free span of the shelves (mm) and clear spacing between shelves (mm). */
  shelfSpanMm: number;
  shelfDepthMm: number;
  shelfGapMm: number;
  /** Lower shelf of coffee table / bench (span mm), 0 if none. */
  lowerShelfSpanMm: number;
}

export interface Model {
  parts: Part[];
  structure: Structure;
  /** Overall bounding box [x, y, z] in mm. */
  bounds: [number, number, number];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function cutFromSize(size: [number, number, number], grain: 'x' | 'y' | 'z') {
  const [x, y, z] = size;
  const along = grain === 'x' ? x : grain === 'y' ? y : z;
  const others = grain === 'x' ? [y, z] : grain === 'y' ? [x, z] : [x, y];
  const width = Math.max(others[0]!, others[1]!);
  const thickness = Math.min(others[0]!, others[1]!);
  return { length: r1(along), width: r1(width), thickness: r1(thickness) };
}

function part(
  id: string,
  name: string,
  group: Part['group'],
  size: [number, number, number],
  position: [number, number, number],
  grain: Part['grain'],
  extra: Partial<Part> = {},
): Part {
  const s: [number, number, number] = [r1(size[0]), r1(size[1]), r1(size[2])];
  return {
    id,
    name,
    group,
    shape: 'box',
    size: s,
    position: [r1(position[0]), r1(position[1]), r1(position[2])],
    grain,
    cut: cutFromSize(s, grain),
    ...extra,
  };
}

const slab = (
  id: string,
  name: string,
  group: Part['group'],
  size: [number, number, number],
  position: [number, number, number],
  edge: EdgeProfile,
): Part => part(id, name, group, size, position, 'x', { shape: 'slab', edge });

/** Product-specific proportions of the table-like bases (mm). */
const TABLE_DIMS = {
  'dining-table': { leg: 65, insetX: 80, insetZ: 50, apron: 90, shelfY: 0 },
  'coffee-table': { leg: 50, insetX: 40, insetZ: 40, apron: 70, shelfY: 110 },
  desk: { leg: 55, insetX: 40, insetZ: 40, apron: 90, shelfY: 0 },
  bench: { leg: 55, insetX: 50, insetZ: 30, apron: 60, shelfY: 100 },
} as const;

const APRON_T = 22;
const APRON_SETBACK = 8;

function tableModel(c: Config): Model {
  const product = c.product as keyof typeof TABLE_DIMS;
  const dims = TABLE_DIMS[product];
  const L = c.lengthCm * 10;
  const W = c.widthCm * 10;
  const H = c.heightCm * 10;
  const t = c.thicknessMm;
  const parts: Part[] = [];
  const topName = product === 'bench' ? 'Seat' : product === 'desk' ? 'Desktop' : 'Tabletop';
  parts.push(slab('top', topName, 'top', [L, t, W], [0, H - t / 2, 0], c.edge));

  const baseH = H - t;
  let topSpanMm = L;
  let apron: Structure['apron'] = null;
  let lowerShelfSpanMm = 0;
  const hasShelf = c.shelves > 0 && (product === 'coffee-table' || product === 'bench');
  const drawers = product === 'desk' ? c.drawers : 0;
  const apronH = drawers > 0 ? 110 : dims.apron;

  if (c.leg === 'tapered' || c.leg === 'square') {
    const s = dims.leg;
    const lx = L / 2 - dims.insetX - s / 2;
    const lz = W / 2 - dims.insetZ - s / 2;
    let i = 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        i++;
        const pos: [number, number, number] = [sx * lx, baseH / 2, sz * lz];
        if (c.leg === 'tapered') {
          parts.push(
            part(`leg-${i}`, 'Leg (tapered)', 'base', [s, baseH, s], pos, 'y', {
              shape: 'tapered',
              taper: { bottom: [r1(s * 0.58), r1(s * 0.58)], flush: [sx, sz] },
            }),
          );
        } else {
          parts.push(part(`leg-${i}`, 'Leg', 'base', [s, baseH, s], pos, 'y'));
        }
      }
    }
    // Apron rails: outer face set back from the leg face, tenons (2 × 25 mm) included in the cut length
    const railY = baseH - apronH / 2;
    const longLen = 2 * lx - s;
    const shortLen = 2 * lz - s;
    const zRail = lz + s / 2 - APRON_SETBACK - APRON_T / 2;
    const xRail = lx + s / 2 - APRON_SETBACK - APRON_T / 2;
    for (const sz of [-1, 1]) {
      if (sz > 0 && drawers > 0) {
        frontRailWithDrawers(parts, drawers, longLen, zRail, railY, apronH, W - 2 * dims.insetZ - 2 * s);
        continue;
      }
      const p = part(`apron-long-${sz < 0 ? 'back' : 'front'}`, 'Apron rail, long', 'base', [longLen, apronH, APRON_T], [0, railY, sz * zRail], 'x');
      p.cut.length = r1(longLen + 50);
      parts.push(p);
    }
    for (const sx of [-1, 1]) {
      const p = part(`apron-short-${sx < 0 ? 'left' : 'right'}`, 'Apron rail, short', 'base', [APRON_T, apronH, shortLen], [sx * xRail, railY, 0], 'z');
      p.cut.length = r1(shortLen + 50);
      parts.push(p);
    }
    topSpanMm = 2 * lx;
    apron = { height: apronH, thickness: APRON_T, count: 2 };

    if (hasShelf) {
      const ts = 20;
      const shelfLen = 2 * lx - s + 2 * 10; // housed 10 mm into the legs
      const shelfW = 2 * lz + s - 2 * 12;
      const y = dims.shelfY;
      parts.push(slab('lower-shelf', 'Lower shelf', 'shelf', [shelfLen, ts, shelfW], [0, y + ts / 2, 0], 'eased'));
      for (const sx of [-1, 1]) {
        const p = part(`stretcher-${sx < 0 ? 'left' : 'right'}`, 'Shelf stretcher', 'base', [APRON_T, 40, shortLen], [sx * lx, y - 20, 0], 'z');
        p.cut.length = r1(shortLen + 50);
        parts.push(p);
      }
      lowerShelfSpanMm = 2 * lx - s;
    }
  } else if (c.leg === 'panel') {
    const pt = Math.min(40, Math.max(26, t));
    const insetX = product === 'desk' ? 50 : product === 'bench' ? 70 : 60;
    const insetZ = product === 'desk' ? 40 : 25;
    const px = L / 2 - insetX - pt / 2;
    const depth = W - 2 * insetZ;
    for (const sx of [-1, 1]) {
      parts.push(part(`panel-${sx < 0 ? 'left' : 'right'}`, 'Side panel', 'base', [pt, baseH, depth], [sx * px, baseH / 2, 0], 'y'));
    }
    const inner = 2 * px - pt;
    topSpanMm = 2 * px;
    // Back rail under the top keeps the panels square
    const railH = product === 'desk' ? 120 : 80;
    const rail = part('back-rail', 'Back rail', 'base', [inner, railH, APRON_T], [0, baseH - railH / 2, -(depth / 2 - APRON_T / 2 - 20)], 'x');
    rail.cut.length = r1(inner + 2 * 15);
    parts.push(rail);
    apron = { height: railH, thickness: APRON_T, count: drawers > 0 ? 2 : 1 };
    if (hasShelf) {
      const ts = 20;
      const y = TABLE_DIMS[product].shelfY;
      parts.push(slab('lower-shelf', 'Lower shelf', 'shelf', [inner + 2 * 8, ts, depth - 30], [0, y + ts / 2, 0], 'eased'));
      lowerShelfSpanMm = inner;
    }
    if (drawers > 0) {
      const frontZ = depth / 2 - APRON_T / 2 - 10;
      frontRailWithDrawers(parts, drawers, inner, frontZ, baseH - apronH / 2, apronH, depth - 80);
    }
  } else {
    // Trestle base (dining table): two trestles + stretcher, no apron
    const overhang = Math.min(420, Math.max(220, 0.16 * L));
    const tx = L / 2 - overhang;
    const footH = 70;
    const bearerH = 60;
    const uprightH = baseH - footH - bearerH;
    const uprightW = Math.min(260, Math.max(160, 0.28 * W));
    for (const sx of [-1, 1]) {
      const side = sx < 0 ? 'left' : 'right';
      parts.push(part(`trestle-foot-${side}`, 'Trestle foot', 'base', [80, footH, W - 120], [sx * tx, footH / 2, 0], 'z'));
      parts.push(part(`trestle-upright-${side}`, 'Trestle upright', 'base', [60, uprightH, uprightW], [sx * tx, footH + uprightH / 2, 0], 'y'));
      parts.push(part(`trestle-bearer-${side}`, 'Trestle bearer', 'base', [80, bearerH, W - 180], [sx * tx, baseH - bearerH / 2, 0], 'z'));
    }
    const stretcherLen = 2 * tx - 60;
    const st = part('stretcher', 'Stretcher', 'base', [stretcherLen, 110, 40], [0, footH + uprightH * 0.42, 0], 'x');
    st.cut.length = r1(stretcherLen + 2 * 60); // through tenons
    parts.push(st);
    topSpanMm = 2 * tx;
  }

  return {
    parts,
    structure: { topSpanMm, apron, shelfSpanMm: 0, shelfDepthMm: 0, shelfGapMm: 0, lowerShelfSpanMm },
    bounds: [L, H, W],
  };
}

/**
 * Front apron with drawer openings: the rail is split into segments around the openings, with a
 * runner strip under each drawer. Drawer fronts sit flush in the openings with a 3 mm gap.
 */
function frontRailWithDrawers(parts: Part[], n: number, railLen: number, railZ: number, railY: number, apronH: number, boxDepth: number) {
  const dw = Math.min(460, Math.max(300, railLen * 0.34));
  const gap = 3;
  const strip = 20;
  const centers = n === 1 ? [railLen / 2 - dw / 2 - 60] : [-(railLen / 2 - dw / 2 - 60), railLen / 2 - dw / 2 - 60];
  const yBottom = railY - apronH / 2;
  // Rail segments between the openings
  const openings = centers.map((x) => [x - dw / 2 - gap, x + dw / 2 + gap] as const).sort((a, b) => a[0] - b[0]);
  let cursor = -railLen / 2;
  let seg = 0;
  for (const [a, b] of [...openings, [railLen / 2, railLen / 2] as const]) {
    if (a - cursor > 1) {
      seg++;
      const p = part(`apron-front-${seg}`, 'Apron rail, front segment', 'base', [a - cursor, apronH, APRON_T], [(a + cursor) / 2, railY, railZ], 'x');
      if (cursor === -railLen / 2 || a === railLen / 2) p.cut.length = r1(a - cursor + 25);
      parts.push(p);
    }
    cursor = b;
  }
  const frontH = apronH - strip - 2 * gap;
  const depth = Math.max(250, Math.min(boxDepth, 520));
  centers.forEach((x, i) => {
    const k = i + 1;
    parts.push(part(`drawer-runner-${k}`, 'Drawer runner rail', 'base', [dw + 2 * gap, strip, APRON_T], [x, yBottom + strip / 2, railZ], 'x'));
    const fy = yBottom + strip + gap + frontH / 2;
    parts.push(part(`drawer-front-${k}`, 'Drawer front', 'drawer', [dw, frontH, APRON_T], [x, fy, railZ], 'x'));
    parts.push(part(`drawer-pull-${k}`, 'Drawer pull', 'drawer', [96, 14, 16], [x, fy, railZ + APRON_T / 2 + 8], 'x'));
    const bz = railZ - APRON_T / 2 - depth / 2;
    parts.push(part(`drawer-side-l-${k}`, 'Drawer side', 'drawer', [12, frontH - 10, depth], [x - dw / 2 + 20, fy, bz], 'z', { hidden: true }));
    parts.push(part(`drawer-side-r-${k}`, 'Drawer side', 'drawer', [12, frontH - 10, depth], [x + dw / 2 - 20, fy, bz], 'z', { hidden: true }));
    parts.push(part(`drawer-back-${k}`, 'Drawer back', 'drawer', [dw - 40, frontH - 20, 12], [x, fy, bz - depth / 2], 'x', { hidden: true }));
    parts.push(part(`drawer-bottom-${k}`, 'Drawer bottom (birch plywood)', 'drawer', [dw - 40, 8, depth], [x, fy - frontH / 2 + 12, bz], 'x', { hidden: true }));
  });
}

function bookcaseModel(c: Config): Model {
  const L = c.lengthCm * 10;
  const D = c.widthCm * 10;
  const H = c.heightCm * 10;
  const t = c.thicknessMm;
  const parts: Part[] = [];
  const plinth = c.leg === 'plinth';
  const sideBottom = plinth ? 0 : 120;
  const bottomY = plinth ? 80 : 120;
  const sideH = H - t - sideBottom;
  const BACK_T = 12;
  const shelfDepth = D - BACK_T - 10;
  const shelfZ = (D / 2) - shelfDepth / 2;

  // Top overlays the sides and carries the chosen edge profile
  parts.push(slab('top', 'Top', 'carcass', [L, t, D], [0, H - t / 2, 0], c.edge));
  for (const sx of [-1, 1]) {
    parts.push(part(`side-${sx < 0 ? 'left' : 'right'}`, 'Side', 'carcass', [t, sideH, D], [sx * (L / 2 - t / 2), sideBottom + sideH / 2, 0], 'y'));
  }
  const inner = L - 2 * t;
  const housed = inner + 2 * 6; // 6 mm grooves on both sides
  const bottom = slab('bottom', 'Bottom shelf', 'carcass', [inner, t, shelfDepth], [0, bottomY + t / 2, shelfZ], 'eased');
  bottom.cut.length = r1(housed);
  parts.push(bottom);

  const clear = H - t - (bottomY + t);
  const n = c.shelves;
  const gap = (clear - n * t) / (n + 1);
  for (let i = 1; i <= n; i++) {
    const y = bottomY + t + i * gap + (i - 1) * t + t / 2;
    const s = slab(`shelf-${i}`, 'Shelf', 'shelf', [inner, t, shelfDepth], [0, y, shelfZ], 'eased');
    s.cut.length = r1(housed);
    parts.push(s);
  }
  // Back: tongue-and-groove boards, between the sides, in a rebate
  const backH = H - t - bottomY;
  parts.push(part('back', 'Back boards (tongue and groove)', 'back', [inner, backH, BACK_T], [0, bottomY + backH / 2, -D / 2 + BACK_T / 2 + 4], 'y'));

  if (plinth) {
    const kick = part('plinth', 'Plinth board', 'base', [inner, bottomY, 22], [0, bottomY / 2, D / 2 - 40 - 11], 'x');
    parts.push(kick);
  } else {
    const s = 50;
    let i = 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        i++;
        parts.push(
          part(`foot-${i}`, 'Foot (tapered)', 'base', [s, 120, s], [sx * (L / 2 - 30 - s / 2 + 10), 60, sz * (D / 2 - 30 - s / 2 + 10)], 'y', {
            shape: 'tapered',
            taper: { bottom: [32, 32], flush: [sx, sz] },
          }),
        );
      }
    }
  }

  return {
    parts,
    structure: { topSpanMm: inner, apron: null, shelfSpanMm: inner, shelfDepthMm: shelfDepth, shelfGapMm: gap, lowerShelfSpanMm: 0 },
    bounds: [L, H, D],
  };
}

export function buildModel(c: Config): Model {
  return c.product === 'bookcase' ? bookcaseModel(c) : tableModel(c);
}

export interface CutListRow {
  name: string;
  qty: number;
  length: number;
  width: number;
  thickness: number;
}

/** Groups identical parts into cut list rows (mm, finished dimensions). */
export function cutList(parts: Part[]): CutListRow[] {
  const rows = new Map<string, CutListRow>();
  for (const p of parts) {
    const key = `${p.name}|${p.cut.length}|${p.cut.width}|${p.cut.thickness}`;
    const row = rows.get(key);
    if (row) row.qty++;
    else rows.set(key, { name: p.name, qty: 1, ...p.cut });
  }
  return [...rows.values()];
}

/** Volume of solid wood in the finished parts, m³. */
export function partsVolumeM3(parts: Part[]): number {
  return parts.reduce((s, p) => s + (p.cut.length * p.cut.width * p.cut.thickness) / 1e9, 0);
}

/** Surface area of all parts (all six faces), m². Used for sanding and finishing. */
export function partsSurfaceM2(parts: Part[]): number {
  return parts.reduce((s, p) => {
    const [x, y, z] = p.size;
    return s + (2 * (x * y + y * z + x * z)) / 1e6;
  }, 0);
}

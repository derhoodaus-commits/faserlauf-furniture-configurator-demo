import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildModel, cutList, partsVolumeM3 } from '../../src/lib/model.ts';
import { defaultConfig } from '../../src/lib/config.ts';
import { PRODUCT_IDS } from '../../src/data/products.ts';
import { createSlabGeometry, edgeProfile, partGeometry } from '../../src/configurator/viewer/geometry.ts';
import { LONG_GRAIN_TILE } from '../../src/lib/wood/generator.ts';
import { rng } from '../../src/lib/wood/noise.ts';
import { randomConfig } from './helpers.ts';
import type { EdgeProfile } from '../../src/lib/types.ts';

const box = (p: { size: number[]; position: number[] }) => ({
  min: p.position.map((v, i) => v - p.size[i]! / 2),
  max: p.position.map((v, i) => v + p.size[i]! / 2),
});

describe('parametric model', () => {
  it.each(PRODUCT_IDS)('%s: parts fill the configured size, stand on the floor and have positive dimensions', (id) => {
    const c = defaultConfig(id);
    const m = buildModel(c);
    const visible = m.parts.filter((p) => !p.hidden);
    const boxes = visible.map(box);
    const minY = Math.min(...boxes.map((b) => b.min[1]!));
    const maxY = Math.max(...boxes.map((b) => b.max[1]!));
    const minX = Math.min(...boxes.map((b) => b.min[0]!));
    const maxX = Math.max(...boxes.map((b) => b.max[0]!));
    expect(minY).toBeCloseTo(0, 1);
    expect(maxY).toBeCloseTo(c.heightCm * 10, 1);
    expect(maxX - minX).toBeCloseTo(c.lengthCm * 10, 0);
    for (const p of m.parts) for (const s of p.size) expect(s).toBeGreaterThan(0);
  });

  it('holds for 500 random configurations (no negative or zero parts, nothing outside the bounds)', () => {
    const r = rng(3);
    for (let i = 0; i < 500; i++) {
      const c = randomConfig(PRODUCT_IDS[i % PRODUCT_IDS.length]!, r);
      const m = buildModel(c);
      for (const p of m.parts) {
        for (const s of p.size) expect(s).toBeGreaterThan(0);
        const b = box(p);
        expect(b.min[1]!).toBeGreaterThanOrEqual(-0.01);
        expect(b.max[1]!).toBeLessThanOrEqual(c.heightCm * 10 + 0.01);
      }
    }
  });

  it('bookcase has the chosen number of evenly spaced shelves', () => {
    const c = { ...defaultConfig('bookcase'), shelves: 5 };
    const ys = buildModel(c).parts.filter((p) => p.id.startsWith('shelf-')).map((p) => p.position[1]);
    expect(ys).toHaveLength(5);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]!);
    for (const g of gaps) expect(Math.abs(g - gaps[0]!)).toBeLessThan(0.3);
  });

  it('desk drawers: fronts in the apron, boxes hidden but in the cut list', () => {
    const m = buildModel({ ...defaultConfig('desk'), drawers: 2 });
    expect(m.parts.filter((p) => p.id.startsWith('drawer-front')).length).toBe(2);
    const hidden = m.parts.filter((p) => p.hidden);
    expect(hidden.length).toBe(8);
    expect(cutList(m.parts).some((r) => r.name.startsWith('Drawer bottom'))).toBe(true);
  });

  it('grain runs along the length of every part (cut length is the longest side except for end-grain blocks)', () => {
    for (const id of PRODUCT_IDS) {
      for (const p of buildModel(defaultConfig(id)).parts) {
        const along = p.grain === 'x' ? p.size[0] : p.grain === 'y' ? p.size[1] : p.size[2];
        expect(p.cut.length).toBeGreaterThanOrEqual(along - 0.01);
      }
    }
  });

  it('cut list groups identical parts and keeps the total count', () => {
    const m = buildModel(defaultConfig('dining-table'));
    const rows = cutList(m.parts);
    expect(rows.reduce((s, r) => s + r.qty, 0)).toBe(m.parts.length);
    expect(rows.find((r) => r.name.startsWith('Leg'))?.qty).toBe(4);
    expect(partsVolumeM3(m.parts)).toBeGreaterThan(0.05);
  });
});

describe('3D geometry', () => {
  const profiles: EdgeProfile[] = ['eased', 'rounded', 'chamfer', 'undercut'];

  it.each(profiles)('%s slab: outward-facing triangles, exact size, end grain in its own group', (edge) => {
    const g = createSlabGeometry({ L: 2000, T: 30, W: 900, profile: edgeProfile(edge, 30), uOffset: 0, vOffset: 0 });
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2, 4);
    expect(size.y).toBeCloseTo(0.03, 4);
    expect(size.z).toBeCloseTo(0.9, 4);
    expect(g.groups).toHaveLength(2);
    // Every triangle's winding agrees with its vertex normals (no inside-out faces)
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const idx = g.getIndex()!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      const [ia, ib, ic] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, ib);
      c.fromBufferAttribute(pos, ic);
      const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      if (face.lengthSq() < 1e-14) continue;
      n.fromBufferAttribute(nrm, ia);
      expect(face.normalize().dot(n)).toBeGreaterThan(0.2);
    }
  });

  it('maps textures in real-world units: 2 m of top = 2/3.2 of the texture, never stretched', () => {
    const g = createSlabGeometry({ L: 2000, T: 30, W: 900, profile: edgeProfile('eased', 30), uOffset: 0, vOffset: 0 });
    const uv = g.getAttribute('uv');
    let minU = Infinity, maxU = -Infinity;
    // first 4 vertices = top cap
    for (let i = 0; i < 4; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
    }
    expect(maxU - minU).toBeCloseTo((2000 - 3) / LONG_GRAIN_TILE.uMm, 3);
  });

  it('tapered legs are narrower at the floor and keep the outer corner flush', () => {
    const leg = buildModel(defaultConfig('dining-table')).parts.find((p) => p.shape === 'tapered')!;
    const { geometry, rotation } = partGeometry(leg);
    const mesh = new THREE.Mesh(geometry);
    mesh.rotation.set(...rotation);
    mesh.updateMatrixWorld();
    const pos = geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let bottomW = 0, topW = 0;
    const xs: { y: number; x: number }[] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      xs.push({ y: v.y, x: v.x });
    }
    const minY = Math.min(...xs.map((p) => p.y));
    const maxY = Math.max(...xs.map((p) => p.y));
    const atBottom = xs.filter((p) => Math.abs(p.y - minY) < 1e-4).map((p) => p.x);
    const atTop = xs.filter((p) => Math.abs(p.y - maxY) < 1e-4).map((p) => p.x);
    bottomW = Math.max(...atBottom) - Math.min(...atBottom);
    topW = Math.max(...atTop) - Math.min(...atTop);
    expect(bottomW).toBeLessThan(topW * 0.7);
    // leg-1 sits at -x: its outer (-x) face stays flush
    expect(Math.abs(Math.min(...atBottom) - Math.min(...atTop))).toBeLessThan(0.002);
  });
});

import { describe, expect, it } from 'vitest';
import { beamDeflectionMm, rectI, shelfSag, topSag, validate, hasErrors, SAG_BLOCK, SAG_WARN } from '../../src/lib/validation.ts';
import { defaultConfig, normalizeConfig } from '../../src/lib/config.ts';
import { buildModel } from '../../src/lib/model.ts';
import { PRODUCT_IDS } from '../../src/data/products.ts';
import { GALLERY } from '../../src/data/gallery.ts';
import type { Config } from '../../src/lib/types.ts';

const codes = (c: Config) => validate(c).map((i) => `${i.level}:${i.code}`);
const issue = (c: Config, code: string) => validate(c).find((i) => i.code === code);

describe('beam deflection', () => {
  it('matches a hand calculation: 1 m span, 1 kN/m, E = 10 GPa, 100 × 100 mm', () => {
    // δ = 5·q·L⁴/(384·E·I) = 5·1·1000⁴ / (384·10000·8.333e6) = 0.15625 mm
    expect(beamDeflectionMm(1000, 1000, 10, rectI(100, 100))).toBeCloseTo(0.15625, 5);
  });
  it('scales with the 4th power of the span and the 3rd power of the thickness', () => {
    const a = beamDeflectionMm(500, 1000, 12, rectI(300, 20));
    expect(beamDeflectionMm(500, 2000, 12, rectI(300, 20)) / a).toBeCloseTo(16, 6);
    expect(a / beamDeflectionMm(500, 1000, 12, rectI(300, 40))).toBeCloseTo(8, 6);
  });
  it('uses the woodworkers’ limits L/600 (warn) and L/300 (block)', () => {
    expect(SAG_WARN).toBeCloseTo(1 / 600);
    expect(SAG_BLOCK).toBeCloseTo(1 / 300);
  });
});

describe('every default and gallery configuration is buildable', () => {
  it.each(PRODUCT_IDS)('%s default has no errors or warnings', (id) => {
    const levels = validate(defaultConfig(id)).map((i) => i.level);
    expect(levels).not.toContain('error');
    expect(levels).not.toContain('warning');
  });
  it.each(GALLERY.map((g) => [g.id, g.config] as const))('gallery %s has no errors', (_id, c) => {
    expect(hasErrors(validate(c))).toBe(false);
  });
});

describe('structural checks', () => {
  const dining = defaultConfig('dining-table');
  it('blocks a thin top on a long trestle span and suggests a thickness', () => {
    const c: Config = { ...dining, leg: 'trestle', lengthCm: 260, thicknessMm: 20 };
    const i = issue(c, 'top-sag')!;
    expect(i.level).toBe('error');
    expect(i.fix).toMatch(/35 mm/);
    expect(i.fix).toMatch(/apron/);
    expect(issue({ ...c, thicknessMm: 40 }, 'top-sag')).toBeUndefined();
  });
  it('warns (not blocks) for a borderline top', () => {
    expect(issue({ ...dining, lengthCm: 220, thicknessMm: 20 }, 'top-sag')?.level).toBe('warning');
  });
  it('the apron rails stiffen the top over the same span', () => {
    const c: Config = { ...dining, lengthCm: 240, thicknessMm: 30 };
    const withApron = buildModel(c);
    const without = { ...withApron, structure: { ...withApron.structure, apron: null } };
    expect(topSag(c, withApron).deflectionMm).toBeLessThan(topSag(c, without).deflectionMm * 0.7);
  });
  it('stiffer wood sags less (beech < oak < pine)', () => {
    const bc = { ...defaultConfig('bookcase'), lengthCm: 100, thicknessMm: 20 };
    const s = (species: Config['species']) => shelfSag({ ...bc, species }).deflectionMm;
    expect(s('beech')).toBeLessThan(s('oak'));
    expect(s('oak')).toBeLessThan(s('pine'));
  });
  it('blocks long pine shelves and accepts shorter ones', () => {
    const bc = { ...defaultConfig('bookcase'), species: 'pine' as const, thicknessMm: 20 };
    expect(issue({ ...bc, lengthCm: 120 }, 'shelf-sag')?.level).toBe('error');
    expect(issue({ ...bc, lengthCm: 90 }, 'shelf-sag')).toBeUndefined();
  });
  it('blocks shelves closer than 18 cm and says how many fit', () => {
    const i = issue({ ...defaultConfig('bookcase'), shelves: 9 }, 'shelf-gap')!;
    expect(i.level).toBe('error');
    expect(i.fix).toMatch(/at most 7 shelves/);
    expect(issue({ ...defaultConfig('bookcase'), shelves: 7 }, 'shelf-gap')).toBeUndefined();
  });
  it('asks for wall anchoring of tall, shallow bookcases', () => {
    expect(issue({ ...defaultConfig('bookcase'), heightCm: 220, widthCm: 30 }, 'tip-over')).toBeDefined();
    expect(issue({ ...defaultConfig('bookcase'), leg: 'feet', heightCm: 200 }, 'tip-over')?.level).toBe('warning');
  });
});

describe('impossible combinations', () => {
  it('undercut edge needs at least 26 mm', () => {
    expect(codes({ ...defaultConfig('dining-table'), edge: 'undercut', thicknessMm: 20 })).toContain('error:undercut-thin');
    expect(codes({ ...defaultConfig('dining-table'), edge: 'undercut', thicknessMm: 26 })).not.toContain('error:undercut-thin');
  });
  it('trestle base needs a long table', () => {
    expect(codes({ ...defaultConfig('dining-table'), leg: 'trestle', lengthCm: 150 })).toContain('error:trestle-short');
  });
  it('a lower shelf needs clearance', () => {
    expect(codes({ ...defaultConfig('coffee-table'), heightCm: 32, shelves: 1 })).toContain('error:shelf-clearance');
    expect(codes({ ...defaultConfig('coffee-table'), heightCm: 32, shelves: 0 })).not.toContain('error:shelf-clearance');
  });
  it('two drawers need a wide desk; unusual desk heights get a hint', () => {
    expect(codes({ ...defaultConfig('desk'), drawers: 2, lengthCm: 110 })).toContain('error:drawers-space');
    expect(codes({ ...defaultConfig('desk'), heightCm: 68 })).toContain('info:desk-height');
  });
  it('width larger than length is an error (grain runs along the long side)', () => {
    expect(codes({ ...defaultConfig('coffee-table'), lengthCm: 60, widthCm: 80 })).toContain('error:width-over-length');
  });
  it('raw finish on a table gets a care hint', () => {
    expect(codes({ ...defaultConfig('dining-table'), finish: 'raw' })).toContain('info:raw-finish');
  });
  it('flags out-of-range values that bypassed normalization (server safety)', () => {
    const c = { ...defaultConfig('dining-table'), lengthCm: 999 };
    expect(validate(c)[0]?.code).toBe('range');
    expect(validate({ ...defaultConfig('dining-table'), thicknessMm: 33 })[0]?.code).toBe('thickness-option');
  });
});

describe('normalization', () => {
  it('clamps and snaps numbers, replaces unknown options and reports it', () => {
    const r = normalizeConfig({ product: 'bookcase', lengthCm: 500, thicknessMm: 29, leg: 'trestle' as never, species: 'gold' as never });
    expect(r.config.lengthCm).toBe(240);
    expect(r.config.thicknessMm).toBe(30);
    expect(r.config.leg).toBe('plinth');
    expect(r.config.species).toBe('oak');
    expect(r.corrections.length).toBe(4);
  });
  it('shelves and drawers are zero for products without them', () => {
    const r = normalizeConfig({ product: 'dining-table', shelves: 4, drawers: 2 });
    expect(r.config.shelves).toBe(0);
    expect(r.config.drawers).toBe(0);
  });
});

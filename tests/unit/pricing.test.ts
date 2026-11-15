import { describe, expect, it } from 'vitest';
import { calculatePrice, formatEuro, fromPrice, maxPrice, HOURLY_RATE, VAT_RATE } from '../../src/lib/pricing.ts';
import { defaultConfig } from '../../src/lib/config.ts';
import { PRODUCT_IDS } from '../../src/data/products.ts';
import { randomConfig } from './helpers.ts';
import { rng } from '../../src/lib/wood/noise.ts';
import type { Config } from '../../src/lib/types.ts';

const dining = defaultConfig('dining-table');

describe('price calculation', () => {
  it('matches the reference price of the standard dining table (regression)', () => {
    const p = calculatePrice(dining);
    expect(p.total).toBe(232939);
    expect(p.lines.map((l) => l.net)).toEqual([25342, 152100, 12405, 5900]);
  });

  it('adds 19 % VAT on the net sum and only works with whole cents', () => {
    for (const id of PRODUCT_IDS) {
      const p = calculatePrice(defaultConfig(id));
      expect(p.net).toBe(p.lines.reduce((s, l) => s + l.net, 0));
      expect(p.vat).toBe(Math.round(p.net * VAT_RATE));
      expect(p.total).toBe(p.net + p.vat);
      for (const v of [p.net, p.vat, p.total, ...p.lines.map((l) => l.net)]) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('bills workshop time in quarter hours at the hourly rate', () => {
    const p = calculatePrice(dining);
    const labor = p.lines.find((l) => l.key === 'labor')!;
    expect(labor.net % ((HOURLY_RATE * 100) / 4)).toBe(0);
  });

  it('gets more expensive with size, in a pricier wood and with more work', () => {
    const base = calculatePrice(dining).total;
    expect(calculatePrice({ ...dining, lengthCm: 260 }).total).toBeGreaterThan(base);
    expect(calculatePrice({ ...dining, thicknessMm: 40 }).total).toBeGreaterThan(base);
    expect(calculatePrice({ ...dining, edge: 'undercut' }).total).toBeGreaterThan(base);
    const material = (species: Config['species']) => calculatePrice({ ...dining, species }).lines[0]!.net;
    expect(material('walnut')).toBeGreaterThan(material('oak'));
    expect(material('oak')).toBeGreaterThan(material('ash'));
    expect(material('ash')).toBeGreaterThan(material('beech'));
    expect(material('beech')).toBeGreaterThan(material('pine'));
  });

  it('prices the finishes: raw is free, lacquer costs more than oil', () => {
    const fin = (finish: Config['finish']) => calculatePrice({ ...dining, finish }).lines.find((l) => l.key === 'finish')!.net;
    expect(fin('raw')).toBe(0);
    expect(fin('lacquered')).toBeGreaterThan(fin('oiled'));
  });

  it('charges delivery flat rates and the two-person surcharge only when needed', () => {
    const del = (c: Config) => calculatePrice(c).lines.find((l) => l.key === 'delivery')!.net;
    expect(del({ ...dining, delivery: 'pickup' })).toBe(0);
    expect(del({ ...dining, delivery: 'berlin' })).toBe(5900);
    expect(del({ ...dining, delivery: 'germany' })).toBe(17900);
    // 240 cm long → two people
    expect(del({ ...dining, lengthCm: 240, delivery: 'berlin' })).toBe(5900 + 7000);
    expect(calculatePrice({ ...dining, lengthCm: 240 }).twoPerson).toBe(true);
    // heavy bookcase (> 60 kg), but pickup → no surcharge
    const bc = defaultConfig('bookcase');
    expect(calculatePrice(bc).weightKg).toBeGreaterThan(60);
    expect(del({ ...bc, delivery: 'pickup' })).toBe(0);
  });

  it('never shows a "from" price higher than any buildable configuration (1,000 random configs)', () => {
    const r = rng(42);
    for (const id of PRODUCT_IDS) {
      const low = fromPrice(id);
      const high = maxPrice(id);
      expect(low).toBeGreaterThan(0);
      expect(high).toBeGreaterThan(low);
      for (let i = 0; i < 200; i++) {
        const c = randomConfig(id, r);
        const t = calculatePrice(c).productTotal;
        expect(t).toBeGreaterThanOrEqual(low);
        expect(t).toBeLessThanOrEqual(high);
      }
    }
  });

  it('formats euros the US way', () => {
    expect(formatEuro(232939)).toBe('€2,329');
    expect(formatEuro(232939, true)).toBe('€2,329.39');
    expect(formatEuro(5900, true)).toBe('€59.00');
  });
});

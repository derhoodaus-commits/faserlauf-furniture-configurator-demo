import { normalizeConfig } from '../../src/lib/config.ts';
import { PRODUCTS } from '../../src/data/products.ts';
import { SPECIES_IDS } from '../../src/data/species.ts';
import type { Config } from '../../src/lib/types.ts';

/** Random but valid (normalized) configuration of a product, from a seeded random source. */
export function randomConfig(product: Config['product'], r: () => number): Config {
  const p = PRODUCTS[product];
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const inRange = (s: { min: number; max: number }) => Math.round(s.min + r() * (s.max - s.min));
  return normalizeConfig({
    product,
    lengthCm: inRange(p.length),
    widthCm: inRange(p.width),
    heightCm: inRange(p.height),
    thicknessMm: pick(p.thicknesses),
    leg: pick(p.legs),
    edge: pick(p.edges),
    shelves: p.shelves ? Math.round(p.shelves.min + r() * (p.shelves.max - p.shelves.min)) : 0,
    drawers: p.drawers ? Math.round(r() * p.drawers.max) : 0,
    species: pick(SPECIES_IDS),
    finish: pick(['oiled', 'lacquered', 'raw'] as const),
    delivery: pick(['pickup', 'berlin', 'germany'] as const),
  }).config;
}

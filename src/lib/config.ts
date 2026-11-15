import { PRODUCTS, PRODUCT_IDS, DELIVERY } from '../data/products.ts';
import { SPECIES } from '../data/species.ts';
import { FINISHES } from '../data/finishes.ts';
import { WALLS, FLOORS } from '../data/room.ts';
import type { Config, DeliveryId, ProductId, RangeSpec, ViewState } from './types.ts';

export const DEFAULT_PRODUCT: ProductId = 'dining-table';

export function isProductId(v: unknown): v is ProductId {
  return typeof v === 'string' && (PRODUCT_IDS as string[]).includes(v);
}

/** The default (and always buildable) configuration of a product. */
export function defaultConfig(product: ProductId = DEFAULT_PRODUCT): Config {
  const p = PRODUCTS[product];
  return {
    product,
    lengthCm: p.length.default,
    widthCm: p.width.default,
    heightCm: p.height.default,
    thicknessMm: p.defaultThickness,
    leg: p.defaultLeg,
    edge: p.defaultEdge,
    shelves: p.shelves?.default ?? 0,
    drawers: p.drawers?.default ?? 0,
    species: p.defaultSpecies,
    finish: p.defaultFinish,
    delivery: 'berlin',
  };
}

export const DEFAULT_VIEW: ViewState = { room: false, wall: 'chalk', floor: 'oak-planks', person: false, dims: true };

/** Snaps a number into a range and onto its step grid. Non-finite input yields the default. */
export function snapToRange(value: number, r: RangeSpec): number {
  if (!Number.isFinite(value)) return r.default;
  const clamped = Math.min(r.max, Math.max(r.min, value));
  const snapped = r.min + Math.round((clamped - r.min) / r.step) * r.step;
  return Math.round(Math.min(r.max, snapped) * 1000) / 1000;
}

/** Nearest available thickness. */
export function snapThickness(value: number, options: number[], fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  let best = options[0] ?? fallback;
  for (const o of options) if (Math.abs(o - value) < Math.abs(best - value)) best = o;
  return best;
}

export interface NormalizeResult {
  config: Config;
  /** Human-readable notes about values that had to be corrected. */
  corrections: string[];
}

/**
 * Makes any (possibly partial or tampered) input a valid configuration of its product:
 * enums must be allowed for the product, numbers are clamped and snapped.
 * Combinations that are valid per field but structurally questionable are NOT changed here;
 * that is the job of validate().
 */
export function normalizeConfig(input: Partial<Config> & { product?: unknown }): NormalizeResult {
  const corrections: string[] = [];
  const product: ProductId = isProductId(input.product) ? input.product : DEFAULT_PRODUCT;
  if (input.product !== undefined && input.product !== product) corrections.push('Unknown furniture type, showing the dining table instead.');
  const p = PRODUCTS[product];
  const d = defaultConfig(product);

  const num = (key: 'lengthCm' | 'widthCm' | 'heightCm', spec: RangeSpec, label: string): number => {
    const raw = input[key];
    if (raw === undefined) return d[key];
    const v = snapToRange(Number(raw), spec);
    if (v !== Number(raw)) corrections.push(`${label} adjusted to ${v} cm (allowed ${spec.min}–${spec.max} cm).`);
    return v;
  };

  const lengthCm = num('lengthCm', p.length, p.labels.length);
  const widthCm = num('widthCm', p.width, p.labels.width);
  const heightCm = num('heightCm', p.height, p.labels.height);

  let thicknessMm = d.thicknessMm;
  if (input.thicknessMm !== undefined) {
    thicknessMm = snapThickness(Number(input.thicknessMm), p.thicknesses, p.defaultThickness);
    if (thicknessMm !== Number(input.thicknessMm)) corrections.push(`${p.labels.thickness} adjusted to ${thicknessMm} mm.`);
  }

  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T => {
    if (value === undefined) return fallback;
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
    corrections.push(`${label} not available for the ${p.kind.toLowerCase()}, using the default.`);
    return fallback;
  };

  const leg = pick(input.leg, p.legs, d.leg, 'Base');
  const edge = pick(input.edge, p.edges, d.edge, 'Edge profile');
  const species = pick(input.species, p.species, d.species, 'Wood');
  const finish = pick(input.finish, Object.keys(FINISHES) as (keyof typeof FINISHES)[], d.finish, 'Finish');
  const delivery = pick(input.delivery, Object.keys(DELIVERY) as DeliveryId[], d.delivery, 'Delivery');

  const intIn = (value: unknown, min: number, max: number, fallback: number, label: string): number => {
    if (value === undefined) return fallback;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    const c = Math.min(max, Math.max(min, n));
    if (c !== Number(value)) corrections.push(`${label} adjusted to ${c}.`);
    return c;
  };
  const shelves = p.shelves ? intIn(input.shelves, p.shelves.min, p.shelves.max, d.shelves, p.shelves.label) : 0;
  const drawers = p.drawers ? intIn(input.drawers, p.drawers.min, p.drawers.max, d.drawers, 'Drawers') : 0;

  // Guard against species objects missing (should never happen, keeps TS strict happy)
  if (!SPECIES[species]) throw new Error(`Unknown species ${species}`);

  return {
    config: { product, lengthCm, widthCm, heightCm, thicknessMm, leg, edge, shelves, drawers, species, finish, delivery },
    corrections,
  };
}

export function normalizeView(input: Partial<Record<keyof ViewState, unknown>>): ViewState {
  const bool = (v: unknown, fb: boolean) => (v === undefined ? fb : v === true || v === '1' || v === 'true');
  return {
    room: bool(input.room, DEFAULT_VIEW.room),
    wall: typeof input.wall === 'string' && input.wall in WALLS ? (input.wall as ViewState['wall']) : DEFAULT_VIEW.wall,
    floor: typeof input.floor === 'string' && input.floor in FLOORS ? (input.floor as ViewState['floor']) : DEFAULT_VIEW.floor,
    person: bool(input.person, DEFAULT_VIEW.person),
    dims: bool(input.dims, DEFAULT_VIEW.dims),
  };
}

/** When switching furniture type, keep the material choices but use the new product's proportions. */
export function switchProduct(current: Config, product: ProductId): Config {
  const next = defaultConfig(product);
  const p = PRODUCTS[product];
  return {
    ...next,
    species: p.species.includes(current.species) ? current.species : next.species,
    finish: current.finish,
    delivery: current.delivery,
  };
}

export function configsEqual(a: Config, b: Config): boolean {
  return (Object.keys(a) as (keyof Config)[]).every((k) => a[k] === b[k]);
}

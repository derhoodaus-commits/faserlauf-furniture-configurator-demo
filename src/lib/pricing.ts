// Price calculation (demo prices). Pure, deterministic, all amounts in whole euro cents.
// See docs/RESEARCH.md §7 for the model.

import { DELIVERY, EDGE_PROFILES, LEG_STYLES, PRODUCTS, TWO_PERSON_KG, TWO_PERSON_LENGTH_CM, TWO_PERSON_SURCHARGE } from '../data/products.ts';
import { SPECIES } from '../data/species.ts';
import { FINISHES } from '../data/finishes.ts';
import { buildModel, partsSurfaceM2, partsVolumeM3, type Model } from './model.ts';
import { weightKg } from './validation.ts';
import type { Config } from './types.ts';

export const VAT_RATE = 0.19;
/** Workshop rate, EUR net per hour (demo). */
export const HOURLY_RATE = 78;
/** Lumber needed per m³ of finished parts (offcuts, defects, planing allowance). */
export const YIELD_FACTOR = 1.45;
export const HOURS = {
  perPart: 0.35,
  perM2: 0.6,
  perDrawer: 3.5,
};

export interface PriceLine {
  key: 'material' | 'labor' | 'finish' | 'delivery';
  label: string;
  detail: string;
  /** Net amount in cents. */
  net: number;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  /** Sum of all lines, cents. */
  net: number;
  vat: number;
  /** Gross total incl. VAT, cents. */
  total: number;
  /** Production (without delivery) gross, cents. */
  productTotal: number;
  hours: number;
  volumeM3: number;
  surfaceM2: number;
  weightKg: number;
  twoPerson: boolean;
}

const cents = (eur: number) => Math.round(eur * 100);

export function laborHours(c: Config, model: Model): number {
  const p = PRODUCTS[c.product];
  const visible = model.parts.filter((x) => !x.hidden);
  let h = p.baseHours;
  h += model.parts.length * HOURS.perPart;
  h += partsSurfaceM2(visible) * HOURS.perM2;
  h += LEG_STYLES[c.leg].extraHours;
  h += EDGE_PROFILES[c.edge].extraHours;
  h += c.drawers * HOURS.perDrawer;
  return h * SPECIES[c.species].labor;
}

export function calculatePrice(c: Config): PriceBreakdown {
  const model = buildModel(c);
  const sp = SPECIES[c.species];
  const fin = FINISHES[c.finish];
  const volume = partsVolumeM3(model.parts);
  const visible = model.parts.filter((x) => !x.hidden);
  const surface = partsSurfaceM2(visible);
  const hours = laborHours(c, model);
  const kg = weightKg(c, model);

  const material = cents(volume * YIELD_FACTOR * sp.pricePerM3);
  const labor = cents(Math.round(hours * 4) / 4 * HOURLY_RATE); // billed in quarter hours
  const finish = cents(surface * fin.pricePerM2);
  const twoPerson = c.delivery !== 'pickup' && (kg > TWO_PERSON_KG || c.lengthCm > TWO_PERSON_LENGTH_CM);
  const delivery = cents(DELIVERY[c.delivery].priceNet + (twoPerson ? TWO_PERSON_SURCHARGE : 0));

  const lines: PriceLine[] = [
    { key: 'material', label: `${sp.name} lumber`, detail: `${(volume * YIELD_FACTOR).toFixed(3)} m³ incl. offcuts × €${sp.pricePerM3.toLocaleString('en-US')}/m³`, net: material },
    { key: 'labor', label: 'Workshop time', detail: `${(Math.round(hours * 4) / 4).toFixed(2)} h × €${HOURLY_RATE}/h`, net: labor },
    {
      key: 'finish',
      label: fin.short === 'Raw' ? 'Finish: raw (sanded)' : `Finish: ${fin.name.toLowerCase()}`,
      detail: `${surface.toFixed(2)} m² × €${fin.pricePerM2}/m²`,
      net: finish,
    },
    {
      key: 'delivery',
      label: `Delivery: ${DELIVERY[c.delivery].name}`,
      detail: twoPerson ? `flat rate + €${TWO_PERSON_SURCHARGE} two-person carry` : c.delivery === 'pickup' ? 'collect in Berlin-Neukölln' : 'flat rate',
      net: delivery,
    },
  ];
  const net = material + labor + finish + delivery;
  const vat = Math.round(net * VAT_RATE);
  const productNet = material + labor + finish;
  return {
    lines,
    net,
    vat,
    total: net + vat,
    productTotal: productNet + Math.round(productNet * VAT_RATE),
    hours,
    volumeM3: volume,
    surfaceM2: surface,
    weightKg: kg,
    twoPerson,
  };
}

/**
 * The "from" price shown on product pages: smallest size, cheapest wood, oiled, cheapest base and edge,
 * no extras, without delivery, incl. VAT. Computed with the same function as the configurator.
 */
export function fromPrice(productId: Config['product']): number {
  const p = PRODUCTS[productId];
  const candidates: Config[] = [];
  for (const species of p.species) {
    for (const leg of p.legs) {
      candidates.push({
        product: productId,
        lengthCm: p.length.min,
        widthCm: p.width.min,
        heightCm: p.height.min,
        thicknessMm: p.thicknesses[0]!,
        leg,
        edge: 'eased',
        shelves: p.shelves?.min ?? 0,
        drawers: p.drawers?.min ?? 0,
        species,
        finish: 'oiled',
        delivery: 'pickup',
      });
    }
  }
  return Math.min(...candidates.map((c) => calculatePrice(c).productTotal));
}

/** Highest price for the product (largest, walnut, lacquered, most complex) – used for structured data. */
export function maxPrice(productId: Config['product']): number {
  const p = PRODUCTS[productId];
  let best = 0;
  for (const leg of p.legs) {
    for (const edge of p.edges) {
      const c: Config = {
        product: productId,
        lengthCm: p.length.max,
        widthCm: p.width.max,
        heightCm: p.height.max,
        thicknessMm: p.thicknesses[p.thicknesses.length - 1]!,
        leg,
        edge,
        shelves: p.shelves?.max ?? 0,
        drawers: p.drawers?.max ?? 0,
        species: 'walnut',
        finish: 'lacquered',
        delivery: 'pickup',
      };
      best = Math.max(best, calculatePrice(c).productTotal);
    }
  }
  return best;
}

/** Formats cents as "€2,345" (or "€2,345.50" with decimals). */
export function formatEuro(centsValue: number, decimals = false): string {
  const v = centsValue / 100;
  return '€' + v.toLocaleString('en-US', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 });
}

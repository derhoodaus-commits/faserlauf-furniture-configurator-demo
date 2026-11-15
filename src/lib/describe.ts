import { DELIVERY, EDGE_PROFILES, LEG_STYLES, PRODUCTS } from '../data/products.ts';
import { SPECIES } from '../data/species.ts';
import { FINISHES } from '../data/finishes.ts';
import type { Config } from './types.ts';

/** One sentence for screen readers, inquiry emails and image alt texts. */
export function describeConfig(c: Config): string {
  const p = PRODUCTS[c.product];
  const parts = [
    `${p.name}, ${c.lengthCm} × ${c.widthCm} × ${c.heightCm} cm`,
    `${c.thicknessMm} mm ${SPECIES[c.species].name.toLowerCase()}, ${FINISHES[c.finish].short.toLowerCase()}`,
    LEG_STYLES[c.leg].name.toLowerCase(),
    `${EDGE_PROFILES[c.edge].name.toLowerCase()} edge`,
  ];
  if (p.shelves) parts.push(p.shelves.max === 1 ? (c.shelves ? 'with lower shelf' : 'without lower shelf') : `${c.shelves} shelves`);
  if (p.drawers) parts.push(c.drawers === 0 ? 'no drawers' : c.drawers === 1 ? '1 drawer' : `${c.drawers} drawers`);
  return parts.join(', ') + '.';
}

/** Specification rows (label, value) for the summary, PDF and server. */
export function specRows(c: Config): [string, string][] {
  const p = PRODUCTS[c.product];
  const rows: [string, string][] = [
    ['Piece', p.name],
    [`${p.labels.length} × ${p.labels.width.toLowerCase()} × ${p.labels.height.toLowerCase()}`, `${c.lengthCm} × ${c.widthCm} × ${c.heightCm} cm`],
    [p.labels.thickness, `${c.thicknessMm} mm`],
    ['Wood', `${SPECIES[c.species].name} (${SPECIES[c.species].latin})`],
    ['Finish', FINISHES[c.finish].name],
    ['Base', LEG_STYLES[c.leg].name],
    ['Edge', EDGE_PROFILES[c.edge].name],
  ];
  if (p.shelves) rows.push([p.shelves.label, p.shelves.max === 1 ? (c.shelves ? 'Yes' : 'No') : String(c.shelves)]);
  if (p.drawers) rows.push(['Drawers', String(c.drawers)]);
  rows.push(['Delivery', DELIVERY[c.delivery].name]);
  return rows;
}

export function fileSlug(c: Config): string {
  return `faserlauf-${c.product}-${c.species}-${c.lengthCm}x${c.widthCm}x${c.heightCm}`;
}

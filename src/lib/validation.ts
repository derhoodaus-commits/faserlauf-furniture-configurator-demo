// Structural and practical checks of a configuration. Pure functions, unit-tested.
// See docs/RESEARCH.md §6 for the reasoning behind the loads and limits.

import { PRODUCTS } from '../data/products.ts';
import { SPECIES } from '../data/species.ts';
import { buildModel, partsVolumeM3, type Model } from './model.ts';
import type { Config, Issue } from './types.ts';

const G = 9.81;
/** Service loads. */
export const LOADS = {
  /** Books on shelves, kg per m² of shelf area. */
  shelfKgM2: 115,
  /** Table tops, kg per m² (well-laid table + leaning). */
  tableKgM2: 75,
  /** Bench seat, kg per meter (people side by side). */
  benchKgM: 160,
};
/** Sag limits as a fraction of the span: warn above L/600 (visible over time), block above L/300. */
export const SAG_WARN = 1 / 600;
export const SAG_BLOCK = 1 / 300;

/**
 * Mid-span deflection (mm) of a simply supported beam under a uniform line load.
 * δ = 5·q·L⁴ / (384·E·I)
 * @param qNPerM line load in N/m
 * @param spanMm span in mm
 * @param eGPa modulus of elasticity in GPa
 * @param iMm4 second moment of area in mm⁴
 */
export function beamDeflectionMm(qNPerM: number, spanMm: number, eGPa: number, iMm4: number): number {
  const q = qNPerM / 1000; // N/mm
  const E = eGPa * 1000; // N/mm²
  return (5 * q * spanMm ** 4) / (384 * E * iMm4);
}

/** I = b·h³/12 for a rectangle (mm⁴). */
export const rectI = (bMm: number, hMm: number) => (bMm * hMm ** 3) / 12;

export interface SagResult {
  deflectionMm: number;
  spanMm: number;
  /** Deflection as fraction of the span. */
  ratio: number;
}

/** Sag of the top/seat between its supports under the service load. */
export function topSag(c: Config, model: Model = buildModel(c)): SagResult {
  const sp = SPECIES[c.species];
  const span = model.structure.topSpanMm;
  const depth = c.widthCm * 10;
  const t = c.thicknessMm;
  let q: number;
  if (c.product === 'bench') q = LOADS.benchKgM * G;
  else q = LOADS.tableKgM2 * G * (depth / 1000);
  // Self weight of the top
  q += sp.densityKgM3 * (depth / 1000) * (t / 1000) * G;
  let I = rectI(depth, t);
  // Long rails under the top carry part of the load (no composite action assumed: conservative)
  const ap = model.structure.apron;
  if (ap) I += ap.count * rectI(ap.thickness, ap.height);
  const deflectionMm = beamDeflectionMm(q, span, sp.stiffnessGPa, I);
  return { deflectionMm, spanMm: span, ratio: deflectionMm / span };
}

/** Sag of one bookcase shelf (or the lower shelf of a coffee table/bench) under books. */
export function shelfSag(c: Config, model: Model = buildModel(c)): SagResult {
  const sp = SPECIES[c.species];
  const isBookcase = c.product === 'bookcase';
  const span = isBookcase ? model.structure.shelfSpanMm : model.structure.lowerShelfSpanMm;
  const depth = isBookcase ? model.structure.shelfDepthMm : c.widthCm * 10 - 100;
  const t = isBookcase ? c.thicknessMm : 20;
  const q = LOADS.shelfKgM2 * G * (depth / 1000) + sp.densityKgM3 * (depth / 1000) * (t / 1000) * G;
  const deflectionMm = beamDeflectionMm(q, span, sp.stiffnessGPa, rectI(depth, t));
  return { deflectionMm, spanMm: span, ratio: span > 0 ? deflectionMm / span : 0 };
}

/** Minimum thickness (from the product's options) that keeps a span within the warning limit, or null. */
function suggestThickness(c: Config, check: (cfg: Config) => SagResult): number | null {
  const options = PRODUCTS[c.product].thicknesses.filter((t) => t > c.thicknessMm);
  for (const t of options) {
    const cfg = { ...c, thicknessMm: t };
    if (check(cfg).ratio <= SAG_WARN) return t;
  }
  return null;
}

const fmtMm = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());

export function weightKg(c: Config, model: Model = buildModel(c)): number {
  return partsVolumeM3(model.parts) * SPECIES[c.species].densityKgM3;
}

export function validate(c: Config): Issue[] {
  const issues: Issue[] = [];
  const p = PRODUCTS[c.product];
  const model = buildModel(c);
  const sp = SPECIES[c.species];

  // ---- Ranges (normally guaranteed by normalizeConfig; checked again for server-side safety)
  const ranges: [keyof Config, number, number, number, string][] = [
    ['lengthCm', c.lengthCm, p.length.min, p.length.max, p.labels.length],
    ['widthCm', c.widthCm, p.width.min, p.width.max, p.labels.width],
    ['heightCm', c.heightCm, p.height.min, p.height.max, p.labels.height],
  ];
  for (const [field, v, min, max, label] of ranges) {
    if (!(v >= min && v <= max)) {
      issues.push({ level: 'error', code: 'range', field, message: `${label} must be between ${min} and ${max} cm.` });
    }
  }
  if (!p.thicknesses.includes(c.thicknessMm)) {
    issues.push({ level: 'error', code: 'thickness-option', field: 'thicknessMm', message: `${p.labels.thickness} must be one of ${p.thicknesses.join(', ')} mm.` });
  }
  if (!p.legs.includes(c.leg)) issues.push({ level: 'error', code: 'leg-option', field: 'leg', message: 'This base is not available for this piece.' });
  if (!p.edges.includes(c.edge)) issues.push({ level: 'error', code: 'edge-option', field: 'edge', message: 'This edge profile is not available for this piece.' });
  if (issues.length) return issues;

  // ---- Proportions
  if (c.product !== 'bookcase' && c.widthCm > c.lengthCm) {
    issues.push({
      level: 'error',
      code: 'width-over-length',
      field: 'widthCm',
      message: `${p.labels.width} (${c.widthCm} cm) is larger than ${p.labels.length.toLowerCase()} (${c.lengthCm} cm).`,
      fix: 'Swap the two values; the grain always runs along the longer side.',
    });
  }
  if (c.edge === 'undercut' && c.thicknessMm < 26) {
    issues.push({
      level: 'error',
      code: 'undercut-thin',
      field: 'edge',
      message: `The undercut bevel needs a top of at least 26 mm; at ${c.thicknessMm} mm the edge would be paper-thin and splinter.`,
      fix: 'Choose 26 mm or more, or a different edge profile.',
    });
  }
  if (c.leg === 'trestle' && c.lengthCm < 160) {
    issues.push({
      level: 'error',
      code: 'trestle-short',
      field: 'leg',
      message: 'A trestle base needs a table of at least 160 cm; on shorter tables the trestles are in the way of your knees.',
      fix: 'Make the table at least 160 cm long or choose legs.',
    });
  }

  // ---- Sag of the top / seat
  const sag = topSag(c, model);
  const what = c.product === 'bench' ? 'seat' : 'top';
  if (c.product !== 'bookcase') {
    const span = Math.round(sag.spanMm / 10);
    const sugg = suggestThickness(c, (cfg) => topSag(cfg));
    const fixParts: string[] = [];
    if (sugg) fixParts.push(`choose at least ${sugg} mm`);
    if (c.leg === 'trestle') fixParts.push('switch to legs with an apron');
    else if (c.leg === 'panel') fixParts.push('choose legs with an apron frame');
    if (fixParts.length === 0) fixParts.push('make it shorter or pick a stiffer wood (beech)');
    const fix = fixParts.join(', or ').replace(/^./, (m) => m.toUpperCase()) + '.';
    if (sag.ratio > SAG_BLOCK) {
      issues.push({
        level: 'error',
        code: 'top-sag',
        field: 'thicknessMm',
        message: `A ${c.thicknessMm} mm ${sp.name.toLowerCase()} ${what} cannot span ${span} cm between the supports: it would sag about ${fmtMm(sag.deflectionMm)} mm under load.`,
        fix,
      });
    } else if (sag.ratio > SAG_WARN) {
      issues.push({
        level: 'warning',
        code: 'top-sag',
        field: 'thicknessMm',
        message: `The ${what} would sag about ${fmtMm(sag.deflectionMm)} mm over ${span} cm under load. Buildable, but it may show a slight dip over the years.`,
        fix,
      });
    }
  }

  // ---- Shelves
  if (c.product === 'bookcase') {
    const s = shelfSag(c, model);
    const span = Math.round(s.spanMm / 10);
    const sugg = suggestThickness(c, (cfg) => shelfSag(cfg));
    const fix = sugg
      ? `Choose ${sugg} mm boards, a stiffer wood, or a narrower bookcase (two bays).`
      : 'Make the bookcase narrower or split it into two bays.';
    if (s.ratio > SAG_BLOCK) {
      issues.push({
        level: 'error',
        code: 'shelf-sag',
        field: 'thicknessMm',
        message: `${c.thicknessMm} mm ${sp.name.toLowerCase()} shelves spanning ${span} cm would sag about ${fmtMm(s.deflectionMm)} mm under books.`,
        fix,
      });
    } else if (s.ratio > SAG_WARN) {
      issues.push({
        level: 'warning',
        code: 'shelf-sag',
        field: 'thicknessMm',
        message: `Fully loaded with books, the shelves would sag about ${fmtMm(s.deflectionMm)} mm over ${span} cm: visible over time.`,
        fix,
      });
    }
    const gapCm = model.structure.shelfGapMm / 10;
    if (gapCm < 18) {
      const bottomY = c.leg === 'plinth' ? 80 : 120;
      const clear = c.heightCm * 10 - c.thicknessMm - (bottomY + c.thicknessMm);
      const maxShelves = Math.max(0, Math.floor((clear - 180) / (180 + c.thicknessMm)));
      issues.push({
        level: 'error',
        code: 'shelf-gap',
        field: 'shelves',
        message: `With ${c.shelves} shelves the spacing would be only ${gapCm.toFixed(1)} cm: too tight for books.`,
        fix: `At this height, use at most ${maxShelves} shelves (minimum 18 cm spacing).`,
      });
    } else if (gapCm > 45 && c.shelves < (p.shelves?.max ?? 0)) {
      issues.push({ level: 'info', code: 'shelf-gap-large', field: 'shelves', message: `The shelf spacing is ${Math.round(gapCm)} cm. Most books need 25–35 cm; consider another shelf.` });
    }
    if (c.heightCm > 4.5 * c.widthCm || (c.leg === 'feet' && c.heightCm > 160)) {
      issues.push({
        level: c.leg === 'feet' && c.heightCm > 160 ? 'warning' : 'info',
        code: 'tip-over',
        field: 'heightCm',
        message: `At ${c.heightCm} cm high and ${c.widthCm} cm deep the bookcase must be anchored to the wall.`,
        fix: 'Anchoring hardware is included; please tell us what your wall is made of.',
      });
    }
  }

  if ((c.product === 'coffee-table' || c.product === 'bench') && c.shelves > 0) {
    const minH = c.product === 'coffee-table' ? 35 : 42;
    if (c.heightCm < minH) {
      issues.push({
        level: 'error',
        code: 'shelf-clearance',
        field: 'shelves',
        message: `A lower shelf needs a height of at least ${minH} cm, otherwise there is no usable space between shelf and ${c.product === 'bench' ? 'seat' : 'top'}.`,
        fix: `Raise the height to ${minH} cm or remove the shelf.`,
      });
    }
    const s = shelfSag(c, model);
    if (s.ratio > SAG_WARN) {
      issues.push({ level: 'warning', code: 'lower-shelf-sag', field: 'shelves', message: `The 20 mm lower shelf would sag about ${fmtMm(s.deflectionMm)} mm when loaded with books.`, fix: 'Shorten the piece or choose a stiffer wood.' });
    }
  }

  // ---- Desk
  if (c.product === 'desk') {
    if (c.drawers === 2 && c.lengthCm < 120) {
      issues.push({ level: 'error', code: 'drawers-space', field: 'drawers', message: 'Two drawers need a desk at least 120 cm wide (leg room in between).', fix: 'Choose one drawer or a wider desk.' });
    }
    if (c.heightCm < 70 || c.heightCm > 76) {
      issues.push({ level: 'info', code: 'desk-height', field: 'heightCm', message: `${c.heightCm} cm is outside the usual 70–76 cm. Fine if it matches your chair and body height.` });
    }
  }
  if (c.product === 'bench' && (c.heightCm < 43 || c.heightCm > 47)) {
    issues.push({ level: 'info', code: 'seat-height', field: 'heightCm', message: `Seat height ${c.heightCm} cm: for a 75 cm dining table, 43–47 cm is most comfortable.` });
  }
  if (c.product === 'dining-table' && c.leg !== 'trestle' && c.lengthCm >= 260) {
    issues.push({ level: 'info', code: 'long-apron', field: 'lengthCm', message: 'Tables from 2.60 m are delivered with a detachable base so they fit through stairwells.' });
  }

  // ---- Finish
  if (c.finish === 'raw' && c.product !== 'bookcase') {
    issues.push({ level: 'info', code: 'raw-finish', field: 'finish', message: 'Raw wood stains easily (water rings, oil). For a surface in daily use we recommend oil or lacquer.' });
  }

  // ---- Weight
  const kg = weightKg(c, model);
  if (kg > 120) {
    issues.push({ level: 'info', code: 'heavy', message: `Estimated weight ${Math.round(kg)} kg: delivered in parts and assembled on site.` });
  }
  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');

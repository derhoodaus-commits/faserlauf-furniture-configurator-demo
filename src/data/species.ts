import type { SpeciesId } from '../lib/types.ts';

export type RGB = [number, number, number];

/** Parameters of the procedural wood generator for one species (see src/lib/wood/generator.ts). */
export interface WoodLook {
  /** sRGB colors (0–255). */
  early: RGB;
  late: RGB;
  pore: RGB;
  ray: RGB;
  /** Optional pale sapwood (walnut, pine). */
  sapwood?: RGB;
  /** Average growth ring width in mm. */
  ringMm: number;
  /** Share of the ring that is latewood (0–1). */
  lateShare: number;
  /** How abrupt the earlywood→latewood change is (0 soft … 1 sharp). */
  sharpness: number;
  /** Strength of the ring color difference (0–1). */
  contrast: number;
  /** Ring-porous species have a band of large pores at the start of each ring. */
  ringPorous: boolean;
  /** Pore visibility 0–1. */
  pores: number;
  /** Medullary ray visibility 0–1 (oak flecks, beech dots). */
  rays: number;
  /** Rays lighter (oak silver grain) or darker (beech) than the surrounding wood. */
  rayStyle: 'silver' | 'dark';
  /** Knots per square meter (pine only). */
  knots: number;
  /** Board-to-board tone variation 0–1. */
  toneJitter: number;
  /** Fine fiber streaks 0–1. */
  streaks: number;
  /** Ring wandering (noise warp) 0–1. */
  wander: number;
}

export interface Species {
  id: SpeciesId;
  name: string;
  latin: string;
  /** One-line character for cards. */
  tagline: string;
  description: string;
  /** Typical density at 12 % moisture, kg/m³ (rounded literature averages). */
  densityKgM3: number;
  /** Bending stiffness (modulus of elasticity), GPa (rounded literature averages for clear wood). */
  stiffnessGPa: number;
  /** Relative surface hardness on a 1–5 scale (how well it resists dents). */
  hardness: 1 | 2 | 3 | 4 | 5;
  /** Demo price per m³ of kiln-dried furniture-grade lumber, EUR net. */
  pricePerM3: number;
  /** Workability factor for labor time (1 = average). */
  labor: number;
  /** Price level shown in the UI (1–4). */
  priceLevel: 1 | 2 | 3 | 4;
  color: string;
  care: string;
  bestFor: string;
  notes: string;
  look: WoodLook;
}

export const SPECIES: Record<SpeciesId, Species> = {
  oak: {
    id: 'oak',
    name: 'Oak',
    latin: 'Quercus robur / petraea',
    tagline: 'Hard-wearing, honey-toned, with lively grain',
    description:
      'European oak is the classic for tables that get used every day. It is hard, heavy and stable, and its ring-porous structure gives the bold, open grain people associate with solid wood furniture. Quarter-sawn boards show the silvery "flecks" of the medullary rays.',
    densityKgM3: 690,
    stiffnessGPa: 12,
    hardness: 4,
    pricePerM3: 2300,
    labor: 1.1,
    priceLevel: 3,
    color: 'Light honey to golden brown, darkens slightly with light',
    care: 'Wipe with a damp cloth. Refresh oiled surfaces with hardwax oil once or twice a year; avoid iron objects on wet oak (tannin stains).',
    bestFor: 'Dining tables, desks, benches: anything that sees daily wear',
    notes: 'Contains tannins: steel screws and wet oak leave dark stains, so we use stainless or brass hardware.',
    look: {
      early: [214, 178, 130],
      late: [168, 126, 82],
      pore: [122, 86, 54],
      ray: [232, 204, 160],
      ringMm: 3.2,
      lateShare: 0.55,
      sharpness: 0.45,
      contrast: 0.85,
      ringPorous: true,
      pores: 0.8,
      rays: 0.75,
      rayStyle: 'silver',
      knots: 0,
      toneJitter: 0.35,
      streaks: 0.55,
      wander: 0.55,
    },
  },
  beech: {
    id: 'beech',
    name: 'Beech',
    latin: 'Fagus sylvatica',
    tagline: 'Calm, even and the stiffest of our woods',
    description:
      'Beech is the workhorse of German furniture making: very stiff, hard and fine-textured, with a calm, even surface and tiny dark flecks of rays. Our beech is steamed, which gives it its warm, slightly pink tone.',
    densityKgM3: 720,
    stiffnessGPa: 14,
    hardness: 4,
    pricePerM3: 1450,
    labor: 1.08,
    priceLevel: 2,
    color: 'Pale pinkish brown (steamed), very uniform',
    care: 'Beech reacts to humidity more than other woods; keep it away from radiators. Oil or lacquer recommended.',
    bestFor: 'Shelves with long spans, desks, benches',
    notes: 'Moves more with changing humidity than oak, so tops are glued from narrow boards.',
    look: {
      early: [221, 176, 138],
      late: [202, 152, 112],
      pore: [180, 136, 100],
      ray: [176, 122, 86],
      ringMm: 3.6,
      lateShare: 0.4,
      sharpness: 0.2,
      contrast: 0.45,
      ringPorous: false,
      pores: 0.15,
      rays: 0.65,
      rayStyle: 'dark',
      knots: 0,
      toneJitter: 0.2,
      streaks: 0.35,
      wander: 0.4,
    },
  },
  walnut: {
    id: 'walnut',
    name: 'Walnut',
    latin: 'Juglans nigra',
    tagline: 'Dark, rich and the most expressive figure',
    description:
      'American black walnut is the darkest of our woods: chocolate brown with grey-violet hints and an expressive, wavy figure. It is a little softer than oak but very stable and a pleasure to work, which is why it is our choice for statement pieces.',
    densityKgM3: 620,
    stiffnessGPa: 11.5,
    hardness: 3,
    pricePerM3: 4200,
    labor: 1.0,
    priceLevel: 4,
    color: 'Chocolate brown, occasional pale sapwood streaks; lightens slightly over the years',
    care: 'Oiled walnut likes a fresh coat of oil once a year. Avoid direct sun near windows to keep the color even.',
    bestFor: 'Dining tables and coffee tables as a centerpiece, desks',
    notes: 'We sort out boards with pale sapwood for tops; small streaks on hidden parts are a natural feature.',
    look: {
      early: [118, 80, 54],
      late: [82, 54, 38],
      pore: [52, 34, 24],
      ray: [104, 72, 52],
      ringMm: 4.2,
      lateShare: 0.5,
      sharpness: 0.3,
      contrast: 0.72,
      ringPorous: false,
      pores: 0.55,
      rays: 0.1,
      rayStyle: 'dark',
      knots: 0,
      toneJitter: 0.4,
      streaks: 0.6,
      wander: 0.8,
    },
  },
  pine: {
    id: 'pine',
    name: 'Pine',
    latin: 'Pinus sylvestris',
    tagline: 'Light, friendly and affordable, with knots',
    description:
      'Scots pine from northern Germany and Scandinavia: light, resinous and fast-growing, with strong contrast between pale earlywood and orange latewood, and the occasional knot. Softer than the hardwoods, so it collects a patina, which many people love.',
    densityKgM3: 520,
    stiffnessGPa: 10,
    hardness: 2,
    pricePerM3: 950,
    labor: 0.9,
    priceLevel: 1,
    color: 'Creamy yellow with orange-brown rings, ambers noticeably within months',
    care: 'Soft surface: use coasters and felt pads. Oiled pine can be sanded and re-oiled locally when dented.',
    bestFor: 'Bookcases, benches, children’s furniture, country style',
    notes: 'Knots are sound and glued where needed; resin can bleed in strong heat during the first year.',
    look: {
      early: [234, 206, 156],
      late: [196, 134, 72],
      pore: [210, 170, 120],
      ray: [226, 196, 150],
      sapwood: [240, 220, 176],
      ringMm: 3.0,
      lateShare: 0.35,
      sharpness: 0.85,
      contrast: 0.85,
      ringPorous: false,
      pores: 0.05,
      rays: 0,
      rayStyle: 'dark',
      knots: 1.3,
      toneJitter: 0.25,
      streaks: 0.4,
      wander: 0.6,
    },
  },
  ash: {
    id: 'ash',
    name: 'Ash',
    latin: 'Fraxinus excelsior',
    tagline: 'Pale and tough, with crisp graphic grain',
    description:
      'European ash is pale, tough and springy, which is why it was used for tool handles and sports gear. Its ring-porous grain is as bold as oak’s but on a much lighter background, giving a crisp, Scandinavian look.',
    densityKgM3: 690,
    stiffnessGPa: 12.5,
    hardness: 4,
    pricePerM3: 1850,
    labor: 1.05,
    priceLevel: 2,
    color: 'Creamy white to light beige with distinct darker ring lines',
    care: 'Light surfaces show stains sooner; lacquer or white-pigmented oil keeps it bright.',
    bestFor: 'Desks, benches, light dining tables',
    notes: 'Ash dieback has made good European ash scarcer; we buy boards from sustainably managed German forests.',
    look: {
      early: [234, 216, 182],
      late: [204, 178, 136],
      pore: [168, 140, 102],
      ray: [236, 220, 190],
      ringMm: 4.0,
      lateShare: 0.6,
      sharpness: 0.5,
      contrast: 0.7,
      ringPorous: true,
      pores: 0.85,
      rays: 0.05,
      rayStyle: 'silver',
      knots: 0,
      toneJitter: 0.25,
      streaks: 0.45,
      wander: 0.45,
    },
  },
};

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

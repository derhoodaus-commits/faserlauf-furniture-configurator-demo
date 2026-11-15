import type { DeliveryId, EdgeProfile, FinishId, LegStyle, ProductId, RangeSpec, SpeciesId } from '../lib/types.ts';

export interface Product {
  id: ProductId;
  /** Model name (named after Berlin rivers and lakes). */
  model: string;
  /** Generic name: "Dining table". */
  kind: string;
  /** Full name: "Spree dining table". */
  name: string;
  tagline: string;
  description: string[];
  details: string[];
  /** Labels of the three dimensions for this product (a bookcase has width/depth, a table length/width). */
  labels: { length: string; width: string; height: string; thickness: string };
  length: RangeSpec;
  width: RangeSpec;
  height: RangeSpec;
  /** Available plate thicknesses in mm (standard planed board thicknesses). */
  thicknesses: number[];
  defaultThickness: number;
  legs: LegStyle[];
  defaultLeg: LegStyle;
  edges: EdgeProfile[];
  defaultEdge: EdgeProfile;
  shelves?: { min: number; max: number; default: number; label: string; hint: string };
  drawers?: { min: number; max: number; default: number };
  species: SpeciesId[];
  defaultSpecies: SpeciesId;
  defaultFinish: FinishId;
  /** Workshop base hours (setup, glue-up of the top, assembly, quality check). */
  baseHours: number;
  /** Typical lead time in weeks (demo). */
  leadWeeks: [number, number];
}

const ALL_SPECIES: SpeciesId[] = ['oak', 'beech', 'walnut', 'pine', 'ash'];

export const PRODUCTS: Record<ProductId, Product> = {
  'dining-table': {
    id: 'dining-table',
    model: 'Spree',
    kind: 'Dining table',
    name: 'Spree dining table',
    tagline: 'The long table for everyday dinners and long evenings',
    description: [
      'A solid wood dining table glued from narrow, matched boards, so the top stays flat for decades. Choose the size to the centimeter, from a compact table for four to a 3-meter table for a whole family celebration.',
      'Three bases: tapered legs with an apron (light and classic), square legs with an apron (calm and sturdy), or a trestle base with a stretcher, which leaves the long sides free of legs.',
    ],
    details: [
      'Top glued from boards 9–13 cm wide, grain running along the length',
      'Mortise-and-tenon joints in the base, top fixed with wooden buttons so it can move',
      'Seats about one person per 60 cm of length on each side',
    ],
    labels: { length: 'Length', width: 'Width', height: 'Height', thickness: 'Top thickness' },
    length: { min: 120, max: 300, step: 1, default: 200, nudge: 5 },
    width: { min: 70, max: 110, step: 1, default: 90, nudge: 5 },
    height: { min: 72, max: 78, step: 1, default: 75, nudge: 1 },
    thicknesses: [20, 26, 30, 35, 40, 50, 60],
    defaultThickness: 30,
    legs: ['tapered', 'square', 'trestle'],
    defaultLeg: 'tapered',
    edges: ['eased', 'rounded', 'chamfer', 'undercut'],
    defaultEdge: 'eased',
    species: ALL_SPECIES,
    defaultSpecies: 'oak',
    defaultFinish: 'oiled',
    baseHours: 10,
    leadWeeks: [6, 8],
  },
  'coffee-table': {
    id: 'coffee-table',
    model: 'Havel',
    kind: 'Coffee table',
    name: 'Havel coffee table',
    tagline: 'Low table with an optional magazine shelf',
    description: [
      'A low table for the living room with a generous top and, if you like, a lower shelf for books and magazines. Small enough to be built quickly, big enough to show off the grain of the wood you choose.',
      'On tapered or square legs, or on two solid side panels for a more architectural look.',
    ],
    details: [
      'Lower shelf sits on rails between the legs (or is housed in the side panels)',
      'Top edges in four profiles, from crisp to softly rounded',
      'Felt pads under the legs included',
    ],
    labels: { length: 'Length', width: 'Width', height: 'Height', thickness: 'Top thickness' },
    length: { min: 60, max: 160, step: 1, default: 110, nudge: 5 },
    width: { min: 40, max: 90, step: 1, default: 60, nudge: 5 },
    height: { min: 30, max: 50, step: 1, default: 40, nudge: 1 },
    thicknesses: [20, 26, 30, 35, 40, 50],
    defaultThickness: 30,
    legs: ['tapered', 'square', 'panel'],
    defaultLeg: 'square',
    edges: ['eased', 'rounded', 'chamfer', 'undercut'],
    defaultEdge: 'rounded',
    shelves: { min: 0, max: 1, default: 1, label: 'Lower shelf', hint: 'A shelf between the legs for books and magazines' },
    species: ALL_SPECIES,
    defaultSpecies: 'walnut',
    defaultFinish: 'oiled',
    baseHours: 7,
    leadWeeks: [5, 7],
  },
  bookcase: {
    id: 'bookcase',
    model: 'Panke',
    kind: 'Bookcase',
    name: 'Panke bookcase',
    tagline: 'Open shelving, sized to your wall and your books',
    description: [
      'An open bookcase with fixed shelves housed in the sides, so it stays rigid without a single metal fitting. Width, height, depth and the number of shelves are yours to choose; the configurator checks that the shelves won’t sag under books.',
      'It stands on a recessed plinth or on four short tapered feet. Tall versions are supplied with a wall anchor.',
    ],
    details: [
      'Shelves housed in 6 mm deep grooves, back made of tongue-and-groove boards',
      'Shelf spacing is distributed evenly; minimum 18 cm between shelves',
      'Wall anchoring hardware included for tall bookcases',
    ],
    labels: { length: 'Width', width: 'Depth', height: 'Height', thickness: 'Board thickness' },
    length: { min: 40, max: 240, step: 1, default: 100, nudge: 5 },
    width: { min: 20, max: 45, step: 1, default: 32, nudge: 1 },
    height: { min: 60, max: 240, step: 1, default: 180, nudge: 5 },
    thicknesses: [20, 26, 30, 35, 40],
    defaultThickness: 26,
    legs: ['plinth', 'feet'],
    defaultLeg: 'plinth',
    edges: ['eased', 'rounded', 'chamfer'],
    defaultEdge: 'eased',
    shelves: { min: 0, max: 9, default: 4, label: 'Shelves', hint: 'Inner shelves, evenly spaced (top and bottom not counted)' },
    species: ALL_SPECIES,
    defaultSpecies: 'oak',
    defaultFinish: 'oiled',
    baseHours: 12,
    leadWeeks: [6, 9],
  },
  bench: {
    id: 'bench',
    model: 'Dahme',
    kind: 'Bench',
    name: 'Dahme bench',
    tagline: 'For the dining table, the hallway or the foot of the bed',
    description: [
      'A solid bench with a thick seat that matches the Spree dining table. Thick enough to feel substantial, and checked for sag with people sitting side by side.',
      'With legs or side panels, and with an optional lower shelf for shoes or baskets in the hallway.',
    ],
    details: [
      'Seat height 43–47 cm matches a 75 cm table',
      'Load check: 160 kg per meter of seat',
      'Optional lower shelf',
    ],
    labels: { length: 'Length', width: 'Depth', height: 'Seat height', thickness: 'Seat thickness' },
    length: { min: 60, max: 240, step: 1, default: 140, nudge: 5 },
    width: { min: 30, max: 45, step: 1, default: 36, nudge: 1 },
    height: { min: 40, max: 50, step: 1, default: 45, nudge: 1 },
    thicknesses: [26, 30, 35, 40, 50, 60],
    defaultThickness: 40,
    legs: ['tapered', 'square', 'panel'],
    defaultLeg: 'tapered',
    edges: ['eased', 'rounded', 'chamfer'],
    defaultEdge: 'rounded',
    shelves: { min: 0, max: 1, default: 0, label: 'Lower shelf', hint: 'Shelf for shoes or baskets' },
    species: ALL_SPECIES,
    defaultSpecies: 'oak',
    defaultFinish: 'oiled',
    baseHours: 6,
    leadWeeks: [4, 6],
  },
  desk: {
    id: 'desk',
    model: 'Wuhle',
    kind: 'Desk',
    name: 'Wuhle desk',
    tagline: 'A calm workplace with up to two drawers',
    description: [
      'A writing desk with a solid top and up to two drawers with dovetailed corners in the apron. Wide enough for a monitor and a notebook, and set to the height that fits you.',
      'With tapered or square legs, or with two side panels and a back rail for a more closed look.',
    ],
    details: [
      'Drawers run on wooden runners, fronts cut from the same board as the apron',
      'Ergonomic desk height: 70–76 cm for most people',
      'Cable notch in the back edge on request',
    ],
    labels: { length: 'Width', width: 'Depth', height: 'Height', thickness: 'Top thickness' },
    length: { min: 100, max: 200, step: 1, default: 140, nudge: 5 },
    width: { min: 55, max: 90, step: 1, default: 70, nudge: 5 },
    height: { min: 68, max: 80, step: 1, default: 74, nudge: 1 },
    thicknesses: [20, 26, 30, 35, 40],
    defaultThickness: 26,
    legs: ['tapered', 'square', 'panel'],
    defaultLeg: 'tapered',
    edges: ['eased', 'rounded', 'chamfer', 'undercut'],
    defaultEdge: 'eased',
    drawers: { min: 0, max: 2, default: 1 },
    species: ALL_SPECIES,
    defaultSpecies: 'ash',
    defaultFinish: 'lacquered',
    baseHours: 11,
    leadWeeks: [6, 8],
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];

export const LEG_STYLES: Record<LegStyle, { name: string; description: string; extraHours: number }> = {
  tapered: { name: 'Tapered legs', description: 'Legs taper on the inside faces, with an apron frame', extraHours: 1.2 },
  square: { name: 'Square legs', description: 'Straight square legs with an apron frame', extraHours: 0 },
  trestle: { name: 'Trestle base', description: 'Two trestles joined by a stretcher; no legs at the corners', extraHours: 3 },
  panel: { name: 'Side panels', description: 'Two solid side panels with a back rail', extraHours: 1 },
  plinth: { name: 'Recessed plinth', description: 'A low, set-back plinth: the bookcase looks like it floats', extraHours: 1.5 },
  feet: { name: 'Tapered feet', description: 'Four short tapered feet, 12 cm high', extraHours: 0.8 },
};

export const EDGE_PROFILES: Record<EdgeProfile, { name: string; description: string; extraHours: number }> = {
  eased: { name: 'Eased', description: 'Crisp edge, just broken by 1.5 mm', extraHours: 0 },
  rounded: { name: 'Rounded', description: 'Soft round-over, pleasant to touch', extraHours: 0.8 },
  chamfer: { name: 'Chamfered', description: '45° bevel along the top edge', extraHours: 0.6 },
  undercut: { name: 'Undercut bevel', description: 'Steep bevel underneath: the top looks thin and light', extraHours: 1.6 },
};

export const DELIVERY: Record<DeliveryId, { name: string; description: string; priceNet: number }> = {
  pickup: { name: 'Pickup', description: 'Collect from the workshop in Berlin-Neukölln', priceNet: 0 },
  berlin: { name: 'Berlin', description: 'Delivered and set up within Berlin (postcodes 10xxx–14xxx)', priceNet: 59 },
  germany: { name: 'Germany', description: 'Delivered by our furniture freight partner anywhere in Germany', priceNet: 179 },
};

/** Two-person delivery surcharge when the piece is heavy or long (EUR net). */
export const TWO_PERSON_SURCHARGE = 70;
export const TWO_PERSON_KG = 60;
export const TWO_PERSON_LENGTH_CM = 220;

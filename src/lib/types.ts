// Shared domain types. Pure TypeScript: used by the site, the configurator, the server endpoints,
// the build scripts and the tests.

export type ProductId = 'dining-table' | 'coffee-table' | 'bookcase' | 'bench' | 'desk';
export type SpeciesId = 'oak' | 'beech' | 'walnut' | 'pine' | 'ash';
export type FinishId = 'oiled' | 'lacquered' | 'raw';
export type LegStyle = 'tapered' | 'square' | 'trestle' | 'panel' | 'plinth' | 'feet';
export type EdgeProfile = 'eased' | 'rounded' | 'chamfer' | 'undercut';
export type DeliveryId = 'pickup' | 'berlin' | 'germany';

/** One complete furniture configuration. Lengths in cm, plate thickness in mm (as carpenters say them). */
export interface Config {
  product: ProductId;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  thicknessMm: number;
  leg: LegStyle;
  edge: EdgeProfile;
  /** Shelves (bookcase: inner shelves; coffee table/bench: lower shelf 0/1). 0 where not applicable. */
  shelves: number;
  /** Desk drawers 0–2. 0 where not applicable. */
  drawers: number;
  species: SpeciesId;
  finish: FinishId;
  delivery: DeliveryId;
}

export type WallId = 'chalk' | 'sage' | 'clay' | 'slate' | 'charcoal';
export type FloorId = 'oak-planks' | 'concrete' | 'terracotta';

/** How the configuration is shown (not part of the product, but shareable through the URL too). */
export interface ViewState {
  room: boolean;
  wall: WallId;
  floor: FloorId;
  person: boolean;
  dims: boolean;
}

export interface RangeSpec {
  min: number;
  max: number;
  /** Granularity of valid values. */
  step: number;
  default: number;
  /** Increment of the − / + buttons. */
  nudge: number;
}

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  code: string;
  /** Which input the issue belongs to (for highlighting). */
  field?: keyof Config;
  message: string;
  /** Concrete suggestion how to fix it. */
  fix?: string;
}

/** One physical part of the parametric model. All values in millimeters, y = up, floor at y = 0. */
export interface Part {
  id: string;
  /** Human-readable name for the cut list. */
  name: string;
  /** Group used for the cut list and for coloring/ordering. */
  group: 'top' | 'base' | 'carcass' | 'shelf' | 'back' | 'drawer';
  shape: 'slab' | 'box' | 'tapered';
  /** World-aligned bounding box size [x, y, z]. */
  size: [number, number, number];
  /** Center of the bounding box. */
  position: [number, number, number];
  /** Axis the wood grain runs along. */
  grain: 'x' | 'y' | 'z';
  /** Edge profile (slabs only). */
  edge?: EdgeProfile;
  /** Tapered legs: cross-section at the bottom [x, z] and which corner the taper keeps flush [sx, sz] (±1). */
  taper?: { bottom: [number, number]; flush: [number, number] };
  /** Nominal finished dimensions for the cut list: length along the grain × width × thickness. */
  cut: { length: number; width: number; thickness: number };
  /** Inside parts (drawer boxes) are in the cut list and price but not drawn in 3D. */
  hidden?: boolean;
}

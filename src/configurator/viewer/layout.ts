// Where things stand in the scene (meters). Furniture is centred at the origin; in compare mode the
// two variants stand side by side with a gap; the room is built around them.

import type { Config } from '../../lib/types.ts';
import { buildModel, type Model } from '../../lib/model.ts';

export interface PlacedVariant {
  label: 'A' | 'B' | null;
  config: Config;
  model: Model;
  /** Offset of the variant's origin (m). */
  x: number;
  z: number;
  /** Size (m): [length, height, depth]. */
  size: [number, number, number];
}

export interface SceneLayout {
  variants: PlacedVariant[];
  /** Overall content box (m), centred on x = 0. */
  width: number;
  height: number;
  depth: number;
  /** Room: back wall z, left wall x (m). */
  backWallZ: number;
  leftWallX: number;
  /** Person position (m). */
  personX: number;
}

const GAP = 0.6;
const WALL_STANDING = new Set<Config['product']>(['bookcase', 'desk']);

export function layoutScene(configs: { config: Config; label: 'A' | 'B' | null }[]): SceneLayout {
  const placed = configs.map(({ config, label }) => {
    const model = buildModel(config);
    const [L, H, W] = model.bounds;
    return { label, config, model, x: 0, z: 0, size: [L / 1000, H / 1000, W / 1000] as [number, number, number] };
  });
  const total = placed.reduce((s, p) => s + p.size[0], 0) + GAP * (placed.length - 1);
  let cursor = -total / 2;
  for (const p of placed) {
    p.x = cursor + p.size[0] / 2;
    cursor += p.size[0] + GAP;
  }
  const depth = Math.max(...placed.map((p) => p.size[2]));
  const height = Math.max(...placed.map((p) => p.size[1]));
  const wallStanding = placed.every((p) => WALL_STANDING.has(p.config.product));
  // Wall-standing pieces touch the back wall; tables and benches stand in the room.
  for (const p of placed) p.z = wallStanding ? -(depth - p.size[2]) / 2 : 0;
  const backWallZ = wallStanding ? -depth / 2 - 0.015 : -depth / 2 - 0.9;
  const leftWallX = -total / 2 - 1.1;
  return { variants: placed, width: total, height, depth, backWallZ, leftWallX, personX: total / 2 + 0.45 };
}

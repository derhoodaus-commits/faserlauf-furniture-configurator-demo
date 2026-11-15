import type { FinishId } from '../lib/types.ts';

export interface Finish {
  id: FinishId;
  name: string;
  short: string;
  description: string;
  pros: string;
  cons: string;
  care: string;
  /** Demo price per m² of finished surface, EUR net (includes sanding between coats). */
  pricePerM2: number;
  /** Rendering: multiplier on the texture color (linear), roughness, clear coat. */
  render: {
    tint: [number, number, number];
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
  };
  /** Build-time previews: sRGB color transform (multiply + saturation boost). */
  preview: { multiply: [number, number, number]; saturation: number };
}

export const FINISHES: Record<FinishId, Finish> = {
  oiled: {
    id: 'oiled',
    name: 'Hardwax oil',
    short: 'Oiled',
    description:
      'Two coats of hardwax oil soak into the wood and harden there. The surface stays open-pored and feels like wood, and the color deepens ("Anfeuerung", as German carpenters say).',
    pros: 'Natural feel, warm color, small damage can be repaired locally',
    cons: 'Needs a fresh coat every one to two years on tables',
    care: 'Wipe with a damp cloth and mild soap; re-oil when water stops beading.',
    pricePerM2: 22,
    render: { tint: [0.84, 0.76, 0.66], roughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.55 },
    preview: { multiply: [0.9, 0.84, 0.76], saturation: 1.18 },
  },
  lacquered: {
    id: 'lacquered',
    name: 'Matte lacquer',
    short: 'Lacquered',
    description:
      'A water-based matte lacquer in three coats forms a thin, closed film. The wood keeps its light, natural tone and is protected against water rings and stains.',
    pros: 'Most resistant to spills and stains, almost no maintenance',
    cons: 'Feels slightly less like raw wood; deep scratches need a workshop repair',
    care: 'Wipe with a damp cloth; no scouring pads or abrasive cleaners.',
    pricePerM2: 34,
    render: { tint: [0.97, 0.93, 0.88], roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.32 },
    preview: { multiply: [0.98, 0.95, 0.91], saturation: 1.05 },
  },
  raw: {
    id: 'raw',
    name: 'Raw (sanded, unfinished)',
    short: 'Raw',
    description:
      'Fine-sanded to 180 grit, nothing applied. The lightest and most matte look, and the starting point if you want to finish the piece yourself.',
    pros: 'Lightest color, completely natural, no added cost',
    cons: 'Stains easily: water, oil and red wine leave marks',
    care: 'Dust only. Not recommended for tables in daily use.',
    pricePerM2: 0,
    render: { tint: [0.97, 0.95, 0.92], roughness: 0.82, clearcoat: 0, clearcoatRoughness: 1 },
    preview: { multiply: [1.03, 1.02, 1.0], saturation: 0.9 },
  },
};

export const FINISH_IDS = Object.keys(FINISHES) as FinishId[];

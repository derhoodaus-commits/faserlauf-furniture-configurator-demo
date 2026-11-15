import type { FloorId, WallId } from '../lib/types.ts';

export const WALLS: Record<WallId, { name: string; hex: string }> = {
  chalk: { name: 'Chalk white', hex: '#ece6dc' },
  sage: { name: 'Sage', hex: '#aab39b' },
  clay: { name: 'Clay', hex: '#c69277' },
  slate: { name: 'Slate blue', hex: '#71808e' },
  charcoal: { name: 'Charcoal', hex: '#45423e' },
};

export const FLOORS: Record<FloorId, { name: string; description: string }> = {
  'oak-planks': { name: 'Oak planks', description: 'Wide oak floorboards' },
  concrete: { name: 'Polished concrete', description: 'Smooth grey screed' },
  terracotta: { name: 'Terracotta tiles', description: '30 cm clay tiles' },
};

export const WALL_IDS = Object.keys(WALLS) as WallId[];
export const FLOOR_IDS = Object.keys(FLOORS) as FloorId[];

/** Size of the simple room in the room mode, in mm. */
export const ROOM = { width: 5200, depth: 4200, height: 2600 };

/** Height of the scale figure in mm. */
export const PERSON_HEIGHT_MM = 1750;

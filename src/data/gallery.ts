// Example configurations: shown on the About page and the home page instead of customer reviews,
// rendered into images by scripts/render_previews.py, and each one opens in the configurator.
import type { Config, ViewState } from '../lib/types.ts';
import { DEFAULT_VIEW } from '../lib/config.ts';

export interface GalleryItem {
  id: string;
  title: string;
  text: string;
  config: Config;
  view: ViewState;
}

export const GALLERY: GalleryItem[] = [
  {
    id: 'family-table',
    title: 'The long family table',
    text: '240 cm of oak on a trestle base, so nobody has to sit at a leg. The undercut bevel makes the 40 mm top look light.',
    config: { product: 'dining-table', lengthCm: 240, widthCm: 100, heightCm: 75, thicknessMm: 40, leg: 'trestle', edge: 'undercut', shelves: 0, drawers: 0, species: 'oak', finish: 'oiled', delivery: 'berlin' },
    view: { ...DEFAULT_VIEW, room: true, wall: 'chalk', floor: 'concrete', dims: false },
  },
  {
    id: 'walnut-dining',
    title: 'Walnut for six',
    text: 'A compact 190 cm walnut table on tapered legs with softly rounded edges: dark, warm and calm.',
    config: { product: 'dining-table', lengthCm: 190, widthCm: 95, heightCm: 75, thicknessMm: 35, leg: 'tapered', edge: 'rounded', shelves: 0, drawers: 0, species: 'walnut', finish: 'oiled', delivery: 'berlin' },
    view: { ...DEFAULT_VIEW, room: true, wall: 'clay', floor: 'oak-planks', dims: false },
  },
  {
    id: 'library-bookcase',
    title: 'Floor-to-ceiling bookcase',
    text: '220 cm tall in beech, our stiffest wood, with six shelves 26 cm apart: room for paperbacks and art books.',
    config: { product: 'bookcase', lengthCm: 120, widthCm: 35, heightCm: 220, thicknessMm: 35, leg: 'plinth', edge: 'eased', shelves: 6, drawers: 0, species: 'beech', finish: 'lacquered', delivery: 'berlin' },
    view: { ...DEFAULT_VIEW, room: true, wall: 'slate', floor: 'oak-planks', dims: false },
  },
  {
    id: 'hallway-bench',
    title: 'Hallway bench with shoe shelf',
    text: 'Ash with matte lacquer, square legs and a lower shelf: tough enough for wet boots and shopping bags.',
    config: { product: 'bench', lengthCm: 120, widthCm: 36, heightCm: 46, thicknessMm: 35, leg: 'square', edge: 'rounded', shelves: 1, drawers: 0, species: 'ash', finish: 'lacquered', delivery: 'berlin' },
    view: { ...DEFAULT_VIEW, room: true, wall: 'sage', floor: 'terracotta', dims: false },
  },
  {
    id: 'study-desk',
    title: 'Study desk in pine',
    text: 'Friendly, affordable pine with two side panels and one drawer, sized for a small room at 120 × 60 cm.',
    config: { product: 'desk', lengthCm: 120, widthCm: 60, heightCm: 73, thicknessMm: 30, leg: 'panel', edge: 'chamfer', shelves: 0, drawers: 1, species: 'pine', finish: 'oiled', delivery: 'germany' },
    view: { ...DEFAULT_VIEW, room: true, wall: 'chalk', floor: 'oak-planks', dims: false },
  },
  {
    id: 'walnut-coffee',
    title: 'Low walnut coffee table',
    text: 'Solid walnut side panels, a magazine shelf and an undercut top: the centrepiece of a living room.',
    config: { product: 'coffee-table', lengthCm: 120, widthCm: 65, heightCm: 38, thicknessMm: 30, leg: 'panel', edge: 'undercut', shelves: 1, drawers: 0, species: 'walnut', finish: 'oiled', delivery: 'berlin' },
    view: { ...DEFAULT_VIEW, room: true, wall: 'sage', floor: 'concrete', dims: false },
  },
];

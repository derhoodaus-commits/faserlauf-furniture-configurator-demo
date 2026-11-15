// Prints the list of preview images as JSON for scripts/render_previews.py.
// Every image is a configuration from the site's own data, rendered by the real configurator.

import { PRODUCTS, PRODUCT_IDS } from '../src/data/products.ts';
import { GALLERY } from '../src/data/gallery.ts';
import { defaultConfig, DEFAULT_VIEW } from '../src/lib/config.ts';
import { stateToParams } from '../src/lib/url-state.ts';
import type { Config, ViewState } from '../src/lib/types.ts';

const query = (config: Config, view: Partial<ViewState>, extra: Record<string, string> = {}) => {
  const q = stateToParams({ a: config, b: null, active: 'a', compare: false, view: { ...DEFAULT_VIEW, dims: false, ...view } });
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
};

const renders = [
  ...PRODUCT_IDS.map((id) => ({
    name: `${id}-card`,
    query: query(defaultConfig(id), { room: false }, { preset: 'three-quarter', bg: 'efe8dc' }),
    width: 1200,
    height: 900,
  })),
  ...GALLERY.map((g) => ({ name: `gallery-${g.id}`, query: query(g.config, g.view, { preset: 'three-quarter' }), width: 1200, height: 900 })),
  { name: 'hero', query: query(GALLERY[0]!.config, GALLERY[0]!.view, { preset: 'three-quarter' }), width: 1400, height: 1050 },
];

const og = [
  { name: 'home', kicker: 'Furniture workshop · Berlin', title: 'Solid wood furniture, built to your measurements', image: 'hero' },
  { name: 'configurator', kicker: '3D configurator', title: 'Design your table in 3D, see the price live', image: 'gallery-walnut-dining' },
  { name: 'furniture', kicker: 'The furniture', title: 'Tables, bookcases, benches and desks made to measure', image: 'dining-table-card' },
  { name: 'wood', kicker: 'Wood & finishes', title: 'Oak, beech, walnut, pine and ash explained', image: 'gallery-library-bookcase' },
  { name: 'how-it-works', kicker: 'How it works', title: 'From configuration to delivery, with clear prices', image: 'gallery-family-table' },
  { name: 'about', kicker: 'The workshop', title: 'A courtyard workshop in Berlin-Neukölln', image: 'gallery-hallway-bench' },
  { name: 'faq', kicker: 'FAQ', title: 'Questions about prices, wood and delivery', image: 'gallery-study-desk' },
  { name: 'contact', kicker: 'Contact', title: 'Visit the workshop or send us a message', image: 'gallery-walnut-coffee' },
  ...PRODUCT_IDS.map((id) => ({ name: id, kicker: PRODUCTS[id].kind, title: PRODUCTS[id].name, image: `${id}-card` })),
];

process.stdout.write(JSON.stringify({ renders, og }));

// The whole configurator state lives in the URL so a design can be sent as a link.
// Readable parameters for variant A, a compact dotted string for variant B.
//
//   /configurator/?p=dining-table&l=200&w=90&h=75&t=30&legs=tapered&edge=eased&shelves=0&drawers=0
//                 &wood=oak&finish=oiled&delivery=berlin&room=1&wall=sage&floor=oak-planks&person=1&dims=1
//                 &b=dining-table.240.100.75.40.trestle.undercut.0.0.walnut.oiled.berlin&active=b&compare=1

import { defaultConfig, DEFAULT_VIEW, normalizeConfig, normalizeView } from './config.ts';
import { withBase } from './paths.ts';
import type { Config, ViewState } from './types.ts';

export const URL_VERSION = '1';

export interface AppState {
  a: Config;
  b: Config | null;
  active: 'a' | 'b';
  compare: boolean;
  view: ViewState;
}

const KEYS: [keyof Config, string][] = [
  ['product', 'p'],
  ['lengthCm', 'l'],
  ['widthCm', 'w'],
  ['heightCm', 'h'],
  ['thicknessMm', 't'],
  ['leg', 'legs'],
  ['edge', 'edge'],
  ['shelves', 'shelves'],
  ['drawers', 'drawers'],
  ['species', 'wood'],
  ['finish', 'finish'],
  ['delivery', 'delivery'],
];

const COMPACT_ORDER: (keyof Config)[] = KEYS.map(([k]) => k);

export function encodeCompact(c: Config): string {
  return COMPACT_ORDER.map((k) => String(c[k])).join('.');
}

export function decodeCompact(s: string): { config: Config; corrections: string[] } | null {
  const parts = s.split('.');
  if (parts.length !== COMPACT_ORDER.length) return null;
  const raw: Record<string, unknown> = {};
  COMPACT_ORDER.forEach((k, i) => {
    raw[k] = parts[i];
  });
  return normalizeConfig(raw as Partial<Config>);
}

export function stateToParams(state: AppState): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, short] of KEYS) q.set(short, String(state.a[k]));
  const v = state.view;
  if (v.room) q.set('room', '1');
  if (v.wall !== DEFAULT_VIEW.wall) q.set('wall', v.wall);
  if (v.floor !== DEFAULT_VIEW.floor) q.set('floor', v.floor);
  if (v.person) q.set('person', '1');
  if (v.dims !== DEFAULT_VIEW.dims) q.set('dims', v.dims ? '1' : '0');
  if (state.b) {
    q.set('b', encodeCompact(state.b));
    if (state.active === 'b') q.set('active', 'b');
    if (state.compare) q.set('compare', '1');
  }
  q.set('v', URL_VERSION);
  return q;
}

export interface ParsedState {
  state: AppState;
  corrections: string[];
}

/** Parses any query string (missing, partial or tampered) into a valid state. Never throws. */
export function paramsToState(params: URLSearchParams | string): ParsedState {
  const q = typeof params === 'string' ? new URLSearchParams(params) : params;
  const raw: Record<string, unknown> = {};
  for (const [k, short] of KEYS) {
    const v = q.get(short);
    if (v !== null && v !== '') raw[k] = v;
  }
  const corrections: string[] = [];
  let a: Config;
  if (Object.keys(raw).length === 0) a = defaultConfig();
  else {
    const r = normalizeConfig(raw as Partial<Config>);
    a = r.config;
    corrections.push(...r.corrections);
  }
  let b: Config | null = null;
  const bs = q.get('b');
  if (bs) {
    const r = decodeCompact(bs);
    if (r) {
      b = r.config;
      corrections.push(...r.corrections.map((c) => `Variant B: ${c}`));
    } else corrections.push('Variant B in the link could not be read and was ignored.');
  }
  const view = normalizeView({
    room: q.get('room') ?? undefined,
    wall: q.get('wall') ?? undefined,
    floor: q.get('floor') ?? undefined,
    person: q.get('person') ?? undefined,
    dims: q.get('dims') ?? undefined,
  });
  return {
    state: {
      a,
      b,
      active: b && q.get('active') === 'b' ? 'b' : 'a',
      compare: !!b && q.get('compare') === '1',
      view,
    },
    corrections,
  };
}

/** Link that opens the configurator with just this configuration. */
export function configHref(c: Config, view?: Partial<ViewState>): string {
  const params = stateToParams({ a: c, b: null, active: 'a', compare: false, view: { ...DEFAULT_VIEW, ...view } });
  return withBase(`/configurator/?${params.toString()}`);
}

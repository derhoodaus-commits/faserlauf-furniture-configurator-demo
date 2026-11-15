import { describe, expect, it } from 'vitest';
import { configHref, decodeCompact, encodeCompact, paramsToState, stateToParams, type AppState } from '../../src/lib/url-state.ts';
import { defaultConfig, DEFAULT_VIEW } from '../../src/lib/config.ts';
import { PRODUCT_IDS } from '../../src/data/products.ts';
import { WALL_IDS, FLOOR_IDS } from '../../src/data/room.ts';
import { rng } from '../../src/lib/wood/noise.ts';
import { randomConfig } from './helpers.ts';

const defaultState = (): AppState => ({ a: defaultConfig(), b: null, active: 'a', compare: false, view: { ...DEFAULT_VIEW } });

describe('configuration in the URL', () => {
  it('round-trips the default state', () => {
    const s = defaultState();
    const back = paramsToState(stateToParams(s));
    expect(back.state).toEqual(s);
    expect(back.corrections).toEqual([]);
  });

  it('round-trips 1,000 random states including variant B, compare mode and room settings', () => {
    const r = rng(7);
    const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
    for (let i = 0; i < 1000; i++) {
      const a = randomConfig(pick(PRODUCT_IDS), r);
      const withB = r() < 0.5;
      const s: AppState = {
        a,
        b: withB ? randomConfig(pick(PRODUCT_IDS), r) : null,
        active: withB && r() < 0.5 ? 'b' : 'a',
        compare: withB && r() < 0.5,
        view: { room: r() < 0.5, wall: pick(WALL_IDS), floor: pick(FLOOR_IDS), person: r() < 0.5, dims: r() < 0.5 },
      };
      const url = '?' + stateToParams(s).toString();
      const back = paramsToState(url.slice(1));
      expect(back.state).toEqual(s);
      expect(back.corrections).toEqual([]);
    }
  });

  it('keeps URLs short and readable', () => {
    const q = stateToParams({ ...defaultState(), b: defaultConfig('bookcase'), compare: true }).toString();
    expect(q).toMatch(/^p=dining-table&l=200&w=90&h=75&t=30&legs=tapered/);
    expect(q).toContain('b=bookcase.100.32.180.26.plinth.eased.4.0.oak.oiled.berlin');
    expect(q.length).toBeLessThan(260);
  });

  it('fills missing parameters with the product defaults (links from product pages)', () => {
    const { state, corrections } = paramsToState('p=bench');
    expect(state.a).toEqual(defaultConfig('bench'));
    expect(corrections).toEqual([]);
    expect(paramsToState('').state.a).toEqual(defaultConfig('dining-table'));
  });

  it('repairs tampered or outdated links instead of failing', () => {
    const { state, corrections } = paramsToState('p=bookcase&l=9999&w=abc&wood=gold&legs=trestle&shelves=-3&finish=varnish&dims=0');
    expect(state.a.product).toBe('bookcase');
    expect(state.a.lengthCm).toBe(240);
    expect(state.a.widthCm).toBe(32);
    expect(state.a.species).toBe('oak');
    expect(state.a.leg).toBe('plinth');
    expect(state.a.shelves).toBe(0);
    expect(state.a.finish).toBe('oiled');
    expect(state.view.dims).toBe(false);
    expect(corrections.length).toBeGreaterThanOrEqual(5);
  });

  it('falls back to the dining table for unknown furniture and ignores a broken variant B', () => {
    const r = paramsToState('p=sofa&b=not.a.config&compare=1&active=b');
    expect(r.state.a.product).toBe('dining-table');
    expect(r.state.b).toBeNull();
    expect(r.state.compare).toBe(false);
    expect(r.state.active).toBe('a');
    expect(r.corrections.some((c) => c.includes('Variant B'))).toBe(true);
  });

  it('encodes variant B compactly and decodes it back', () => {
    const c = defaultConfig('desk');
    expect(decodeCompact(encodeCompact(c))?.config).toEqual(c);
  });

  it('builds configurator links for product pages and the gallery', () => {
    const href = configHref(defaultConfig('coffee-table'), { room: true, wall: 'sage' });
    expect(href.startsWith('/configurator/?p=coffee-table&')).toBe(true);
    const back = paramsToState(href.split('?')[1]!);
    expect(back.state.a).toEqual(defaultConfig('coffee-table'));
    expect(back.state.view.room).toBe(true);
    expect(back.state.view.wall).toBe('sage');
  });
});

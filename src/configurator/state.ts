import { useEffect, useMemo, useReducer, useRef } from 'react';
import { normalizeConfig, switchProduct } from '../lib/config.ts';
import { paramsToState, stateToParams, type AppState } from '../lib/url-state.ts';
import type { Config, ProductId, ViewState } from '../lib/types.ts';

export type Action =
  | { type: 'patch'; patch: Partial<Config> }
  | { type: 'product'; product: ProductId }
  | { type: 'view'; patch: Partial<ViewState> }
  | { type: 'startCompare' }
  | { type: 'active'; slot: 'a' | 'b' }
  | { type: 'compare'; on: boolean }
  | { type: 'removeB' }
  | { type: 'swap' };

export function reducer(s: AppState, a: Action): AppState {
  const activeConfig = s.active === 'b' && s.b ? s.b : s.a;
  const withActive = (c: Config): AppState => (s.active === 'b' && s.b ? { ...s, b: c } : { ...s, a: c });
  switch (a.type) {
    case 'patch':
      // normalize keeps every field valid for the product (e.g. snaps thickness to an available board)
      return withActive(normalizeConfig({ ...activeConfig, ...a.patch }).config);
    case 'product':
      return withActive(switchProduct(activeConfig, a.product));
    case 'view':
      return { ...s, view: { ...s.view, ...a.patch } };
    case 'startCompare':
      return { ...s, b: { ...activeConfig }, active: 'b', compare: true };
    case 'active':
      return s.b ? { ...s, active: a.slot } : s;
    case 'compare':
      return s.b ? { ...s, compare: a.on } : s;
    case 'removeB':
      return { ...s, a: activeConfig, b: null, active: 'a', compare: false };
    case 'swap':
      return s.b ? { ...s, a: s.b, b: s.a, active: s.active === 'a' ? 'b' : 'a' } : s;
  }
}

/** Configurator state, initialised from and mirrored to the URL (replaceState, debounced). */
export function useConfiguratorState(search: string) {
  const initial = useMemo(() => paramsToState(search), [search]);
  const [state, dispatch] = useReducer(reducer, initial.state);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const q = stateToParams(state).toString();
      const url = `${location.pathname}?${q}`;
      if (url !== location.pathname + location.search) history.replaceState(null, '', url);
    }, 150);
    return () => window.clearTimeout(timer.current);
  }, [state]);

  const active: Config = state.active === 'b' && state.b ? state.b : state.a;
  return { state, dispatch, active, corrections: initial.corrections };
}

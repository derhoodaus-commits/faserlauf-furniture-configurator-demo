// URLs that work at the domain root (local server) and under a sub-path (GitHub Pages project site,
// e.g. /faserlauf-furniture-configurator-demo/). Every internal link, image and fetch goes through withBase().

/** Astro's `base` with a trailing slash: "/" locally, "/<repo>/" on GitHub Pages. */
export const BASE: string = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');

/** Origin + base of the deployed site (Astro `site`), used for canonical, Open Graph and structured-data URLs. */
const SITE_ORIGIN: string = import.meta.env.SITE ?? 'https://www.faserlauf.example';

/** True in the static GitHub Pages build: forms validate but never send anything (see astro.config.mjs). */
export const STATIC_DEMO: boolean = import.meta.env.PUBLIC_STATIC_DEMO === 'true';

/**
 * Site path → URL path under the base: withBase('/about/') → '/<repo>/about/'.
 * External URLs, protocol links (mailto:, tel:, data:) and fragments are returned unchanged.
 */
export function withBase(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path)) return path;
  if (BASE !== '/' && (path === BASE.slice(0, -1) || path.startsWith(BASE))) return path; // already prefixed
  return BASE + path.replace(/^\/+/, '');
}

/** URL path under the base → site path: stripBase('/<repo>/about/') → '/about/'. */
export function stripBase(pathname: string): string {
  if (BASE !== '/' && pathname.startsWith(BASE)) return '/' + pathname.slice(BASE.length);
  if (BASE !== '/' && pathname === BASE.slice(0, -1)) return '/';
  return pathname;
}

/** Absolute URL of a site path, e.g. for canonical links and JSON-LD. */
export function absoluteUrl(path: string): string {
  return new URL(withBase(path), SITE_ORIGIN).href;
}

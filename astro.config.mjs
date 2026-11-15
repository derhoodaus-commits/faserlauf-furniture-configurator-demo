// @ts-check
import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

/**
 * Two build targets:
 * - server (default, `npm run build`): prerendered pages + the /api endpoints via @astrojs/node, served by server.mjs.
 * - pages (`npm run build:pages`, sets DEPLOY_TARGET=pages): a fully static site for GitHub Pages in dist-pages/,
 *   no adapter, no endpoints, forms validate but send nothing. BASE_PATH sets the sub-path (Astro `base`),
 *   SITE_URL the origin (Astro `site`).
 */
const PAGES = process.env.DEPLOY_TARGET === 'pages';
/** @param {string} name */
const env = (name) => process.env[name]?.trim() || undefined;

export const SITE_URL = env('SITE_URL') ?? 'https://www.faserlauf.example';
/** Always with a leading and a trailing slash, e.g. "/" or "/faserlauf-furniture-configurator-demo/". */
const BASE = `/${(env('BASE_PATH') ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

// Pages that must not appear in the sitemap (noindex or utility pages)
const NOT_IN_SITEMAP = ['/inquiry-sent/', '/legal-notice/', '/privacy/', '/render/', '/404/'];

/**
 * Server mode only: the API endpoints and the /render/ utility page (used by scripts/render_previews.py) live
 * outside src/pages, so the static build never sees them.
 */
/** @type {import('astro').AstroIntegration} */
const serverRoutes = {
  name: 'faserlauf:server-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({ pattern: '/api/contact', entrypoint: './src/server/api/contact.ts', prerender: false });
      injectRoute({ pattern: '/api/inquiry', entrypoint: './src/server/api/inquiry.ts', prerender: false });
      injectRoute({ pattern: '/render', entrypoint: './src/server/render.astro' });
    },
  },
};

/** Pages mode: GitHub Pages runs Jekyll unless told not to, and Jekyll drops folders starting with "_" (_astro/). */
/** @type {import('astro').AstroIntegration} */
const noJekyll = {
  name: 'faserlauf:nojekyll',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await writeFile(new URL('.nojekyll', dir), '');
    },
  },
};

export default defineConfig({
  site: SITE_URL,
  base: BASE,
  // 'ignore' so the API endpoints answer without a trailing slash; pages are built as folders (/about/) and the
  // production server (and GitHub Pages) redirect /about → /about/
  trailingSlash: 'ignore',
  // v7 default is 'jsx' (drops whitespace between inline elements on separate lines); keep the v6 behaviour for prose
  compressHTML: true,
  output: 'static',
  outDir: PAGES ? './dist-pages' : './dist',
  ...(PAGES ? {} : { adapter: node({ mode: 'middleware' }) }),
  integrations: [
    react(),
    sitemap({ filter: (page) => !NOT_IN_SITEMAP.some((p) => page.endsWith(p)) }),
    PAGES ? noJekyll : serverRoutes,
  ],
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  devToolbar: { enabled: false },
  markdown: { syntaxHighlight: false },
  server: { port: Number(process.env.PORT) || 3002, host: process.env.HOST || 'localhost' },
  vite: {
    // Static demo flag for client and server code (src/lib/paths.ts): forms validate but never send anything
    define: { 'import.meta.env.PUBLIC_STATIC_DEMO': JSON.stringify(PAGES ? 'true' : 'false') },
    // never inline assets as data: URLs (fonts must come from 'self' under the CSP)
    build: { chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
    worker: { format: 'es' },
  },
});

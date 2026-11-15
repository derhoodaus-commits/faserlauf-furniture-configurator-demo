// Static build for GitHub Pages: no server, no API endpoints, forms only validate (see astro.config.mjs).
// Usage: npm run build:pages                       → dist-pages/, served at the domain root
//        BASE_PATH=/<repo>/ SITE_URL=https://<user>.github.io npm run build:pages
// (PowerShell: $env:BASE_PATH='/<repo>/'; npm run build:pages)

import { fileURLToPath } from 'node:url';

process.env.DEPLOY_TARGET = 'pages';
const root = fileURLToPath(new URL('..', import.meta.url));
const { build } = await import('astro');
await build({ root });
console.log(`Static site written to dist-pages/ (base ${process.env.BASE_PATH || '/'}, site ${process.env.SITE_URL || '(default)'})`);

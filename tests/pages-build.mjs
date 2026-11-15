// Test of the static GitHub Pages build: builds the site under the project sub-path, then checks that every
// internal URL in the output (HTML attributes, srcset, island/script URLs, CSS url(), JS chunk references,
// canonical/Open Graph/JSON-LD URLs, sitemap, robots.txt) stays under that prefix and resolves to a file.
//
// Usage: npm run test:pages            (builds first)
//        node tests/pages-build.mjs --no-build   (checks an existing dist-pages/ built with the same BASE_PATH)
// BASE_PATH and SITE_URL default to the GitHub Pages deployment (/faserlauf-furniture-configurator-demo/).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dist-pages');
// Defaults: the real deployment. CI passes its own values (the same ones the build used).
const BASE = `/${(process.env.BASE_PATH || '/faserlauf-furniture-configurator-demo/').replace(/^\/+|\/+$/g, '')}/`;
const SITE = (process.env.SITE_URL || 'https://derhoodaus-commits.github.io').replace(/\/+$/, '');
const ORIGIN_BASE = SITE + BASE;

if (!process.argv.includes('--no-build')) {
  console.log(`Building with BASE_PATH=${BASE} SITE_URL=${SITE} …`);
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-pages.mjs')], {
    cwd: ROOT,
    env: { ...process.env, BASE_PATH: BASE, SITE_URL: SITE },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (r.status !== 0) {
    console.error('Build failed');
    process.exit(1);
  }
}

const failures = [];
let checks = 0;
const fail = (msg) => failures.push(msg);
const ok = (cond, msg) => {
  checks++;
  if (!cond) fail(msg);
};

/** All files below a folder, as paths relative to OUT with forward slashes. */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [relative(OUT, full).split(sep).join('/')];
  });
}

if (!existsSync(OUT)) {
  console.error(`Output folder ${OUT} not found: run without --no-build`);
  process.exit(1);
}
const files = walk(OUT);
const fileSet = new Set(files);
const html = files.filter((f) => f.endsWith('.html'));

/** Ids per HTML file, for #fragment checks. */
const ids = new Map(html.map((f) => [f, new Set([...readFileSync(join(OUT, f), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));

/**
 * URL path (already stripped of the base) → file in OUT, following GitHub Pages' rules: "dir/" serves
 * dir/index.html, "dir" redirects to "dir/", files are served as-is.
 */
function resolveFile(sitePath) {
  const p = decodeURIComponent(sitePath).replace(/^\/+/, '');
  if (p === '' || p.endsWith('/')) return fileSet.has(p + 'index.html') ? p + 'index.html' : null;
  if (fileSet.has(p)) return p;
  if (fileSet.has(p + '/index.html')) return p + '/index.html';
  return null;
}

/** Checks one URL found in `from` (a file relative to OUT). */
function checkUrl(raw, from, what) {
  const url = raw.trim().replace(/&amp;/g, '&');
  if (!url || /^(?:mailto:|tel:|data:|blob:|javascript:)/i.test(url)) return;
  const where = `${from} (${what}: ${url})`;
  let pathAndHash;
  if (/^https?:\/\//i.test(url)) {
    if (!url.startsWith(SITE + '/')) return; // external link
    ok(url.startsWith(ORIGIN_BASE), `Absolute URL outside ${BASE}: ${where}`);
    pathAndHash = url.slice(SITE.length);
  } else if (url.startsWith('//')) {
    return fail(`Protocol-relative URL: ${where}`);
  } else if (url.startsWith('#')) {
    if (from.endsWith('.html') && url.length > 1) ok(ids.get(from)?.has(decodeURIComponent(url.slice(1))), `Missing #fragment target: ${where}`);
    return;
  } else if (url.startsWith('/')) {
    pathAndHash = url;
  } else {
    // Relative URL (CSS fonts, JS chunks): resolve against the file's own folder
    pathAndHash = new URL(url, `https://x${BASE}${from}`).pathname;
  }
  const [beforeHash, hash] = pathAndHash.split('#');
  const path = (beforeHash ?? '').split('?')[0] ?? '';
  checks++;
  if (!path.startsWith(BASE) && path !== BASE.slice(0, -1)) return fail(`Root-relative URL without the ${BASE} prefix: ${where}`);
  const target = resolveFile(path.slice(BASE.length - 1));
  checks++;
  if (!target) return fail(`Broken link (no file): ${where}`);
  if (hash && target.endsWith('.html')) ok(ids.get(target)?.has(decodeURIComponent(hash)), `Missing #${hash} in ${target}: ${where}`);
}

const ATTRS = ['href', 'src', 'action', 'poster', 'component-url', 'renderer-url', 'before-hydration-url'];
for (const f of html) {
  const s = readFileSync(join(OUT, f), 'utf8');
  for (const a of ATTRS) for (const m of s.matchAll(new RegExp(`\\s${a}="([^"]*)"`, 'g'))) checkUrl(m[1], f, a);
  for (const m of s.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) checkUrl(part.trim().split(/\s+/)[0] ?? '', f, 'srcset');
  for (const m of s.matchAll(/<meta\s[^>]*content="(https?:\/\/[^"]+)"/g)) checkUrl(m[1], f, 'meta');
  for (const m of s.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const u of m[1].matchAll(/"(https?:\/\/[^"]+)"/g)) checkUrl(u[1], f, 'JSON-LD');
  }
  // Inline styles and scripts
  for (const m of s.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) checkUrl(m[1], f, 'inline url()');
  ok(/<meta http-equiv="content-security-policy"/i.test(s), `${f}: CSP meta tag`);
  ok(/Demo project/.test(s), `${f}: says "Demo project"`);
  ok(!/\saction="[^"]*api\//.test(s) && !/["'`]\/api\//.test(s), `${f}: no form or script targets /api/`);
}

for (const f of files.filter((x) => x.endsWith('.css'))) {
  for (const m of readFileSync(join(OUT, f), 'utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) checkUrl(m[1], f, 'url()');
}

for (const f of files.filter((x) => x.endsWith('.js'))) {
  const s = readFileSync(join(OUT, f), 'utf8');
  // Chunk imports, dynamic imports and new URL('./x', import.meta.url) (workers)
  for (const m of s.matchAll(/["'`](\.{1,2}\/[\w./-]+\.(?:js|mjs|css|woff2|wasm|webp|png|jpg))["'`]/g)) checkUrl(m[1], f, 'JS reference');
  // Absolute paths into the site's asset folders must carry the base, unless they are a call argument
  // (withBase(`/generated/…`) adds it at runtime)
  for (const m of s.matchAll(/(.)["'`](\/(?:_astro|generated)\/[^"'`]*)["'`]/g)) ok(m[1] === '(', `${f}: unprefixed asset path ${m[2]}`);
  for (const m of s.matchAll(/["'`](\/[\w-]*\/?)(?:_astro|generated)\/[\w.-]+["'`]/g)) ok(m[1] === BASE, `${f}: asset path with wrong prefix ${m[0]}`);
  ok(!/["'`]\/?api\/(?:inquiry|contact)["'`]/.test(s), `${f}: no reference to the API endpoints`);
}

for (const f of files.filter((x) => x.endsWith('.xml'))) {
  for (const m of readFileSync(join(OUT, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) checkUrl(m[1], f, 'sitemap');
}

// Site-level expectations
ok(fileSet.has('.nojekyll'), '.nojekyll exists (GitHub Pages must not run Jekyll, which drops _astro/)');
ok(fileSet.has('404.html'), '404.html exists for GitHub Pages');
ok(fileSet.has('index.html'), 'index.html exists');
ok(!files.some((f) => f.startsWith('api/')), 'No /api/ output in the static build');
ok(!files.some((f) => f.startsWith('render/')), 'No /render/ utility page in the static build');
ok(!files.some((f) => f.endsWith('.mjs') && f.includes('server')), 'No server bundle in the static build');
const robots = fileSet.has('robots.txt') ? readFileSync(join(OUT, 'robots.txt'), 'utf8') : '';
ok(robots.includes(`Sitemap: ${ORIGIN_BASE}sitemap-index.xml`), 'robots.txt points to the sitemap under the sub-path');
const sitemap = fileSet.has('sitemap-0.xml') ? readFileSync(join(OUT, 'sitemap-0.xml'), 'utf8') : '';
ok(!/inquiry-sent|\/404|legal-notice|privacy/.test(sitemap), 'Sitemap leaves out utility pages');
ok((sitemap.match(/<loc>/g) ?? []).length >= 12, 'Sitemap lists the content pages');

// 404 page: assets and links must be absolute (it is served for any missing URL, at any depth)
const notFound = fileSet.has('404.html') ? readFileSync(join(OUT, '404.html'), 'utf8') : '';
const relativeIn404 = [...notFound.matchAll(/\s(?:href|src)="(?!https?:|\/|#|mailto:|tel:)([^"]+)"/g)].map((m) => m[1]);
ok(relativeIn404.length === 0, `404.html uses no relative URLs (${relativeIn404.join(', ')})`);
ok(!/rel="canonical"/.test(notFound), '404.html has no canonical link');

// three.js only on the configurator: follow each page's scripts through their static imports (dynamic
// import() chunks load on demand) and make sure none of them contains three.js (which registers __THREE__)
const staticGraph = (start) => {
  const seen = new Set();
  const todo = [start];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f) || !fileSet.has(f)) continue;
    seen.add(f);
    const s = readFileSync(join(OUT, f), 'utf8');
    for (const m of s.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) todo.push(new URL(m[1], `https://x/${f}`).pathname.slice(1));
  }
  return seen;
};
const pageScripts = (s) =>
  [...s.matchAll(/<(?:script|link)\s[^>]*(?:src|href)="([^"]+\.js)"/g), ...s.matchAll(/\s(?:component|renderer)-url="([^"]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((u) => u.startsWith(BASE))
    .map((u) => u.slice(BASE.length));
for (const f of html) {
  const loaded = new Set(pageScripts(readFileSync(join(OUT, f), 'utf8')).flatMap((u) => [...staticGraph(u)]));
  const has3d = [...loaded].some((js) => readFileSync(join(OUT, js), 'utf8').includes('__THREE__'));
  // The configurator's island loads the 3D viewer with a dynamic import, after the page is interactive
  ok(!has3d, `${f}: no three.js among the scripts loaded with the page (${loaded.size} files)`);
  if (f === 'configurator/index.html') ok(loaded.size > 2, 'Configurator page loads its island');
}
ok(files.some((f) => f.endsWith('.js') && readFileSync(join(OUT, f), 'utf8').includes('__THREE__')), 'three.js is in the build (as a lazy chunk)');

// No local paths or Windows separators leaked into the output
for (const f of files.filter((x) => /\.(html|js|css|xml|txt)$/.test(x))) {
  const s = readFileSync(join(OUT, f), 'utf8');
  ok(!/[A-Z]:\\\\?(?:Users|Claude)|\/Users\/|Program Files/.test(s), `${f}: no local file paths`);
}

report();

function report() {
  console.log(`\nPages build: ${html.length} HTML files, ${files.length} files, ${checks} checks`);
  if (failures.length) {
    console.error(`${failures.length} FAILED:\n` + [...new Set(failures)].map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log('All passed.');
  process.exit(0);
}

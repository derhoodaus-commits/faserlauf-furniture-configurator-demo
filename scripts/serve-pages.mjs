// Serves dist-pages/ the way GitHub Pages does, to check the static build locally:
// the site lives under its sub-path, "dir" redirects to "dir/", missing paths get 404.html with status 404,
// and no extra headers (no CSP header: only the <meta> tag Astro writes into each page).
// Usage: npm run preview:pages   (after npm run build:pages; PORT defaults to 4322)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist-pages');
const PORT = Number(process.env.PORT) || 4322;
if (!existsSync(join(OUT, 'index.html'))) {
  console.error('dist-pages/ not found. Run "npm run build:pages" first.');
  process.exit(1);
}
// The base the site was built with, read from the favicon link of the home page
const BASE = /<link rel="icon" href="([^"]*)favicon\.svg"/.exec(readFileSync(join(OUT, 'index.html'), 'utf8'))?.[1] ?? '/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function file(p) {
  const s = await stat(p).catch(() => null);
  return s?.isFile() ? p : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = '';
  }
  const send = async (status, p) => {
    res.writeHead(status, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(p));
  };
  const notFound = () => send(404, join(OUT, '404.html'));
  if (url.pathname === BASE.slice(0, -1)) {
    res.writeHead(301, { Location: BASE });
    return res.end();
  }
  if (!path.startsWith(BASE) || path.includes('\0')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end(`Not found. The site is at ${BASE}`);
  }
  const target = normalize(join(OUT, path.slice(BASE.length)));
  if (target !== OUT && !target.startsWith(OUT + sep)) return notFound();
  if (path.endsWith('/')) {
    const index = await file(join(target, 'index.html'));
    return index ? send(200, index) : notFound();
  }
  const f = await file(target);
  if (f) return send(200, f);
  if (await file(join(target, 'index.html'))) {
    res.writeHead(301, { Location: url.pathname + '/' + url.search });
    return res.end();
  }
  return notFound();
}).listen(PORT, '127.0.0.1', () => console.log(`GitHub Pages preview: http://localhost:${PORT}${BASE}`));

// Production server: serves the prerendered site from dist/client (gzip/brotli, cache headers,
// security headers, custom 404) and hands /api/* to Astro's server endpoints.
// Usage: npm start  (builds first)  or  node server.mjs  (after npm run build)
//
// Environment: PORT (default 3002), HOST (default 127.0.0.1; use 0.0.0.0 behind a reverse proxy).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// Optional .env (see .env.example), read with Node's built-in loader; real environment variables win
if (existsSync(join(ROOT, '.env'))) {
  const before = { ...process.env };
  process.loadEnvFile(join(ROOT, '.env'));
  Object.assign(process.env, before);
}
const CLIENT = resolve(ROOT, 'dist', 'client');
const ENTRY = resolve(ROOT, 'dist', 'server', 'entry.mjs');
const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '127.0.0.1';

if (!existsSync(CLIENT) || !existsSync(ENTRY)) {
  console.error('Build output not found. Run "npm run build" first (or "npm start", which builds).');
  process.exit(1);
}
const { handler: astroHandler } = await import(new URL(`file:///${ENTRY.replace(/\\/g, '/')}`).href);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  // script-src/style-src come per page from Astro's CSP <meta> (with hashes); these directives can't go in a meta tag
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

/** Small in-memory cache of compressed files (the site is ~2 MB; fine for a demo server). */
const cache = new Map();

async function loadFile(file) {
  const s = await stat(file).catch(() => null);
  if (!s || !s.isFile()) return null;
  const hit = cache.get(file);
  if (hit && hit.mtime === s.mtimeMs) return hit;
  const body = await readFile(file);
  const ext = extname(file).toLowerCase();
  const entry = { body, mtime: s.mtimeMs, ext, gz: null, br: null };
  if (COMPRESSIBLE.has(ext) && body.length > 1024) {
    entry.gz = gzipSync(body, { level: 9 });
    entry.br = brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_SIZE_HINT]: body.length } });
  }
  cache.set(file, entry);
  return entry;
}

function cacheControl(urlPath, ext) {
  if (urlPath.startsWith('/_astro/')) return 'public, max-age=31536000, immutable';
  if (urlPath.startsWith('/generated/')) return 'public, max-age=604800';
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=3600';
}

/** Maps a URL path to a file in dist/client (clean URLs: /about/ → /about/index.html). */
function resolvePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (p.includes('\0')) return null;
  const target = normalize(join(CLIENT, p));
  if (target !== CLIENT && !target.startsWith(CLIENT + sep)) return null; // path traversal
  if (p.endsWith('/')) return join(target, 'index.html');
  return target;
}

async function send(req, res, entry, status, urlPath) {
  const accept = String(req.headers['accept-encoding'] || '');
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[entry.ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(urlPath, entry.ext),
    Vary: 'Accept-Encoding',
  };
  let body = entry.body;
  if (entry.br && /\bbr\b/.test(accept)) {
    body = entry.br;
    headers['Content-Encoding'] = 'br';
  } else if (entry.gz && /\bgzip\b/.test(accept)) {
    body = entry.gz;
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
      res.setHeader('Cache-Control', 'no-store');
      return astroHandler(req, res, () => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Not found' }));
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
      return res.end('Method not allowed');
    }
    const file = resolvePath(url.pathname);
    let entry = file ? await loadFile(file) : null;
    // /about → /about/ (canonical trailing slash)
    if (!entry && file && !url.pathname.endsWith('/') && !extname(url.pathname)) {
      const dirIndex = await loadFile(join(file, 'index.html'));
      if (dirIndex) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search, ...SECURITY_HEADERS });
        return res.end();
      }
    }
    if (entry) return send(req, res, entry, 200, url.pathname);
    entry = await loadFile(join(CLIENT, '404.html'));
    if (entry) return send(req, res, entry, 404, '/404.html');
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Faserlauf (demo) running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
});

// robots.txt with the sitemap URL of the current deployment (site + base: root locally, sub-path on GitHub Pages).
import type { APIRoute } from 'astro';
import { absoluteUrl, STATIC_DEMO, withBase } from '../lib/paths.ts';

export const GET: APIRoute = () => {
  const lines = ['User-agent: *', `Allow: ${withBase('/')}`];
  // /render/ and /api/ only exist in the server build
  if (!STATIC_DEMO) lines.push(`Disallow: ${withBase('/render/')}`, `Disallow: ${withBase('/api/')}`);
  lines.push('', `Sitemap: ${absoluteUrl('/sitemap-index.xml')}`, '');
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

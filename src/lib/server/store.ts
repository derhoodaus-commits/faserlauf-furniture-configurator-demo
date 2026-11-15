// Server-only helpers for the form endpoints: storage, rate limiting, body parsing.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Where requests are stored. In production you would send an email or create a CRM entry instead (see README). */
export const DATA_DIR = process.env['DATA_DIR'] || join(process.cwd(), 'data');

export async function store(kind: 'inquiries' | 'messages', ref: string, record: unknown, image?: Buffer): Promise<void> {
  const dir = join(DATA_DIR, kind);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${ref}.json`), JSON.stringify(record, null, 2), 'utf8');
  if (image) await writeFile(join(dir, `${ref}.jpg`), image);
}

const hits = new Map<string, number[]>();
export const RATE = { max: 10, windowMs: 10 * 60 * 1000 };

/** Simple in-memory rate limit per client address. */
export function rateLimited(ip: string, now = Date.now()): boolean {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE.max;
}

export const MAX_BODY = 2_500_000;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Reads a JSON or urlencoded body with a size limit. */
export async function readBody(request: Request): Promise<{ data: Record<string, unknown>; form: boolean }> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, 'Request too large.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large.');
  if (type.startsWith('application/json')) {
    try {
      const data = JSON.parse(text) as unknown;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
      return { data: data as Record<string, unknown>, form: false };
    } catch {
      throw new HttpError(400, 'Invalid JSON.');
    }
  }
  if (type.startsWith('application/x-www-form-urlencoded')) {
    return { data: Object.fromEntries(new URLSearchParams(text)), form: true };
  }
  throw new HttpError(415, 'Please send JSON or a form.');
}

/** Decodes a data:image/jpeg|png;base64 URL and checks the magic bytes. */
export function decodeImage(v: unknown): Buffer | null {
  if (typeof v !== 'string') return null;
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return null;
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > 1_500_000 || buf.length < 100) return null;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return isJpeg || isPng ? buf : null;
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** 303 redirect with a relative Location (works behind proxies, no host header trust needed). */
export const seeOther = (location: string) => new Response(null, { status: 303, headers: { Location: location } });

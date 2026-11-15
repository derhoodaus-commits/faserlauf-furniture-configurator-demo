import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../../src/lib/config.ts';
import { calculatePrice } from '../../src/lib/pricing.ts';
import { isBerlinPostcode, makeRef, readContact, REF_PATTERN, validateContact } from '../../src/lib/inquiry.ts';

const dir = mkdtempSync(join(tmpdir(), 'faserlauf-test-'));
process.env['DATA_DIR'] = dir;
// Imported after DATA_DIR is set
const { POST: inquiry } = await import('../../src/server/api/inquiry.ts');
const { POST: contact } = await import('../../src/server/api/contact.ts');

let ipCounter = 0;
const call = (handler: typeof inquiry, body: string, type = 'application/json') =>
  handler({
    request: new Request('http://localhost/api/x', { method: 'POST', headers: { 'Content-Type': type }, body }),
    clientAddress: `10.0.0.${++ipCounter % 250}`,
  } as never) as Promise<Response>;

const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
const person = { name: 'Alex Example', email: 'alex@example.com', phone: '+49 30 1234567', postcode: '12059', message: '', consent: true };

beforeAll(() => {});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('contact field validation (shared by browser and server)', () => {
  it('accepts a complete quote request', () => {
    expect(validateContact(readContact(person), { kind: 'quote', needsPostcode: true })).toEqual({});
  });
  it('explains every problem', () => {
    const e = validateContact(readContact({ name: 'A', email: 'nope', phone: 'call me', postcode: '1234', consent: false }), { kind: 'quote', needsPostcode: true });
    expect(Object.keys(e).sort()).toEqual(['consent', 'email', 'name', 'phone', 'postcode']);
    expect(e.postcode).toMatch(/five digits/);
  });
  it('needs a message for contact requests but not for quotes', () => {
    expect(validateContact(readContact({ ...person, message: 'short' }), { kind: 'contact' }).message).toBeDefined();
    expect(validateContact(readContact({ ...person, message: '' }), { kind: 'quote' }).message).toBeUndefined();
  });
  it('postcode is optional for pickup', () => {
    expect(validateContact(readContact({ ...person, postcode: '' }), { kind: 'quote', needsPostcode: false })).toEqual({});
  });
  it('makes unambiguous references and recognises Berlin postcodes', () => {
    for (let i = 0; i < 100; i++) expect(makeRef()).toMatch(REF_PATTERN);
    expect(isBerlinPostcode('12059')).toBe(true);
    expect(isBerlinPostcode('80331')).toBe(false);
  });
  it('trims and limits input', () => {
    expect(readContact({ name: '  Alex  ', message: 'x'.repeat(5000) }).name).toBe('Alex');
    expect(readContact({ message: 'x'.repeat(5000) }).message.length).toBe(3000);
  });
});

describe('POST /api/inquiry', () => {
  it('stores a valid request with the server-calculated price and the image', async () => {
    const config = defaultConfig('desk');
    const res = await call(inquiry, JSON.stringify({ ...person, config, image: JPEG, price: 1 }));
    expect(res.status).toBe(201);
    const { ref, total } = (await res.json()) as { ref: string; total: number };
    expect(ref).toMatch(REF_PATTERN);
    expect(total).toBe(calculatePrice(config).total);
    const saved = JSON.parse(readFileSync(join(dir, 'inquiries', `${ref}.json`), 'utf8'));
    expect(saved.config).toEqual(config);
    expect(saved.price.total).toBe(calculatePrice(config).total);
    expect(saved.image).toBe(`${ref}.jpg`);
    expect(readdirSync(join(dir, 'inquiries'))).toContain(`${ref}.jpg`);
  });

  it('rejects configurations that cannot be built', async () => {
    const config = { ...defaultConfig('dining-table'), leg: 'trestle', lengthCm: 260, thicknessMm: 20 };
    const res = await call(inquiry, JSON.stringify({ ...person, config }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toMatch(/can't be built/);
  });

  it('normalizes tampered values instead of trusting them', async () => {
    const res = await call(inquiry, JSON.stringify({ ...person, config: { ...defaultConfig('coffee-table'), lengthCm: 99999, species: 'gold' } }));
    expect(res.status).toBe(201);
    const { ref } = (await res.json()) as { ref: string };
    const saved = JSON.parse(readFileSync(join(dir, 'inquiries', `${ref}.json`), 'utf8'));
    expect(saved.config.lengthCm).toBe(160);
    expect(saved.config.species).toBe('walnut');
    expect(saved.corrections.length).toBe(2);
  });

  it('returns field errors', async () => {
    const res = await call(inquiry, JSON.stringify({ ...person, email: 'x', config: defaultConfig() }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { errors: Record<string, string> }).errors.email).toBeDefined();
  });

  it('ignores invalid images but keeps the request', async () => {
    const res = await call(inquiry, JSON.stringify({ ...person, config: defaultConfig(), image: 'data:image/png;base64,AAAA' }));
    expect(res.status).toBe(201);
  });

  it('answers bots (honeypot) like a success without storing', async () => {
    const before = readdirSync(join(dir, 'inquiries')).length;
    const res = await call(inquiry, JSON.stringify({ ...person, website: 'http://spam', config: defaultConfig() }));
    expect(res.status).toBe(201);
    expect(readdirSync(join(dir, 'inquiries')).length).toBe(before);
  });

  it('rejects broken JSON, wrong content types and missing configurations', async () => {
    expect((await call(inquiry, '{oops')).status).toBe(400);
    expect((await call(inquiry, 'a=b', 'text/plain')).status).toBe(415);
    expect((await call(inquiry, JSON.stringify(person))).status).toBe(422);
  });

  it('rejects oversized requests', async () => {
    expect((await call(inquiry, JSON.stringify({ ...person, config: defaultConfig(), message: 'x'.repeat(2_600_000) }))).status).toBe(413);
  });
});

describe('POST /api/contact', () => {
  it('accepts JSON and stores the message', async () => {
    const res = await call(contact, JSON.stringify({ ...person, message: 'Can you build a round table?', topic: 'custom' }));
    expect(res.status).toBe(201);
    const { ref } = (await res.json()) as { ref: string };
    const saved = JSON.parse(readFileSync(join(dir, 'messages', `${ref}.json`), 'utf8'));
    expect(saved.topic).toBe('custom');
  });
  it('works as a classic form post without JavaScript (303 to the confirmation page)', async () => {
    const body = new URLSearchParams({ name: 'Alex Example', email: 'alex@example.com', message: 'Hello workshop, a question.', consent: 'on', topic: 'visit' }).toString();
    const res = await call(contact, body, 'application/x-www-form-urlencoded');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^\/inquiry-sent\/\?ref=FL-[A-Z0-9]{6}&type=contact$/);
  });
  it('sends invalid classic posts back to the form', async () => {
    const res = await call(contact, 'name=A', 'application/x-www-form-urlencoded');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/contact/?invalid=1#form');
  });
});

// POST /api/inquiry – quote request from the configurator (configuration + snapshot + contact details).
// Injected as a route by astro.config.mjs in server mode only (the static GitHub Pages build has no endpoints).
import type { APIRoute } from 'astro';
import { normalizeConfig } from '../../lib/config.ts';
import { validate, hasErrors } from '../../lib/validation.ts';
import { calculatePrice } from '../../lib/pricing.ts';
import { describeConfig } from '../../lib/describe.ts';
import { makeRef, readContact, validateContact } from '../../lib/inquiry.ts';
import { HttpError, decodeImage, json, rateLimited, readBody, store } from '../../lib/server/store.ts';
import type { Config } from '../../lib/types.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    if (rateLimited(clientAddress ?? 'unknown')) return json(429, { message: 'Too many requests. Please wait a few minutes.' });
    const { data } = await readBody(request);
    if (typeof data['config'] !== 'object' || data['config'] === null) return json(422, { message: 'The configuration is missing.' });
    const { config, corrections } = normalizeConfig(data['config'] as Partial<Config>);
    const issues = validate(config);
    if (hasErrors(issues)) {
      const first = issues.find((i) => i.level === 'error');
      return json(422, { message: `This configuration can't be built: ${first?.message ?? ''}` });
    }
    const contact = readContact(data);
    const errors = validateContact(contact, { kind: 'quote', needsPostcode: config.delivery !== 'pickup' });
    if (Object.keys(errors).length) return json(422, { message: 'Please check the marked fields.', errors });

    const ref = makeRef();
    // Honeypot filled: answer like a success so bots learn nothing, but store nothing
    const website = data['website'];
    if (typeof website === 'string' && website.trim() !== '') return json(201, { ref });

    const price = calculatePrice(config); // recalculated here: the browser's price is never trusted
    const image = decodeImage(data['image']);
    const link = typeof data['link'] === 'string' && data['link'].length < 2000 ? data['link'] : null;
    // PRODUCTION: send the request to the workshop here (SMTP, e.g. nodemailer, or a CRM API) in addition
    // to / instead of storing it as a file.
    await store(
      'inquiries',
      ref,
      {
        ref,
        receivedAt: new Date().toISOString(),
        contact,
        config,
        description: describeConfig(config),
        corrections,
        notes: issues.map((i) => `${i.level}: ${i.message}`),
        price: { net: price.net, vat: price.vat, total: price.total, lines: price.lines },
        link,
        image: image ? `${ref}.jpg` : null,
      },
      image ?? undefined,
    );
    return json(201, { ref, total: price.total });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { message: e.message });
    console.error(e);
    return json(500, { message: 'Something went wrong on our side. Please try again.' });
  }
};

export const ALL: APIRoute = () => json(405, { message: 'Use POST.' });

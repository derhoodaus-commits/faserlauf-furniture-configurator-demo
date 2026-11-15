// POST /api/contact – contact form (JSON from the enhanced form, or a classic form POST without JavaScript).
// Injected as a route by astro.config.mjs in server mode only (the static GitHub Pages build has no endpoints).
import type { APIRoute } from 'astro';
import { makeRef, readContact, validateContact } from '../../lib/inquiry.ts';
import { HttpError, json, rateLimited, readBody, seeOther, store } from '../../lib/server/store.ts';
import { withBase } from '../../lib/paths.ts';

export const prerender = false;
const TOPICS = ['general', 'custom', 'visit', 'existing', 'other'] as const;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let isForm = false;
  try {
    if (rateLimited(clientAddress ?? 'unknown')) return json(429, { message: 'Too many requests. Please wait a few minutes.' });
    const { data, form } = await readBody(request);
    isForm = form;
    const contact = readContact(data);
    const rawTopic = data['topic'];
    const topic = typeof rawTopic === 'string' && (TOPICS as readonly string[]).includes(rawTopic) ? rawTopic : 'general';
    const errors = validateContact(contact, { kind: 'contact' });
    if (Object.keys(errors).length) {
      if (form) return seeOther(withBase('/contact/?invalid=1#form'));
      return json(422, { message: 'Please check the marked fields.', errors });
    }
    const ref = makeRef();
    const website = data['website'];
    const bot = typeof website === 'string' && website.trim() !== '';
    if (!bot) await store('messages', ref, { ref, receivedAt: new Date().toISOString(), topic, contact });
    if (form) return seeOther(withBase(`/inquiry-sent/?ref=${ref}&type=contact`));
    return json(201, { ref });
  } catch (e) {
    if (e instanceof HttpError) {
      if (isForm) return seeOther(withBase('/contact/?invalid=1#form'));
      return json(e.status, { message: e.message });
    }
    console.error(e);
    return json(500, { message: 'Something went wrong on our side. Please try again.' });
  }
};

export const ALL: APIRoute = () => json(405, { message: 'Use POST.' });

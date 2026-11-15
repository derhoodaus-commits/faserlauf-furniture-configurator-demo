// Contact and quote-request validation, shared by the browser and the server endpoints.

export interface ContactFields {
  name: string;
  email: string;
  phone: string;
  postcode: string;
  message: string;
  consent: boolean;
}

export type FieldErrors = Partial<Record<keyof ContactFields, string>>;

export const LIMITS = { name: 100, email: 200, phone: 40, message: 3000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\d][\d\s()/-]{5,}$/;
/** German postcodes: 5 digits, 01001–99998. */
const POSTCODE = /^(?!00)\d{5}$/;

export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '';
}

export function readContact(input: Record<string, unknown>): ContactFields {
  return {
    name: cleanText(input['name'], LIMITS.name),
    email: cleanText(input['email'], LIMITS.email),
    phone: cleanText(input['phone'], LIMITS.phone),
    postcode: cleanText(input['postcode'], 10),
    message: cleanText(input['message'], LIMITS.message),
    consent: input['consent'] === true || input['consent'] === 'on' || input['consent'] === 'true',
  };
}

export interface ValidateOptions {
  /** Quote requests with delivery need a postcode; contact messages need a message. */
  kind: 'quote' | 'contact';
  needsPostcode?: boolean;
}

export function validateContact(f: ContactFields, o: ValidateOptions): FieldErrors {
  const e: FieldErrors = {};
  if (f.name.length < 2) e.name = 'Please enter your name.';
  if (!f.email) e.email = 'Please enter your email address so we can send the quote.';
  else if (!EMAIL.test(f.email)) e.email = 'This email address looks incomplete (example: name@example.com).';
  if (f.phone && !PHONE.test(f.phone)) e.phone = 'Please use digits, spaces and + only (example: +49 30 1234567).';
  if (o.needsPostcode && !f.postcode) e.postcode = 'We need the postcode to confirm the delivery price.';
  else if (f.postcode && !POSTCODE.test(f.postcode)) e.postcode = 'German postcodes have five digits (example: 12059).';
  if (o.kind === 'contact' && f.message.length < 10) e.message = 'Please write a short message (at least 10 characters).';
  if (!f.consent) e.consent = 'Please agree so we may use your details to answer you.';
  return e;
}

/** Postcodes 10xxx–14xxx are Berlin (plus a few Brandenburg places, which our flat rate also covers). */
export function isBerlinPostcode(pc: string): boolean {
  return /^1[0-4]\d{3}$/.test(pc);
}

/** FL-XXXXXX references (no ambiguous characters). */
export const REF_PATTERN = /^FL-[A-HJ-NP-Z2-9]{6}$/;

export function makeRef(random: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'FL-';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(random() * chars.length)];
  return s;
}

import { absoluteUrl } from '../lib/paths.ts';

export const SITE = {
  name: 'Faserlauf',
  fullName: 'Faserlauf Möbelwerkstatt',
  tagline: 'Solid wood furniture, made to measure in Berlin',
  /** Home page URL of the deployed site (Astro `site` + `base`). */
  url: absoluteUrl('/'),
  email: 'werkstatt@faserlauf.example',
  /** From the number range the German Federal Network Agency reserves for film and TV: looks real, rings nowhere. */
  phone: '030 23125 682',
  phoneIntl: '+493023125682',
  street: 'Hobelhof 7',
  postcode: '12059',
  city: 'Berlin',
  district: 'Neukölln',
  hours: [
    ['Mon–Fri', '8:00 am – 5:00 pm (workshop)'],
    ['Thursday', 'until 7:00 pm: showroom visits'],
    ['Saturday', '10:00 am – 2:00 pm, by appointment'],
  ] as [string, string][],
  founded: 2009,
};

export const NAV = [
  { href: '/furniture/', label: 'Furniture' },
  { href: '/wood-and-finishes/', label: 'Wood & finishes' },
  { href: '/how-it-works/', label: 'How it works' },
  { href: '/about/', label: 'Workshop' },
  { href: '/faq/', label: 'FAQ' },
  { href: '/contact/', label: 'Contact' },
];

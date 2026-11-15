// PDF quote, generated in the browser with jsPDF (loaded only when the button is clicked).

import { PRODUCTS } from '../data/products.ts';
import { calculatePrice, formatEuro } from '../lib/pricing.ts';
import { buildModel, cutList } from '../lib/model.ts';
import { describeConfig, specRows } from '../lib/describe.ts';
import { validate } from '../lib/validation.ts';
import type { Config } from '../lib/types.ts';

const INK: [number, number, number] = [34, 26, 20];
const MUTED: [number, number, number] = [106, 92, 80];
const RUST: [number, number, number] = [156, 63, 34];
const LINE: [number, number, number] = [214, 201, 182];

export interface PdfInput {
  config: Config;
  /** JPEG/PNG data URL of the 3D view. */
  image: string | null;
  imageAspect: number;
  link: string;
}

export function quoteNumber(date = new Date()): string {
  const d = date.toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.floor(Math.random() * 9000 + 1000);
  return `Q-${d}-${r}`;
}

export async function createQuotePdf({ config, image, imageAspect, link }: PdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const price = calculatePrice(config);
  const p = PRODUCTS[config.product];
  const W = 210;
  const M = 18;
  const now = new Date();
  const qn = quoteNumber(now);
  doc.setProperties({ title: `Faserlauf quote ${qn} (demo)`, subject: describeConfig(config), creator: 'Faserlauf configurator (demo project)' });

  // ---- Header
  doc.setFillColor(244, 238, 228);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(...INK);
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.text('Faserlauf', M, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text('Möbelwerkstatt · Hobelhof 7 · 12059 Berlin-Neukölln · werkstatt@faserlauf.example', M, 21);
  doc.setTextColor(...RUST);
  doc.setFont('helvetica', 'bold');
  doc.text('DEMO PROJECT: fictional company, invented prices. Not a binding offer.', M, 26);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Quote for your ${p.kind.toLowerCase()}`, M, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Quote no. ${qn}  ·  ${dateStr}  ·  valid for 30 days`, M, 48);

  let y = 54;
  // ---- Image
  if (image) {
    const maxW = W - 2 * M;
    const ih = Math.min(88, maxW / imageAspect);
    const iw = Math.min(maxW, ih * imageAspect);
    const ix = M + (maxW - iw) / 2;
    doc.addImage(image, image.startsWith('data:image/png') ? 'PNG' : 'JPEG', ix, y, iw, ih, undefined, 'FAST');
    doc.setDrawColor(...LINE);
    doc.roundedRect(ix, y, iw, ih, 2, 2, 'S');
    y += ih + 8;
  }

  // ---- Specification (left) and price (right)
  const colW = (W - 2 * M - 8) / 2;
  const sectionTitle = (t: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(t, x, yy);
    doc.setDrawColor(...LINE);
    doc.line(x, yy + 1.8, x + colW, yy + 1.8);
  };
  sectionTitle('Specification', M, y);
  let ly = y + 7;
  doc.setFontSize(8.8);
  for (const [k, v] of specRows(config)) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(k, M, ly);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(v, colW - 38) as string[];
    doc.text(lines, M + 38, ly);
    ly += 5.2 * lines.length;
  }
  doc.setTextColor(...MUTED);
  doc.text('Weight (approx.)', M, ly);
  doc.setTextColor(...INK);
  doc.text(`${Math.round(price.weightKg)} kg`, M + 38, ly);
  ly += 5.2;
  doc.setTextColor(...MUTED);
  doc.text('Lead time', M, ly);
  doc.setTextColor(...INK);
  doc.text(`${p.leadWeeks[0]}–${p.leadWeeks[1]} weeks after the deposit`, M + 38, ly);
  ly += 5.2;

  const rx = M + colW + 8;
  sectionTitle('Price', rx, y);
  let ry = y + 7;
  const money = (label: string, detail: string | null, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 8.8);
    doc.setTextColor(...INK);
    doc.text(label, rx, ry);
    doc.text(value, rx + colW, ry, { align: 'right' });
    if (detail) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...MUTED);
      doc.text(detail, rx, ry + 3.6);
      ry += 3.6;
    }
    ry += 5.6;
  };
  for (const l of price.lines) money(l.label, l.detail, formatEuro(l.net, true));
  doc.setDrawColor(...LINE);
  doc.line(rx, ry - 3, rx + colW, ry - 3);
  money('Net', null, formatEuro(price.net, true));
  money('VAT 19 %', null, formatEuro(price.vat, true));
  doc.setFillColor(243, 223, 211);
  doc.rect(rx - 2, ry - 4.6, colW + 4, 7.6, 'F');
  money('Total incl. VAT', null, formatEuro(price.total, true), true);
  y = Math.max(ly, ry) + 6;

  // ---- Notes from the structural check
  const issues = validate(config).filter((i) => i.level !== 'info');
  if (issues.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...RUST);
    doc.text('Notes from the configuration check', M, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    doc.setTextColor(...INK);
    for (const i of issues) {
      const lines = doc.splitTextToSize(`• ${i.message}${i.fix ? ' ' + i.fix : ''}`, W - 2 * M) as string[];
      doc.text(lines, M, y);
      y += 4.2 * lines.length + 1;
    }
    y += 3;
  }

  // ---- Cut list
  const rows = cutList(buildModel(config).parts);
  if (y > 240) {
    doc.addPage();
    y = 22;
  }
  const cols = [M, M + 92, M + 108, M + 132, W - M];
  const tableHead = (title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(title, M, y);
    doc.setDrawColor(...LINE);
    doc.line(M, y + 1.8, W - M, y + 1.8);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Part', cols[0]!, y);
    doc.text('Qty', cols[1]!, y);
    doc.text('Length', cols[2]!, y);
    doc.text('Width', cols[3]!, y);
    doc.text('Thickness', cols[4]!, y, { align: 'right' });
    y += 5;
    doc.setTextColor(...INK);
    doc.setFontSize(8.6);
  };
  tableHead('Cut list (finished sizes, mm)');
  rows.forEach((r, i) => {
    if (y > 274) {
      doc.addPage();
      y = 22;
      tableHead('Cut list (continued)');
    }
    if (i % 2 === 0) {
      doc.setFillColor(248, 244, 237);
      doc.rect(M - 1, y - 3.6, W - 2 * M + 2, 5.2, 'F');
    }
    doc.text(r.name, cols[0]!, y);
    doc.text(String(r.qty), cols[1]!, y);
    doc.text(String(Math.round(r.length)), cols[2]!, y);
    doc.text(String(Math.round(r.width)), cols[3]!, y);
    doc.text(String(Math.round(r.thickness)), cols[4]!, y, { align: 'right' });
    y += 5.2;
  });

  // ---- Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.4);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    const terms = 'Terms (demo): 30 % deposit on order, balance on delivery. Prices incl. 19 % German VAT. Delivery within Germany only.';
    doc.text(terms, M, 284);
    doc.setTextColor(...RUST);
    doc.textWithLink('Open this configuration in the 3D configurator (link)', M, 288, { url: link });
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${pages}`, W - M, 288, { align: 'right' });
  }
  return doc.output('blob');
}

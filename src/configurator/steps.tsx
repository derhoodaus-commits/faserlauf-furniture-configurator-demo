import { useMemo } from 'react';
import { DELIVERY, EDGE_PROFILES, LEG_STYLES, PRODUCTS } from '../data/products.ts';
import { SPECIES } from '../data/species.ts';
import { FINISHES, FINISH_IDS } from '../data/finishes.ts';
import { calculatePrice, formatEuro, type PriceBreakdown } from '../lib/pricing.ts';
import { cutList, buildModel } from '../lib/model.ts';
import { specRows } from '../lib/describe.ts';
import { withBase } from '../lib/paths.ts';
import type { Config, DeliveryId, Issue } from '../lib/types.ts';
import { DimensionInput, IssueText, RadioCards, Stepper, priceDelta } from './controls.tsx';
import { EdgeIcon, LegIcon } from './Icons.tsx';

type Patch = (p: Partial<Config>) => void;

const issueFor = (issues: Issue[], field: keyof Config, levels: Issue['level'][] = ['error', 'warning', 'info']) =>
  issues.find((i) => i.field === field && levels.includes(i.level));

export function SizeStep({ config, patch, issues }: { config: Config; patch: Patch; issues: Issue[] }) {
  const p = PRODUCTS[config.product];
  const base = calculatePrice(config).total;
  return (
    <div className="step-body">
      <DimensionInput label={p.labels.length} unit="cm" spec={p.length} value={config.lengthCm} onChange={(v) => patch({ lengthCm: v })} issue={issueFor(issues, 'lengthCm')} />
      <DimensionInput label={p.labels.width} unit="cm" spec={p.width} value={config.widthCm} onChange={(v) => patch({ widthCm: v })} issue={issueFor(issues, 'widthCm')} />
      <DimensionInput label={p.labels.height} unit="cm" spec={p.height} value={config.heightCm} onChange={(v) => patch({ heightCm: v })} issue={issueFor(issues, 'heightCm')} />
      <RadioCards
        legend={p.labels.thickness}
        name="thickness"
        compact
        columns={4}
        hint="Standard planed board thicknesses. Thicker boards span further without sagging."
        value={config.thicknessMm}
        onChange={(v) => patch({ thicknessMm: v })}
        issue={issueFor(issues, 'thicknessMm')}
        options={p.thicknesses.map((t) => ({
          value: t,
          label: `${t} mm`,
          aside: <span className="delta">{priceDelta(calculatePrice({ ...config, thicknessMm: t }).total - base)}</span>,
        }))}
      />
    </div>
  );
}

export function BuildStep({ config, patch, issues }: { config: Config; patch: Patch; issues: Issue[] }) {
  const p = PRODUCTS[config.product];
  const base = calculatePrice(config).total;
  return (
    <div className="step-body">
      <RadioCards
        legend="Base"
        name="legs"
        value={config.leg}
        onChange={(v) => patch({ leg: v })}
        issue={issueFor(issues, 'leg')}
        columns={p.legs.length === 2 ? 2 : 3}
        options={p.legs.map((l) => ({
          value: l,
          label: LEG_STYLES[l].name,
          description: LEG_STYLES[l].description,
          media: <LegIcon id={l} />,
          aside: <span className="delta">{priceDelta(calculatePrice({ ...config, leg: l }).total - base)}</span>,
        }))}
      />
      <RadioCards
        legend="Edge profile"
        name="edge"
        value={config.edge}
        onChange={(v) => patch({ edge: v })}
        issue={issueFor(issues, 'edge')}
        columns={2}
        options={p.edges.map((e) => ({
          value: e,
          label: EDGE_PROFILES[e].name,
          description: EDGE_PROFILES[e].description,
          media: <EdgeIcon id={e} />,
          aside: <span className="delta">{priceDelta(calculatePrice({ ...config, edge: e }).total - base)}</span>,
        }))}
      />
      {p.shelves && p.shelves.max > 1 ? (
        <Stepper label={p.shelves.label} hint={p.shelves.hint} value={config.shelves} min={p.shelves.min} max={p.shelves.max} onChange={(v) => patch({ shelves: v })} issue={issueFor(issues, 'shelves')} />
      ) : null}
      {p.shelves && p.shelves.max === 1 ? (
        <RadioCards
          legend={p.shelves.label}
          name="shelves"
          compact
          columns={2}
          hint={p.shelves.hint}
          value={config.shelves}
          onChange={(v) => patch({ shelves: v })}
          issue={issueFor(issues, 'shelves')}
          options={[0, 1].map((n) => ({
            value: n,
            label: n ? 'With shelf' : 'No shelf',
            aside: <span className="delta">{priceDelta(calculatePrice({ ...config, shelves: n }).total - base)}</span>,
          }))}
        />
      ) : null}
      {p.drawers ? (
        <RadioCards
          legend="Drawers"
          name="drawers"
          compact
          columns={3}
          hint="Dovetailed drawers on wooden runners, in the front apron"
          value={config.drawers}
          onChange={(v) => patch({ drawers: v })}
          issue={issueFor(issues, 'drawers')}
          options={[0, 1, 2].map((n) => ({
            value: n,
            label: n === 0 ? 'None' : n === 1 ? 'One' : 'Two',
            aside: <span className="delta">{priceDelta(calculatePrice({ ...config, drawers: n }).total - base)}</span>,
          }))}
        />
      ) : null}
    </div>
  );
}

export function WoodStep({ config, patch, issues }: { config: Config; patch: Patch; issues: Issue[] }) {
  const p = PRODUCTS[config.product];
  const base = calculatePrice(config).total;
  return (
    <div className="step-body">
      <RadioCards
        legend="Wood"
        name="species"
        value={config.species}
        onChange={(v) => patch({ species: v })}
        columns={1}
        options={p.species.map((s) => ({
          value: s,
          label: SPECIES[s].name,
          description: SPECIES[s].tagline,
          media: <img src={withBase(`/generated/wood/${s}-chip.webp`)} alt="" width={48} height={48} loading="lazy" decoding="async" />,
          aside: <span className="delta">{priceDelta(calculatePrice({ ...config, species: s }).total - base)}</span>,
        }))}
      />
      <RadioCards
        legend="Finish"
        name="finish"
        value={config.finish}
        onChange={(v) => patch({ finish: v })}
        issue={issueFor(issues, 'finish')}
        columns={1}
        options={FINISH_IDS.map((f) => ({
          value: f,
          label: FINISHES[f].name,
          description: FINISHES[f].pros,
          aside: <span className="delta">{priceDelta(calculatePrice({ ...config, finish: f }).total - base)}</span>,
        }))}
      />
      <p className="step-note">
        Wood is a natural material: the grain in the 3D view is generated to look typical for the species, your boards will
        have their own figure. <a href={withBase('/wood-and-finishes/')}>More about the woods</a>
      </p>
    </div>
  );
}

export function PriceTable({ price, compact }: { price: PriceBreakdown; compact?: boolean }) {
  return (
    <table className={`price-table${compact ? ' price-table--compact' : ''}`}>
      <caption className="visually-hidden">Price breakdown</caption>
      <tbody>
        {price.lines.map((l) => (
          <tr key={l.key}>
            <th scope="row">
              {l.label}
              {!compact ? <span className="price-table__detail">{l.detail}</span> : null}
            </th>
            <td>{formatEuro(l.net, true)}</td>
          </tr>
        ))}
        <tr className="price-table__sub">
          <th scope="row">Net</th>
          <td>{formatEuro(price.net, true)}</td>
        </tr>
        <tr>
          <th scope="row">VAT 19 %</th>
          <td>{formatEuro(price.vat, true)}</td>
        </tr>
        <tr className="price-table__total">
          <th scope="row">Total incl. VAT</th>
          <td>{formatEuro(price.total, true)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function SummaryStep({
  config,
  patch,
  issues,
  price,
  actions,
  compare,
}: {
  config: Config;
  patch: Patch;
  issues: Issue[];
  price: PriceBreakdown;
  actions: React.ReactNode;
  compare: React.ReactNode;
}) {
  const rows = useMemo(() => cutList(buildModel(config).parts), [config]);
  const p = PRODUCTS[config.product];
  const base = price.total;
  return (
    <div className="step-body">
      <dl className="spec-list">
        {specRows(config)
          .filter(([k]) => k !== 'Delivery')
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        <div>
          <dt>Weight (approx.)</dt>
          <dd>{Math.round(price.weightKg)} kg</dd>
        </div>
        <div>
          <dt>Lead time (demo)</dt>
          <dd>
            {p.leadWeeks[0]}–{p.leadWeeks[1]} weeks
          </dd>
        </div>
      </dl>
      <RadioCards
        legend="Delivery"
        name="delivery"
        value={config.delivery}
        onChange={(v: DeliveryId) => patch({ delivery: v })}
        columns={1}
        options={(Object.keys(DELIVERY) as DeliveryId[]).map((d) => ({
          value: d,
          label: DELIVERY[d].name,
          description: DELIVERY[d].description,
          aside: <span className="delta">{priceDelta(calculatePrice({ ...config, delivery: d }).total - base)}</span>,
        }))}
      />
      {price.twoPerson ? <p className="step-note">Includes €70 net for a two-person delivery (over 60 kg or longer than 2.20 m).</p> : null}
      <h3 className="step-sub">Price</h3>
      <PriceTable price={price} />
      <p className="demo-note">Demo prices for a fictional workshop. A real quote would be checked by hand.</p>
      {issues.length ? (
        <div className="issue-list" aria-label="Notes on this configuration">
          {issues.map((i) => (
            <IssueText key={i.code} issue={i} />
          ))}
        </div>
      ) : null}
      {actions}
      {compare}
      <details className="cutlist">
        <summary>Cut list ({rows.reduce((s, r) => s + r.qty, 0)} parts)</summary>
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">Cut list, finished sizes in millimeters</caption>
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Qty</th>
                <th scope="col">L × W × T (mm)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.name}-${r.length}-${r.width}`}>
                  <td>{r.name}</td>
                  <td>{r.qty}</td>
                  <td className="num">
                    {Math.round(r.length)} × {Math.round(r.width)} × {Math.round(r.thickness)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Variant A vs B: every attribute and the price, differences highlighted. */
export function CompareTable({ a, b, active, onEdit }: { a: Config; b: Config; active: 'a' | 'b'; onEdit: (s: 'a' | 'b') => void }) {
  const ra = specRows(a);
  const rb = specRows(b);
  const pa = calculatePrice(a);
  const pb = calculatePrice(b);
  return (
    <section className="compare" aria-labelledby="compare-title">
      <h3 className="step-sub" id="compare-title">
        Variant A and B side by side
      </h3>
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Attribute</span>
              </th>
              <th scope="col" className={active === 'a' ? 'is-active' : ''}>
                A
              </th>
              <th scope="col" className={active === 'b' ? 'is-active' : ''}>
                B
              </th>
            </tr>
          </thead>
          <tbody>
            {ra.map(([k, va], i) => {
              const vb = rb[i]?.[1] ?? '';
              const diff = va !== vb || rb[i]?.[0] !== k;
              return (
                <tr key={k + i} className={diff ? 'is-diff' : ''}>
                  <th scope="row">{k}</th>
                  <td>{va}</td>
                  <td>{rb[i]?.[0] === k ? vb : `${rb[i]?.[0] ?? ''}: ${vb}`}</td>
                </tr>
              );
            })}
            <tr className={`compare-table__price${pa.total !== pb.total ? ' is-diff' : ''}`}>
              <th scope="row">Total incl. VAT</th>
              <td>{formatEuro(pa.total)}</td>
              <td>{formatEuro(pb.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="compare__diff">
        {pb.total === pa.total ? 'Both variants cost the same.' : `B is ${formatEuro(Math.abs(pb.total - pa.total))} ${pb.total > pa.total ? 'more' : 'less'} than A.`}
      </p>
      <div className="compare__actions">
        <button type="button" className="btn btn--small btn--ghost" onClick={() => onEdit(active === 'a' ? 'b' : 'a')}>
          Edit variant {active === 'a' ? 'B' : 'A'}
        </button>
      </div>
    </section>
  );
}

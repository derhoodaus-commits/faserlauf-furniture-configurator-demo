import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PRODUCTS, PRODUCT_IDS } from '../data/products.ts';
import { WALLS, WALL_IDS, FLOORS, FLOOR_IDS } from '../data/room.ts';
import { calculatePrice, formatEuro } from '../lib/pricing.ts';
import { validate, hasErrors } from '../lib/validation.ts';
import { describeConfig, fileSlug } from '../lib/describe.ts';
import { withBase } from '../lib/paths.ts';
import type { Config, Issue, ViewState } from '../lib/types.ts';
import { useConfiguratorState } from './state.ts';
import { ProductIcon, UiIcon } from './Icons.tsx';
import { BuildStep, CompareTable, SizeStep, SummaryStep, WoodStep } from './steps.tsx';
import { InquiryDialog } from './InquiryDialog.tsx';
import type { ViewerHandle, ViewPreset } from './viewer/Viewer.tsx';
import type { Quality } from './viewer/materials.ts';
import './configurator.css';

const Viewer = lazy(() => import('./viewer/Viewer.tsx'));

/** Wall colour and floor. Floats over the 3D view on larger screens, sits in the panel on phones. */
function RoomOptions({ view, onChange, variant }: { view: ViewState; onChange: (p: Partial<ViewState>) => void; variant: 'overlay' | 'inline' }) {
  return (
    <div className={`cfg-room cfg-room--${variant}`} role="group" aria-label="Room settings">
      <fieldset>
        <legend>Wall</legend>
        <div className="swatches">
          {WALL_IDS.map((w) => (
            <label key={w} className="swatch" title={WALLS[w].name}>
              <input type="radio" name={`${variant}-wall`} checked={view.wall === w} onChange={() => onChange({ wall: w })} />
              <span className="swatch__dot" data-wall={w} aria-hidden="true" />
              <span className="visually-hidden">{WALLS[w].name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Floor</legend>
        <div className="swatches">
          {FLOOR_IDS.map((f) => (
            <label key={f} className="swatch swatch--floor" title={FLOORS[f].name}>
              <input type="radio" name={`${variant}-floor`} checked={view.floor === f} onChange={() => onChange({ floor: f })} />
              <img src={withBase(`/generated/wood/floor-${f}.webp`)} alt="" width="32" height="32" />
              <span className="visually-hidden">{FLOORS[f].name}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

type Step = 'size' | 'build' | 'wood' | 'summary';
const STEPS: { id: Step; label: string }[] = [
  { id: 'size', label: 'Size' },
  { id: 'build', label: 'Build' },
  { id: 'wood', label: 'Wood' },
  { id: 'summary', label: 'Review' },
];
const FIELD_STEP: Partial<Record<keyof Config, Step>> = {
  lengthCm: 'size',
  widthCm: 'size',
  heightCm: 'size',
  thicknessMm: 'size',
  leg: 'build',
  edge: 'build',
  shelves: 'build',
  drawers: 'build',
  species: 'wood',
  finish: 'wood',
  delivery: 'summary',
};

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function detectQuality(): Quality {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const small = matchMedia('(max-width: 760px)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  return (mem !== undefined && mem <= 4) || small || coarse ? 'low' : 'high';
}

export default function ConfiguratorApp() {
  const { state, dispatch, active, corrections } = useConfiguratorState(typeof location !== 'undefined' ? location.search : '');
  const [step, setStep] = useState<Step>('size');
  const [webgl] = useState(hasWebGL);
  const [quality] = useState(detectQuality);
  const [viewerReady, setViewerReady] = useState(false);
  const [toast, setToast] = useState('');
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryImage, setInquiryImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'pdf' | 'glb'>('');
  const [announce, setAnnounce] = useState('');
  const viewerRef = useRef<ViewerHandle | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const issuesRef = useRef<HTMLDivElement>(null);

  const price = useMemo(() => calculatePrice(active), [active]);
  const issues = useMemo(() => validate(active), [active]);
  const blocked = hasErrors(issues);
  const product = PRODUCTS[active.product];

  const variants = useMemo(
    () =>
      state.compare && state.b
        ? [
            { config: state.a, label: 'A' as const },
            { config: state.b, label: 'B' as const },
          ]
        : [{ config: active, label: null }],
    [state.a, state.b, state.compare, active],
  );

  const patch = useCallback((p: Partial<Config>) => dispatch({ type: 'patch', patch: p }), [dispatch]);

  // Announce price changes to screen readers (debounced, so sliders don't flood)
  useEffect(() => {
    const t = window.setTimeout(() => setAnnounce(`Total ${formatEuro(price.total)} including VAT.${blocked ? ' The configuration has a problem to fix.' : ''}`), 900);
    return () => window.clearTimeout(t);
  }, [price.total, blocked]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (corrections.length) setToast(corrections.length === 1 ? corrections[0]! : 'Some values in the link were adjusted to buildable sizes.');
  }, [corrections]);

  const errorsByStep = useMemo(() => {
    const m = new Map<Step, Issue['level']>();
    for (const i of issues) {
      if (i.level === 'info') continue;
      const s = (i.field && FIELD_STEP[i.field]) || 'summary';
      if (m.get(s) !== 'error') m.set(s, i.level);
    }
    return m;
  }, [issues]);

  const takeSnapshot = (maxWidth = 1600, type: 'image/png' | 'image/jpeg' = 'image/jpeg') => viewerRef.current?.snapshot({ maxWidth, type, quality: 0.86 }) ?? null;

  const openInquiry = () => {
    if (blocked) {
      const first = issues.find((i) => i.level === 'error');
      const s = (first?.field && FIELD_STEP[first.field]) || 'summary';
      setStep(s);
      setToast('Please fix the marked problem first: this combination can’t be built.');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.cfg-panel .issue--error')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    setInquiryImage(takeSnapshot(900));
    setInquiryOpen(true);
  };

  const copyLink = async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link copied. Anyone with the link sees exactly this configuration.');
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const saveSnapshot = async () => {
    const data = viewerRef.current?.snapshot({ type: 'image/png' });
    if (!data) return;
    const { dataUrlToBlob, downloadBlob } = await import('./viewer/exporters.ts');
    downloadBlob(dataUrlToBlob(data), `${fileSlug(active)}.png`);
    setToast('Snapshot saved as PNG.');
  };

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const img = takeSnapshot(1400);
      const canvas = document.querySelector('.cfg-viewer canvas') as HTMLCanvasElement | null;
      const aspect = canvas ? canvas.width / canvas.height : 1.5;
      const [{ createQuotePdf }, { downloadBlob }] = await Promise.all([import('./pdf.ts'), import('./viewer/exporters.ts')]);
      const blob = await createQuotePdf({ config: active, image: img, imageAspect: aspect, link: location.href });
      downloadBlob(blob, `${fileSlug(active)}-quote.pdf`);
      setToast('PDF quote downloaded.');
    } finally {
      setBusy('');
    }
  };

  const downloadGlb = async () => {
    if (!viewerRef.current) return;
    setBusy('glb');
    try {
      const blob = await viewerRef.current.exportGLB();
      const { downloadBlob } = await import('./viewer/exporters.ts');
      downloadBlob(blob, `${fileSlug(active)}.glb`);
      setToast(`3D model saved (${Math.round(blob.size / 1024)} KB GLB).`);
    } finally {
      setBusy('');
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = STEPS.findIndex((s) => s.id === step);
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % STEPS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + STEPS.length) % STEPS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = STEPS.length - 1;
    else return;
    e.preventDefault();
    setStep(STEPS[n]!.id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[n]?.focus();
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[stepIndex + 1];
  const view = state.view;
  const preset = (p: ViewPreset) => viewerRef.current?.preset(p);
  const priceA = state.b ? calculatePrice(state.a).total : 0;
  const priceB = state.b ? calculatePrice(state.b).total : 0;

  const actions = (
    <div className="actions" aria-label="Save and share">
      <button type="button" className="btn btn--primary btn--block" onClick={openInquiry} aria-disabled={blocked || undefined}>
        Request a quote
      </button>
      <div className="actions__grid">
        <button type="button" className="btn btn--ghost" onClick={downloadPdf} disabled={busy === 'pdf'}>
          <UiIcon name="pdf" size={18} /> {busy === 'pdf' ? 'Creating PDF…' : 'PDF quote'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={copyLink}>
          <UiIcon name="link" size={18} /> Copy link
        </button>
        <button type="button" className="btn btn--ghost" onClick={saveSnapshot} disabled={!viewerReady}>
          <UiIcon name="camera" size={18} /> Snapshot
        </button>
        <button type="button" className="btn btn--ghost" onClick={downloadGlb} disabled={!viewerReady || busy === 'glb'}>
          <UiIcon name="cube" size={18} /> {busy === 'glb' ? 'Exporting…' : '3D file (GLB)'}
        </button>
      </div>
      {!state.b ? (
        <button type="button" className="btn btn--ghost btn--block" onClick={() => dispatch({ type: 'startCompare' })}>
          <UiIcon name="compare" size={18} /> Compare with a variant
        </button>
      ) : null}
    </div>
  );

  return (
    <div className={`cfg${state.compare ? ' is-compare' : ''}`} data-product={active.product}>
      <section className="cfg-stage" aria-label="3D view">
        <div
          className="cfg-viewer"
          role="img"
          aria-label={`3D view: ${state.compare && state.b ? `variant A, ${describeConfig(state.a)} Variant B, ${describeConfig(state.b)}` : describeConfig(active)}`}
          data-state={webgl ? (viewerReady ? 'ready' : 'loading') : 'no-webgl'}
        >
          {webgl ? (
            <Suspense fallback={null}>
              <Viewer variants={variants} view={view} quality={quality} handleRef={viewerRef} onReadyChange={setViewerReady} />
            </Suspense>
          ) : (
            <div className="cfg-nowebgl">
              <img src={withBase(`/generated/renders/${active.product}-card.webp`)} alt="" width="640" height="480" />
              <p>
                <strong>3D view not available.</strong> Your browser or device has WebGL switched off. You can still configure,
                see the price and request a quote; the picture shows the standard version.
              </p>
            </div>
          )}
          {webgl && !viewerReady ? (
            <div className="cfg-loading" role="status">
              <span className="spinner" aria-hidden="true" />
              Preparing the 3D view and the {active.species} texture…
            </div>
          ) : null}
        </div>

        {webgl ? (
        <div className="cfg-toolbar" role="toolbar" aria-label="View options">
          <div className="seg" role="group" aria-label="Scene">
            <button type="button" aria-pressed={!view.room} onClick={() => dispatch({ type: 'view', patch: { room: false } })}>
              Studio
            </button>
            <button type="button" aria-pressed={view.room} onClick={() => dispatch({ type: 'view', patch: { room: true } })}>
              <UiIcon name="room" size={16} /> Room
            </button>
          </div>
          <button type="button" className="tool-btn" aria-pressed={view.dims} onClick={() => dispatch({ type: 'view', patch: { dims: !view.dims } })} title="Dimensions">
            <UiIcon name="ruler" size={18} />
            <span className="tool-btn__label">Dimensions</span>
          </button>
          <button type="button" className="tool-btn" aria-pressed={view.person} onClick={() => dispatch({ type: 'view', patch: { person: !view.person } })} title="Person for scale (175 cm)">
            <UiIcon name="person" size={18} />
            <span className="tool-btn__label">Person 175 cm</span>
          </button>
          <button type="button" className="tool-btn" onClick={saveSnapshot} disabled={!viewerReady} title="Save snapshot (PNG)">
            <UiIcon name="camera" size={18} />
            <span className="tool-btn__label">Snapshot</span>
          </button>
        </div>
        ) : null}

        {webgl && view.room ? <RoomOptions view={view} onChange={(patch) => dispatch({ type: 'view', patch })} variant="overlay" /> : null}

        {webgl ? (
          <div className="cfg-camera" role="group" aria-label="Camera">
            <button type="button" className="tool-btn" onClick={() => viewerRef.current?.rotate(-30)} aria-label="Rotate left">
              <UiIcon name="rotateLeft" size={18} />
            </button>
            <button type="button" className="tool-btn" onClick={() => viewerRef.current?.rotate(30)} aria-label="Rotate right">
              <UiIcon name="rotateRight" size={18} />
            </button>
            <button type="button" className="tool-btn" onClick={() => viewerRef.current?.zoom(0.8)} aria-label="Zoom in">
              <UiIcon name="zoomIn" size={18} />
            </button>
            <button type="button" className="tool-btn" onClick={() => viewerRef.current?.zoom(1.25)} aria-label="Zoom out">
              <UiIcon name="zoomOut" size={18} />
            </button>
            <div className="cfg-presets" role="group" aria-label="Views">
              <button type="button" onClick={() => preset('front')}>Front</button>
              <button type="button" onClick={() => preset('side')}>Side</button>
              <button type="button" onClick={() => preset('top')}>Top</button>
              <button type="button" onClick={() => preset('three-quarter')} aria-label="Reset view">
                <UiIcon name="reset" size={16} />
              </button>
            </div>
          </div>
        ) : null}
        <p className="cfg-hint" aria-hidden="true" hidden={!webgl}>
          Drag to rotate · pinch or scroll to zoom · two fingers to move
        </p>
      </section>

      <section className="cfg-panel" aria-label="Configuration">
        <div className="cfg-panel__head">
          <fieldset className="product-switch">
            <legend className="visually-hidden">Furniture</legend>
            {PRODUCT_IDS.map((id) => (
              <label key={id} className={`product-switch__item${active.product === id ? ' is-checked' : ''}`}>
                <input type="radio" name="product" checked={active.product === id} onChange={() => dispatch({ type: 'product', product: id })} />
                <ProductIcon id={id} size={30} />
                <span>{PRODUCTS[id].kind}</span>
              </label>
            ))}
          </fieldset>
          <h2 className="cfg-title">
            {product.name}
            <span className="cfg-title__sub">{product.tagline}</span>
          </h2>
          {view.room ? <RoomOptions view={view} onChange={(patch) => dispatch({ type: 'view', patch })} variant="inline" /> : null}
          {state.b ? (
            <div className="variant-bar" role="group" aria-label="Variants">
              <div className="seg seg--variants">
                <button type="button" aria-pressed={state.active === 'a'} onClick={() => dispatch({ type: 'active', slot: 'a' })}>
                  A <span className="seg__price">{formatEuro(priceA)}</span>
                </button>
                <button type="button" aria-pressed={state.active === 'b'} onClick={() => dispatch({ type: 'active', slot: 'b' })}>
                  B <span className="seg__price">{formatEuro(priceB)}</span>
                </button>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={state.compare} onChange={(e) => dispatch({ type: 'compare', on: e.target.checked })} />
                Side by side
              </label>
              <button type="button" className="link-btn" onClick={() => dispatch({ type: 'swap' })}>
                Swap
              </button>
              <button type="button" className="link-btn" onClick={() => dispatch({ type: 'removeB' })}>
                Keep only {state.active.toUpperCase()}
              </button>
            </div>
          ) : null}
        </div>

        <div className="steps" role="tablist" aria-label="Configuration steps" ref={tabsRef}>
          {STEPS.map((s, i) => {
            const lvl = errorsByStep.get(s.id);
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`tab-${s.id}`}
                aria-selected={step === s.id}
                aria-controls={`panel-${s.id}`}
                tabIndex={step === s.id ? 0 : -1}
                onClick={() => setStep(s.id)}
                onKeyDown={onTabKey}
                className={lvl ? `has-${lvl}` : undefined}
              >
                <span className="steps__num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="steps__label">{s.label}</span>
                {lvl ? <span className="visually-hidden">{lvl === 'error' ? ' (has a problem)' : ' (has a warning)'}</span> : null}
                {lvl ? <span className="steps__flag" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <div className="step-panel" role="tabpanel" id={`panel-${step}`} aria-labelledby={`tab-${step}`} ref={issuesRef}>
          {step === 'size' ? <SizeStep config={active} patch={patch} issues={issues} /> : null}
          {step === 'build' ? <BuildStep config={active} patch={patch} issues={issues} /> : null}
          {step === 'wood' ? <WoodStep config={active} patch={patch} issues={issues} /> : null}
          {step === 'summary' ? (
            <SummaryStep
              config={active}
              patch={patch}
              issues={issues}
              price={price}
              actions={actions}
              compare={state.b ? <CompareTable a={state.a} b={state.b} active={state.active} onEdit={(s) => dispatch({ type: 'active', slot: s })} /> : null}
            />
          ) : null}
          {step !== 'summary' && issues.some((i) => !i.field || FIELD_STEP[i.field] !== step) && issues.some((i) => i.level === 'error') ? (
            <p className="step-note step-note--warn">
              There is a problem in another step: <button type="button" className="link-btn" onClick={() => {
                const first = issues.find((i) => i.level === 'error');
                setStep((first?.field && FIELD_STEP[first.field]) || 'summary');
              }}>show it</button>
            </p>
          ) : null}
          {next ? (
            <button type="button" className="btn btn--next" onClick={() => setStep(next.id)}>
              Next: {next.label} <UiIcon name="arrowRight" size={18} />
            </button>
          ) : null}
        </div>

        <div className="pricebox" aria-label="Price">
          <div className="pricebox__total">
            <span className="pricebox__amount" data-testid="total">
              {formatEuro(price.total)}
            </span>
            <span className="pricebox__meta">incl. 19 % VAT and delivery · demo price</span>
          </div>
          <button type="button" className="btn btn--primary" onClick={openInquiry} aria-disabled={blocked || undefined}>
            Request a quote
          </button>
          {blocked ? <p className="pricebox__blocked">Fix the marked problem to request a quote.</p> : null}
        </div>
      </section>

      <div className="cfg-mobilebar">
        <button type="button" className="cfg-mobilebar__price" onClick={() => setStep('summary')} aria-label={`Total ${formatEuro(price.total)} including VAT, show price details`}>
          <span className="cfg-mobilebar__amount">{formatEuro(price.total)}</span>
          <span className="cfg-mobilebar__meta">incl. VAT · details</span>
        </button>
        <button type="button" className="btn btn--primary" onClick={openInquiry} aria-disabled={blocked || undefined}>
          Request quote
        </button>
      </div>

      <InquiryDialog
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
        config={active}
        price={price}
        image={inquiryImage}
        variantLabel={state.b ? state.active.toUpperCase() : null}
      />

      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>
      <div className={`toast${toast ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

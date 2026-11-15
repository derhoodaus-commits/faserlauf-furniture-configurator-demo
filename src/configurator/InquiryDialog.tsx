import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { readContact, validateContact, type ContactFields, type FieldErrors } from '../lib/inquiry.ts';
import { describeConfig } from '../lib/describe.ts';
import { formatEuro, type PriceBreakdown } from '../lib/pricing.ts';
import type { Config } from '../lib/types.ts';
import { STATIC_DEMO, withBase } from '../lib/paths.ts';
import { UiIcon } from './Icons.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  config: Config;
  price: PriceBreakdown;
  image: string | null;
  variantLabel: string | null;
}

/** Lets the confirmation page link back to this exact configuration (only the configurator URL, no personal data). */
function rememberConfiguration() {
  try {
    sessionStorage.setItem('fl-last-configuration', location.search);
  } catch {
    /* storage blocked: the back link opens the default configuration */
  }
}

const FIELDS: { name: keyof ContactFields; label: string; type: string; autoComplete: string; required?: boolean; hint?: string }[] = [
  { name: 'name', label: 'Name', type: 'text', autoComplete: 'name', required: true },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', required: true },
  { name: 'phone', label: 'Phone (optional)', type: 'tel', autoComplete: 'tel', hint: 'If you prefer a call back' },
  { name: 'postcode', label: 'Postcode', type: 'text', autoComplete: 'postal-code', required: true, hint: 'For the delivery price; German postcodes only' },
];

/**
 * "Request a quote" form in a modal dialog. Sends the configuration, the price and the image; in the static demo
 * build (GitHub Pages) it only validates and then shows the confirmation page: nothing leaves the browser.
 */
export function InquiryDialog({ open, onClose, config, price, image, variantLabel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [sending, setSending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setErrors({});
      setServerError('');
    }
    if (!open && d.open) d.close();
  }, [open]);

  const needsPostcode = config.delivery !== 'pickup';

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    raw['consent'] = fd.get('consent') === 'on';
    const fields = readContact(raw);
    const errs = validateContact(fields, { kind: 'quote', needsPostcode });
    setErrors(errs);
    setServerError('');
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    rememberConfiguration();
    if (STATIC_DEMO) {
      location.assign(withBase('/inquiry-sent/?type=quote'));
      return;
    }
    setSending(true);
    try {
      const res = await fetch(withBase('/api/inquiry'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...fields, website: String(fd.get('website') ?? ''), config, image, link: location.href }),
      });
      const data = (await res.json().catch(() => ({}))) as { ref?: string; errors?: FieldErrors; message?: string };
      if (res.ok && data.ref) {
        location.assign(withBase(`/inquiry-sent/?ref=${encodeURIComponent(data.ref)}&type=quote`));
        return;
      }
      if (data.errors) setErrors(data.errors);
      setServerError(data.message ?? 'Sending failed. Please try again or email us at werkstatt@faserlauf.example.');
      requestAnimationFrame(() => summaryRef.current?.focus());
    } catch {
      setServerError('No connection to the server. Please check your internet connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const errorList = Object.entries(errors) as [keyof ContactFields, string][];
  return (
    <dialog ref={ref} className="inquiry" aria-labelledby={`${formId}-title`} onClose={onClose} onCancel={onClose}>
      <div className="inquiry__head">
        <h2 id={`${formId}-title`}>Request a quote</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <UiIcon name="close" size={20} />
        </button>
      </div>
      <div className="inquiry__config">
        {image ? <img src={image} alt={`Your configuration: ${describeConfig(config)}`} /> : null}
        <div>
          <p className="inquiry__what">
            {variantLabel ? <strong>Variant {variantLabel}: </strong> : null}
            {describeConfig(config)}
          </p>
          <p className="inquiry__price">
            {formatEuro(price.total)} <span>incl. VAT · demo price</span>
          </p>
        </div>
      </div>
      <p className="inquiry__intro">
        We check your configuration and send a fixed quote with a drawing within two working days. Requesting a quote is free and
        doesn’t commit you to anything.
      </p>
      <div ref={summaryRef} tabIndex={-1} className="form-errors" hidden={!errorList.length && !serverError} role="alert">
        {serverError ? <p>{serverError}</p> : null}
        {errorList.length ? (
          <>
            <p>Please check {errorList.length === 1 ? 'one field' : `${errorList.length} fields`}:</p>
            <ul>
              {errorList.map(([k, msg]) => (
                <li key={k}>
                  <a href={`#${formId}-${k}`}>{msg}</a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <form
        noValidate
        onSubmit={submit}
        className="form"
        onInput={(e) => {
          // clear a field's error as soon as it is edited
          const name = (e.target as HTMLInputElement).name as keyof ContactFields;
          if (errors[name]) setErrors(({ [name]: _gone, ...rest }) => rest);
        }}
      >
        {FIELDS.map((f) => (
          <div className="field" key={f.name}>
            <label htmlFor={`${formId}-${f.name}`}>
              {f.label}
              {f.name === 'postcode' && !needsPostcode ? ' (optional)' : ''}
            </label>
            {f.hint ? (
              <span className="field__hint" id={`${formId}-${f.name}-hint`}>
                {f.hint}
              </span>
            ) : null}
            <input
              id={`${formId}-${f.name}`}
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              inputMode={f.name === 'postcode' ? 'numeric' : undefined}
              required={f.required && (f.name !== 'postcode' || needsPostcode)}
              aria-invalid={errors[f.name] ? true : undefined}
              aria-describedby={[f.hint ? `${formId}-${f.name}-hint` : '', errors[f.name] ? `${formId}-${f.name}-err` : ''].filter(Boolean).join(' ') || undefined}
            />
            {errors[f.name] ? (
              <span className="field__error" id={`${formId}-${f.name}-err`}>
                {errors[f.name]}
              </span>
            ) : null}
          </div>
        ))}
        <div className="field">
          <label htmlFor={`${formId}-message`}>Message (optional)</label>
          <textarea id={`${formId}-message`} name="message" rows={3} placeholder="Anything we should know: stairs, room, deadline…" />
        </div>
        <div className="hp" aria-hidden="true">
          <label htmlFor={`${formId}-website`}>Website</label>
          <input id={`${formId}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <div className={`field field--check${errors.consent ? ' has-error' : ''}`}>
          <input id={`${formId}-consent`} name="consent" type="checkbox" aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? `${formId}-consent-err` : undefined} />
          <label htmlFor={`${formId}-consent`}>
            I agree that Faserlauf uses my details to answer this request (see <a href={withBase('/privacy/')}>privacy</a>).
          </label>
          {errors.consent ? (
            <span className="field__error" id={`${formId}-consent-err`}>
              {errors.consent}
            </span>
          ) : null}
        </div>
        <div className="inquiry__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={sending}>
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
        <p className="demo-note">
          {STATIC_DEMO
            ? 'Demo: this static version sends nothing. Your details are only checked in your browser, then you see the confirmation page.'
            : 'Demo: requests are stored on this server only; no email is sent.'}
        </p>
      </form>
    </dialog>
  );
}

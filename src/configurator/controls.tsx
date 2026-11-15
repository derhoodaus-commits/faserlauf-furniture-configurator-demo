import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Issue, RangeSpec } from '../lib/types.ts';
import { UiIcon } from './Icons.tsx';

/** Number input with − / + buttons and a slider. Commits valid values, explains corrections. */
export function DimensionInput({
  label,
  unit,
  spec,
  value,
  onChange,
  issue,
}: {
  label: string;
  unit: string;
  spec: RangeSpec;
  value: number;
  onChange: (v: number) => void;
  issue?: Issue | undefined;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [note, setNote] = useState('');
  useEffect(() => setText(String(value)), [value]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(n)) {
      setText(String(value));
      setNote(`Please enter a number between ${spec.min} and ${spec.max} ${unit}.`);
      return;
    }
    const clamped = Math.min(spec.max, Math.max(spec.min, Math.round(n / spec.step) * spec.step));
    setNote(clamped !== n ? `${n} ${unit} is outside ${spec.min}–${spec.max} ${unit}, set to ${clamped} ${unit}.` : '');
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  const nudge = (d: number) => {
    const v = Math.min(spec.max, Math.max(spec.min, value + d));
    setNote('');
    onChange(v);
  };
  const describedBy = [`${id}-range`, note ? `${id}-note` : '', issue ? `${id}-issue` : ''].filter(Boolean).join(' ');
  return (
    <div className={`dim-input${issue ? ` has-${issue.level}` : ''}`}>
      <div className="dim-input__head">
        <label htmlFor={id}>{label}</label>
        <span className="dim-input__range" id={`${id}-range`}>
          {spec.min}–{spec.max} {unit}
        </span>
      </div>
      <div className="dim-input__row">
        <button type="button" className="icon-btn" onClick={() => nudge(-spec.nudge)} disabled={value <= spec.min} aria-label={`${label}: minus ${spec.nudge} ${unit}`}>
          <span aria-hidden="true">−</span>
        </button>
        <div className="dim-input__field">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={text}
            aria-describedby={describedBy}
            aria-invalid={issue?.level === 'error' ? true : undefined}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              // live update while typing when the value is already valid
              if (Number.isFinite(n) && n >= spec.min && n <= spec.max && Number.isInteger(n / spec.step)) {
                setNote('');
                onChange(n);
              }
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            }}
          />
          <span className="dim-input__unit" aria-hidden="true">
            {unit}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={() => nudge(spec.nudge)} disabled={value >= spec.max} aria-label={`${label}: plus ${spec.nudge} ${unit}`}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <input
        className="dim-input__slider"
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-label={`${label} slider`}
        aria-valuetext={`${value} ${unit}`}
        onChange={(e) => {
          setNote('');
          onChange(Number(e.target.value));
        }}
      />
      {note ? (
        <p className="field-note" id={`${id}-note`} role="status">
          {note}
        </p>
      ) : null}
      {issue ? <IssueText id={`${id}-issue`} issue={issue} /> : null}
    </div>
  );
}

export function IssueText({ issue, id }: { issue: Issue; id?: string }) {
  return (
    <div className={`issue issue--${issue.level}`} id={id}>
      <UiIcon name={issue.level === 'error' ? 'warning' : issue.level === 'warning' ? 'warning' : 'info'} size={18} />
      <p>
        <span className="visually-hidden">{issue.level === 'error' ? 'Problem: ' : issue.level === 'warning' ? 'Warning: ' : 'Note: '}</span>
        {issue.message}
        {issue.fix ? <span className="issue__fix"> {issue.fix}</span> : null}
      </p>
    </div>
  );
}

export interface CardOption<T extends string | number> {
  value: T;
  label: string;
  description?: string | undefined;
  media?: ReactNode;
  aside?: ReactNode;
}

/** Radio group rendered as cards (native radios: arrow keys, labels and screen readers work). */
export function RadioCards<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  columns = 2,
  hint,
  issue,
  compact,
}: {
  legend: string;
  name: string;
  options: CardOption<T>[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  hint?: string;
  issue?: Issue | undefined;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className={`radio-cards${compact ? ' radio-cards--compact' : ''}`} data-columns={columns} aria-describedby={issue ? `${id}-issue` : undefined}>
      <legend>{legend}</legend>
      {hint ? <p className="fieldset-hint">{hint}</p> : null}
      <div className="radio-cards__grid">
        {options.map((o) => (
          <label key={String(o.value)} className={`radio-card${o.value === value ? ' is-checked' : ''}`}>
            <input type="radio" name={name} value={String(o.value)} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.media ? <span className="radio-card__media">{o.media}</span> : null}
            <span className="radio-card__text">
              <span className="radio-card__label">{o.label}</span>
              {o.description ? <span className="radio-card__desc">{o.description}</span> : null}
            </span>
            {o.aside ? <span className="radio-card__aside">{o.aside}</span> : null}
          </label>
        ))}
      </div>
      {issue ? <IssueText id={`${id}-issue`} issue={issue} /> : null}
    </fieldset>
  );
}

/** Small integer stepper (shelves). */
export function Stepper({ label, value, min, max, onChange, hint, issue }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string; issue?: Issue | undefined }) {
  const id = useId();
  return (
    <div className="stepper">
      <div className="stepper__text">
        <span className="stepper__label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? <span className="stepper__hint">{hint}</span> : null}
      </div>
      <div className="stepper__row" role="group" aria-labelledby={`${id}-label`}>
        <button type="button" className="icon-btn" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`${label}: one less`}>
          <span aria-hidden="true">−</span>
        </button>
        <output className="stepper__value" aria-live="polite">
          {value}
        </output>
        <button type="button" className="icon-btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`${label}: one more`}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {issue ? <IssueText issue={issue} /> : null}
    </div>
  );
}

export function priceDelta(cents: number): string {
  if (Math.abs(cents) < 100) return 'same price';
  const v = Math.round(Math.abs(cents) / 100).toLocaleString('en-US');
  return `${cents > 0 ? '+' : '−'} €${v}`;
}

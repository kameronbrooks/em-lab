import katex from 'katex';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { fmt } from '../engine/math';

const uiListeners = new Set<() => void>();
/** Re-render every component that called useLabUI(). Controls call this after changing lab state. */
export function bumpAll() {
  uiListeners.forEach((l) => l());
}

/** Controls call this after changing lab state so the panel re-renders. */
export const BumpContext = createContext<() => void>(bumpAll);

export function useBump(): () => void {
  const [, force] = useReducer((x: number) => (x + 1) % 1_000_000, 0);
  return force;
}

/**
 * Call at the top of every lab page component. Lab state lives outside React, so this
 * re-renders the page `hz` times a second (for live readouts) and whenever a control changes.
 */
export function useLabUI(hz = 6) {
  const bump = useBump();
  useEffect(() => {
    uiListeners.add(bump);
    const id = window.setInterval(bump, 1000 / hz);
    return () => {
      uiListeners.delete(bump);
      window.clearInterval(id);
    };
  }, [bump, hz]);
  return bump;
}

/** Re-render the calling component `hz` times per second (for live readouts). */
export function useTick(hz = 6) {
  const bump = useBump();
  useEffect(() => {
    const id = window.setInterval(bump, 1000 / hz);
    return () => window.clearInterval(id);
  }, [bump, hz]);
  return bump;
}

const texCache = new Map<string, string>();
/** Inline or display LaTeX. */
export function Tex({ children, block, className }: { children: string; block?: boolean; className?: string }) {
  const html = useMemo(() => {
    const key = (block ? 'B' : 'I') + children;
    let h = texCache.get(key);
    if (h === undefined) {
      try {
        h = katex.renderToString(children, { throwOnError: false, displayMode: !!block });
      } catch {
        h = children;
      }
      texCache.set(key, h);
    }
    return h;
  }, [children, block]);
  return block ? (
    <div className={`tex-block ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function Section({ title, children, right }: { title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="section">
      {(title || right) && (
        <header className="section-head">
          <h3>{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

interface SliderProps {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  /** Custom formatter for the value readout. */
  format?: (v: number) => string;
  /** Logarithmic slider (min and max must be > 0). */
  log?: boolean;
  color?: string;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step, unit, onChange, format, log, color, disabled }: SliderProps) {
  const bump = useContext(BumpContext);
  const toPos = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p) : min + p * (max - min));
  const [editing, setEditing] = useState<string | null>(null);
  const pos = Math.min(1, Math.max(0, toPos(value)));
  const text = format ? format(value) : fmt(value, 3);
  const commit = (s: string) => {
    const v = parseFloat(s.replace('−', '-'));
    if (isFinite(v)) {
      onChange(v);
      bump();
    }
    setEditing(null);
  };
  return (
    <label className={`ctl slider ${disabled ? 'disabled' : ''}`}>
      <span className="ctl-row">
        <span className="ctl-label">{label}</span>
        {editing !== null ? (
          <input
            className="ctl-edit"
            autoFocus
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onBlur={() => commit(editing)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(editing);
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        ) : (
          <button
            type="button"
            className="ctl-value"
            title="Click to type a value"
            onClick={(e) => {
              e.preventDefault();
              setEditing(String(Number(value.toPrecision(4))));
            }}
          >
            {text}
            {unit ? <span className="ctl-unit"> {unit}</span> : null}
          </button>
        )}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step="any"
        value={pos}
        disabled={disabled}
        style={color ? { ['--pos' as string]: `${pos * 100}%`, ['--accent' as string]: color } : { ['--pos' as string]: `${pos * 100}%` }}
        onChange={(e) => {
          let v = fromPos(parseFloat(e.target.value));
          if (step && !log) v = Math.round(v / step) * step;
          if (log) v = Number(v.toPrecision(3));
          v = Math.min(max, Math.max(min, v));
          onChange(Number(v.toPrecision(10)));
          bump();
        }}
      />
    </label>
  );
}

export function Toggle({ label, value, onChange, color }: { label: React.ReactNode; value: boolean; onChange: (v: boolean) => void; color?: string }) {
  const bump = useContext(BumpContext);
  return (
    <label className="ctl toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          onChange(e.target.checked);
          bump();
        }}
      />
      <span className="toggle-track" style={color && value ? { background: color } : undefined}>
        <span className="toggle-thumb" />
      </span>
      <span className="ctl-label">{label}</span>
    </label>
  );
}

export interface Option<T> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

/** Segmented button group for choosing one of a few options. */
export function Segmented<T extends string | number>({ label, value, options, onChange, wrap }: {
  label?: React.ReactNode;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  const bump = useContext(BumpContext);
  return (
    <div className="ctl">
      {label && <span className="ctl-label">{label}</span>}
      <div className={`segmented ${wrap ? 'wrap' : ''}`} role="radiogroup">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            title={o.title}
            className={o.value === value ? 'on' : ''}
            onClick={() => {
              onChange(o.value);
              bump();
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Select<T extends string | number>({ label, value, options, onChange }: {
  label?: React.ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const bump = useContext(BumpContext);
  return (
    <label className="ctl select">
      {label && <span className="ctl-label">{label}</span>}
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((o) => String(o.value) === e.target.value);
          if (o) {
            onChange(o.value);
            bump();
          }
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Button({ children, onClick, kind, title, disabled, active }: {
  children: React.ReactNode;
  onClick: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  title?: string;
  disabled?: boolean;
  active?: boolean;
}) {
  const bump = useContext(BumpContext);
  return (
    <button
      type="button"
      className={`btn ${kind ?? ''} ${active ? 'on' : ''}`}
      title={title}
      disabled={disabled}
      onClick={() => {
        onClick();
        bump();
      }}
    >
      {children}
    </button>
  );
}

export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="btn-row">{children}</div>;
}

/** A labelled live value. `value` may be a number (formatted) or a string. */
export function Readout({ label, value, unit, color, digits, tex }: {
  label: React.ReactNode;
  value: number | string;
  unit?: string;
  color?: string;
  digits?: number;
  tex?: string;
}) {
  return (
    <div className="readout">
      <span className="readout-label">{tex ? <Tex>{tex}</Tex> : label}</span>
      <span className="readout-value" style={color ? { color } : undefined}>
        {typeof value === 'number' ? fmt(value, digits ?? 3) : value}
        {unit ? <span className="ctl-unit"> {unit}</span> : null}
      </span>
    </div>
  );
}

export function Readouts({ children }: { children: React.ReactNode }) {
  return <div className="readouts">{children}</div>;
}

/** Callout used for "what to notice" explanations. */
export function Note({ children, kind, title }: { children: React.ReactNode; kind?: 'idea' | 'warn' | 'good'; title?: string }) {
  return (
    <div className={`note ${kind ?? 'idea'}`}>
      {title && <strong className="note-title">{title}</strong>}
      {children}
    </div>
  );
}

/** A formula card: the equation plus one line saying what it means. */
export function Formula({ tex, children }: { tex: string; children?: React.ReactNode }) {
  return (
    <div className="formula">
      <Tex block>{tex}</Tex>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Horizontal bar that shows a signed or unsigned quantity (energy bars etc.). */
export function Bar({ label, value, max, color, text }: { label: React.ReactNode; value: number; max: number; color: string; text?: string }) {
  const frac = max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${frac * 100}%`, background: color }} />
      </span>
      <span className="bar-text">{text ?? fmt(value, 3)}</span>
    </div>
  );
}

/** Keeps a stable callback identity while always calling the latest function. */
export function useLatest<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args: never[]) => ref.current(...args)) as T, []);
}

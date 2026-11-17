import { MathfieldElement } from 'mathlive';
import { useEffect, useRef } from 'react';

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  // KaTeX's stylesheet (loaded by the app) already provides the fonts MathLive uses.
  MathfieldElement.fontsDirectory = null;
  MathfieldElement.soundsDirectory = null;
}

const KEEP_WORDS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'Delta', 'theta', 'Theta', 'pi', 'Pi', 'sqrt', 'infty',
  'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'exp', 'sinh', 'cosh', 'tanh',
]);
const EXTRA_WORDS: Record<string, string> = {
  omega: '\\omega', Omega: '\\Omega', mu: '\\mu', lambda: '\\lambda', sigma: '\\sigma', rho: '\\rho',
  phi: '\\phi', Phi: '\\Phi', tau: '\\tau', epsilon: '\\epsilon',
};

/**
 * MathLive's default typing shortcuts turn "ii" into the imaginary unit, "ee" into Euler's number,
 * "RR" into the real numbers and so on. In physics those are just products of variables, so only
 * Greek letter names and function names are kept.
 */
function physicsShortcuts(base: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (/^[A-Za-z]+$/.test(k) && !KEEP_WORDS.has(k)) continue;
    out[k] = v;
  }
  return { ...out, ...EXTRA_WORDS };
}

interface MathFieldProps {
  value: string;
  onChange: (latex: string) => void;
  /** Called when Enter is pressed, with the current LaTeX. */
  onEnter?: (latex: string) => void;
  /** Placeholder as LaTeX, e.g. "\\text{Type your answer}". */
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  className?: string;
}

/** A MathLive editor. `value` is LaTeX; typing calls onChange with the new LaTeX. */
export function MathField({ value, onChange, onEnter, placeholder, label, autoFocus, className }: MathFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const callbacks = useRef({ onChange, onEnter });
  callbacks.current = { onChange, onEnter };
  /** Values sent to onChange that have not yet come back through the `value` prop. */
  const emitted = useRef<string[]>([]);

  useEffect(() => {
    configure();
    const mf = new MathfieldElement();
    host.current!.appendChild(mf);
    mf.smartFence = true;
    mf.mathVirtualKeyboardPolicy = 'auto';
    try {
      mf.inlineShortcuts = physicsShortcuts(mf.inlineShortcuts as Readonly<Record<string, unknown>>) as typeof mf.inlineShortcuts;
    } catch {
      /* keep the defaults */
    }
    if (placeholder) mf.placeholder = placeholder;
    if (label) mf.setAttribute('aria-label', label);
    mf.setValue(value, { silenceNotifications: true });
    const onInput = () => {
      const v = mf.value;
      // MathLive announces each edit on the next tick, so several edits can report the same text
      if (emitted.current.length && emitted.current[emitted.current.length - 1] === v) return;
      emitted.current.push(v);
      if (emitted.current.length > 64) emitted.current.shift();
      callbacks.current.onChange(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      // MathLive announces edits on the next tick, so hand over the current text directly.
      const v = mf.value;
      onInput();
      callbacks.current.onEnter?.(v);
    };
    mf.addEventListener('input', onInput);
    // Capture phase: MathLive handles Enter itself and stops the event before it bubbles out.
    mf.addEventListener('keydown', onKey, true);
    field.current = mf;
    let timer = 0;
    if (autoFocus) timer = window.setTimeout(() => mf.focus(), 60);
    return () => {
      window.clearTimeout(timer);
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('keydown', onKey, true);
      mf.remove();
      field.current = null;
    };
    // The editor is created once; later value changes are pushed in by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = field.current;
    if (!mf) return;
    // A value we emitted ourselves coming back as a prop is an echo, possibly a stale one if the
    // user typed again before React re-rendered. Never write those back into the editor.
    const echo = emitted.current.lastIndexOf(value);
    if (echo >= 0) {
      emitted.current.splice(0, echo);
      return;
    }
    // Anything else is a change made from outside (an example chip, Clear, a formula card).
    emitted.current.length = 0;
    if (mf.value !== value) mf.setValue(value, { silenceNotifications: true });
  }, [value]);

  return <div className={`mathfield ${className ?? ''}`} ref={host} />;
}

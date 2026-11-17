// The ideal LC circuit: q = q0 cos(t/sqrt(LC) + phi), i = dq/dt.
//
// Everything about "how much charge / how much current" follows from energy conservation:
//   q^2/2C + L i^2/2 = q0^2/2C = L imax^2/2
// which, divided by the total, is (q/q0)^2 + (i/imax)^2 = 1.

export const lcOmega = (L: number, C: number) => 1 / Math.sqrt(L * C);
export const lcPeriod = (L: number, C: number) => 2 * Math.PI * Math.sqrt(L * C);
/** Largest current, reached when the capacitor is empty. */
export const lcPeakCurrent = (q0: number, L: number, C: number) => q0 / Math.sqrt(L * C);
/** Largest charge, reached when the current is zero. */
export const lcPeakCharge = (iMax: number, L: number, C: number) => iMax * Math.sqrt(L * C);
export const lcTotalEnergy = (q0: number, C: number) => (q0 * q0) / (2 * C);

export interface LCState {
  /** Phase angle t/sqrt(LC) + phi, in radians. */
  theta: number;
  q: number;
  /** i = dq/dt: positive when charge is flowing onto the plate that q is measured on. */
  i: number;
  EC: number;
  EL: number;
  E: number;
  /** q/q0 and i/imax, each between -1 and 1. */
  qFrac: number;
  iFrac: number;
}

/** State of the circuit at phase angle theta. */
export function lcStateAt(theta: number, q0: number, L: number, C: number): LCState {
  const qFrac = Math.cos(theta), iFrac = -Math.sin(theta);
  const q = q0 * qFrac, i = lcPeakCurrent(q0, L, C) * iFrac;
  const EC = (q * q) / (2 * C), EL = (L * i * i) / 2;
  return { theta, q, i, EC, EL, E: lcTotalEnergy(q0, C), qFrac, iFrac };
}

/** Size of the current when the capacitor holds charge q. */
export function currentAtCharge(q: number, q0: number, L: number, C: number): number {
  return Math.sqrt(Math.max(0, q0 * q0 - q * q) / (L * C));
}

/** Size of the charge when the current is i. */
export function chargeAtCurrent(i: number, q0: number, L: number, C: number): number {
  return Math.sqrt(Math.max(0, q0 * q0 - L * C * i * i));
}

// ---------- "know one fraction, find the rest" ----------

/** Which fraction is known: q/q0, i/imax, E_C/E_total or E_L/E_total. */
export type Known = 'q' | 'i' | 'EC' | 'EL';

export interface Frac {
  n: number;
  d: number;
}

/** A number together with the best way to write it: exactly when possible, as a decimal otherwise. */
export interface Value {
  value: number;
  /** Set when the value is an exact fraction of whole numbers. */
  frac: Frac | null;
  tex: string;
  /** True when `tex` is exact (a fraction or a square root), false for a rounded decimal. */
  exact: boolean;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

export function frac(n: number, d: number): Frac {
  const g = gcd(n, d) || 1;
  return d < 0 ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g };
}

const fracTex = (f: Frac) => (f.d === 1 ? `${f.n}` : String.raw`\frac{${f.n}}{${f.d}}`);
export const decimalTex = (v: number, digits = 3) => {
  const r = Number(v.toPrecision(digits));
  return Math.abs(r) < 1e-12 ? '0' : `${r}`;
};

export const exactValue = (f: Frac): Value => ({ value: f.n / f.d, frac: f, tex: fracTex(f), exact: true });
export const decimalValue = (v: number): Value => ({ value: v, frac: null, tex: decimalTex(v), exact: false });

/**
 * Read "1/7", "0.25", "25%" or "3". Whole-number fractions and short decimals are kept exact.
 * Returns null when the text is not a number.
 */
export function parseValue(text: string): Value | null {
  let t = text.trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (!t) return null;
  let scale = 1;
  if (t.endsWith('%')) {
    t = t.slice(0, -1);
    scale = 100;
  }
  const m = /^(-?\d*\.?\d+)(?:\/(\d*\.?\d+))?$/.exec(t);
  if (!m) return null;
  const toFrac = (s: string): Frac | null => {
    const dot = s.indexOf('.');
    const places = dot < 0 ? 0 : s.length - dot - 1;
    if (places > 6) return null;
    const d = Math.pow(10, places);
    return frac(Math.round(Number(s) * d), d);
  };
  const num = Number(m[1]), den = m[2] === undefined ? 1 : Number(m[2]);
  if (!isFinite(num) || !isFinite(den) || den === 0) return null;
  const a = toFrac(m[1]), b = m[2] === undefined ? frac(1, 1) : toFrac(m[2]);
  if (a && b && b.n !== 0) {
    const f = frac(a.n * b.d, a.d * b.n * scale);
    if (Math.abs(f.n) < 1e7 && f.d < 1e7) return exactValue(f);
  }
  return decimalValue(num / den / scale);
}

/** v squared. */
export function squareOf(v: Value): Value {
  return v.frac ? exactValue(frac(v.frac.n * v.frac.n, v.frac.d * v.frac.d)) : decimalValue(v.value * v.value);
}

/** 1 - v. */
export function restOf(v: Value): Value {
  return v.frac ? exactValue(frac(v.frac.d - v.frac.n, v.frac.d)) : decimalValue(1 - v.value);
}

/** Square root, written as k*sqrt(r)/d with the square factors pulled out: sqrt(8/9) -> 2 sqrt(2) / 3. */
export function rootOf(v: Value): Value {
  const f = v.frac;
  if (!f || f.n < 0) return decimalValue(Math.sqrt(Math.max(0, v.value)));
  if (f.n === 0) return exactValue(frac(0, 1));
  // sqrt(n/d) = sqrt(n d) / d
  let r = f.n * f.d, k = 1;
  for (let p = 2; p * p <= r; p++) {
    while (r % (p * p) === 0) {
      r /= p * p;
      k *= p;
    }
  }
  const g = gcd(k, f.d);
  const top = k / g, bottom = f.d / g;
  if (r === 1) return exactValue(frac(top, bottom));
  const numTex = `${top === 1 ? '' : top}\\sqrt{${r}}`;
  return {
    value: Math.sqrt(f.n / f.d),
    frac: null,
    tex: bottom === 1 ? numTex : String.raw`\frac{${numTex}}{${bottom}}`,
    exact: true,
  };
}

export interface WorkedStep {
  /** Plain-language reason for the step. */
  say: string;
  tex: string;
}

export interface Worked {
  /** Sizes of q/q0 and i/imax, and the two energy shares. */
  q: Value;
  i: Value;
  EC: Value;
  EL: Value;
  steps: WorkedStep[];
}

const SYMBOL: Record<Known, string> = {
  q: String.raw`\frac{q}{q_0}`,
  i: String.raw`\frac{i}{i_{max}}`,
  EC: String.raw`\frac{E_C}{E_{total}}`,
  EL: String.raw`\frac{E_L}{E_{total}}`,
};
export const knownTex = (k: Known) => SYMBOL[k];

/** "= exact ≈ decimal" tail for a result, without repeating a value that is already a plain decimal. */
function tail(v: Value): string {
  if (!v.exact) return `\\approx ${v.tex}`;
  const whole = v.frac && v.frac.d === 1;
  return whole ? `= ${v.tex}` : `= ${v.tex} \\approx ${decimalTex(v.value)}`;
}

/**
 * Given one of the four fractions (between 0 and 1), find the other three by energy conservation,
 * with the steps written out. Returns null when the given value is not between 0 and 1.
 */
export function workLC(kind: Known, given: Value): Worked | null {
  if (!(given.value >= 0 && given.value <= 1)) return null;
  const steps: WorkedStep[] = [];
  const paren = String.raw`\left(${given.tex}\right)`;
  if (kind === 'q' || kind === 'i') {
    const mine = kind === 'q' ? 'EC' : 'EL', other = kind === 'q' ? 'EL' : 'EC', find = kind === 'q' ? 'i' : 'q';
    const share = squareOf(given), rest = restOf(share), root = rootOf(rest);
    steps.push({
      say: kind === 'q'
        ? 'Capacitor energy goes as q², so the capacitor’s share of the energy is the charge fraction squared.'
        : 'Inductor energy goes as i², so the inductor’s share of the energy is the current fraction squared.',
      tex: `${SYMBOL[mine]} = ${paren}^2 ${tail(share)}`,
    });
    steps.push({
      say: `The total never changes, so the ${kind === 'q' ? 'inductor' : 'capacitor'} holds whatever is left.`,
      tex: `${SYMBOL[other]} = 1 - ${share.tex} ${tail(rest)}`,
    });
    steps.push({
      say: `That share is the ${kind === 'q' ? 'current' : 'charge'} fraction squared, so take the square root.`,
      tex: `${SYMBOL[find]} = \\sqrt{${rest.tex}} ${tail(root)}`,
    });
    return kind === 'q' ? { q: given, i: root, EC: share, EL: rest, steps } : { q: root, i: given, EC: rest, EL: share, steps };
  }
  const rest = restOf(given), mineRoot = rootOf(given), otherRoot = rootOf(rest);
  const isC = kind === 'EC';
  steps.push({
    say: `${isC ? 'Capacitor energy goes as q²' : 'Inductor energy goes as i²'}, so the ${isC ? 'charge' : 'current'} fraction is the square root of that share.`,
    tex: `${SYMBOL[isC ? 'q' : 'i']} = \\sqrt{${given.tex}} ${tail(mineRoot)}`,
  });
  steps.push({
    say: `The total never changes, so the ${isC ? 'inductor' : 'capacitor'} holds whatever is left.`,
    tex: `${SYMBOL[isC ? 'EL' : 'EC']} = 1 - ${given.tex} ${tail(rest)}`,
  });
  steps.push({
    say: `Square root again for the ${isC ? 'current' : 'charge'} fraction.`,
    tex: `${SYMBOL[isC ? 'i' : 'q']} = \\sqrt{${rest.tex}} ${tail(otherRoot)}`,
  });
  return isC
    ? { q: mineRoot, i: otherRoot, EC: given, EL: rest, steps }
    : { q: otherRoot, i: mineRoot, EC: rest, EL: given, steps };
}

/** First phase angle after t = 0 (capacitor full) at which the charge fraction has dropped to qFrac. */
export const firstPhaseFor = (qFrac: number) => Math.acos(Math.min(1, Math.max(-1, qFrac)));

// Closed-form ("formula sheet") solutions for single-loop series circuits.

import { CElement, Circuit } from './solver';

export type SeriesKind = 'R' | 'RC' | 'RL' | 'LC' | 'RLC' | 'C' | 'L';
export type Regime = 'undamped' | 'underdamped' | 'critical' | 'overdamped';

export interface LoopState {
  /** Loop current. */
  I: number;
  /** dI/dt. */
  dI: number;
  /** Charge moved around the loop since the reference time (DC) or steady-state charge (AC). */
  q: number;
}

export interface SeriesInfo {
  kind: SeriesKind;
  /** Total series resistance, equivalent capacitance (Infinity if none), total inductance. */
  R: number;
  C: number;
  L: number;
  /** Net DC emf around the loop. */
  E: number;
  ac: { amp: number; freq: number } | null;
  /** True when the dashed formula overlay is available. */
  hasSolution: boolean;
  /** Time the solution starts from. */
  t0: number;
  tau?: number;
  omega0?: number;
  /** a = -R/2L ± ½ sqrt((R/L)² − 4/LC); real and imaginary parts of the two roots. */
  roots?: { re1: number; re2: number; im: number };
  rCrit?: number;
  regime?: Regime;
  /** AC steady state. */
  impedance?: number;
  iAmp?: number;
  phase?: number;
  f0?: number;
  loop(tAbs: number): LoopState;
  /** Predicted v and i of one element (same sign conventions as the simulator). */
  element(e: CElement, tAbs: number): { v: number; i: number } | null;
}

/** Roots of L a² + R a + 1/C = 0 in the course's form. */
export function rlcRoots(R: number, L: number, C: number) {
  const disc = (R / L) * (R / L) - 4 / (L * C);
  const re = -R / (2 * L);
  if (disc >= 0) return { re1: re + 0.5 * Math.sqrt(disc), re2: re - 0.5 * Math.sqrt(disc), im: 0, disc };
  return { re1: re, re2: re, im: 0.5 * Math.sqrt(-disc), disc };
}

export function rlcRegime(R: number, L: number, C: number): Regime {
  if (R <= 0) return 'undamped';
  const rc = Math.sqrt((4 * L) / C);
  if (Math.abs(R - rc) <= 1e-3 * rc) return 'critical';
  return R < rc ? 'underdamped' : 'overdamped';
}

/** Amplitude of the steady-state current in a driven series RLC circuit. */
export function drivenAmplitude(V0: number, f: number, R: number, L: number, C: number): number {
  const w = 2 * Math.PI * f;
  if (w <= 0) return isFinite(C) ? 0 : V0 / Math.max(R, 1e-12);
  const X = w * L - (isFinite(C) ? 1 / (w * C) : 0);
  return V0 / Math.hypot(R, X);
}

/**
 * If the circuit is one closed loop (every node joins exactly two element ends), classify it and
 * return its analytic solution starting from the circuit's present state.
 */
export function analyzeSeries(c: Circuit): SeriesInfo | null {
  const els = c.elements;
  if (els.length < 2) return null;
  if (els.some((e) => e.type === 'switch' && !e.closed)) return null;
  const deg = c.degrees();
  if (deg.some((d) => d !== 2)) return null;

  // walk the loop, recording whether each element points along (+1) or against (-1) the walk
  const sign = new Map<number, number>();
  let cur = els[0];
  let node = cur.nb;
  sign.set(cur.id, 1);
  for (let guard = 0; guard < els.length; guard++) {
    const next = els.find((e) => e !== cur && (e.na === node || e.nb === node) && !sign.has(e.id));
    if (!next) break;
    const s = next.na === node ? 1 : -1;
    sign.set(next.id, s);
    node = s === 1 ? next.nb : next.na;
    cur = next;
  }
  if (sign.size !== els.length || node !== els[0].na) return null;

  let R = 0, invC = 0, L = 0, E = 0, nC = 0, nL = 0;
  let u0 = 0;
  let I0: number | null = null;
  const acs: CElement[] = [];
  const v0 = new Map<number, number>();
  for (const e of els) {
    const s = sign.get(e.id)!;
    switch (e.type) {
      case 'resistor': R += e.value; break;
      case 'capacitor':
        invC += 1 / e.value;
        nC++;
        u0 += s * e.v;
        v0.set(e.id, e.v);
        break;
      case 'inductor':
        L += e.value;
        nL++;
        if (I0 === null) I0 = s * e.i;
        break;
      case 'battery': E += s * e.value; break;
      case 'ac': acs.push(e); break;
    }
  }
  const C = nC ? 1 / invC : Infinity;
  const t0 = c.time;
  const kind: SeriesKind = nC && nL ? (R > 0 ? 'RLC' : 'LC') : nC ? (R > 0 ? 'RC' : 'C') : nL ? (R > 0 ? 'RL' : 'L') : 'R';

  const info: SeriesInfo = {
    kind, R, C, L, E, ac: null, hasSolution: false, t0,
    loop: () => ({ I: 0, dI: 0, q: 0 }),
    element: () => null,
  };
  if (nC && nL) {
    info.omega0 = 1 / Math.sqrt(L * C);
    info.rCrit = Math.sqrt((4 * L) / C);
    info.regime = rlcRegime(R, L, C);
    const r = rlcRoots(R, L, C);
    info.roots = { re1: r.re1, re2: r.re2, im: r.im };
    info.f0 = info.omega0 / (2 * Math.PI);
  } else if (nC && R > 0) info.tau = R * C;
  else if (nL && R > 0) info.tau = L / R;

  const elementFrom = (loop: (t: number) => LoopState, acMode: boolean) => (e: CElement, tAbs: number) => {
    const s = sign.get(e.id);
    if (s === undefined) return null;
    const st = loop(tAbs);
    const i = s * st.I;
    switch (e.type) {
      case 'resistor': return { v: e.value * i, i };
      case 'capacitor': return { v: (acMode ? 0 : v0.get(e.id) ?? 0) + (s * st.q) / e.value, i };
      case 'inductor': return { v: e.value * s * st.dI, i };
      case 'battery': return { v: -e.value, i };
      case 'ac': return { v: -e.value * Math.sin(2 * Math.PI * e.freq * tAbs), i };
      default: return { v: 0, i };
    }
  };

  // ----- AC drive: steady state -----
  if (acs.length === 1 && E === 0 && acs[0].freq > 0 && (R > 0 || nL || nC)) {
    const src = acs[0];
    const s = sign.get(src.id)!;
    const w = 2 * Math.PI * src.freq;
    const X = w * L - (nC ? 1 / (w * C) : 0);
    const Z = Math.hypot(R, X);
    info.ac = { amp: src.value, freq: src.freq };
    info.impedance = Z;
    info.phase = Math.atan2(X, R);
    info.iAmp = Z > 0 ? src.value / Z : Infinity;
    if (Z > 1e-9) {
      const amp = (s * src.value) / Z, ph = info.phase;
      info.loop = (t) => ({
        I: amp * Math.sin(w * t - ph),
        dI: amp * w * Math.cos(w * t - ph),
        q: (-amp / w) * Math.cos(w * t - ph),
      });
      info.element = elementFrom(info.loop, true);
      info.hasSolution = true;
    }
    return info;
  }
  if (acs.length) return info;

  // ----- DC / free response from the present state -----
  let sol: ((t: number) => { I: number; q: number }) | null = null;
  if (kind === 'R' && R > 0) {
    sol = () => ({ I: E / R, q: 0 });
  } else if (kind === 'RC') {
    const i0 = (E - u0) / R, tau = R * C;
    sol = (t) => ({ I: i0 * Math.exp(-t / tau), q: i0 * tau * (1 - Math.exp(-t / tau)) });
  } else if (kind === 'RL') {
    const iInf = E / R, tau = L / R, i0 = I0 ?? 0;
    sol = (t) => ({ I: iInf + (i0 - iInf) * Math.exp(-t / tau), q: 0 });
  } else if (kind === 'L') {
    const i0 = I0 ?? 0;
    sol = (t) => ({ I: i0 + (E * t) / L, q: 0 });
  } else if (kind === 'LC' || kind === 'RLC') {
    // w = u - E obeys w'' + (R/L) w' + w/(LC) = 0, with w' = I / C
    const a = R / (2 * L), w02 = 1 / (L * C);
    const w0 = u0 - E, dw0 = (I0 ?? 0) / C;
    const disc = a * a - w02;
    let wf: (t: number) => [number, number];
    if (Math.abs(disc) <= 1e-9 * w02) {
      const k = dw0 + a * w0;
      wf = (t) => {
        const ex = Math.exp(-a * t);
        return [ex * (w0 + k * t), ex * (k - a * (w0 + k * t))];
      };
    } else if (disc < 0) {
      const wd = Math.sqrt(-disc), B = (dw0 + a * w0) / wd;
      wf = (t) => {
        const ex = Math.exp(-a * t), cs = Math.cos(wd * t), sn = Math.sin(wd * t);
        return [ex * (w0 * cs + B * sn), ex * (-a * (w0 * cs + B * sn) + wd * (-w0 * sn + B * cs))];
      };
    } else {
      const sq = Math.sqrt(disc), s1 = -a + sq, s2 = -a - sq;
      const c1 = (dw0 - s2 * w0) / (s1 - s2), c2 = w0 - c1;
      wf = (t) => {
        const e1 = Math.exp(s1 * t), e2 = Math.exp(s2 * t);
        return [c1 * e1 + c2 * e2, c1 * s1 * e1 + c2 * s2 * e2];
      };
    }
    sol = (t) => {
      const [w, dw] = wf(t);
      return { I: C * dw, q: C * (w - w0) };
    };
  }
  if (sol) {
    const f = sol;
    info.loop = (tAbs) => {
      const t = Math.max(0, tAbs - t0);
      const d = 1e-5 * Math.max(1e-3, info.tau ?? (info.omega0 ? 1 / info.omega0 : 1));
      const st = f(t);
      const dI = (f(t + d).I - f(Math.max(0, t - d)).I) / (t - d >= 0 ? 2 * d : d + t);
      return { I: st.I, dI, q: st.q };
    };
    info.element = elementFrom(info.loop, false);
    info.hasSolution = true;
  }
  return info;
}

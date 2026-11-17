// Travelling waves and plane electromagnetic waves.

import { V3, cross, perp } from '../engine/math';

export type Axis = 'x' | 'y' | 'z';
export const AXES: Axis[] = ['x', 'y', 'z'];
export type Sign = 1 | -1;

/** Unit vector along an axis (optionally negative). */
export function unit(axis: Axis, sign: number = 1): V3 {
  const v: V3 = [0, 0, 0];
  v[AXES.indexOf(axis)] = sign >= 0 ? 1 : -1;
  return v;
}

/** The axis and sign of an axis-aligned vector. */
export function axisOf(v: readonly number[]): { axis: Axis; sign: Sign } {
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(v[i]) > Math.abs(v[best])) best = i;
  return { axis: AXES[best], sign: v[best] >= 0 ? 1 : -1 };
}

// ---------- 1D travelling wave ----------

/**
 * f(x, t) = A cos(a x - form * b t).
 * form = +1 is the "ax - bt" form, form = -1 is the "ax + bt" form.
 */
export interface Wave1D {
  A: number;
  a: number;
  b: number;
  form: Sign;
}

export const wavePhase = (w: Wave1D, x: number, t: number) => w.a * x - w.form * w.b * t;
export const waveValue = (w: Wave1D, x: number, t: number) => w.A * Math.cos(wavePhase(w, x, t));
/** lambda = 2 pi / a */
export const wavelength = (a: number) => (2 * Math.PI) / Math.abs(a);
/** T = 2 pi / b */
export const period = (b: number) => (2 * Math.PI) / Math.abs(b);
/** f = b / 2 pi */
export const frequency = (b: number) => Math.abs(b) / (2 * Math.PI);
/** v = b / a (a speed, always positive) */
export const waveSpeed = (a: number, b: number) => Math.abs(b / a);
/** Signed velocity of the pattern along x. */
export const waveVelocity = (w: Wave1D) => (w.form * w.b) / w.a;
/** +1 if the wave moves toward +x, -1 toward -x. "ax - bt" moves toward +x. */
export const waveDirection = (w: Wave1D): Sign => (waveVelocity(w) >= 0 ? 1 : -1);

/** Position of the crest closest to x at time t. */
export function nearestCrest(w: Wave1D, x: number, t: number): number {
  const n = Math.round(wavePhase(w, x, t) / (2 * Math.PI));
  return (2 * Math.PI * n + w.form * w.b * t) / w.a;
}

/** Most recent time (<= t) at which a crest passed position x. */
export function lastCrestTime(w: Wave1D, x: number, t: number): number {
  const T = period(w.b);
  const t0 = (w.a * x) / (w.form * w.b); // a crest (phase 0) passes x at this time
  const since = (((t - t0) % T) + T) % T;
  return t - since;
}

/** Numerical second derivative in x of any f(x, t). */
export function d2dx2(f: (x: number, t: number) => number, x: number, t: number, h = 1e-3): number {
  return (f(x + h, t) - 2 * f(x, t) + f(x - h, t)) / (h * h);
}

/** Numerical second derivative in t of any f(x, t). */
export function d2dt2(f: (x: number, t: number) => number, x: number, t: number, h = 1e-3): number {
  return (f(x, t + h) - 2 * f(x, t) + f(x, t - h)) / (h * h);
}

// ---------- plane electromagnetic waves ----------

/** Direction of B given the direction of travel k and the direction of E (E x B points along k). */
export function bDirection(k: readonly number[], e: readonly number[]): V3 {
  return cross(k, e);
}

/** Direction of E given the direction of travel k and the direction of B. */
export function eDirection(k: readonly number[], b: readonly number[]): V3 {
  return cross(b, k);
}

/** A field written as  (field) = +/- F0 cos(a * variable -/+ b t) along `comp`. */
export interface GivenField {
  field: 'E' | 'B';
  /** Axis the given field points along. */
  comp: Axis;
  compSign: Sign;
  /** Coordinate that appears in the argument of the cosine. */
  variable: Axis;
  /** +1 for (a x - b t), -1 for (a x + b t). */
  form: Sign;
  a: number;
  b: number;
}

export interface WaveAnalysis {
  valid: boolean;
  reason?: string;
  speed: number;
  wavelength: number;
  period: number;
  /** Direction of travel. */
  travel: { axis: Axis; sign: Sign };
  k: V3;
  e: V3;
  b: V3;
  /** Direction of the field that was not given, at the instants the given field points along +/- comp. */
  other: { axis: Axis; sign: Sign };
}

/** Read off everything about a plane EM wave from one of its field components (Problem 65). */
export function analyseField(g: GivenField): WaveAnalysis {
  const sign: Sign = g.form * Math.sign(g.b / g.a) >= 0 ? 1 : -1;
  const k = unit(g.variable, sign);
  const base = {
    speed: waveSpeed(g.a, g.b),
    wavelength: wavelength(g.a),
    period: period(g.b),
    travel: { axis: g.variable, sign },
    k,
  };
  if (g.comp === g.variable) {
    return {
      ...base, valid: false,
      reason: 'Electromagnetic waves are transverse: the field cannot point along the direction of travel.',
      e: [0, 0, 0], b: [0, 0, 0], other: { axis: g.comp, sign: 1 },
    };
  }
  const given = unit(g.comp, g.compSign);
  const e = g.field === 'E' ? given : eDirection(k, given);
  const b = g.field === 'B' ? given : bDirection(k, given);
  return { ...base, valid: true, e, b, other: axisOf(g.field === 'E' ? b : e) };
}

// ---------- loop in a wave ----------
// Wave travelling along +z:  E = E0 cos(k z - w t) x-hat,  B = B0 cos(k z - w t) y-hat.

/** Unit normal from a polar angle (from +z) and an azimuth (from +x toward +y), in degrees. */
export function loopNormal(thetaDeg: number, phiDeg: number): V3 {
  const th = (thetaDeg * Math.PI) / 180, ph = (phiDeg * Math.PI) / 180;
  return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
}

/**
 * C = integral of cos(k z) dA and S = integral of sin(k z) dA over a flat disc of radius R
 * with unit normal n centred at height z0. For a loop much smaller than the wavelength C -> pi R^2.
 */
export function discPhasors(n: readonly number[], R: number, k: number, z0 = 0, nr = 24, nphi = 48) {
  const u = perp(n);
  const v = cross(n, u);
  let c = 0, s = 0;
  const dr = R / nr, dphi = (2 * Math.PI) / nphi;
  for (let i = 0; i < nr; i++) {
    const r = (i + 0.5) * dr;
    const dA = r * dr * dphi;
    for (let j = 0; j < nphi; j++) {
      const ph = (j + 0.5) * dphi;
      const z = z0 + r * (Math.cos(ph) * u[2] + Math.sin(ph) * v[2]);
      c += Math.cos(k * z) * dA;
      s += Math.sin(k * z) * dA;
    }
  }
  return { c, s, area: Math.PI * R * R };
}

export interface LoopFluxes {
  /** Magnetic flux through the loop. */
  phiB: number;
  /** Induced emf = -d(phiB)/dt. */
  emf: number;
  /** Electric flux through the loop. */
  phiE: number;
  /** d(phiE)/dt, the thing that acts as a displacement current. */
  dPhiE: number;
  /** Peak values over a cycle. */
  emfAmp: number;
  dPhiEAmp: number;
}

/** Fluxes and their rates of change through a circular loop sitting in the wave above. */
export function loopFluxes(n: readonly number[], R: number, k: number, omega: number, t: number, E0 = 1, B0 = 1, z0 = 0): LoopFluxes {
  const { c, s } = discPhasors(n, R, k, z0);
  const cw = Math.cos(omega * t), sw = Math.sin(omega * t);
  // integral of cos(kz - wt) dA = C cos(wt) + S sin(wt)
  const integral = c * cw + s * sw;
  const rate = omega * (-c * sw + s * cw);
  const mag = omega * Math.hypot(c, s);
  return {
    phiB: B0 * n[1] * integral,
    emf: -B0 * n[1] * rate,
    phiE: E0 * n[0] * integral,
    dPhiE: E0 * n[0] * rate,
    emfAmp: Math.abs(B0 * n[1]) * mag,
    dPhiEAmp: Math.abs(E0 * n[0]) * mag,
  };
}

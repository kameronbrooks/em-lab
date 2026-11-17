// Faraday's law for the scenarios in the induction lab: flux and emf = -dPhi/dt.

import { MU0 } from './fields';

/** How a uniform field changes in time. */
export type Profile =
  | { kind: 'linear'; A: number } // B = A t
  | { kind: 'cos'; b: number; w: number } // B = b cos(w t)
  | { kind: 'exp'; C: number; a: number } // B = C exp(-a t)
  | { kind: 'const'; B: number };

export function profileB(p: Profile, t: number): number {
  switch (p.kind) {
    case 'linear': return p.A * t;
    case 'cos': return p.b * Math.cos(p.w * t);
    case 'exp': return p.C * Math.exp(-p.a * t);
    case 'const': return p.B;
  }
}

export function profileDB(p: Profile, t: number): number {
  switch (p.kind) {
    case 'linear': return p.A;
    case 'cos': return -p.b * p.w * Math.sin(p.w * t);
    case 'exp': return -p.C * p.a * Math.exp(-p.a * t);
    case 'const': return 0;
  }
}

/** Area of a circular loop of radius `size` or a square loop of side `size`. */
export function loopArea(shape: 'circle' | 'square', size: number): number {
  return shape === 'circle' ? Math.PI * size * size : size * size;
}

/** Flux of a uniform field through a flat loop. cosTheta is the cosine of the angle between B and the loop normal. */
export function fluxUniform(p: Profile, area: number, cosTheta: number, t: number): number {
  return profileB(p, t) * area * cosTheta;
}

/** emf = -dPhi/dt for a fixed loop in a uniform, time-varying field. */
export function emfUniform(p: Profile, area: number, cosTheta: number, t: number): number {
  return -profileDB(p, t) * area * cosTheta;
}

export interface SlideParams {
  /** Field (along the loop normal) inside the region. */
  B: number;
  /** Loop width along the motion and height across it. */
  w: number;
  h: number;
  /** Speed of the loop. */
  v: number;
  /** Position of the leading edge at t = 0. */
  x0: number;
  /** The field fills regionStart < x < regionEnd. */
  regionStart: number;
  regionEnd: number;
}

/** A rectangular loop sliding at constant speed through a region of uniform field. */
export function slidingLoop(s: SlideParams, t: number) {
  const front = s.x0 + s.v * t;
  const back = front - s.w;
  const overlap = Math.max(0, Math.min(front, s.regionEnd) - Math.max(back, s.regionStart));
  const inside = (x: number) => (x > s.regionStart && x < s.regionEnd ? 1 : 0);
  const dOverlap = s.v * (inside(front) - inside(back));
  return { front, overlap, flux: s.B * s.h * overlap, emf: dOverlap === 0 ? 0 : -s.B * s.h * dOverlap };
}

/** Field inside an ideal solenoid. */
export const solenoidField = (n: number, I: number, mu0 = MU0) => mu0 * n * I;

/** A loop of radius a (resistance R) rotating at angular frequency w in a uniform field B0. */
export function rotatingLoop(B0: number, a: number, w: number, R: number, t: number) {
  const A = Math.PI * a * a;
  const flux = B0 * A * Math.cos(w * t);
  const emf = B0 * A * w * Math.sin(w * t);
  return { flux, emf, current: emf / R, maxCurrent: (B0 * A * Math.abs(w)) / R };
}

/** A square loop whose area shrinks at a steady rate from L^2 to (L/2)^2 in a time tStar, in a constant field B. */
export function stretchLoop(B: number, L: number, tStar: number, t: number) {
  const tt = Math.min(Math.max(t, 0), tStar);
  const A0 = L * L, A1 = (L * L) / 4;
  const area = A0 + ((A1 - A0) * tt) / tStar;
  const moving = t >= 0 && t < tStar;
  return { side: Math.sqrt(area), area, flux: B * area, emf: moving ? (B * (A0 - A1)) / tStar : 0 };
}

/** Problem 40 turned around: the field that gives emf chi when the square shrinks from L to L/2 in tStar. */
export const stretchFieldFromEmf = (chi: number, L: number, tStar: number) => (4 * chi * tStar) / (3 * L * L);

/** Induced electric field on a circle of radius R around a changing flux: E (2 pi R) = |emf|. */
export const inducedE = (emf: number, R: number) => emf / (2 * Math.PI * R);

/**
 * Flux through a rectangle that lies in a plane containing a long straight wire: the near side is a
 * distance d from the wire, the far side d + w, and the rectangle has length `length` along the wire.
 */
export function fluxBesideWire(I: number, length: number, d: number, w: number, mu0 = MU0): number {
  return ((mu0 * I * length) / (2 * Math.PI)) * Math.log((d + w) / d);
}

/** emf from any flux function by a centred difference. */
export function numericEmf(flux: (t: number) => number, t: number, h = 1e-5): number {
  return -(flux(t + h) - flux(t - h)) / (2 * h);
}

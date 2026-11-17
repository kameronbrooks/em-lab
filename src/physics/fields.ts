// Electric fields and potentials of point charges.
//
// Unit convention used by the labs: charge in nanocoulombs (nC), distance in metres.
// With that choice E comes out in N/C and V in volts if we use K_NC = k * 1e-9.

import { V3 } from '../engine/math';

export const K = 8.9875517923e9; // N m^2 / C^2
export const EPS0 = 8.8541878128e-12; // C^2 / (N m^2)
export const MU0 = 4e-7 * Math.PI; // T m / A
export const C_LIGHT = 299792458; // m / s
/** Coulomb constant for charges in nC: E [N/C] = K_NC * q[nC] / r[m]^2. */
export const K_NC = K * 1e-9;

export interface PointCharge {
  x: number;
  y: number;
  z?: number;
  /** Charge in nC. */
  q: number;
}

/** Electric field (N/C) at a point from a set of point charges (nC, metres). */
export function eField(charges: readonly PointCharge[], x: number, y: number, z = 0): V3 {
  let ex = 0, ey = 0, ez = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x, dy = y - c.y, dz = z - (c.z ?? 0);
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-12) continue;
    const f = (K_NC * c.q) / (r2 * Math.sqrt(r2));
    ex += f * dx;
    ey += f * dy;
    ez += f * dz;
  }
  return [ex, ey, ez];
}

/** Field of a single charge at a point. */
export function eFieldOf(c: PointCharge, x: number, y: number, z = 0): V3 {
  const dx = x - c.x, dy = y - c.y, dz = z - (c.z ?? 0);
  const r2 = dx * dx + dy * dy + dz * dz;
  if (r2 < 1e-12) return [0, 0, 0];
  const f = (K_NC * c.q) / (r2 * Math.sqrt(r2));
  return [f * dx, f * dy, f * dz];
}

/** Electric potential (V) at a point, zero at infinity. */
export function potential(charges: readonly PointCharge[], x: number, y: number, z = 0): number {
  let v = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const r = Math.hypot(x - c.x, y - c.y, z - (c.z ?? 0));
    if (r < 1e-6) continue;
    v += (K_NC * c.q) / r;
  }
  return v;
}

export interface FieldLine {
  /** Flat xyz points. */
  pts: Float32Array;
  n: number;
}

export interface FieldLineOpts {
  /** Lines per nC of charge. */
  density?: number;
  maxLinesPerCharge?: number;
  /** Stop tracing outside this box. */
  bounds: { x0: number; x1: number; y0: number; y1: number };
  maxSteps?: number;
  /** Capture radius around charges. */
  capture?: number;
}

/**
 * Trace 2D field lines (z = 0 plane). Lines start on positive charges and are followed along E.
 * Negative charges that did not receive their share of lines get extra lines traced backwards,
 * so the number of lines touching each charge stays proportional to |q|.
 */
export function traceFieldLines(charges: readonly PointCharge[], opts: FieldLineOpts): FieldLine[] {
  const density = opts.density ?? 6;
  const maxPer = opts.maxLinesPerCharge ?? 32;
  const capture = opts.capture ?? 0.09;
  const maxSteps = opts.maxSteps ?? 1400;
  const b = opts.bounds;
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const hMax = Math.max(0.02, span / 260);
  const lines: FieldLine[] = [];
  const arrivals: number[][] = charges.map(() => []);
  const count = (q: number) => Math.max(4, Math.min(maxPer, Math.round(Math.abs(q) * density)));

  const trace = (x: number, y: number, dir: 1 | -1): FieldLine => {
    const pts: number[] = [x, y, 0];
    for (let s = 0; s < maxSteps; s++) {
      // nearest charge distance controls the step
      let dMin = Infinity, near = -1;
      for (let i = 0; i < charges.length; i++) {
        const d = Math.hypot(x - charges[i].x, y - charges[i].y);
        if (d < dMin) {
          dMin = d;
          near = i;
        }
      }
      if (near >= 0 && dMin < capture && s > 2) {
        const c = charges[near];
        const ends = dir === 1 ? c.q < 0 : c.q > 0;
        if (ends) {
          arrivals[near].push(Math.atan2(y - c.y, x - c.x));
          pts.push(c.x, c.y, 0);
          break;
        }
      }
      const h = Math.min(hMax, Math.max(0.004, dMin * 0.22));
      // midpoint (RK2) step along the unit field direction
      const e1 = eField(charges, x, y);
      const m1 = Math.hypot(e1[0], e1[1]);
      if (m1 < 1e-9) break;
      const mx = x + ((dir * e1[0]) / m1) * h * 0.5;
      const my = y + ((dir * e1[1]) / m1) * h * 0.5;
      const e2 = eField(charges, mx, my);
      const m2 = Math.hypot(e2[0], e2[1]);
      if (m2 < 1e-9) break;
      x += ((dir * e2[0]) / m2) * h;
      y += ((dir * e2[1]) / m2) * h;
      pts.push(x, y, 0);
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) break;
    }
    const n = pts.length / 3;
    const out = new Float32Array(pts.length);
    if (dir === 1) out.set(pts);
    else {
      // traced against the field: store reversed so the points always run along E
      for (let p = 0; p < n; p++) {
        const src = (n - 1 - p) * 3;
        out[p * 3] = pts[src];
        out[p * 3 + 1] = pts[src + 1];
        out[p * 3 + 2] = pts[src + 2];
      }
    }
    return { pts: out, n };
  };

  // 1. forward from positive charges
  charges.forEach((c) => {
    if (c.q <= 0) return;
    const n = count(c.q);
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      lines.push(trace(c.x + Math.cos(a) * capture * 1.05, c.y + Math.sin(a) * capture * 1.05, 1));
    }
  });
  // 2. backward from negative charges for the lines that are still missing
  charges.forEach((c, i) => {
    if (c.q >= 0) return;
    const want = count(c.q);
    const have = arrivals[i].slice().sort((a, b2) => a - b2);
    let missing = want - have.length;
    if (missing <= 0) return;
    if (have.length === 0) {
      for (let k = 0; k < want; k++) {
        const a = ((k + 0.5) / want) * Math.PI * 2;
        lines.push(trace(c.x + Math.cos(a) * capture * 1.05, c.y + Math.sin(a) * capture * 1.05, -1));
      }
      return;
    }
    while (missing-- > 0) {
      // put the next line in the middle of the widest angular gap
      let best = 0, bestGap = -1;
      for (let k = 0; k < have.length; k++) {
        const a0 = have[k];
        const a1 = k + 1 < have.length ? have[k + 1] : have[0] + Math.PI * 2;
        if (a1 - a0 > bestGap) {
          bestGap = a1 - a0;
          best = k;
        }
      }
      const a = have[best] + bestGap / 2;
      have.splice(best + 1, 0, a);
      lines.push(trace(c.x + Math.cos(a) * capture * 1.05, c.y + Math.sin(a) * capture * 1.05, -1));
    }
  });
  return lines;
}

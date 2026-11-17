// Magnetic fields, forces and the particle pusher used by the magnetism labs.
// Everything here is plain SI unless a lab says otherwise.

import { P, V3, add, addScaled, cross, dot, len, norm, perp, scale, sub } from '../engine/math';
import { MU0 } from './fields';

export interface ParticleState {
  x: V3;
  v: V3;
}

/** Lorentz force F = q(E + v x B). */
export function lorentzForce(q: number, v: P, E: P, B: P): V3 {
  const c = cross(v, B);
  return [q * (E[0] + c[0]), q * (E[1] + c[1]), q * ((E[2] ?? 0) + c[2])];
}

/** Magnetic part only: F = q v x B. Always perpendicular to v, so it never does work. */
export function magneticForce(q: number, v: P, B: P): V3 {
  return scale(cross(v, B), q);
}

/**
 * One Boris step. The magnetic part is a pure rotation of the velocity, so in a pure
 * magnetic field the speed is conserved to rounding error for any step size.
 */
export function borisStep(s: ParticleState, qOverM: number, E: P, B: P, dt: number): void {
  const h = 0.5 * dt * qOverM;
  // half electric kick
  const vm: V3 = [s.v[0] + E[0] * h, s.v[1] + E[1] * h, s.v[2] + (E[2] ?? 0) * h];
  // magnetic rotation
  const t: V3 = [B[0] * h, B[1] * h, (B[2] ?? 0) * h];
  const t2 = t[0] * t[0] + t[1] * t[1] + t[2] * t[2];
  const k = 2 / (1 + t2);
  const c1 = cross(vm, t);
  const vp: V3 = [vm[0] + c1[0], vm[1] + c1[1], vm[2] + c1[2]];
  const c2 = cross(vp, t);
  const vplus: V3 = [vm[0] + c2[0] * k, vm[1] + c2[1] * k, vm[2] + c2[2] * k];
  // second half electric kick
  s.v = [vplus[0] + E[0] * h, vplus[1] + E[1] * h, vplus[2] + (E[2] ?? 0) * h];
  s.x = [s.x[0] + s.v[0] * dt, s.x[1] + s.v[1] * dt, s.x[2] + s.v[2] * dt];
}

/** Radius of the circular motion: r = m v_perp / (|q| B). */
export function cyclotronRadius(m: number, vPerp: number, q: number, B: number): number {
  return (m * vPerp) / (Math.abs(q) * B);
}

/** Period of the circular motion: T = 2 pi m / (|q| B). Does not depend on speed. */
export function cyclotronPeriod(m: number, q: number, B: number): number {
  return (2 * Math.PI * m) / (Math.abs(q) * B);
}

/**
 * Field of an infinitely long straight wire through `point` along `dir`, current I positive along dir.
 * B = mu0 I / (2 pi r), circling the wire by the right-hand rule. A small `core` radius makes the
 * field fall linearly to zero on the axis (a wire of finite thickness) instead of blowing up.
 */
export function wireB(I: number, point: P, dir: P, p: P, core = 0, mu0 = MU0): V3 {
  const d = norm(dir);
  const rel = sub(p, point);
  const radial = addScaled(rel, d, -dot(rel, d));
  const r = len(radial);
  if (r < 1e-12) return [0, 0, 0];
  const mag = r >= core ? (mu0 * I) / (2 * Math.PI * r) : (mu0 * I * r) / (2 * Math.PI * core * core);
  return scale(cross(d, radial), mag / r);
}

/**
 * Field of an infinite sheet of current. `normal` is the sheet normal, `currentDir` lies in the sheet,
 * K is the current per unit width (A/m). |B| = mu0 K / 2 on both sides, with opposite directions.
 */
export function sheetB(K: number, normal: P, currentDir: P, planePoint: P, p: P, mu0 = MU0): V3 {
  const n = norm(normal);
  const s = dot(sub(p, planePoint), n);
  if (Math.abs(s) < 1e-12) return [0, 0, 0];
  return scale(cross(norm(currentDir), n), ((s > 0 ? 1 : -1) * mu0 * K) / 2);
}

/** Ideal infinitely long solenoid: B = mu0 n I along the axis inside, zero outside. */
export function solenoidB(n: number, I: number, axisPoint: P, axisDir: P, R: number, p: P, mu0 = MU0): V3 {
  const d = norm(axisDir);
  const rel = sub(p, axisPoint);
  const r = len(addScaled(rel, d, -dot(rel, d)));
  return r < R ? scale(d, mu0 * n * I) : [0, 0, 0];
}

export interface BiotSavartSum {
  /** Midpoint of every piece. */
  mids: V3[];
  /** Contribution of every piece, dB = mu0 I / (4 pi) * dl x r / r^3. */
  dB: V3[];
  total: V3;
}

/** Biot-Savart law for a straight wire from a to b, chopped into N pieces. */
export function biotSavartPieces(I: number, a: P, b: P, N: number, p: P, mu0 = MU0): BiotSavartSum {
  const mids: V3[] = [];
  const dBs: V3[] = [];
  const total: V3 = [0, 0, 0];
  const dl = scale(sub(b, a), 1 / N);
  for (let i = 0; i < N; i++) {
    const mid = addScaled(a, dl, i + 0.5);
    const r = sub(p, mid);
    const r3 = Math.pow(len(r), 3);
    const dB: V3 = r3 > 1e-18 ? scale(cross(dl, r), (mu0 * I) / (4 * Math.PI * r3)) : [0, 0, 0];
    mids.push(mid);
    dBs.push(dB);
    total[0] += dB[0];
    total[1] += dB[1];
    total[2] += dB[2];
  }
  return { mids, dB: dBs, total };
}

/** Exact field of a straight wire of finite length from a to b. Tends to wireB as the wire gets long. */
export function finiteWireB(I: number, a: P, b: P, p: P, mu0 = MU0): V3 {
  const e = norm(sub(b, a));
  const ra = sub(p, a);
  const rb = sub(p, b);
  const radial = addScaled(ra, e, -dot(ra, e));
  const d = len(radial);
  if (d < 1e-12) return [0, 0, 0];
  const s1 = dot(ra, e) / len(ra);
  const s2 = dot(rb, e) / len(rb);
  return scale(cross(e, radial), ((mu0 * I) / (4 * Math.PI * d * d)) * (s1 - s2));
}

/** Line integral of a field along a path of points (closed by default), 2-point Gauss rule per segment. */
export function lineIntegral(path: readonly P[], field: (p: V3) => P, closed = true): number {
  const n = path.length;
  const g = 0.5 - Math.sqrt(3) / 6;
  let sum = 0;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const d = sub(b, a);
    const f1 = field(addScaled(a, d, g));
    const f2 = field(addScaled(a, d, 1 - g));
    sum += 0.5 * (dot(f1, d) + dot(f2, d));
  }
  return sum;
}

/** Points on a circle, counter-clockwise when seen with `normal` pointing at the viewer. Not repeated at the end. */
export function circlePath(center: P, radius: number, normal: P = [0, 0, 1], n = 360): V3[] {
  const nn = norm(normal);
  // pick u so that for normal = +z the circle starts on +x and runs toward +y
  const u: V3 = Math.abs(nn[2]) > 0.999 ? [1, 0, 0] : perp(nn);
  const v = cross(nn, u);
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(add(center, add(scale(u, Math.cos(a) * radius), scale(v, Math.sin(a) * radius))));
  }
  return pts;
}

/** Points on a rectangle spanned by unit vectors u and v (counter-clockwise about u x v). */
export function rectPath(center: P, u: P, v: P, w: number, h: number, perSide = 90): V3[] {
  const corners: V3[] = [
    add(center, add(scale(u, -w / 2), scale(v, -h / 2))),
    add(center, add(scale(u, w / 2), scale(v, -h / 2))),
    add(center, add(scale(u, w / 2), scale(v, h / 2))),
    add(center, add(scale(u, -w / 2), scale(v, h / 2))),
  ];
  const pts: V3[] = [];
  for (let s = 0; s < 4; s++) {
    const a = corners[s], b = corners[(s + 1) % 4];
    for (let i = 0; i < perSide; i++) pts.push(addScaled(a, sub(b, a), i / perSide));
  }
  return pts;
}

/** Force per unit length between two long parallel wires. Positive means they attract (currents the same way). */
export function forcePerLength(I1: number, I2: number, d: number, mu0 = MU0): number {
  return (mu0 * I1 * I2) / (2 * Math.PI * d);
}

/** Force on a straight piece of wire from a to b carrying current I in a uniform field: F = I L x B. */
export function forceOnSegment(I: number, a: P, b: P, B: P): V3 {
  return scale(cross(sub(b, a), B), I);
}

/** Magnetic flux through a flat disc (an open surface): integral of B . n dA. */
export function fluxThroughDisc(center: P, normal: P, radius: number, field: (p: V3) => P, nr = 16, nth = 48): number {
  const n = norm(normal);
  const u: V3 = Math.abs(n[2]) > 0.999 ? [1, 0, 0] : perp(n);
  const v = cross(n, u);
  let sum = 0;
  for (let i = 0; i < nr; i++) {
    const r = ((i + 0.5) / nr) * radius;
    const dA = r * (radius / nr) * ((Math.PI * 2) / nth);
    for (let j = 0; j < nth; j++) {
      const a = ((j + 0.5) / nth) * Math.PI * 2;
      const p = add(center, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r)));
      sum += dot(field(p), n) * dA;
    }
  }
  return sum;
}

/** Net outward magnetic flux through a closed sphere. Always zero for a real magnetic field. */
export function fluxThroughSphere(center: P, radius: number, field: (p: V3) => P, nTheta = 24, nPhi = 48): number {
  let sum = 0;
  for (let i = 0; i < nTheta; i++) {
    const th = ((i + 0.5) / nTheta) * Math.PI;
    const dA = radius * radius * Math.sin(th) * (Math.PI / nTheta) * ((Math.PI * 2) / nPhi);
    for (let j = 0; j < nPhi; j++) {
      const ph = ((j + 0.5) / nPhi) * Math.PI * 2;
      const n: V3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      sum += dot(field(addScaled(center, n, radius)), n) * dA;
    }
  }
  return sum;
}

/** Net outward magnetic flux through a closed axis-aligned cube of half-side `half`. */
export function fluxThroughCube(center: P, half: number, field: (p: V3) => P, n = 12): number {
  let sum = 0;
  const dA = Math.pow((2 * half) / n, 2);
  for (let axis = 0; axis < 3; axis++) {
    for (const sgn of [-1, 1]) {
      const normal: V3 = [0, 0, 0];
      normal[axis] = sgn;
      const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p: V3 = [center[0], center[1], center[2] ?? 0];
          p[axis] += sgn * half;
          p[a1] += (((i + 0.5) / n) * 2 - 1) * half;
          p[a2] += (((j + 0.5) / n) * 2 - 1) * half;
          sum += dot(field(p), normal) * dA;
        }
      }
    }
  }
  return sum;
}

// Electric flux through triangulated surfaces.
//
// For point charges the flux through a flat triangle is exact: it is q/(4 pi eps0) times the
// solid angle the triangle subtends at the charge. Summed over a closed mesh this gives exactly
// q/eps0 for a charge inside and 0 for a charge outside, whatever the mesh resolution.

import { V3 } from '../engine/math';
import { K_NC } from './fields';

export interface Charge3 {
  x: number;
  y: number;
  z: number;
  /** nC */
  q: number;
}

/** q/eps0 for q = 1 nC, in N m^2 / C. */
export const FLUX_UNIT = K_NC * 4 * Math.PI;

/**
 * Signed solid angle of triangle (a, b, c) seen from point p (Van Oosterom & Strackee).
 * Positive when p is on the side the triangle's normal (b-a)x(c-a) points away from.
 */
export function solidAngle(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  ax -= px; ay -= py; az -= pz;
  bx -= px; by -= py; bz -= pz;
  cx -= px; cy -= py; cz -= pz;
  const la = Math.sqrt(ax * ax + ay * ay + az * az);
  const lb = Math.sqrt(bx * bx + by * by + bz * bz);
  const lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const num = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (ax * cx + ay * cy + az * cz) * lb + (bx * cx + by * cy + bz * cz) * la;
  return 2 * Math.atan2(num, den);
}

export interface FluxResult {
  /** Total flux in N m^2 / C. */
  total: number;
  /** Flux through each triangle. */
  perTri: Float32Array;
  /** Area of each triangle. */
  area: Float32Array;
}

/**
 * Flux of point charges plus a uniform field through oriented triangles.
 * `pos` holds world-space xyz per vertex; `idx` holds vertex indices, three per triangle,
 * ordered so (b-a)x(c-a) is the outward normal.
 */
export function fluxThroughMesh(
  pos: Float32Array,
  idx: ArrayLike<number>,
  charges: readonly Charge3[],
  uniform: V3 = [0, 0, 0],
  out?: FluxResult,
): FluxResult {
  const nt = Math.floor(idx.length / 3);
  const res = out && out.perTri.length === nt ? out : { total: 0, perTri: new Float32Array(nt), area: new Float32Array(nt) };
  let total = 0;
  const hasUniform = uniform[0] !== 0 || uniform[1] !== 0 || uniform[2] !== 0;
  for (let t = 0; t < nt; t++) {
    const ia = idx[t * 3] * 3, ib = idx[t * 3 + 1] * 3, ic = idx[t * 3 + 2] * 3;
    const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
    const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];
    // area vector = 0.5 (b-a) x (c-a)
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = 0.5 * (uy * vz - uz * vy), ny = 0.5 * (uz * vx - ux * vz), nz = 0.5 * (ux * vy - uy * vx);
    res.area[t] = Math.sqrt(nx * nx + ny * ny + nz * nz);
    let f = hasUniform ? uniform[0] * nx + uniform[1] * ny + uniform[2] * nz : 0;
    for (let k = 0; k < charges.length; k++) {
      const c = charges[k];
      // The solid angle is positive when the charge is behind the outward face, i.e. field passes outward.
      f += K_NC * c.q * solidAngle(c.x, c.y, c.z, ax, ay, az, bx, by, bz, cx, cy, cz);
    }
    res.perTri[t] = f;
    total += f;
  }
  res.total = total;
  return res;
}

/** Electric field (N/C) of 3D point charges plus a uniform field. */
export function eField3(charges: readonly Charge3[], x: number, y: number, z: number, uniform: V3 = [0, 0, 0]): V3 {
  let ex = uniform[0], ey = uniform[1], ez = uniform[2];
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-10) continue;
    const f = (K_NC * c.q) / (r2 * Math.sqrt(r2));
    ex += f * dx;
    ey += f * dy;
    ez += f * dz;
  }
  return [ex, ey, ez];
}

/** Evenly spread unit vectors on a sphere (Fibonacci lattice). */
export function fibonacciSphere(n: number): V3[] {
  const pts: V3[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = g * i;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return pts;
}

export interface Line3 {
  pts: Float32Array;
  n: number;
}

/** Trace 3D field lines from point charges (forward from positive, backward from negative when needed). */
export function traceFieldLines3(
  charges: readonly Charge3[],
  uniform: V3,
  opts: { perCharge?: number; radius?: number; maxSteps?: number; capture?: number } = {},
): Line3[] {
  const per = opts.perCharge ?? 14;
  const R = opts.radius ?? 9;
  const maxSteps = opts.maxSteps ?? 500;
  const capture = opts.capture ?? 0.14;
  const dirs = fibonacciSphere(per);
  const lines: Line3[] = [];
  const hasPos = charges.some((c) => c.q > 0);

  const trace = (x: number, y: number, z: number, dir: 1 | -1): Line3 => {
    const pts: number[] = [x, y, z];
    for (let s = 0; s < maxSteps; s++) {
      let dMin = Infinity, near = -1;
      for (let i = 0; i < charges.length; i++) {
        const c = charges[i];
        const d = Math.hypot(x - c.x, y - c.y, z - c.z);
        if (d < dMin) {
          dMin = d;
          near = i;
        }
      }
      if (near >= 0 && dMin < capture && s > 2) {
        const c = charges[near];
        if (dir === 1 ? c.q < 0 : c.q > 0) {
          pts.push(c.x, c.y, c.z);
          break;
        }
      }
      const h = Math.min(0.12, Math.max(0.01, dMin * 0.25));
      const e1 = eField3(charges, x, y, z, uniform);
      const m1 = Math.hypot(e1[0], e1[1], e1[2]);
      if (m1 < 1e-9) break;
      const mx = x + ((dir * e1[0]) / m1) * h * 0.5, my = y + ((dir * e1[1]) / m1) * h * 0.5, mz = z + ((dir * e1[2]) / m1) * h * 0.5;
      const e2 = eField3(charges, mx, my, mz, uniform);
      const m2 = Math.hypot(e2[0], e2[1], e2[2]);
      if (m2 < 1e-9) break;
      x += ((dir * e2[0]) / m2) * h;
      y += ((dir * e2[1]) / m2) * h;
      z += ((dir * e2[2]) / m2) * h;
      pts.push(x, y, z);
      if (x * x + y * y + z * z > R * R) break;
    }
    const n = pts.length / 3;
    const out = new Float32Array(pts.length);
    if (dir === 1) out.set(pts);
    else {
      for (let p = 0; p < n; p++) {
        const src = (n - 1 - p) * 3;
        out[p * 3] = pts[src];
        out[p * 3 + 1] = pts[src + 1];
        out[p * 3 + 2] = pts[src + 2];
      }
    }
    return { pts: out, n };
  };

  for (const c of charges) {
    // Lines leave positive charges. Negative charges get their own lines only when nothing feeds them.
    if (c.q > 0 || !hasPos) {
      for (const d of dirs) {
        lines.push(trace(c.x + d[0] * capture * 1.1, c.y + d[1] * capture * 1.1, c.z + d[2] * capture * 1.1, c.q > 0 ? 1 : -1));
      }
    }
  }
  return lines;
}

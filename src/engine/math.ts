// Minimal vector / matrix maths for the engine. Column-major 4x4 matrices (WebGL convention).

export type V3 = [number, number, number];
/** Any point: [x, y] or [x, y, z]. Missing z is treated as 0. */
export type P = readonly number[];
export type Mat4 = Float32Array;

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: P, b: P): V3 => [a[0] + b[0], a[1] + b[1], (a[2] ?? 0) + (b[2] ?? 0)];
export const sub = (a: P, b: P): V3 => [a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)];
export const scale = (a: P, s: number): V3 => [a[0] * s, a[1] * s, (a[2] ?? 0) * s];
export const addScaled = (a: P, b: P, s: number): V3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  (a[2] ?? 0) + (b[2] ?? 0) * s,
];
export const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1] + (a[2] ?? 0) * (b[2] ?? 0);
export const cross = (a: P, b: P): V3 => {
  const az = a[2] ?? 0;
  const bz = b[2] ?? 0;
  return [a[1] * bz - az * b[1], az * b[0] - a[0] * bz, a[0] * b[1] - a[1] * b[0]];
};
export const len = (a: P): number => Math.hypot(a[0], a[1], a[2] ?? 0);
export const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0));
export const norm = (a: P): V3 => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, (a[2] ?? 0) / l] : [0, 0, 0];
};
export const lerp = (a: P, b: P, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t,
];
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Any unit vector perpendicular to `a`. */
export const perp = (a: P): V3 => {
  const n = norm(a);
  const ref: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(n, ref));
};

export function mat4(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mul(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  const t = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      t[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  out.set(t);
  return out;
}

export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}

export function lookAt(eye: P, target: P, up: P): Mat4 {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[12] = -dot(x, eye);
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[13] = -dot(y, eye);
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}

export function translation(p: P): Mat4 {
  const m = mat4();
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2] ?? 0;
  return m;
}

export function scaling(sx: number, sy = sx, sz = sx): Mat4 {
  const m = mat4();
  m[0] = sx; m[5] = sy; m[10] = sz;
  return m;
}

/** Rotation about an arbitrary axis (unit vector), angle in radians. */
export function rotation(axis: P, angle: number): Mat4 {
  const [x, y, z] = norm(axis);
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const m = mat4();
  m[0] = t * x * x + c;     m[4] = t * x * y - s * z; m[8] = t * x * z + s * y;
  m[1] = t * x * y + s * z; m[5] = t * y * y + c;     m[9] = t * y * z - s * x;
  m[2] = t * x * z - s * y; m[6] = t * y * z + s * x; m[10] = t * z * z + c;
  return m;
}

/** Build a model matrix from three basis vectors (columns) and an origin. */
export function basis(x: P, y: P, z: P, o: P = [0, 0, 0]): Mat4 {
  const m = mat4();
  m[0] = x[0]; m[1] = x[1]; m[2] = x[2] ?? 0;
  m[4] = y[0]; m[5] = y[1]; m[6] = y[2] ?? 0;
  m[8] = z[0]; m[9] = z[1]; m[10] = z[2] ?? 0;
  m[12] = o[0]; m[13] = o[1]; m[14] = o[2] ?? 0;
  return m;
}

/** Compose translate * rotate-to-align(+Y -> dir) * scale. Handy for cylinders/cones along a direction. */
export function alignY(origin: P, dir: P, radius: number, length: number): Mat4 {
  const y = norm(dir);
  const x = perp(y);
  const z = cross(x, y);
  return basis(scale(x, radius), scale(y, length), scale(z, radius), origin);
}

export function invert(a: Mat4): Mat4 {
  const o = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return mat4();
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

/** Transform a point by a 4x4 matrix, returning homogeneous [x, y, z, w]. */
export function transform(m: Mat4, p: P): [number, number, number, number] {
  const x = p[0], y = p[1], z = p[2] ?? 0;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

/** Transform a point (w = 1) and drop w. For affine model matrices. */
export function transformPoint(m: Mat4, p: P): V3 {
  const r = transform(m, p);
  return [r[0], r[1], r[2]];
}

/** Format a number compactly for readouts. */
export function fmt(x: number, digits = 3): string {
  if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
  const ax = Math.abs(x);
  if (ax === 0) return '0';
  if (ax < 1e-12) return '0';
  let s: string;
  if (ax >= 1e5 || ax < 1e-3) {
    const e = Math.floor(Math.log10(ax));
    const m = x / Math.pow(10, e);
    s = `${m.toFixed(Math.max(0, digits - 1))}×10${sup(e)}`;
  } else {
    s = x.toPrecision(digits);
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    if (s.includes('e')) s = String(Number(s));
  }
  return s.replace('-', '−');
}

function sup(n: number): string {
  const map: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(n).split('').map((c) => map[c] ?? c).join('');
}

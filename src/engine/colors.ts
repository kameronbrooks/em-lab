export type RGBA = [number, number, number, number];

export function hex(h: string, a = 1): RGBA {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
}

export const alpha = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], a];
export const mix = (a: RGBA, b: RGBA, t: number): RGBA => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];
export const css = (c: RGBA): string =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;

/** Shared physics palette. The same quantity is always the same colour in every lab. */
export const C = {
  bg: hex('#0a0e16'),
  grid: hex('#1a2233'),
  gridStrong: hex('#28344d'),
  axis: hex('#3a4a6b'),
  text: hex('#e6ecf7'),
  dim: hex('#8492ad'),
  white: hex('#ffffff'),
  /** positive charge */
  pos: hex('#ff5c5c'),
  /** negative charge */
  neg: hex('#4aa8ff'),
  /** electric field */
  E: hex('#ffc145'),
  /** magnetic field */
  B: hex('#2fe0c4'),
  /** velocity */
  v: hex('#86f26b'),
  /** force */
  F: hex('#ff6fd8'),
  /** current */
  I: hex('#ffe066'),
  /** potential / voltage */
  V: hex('#b48cff'),
  /** Poynting vector / propagation */
  S: hex('#ffffff'),
  good: hex('#5be39a'),
  warn: hex('#ffb347'),
  bad: hex('#ff6b6b'),
  surface: hex('#7aa2ff'),
};

/** Signed colour: warm for positive, cool for negative, neutral near zero. t in [-1, 1]. */
export function signed(t: number, a = 1): RGBA {
  const k = Math.min(1, Math.abs(t));
  const base: RGBA = [0.55, 0.6, 0.7, a];
  const target = t >= 0 ? C.pos : C.neg;
  const c = mix(base, target, Math.pow(k, 0.7));
  c[3] = a;
  return c;
}

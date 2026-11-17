// Shared drawing for plane electromagnetic waves (used by the EM wave lab and the loop lab).

import { C, RGBA, alpha, css } from '../../engine/colors';
import { V3, addScaled, scale } from '../../engine/math';
import { Renderer } from '../../engine/renderer';

export interface EMWaveDraw {
  /** Unit vector of the coordinate axis the wave runs along (the positive axis). */
  axis: V3;
  /** +1 if the wave travels toward the positive end of that axis, -1 otherwise. */
  travel: 1 | -1;
  /** Directions of E and B when the cosine is +1. */
  e: V3;
  b: V3;
  /** Wavenumber: phase = a * s - travel * phi. */
  a: number;
  /** Accumulated b * t. */
  phi: number;
  /** Arrow length at the peak, in world units. */
  amp: number;
  /** The wave is drawn for s in [-half, half]. */
  half: number;
  step?: number;
  showE?: boolean;
  showB?: boolean;
  /** Overall opacity (use < 1 to push the wave into the background). */
  opacity?: number;
}

export function drawEMWave(r: Renderer, o: EMWaveDraw) {
  const step = o.step ?? 0.3;
  const op = o.opacity ?? 1;
  const fields: [boolean, V3, RGBA][] = [
    [o.showE !== false, o.e, C.E],
    [o.showB !== false, o.b, C.B],
  ];
  // the axis itself
  r.seg(scale(o.axis, -o.half), scale(o.axis, o.half), alpha(C.dim, 0.7 * op), 1.2, 0, 0);
  for (const [show, dir, col] of fields) {
    if (!show) continue;
    const shaft = alpha(col, 0.72 * op);
    const n = Math.round((2 * o.half) / step);
    for (let i = 0; i <= n; i++) {
      const s = -o.half + (2 * o.half * i) / n;
      const c = Math.cos(o.a * s - o.travel * o.phi);
      if (Math.abs(c) < 0.04) continue;
      const base = scale(o.axis, s);
      r.arrow(base, addScaled(base, dir, o.amp * c), shaft, 1.6, 6.5);
    }
    // envelope through the arrow tips
    const m = n * 5;
    const pts = new Float32Array((m + 1) * 3);
    for (let i = 0; i <= m; i++) {
      const s = -o.half + (2 * o.half * i) / m;
      const p = addScaled(scale(o.axis, s), dir, o.amp * Math.cos(o.a * s - o.travel * o.phi));
      pts[i * 3] = p[0];
      pts[i * 3 + 1] = p[1];
      pts[i * 3 + 2] = p[2];
    }
    r.polyline(pts, alpha(col, 0.95 * op), 2);
  }
}

/** Faint coordinate axes through the origin with labelled positive ends. */
export function drawAxes(r: Renderer, length: number) {
  const names = ['x', 'y', 'z'];
  const cols: RGBA[] = [[0.95, 0.45, 0.45, 1], [0.5, 0.9, 0.5, 1], [0.45, 0.65, 1, 1]];
  for (let i = 0; i < 3; i++) {
    const d: V3 = [0, 0, 0];
    d[i] = 1;
    r.seg(scale(d, -length), scale(d, length), alpha(cols[i], 0.28), 1, 0, 0);
    r.arrow(scale(d, length), scale(d, length + 0.6), alpha(cols[i], 0.9), 2, 9);
    r.label(scale(d, length + 0.95), names[i], { color: css(cols[i]), size: 14, bold: true });
  }
}

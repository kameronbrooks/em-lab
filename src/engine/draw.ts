// Higher-level drawing helpers built on the Renderer.

import { Camera2D } from './camera';
import { C, RGBA, alpha, css } from './colors';
import { P, V3, add, addScaled, cross, fmt, norm, perp, scale } from './math';
import { Renderer } from './renderer';

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

export interface GridOpts {
  labels?: boolean;
  /** Target spacing between major lines in pixels. */
  spacing?: number;
  axes?: boolean;
  unit?: string;
}

/** Adaptive 2D grid with optional axis tick labels. */
export function grid2D(r: Renderer, cam: Camera2D, opts: GridOpts = {}) {
  const { x0, x1, y0, y1 } = cam.bounds();
  const step = niceStep((opts.spacing ?? 90) / cam.zoom);
  const minor = step / 5;
  const drawLines = (s: number, col: RGBA, w: number) => {
    for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) r.seg([x, y0], [x, y1], col, w, 0, 0);
    for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) r.seg([x0, y], [x1, y], col, w, 0, 0);
  };
  if (minor * cam.zoom > 9) drawLines(minor, alpha(C.grid, 0.55), 1);
  drawLines(step, C.grid, 1);
  if (opts.axes !== false) {
    r.seg([x0, 0], [x1, 0], C.gridStrong, 1.5, 0, 0);
    r.seg([0, y0], [0, y1], C.gridStrong, 1.5, 0, 0);
  }
  if (opts.labels) {
    const col = css(C.dim);
    const ay = Math.min(Math.max(0, y0 + 14 / cam.zoom), y1 - 14 / cam.zoom);
    const ax = Math.min(Math.max(0, x0 + 18 / cam.zoom), x1 - 18 / cam.zoom);
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      if (Math.abs(x) < step * 0.01) continue;
      r.label([x, ay], fmt(x, 3), { color: col, size: 11, dy: 10 });
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      if (Math.abs(y) < step * 0.01) continue;
      r.label([ax, y], fmt(y, 3), { color: col, size: 11, dx: -6, align: 'right' });
    }
  }
}

/** Points on a circle in 3D with the given normal. */
export function circlePoints(center: P, radius: number, normal: P = [0, 0, 1], segs = 72, a0 = 0, a1 = Math.PI * 2): V3[] {
  const n = norm(normal);
  const u = perp(n);
  const v = cross(n, u);
  const pts: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push(add(center, add(scale(u, Math.cos(a) * radius), scale(v, Math.sin(a) * radius))));
  }
  return pts;
}

export function circle(r: Renderer, center: P, radius: number, color: RGBA, width = 2, normal: P = [0, 0, 1], dash = 0, segs = 72) {
  r.polyline(circlePoints(center, radius, normal, segs), color, width, false, dash);
}

/** Ground grid in the xz plane for 3D labs. */
export function grid3D(r: Renderer, half = 6, step = 1, y = 0, color: RGBA = C.grid) {
  for (let i = -half; i <= half; i += step) {
    const c = i === 0 ? C.gridStrong : color;
    r.seg([i, y, -half], [i, y, half], c, 1, 0, 0);
    r.seg([-half, y, i], [half, y, i], c, 1, 0, 0);
  }
}

/** Labelled x/y/z axes for 3D labs. */
export function axes3D(r: Renderer, length = 1.5, origin: P = [0, 0, 0], labels: [string, string, string] = ['x', 'y', 'z']) {
  const cols: RGBA[] = [[0.95, 0.45, 0.45, 1], [0.5, 0.9, 0.5, 1], [0.45, 0.65, 1, 1]];
  const dirs: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  dirs.forEach((d, i) => {
    const tip = addScaled(origin, d, length);
    r.arrow(origin, tip, cols[i], 2, 9);
    r.label(addScaled(origin, d, length * 1.12), labels[i], { color: css(cols[i]), size: 13, bold: true });
  });
}

/** Draw a vector as an arrow with an optional label at its tip. */
export function vector(r: Renderer, origin: P, vec: P, color: RGBA, label?: string, width = 3, tex = true) {
  const tip = add(origin, vec);
  r.arrow(origin, tip, color, width);
  if (label) {
    const so = r.camera.project(origin), st = r.camera.project(tip);
    const dx = st[0] - so[0], dy = st[1] - so[1];
    const l = Math.hypot(dx, dy) || 1;
    r.labelScreen(st[0] + (dx / l) * 14, st[1] + (dy / l) * 14, label, { color: css(color), size: 14, tex, bold: true });
  }
}

/** "Into the page" (cross) or "out of the page" (dot) marker for 2D views. Size in pixels. */
export function intoOut(r: Renderer, p: P, out: boolean, color: RGBA, size = 7) {
  r.disc(p, size, color, { style: 'ring', ring: 1.4 });
  if (out) {
    r.disc(p, size * 0.32, color);
  } else {
    const k = (size * 0.55) / r.camera.pxPerUnit(p);
    const cam = r.camera;
    const a = add(scale(cam.right, k), scale(cam.up, k));
    const b = add(scale(cam.right, k), scale(cam.up, -k));
    r.seg(add(p, a), add(p, scale(a, -1)), color, 1.4);
    r.seg(add(p, b), add(p, scale(b, -1)), color, 1.4);
  }
}

/** Plus or minus sign drawn in screen space at a world point (for charges). */
export function sign(r: Renderer, p: P, positive: boolean, color: RGBA, sizePx = 6, width = 2) {
  const cam = r.camera;
  const k = sizePx / cam.pxPerUnit(p);
  r.seg(addScaled(p, cam.right, -k), addScaled(p, cam.right, k), color, width);
  if (positive) r.seg(addScaled(p, cam.up, -k), addScaled(p, cam.up, k), color, width);
}

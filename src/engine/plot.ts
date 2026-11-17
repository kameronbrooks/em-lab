// Line plots drawn with the engine (no charting library).

import { Camera2D } from './camera';
import { C, RGBA, alpha, css } from './colors';
import { Lab } from './lab';
import { fmt } from './math';

export interface Curve {
  name?: string;
  color: RGBA;
  width?: number;
  dash?: number;
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  /** Number of points (defaults to xs.length). */
  n?: number;
}

export interface Marker {
  x: number;
  y?: number;
  color: RGBA;
  label?: string;
  /** Draw a full-height vertical line at x. */
  vline?: boolean;
}

export interface PlotData {
  x0: number;
  x1: number;
  curves: Curve[];
  markers?: Marker[];
  /** Fixed y range; omit for auto. */
  y0?: number;
  y1?: number;
  /** Auto range is made symmetric about zero. */
  symmetric?: boolean;
  /** Auto range always includes zero. */
  includeZero?: boolean;
  /** Smallest allowed y span for the auto range. */
  minSpan?: number;
  xLabel?: string;
  yLabel?: string;
  title?: string;
}

/** Growing time series with a rolling window. */
export class TimeSeries {
  t: number[] = [];
  v: number[][];
  constructor(readonly channels: number, public window = 12) {
    this.v = Array.from({ length: channels }, () => []);
  }
  push(t: number, values: number[]) {
    this.t.push(t);
    for (let i = 0; i < this.channels; i++) this.v[i].push(values[i]);
    if (this.t.length > 512 && this.t[0] < t - this.window * 1.6) {
      let k = 0;
      while (k < this.t.length && this.t[k] < t - this.window * 1.1) k++;
      this.t.splice(0, k);
      for (const ch of this.v) ch.splice(0, k);
    }
  }
  clear() {
    this.t.length = 0;
    for (const ch of this.v) ch.length = 0;
  }
  get last() {
    return this.t.length ? this.t[this.t.length - 1] : 0;
  }
}

function niceStep(raw: number): number {
  if (!(raw > 0) || !isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/** A plot is a tiny lab: mount it with <LabCanvas lab={plot} />. Set `source` to feed it data. */
export class Plot extends Lab {
  camera = new Camera2D();
  source: (() => PlotData) | null = null;
  private ya = -1;
  private yb = 1;
  private first = true;
  padL = 46;
  padR = 12;
  padT = 10;
  padB = 22;
  /** Data-space position under the cursor, or null. */
  hoverX: number | null = null;

  constructor(source?: () => PlotData) {
    super();
    this.source = source ?? null;
    this.background = [0.035, 0.05, 0.085, 1];
  }

  resetRange() {
    this.first = true;
  }

  // Plots do not pan or zoom.
  onPointerDown() {}
  onPointerUp() {}
  onWheel() {}
  onPointerMove(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;
  }
  cursor() {
    return 'crosshair';
  }

  protected draw() {
    const r = this.r;
    const W = r.width, H = r.height;
    // World units = CSS pixels with the origin at the bottom-left.
    this.camera.zoom = 1;
    this.camera.cx = W / 2;
    this.camera.cy = H / 2;
    this.camera.update(W, H);
    const d = this.source?.();
    if (!d) return;
    const L = this.padL, R = W - this.padR, B = this.padB, T = H - this.padT;

    // y range
    let lo = Infinity, hi = -Infinity;
    if (d.y0 !== undefined && d.y1 !== undefined) {
      lo = d.y0;
      hi = d.y1;
    } else {
      for (const c of d.curves) {
        const n = c.n ?? c.xs.length;
        for (let i = 0; i < n; i++) {
          const x = c.xs[i];
          if (x < d.x0 || x > d.x1) continue;
          const y = c.ys[i];
          if (!isFinite(y)) continue;
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      }
      if (!isFinite(lo)) {
        lo = -1;
        hi = 1;
      }
      if (d.includeZero) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      if (d.symmetric) {
        const m = Math.max(Math.abs(lo), Math.abs(hi));
        lo = -m;
        hi = m;
      }
      const minSpan = d.minSpan ?? 1e-9;
      if (hi - lo < minSpan) {
        const mid = (hi + lo) / 2;
        lo = d.includeZero && lo === 0 ? 0 : mid - minSpan / 2;
        hi = lo + minSpan;
      }
      const pad = (hi - lo) * 0.08;
      lo -= d.includeZero && lo === 0 ? 0 : pad;
      hi += pad;
    }
    if (this.first) {
      this.ya = lo;
      this.yb = hi;
      this.first = false;
    } else {
      // Expand immediately, contract slowly: keeps the trace on screen without jitter.
      this.ya = lo < this.ya ? lo : this.ya + (lo - this.ya) * 0.04;
      this.yb = hi > this.yb ? hi : this.yb + (hi - this.yb) * 0.04;
    }
    const ya = this.ya, yb = this.yb;
    const X = (x: number) => L + ((x - d.x0) / (d.x1 - d.x0)) * (R - L);
    const Y = (y: number) => B + ((y - ya) / (yb - ya)) * (T - B);

    // grid + ticks
    const dim = css(C.dim);
    const ys = niceStep((yb - ya) / Math.max(2, (T - B) / 34));
    for (let y = Math.ceil(ya / ys) * ys; y <= yb + 1e-12; y += ys) {
      const zero = Math.abs(y) < ys * 1e-6;
      r.seg([L, Y(y)], [R, Y(y)], zero ? C.axis : C.grid, 1, 0, 0);
      r.labelScreen(L - 6, H - Y(y), fmt(zero ? 0 : y, 3), { color: dim, size: 10.5, align: 'right' });
    }
    const xs = niceStep((d.x1 - d.x0) / Math.max(2, (R - L) / 70));
    for (let x = Math.ceil(d.x0 / xs) * xs; x <= d.x1 + 1e-12; x += xs) {
      r.seg([X(x), B], [X(x), T], C.grid, 1, 0, 0);
      r.labelScreen(X(x), H - B + 10, fmt(Math.abs(x) < xs * 1e-6 ? 0 : x, 3), { color: dim, size: 10.5 });
    }
    r.seg([L, B], [L, T], C.axis, 1, 0, 0);
    r.seg([L, B], [R, B], C.axis, 1, 0, 0);
    if (d.xLabel) r.labelScreen(R, H - B - 9, d.xLabel, { color: dim, size: 10.5, align: 'right' });
    if (d.yLabel) r.labelScreen(L + 6, H - T + 7, d.yLabel, { color: dim, size: 10.5, align: 'left' });

    // curves
    r.layer(1);
    for (const c of d.curves) {
      const n = c.n ?? c.xs.length;
      const w = c.width ?? 2;
      let px = 0, py = 0, have = false;
      const cap = c.dash ? 0 : 3;
      // Decimate to at most ~2 points per pixel.
      const stride = Math.max(1, Math.floor(n / ((R - L) * 2)));
      for (let i = 0; i < n; i += stride) {
        const x = c.xs[i], y = c.ys[i];
        if (x < d.x0 || x > d.x1 || !isFinite(y)) {
          have = false;
          continue;
        }
        const sx = X(x), sy = Math.min(T + 2, Math.max(B - 2, Y(y)));
        if (have) r.seg([px, py], [sx, sy], c.color, w, c.dash ?? 0, cap);
        px = sx;
        py = sy;
        have = true;
      }
    }

    // markers
    r.layer(2);
    for (const m of d.markers ?? []) {
      if (m.x < d.x0 || m.x > d.x1) continue;
      if (m.vline) r.seg([X(m.x), B], [X(m.x), T], alpha(m.color, 0.7), 1.2, 4, 0);
      if (m.y !== undefined) r.disc([X(m.x), Y(m.y)], 4.5, m.color);
      if (m.label) {
        r.labelScreen(X(m.x) + 6, m.y !== undefined ? H - Y(m.y) - 10 : H - T + 8, m.label, {
          color: css(m.color), size: 10.5, align: 'left',
        });
      }
    }

    // legend
    let lx = L + (d.yLabel ? 8 + d.yLabel.length * 6.5 + 10 : 8);
    for (const c of d.curves) {
      if (!c.name) continue;
      r.seg([lx, T - 6], [lx + 14, T - 6], c.color, c.width ?? 2, c.dash ?? 0, 0);
      r.labelScreen(lx + 18, H - T + 7, c.name, { color: css(c.color), size: 10.5, align: 'left' });
      lx += 26 + c.name.length * 6.3;
    }

    // hover cursor
    if (this.pointer.inside && this.pointer.x > L && this.pointer.x < R) {
      const px = this.pointer.x;
      const dx = d.x0 + ((px - L) / (R - L)) * (d.x1 - d.x0);
      this.hoverX = dx;
      r.seg([px, B], [px, T], alpha(C.text, 0.35), 1, 0, 0);
      let row = 0;
      for (const c of d.curves) {
        const n = c.n ?? c.xs.length;
        if (n < 2) continue;
        // binary search (xs ascending)
        let a = 0, b = n - 1;
        while (b - a > 1) {
          const m = (a + b) >> 1;
          if (c.xs[m] < dx) a = m;
          else b = m;
        }
        const y = c.ys[Math.abs(c.xs[a] - dx) < Math.abs(c.xs[b] - dx) ? a : b];
        if (!isFinite(y)) continue;
        r.disc([px, Math.min(T, Math.max(B, Y(y)))], 3.5, c.color);
        r.labelScreen(px + 8, H - T + 22 + row * 14, `${c.name ?? ''} ${fmt(y, 3)}`.trim(), {
          color: css(c.color), size: 10.5, align: px > (L + R) / 2 ? 'right' : 'left', dx: px > (L + R) / 2 ? -16 : 0, bg: true,
        });
        row++;
      }
    } else {
      this.hoverX = null;
    }
  }
}

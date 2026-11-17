import { C, RGBA, alpha, css } from '../../engine/colors';
import { grid2D } from '../../engine/draw';
import { Handle, Lab2D } from '../../engine/lab';
import { fmt } from '../../engine/math';
import { Plot, PlotData, TimeSeries } from '../../engine/plot';
import {
  Wave1D, d2dt2, d2dx2, lastCrestTime, nearestCrest, period, waveSpeed, waveValue, waveVelocity, wavelength,
} from '../../physics/waves';

const WINDOW = 8;

export class Wave1DLab extends Lab2D {
  w: Wave1D = { A: 1.5, a: 1.5, b: 2, form: 1 };
  /** Optional second wave that is added to the first. */
  second = false;
  w2: Wave1D = { A: 1.5, a: 1.5, b: 2, form: -1 };
  probeX = 2;
  showGhost = true;
  showMarker = true;
  private markerX = 0;
  history = new TimeSeries(1, WINDOW);
  plot: Plot;

  constructor() {
    super();
    this.camera.zoom = 44;
    this.camera.cx = 0;
    this.camera.cy = 0.4;
    this.plot = new Plot(() => this.plotData());
  }

  value = (x: number, t: number) => waveValue(this.w, x, t) + (this.second ? waveValue(this.w2, x, t) : 0);

  preset(name: string) {
    this.second = false;
    this.probeX = 2;
    switch (name) {
      case 'left':
        this.w = { A: 1.5, a: 1.5, b: 2, form: -1 };
        break;
      case 'p65':
        // Problem 65: cos(ax - bt). Speed b/a, moving toward +x, wavelength 2 pi / a.
        this.w = { A: 1.5, a: 2, b: 3, form: 1 };
        break;
      case 'standing':
        this.w = { A: 1.2, a: 1.5, b: 2, form: 1 };
        this.w2 = { A: 1.2, a: 1.5, b: 2, form: -1 };
        this.second = true;
        break;
      case 'beats':
        this.w = { A: 1, a: 3, b: 4.5, form: 1 };
        this.w2 = { A: 1, a: 3.5, b: 5.25, form: 1 };
        this.second = true;
        break;
      case 'right':
      default:
        this.w = { A: 1.5, a: 1.5, b: 2, form: 1 };
        break;
    }
    this.resetHistory();
  }

  resetHistory() {
    this.history.clear();
    this.plot.resetRange();
  }

  restart() {
    this.time = 0;
    this.markerX = 0;
    this.resetHistory();
  }

  /** Both sides of the wave equation at the probe, using v of wave 1. */
  waveEq() {
    const fxx = d2dx2(this.value, this.probeX, this.time);
    const ftt = d2dt2(this.value, this.probeX, this.time);
    const v = waveSpeed(this.w.a, this.w.b);
    return { fxx, ftt, rhs: ftt / (v * v), f: this.value(this.probeX, this.time) };
  }

  handles(): Handle[] {
    return [
      {
        id: 'probe',
        get: () => [this.probeX, 0, 0],
        set: (p) => {
          if (Math.abs(p[0] - this.probeX) > 1e-9) {
            this.probeX = p[0];
            this.resetHistory();
          }
        },
        radius: 20,
      },
    ];
  }

  protected update(dt: number) {
    const w = this.w;
    const b = this.camera.bounds();
    const lam = wavelength(w.a);
    let x = nearestCrest(w, this.markerX + waveVelocity(w) * dt, this.time);
    // when the crest leaves the view, pick up the crest that is just entering on the other side
    const edge = 6 / this.camera.zoom;
    if (x > b.x1 + edge) x = nearestCrest(w, b.x0 + (waveVelocity(w) > 0 ? -lam / 2 : lam / 2), this.time);
    else if (x < b.x0 - edge) x = nearestCrest(w, b.x1 + (waveVelocity(w) > 0 ? -lam / 2 : lam / 2), this.time);
    this.markerX = x;
    if (dt > 0) this.history.push(this.time, [this.value(this.probeX, this.time)]);
  }

  private plotData(): PlotData {
    const t = this.time;
    const amp = this.w.A + (this.second ? this.w2.A : 0);
    const d: PlotData = {
      x0: t - WINDOW,
      x1: t,
      y0: -amp * 1.25,
      y1: amp * 1.25,
      xLabel: 'time t (s)',
      yLabel: 'f at the probe',
      curves: [{ color: C.F, xs: this.history.t, ys: this.history.v[0], width: 2.2 }],
      markers: [],
    };
    if (!this.second) {
      const T = period(this.w.b);
      const tc = lastCrestTime(this.w, this.probeX, t);
      if (T < WINDOW * 0.9) {
        d.markers!.push({ x: tc - T, color: C.v, vline: true, label: `one period T = ${fmt(T, 3)} s` });
        d.markers!.push({ x: tc, color: C.v, vline: true });
      }
    }
    return d;
  }

  protected draw() {
    const r = this.r;
    const cam = this.camera;
    const b = cam.bounds();
    const t = this.time;
    const w = this.w;
    grid2D(r, cam, { labels: true });

    const n = Math.max(2, Math.ceil((b.x1 - b.x0) * cam.zoom / 2));
    const sample = (f: (x: number) => number) => {
      const pts = new Float32Array((n + 1) * 3);
      for (let i = 0; i <= n; i++) {
        const x = b.x0 + ((b.x1 - b.x0) * i) / n;
        pts[i * 3] = x;
        pts[i * 3 + 1] = f(x);
      }
      return pts;
    };

    r.layer(1);
    if (this.showGhost) {
      // where the wave was a moment ago: shows the direction of travel even when paused
      r.polyline(sample((x) => this.value(x, t - 0.3)), alpha(C.dim, 0.5), 1.5, false, 5);
    }
    if (this.second) {
      r.polyline(sample((x) => waveValue(w, x, t)), alpha(C.neg, 0.55), 1.5);
      r.polyline(sample((x) => waveValue(this.w2, x, t)), alpha(C.pos, 0.55), 1.5);
    }
    r.layer(2);
    r.polyline(sample((x) => this.value(x, t)), C.E, 3);

    // crest marker + wavelength bracket (wave 1)
    if (this.showMarker && !this.second) {
      r.layer(3);
      const xc = this.markerX;
      const lam = wavelength(w.a);
      const v = waveVelocity(w);
      const top = Math.abs(w.A);
      const px = 1 / cam.zoom;
      r.disc([xc, top], 6.5, C.v, { style: 'sphere' });
      const len = Math.sign(v) * Math.min(2.2, Math.max(0.7, Math.abs(v) * 0.6));
      const ay = top + 22 * px;
      r.arrow([xc, ay], [xc + len, ay], C.v, 3);
      r.label([xc + len, ay], `v = b/a = ${fmt(Math.abs(v), 3)}`, {
        color: css(C.v), size: 12, bold: true, align: len > 0 ? 'left' : 'right', dx: len > 0 ? 8 : -8,
      });

      // bracket between this crest and the next one that is on screen
      const other = xc + lam <= b.x1 - 10 * px ? xc + lam : xc - lam;
      const x0 = Math.min(xc, other), x1 = Math.max(xc, other);
      const by = top + 58 * px;
      const col: RGBA = C.V;
      r.seg([x0, top + 6 * px], [x0, by + 6 * px], alpha(col, 0.8), 1.2, 4, 0);
      r.seg([x1, top + 6 * px], [x1, by + 6 * px], alpha(col, 0.8), 1.2, 4, 0);
      if ((x1 - x0) * cam.zoom > 40) {
        r.arrow([(x0 + x1) / 2, by], [x1, by], col, 2, 8);
        r.arrow([(x0 + x1) / 2, by], [x0, by], col, 2, 8);
      } else r.seg([x0, by], [x1, by], col, 2);
      r.label([(x0 + x1) / 2, by], `λ = 2π/a = ${fmt(lam, 3)}`, { color: css(col), size: 12, dy: -13, bold: true });
    }

    // probe
    r.layer(4);
    const px = this.probeX;
    const fy = this.value(px, t);
    r.seg([px, b.y0], [px, b.y1], alpha(C.F, 0.45), 1.2, 5, 0);
    r.disc([px, 0], 8, C.F, { style: 'ring', ring: 2 });
    r.seg([px, 0], [px, fy], alpha(C.F, 0.9), 2);
    r.disc([px, fy], 6.5, C.F, { style: 'sphere' });
    r.label([px, b.y0], 'probe (drag me)', { color: css(C.F), size: 11.5, dy: -44 });
  }
}

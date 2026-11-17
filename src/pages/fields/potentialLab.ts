import { C, RGBA, alpha, css } from '../../engine/colors';
import { grid2D, sign } from '../../engine/draw';
import { Program } from '../../engine/gl';
import { Handle, Lab2D } from '../../engine/lab';
import { fmt } from '../../engine/math';
import { PlotData } from '../../engine/plot';
import { PointCharge, eField, potential } from '../../physics/fields';
import { MAP_FS } from './chargeLab';

export type Mode = 'speedup' | 'brake' | 'ramp' | 'path';

const N_CURVE = 140;

/**
 * Two kinds of scene:
 *  - a straight track through a field (uniform, or growing with x) where a charge speeds up or slows down;
 *  - a path through the field of point charges, to show that the work only depends on the end points.
 * Units: q in nC, m in micrograms, E in N/C, so a = qE/m in m/s^2 and energies come out in nJ.
 */
export class PotentialLab extends Lab2D {
  mode: Mode = 'speedup';
  q = 1;
  m = 1;
  /** Field strength (N/C) for the uniform cases, or the slope c in E = c x (N/C per m). */
  e0 = 5;
  d = 4;
  v0 = 0;

  x = 0;
  v = 0;
  running = false;
  done = false;
  /** Where the charge stopped (brake mode), if it did. */
  stopX: number | null = null;
  private trailT = 0;

  // path mode
  charges: PointCharge[] = [
    { x: -1.6, y: -0.4, q: 3 },
    { x: 2, y: 0.8, q: -2 },
  ];
  path: { x: number; y: number }[] = [
    { x: -3.2, y: 1.8 },
    { x: -1.2, y: 2.4 },
    { x: 0.4, y: 0.3 },
    { x: 1.2, y: -1.8 },
    { x: 3.4, y: -1.2 },
  ];
  closed = false;
  showMap = true;
  /** Position of the walker along the path, 0..1. */
  walk = 0;
  private mapProg: Program | null = null;
  private chargeBuf = new Float32Array(32 * 3);

  private xs = new Float32Array(N_CURVE);
  private yK = new Float32Array(N_CURVE);
  private yU = new Float32Array(N_CURVE);
  private yT = new Float32Array(N_CURVE);

  constructor() {
    super();
    this.setMode('speedup');
  }

  protected init() {
    this.mapProg = this.r.fullscreenProgram(MAP_FS);
    this.fitCamera();
  }

  dispose() {
    this.mapProg?.dispose();
    this.mapProg = null;
  }

  setMode(m: Mode) {
    this.mode = m;
    if (m === 'speedup') {
      this.q = 1; this.m = 1; this.e0 = 5; this.d = 4; this.v0 = 0;
    } else if (m === 'brake') {
      this.q = 1; this.m = 1; this.e0 = 5; this.d = 6; this.v0 = 6;
    } else if (m === 'ramp') {
      this.q = 1; this.m = 1; this.e0 = 3; this.d = 4; this.v0 = 0;
    }
    this.reset();
    this.fitCamera();
  }

  preset(name: string) {
    switch (name) {
      case 'p3': case 'p7': case 'p14': case 'p18':
        this.setMode('speedup');
        break;
      case 'p19':
        this.setMode('speedup');
        this.v0 = 3;
        this.reset();
        break;
      case 'p20':
        this.setMode('brake');
        break;
      case 'p22':
        this.setMode('ramp');
        break;
    }
  }

  fitCamera() {
    const cam = this.camera;
    if (this.mode === 'path') {
      cam.cx = 0;
      cam.cy = 0.2;
      cam.zoom = 66;
    } else {
      cam.cx = this.d / 2;
      cam.cy = 0;
      cam.zoom = Math.min(90, Math.max(30, (cam.width > 10 ? cam.width : 700) / (this.d + 3.2)));
    }
  }

  reset() {
    this.x = 0;
    this.v = this.v0;
    this.running = false;
    this.done = false;
    this.stopX = null;
    this.walk = 0;
  }

  toggleRun() {
    if (this.done) this.reset();
    this.running = !this.running;
  }

  // ---------- track physics ----------

  /** Signed field (N/C, along +x) at position x. In brake mode the field opposes the motion of a positive charge. */
  fieldAt(x: number): number {
    if (x < 0 || x > this.d) return 0;
    if (this.mode === 'ramp') return this.e0 * x;
    if (this.mode === 'brake') return -this.e0;
    return this.e0;
  }

  /** Potential (V) with V(0) = 0: V(x) = -integral of E dx. */
  potentialAt(x: number): number {
    const xc = Math.min(this.d, Math.max(0, x));
    if (this.mode === 'ramp') return (-this.e0 * xc * xc) / 2;
    if (this.mode === 'brake') return this.e0 * xc;
    return -this.e0 * xc;
  }

  get kinetic() {
    return 0.5 * this.m * this.v * this.v;
  }
  get potentialEnergy() {
    return this.q * this.potentialAt(this.x);
  }
  get totalEnergy() {
    return 0.5 * this.m * this.v0 * this.v0;
  }
  /** Work done by the field so far = -q (V(x) - V(0)). */
  get work() {
    return -this.q * this.potentialAt(this.x);
  }

  /** Predicted speed at the far plate from energy conservation (NaN if it never gets there). */
  get predictedSpeed(): number {
    const k = this.totalEnergy - this.q * this.potentialAt(this.d);
    return k >= 0 ? Math.sqrt((2 * k) / this.m) : NaN;
  }

  /** Predicted stopping distance x = m v0^2 / (2 |q| E) for the uniform opposing field. */
  get predictedStop(): number {
    const a = Math.abs(this.q * this.e0) / this.m;
    return a > 0 ? (this.v0 * this.v0) / (2 * a) : Infinity;
  }

  protected update(dt: number) {
    if (this.mode === 'path') {
      if (this.running) {
        this.walk += dt * 0.22;
        if (this.walk >= 1) {
          this.walk = 1;
          this.running = false;
          this.done = true;
        }
      }
      return;
    }
    if (!this.running || dt <= 0) return;
    const sub = 40;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      const a0 = (this.q * this.fieldAt(this.x)) / this.m;
      const xn = this.x + this.v * h + 0.5 * a0 * h * h;
      const a1 = (this.q * this.fieldAt(xn)) / this.m;
      const vn = this.v + 0.5 * (a0 + a1) * h;
      if (this.stopX === null && this.v > 0 && vn <= 0) {
        // turning point: pause so the stopping distance can be read off
        this.stopX = xn;
        this.x = xn;
        this.v = 0;
        this.running = false;
        return;
      }
      this.x = xn;
      this.v = vn;
      if (this.x >= this.d || this.x < -0.001) {
        // snap to the plate and use energy conservation for the exact exit speed
        const end = this.x >= this.d ? this.d : 0;
        const k = this.totalEnergy - this.q * this.potentialAt(end);
        this.v = Math.sign(this.v) * Math.sqrt(Math.max(0, (2 * k) / this.m));
        this.x = end;
        this.running = false;
        this.done = true;
        return;
      }
    }
    this.trailT += dt;
  }

  // ---------- path physics ----------

  private pathPoints(): { x: number; y: number }[] {
    return this.closed ? [...this.path, this.path[0]] : this.path;
  }

  /** Integral of E . dr along one straight segment (volts). */
  private segIntegral(a: { x: number; y: number }, b: { x: number; y: number }, upTo = 1): number {
    const n = 160;
    let s = 0;
    const dx = (b.x - a.x) / n, dy = (b.y - a.y) / n;
    const steps = Math.round(n * upTo);
    for (let i = 0; i < steps; i++) {
      const e = eField(this.charges, a.x + dx * (i + 0.5), a.y + dy * (i + 0.5));
      s += e[0] * dx + e[1] * dy;
    }
    return s;
  }

  /** Per-segment and total line integrals, plus the potentials at the ends. */
  pathResult() {
    const pts = this.pathPoints();
    const segs: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push(this.segIntegral(pts[i], pts[i + 1]));
    const total = segs.reduce((s, v) => s + v, 0);
    const a = pts[0], b = pts[pts.length - 1];
    const va = potential(this.charges, a.x, a.y), vb = potential(this.charges, b.x, b.y);
    return { segs, total, va, vb, drop: va - vb };
  }

  /** Walker position and the integral accumulated so far. */
  walker() {
    const pts = this.pathPoints();
    const lens: number[] = [];
    let L = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      lens.push(l);
      L += l;
    }
    let s = this.walk * L, acc = 0;
    for (let i = 0; i < lens.length; i++) {
      if (s <= lens[i] || i === lens.length - 1) {
        const t = lens[i] > 0 ? Math.min(1, s / lens[i]) : 0;
        acc += this.segIntegral(pts[i], pts[i + 1], t);
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, acc };
      }
      acc += this.segIntegral(pts[i], pts[i + 1]);
      s -= lens[i];
    }
    return { x: pts[0].x, y: pts[0].y, acc: 0 };
  }

  // ---------- plot ----------

  plotData = (): PlotData => {
    if (this.mode === 'path') {
      const pts = this.pathPoints();
      // potential along the path against distance walked
      const xs: number[] = [], ys: number[] = [];
      let L = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        for (let k = 0; k <= 30; k++) {
          const t = k / 30;
          xs.push(L + l * t);
          ys.push(potential(this.charges, pts[i].x + (pts[i + 1].x - pts[i].x) * t, pts[i].y + (pts[i + 1].y - pts[i].y) * t));
        }
        L += l;
      }
      const w = this.walker();
      return {
        x0: 0, x1: Math.max(L, 1e-3),
        xLabel: 'distance along the path (m)', yLabel: 'V (volts)',
        curves: [{ name: 'potential along the path', color: C.V, xs, ys, width: 2.2 }],
        markers: [{ x: this.walk * L, y: potential(this.charges, w.x, w.y), color: C.v, vline: true }],
      };
    }
    const total = this.totalEnergy;
    for (let i = 0; i < N_CURVE; i++) {
      const x = -0.4 + ((this.d + 0.8) * i) / (N_CURVE - 1);
      const u = this.q * this.potentialAt(x);
      this.xs[i] = x;
      this.yU[i] = u;
      this.yK[i] = Math.max(0, total - u);
      this.yT[i] = total;
    }
    return {
      x0: -0.4, x1: this.d + 0.4,
      xLabel: 'position x (m)', yLabel: 'energy (nJ)',
      includeZero: true,
      curves: [
        { name: 'potential qV', color: C.V, xs: this.xs, ys: this.yU, width: 2 },
        { name: 'kinetic', color: C.v, xs: this.xs, ys: this.yK, width: 2 },
        { name: 'total', color: alpha(C.white, 0.7), xs: this.xs, ys: this.yT, width: 1.4, dash: 5 },
      ],
      markers: [
        { x: this.x, y: this.kinetic, color: C.v, vline: true },
        { x: this.x, y: this.potentialEnergy, color: C.V },
      ],
    };
  };

  // ---------- interaction ----------

  handles(): Handle[] {
    if (this.mode !== 'path') return [];
    const hs: Handle[] = this.path.map((p) => ({
      id: p,
      get: () => [p.x, p.y, 0],
      set: (q) => {
        p.x = q[0];
        p.y = q[1];
      },
      radius: 16,
    }));
    for (const c of this.charges) {
      hs.push({
        id: c,
        get: () => [c.x, c.y, 0],
        set: (q) => {
          c.x = q[0];
          c.y = q[1];
        },
        radius: 20,
      });
    }
    return hs;
  }

  // ---------- drawing ----------

  protected draw() {
    if (this.mode === 'path') this.drawPath();
    else this.drawTrack();
  }

  private drawTrack() {
    const r = this.r;
    const cam = this.camera;
    grid2D(r, cam, { labels: false });
    const d = this.d;
    const H = 1.7;
    const vEnd = this.potentialAt(d);
    // plates, coloured by which one is at the higher potential
    const hiLeft = vEnd < 0;
    const left: RGBA = vEnd === 0 ? C.dim : hiLeft ? C.pos : C.neg;
    const right: RGBA = vEnd === 0 ? C.dim : hiLeft ? C.neg : C.pos;
    r.layer(1);
    r.seg([0, -H], [0, H], left, 6);
    r.seg([d, -H], [d, H], right, 6);
    r.label([0, H], 'V = 0', { dy: -14, size: 12, color: css(left) });
    r.label([d, H], `V = ${fmt(vEnd, 3)} V`, { dy: -14, size: 12, color: css(right) });
    // field arrows
    const eMax = Math.max(1e-9, Math.abs(this.fieldAt(d - 1e-6)), Math.abs(this.fieldAt(d / 2)));
    const cols = Math.max(4, Math.round(d * 1.6));
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols) * d;
      const e = this.fieldAt(x);
      const L = (0.42 * d) / cols * 2 * (0.25 + 0.75 * Math.abs(e) / eMax) * Math.sign(e);
      for (let j = -3; j <= 3; j++) {
        if (j === 0) continue;
        const y = (j / 3.6) * H;
        r.arrow([x - L / 2, y], [x + L / 2, y], alpha(C.E, 0.35 + 0.45 * Math.abs(e) / eMax), 1.8, 8);
      }
    }
    r.label([d / 2, -H], this.mode === 'ramp' ? 'E = c·x  (grows with x)' : 'uniform field E', { dy: 16, size: 12, color: css(C.E) });
    // distance marker
    r.seg([0, -H - 0.55], [d, -H - 0.55], alpha(C.dim, 0.8), 1, 0, 0);
    r.seg([0, -H - 0.65], [0, -H - 0.45], alpha(C.dim, 0.8), 1);
    r.seg([d, -H - 0.65], [d, -H - 0.45], alpha(C.dim, 0.8), 1);
    r.label([d / 2, -H - 0.55], `d = ${fmt(d, 3)} m`, { dy: 12, size: 11.5, color: css(C.dim) });

    // predicted stop marker
    if (this.mode === 'brake' && this.predictedStop < d) {
      const xs = this.predictedStop;
      r.seg([xs, -0.5], [xs, 0.5], alpha(C.warn, 0.9), 1.5, 4, 0);
      r.label([xs, 0.5], `stops at x = ${fmt(xs, 3)} m`, { dy: -12, size: 11.5, color: css(C.warn) });
    }

    // particle
    r.layer(3);
    const col = this.q >= 0 ? C.pos : C.neg;
    const p = [this.x, 0];
    r.seg([0, 0], p, alpha(col, 0.35), 2);
    const f = this.q * this.fieldAt(this.x);
    const fScale = (1.1 / Math.max(1e-9, Math.abs(this.q) * eMax));
    if (Math.abs(f) > 1e-9) {
      r.arrow([this.x, 0.42], [this.x + f * fScale, 0.42], C.F, 3);
      r.label([this.x + f * fScale, 0.42], '\\vec F = q\\vec E', { tex: true, dy: -14, size: 12.5, color: css(C.F) });
    }
    if (Math.abs(this.v) > 1e-6) {
      const vs = 0.18;
      r.arrow([this.x, -0.42], [this.x + this.v * vs, -0.42], C.v, 3);
      r.label([this.x + this.v * vs, -0.42], `v = ${fmt(Math.abs(this.v), 3)} m/s`, { dy: 14, size: 11.5, color: css(C.v) });
    }
    r.disc(p, 26, alpha(col, 0.3), { style: 'glow' });
    r.disc(p, 11, col, { style: 'sphere' });
    sign(r, p, this.q >= 0, C.white, 5, 2);
  }

  private drawPath() {
    const r = this.r;
    const cam = this.camera;
    const b = cam.bounds();
    const charges = this.charges;
    if (this.showMap && this.mapProg) {
      const n = charges.length;
      charges.forEach((c, i) => {
        this.chargeBuf[i * 3] = c.x;
        this.chargeBuf[i * 3 + 1] = c.y;
        this.chargeBuf[i * 3 + 2] = c.q;
      });
      r.fullscreen(this.mapProg, (p) => {
        p.f2('uCenter', cam.cx, cam.cy).f2('uHalf', (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2)
          .fv3('uCharges', this.chargeBuf).i1('uN', n).f1('uMap', 1).f1('uEquip', 1).f1('uV0', 12)
          .f3('uBg', C.bg[0], C.bg[1], C.bg[2]);
      });
    }
    grid2D(r, cam, { labels: false });
    r.layer(1);
    for (const c of charges) {
      const col = c.q >= 0 ? C.pos : C.neg;
      r.disc([c.x, c.y], 34, alpha(col, 0.3), { style: 'glow' });
      r.disc([c.x, c.y], 13, col, { style: 'sphere' });
      sign(r, [c.x, c.y], c.q >= 0, C.white, 5.5, 2.2);
    }
    // path
    r.layer(2);
    const pts = this.pathPoints();
    const res = this.pathResult();
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], bb = pts[i + 1];
      r.arrow([a.x, a.y], [bb.x, bb.y], C.white, 2.2, 11);
      const mx = (a.x + bb.x) / 2, my = (a.y + bb.y) / 2;
      r.label([mx, my], `${res.segs[i] >= 0 ? '+' : ''}${fmt(res.segs[i], 3)} V`, { size: 11.5, bg: true, dy: -14, color: css(res.segs[i] >= 0 ? C.E : C.B) });
    }
    this.path.forEach((p, i) => {
      const end = i === 0 || (!this.closed && i === this.path.length - 1);
      r.disc([p.x, p.y], end ? 8 : 6, end ? C.v : C.white, { style: 'sphere' });
      const name = i === 0 ? (this.closed ? 'A (start and end)' : 'A') : !this.closed && i === this.path.length - 1 ? 'B' : '';
      if (name) r.label([p.x, p.y], name, { dy: 18, size: 13, bold: true, color: css(C.v) });
    });
    // walker with the local field
    const w = this.walker();
    const e = eField(charges, w.x, w.y);
    const m = Math.hypot(e[0], e[1]);
    r.layer(3);
    if (m > 1e-9) {
      const L = 46 / cam.zoom;
      r.arrow([w.x, w.y], [w.x + (e[0] / m) * L, w.y + (e[1] / m) * L], C.E, 2.6);
    }
    r.disc([w.x, w.y], 6.5, C.E, { style: 'sphere' });
    r.label([w.x, w.y], `∫E·dr so far = ${fmt(w.acc, 3)} V`, { dy: 22, size: 11.5, bg: true });
  }
}

import { C, RGBA, alpha, css, mix } from '../../engine/colors';
import { circlePoints, sign } from '../../engine/draw';
import { Handle, Lab2D } from '../../engine/lab';
import { P } from '../../engine/math';
import { Plot, PlotData } from '../../engine/plot';
import { LCState, firstPhaseFor, lcOmega, lcPeriod, lcStateAt } from '../../physics/lc';
import { si } from './circuitLab';

const TAU = Math.PI * 2;
/** Colour of everything electric (charge, capacitor energy) and magnetic (current, inductor energy). */
const QC: RGBA = C.E;
const IC: RGBA = C.B;

/** Circuit half-width and half-height, and the radius of the state circle, in world units. */
const W = 2.3, H = 1.45, R = 2.3;
/** Half the gap between the capacitor plates, and half their length. */
const GAP = 0.34, PLATE = 0.75;
/** Inductor: number of bumps and their radius. */
const BUMPS = 4, BUMP = 0.24;
const COIL = BUMPS * BUMP;

const signedText = (x: number, digits = 2) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(digits)}`;

/** Plot samples over two periods. */
const N = 240;
const XS = Float32Array.from({ length: N + 1 }, (_, k) => (2 * k) / N);
const curve = (f: (a: number) => number) => Float32Array.from(XS, (x) => f(TAU * x));
const Q_CURVE = curve(Math.cos), I_CURVE = curve((a) => -Math.sin(a));
const EC_CURVE = curve((a) => Math.cos(a) ** 2), EL_CURVE = curve((a) => Math.sin(a) ** 2);
const ONE = Float32Array.from(XS, () => 1);

export class LCLab extends Lab2D {
  /** Inductance (H), capacitance (F) and maximum charge (C). */
  L = 10e-3;
  C = 100e-6;
  q0 = 200e-6;
  /** Phase angle t/√(LC), kept inside two periods. The capacitor is full at 0. */
  theta = 0;
  /** Circuit seconds that pass per second on screen at speed ×1. */
  readonly slowMo = 1e-3;
  showSpring = false;
  /** Sizes of q/q₀ and i/i_max that the "know one, find the rest" tool is pointing at. */
  target: { q: number; i: number } | null = null;
  qPlot: Plot;
  ePlot: Plot;
  private dragged = false;
  private fitKey = '';

  constructor() {
    super();
    this.qPlot = new Plot(() => this.qPlotData());
    this.ePlot = new Plot(() => this.ePlotData());
  }

  get omega() {
    return lcOmega(this.L, this.C);
  }
  get period() {
    return lcPeriod(this.L, this.C);
  }
  get state(): LCState {
    return lcStateAt(this.theta, this.q0, this.L, this.C);
  }
  /** Circuit time since the capacitor was last full at the start of the plot window. */
  get t() {
    return this.theta / this.omega;
  }

  restart() {
    this.theta = 0;
    this.paused = false;
    this.target = null;
  }

  /** Jump to a phase angle and hold there. */
  goTo(theta: number) {
    this.theta = ((theta % (2 * TAU)) + 2 * TAU) % (2 * TAU);
    this.paused = true;
  }

  /** Hold at the first moment the charge fraction equals qFrac, and mark every moment with those sizes. */
  showCharge(qFrac: number) {
    const q = Math.min(1, Math.max(-1, qFrac));
    this.target = { q: Math.abs(q), i: Math.sqrt(1 - q * q) };
    this.goTo(firstPhaseFor(q));
  }

  private layout() {
    const wide = this.camera.width >= this.camera.height * 1.1;
    return wide
      ? { wide, circ: [-3.75, 0.1] as const, ring: [3.85, 0] as const, box: [-7.7, 8.1, -3.95, 4.05] as const }
      : { wide, circ: [0, 4.3] as const, ring: [0, -3.75] as const, box: [-4.3, 4.3, -8.6, 8.3] as const };
  }

  handles(): Handle[] {
    const [cx, cy] = this.layout().ring;
    return [
      {
        id: 'state',
        get: () => [cx + R * Math.cos(this.theta), cy - R * Math.sin(this.theta), 0],
        set: (p) => {
          const a = Math.atan2(-(p[1] - cy), p[0] - cx);
          // stay in whichever of the two plotted periods the dot is already in
          const base = this.theta >= TAU ? TAU : 0;
          this.theta = base + ((a % TAU) + TAU) % TAU;
        },
        down: () => {
          this.paused = true;
          this.dragged = true;
        },
        radius: 22,
      },
    ];
  }

  protected update(dt: number) {
    this.theta = (this.theta + dt * this.slowMo * this.omega) % (2 * TAU);
    // keep the whole drawing in view whenever the canvas changes shape
    const cam = this.camera;
    const key = `${cam.width}x${cam.height}`;
    if (key !== this.fitKey && cam.width > 1) {
      this.fitKey = key;
      const [x0, x1, y0, y1] = this.layout().box;
      cam.fit(x0, x1, y0, y1, 1.02);
    }
  }

  // ---------- plots ----------

  private qPlotData(): PlotData {
    const s = this.state, x = this.theta / TAU;
    return {
      x0: 0, x1: 2, y0: -1.2, y1: 1.3,
      xLabel: 'time (in periods T)',
      curves: [
        { name: 'charge q/q₀', color: QC, xs: XS, ys: Q_CURVE, width: 2.2 },
        { name: 'current i/i_max', color: IC, xs: XS, ys: I_CURVE, width: 2.2 },
      ],
      markers: [
        { x, color: C.text, vline: true },
        { x, y: s.qFrac, color: QC },
        { x, y: s.iFrac, color: IC },
      ],
    };
  }

  private ePlotData(): PlotData {
    const s = this.state, x = this.theta / TAU;
    return {
      x0: 0, x1: 2, y0: 0, y1: 1.3,
      xLabel: 'time (in periods T)',
      curves: [
        { name: 'capacitor share', color: QC, xs: XS, ys: EC_CURVE, width: 2.2 },
        { name: 'inductor share', color: IC, xs: XS, ys: EL_CURVE, width: 2.2 },
        { name: 'total', color: C.text, xs: XS, ys: ONE, width: 1.5, dash: 5 },
      ],
      markers: [
        { x, color: C.text, vline: true },
        { x, y: s.EC / s.E, color: QC },
        { x, y: s.EL / s.E, color: IC },
      ],
    };
  }

  // ---------- drawing ----------

  protected draw() {
    const lay = this.layout();
    const s = this.state;
    this.drawCircuit(lay.circ[0], lay.circ[1], s);
    this.drawEnergyBar(lay.circ[0], lay.circ[1] - H - 1.05, s);
    if (this.showSpring) this.drawSpring(lay.circ[0], lay.circ[1] + H + 1.3, s);
    this.drawCircle(lay.ring[0], lay.ring[1], s);
  }

  private drawCircuit(ox: number, oy: number, s: LCState) {
    const r = this.r;
    const xl = ox - W, xr = ox + W, yt = oy + H, yb = oy - H;
    const qf = s.qFrac, cf = s.iFrac;
    const shareC = qf * qf, shareL = cf * cf;
    const wire = alpha(C.dim, 0.95);

    // energy glows behind the two elements
    r.layer(0);
    r.disc([xl, oy], 1.35, alpha(QC, 0.07 + 0.3 * shareC), { style: 'glow', world: true });
    r.disc([xr + 0.1, oy], 1.35, alpha(IC, 0.07 + 0.3 * shareL), { style: 'glow', world: true });

    // wires
    r.layer(1);
    r.polyline([[xl, oy + GAP], [xl, yt], [xr, yt], [xr, oy + COIL]], wire, 2.5);
    r.polyline([[xl, oy - GAP], [xl, yb], [xr, yb], [xr, oy - COIL]], wire, 2.5);

    // inductor: a row of bumps that brightens with the current
    const coilCol = mix(wire, IC, Math.abs(cf));
    const pts: P[] = [];
    for (let b = 0; b < BUMPS; b++) {
      const yc = oy + COIL - (2 * b + 1) * BUMP;
      for (let k = b === 0 ? 0 : 1; k <= 12; k++) {
        const a = (Math.PI * k) / 12;
        pts.push([xr + BUMP * Math.sin(a), yc + BUMP * Math.cos(a)]);
      }
    }
    r.polyline(pts, coilCol, 3);
    // magnetic field along the coil axis: flips when the current flips
    if (Math.abs(cf) > 0.03) {
      const bx = xr + 0.62;
      r.arrow([bx, oy - 0.62 * cf], [bx, oy + 0.62 * cf], IC, 2.5);
    }
    r.label([xr + 0.95, oy + 0.2], 'L', { color: css(C.text), size: 15, bold: true, align: 'left' });
    r.label([xr + 0.95, oy - 0.22], 'B field', { color: css(IC), size: 10.5, align: 'left' });

    // capacitor plates, coloured by the sign of the charge on each
    const top = qf >= 0 ? C.pos : C.neg, bottom = qf >= 0 ? C.neg : C.pos;
    const k = Math.pow(Math.abs(qf), 0.6);
    r.seg([xl - PLATE, oy + GAP], [xl + PLATE, oy + GAP], mix(wire, top, k), 4.5);
    r.seg([xl - PLATE, oy - GAP], [xl + PLATE, oy - GAP], mix(wire, bottom, k), 4.5);
    const shown = Math.round(4 * Math.abs(qf));
    [-0.25, 0.25, -0.55, 0.55].slice(0, shown).forEach((dx) => {
      sign(r, [xl + dx, oy + GAP + 0.22], qf >= 0, top, 4, 1.8);
      sign(r, [xl + dx, oy - GAP - 0.22], qf < 0, bottom, 4, 1.8);
    });
    // electric field between the plates, from the + plate to the − plate
    if (Math.abs(qf) > 0.04) {
      for (const dx of [-0.45, 0, 0.45]) {
        r.arrow([xl + dx, oy + 0.27 * qf], [xl + dx, oy - 0.27 * qf], QC, 2, 7);
      }
    }
    r.label([xl - 1.0, oy + 0.2], 'C', { color: css(C.text), size: 15, bold: true, align: 'right' });
    r.label([xl - 1.0, oy - 0.22], 'E field', { color: css(QC), size: 10.5, align: 'right' });

    // charges in the wire: they are displaced by an amount proportional to q, so they slosh back and forth
    r.layer(2);
    const per = 4 * W + 4 * H;
    const dots = 30;
    const col = alpha(C.I, 0.3 + 0.7 * Math.abs(cf));
    for (let d = 0; d < dots; d++) {
      // distance along the loop in the direction of positive i: top wire leftward, down, right, up
      let u = (((d / dots) * per + 1.25 * qf) % per + per) % per;
      let p: P;
      if (u < 2 * W) p = [xr - u, yt];
      else if ((u -= 2 * W) < 2 * H) p = [xl, yt - u];
      else if ((u -= 2 * H) < 2 * W) p = [xl + u, yb];
      else p = [xr, yb + (u - 2 * W)];
      const inCap = p[0] === xl && Math.abs(p[1] - oy) < GAP + 0.08;
      const inCoil = p[0] === xr && Math.abs(p[1] - oy) < COIL + 0.05;
      if (!inCap && !inCoil) r.disc(p, 3.2, col);
    }

    // current arrow above the top wire: positive i flows toward the top plate
    if (Math.abs(cf) > 0.03) {
      r.arrow([ox + 0.95 * cf, yt + 0.36], [ox - 0.95 * cf, yt + 0.36], C.I, 3);
    }
    r.label([ox, yt + 0.36], Math.abs(cf) > 0.03 ? 'current' : 'no current', { color: css(C.I), size: 11, dy: -13 });

    // live values inside the loop
    r.label([xl + 1.05, oy + 0.78], `q = ${signedText(qf)} q₀`, { color: css(QC), size: 13.5, bold: true, align: 'left' });
    r.label([xl + 1.05, oy + 0.36], `= ${si(s.q, 'C')}`, { color: css(alpha(QC, 0.8)), size: 11.5, align: 'left' });
    r.label([xr - 0.3, oy - 0.36], `i = ${signedText(cf)} i_max`, { color: css(IC), size: 13.5, bold: true, align: 'right' });
    r.label([xr - 0.3, oy - 0.78], `= ${si(s.i, 'A')}`, { color: css(alpha(IC, 0.8)), size: 11.5, align: 'right' });
  }

  /** One bar of fixed length, split between the capacitor and the inductor. */
  private drawEnergyBar(ox: number, y: number, s: LCState) {
    const r = this.r;
    const x0 = ox - W, x1 = ox + W;
    const share = s.EC / s.E;
    const xm = x0 + (x1 - x0) * share;
    const thick = Math.max(8, 0.3 * this.camera.zoom);
    r.layer(1);
    if (xm - x0 > 1e-3) r.seg([x0, y], [xm, y], QC, thick, 0, 0);
    if (x1 - xm > 1e-3) r.seg([xm, y], [x1, y], IC, thick, 0, 0);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    // short names when the drawing is small, so the two labels do not run into each other
    const small = this.camera.zoom < 40;
    r.label([x0, y + 0.45], `${small ? 'C' : 'capacitor'} ${pct(share)}`, { color: css(QC), size: 12, bold: true, align: 'left' });
    r.label([x1, y + 0.45], `${small ? 'L' : 'inductor'} ${pct(1 - share)}`, { color: css(IC), size: 12, bold: true, align: 'right' });
    r.label([ox, y - 0.45], small ? `total ${si(s.E, 'J')}` : `total energy ${si(s.E, 'J')}: it never changes`, { color: css(C.dim), size: 11.5 });
  }

  /** Mass on a spring that does exactly what the circuit does: stretch ↔ charge, velocity ↔ current. */
  private drawSpring(ox: number, y: number, s: LCState) {
    const r = this.r;
    const wall = ox - W, rest = ox + 0.3;
    const xb = rest + 1.25 * s.qFrac;
    r.layer(1);
    r.seg([wall, y - 0.45], [wall, y + 0.45], C.dim, 3);
    const coils = 9, pts: P[] = [[wall, y]];
    const end = xb - 0.32;
    for (let k = 0; k < coils * 2; k++) {
      pts.push([wall + 0.15 + ((end - 0.15 - wall) * (k + 0.5)) / (coils * 2), y + (k % 2 ? -0.2 : 0.2)]);
    }
    pts.push([end, y]);
    r.polyline(pts, QC, 2);
    r.seg([xb - 0.3, y], [xb + 0.3, y], IC, Math.max(10, 0.6 * this.camera.zoom), 0, 0);
    r.seg([rest, y - 0.5], [rest, y - 0.34], C.dim, 1.5, 0, 0);
    if (Math.abs(s.iFrac) > 0.03) r.arrow([xb, y + 0.52], [xb + 0.9 * s.iFrac, y + 0.52], C.v, 2.5);
    r.label([wall, y + 0.75], 'stretch ↔ charge', { color: css(QC), size: 11, align: 'left' });
    r.label([ox + W, y + 0.75], 'velocity ↔ current', { color: css(C.v), size: 11, align: 'right' });
  }

  private drawCircle(cx: number, cy: number, s: LCState) {
    const r = this.r;
    const px = cx + R * s.qFrac, py = cy + R * s.iFrac;
    const ext = R + 0.35;

    r.layer(0);
    r.seg([cx - ext, cy], [cx + ext, cy], C.axis, 1.2, 0, 0);
    r.seg([cx, cy - ext], [cx, cy + ext], C.axis, 1.2, 0, 0);
    r.polyline(circlePoints([cx, cy], R, [0, 0, 1], 96), alpha(C.dim, 0.9), 2);
    r.label([cx + ext, cy], String.raw`q/q_0`, { color: css(QC), size: 13, tex: true, align: 'left', dx: 6 });
    r.label([cx, cy + ext], String.raw`i/i_{max}`, { color: css(IC), size: 13, tex: true, dy: -12 });
    r.label([cx + ext, cy], 'capacitor full', { color: css(C.dim), size: 10.5, align: 'left', dx: 6, dy: 17 });
    r.label([cx, cy - ext], 'capacitor empty: current at its largest', { color: css(C.dim), size: 10.5, dy: 12 });
    r.label([cx, cy + ext], String.raw`\left(\tfrac{q}{q_0}\right)^2+\left(\tfrac{i}{i_{max}}\right)^2=1`, {
      color: css(C.text), size: 14, tex: true, dy: -38,
    });

    // every moment that has the sizes the solver is pointing at
    if (this.target) {
      const { q, i } = this.target;
      r.layer(1);
      const corners: P[] = [[cx + R * q, cy - R * i], [cx - R * q, cy - R * i], [cx - R * q, cy + R * i], [cx + R * q, cy + R * i]];
      r.polyline(corners, alpha(C.F, 0.35), 1.2, true, 5);
      for (const c of corners) r.disc(c, 7, C.F, { style: 'ring', ring: 2 });
    }

    // the triangle: legs are the charge and current fractions, the hypotenuse is always 1
    r.layer(2);
    r.seg([cx, cy], [px, py], alpha(C.text, 0.85), 1.8);
    r.seg([cx, cy], [px, cy], QC, 4.5);
    r.seg([px, cy], [px, py], IC, 4.5);
    const up = s.iFrac >= 0;
    r.label([(cx + px) / 2, cy], `q/q₀ = ${signedText(s.qFrac)}`, {
      color: css(QC), size: 12.5, bold: true, bg: true, dy: up ? 15 : -15,
    });
    const right = s.qFrac >= 0;
    r.label([px, (cy + py) / 2], `i/i_max = ${signedText(s.iFrac)}`, {
      color: css(IC), size: 12.5, bold: true, bg: true, align: right ? 'left' : 'right', dx: right ? 10 : -10,
    });
    const nx = -s.iFrac, ny = s.qFrac;
    const flip = (up ? 1 : -1) * (right ? 1 : -1);
    r.label([cx + (R * s.qFrac) / 2 + 0.22 * nx * flip, cy + (R * s.iFrac) / 2 + 0.22 * ny * flip], '1', {
      color: css(C.text), size: 12, bold: true,
    });

    r.layer(3);
    r.disc([px, py], this.hovered || this.dragging ? 10 : 8.5, C.white, { style: 'sphere' });
    if (!this.dragged) {
      r.label([px, py], 'drag me', { color: css(C.text), size: 11, align: 'left', dx: 14, dy: 14, bg: true });
    }
  }
}

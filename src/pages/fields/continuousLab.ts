import { C, RGBA, alpha, css } from '../../engine/colors';
import { circle, grid2D } from '../../engine/draw';
import { Handle, Lab2D } from '../../engine/lab';
import { fmt } from '../../engine/math';
import { PlotData } from '../../engine/plot';
import { K_NC } from '../../physics/fields';
import { fibonacciSphere } from '../../physics/flux';

export type Shape = 'line' | 'ring' | 'plane' | 'plates' | 'cylshell' | 'shell' | 'solid';

interface Piece {
  x: number;
  y: number;
  z: number;
  /** nC for points, nC/m for rods. */
  q: number;
  /** A rod is an infinitely long line of charge perpendicular to the screen. */
  rod: boolean;
}

export interface ShapeInfo {
  label: string;
  amount: { label: string; unit: string; min: number; max: number; def: number };
  size: { label: string; min: number; max: number; def: number };
  nMax: number;
  nDef: number;
  /** Axis the plot scans along: radial from the centre, or along x / y through the field point. */
  scan: 'r' | 'x' | 'y';
}

export const SHAPES: Record<Shape, ShapeInfo> = {
  line: { label: 'Line of charge', amount: { label: 'Charge per length λ', unit: 'nC/m', min: -3, max: 3, def: 1 }, size: { label: 'Length of the line', min: 1, max: 40, def: 6 }, nMax: 200, nDef: 16, scan: 'y' },
  ring: { label: 'Ring (seen edge-on)', amount: { label: 'Total charge Q', unit: 'nC', min: -6, max: 6, def: 3 }, size: { label: 'Ring radius a', min: 0.5, max: 3, def: 1.5 }, nMax: 120, nDef: 16, scan: 'x' },
  plane: { label: 'Charged plane (edge-on)', amount: { label: 'Charge per area σ', unit: 'nC/m²', min: -2, max: 2, def: 0.5 }, size: { label: 'How much of the plane we include', min: 1, max: 60, def: 8 }, nMax: 240, nDef: 24, scan: 'x' },
  plates: { label: 'Two opposite plates', amount: { label: 'Charge per area σ', unit: 'nC/m²', min: -2, max: 2, def: 0.5 }, size: { label: 'Plate separation', min: 0.5, max: 5, def: 2.4 }, nMax: 240, nDef: 60, scan: 'x' },
  cylshell: { label: 'Cylindrical shell (end-on)', amount: { label: 'Charge per area σ', unit: 'nC/m²', min: -2, max: 2, def: 0.5 }, size: { label: 'Shell radius a', min: 0.5, max: 3, def: 1.5 }, nMax: 120, nDef: 20, scan: 'r' },
  shell: { label: 'Spherical shell', amount: { label: 'Total charge Q', unit: 'nC', min: -8, max: 8, def: 4 }, size: { label: 'Shell radius a', min: 0.5, max: 3, def: 1.5 }, nMax: 600, nDef: 120, scan: 'r' },
  solid: { label: 'Solid sphere', amount: { label: 'Total charge Q₀', unit: 'nC', min: -8, max: 8, def: 4 }, size: { label: 'Sphere radius d', min: 0.5, max: 3, def: 1.8 }, nMax: 800, nDef: 200, scan: 'r' },
};

const SAMPLES = 160;

export class ContinuousLab extends Lab2D {
  shape: Shape = 'line';
  amount = 1;
  size = 6;
  n = 16;
  p = { x: 0.8, y: 1.6 };
  showPieces = true;
  chain = false;

  private pieces: Piece[] = [];
  private piecesKey = '';
  private curveKey = '';
  private xs = new Float32Array(SAMPLES);
  private yNum = new Float32Array(SAMPLES);
  private yIdeal = new Float32Array(SAMPLES);
  private scanDir: [number, number] = [0, 1];
  private scanOrigin: [number, number] = [0, 0];

  constructor() {
    super();
    this.camera.zoom = 62;
    this.setShape('line');
  }

  setShape(s: Shape) {
    const info = SHAPES[s];
    this.shape = s;
    this.amount = info.amount.def;
    this.size = info.size.def;
    this.n = info.nDef;
    this.camera.cx = 0;
    this.camera.cy = 0;
    this.camera.zoom = 62;
    this.p = s === 'ring' ? { x: 1.6, y: 0 } : s === 'plane' || s === 'plates' ? { x: s === 'plates' ? 0.3 : 1.5, y: 0.5 } : s === 'line' ? { x: 0.8, y: 1.6 } : { x: 1.9, y: 1.3 };
  }

  preset(name: string) {
    if (name === 'p2') this.setShape('cylshell');
    else if (name === 'p4') this.setShape('solid');
    else if (name === 'p8') this.setShape('shell');
    else if (name === 'p11') {
      this.setShape('shell');
      this.p = { x: 0.5, y: 0.4 };
    }
  }

  get info() {
    return SHAPES[this.shape];
  }

  private rebuild() {
    const key = `${this.shape}|${this.amount}|${this.size}|${this.n}`;
    if (key === this.piecesKey) return;
    this.piecesKey = key;
    const out: Piece[] = [];
    const n = Math.max(1, Math.round(this.n));
    const a = this.amount, s = this.size;
    switch (this.shape) {
      case 'line': {
        const dl = s / n;
        for (let i = 0; i < n; i++) out.push({ x: -s / 2 + (i + 0.5) * dl, y: 0, z: 0, q: a * dl, rod: false });
        break;
      }
      case 'ring':
        for (let i = 0; i < n; i++) {
          const ph = ((i + 0.5) / n) * Math.PI * 2;
          out.push({ x: 0, y: s * Math.cos(ph), z: s * Math.sin(ph), q: a / n, rod: false });
        }
        break;
      case 'plane': {
        const dy = (2 * s) / n;
        for (let i = 0; i < n; i++) out.push({ x: 0, y: -s + (i + 0.5) * dy, z: 0, q: a * dy, rod: true });
        break;
      }
      case 'plates': {
        const H = 12, m = Math.max(1, Math.round(n / 2)), dy = (2 * H) / m;
        for (let i = 0; i < m; i++) {
          out.push({ x: -s / 2, y: -H + (i + 0.5) * dy, z: 0, q: a * dy, rod: true });
          out.push({ x: s / 2, y: -H + (i + 0.5) * dy, z: 0, q: -a * dy, rod: true });
        }
        break;
      }
      case 'cylshell': {
        const lam = (a * 2 * Math.PI * s) / n;
        for (let i = 0; i < n; i++) {
          const ph = ((i + 0.5) / n) * Math.PI * 2;
          out.push({ x: s * Math.cos(ph), y: s * Math.sin(ph), z: 0, q: lam, rod: true });
        }
        break;
      }
      case 'shell':
        for (const d of fibonacciSphere(n)) out.push({ x: d[0] * s, y: d[1] * s, z: d[2] * s, q: a / n, rod: false });
        break;
      case 'solid': {
        const g = 1.32471795724474602596;
        for (let i = 0; i < n; i++) {
          const rad = s * Math.cbrt((i + 0.5) / n);
          const u = (0.5 + (i + 1) / g) % 1, v = (0.5 + (i + 1) / (g * g)) % 1;
          const ct = 2 * u - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * Math.PI * v;
          out.push({ x: rad * st * Math.cos(ph), y: rad * ct, z: rad * st * Math.sin(ph), q: a / n, rod: false });
        }
        break;
      }
    }
    this.pieces = out;
  }

  /** Field of one piece at an in-plane point. */
  private dE(pc: Piece, x: number, y: number): [number, number] {
    const dx = x - pc.x, dy = y - pc.y;
    if (pc.rod) {
      const r2 = Math.max(dx * dx + dy * dy, 1e-6);
      const f = (2 * K_NC * pc.q) / r2;
      return [f * dx, f * dy];
    }
    const r2 = Math.max(dx * dx + dy * dy + pc.z * pc.z, 1e-6);
    const f = (K_NC * pc.q) / (r2 * Math.sqrt(r2));
    return [f * dx, f * dy];
  }

  /** Sum over the N pieces. */
  numeric(x: number, y: number): [number, number] {
    let ex = 0, ey = 0;
    for (const pc of this.pieces) {
      const e = this.dE(pc, x, y);
      ex += e[0];
      ey += e[1];
    }
    return [ex, ey];
  }

  /** The closed-form result for the ideal (continuous) distribution. */
  ideal(x: number, y: number): [number, number] {
    const a = this.amount, s = this.size;
    const r = Math.hypot(x, y);
    const radial = (mag: number): [number, number] => (r > 1e-9 ? [(mag * x) / r, (mag * y) / r] : [0, 0]);
    switch (this.shape) {
      case 'line': {
        const x1 = -s / 2, x2 = s / 2;
        const d2 = Math.max(y * y, 1e-8);
        const r1 = Math.sqrt((x - x1) ** 2 + d2), r2 = Math.sqrt((x - x2) ** 2 + d2);
        return [K_NC * a * (1 / r2 - 1 / r1), ((K_NC * a * y) / d2) * ((x2 - x) / r2 - (x1 - x) / r1)];
      }
      case 'ring':
        return [(K_NC * a * x) / Math.pow(x * x + s * s, 1.5), 0];
      case 'plane':
        return [2 * Math.PI * K_NC * a * Math.sign(x), 0];
      case 'plates': {
        const inside = Math.abs(x) < s / 2;
        return [inside ? 4 * Math.PI * K_NC * a : 0, 0];
      }
      case 'cylshell':
        return r < s ? [0, 0] : radial((4 * Math.PI * K_NC * a * s) / r);
      case 'shell':
        return r < s ? [0, 0] : radial((K_NC * a) / (r * r));
      case 'solid':
        return r < s ? radial((K_NC * a * r) / (s * s * s)) : radial((K_NC * a) / (r * r));
    }
  }

  private rebuildCurves() {
    const scan = this.info.scan;
    const p = this.p;
    let ox = 0, oy = 0, ux = 1, uy = 0, t0 = -7, t1 = 7;
    if (scan === 'r') {
      const r = Math.hypot(p.x, p.y) || 1;
      ux = p.x / r;
      uy = p.y / r;
      t0 = 0.02;
      t1 = 7;
    } else if (scan === 'x') {
      oy = p.y;
    } else {
      ox = p.x;
      ux = 0;
      uy = 1;
    }
    this.scanDir = [ux, uy];
    this.scanOrigin = [ox, oy];
    const key = `${this.piecesKey}|${ox.toFixed(3)},${oy.toFixed(3)},${ux.toFixed(3)},${uy.toFixed(3)}`;
    if (key === this.curveKey) return;
    this.curveKey = key;
    for (let i = 0; i < SAMPLES; i++) {
      const t = t0 + ((t1 - t0) * i) / (SAMPLES - 1);
      const x = ox + ux * t, y = oy + uy * t;
      const e = this.numeric(x, y), id = this.ideal(x, y);
      this.xs[i] = t;
      this.yNum[i] = e[0] * ux + e[1] * uy;
      this.yIdeal[i] = id[0] * ux + id[1] * uy;
    }
  }

  /** Coordinate of the field point along the scan axis. */
  get scanT(): number {
    const p = this.p;
    return (p.x - this.scanOrigin[0]) * this.scanDir[0] + (p.y - this.scanOrigin[1]) * this.scanDir[1];
  }

  plotData = (): PlotData => {
    const scan = this.info.scan;
    const e = this.numeric(this.p.x, this.p.y);
    const along = e[0] * this.scanDir[0] + e[1] * this.scanDir[1];
    // keep the vertical range sensible: ignore the spikes right next to the charge
    let m = 1e-6;
    for (let i = 0; i < SAMPLES; i++) m = Math.max(m, Math.abs(this.yIdeal[i]));
    m = Math.max(m, Math.abs(along)) * 1.25;
    return {
      x0: scan === 'r' ? 0 : -7,
      x1: 7,
      y0: scan === 'r' && this.amount >= 0 ? -m * 0.06 : -m,
      y1: scan === 'r' && this.amount < 0 ? m * 0.06 : m,
      xLabel: scan === 'r' ? 'distance from centre r (m)' : scan === 'x' ? 'x (m)' : 'y (m)',
      yLabel: scan === 'r' ? 'E (N/C)' : scan === 'x' ? 'Eₓ (N/C)' : 'E_y (N/C)',
      curves: [
        { name: 'formula', color: alpha(C.white, 0.85), xs: this.xs, ys: this.yIdeal, dash: 5, width: 1.6 },
        { name: `sum of ${this.pieces.length} pieces`, color: C.E, xs: this.xs, ys: this.yNum, width: 2.2 },
      ],
      markers: [{ x: this.scanT, y: along, color: C.v, vline: true }],
    };
  };

  handles(): Handle[] {
    const p = this.p;
    return [
      {
        id: 'p',
        get: () => [p.x, p.y, 0],
        set: (q) => {
          p.x = q[0];
          p.y = this.shape === 'ring' ? 0 : q[1];
        },
        radius: 18,
      },
    ];
  }

  protected draw() {
    const r = this.r;
    const cam = this.camera;
    this.rebuild();
    this.rebuildCurves();
    grid2D(r, cam, { labels: true });
    const p = this.p;
    const col = this.amount >= 0 ? C.pos : C.neg;
    const s = this.size;
    const b = cam.bounds();

    // the ideal shape, drawn faintly behind the pieces
    r.layer(1);
    const ghost = alpha(col, 0.28);
    if (this.shape === 'line') r.seg([-s / 2, 0], [s / 2, 0], ghost, 5);
    else if (this.shape === 'plane') r.seg([0, Math.max(-s, b.y0)], [0, Math.min(s, b.y1)], ghost, 5);
    else if (this.shape === 'plates') {
      r.seg([-s / 2, b.y0], [-s / 2, b.y1], ghost, 5);
      r.seg([s / 2, b.y0], [s / 2, b.y1], alpha(this.amount >= 0 ? C.neg : C.pos, 0.28), 5);
    } else if (this.shape === 'ring') {
      r.seg([0, -s], [0, s], alpha(col, 0.14), 2, 5);
    } else {
      circle(r, [0, 0], s, ghost, this.shape === 'solid' ? 2 : 4);
      if (this.shape === 'solid') r.disc([0, 0], s, alpha(col, 0.09), { world: true });
    }

    // scan line for the plot
    const [ux, uy] = this.scanDir;
    const [ox, oy] = this.scanOrigin;
    r.seg([ox - ux * (this.info.scan === 'r' ? 0 : 20), oy - uy * (this.info.scan === 'r' ? 0 : 20)], [ox + ux * 20, oy + uy * 20], alpha(C.v, 0.35), 1, 5, 0);

    // pieces
    r.layer(2);
    const many = this.pieces.length > 90;
    for (const pc of this.pieces) {
      const pcCol = pc.q >= 0 ? C.pos : C.neg;
      const depth = pc.rod ? 1 : 0.45 + 0.55 * (0.5 + 0.5 * (pc.z / Math.max(s, 1e-6)));
      r.disc([pc.x, pc.y], many ? 2.6 : 4.5, alpha(pcCol, depth), { style: many ? 'flat' : 'sphere' });
    }

    // contributions at the field point
    const total = this.numeric(p.x, p.y);
    const ideal = this.ideal(p.x, p.y);
    const tm = Math.hypot(total[0], total[1]);
    const im = Math.hypot(ideal[0], ideal[1]);
    r.layer(3);
    const showArrows = this.showPieces && this.pieces.length <= 90;
    let scale: number;
    if (showArrows) {
      const contribs = this.pieces.map((pc) => this.dE(pc, p.x, p.y));
      if (this.chain) {
        // tip to tail: the chain ends exactly at the total
        let len = 0;
        for (const e of contribs) len += Math.hypot(e[0], e[1]);
        scale = Math.min(150 / cam.zoom / Math.max(tm, 1e-9), 380 / cam.zoom / Math.max(len, 1e-9));
        let cx = p.x, cy = p.y;
        contribs.forEach((e, i) => {
          const nx = cx + e[0] * scale, ny = cy + e[1] * scale;
          r.arrow([cx, cy], [nx, ny], alpha(this.pieces[i].q >= 0 ? C.pos : C.neg, 0.9), 1.6, 6);
          cx = nx;
          cy = ny;
        });
      } else {
        let big = 1e-12;
        for (const e of contribs) big = Math.max(big, Math.hypot(e[0], e[1]));
        scale = Math.min(110 / cam.zoom / Math.max(tm, 1e-9), 70 / cam.zoom / big);
        contribs.forEach((e, i) => {
          const pc = this.pieces[i];
          r.seg([pc.x, pc.y], [p.x, p.y], alpha(C.dim, 0.13), 1, 0, 0);
          r.arrow([p.x, p.y], [p.x + e[0] * scale, p.y + e[1] * scale], alpha(pc.q >= 0 ? C.pos : C.neg, 0.75), 1.4, 6);
        });
      }
    } else {
      scale = 110 / cam.zoom / Math.max(tm, im, 1e-9);
    }
    r.layer(4);
    if (im > 1e-9) r.arrow([p.x, p.y], [p.x + ideal[0] * scale, p.y + ideal[1] * scale], alpha(C.white, 0.75), 6);
    if (tm > 1e-9) {
      const tip = [p.x + total[0] * scale, p.y + total[1] * scale];
      r.arrow([p.x, p.y], tip, C.E, 3);
      r.label([tip[0] + (total[0] / tm) * (15 / cam.zoom), tip[1] + (total[1] / tm) * (15 / cam.zoom)], '\\vec E', { tex: true, color: css(C.E), size: 14 });
    }
    r.disc([p.x, p.y], 14, alpha(C.v, 0.25), { style: 'glow' });
    r.disc([p.x, p.y], 6.5, C.v, { style: 'sphere' });
    r.label([p.x, p.y], 'P', { size: 12, dy: 16, color: css(C.v), bold: true });
    const dist = this.info.scan === 'r' ? `r = ${fmt(Math.hypot(p.x, p.y), 3)} m` : this.info.scan === 'x' ? `x = ${fmt(p.x, 3)} m` : `distance = ${fmt(Math.abs(p.y), 3)} m`;
    r.label([p.x, p.y], dist, { size: 11, dy: 30, color: css(C.dim) });
  }
}

export type { RGBA };

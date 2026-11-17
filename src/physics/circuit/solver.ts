// Circuit simulator: modified nodal analysis (MNA) with trapezoidal integration.
//
// Conventions for every two-terminal element between grid points a and b:
//   v = V(a) - V(b)
//   i = current flowing through the element from a to b
// Battery / AC source: b is the + terminal, so V(b) - V(a) = emf and a positive i means
// the source is delivering power.
// Capacitor: `ic` is its initial voltage v. Inductor: `ic` is its initial current i.

export type ElType = 'wire' | 'resistor' | 'capacitor' | 'inductor' | 'battery' | 'ac' | 'switch';
export type Pt = [number, number];

export interface CElement {
  id: number;
  type: ElType;
  a: Pt;
  b: Pt;
  /** R (ohm), C (farad), L (henry), emf (volt) or AC amplitude (volt). */
  value: number;
  /** AC frequency in Hz. */
  freq: number;
  /** Capacitor initial voltage / inductor initial current. */
  ic: number;
  /** Switch state. */
  closed: boolean;
  // ----- simulation state -----
  v: number;
  i: number;
  na: number;
  nb: number;
}

export const DEFAULTS: Record<ElType, number> = {
  wire: 0, resistor: 100, capacitor: 0.01, inductor: 1, battery: 10, ac: 5, switch: 0,
};

/** Parasitic series resistance of wires, closed switches and sources (keeps the matrix regular). */
const RW = 1e-6;
/** Resistance of an open switch. */
const ROFF = 1e12;
/** Leak conductance from every node to ground so floating nodes stay solvable. */
const GMIN = 1e-12;
const MAX_STEPS_PER_ADVANCE = 4000;

let nextId = 1;
export function makeElement(type: ElType, a: Pt, b: Pt, value?: number, extra?: Partial<CElement>): CElement {
  return {
    id: nextId++, type, a: [a[0], a[1]], b: [b[0], b[1]],
    value: value ?? DEFAULTS[type], freq: 1, ic: 0, closed: false, v: 0, i: 0, na: 0, nb: 0,
    ...extra,
  };
}

/** Dense LU factorisation with partial pivoting. */
class LU {
  readonly perm: Int32Array;
  singular = false;
  constructor(readonly a: Float64Array, readonly n: number) {
    const perm = new Int32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.abs(a[k * n + k]);
      for (let r = k + 1; r < n; r++) {
        const v = Math.abs(a[r * n + k]);
        if (v > max) {
          max = v;
          p = r;
        }
      }
      if (max < 1e-18) {
        this.singular = true;
        a[k * n + k] = 1e-18;
      }
      if (p !== k) {
        for (let c = 0; c < n; c++) {
          const t = a[k * n + c];
          a[k * n + c] = a[p * n + c];
          a[p * n + c] = t;
        }
        const t = perm[k];
        perm[k] = perm[p];
        perm[p] = t;
      }
      const piv = a[k * n + k];
      for (let r = k + 1; r < n; r++) {
        const f = a[r * n + k] / piv;
        if (f === 0) continue;
        a[r * n + k] = f;
        for (let c = k + 1; c < n; c++) a[r * n + c] -= f * a[k * n + c];
      }
    }
    this.perm = perm;
  }
  solve(b: Float64Array, x: Float64Array) {
    const n = this.n, a = this.a;
    for (let i = 0; i < n; i++) {
      let s = b[this.perm[i]];
      for (let j = 0; j < i; j++) s -= a[i * n + j] * x[j];
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j];
      x[i] = s / a[i * n + i];
    }
  }
}

type Mode = 'op' | 'be' | 'trap';

interface System {
  lu: LU;
  n: number;
  /** Row / column of each element's branch current, or -1. */
  branch: Int32Array;
}

export interface Energies {
  /** Energy stored in capacitors, sum of C v^2 / 2 = q^2 / 2C. */
  uc: number;
  /** Energy stored in inductors, sum of L i^2 / 2. */
  ul: number;
  /** Heat dissipated in resistors since reset. */
  heat: number;
  /** Work done by sources since reset. */
  work: number;
}

export class Circuit {
  elements: CElement[] = [];
  time = 0;
  heat = 0;
  work = 0;
  /** Largest |current| seen since reset. */
  peakI = 0;
  /** Largest |node voltage| seen since reset. */
  peakV = 0;
  /** Voltage of each node; node 0 is ground. */
  nodeV: number[] = [];
  nodeCount = 0;
  singular = false;
  /** True when the last advance() could not keep up with the requested time. */
  lagging = false;
  /** Called every `sampleDt` of simulated time (and right after reset). */
  onSample: (() => void) | null = null;
  sampleDt = 1 / 200;

  private nodeIndex = new Map<string, number>();
  private systems = new Map<string, System>();
  private h = 1 / 240;
  private rate = 1;
  private startup = 0;
  private acc = 0;
  private lastSample = -Infinity;
  private pHeat = 0;
  private pWork = 0;

  // ---------- editing ----------

  add(e: CElement): CElement {
    this.elements.push(e);
    return e;
  }

  remove(e: CElement) {
    this.elements = this.elements.filter((k) => k !== e);
  }

  /** Simulated seconds per real second; used to pick the step size. */
  setRate(rate: number) {
    if (rate === this.rate) return;
    this.rate = rate;
    this.pickStep();
    this.systems.clear();
  }

  get stepSize() {
    return this.h;
  }

  nodeAt(p: Pt): number {
    return this.nodeIndex.get(`${p[0]},${p[1]}`) ?? -1;
  }

  voltageAt(p: Pt): number {
    const n = this.nodeAt(p);
    return n >= 0 ? this.nodeV[n] ?? 0 : 0;
  }

  /** Number of element ends attached to each node. */
  degrees(): number[] {
    const d = new Array(this.nodeCount).fill(0);
    for (const e of this.elements) {
      d[e.na]++;
      d[e.nb]++;
    }
    return d;
  }

  /** Rebuild the node list. Call after elements are added, removed or moved. */
  structure() {
    const idx = this.nodeIndex;
    idx.clear();
    const key = (p: Pt) => `${p[0]},${p[1]}`;
    const els = this.elements;
    // ground: the negative terminal of the first source, else the b plate of the first capacitor
    const src = els.find((e) => e.type === 'battery' || e.type === 'ac');
    const cap = els.find((e) => e.type === 'capacitor');
    const g = src ? src.a : cap ? cap.b : els[0]?.a;
    if (g) idx.set(key(g), 0);
    for (const e of els) {
      for (const p of [e.a, e.b]) if (!idx.has(key(p))) idx.set(key(p), idx.size);
      e.na = idx.get(key(e.a))!;
      e.nb = idx.get(key(e.b))!;
    }
    this.nodeCount = idx.size;
    if (this.nodeV.length !== this.nodeCount) this.nodeV = new Array(this.nodeCount).fill(0);
    this.systems.clear();
    this.pickStep();
  }

  private pickStep() {
    let tau = Infinity;
    const Rs: number[] = [], Cs: number[] = [], Ls: number[] = [];
    for (const e of this.elements) {
      if (e.type === 'resistor') Rs.push(Math.max(e.value, 1e-9));
      else if (e.type === 'capacitor') Cs.push(e.value);
      else if (e.type === 'inductor') Ls.push(e.value);
      else if (e.type === 'ac' && e.freq > 0) tau = Math.min(tau, 1 / (2 * Math.PI * e.freq));
    }
    for (const C of Cs) for (const R of Rs) tau = Math.min(tau, R * C);
    for (const L of Ls) for (const R of Rs) tau = Math.min(tau, L / R);
    for (const L of Ls) for (const C of Cs) tau = Math.min(tau, Math.sqrt(L * C));
    // at least 4 steps per 60 Hz frame, at most ~2000
    const hi = this.rate / 240, lo = this.rate / 120000;
    this.h = Math.min(hi, Math.max(lo, tau / 40));
  }

  // ---------- matrix assembly ----------

  private hasBranch(e: CElement, mode: Mode): boolean {
    switch (e.type) {
      case 'wire': case 'battery': case 'ac': return true;
      case 'switch': return e.closed;
      case 'capacitor': return mode === 'op';
      case 'inductor': return mode !== 'op';
      default: return false;
    }
  }

  private build(mode: Mode, h: number): System {
    const els = this.elements;
    const nn = Math.max(0, this.nodeCount - 1);
    const branch = new Int32Array(els.length).fill(-1);
    let nb = 0;
    els.forEach((e, k) => {
      if (this.hasBranch(e, mode)) branch[k] = nn + nb++;
    });
    const n = nn + nb;
    const A = new Float64Array(n * n);
    for (let i = 0; i < nn; i++) A[i * n + i] += GMIN;
    const addG = (a: number, b: number, g: number) => {
      if (a > 0) A[(a - 1) * n + (a - 1)] += g;
      if (b > 0) A[(b - 1) * n + (b - 1)] += g;
      if (a > 0 && b > 0) {
        A[(a - 1) * n + (b - 1)] -= g;
        A[(b - 1) * n + (a - 1)] -= g;
      }
    };
    // branch row: ca * V(a) + cb * V(b) + ck * i = rhs ; plus KCL coupling (i leaves a, enters b)
    const addBranch = (k: number, a: number, b: number, ca: number, cb: number, ck: number) => {
      if (a > 0) {
        A[(a - 1) * n + k] += 1;
        A[k * n + (a - 1)] += ca;
      }
      if (b > 0) {
        A[(b - 1) * n + k] -= 1;
        A[k * n + (b - 1)] += cb;
      }
      A[k * n + k] += ck;
    };
    els.forEach((e, idx) => {
      const k = branch[idx];
      switch (e.type) {
        case 'resistor':
          addG(e.na, e.nb, 1 / Math.max(e.value, 1e-9));
          break;
        case 'wire':
          addBranch(k, e.na, e.nb, 1, -1, -RW);
          break;
        case 'switch':
          if (e.closed) addBranch(k, e.na, e.nb, 1, -1, -RW);
          else addG(e.na, e.nb, 1 / ROFF);
          break;
        case 'battery':
        case 'ac':
          // V(b) - V(a) + RW i = emf
          addBranch(k, e.na, e.nb, -1, 1, RW);
          break;
        case 'capacitor':
          if (mode === 'op') addBranch(k, e.na, e.nb, 1, -1, -RW);
          else addG(e.na, e.nb, ((mode === 'trap' ? 2 : 1) * e.value) / h);
          break;
        case 'inductor':
          if (mode !== 'op') addBranch(k, e.na, e.nb, 1, -1, -((mode === 'trap' ? 2 : 1) * e.value) / h);
          break;
      }
    });
    const lu = new LU(A, n);
    return { lu, n, branch };
  }

  private system(mode: Mode, h: number): System {
    if (mode === 'op') return this.build(mode, h);
    const key = `${mode}:${h}`;
    let s = this.systems.get(key);
    if (!s) {
      s = this.build(mode, h);
      this.systems.set(key, s);
    }
    return s;
  }

  private emf(e: CElement, t: number): number {
    return e.type === 'ac' ? e.value * Math.sin(2 * Math.PI * e.freq * t) : e.value;
  }

  /** Source voltage of a battery / AC element at the current time. */
  emfNow(e: CElement): number {
    return this.emf(e, this.time);
  }

  private solve(mode: Mode, h: number, t: number) {
    const els = this.elements;
    if (!els.length) return;
    const sys = this.system(mode, h);
    const { n, branch } = sys;
    const b = new Float64Array(n);
    const ieq = new Float64Array(els.length);
    const k2 = mode === 'trap' ? 2 : 1;
    els.forEach((e, idx) => {
      const k = branch[idx];
      switch (e.type) {
        case 'battery':
        case 'ac':
          b[k] = this.emf(e, t);
          break;
        case 'capacitor':
          if (mode === 'op') b[k] = e.v;
          else {
            const geq = (k2 * e.value) / h;
            const q = mode === 'trap' ? geq * e.v + e.i : geq * e.v;
            ieq[idx] = q;
            if (e.na > 0) b[e.na - 1] += q;
            if (e.nb > 0) b[e.nb - 1] -= q;
          }
          break;
        case 'inductor':
          if (mode === 'op') {
            if (e.na > 0) b[e.na - 1] -= e.i;
            if (e.nb > 0) b[e.nb - 1] += e.i;
          } else {
            b[k] = mode === 'trap' ? -((2 * e.value) / h) * e.i - e.v : -(e.value / h) * e.i;
          }
          break;
      }
    });
    const x = new Float64Array(n);
    sys.lu.solve(b, x);
    this.singular = sys.lu.singular;
    if (this.singular) return;
    for (let i = 0; i < n; i++) {
      if (!isFinite(x[i])) {
        this.singular = true;
        return;
      }
    }
    const V = this.nodeV;
    V[0] = 0;
    for (let i = 1; i < this.nodeCount; i++) V[i] = x[i - 1];
    els.forEach((e, idx) => {
      const v = V[e.na] - V[e.nb];
      const k = branch[idx];
      switch (e.type) {
        case 'resistor':
          e.v = v;
          e.i = v / Math.max(e.value, 1e-9);
          break;
        case 'capacitor':
          if (mode === 'op') e.i = x[k];
          else {
            e.i = ((k2 * e.value) / h) * v - ieq[idx];
            e.v = v;
          }
          break;
        case 'inductor':
          if (mode !== 'op') e.i = x[k];
          e.v = v;
          break;
        case 'switch':
          e.v = v;
          e.i = e.closed ? x[k] : v / ROFF;
          break;
        default:
          e.v = v;
          e.i = x[k];
      }
    });
  }

  private powers(t: number) {
    let heat = 0, work = 0, pi = this.peakI, pv = this.peakV;
    for (const e of this.elements) {
      switch (e.type) {
        case 'resistor': heat += e.v * e.i; break;
        case 'wire': heat += RW * e.i * e.i; break;
        case 'switch': {
          // leakage through an open switch is ignored unless it is an arc (inductor current interrupted)
          const p = e.closed ? RW * e.i * e.i : e.v * e.i;
          if (e.closed || p > 1e-6) heat += p;
          break;
        }
        case 'battery':
        case 'ac':
          heat += RW * e.i * e.i;
          work += this.emf(e, t) * e.i;
          break;
      }
      const ai = Math.abs(e.i);
      if (ai > pi && ai < 1e5) pi = ai;
    }
    for (const v of this.nodeV) if (Math.abs(v) > pv && Math.abs(v) < 1e7) pv = Math.abs(v);
    this.peakI = pi;
    this.peakV = pv;
    this.pHeat = heat;
    this.pWork = work;
  }

  // ---------- running ----------

  /** Restart from the initial conditions stored on the elements. */
  reset() {
    this.time = 0;
    this.heat = 0;
    this.work = 0;
    this.peakI = 0;
    this.peakV = 0;
    this.acc = 0;
    for (const e of this.elements) {
      e.v = e.type === 'capacitor' ? e.ic : 0;
      e.i = e.type === 'inductor' ? e.ic : 0;
    }
    this.structure();
    this.discontinuity();
    this.lastSample = this.time;
    this.onSample?.();
  }

  /**
   * Call after anything changes abruptly (switch flipped, element edited). Re-solves the
   * instantaneous state with capacitors holding their voltage and inductors holding their
   * current, and makes the next steps use backward Euler so the change does not ring.
   */
  discontinuity() {
    this.systems.clear();
    this.solve('op', this.h, this.time);
    this.powers(this.time);
    this.startup = 2;
  }

  private step() {
    const be = this.startup > 0;
    const h = be ? this.h / 20 : this.h;
    if (be) this.startup--;
    const pH = this.pHeat, pW = this.pWork;
    this.solve(be ? 'be' : 'trap', h, this.time + h);
    if (this.singular) return h;
    this.time += h;
    this.powers(this.time);
    this.heat += 0.5 * (pH + this.pHeat) * h;
    this.work += 0.5 * (pW + this.pWork) * h;
    if (this.time - this.lastSample >= this.sampleDt) {
      this.lastSample = this.time;
      this.onSample?.();
    }
    return h;
  }

  /** Advance the simulation by dt simulated seconds. */
  advance(dt: number) {
    if (!this.elements.length || dt <= 0) return;
    this.acc += dt;
    let steps = 0;
    this.lagging = false;
    while (true) {
      const h = this.startup > 0 ? this.h / 20 : this.h;
      if (this.acc < h) break;
      if (steps++ >= MAX_STEPS_PER_ADVANCE) {
        this.acc = 0;
        this.lagging = true;
        break;
      }
      this.step();
      this.acc -= h;
      if (this.singular) {
        this.acc = 0;
        break;
      }
    }
  }

  /** Run for exactly `duration` simulated seconds (used by tests and the Step button). */
  run(duration: number) {
    const end = this.time + duration;
    let guard = 0;
    while (this.time < end - 1e-12 && guard++ < 5e6 && !this.singular) this.step();
  }

  energies(): Energies {
    let uc = 0, ul = 0;
    for (const e of this.elements) {
      if (e.type === 'capacitor') uc += 0.5 * e.value * e.v * e.v;
      else if (e.type === 'inductor') ul += 0.5 * e.value * e.i * e.i;
    }
    return { uc, ul, heat: this.heat, work: this.work };
  }
}

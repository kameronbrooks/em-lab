import { C, RGBA, alpha, css, hex, mix, signed } from '../../engine/colors';
import { sign } from '../../engine/draw';
import { Handle, Lab2D } from '../../engine/lab';
import { clamp, fmt } from '../../engine/math';
import { Curve, Marker, PlotData, TimeSeries } from '../../engine/plot';
import { SeriesInfo, analyzeSeries, drivenAmplitude } from '../../physics/circuit/analytic';
import { CElement, Circuit, DEFAULTS, ElType, Pt, makeElement } from '../../physics/circuit/solver';
import { PRESETS, Preset, findPreset } from './presets';

export type Tool = 'select' | 'delete' | ElType;

const STORE_KEY = 'emlab.circuit.v1';
const DOT_SPACING = 0.5;
const DOT_SPEED = 2.4;
const SEL: RGBA = hex('#6aa5ff', 0.3);
const HEAT: RGBA = hex('#ff8a3c');

interface Saved {
  type: ElType;
  a: Pt;
  b: Pt;
  value: number;
  freq: number;
  ic: number;
  closed: boolean;
}

export const TYPE_NAME: Record<ElType, string> = {
  wire: 'Wire', resistor: 'Resistor', capacitor: 'Capacitor', inductor: 'Inductor',
  battery: 'Battery', ac: 'AC source', switch: 'Switch',
};

/** Format with an SI prefix: si(0.01, 'F') -> "10 mF". */
export function si(x: number, unit: string, digits = 3): string {
  if (!isFinite(x)) return `∞ ${unit}`;
  const ax = Math.abs(x);
  if (ax < 5e-10) return `0 ${unit}`;
  const prefixes: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [f, p] of prefixes) {
    if (ax >= f * 0.9995) {
      let s = (x / f).toPrecision(digits);
      if (s.includes('.')) s = s.replace(/\.?0+$/, '');
      return `${s.replace('-', '−')} ${p}${unit}`;
    }
  }
  return `${x.toExponential(1)} ${unit}`;
}

export function valueLabel(e: CElement): string {
  switch (e.type) {
    case 'resistor': return si(e.value, 'Ω');
    case 'capacitor': return si(e.value, 'F');
    case 'inductor': return si(e.value, 'H');
    case 'battery': return si(e.value, 'V');
    case 'ac': return `${si(e.value, 'V')} · ${fmt(e.freq, 3)} Hz`;
    default: return '';
  }
}

export class CircuitLab extends Lab2D {
  circuit = new Circuit();
  tool: Tool = 'select';
  selected: CElement | null = null;
  hoverEl: CElement | null = null;
  analysis: SeriesInfo | null = null;
  preset: Preset | null = null;
  /** Plot window in simulated seconds. */
  window = 6;
  showDots = true;
  showValues = true;

  private scopeId: number | null = null;
  private hist = new TimeSeries(5, 8);
  private histIndex = new Map<number, number>();
  private phases = new Map<number, number>();
  private undoStack: string[] = [];
  private lastUndoTag = '';
  private lastUndoAt = 0;
  private placing: { a: Pt; b: Pt } | null = null;
  private moving: { el: CElement; a0: Pt; b0: Pt; start: Pt; undone: boolean } | null = null;
  private needFit = true;
  /** Peak stored energy and peak resistor power since restart (for glow scaling). */
  private uRef = 0;
  private pRef = 0;

  constructor() {
    super();
    this.camera.zoom = 56;
    this.camera.minZoom = 12;
    this.camera.maxZoom = 220;
    this.circuit.onSample = () => this.sample();
    if (!this.loadSaved()) this.loadPreset('rc-discharge');
  }

  protected init() {
    this.needFit = true;
  }

  // ---------- persistence / undo ----------

  private serialize(): Saved[] {
    return this.circuit.elements.map((e) => ({
      type: e.type, a: [e.a[0], e.a[1]], b: [e.b[0], e.b[1]], value: e.value, freq: e.freq, ic: e.ic, closed: e.closed,
    }));
  }

  private restore(items: Saved[]) {
    this.circuit.elements = items.map((s) => makeElement(s.type, s.a, s.b, s.value, { freq: s.freq, ic: s.ic, closed: s.closed }));
    this.selected = null;
    this.hoverEl = null;
    this.scopeId = null;
    this.restart();
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ elements: this.serialize(), preset: this.preset?.id ?? null, window: this.window }));
    } catch {
      /* storage may be unavailable */
    }
  }

  private loadSaved(): boolean {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw) as { elements: Saved[]; preset: string | null; window?: number };
      if (!Array.isArray(d.elements) || !d.elements.length) return false;
      this.preset = d.preset ? findPreset(d.preset) ?? null : null;
      if (d.window) this.window = d.window;
      this.restore(d.elements);
      return true;
    } catch {
      return false;
    }
  }

  /** Remember the current circuit so Ctrl+Z can bring it back. `tag` merges rapid repeats. */
  pushUndo(tag = '') {
    const now = performance.now();
    if (tag && tag === this.lastUndoTag && now - this.lastUndoAt < 1500) {
      this.lastUndoAt = now;
      return;
    }
    this.lastUndoTag = tag;
    this.lastUndoAt = now;
    this.undoStack.push(JSON.stringify(this.serialize()));
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.lastUndoTag = '';
    this.restore(JSON.parse(s) as Saved[]);
    this.save();
  }

  // ---------- editing ----------

  loadPreset(id: string) {
    const p = findPreset(id) ?? PRESETS[0];
    if (this.circuit.elements.length) this.pushUndo();
    this.preset = p;
    this.window = p.window;
    this.circuit.elements = p.build();
    this.selected = null;
    this.hoverEl = null;
    this.scopeId = null;
    this.tool = 'select';
    this.paused = false;
    this.needFit = true;
    this.restart();
    this.save();
  }

  clear() {
    this.pushUndo();
    this.circuit.elements = [];
    this.selected = null;
    this.preset = null;
    this.restart();
    this.save();
  }

  /** Restart the run from the initial conditions (after any edit). */
  restart() {
    const n = this.circuit.elements.length;
    this.hist = new TimeSeries(2 * n + 5, this.window * 1.3);
    this.histIndex.clear();
    this.circuit.elements.forEach((e, k) => this.histIndex.set(e.id, k));
    this.uRef = 0;
    this.pRef = 0;
    this.circuit.sampleDt = this.window / 1200;
    this.circuit.setRate(this.speed);
    this.circuit.reset();
    this.analysis = analyzeSeries(this.circuit);
  }

  /** Called by the panel after a value changed. */
  edited() {
    this.restart();
    this.save();
  }

  setWindow(w: number) {
    this.window = w;
    this.restart();
    this.save();
  }

  toggleSwitch(e: CElement) {
    if (e.type !== 'switch') return;
    e.closed = !e.closed;
    this.circuit.discontinuity();
    this.analysis = analyzeSeries(this.circuit);
    this.save();
  }

  deleteElement(e: CElement | null) {
    if (!e) return;
    this.pushUndo();
    this.circuit.remove(e);
    if (this.selected === e) this.selected = null;
    if (this.hoverEl === e) this.hoverEl = null;
    this.restart();
    this.save();
  }

  /** Swap the two ends (reverses a battery or the sign of an initial condition). */
  flip(e: CElement) {
    this.pushUndo();
    const a = e.a;
    e.a = e.b;
    e.b = a;
    this.restart();
    this.save();
  }

  setTool(t: Tool) {
    this.tool = t;
    this.placing = null;
    if (t !== 'select') this.selected = null;
  }

  stepOnce() {
    this.paused = true;
    this.circuit.setRate(this.speed);
    this.circuit.run(this.speed / 30);
    this.time = this.circuit.time;
  }

  // ---------- queries for the panel ----------

  /** The element shown on the scope. */
  scopeEl(): CElement | null {
    const els = this.circuit.elements;
    if (this.selected && this.selected.type !== 'wire' && this.selected.type !== 'switch') this.scopeId = this.selected.id;
    let e = els.find((k) => k.id === this.scopeId) ?? null;
    if (!e) {
      e = els.find((k) => k.type === 'capacitor') ?? els.find((k) => k.type === 'inductor') ??
        els.find((k) => k.type === 'resistor') ?? els.find((k) => k.type !== 'wire') ?? null;
      this.scopeId = e?.id ?? null;
    }
    return e;
  }

  /** V/I seen by the battery when the circuit is purely resistive. */
  equivalentR(): number | null {
    const els = this.circuit.elements;
    const bats = els.filter((e) => e.type === 'battery');
    if (bats.length !== 1 || els.some((e) => e.type === 'ac' || e.type === 'capacitor' || e.type === 'inductor')) return null;
    if (!els.some((e) => e.type === 'resistor')) return null;
    const i = bats[0].i;
    if (Math.abs(i) < 1e-12 || Math.abs(i) > 1e4) return null;
    return bats[0].value / i;
  }

  elementName(e: CElement): string {
    const same = this.circuit.elements.filter((k) => k.type === e.type);
    const n = same.indexOf(e) + 1;
    const letter: Record<ElType, string> = { wire: 'Wire', resistor: 'R', capacitor: 'C', inductor: 'L', battery: 'Battery', ac: 'AC', switch: 'Switch' };
    return same.length > 1 || 'RCL'.includes(letter[e.type]) ? `${letter[e.type]}${e.type === 'wire' ? '' : n}` : letter[e.type];
  }

  // ---------- scope ----------

  private sample() {
    const c = this.circuit;
    const els = c.elements;
    const vals = new Array<number>(2 * els.length + 5);
    els.forEach((e, k) => {
      vals[2 * k] = e.v;
      vals[2 * k + 1] = e.i;
    });
    const en = c.energies();
    const b = 2 * els.length;
    vals[b] = en.uc;
    vals[b + 1] = en.ul;
    vals[b + 2] = en.heat;
    vals[b + 3] = en.uc + en.ul + en.heat;
    vals[b + 4] = en.work;
    if (this.hist.channels === vals.length) this.hist.push(c.time, vals);
  }

  plotData(kind: 'v' | 'i' | 'e'): PlotData {
    const c = this.circuit;
    const W = this.window;
    const x1 = Math.max(W, c.time + 0.2 * W);
    const x0 = x1 - W;
    const now: Marker = { x: c.time, vline: true, color: C.dim };
    const h = this.hist;
    if (kind === 'e') {
      const b = h.channels - 5;
      const hasSource = c.elements.some((e) => e.type === 'battery' || e.type === 'ac');
      const curves: Curve[] = [
        { name: 'C', color: C.V, xs: h.t, ys: h.v[b] },
        { name: 'L', color: C.B, xs: h.t, ys: h.v[b + 1] },
        { name: 'heat', color: HEAT, xs: h.t, ys: h.v[b + 2] },
        { name: 'total', color: C.text, xs: h.t, ys: h.v[b + 3], width: 1.5, dash: 5 },
      ];
      if (hasSource) curves.push({ name: 'source', color: C.good, xs: h.t, ys: h.v[b + 4], width: 1.5 });
      return { x0, x1, curves, markers: [now], includeZero: true, minSpan: 1e-4, yLabel: 'joules', xLabel: 't (s)' };
    }
    const e = this.scopeEl();
    const idx = e ? this.histIndex.get(e.id) : undefined;
    const curves: Curve[] = [];
    const name = e ? this.elementName(e) : '';
    if (e && idx !== undefined) {
      curves.push({
        name,
        color: kind === 'v' ? C.V : C.I,
        xs: h.t,
        ys: h.v[2 * idx + (kind === 'v' ? 0 : 1)],
      });
      const an = this.analysis;
      if (an?.hasSolution) {
        const N = 260;
        const from = an.ac ? x0 : Math.max(x0, an.t0);
        const xs = new Float64Array(N), ys = new Float64Array(N);
        for (let k = 0; k < N; k++) {
          const t = from + ((x1 - from) * k) / (N - 1);
          const p = an.element(e, t);
          xs[k] = t;
          ys[k] = p ? (kind === 'v' ? p.v : p.i) : NaN;
        }
        curves.push({ color: alpha(C.white, 0.85), width: 1.4, dash: 4, xs, ys });
      }
    }
    return {
      x0, x1, curves, markers: [now], includeZero: true, minSpan: kind === 'v' ? 0.1 : 1e-3,
      yLabel: kind === 'v' ? 'volts' : 'amps', xLabel: 't (s)',
    };
  }

  /** Resonance curve for a driven series circuit. */
  resonanceData(): PlotData | null {
    const an = this.analysis;
    if (!an?.ac || !an.f0) return null;
    const fMax = Math.max(3 * an.f0, an.ac.freq * 1.3);
    const N = 240;
    const xs = new Float64Array(N), ys = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const f = (fMax * (k + 1)) / N;
      xs[k] = f;
      ys[k] = drivenAmplitude(an.ac.amp, f, an.R, an.L, an.C);
    }
    return {
      x0: 0, x1: fMax, includeZero: true, xLabel: 'f (Hz)', yLabel: 'I peak (A)',
      curves: [{ color: C.I, xs, ys }],
      markers: [
        { x: an.f0, vline: true, color: C.dim, label: 'f₀' },
        { x: an.ac.freq, y: drivenAmplitude(an.ac.amp, an.ac.freq, an.R, an.L, an.C), color: C.white },
      ],
    };
  }

  // ---------- interaction ----------

  private snap(w: readonly number[]): Pt {
    return [Math.round(w[0]), Math.round(w[1])];
  }

  elementAt(wx: number, wy: number): CElement | null {
    const tol = 12 / this.camera.zoom;
    let best: CElement | null = null, bestD = tol;
    for (const e of this.circuit.elements) {
      const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1];
      const l2 = dx * dx + dy * dy;
      const t = clamp(((wx - e.a[0]) * dx + (wy - e.a[1]) * dy) / l2, 0, 1);
      const d = Math.hypot(wx - (e.a[0] + dx * t), wy - (e.a[1] + dy * t));
      // prefer components over wires when both are in reach
      const bias = e.type === 'wire' ? d : d * 0.6;
      if (bias < bestD) {
        bestD = bias;
        best = e;
      }
    }
    return best;
  }

  handles(): Handle[] {
    const e = this.selected;
    if (this.tool !== 'select' || !e) return [];
    const mk = (end: 'a' | 'b'): Handle => ({
      id: end,
      radius: 11,
      get: () => [e[end][0], e[end][1], 0],
      down: () => this.pushUndo(),
      set: (p) => {
        const q = this.snap(p);
        const other = end === 'a' ? e.b : e.a;
        if ((q[0] !== e[end][0] || q[1] !== e[end][1]) && !(q[0] === other[0] && q[1] === other[1])) {
          e[end] = q;
          this.restart();
          this.save();
        }
      },
    });
    return [mk('a'), mk('b')];
  }

  protected onBackgroundDown(x: number, y: number): boolean {
    const w = this.camera.toWorld(x, y);
    const hit = this.elementAt(w[0], w[1]);
    if (this.tool === 'select') {
      if (!hit) return false;
      this.selected = hit;
      this.moving = { el: hit, a0: [hit.a[0], hit.a[1]], b0: [hit.b[0], hit.b[1]], start: this.snap(w), undone: false };
      return true;
    }
    if (this.tool === 'delete') return !!hit;
    const p = this.snap(w);
    this.placing = { a: p, b: [p[0], p[1]] };
    return true;
  }

  protected onBackgroundDrag(x: number, y: number) {
    const w = this.camera.toWorld(x, y);
    const p = this.snap(w);
    if (this.placing) {
      this.placing.b = p;
      return;
    }
    const m = this.moving;
    if (m) {
      const dx = p[0] - m.start[0], dy = p[1] - m.start[1];
      const a: Pt = [m.a0[0] + dx, m.a0[1] + dy], b: Pt = [m.b0[0] + dx, m.b0[1] + dy];
      if (a[0] !== m.el.a[0] || a[1] !== m.el.a[1]) {
        if (!m.undone) {
          this.pushUndo();
          m.undone = true;
        }
        m.el.a = a;
        m.el.b = b;
        this.restart();
      }
    }
  }

  protected onBackgroundUp() {
    const pl = this.placing;
    this.placing = null;
    if (this.moving?.undone) this.save();
    this.moving = null;
    if (pl && (pl.a[0] !== pl.b[0] || pl.a[1] !== pl.b[1]) && this.tool !== 'select' && this.tool !== 'delete') {
      this.pushUndo();
      const type = this.tool;
      const e = this.circuit.add(makeElement(type, pl.a, pl.b, DEFAULTS[type]));
      this.preset = null;
      this.restart();
      this.save();
      if (type !== 'wire') this.selected = e;
    }
  }

  protected onClick(x: number, y: number): boolean {
    const w = this.camera.toWorld(x, y);
    const hit = this.elementAt(w[0], w[1]);
    if (this.tool === 'delete') {
      if (hit) this.deleteElement(hit);
      return true;
    }
    this.selected = hit;
    if (hit?.type === 'switch') this.toggleSwitch(hit);
    return true;
  }

  protected onHover(x: number, y: number) {
    const w = this.camera.toWorld(x, y);
    this.hoverEl = this.elementAt(w[0], w[1]);
  }

  onPointerLeave() {
    super.onPointerLeave();
    this.hoverEl = null;
  }

  onKey(e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      this.undo();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (!this.selected) return false;
        this.deleteElement(this.selected);
        return true;
      case 'Escape': this.setTool('select'); return true;
      case ' ': this.paused = !this.paused; return true;
    }
    const map: Record<string, Tool> = { v: 'select', w: 'wire', r: 'resistor', c: 'capacitor', l: 'inductor', b: 'battery', a: 'ac', s: 'switch', x: 'delete' };
    const t = map[e.key.toLowerCase()];
    if (t) {
      this.setTool(t);
      return true;
    }
    return false;
  }

  cursor(): string {
    if (this.dragging) return 'grabbing';
    if (this.hovered) return 'grab';
    if (this.tool === 'select') return this.moving ? 'grabbing' : this.hoverEl ? 'pointer' : 'default';
    if (this.tool === 'delete') return this.hoverEl ? 'pointer' : 'default';
    return 'crosshair';
  }

  // ---------- simulation ----------

  protected update(dt: number) {
    const c = this.circuit;
    c.setRate(this.speed);
    c.advance(dt);
    this.time = c.time;
    const en = c.energies();
    this.uRef = Math.max(this.uRef, en.uc + en.ul);
    let p = 0;
    for (const e of c.elements) if (e.type === 'resistor') p = Math.max(p, e.v * e.i);
    this.pRef = Math.max(this.pRef, p);
    // current dots move in real time, scaled to the largest current seen since restart
    if (dt > 0 && c.peakI > 1e-9) {
      const real = dt / Math.max(this.speed, 1e-6);
      for (const e of c.elements) {
        const f = clamp(e.i / c.peakI, -1, 1);
        let ph = (this.phases.get(e.id) ?? 0) + f * DOT_SPEED * real;
        ph = ((ph % DOT_SPACING) + DOT_SPACING) % DOT_SPACING;
        this.phases.set(e.id, ph);
      }
    }
  }

  // ---------- drawing ----------

  private fit() {
    const els = this.circuit.elements;
    if (!els.length) {
      this.camera.cx = 2;
      this.camera.cy = 1.5;
      this.camera.zoom = 56;
      return;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const e of els) {
      for (const p of [e.a, e.b]) {
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]);
        y1 = Math.max(y1, p[1]);
      }
    }
    this.camera.fit(x0 - 1.9, x1 + 1.9, y0 - 1.1, y1 + 1.5, 1);
    this.camera.zoom = Math.min(this.camera.zoom, 96);
  }

  protected draw() {
    const r = this.r;
    const cam = this.camera;
    if (this.needFit && r.width > 2) {
      this.needFit = false;
      this.fit();
      cam.update(r.width, r.height);
    }
    const c = this.circuit;
    const b = cam.bounds();

    // grid dots
    r.layer(0);
    const gx0 = Math.ceil(b.x0), gx1 = Math.floor(b.x1), gy0 = Math.ceil(b.y0), gy1 = Math.floor(b.y1);
    if ((gx1 - gx0) * (gy1 - gy0) < 5000) {
      const col = this.tool === 'select' || this.tool === 'delete' ? C.gridStrong : C.axis;
      for (let x = gx0; x <= gx1; x++) for (let y = gy0; y <= gy1; y++) r.disc([x, y], 1.4, col);
    }

    const vref = Math.max(c.peakV, 1e-9);
    const vcol = (v: number) => signed(clamp(v / vref, -1, 1));

    for (const e of c.elements) this.drawElement(e, vcol);

    // node dots and junctions
    r.layer(4);
    const deg = c.degrees();
    const seen = new Set<number>();
    for (const e of c.elements) {
      for (const [p, n] of [[e.a, e.na], [e.b, e.nb]] as [Pt, number][]) {
        if (seen.has(n)) continue;
        seen.add(n);
        const d = deg[n] ?? 0;
        const col = vcol(c.nodeV[n] ?? 0);
        if (d >= 3) r.disc(p, 4.5, col);
        else if (d === 1) r.disc(p, 4, alpha(C.warn, 0.95), { style: 'ring', ring: 1.5 });
        else r.disc(p, 2.4, col);
      }
    }

    // endpoint handles of the selected element
    if (this.tool === 'select' && this.selected) {
      r.layer(6);
      for (const p of [this.selected.a, this.selected.b]) {
        r.disc(p, 6.5, C.bg);
        r.disc(p, 6.5, C.white, { style: 'ring', ring: 1.6 });
      }
    }

    // placement preview
    if (this.placing) {
      r.layer(6);
      const { a, b: pb } = this.placing;
      r.disc(a, 5, C.white);
      if (a[0] !== pb[0] || a[1] !== pb[1]) {
        r.seg(a, pb, alpha(C.white, 0.8), 2, 5, 0);
        r.disc(pb, 5, C.white);
        r.label([(a[0] + pb[0]) / 2, (a[1] + pb[1]) / 2], TYPE_NAME[this.tool as ElType] ?? '', { size: 11.5, bg: true, dy: -16 });
      }
    } else if (this.tool !== 'select' && this.tool !== 'delete' && this.pointer.inside) {
      r.layer(6);
      r.disc(this.snap(this.mouse), 4.5, alpha(C.white, 0.7), { style: 'ring', ring: 1.4 });
    }

    // hover read-out
    const hv = this.hoverEl;
    if (hv && this.pointer.inside && !this.placing && !this.dragging) {
      const text = hv.type === 'wire'
        ? `Wire   I = ${si(Math.abs(hv.i), 'A')}`
        : `${this.elementName(hv)}   V = ${si(hv.v, 'V')}   I = ${si(hv.i, 'A')}`;
      r.labelScreen(this.pointer.x + 14, this.pointer.y + 24, text, { size: 11.5, align: 'left', bg: true });
    }

    if (c.singular) {
      r.labelScreen(r.width / 2, 58, 'This circuit cannot be solved as drawn (for example two different batteries wired directly together).', {
        size: 12, bg: true, color: css(C.warn),
      });
    } else if (!c.elements.length) {
      r.labelScreen(r.width / 2, r.height / 2, 'Pick a part above, then drag between two grid points to place it.', { size: 13, color: css(C.dim) });
    }
  }

  private drawElement(e: CElement, vcol: (v: number) => RGBA) {
    const r = this.r;
    const c = this.circuit;
    const ax = e.a[0], ay = e.a[1];
    const dx = e.b[0] - ax, dy = e.b[1] - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const mx = ax + dx / 2, my = ay + dy / 2;
    const pt = (s: number, t = 0): Pt => [mx + ux * s + nx * t, my + uy * s + ny * t];
    const ca = vcol(c.nodeV[e.na] ?? 0), cb = vcol(c.nodeV[e.nb] ?? 0);
    const W = 2.6;
    const body = C.text;
    const k = Math.min(1, (len * 0.42) / 0.42); // shrink bodies on very short elements
    const sel = e === this.selected, hov = e === this.hoverEl;

    if (sel || hov) {
      r.layer(1);
      r.seg(e.a, e.b, sel ? SEL : alpha(SEL, this.tool === 'delete' ? 0.0 : 0.14), 16);
      if (hov && this.tool === 'delete') r.seg(e.a, e.b, alpha(C.bad, 0.3), 16);
    }

    r.layer(2);
    const leads = (hb: number) => {
      r.seg(e.a, pt(-hb), ca, W);
      r.seg(pt(hb), e.b, cb, W);
    };
    let labelOff = 0.5;

    switch (e.type) {
      case 'wire':
        r.seg(e.a, e.b, ca, W);
        break;
      case 'resistor': {
        const hb = 0.42 * k;
        leads(hb);
        const heat = this.pRef > 1e-9 ? clamp((e.v * e.i) / this.pRef, 0, 1) : 0;
        if (heat > 0.01) {
          r.layer(1);
          r.disc(pt(0), 30, alpha(HEAT, 0.55 * heat), { style: 'glow' });
          r.layer(2);
        }
        const col = mix(body, HEAT, heat * 0.8);
        const n = 6, amp = 0.15 * k;
        let prev = pt(-hb);
        for (let j = 0; j < n; j++) {
          const p = pt(-hb + ((j + 0.5) * 2 * hb) / n, j % 2 ? -amp : amp);
          r.seg(prev, p, col, W);
          prev = p;
        }
        r.seg(prev, pt(hb), col, W);
        labelOff = 0.44;
        break;
      }
      case 'capacitor': {
        const g = 0.085, hw = 0.3 * k;
        leads(g);
        const f = clamp(e.v / Math.max(c.peakV, Math.abs(e.ic), 1e-9), -1, 1);
        if (Math.abs(f) > 0.01) {
          r.layer(1);
          r.disc(pt(0), 26, alpha(C.V, 0.5 * Math.abs(f)), { style: 'glow' });
          r.layer(2);
        }
        const pa = signed(f), pb = signed(-f);
        r.seg(pt(-g, -hw), pt(-g, hw), pa, 4 + 2.5 * Math.abs(f), 0, 0);
        r.seg(pt(g, -hw), pt(g, hw), pb, 4 + 2.5 * Math.abs(f), 0, 0);
        const ns = Math.round(Math.abs(f) * 4);
        for (let j = 0; j < ns; j++) {
          const t = ((j + 0.5) / ns - 0.5) * 2 * hw * 0.85;
          sign(r, pt(-g - 0.14, t), f > 0, pa, 3.4, 1.5);
          sign(r, pt(g + 0.14, t), f < 0, pb, 3.4, 1.5);
        }
        labelOff = 0.52;
        break;
      }
      case 'inductor': {
        const hb = 0.44 * k;
        leads(hb);
        const u = this.uRef > 1e-9 ? clamp((0.5 * e.value * e.i * e.i) / this.uRef, 0, 1) : 0;
        if (u > 0.01) {
          r.layer(1);
          r.disc(pt(0), 34, alpha(C.B, 0.6 * u), { style: 'glow' });
          r.layer(2);
        }
        const col = mix(body, C.B, u * 0.85);
        const bumps = 4, rb = hb / bumps;
        let prev = pt(-hb);
        for (let j = 0; j < bumps; j++) {
          const cx = -hb + rb * (2 * j + 1);
          for (let q = 1; q <= 8; q++) {
            const th = (Math.PI * q) / 8;
            const p = pt(cx - rb * Math.cos(th), rb * 1.35 * Math.sin(th));
            r.seg(prev, p, col, W);
            prev = p;
          }
        }
        labelOff = 0.58;
        break;
      }
      case 'battery': {
        const g = 0.075;
        leads(g);
        r.seg(pt(-g, -0.16 * k), pt(-g, 0.16 * k), body, 5, 0, 0);
        r.seg(pt(g, -0.32 * k), pt(g, 0.32 * k), body, 2.4, 0, 0);
        sign(r, pt(g + 0.17, 0.27 * k), true, C.pos, 3.6, 1.6);
        sign(r, pt(-g - 0.17, 0.27 * k), false, C.neg, 3.6, 1.6);
        labelOff = 0.56;
        break;
      }
      case 'ac': {
        const rad = 0.3 * k;
        leads(rad);
        const ring: Pt[] = [];
        for (let j = 0; j <= 40; j++) {
          const th = (Math.PI * 2 * j) / 40;
          ring.push(pt(rad * Math.cos(th), rad * Math.sin(th)));
        }
        r.polyline(ring, body, 2.2);
        // sine glyph drawn upright on screen
        const wave: Pt[] = [];
        for (let j = 0; j <= 20; j++) {
          const s = (j / 20 - 0.5) * rad * 1.15;
          wave.push([mx + s, my + Math.sin((s / (rad * 1.15)) * Math.PI * 2) * rad * 0.36]);
        }
        r.polyline(wave, C.I, 1.8);
        sign(r, pt(rad + 0.14, 0.22 * k), true, C.pos, 3.4, 1.5);
        labelOff = 0.52;
        break;
      }
      case 'switch': {
        const hb = 0.32 * k;
        leads(hb);
        const tip = e.closed ? pt(hb) : pt(-hb + 2 * hb * Math.cos(0.55), 2 * hb * Math.sin(0.55));
        r.seg(pt(-hb), tip, e.closed ? C.good : C.warn, 3);
        r.disc(pt(-hb), 4, body);
        r.disc(pt(hb), 4, body);
        labelOff = 0.5;
        break;
      }
    }

    // value label
    if (this.showValues && e.type !== 'wire') {
      const text = e.type === 'switch' ? (e.closed ? 'closed' : 'open · click') : valueLabel(e);
      const vertical = Math.abs(nx) > 0.5;
      const p = pt(0, vertical ? labelOff * 0.85 : labelOff);
      r.label(p, text, {
        size: 11.5,
        color: css(sel ? C.white : C.text),
        align: vertical ? (nx > 0 ? 'left' : 'right') : 'center',
        opacity: 0.92,
      });
    }

    // current dots
    if (this.showDots && c.peakI > 1e-9 && Math.abs(e.i) / c.peakI > 0.004 && Math.abs(e.i) < 1e5) {
      r.layer(3);
      const ph = this.phases.get(e.id) ?? 0;
      for (let s = ph; s < len; s += DOT_SPACING) {
        if (e.type === 'capacitor' && Math.abs(s - len / 2) < 0.13) continue;
        if (e.type === 'switch' && !e.closed) continue;
        r.disc([ax + ux * s, ay + uy * s], 2.7, C.I);
      }
    }
  }
}

import { C, RGBA, alpha, css } from '../../engine/colors';
import { axes3D, circlePoints, intoOut } from '../../engine/draw';
import { Lab3D } from '../../engine/lab';
import { V3, add, addScaled, alignY, clamp, cross, len, lerp, mul, norm, scale, scaling, sub, translation } from '../../engine/math';
import { Mesh, boxGeo, cylinderGeo } from '../../engine/mesh';
import { PlotData, TimeSeries } from '../../engine/plot';
import { MU0 } from '../../physics/fields';
import {
  Profile, fluxBesideWire, inducedE, loopArea, profileB, profileDB, rotatingLoop, slidingLoop, solenoidField, stretchLoop,
} from '../../physics/induction';
import { gridXY } from './magForceLab';

// SI units: tesla, metres, seconds, volts, ohms. The wire scenario is shown in micro-units because
// the field of a realistic wire is tiny.

export type IndScenario = 'uniform' | 'slide' | 'rotate' | 'wire' | 'stretch';
export type ProfileKind = 'linear' | 'cos' | 'exp';

const REGION = { x0: 0, x1: 6, y: 2.6 };
const WINDOW = 10;

export interface IndState {
  flux: number;
  emf: number;
  current: number;
  /** Field value to display (T), if the scenario has a single one. */
  B: number;
}

export class InductionLab extends Lab3D {
  scenario: IndScenario = 'uniform';
  /** Loop resistance (ohms). */
  R = 2;

  // uniform field through a fixed loop
  profile: ProfileKind = 'linear';
  A = 0.2; // T/s
  b = 1; // T
  w = 2; // rad/s
  Cc = 1.5; // T
  a = 0.6; // 1/s
  shape: 'circle' | 'square' = 'circle';
  /** Radius of the circle or side of the square (m). */
  size = 1.5;
  /** Angle between the loop's normal and B (degrees). */
  tilt = 0;
  /** Field exists only inside radius Rs (a long solenoid poking through the loop). */
  confined = false;
  Rs = 1;
  showE = false;

  // loop sliding into a field region
  sB = 0.8; // T, into the board when positive
  sW = 2.5;
  sH = 2;
  sV = 1.2;

  // loop rotating inside a solenoid
  solN = 2000;
  solI = 200;
  ra = 1.2;
  rw = 2;

  // loop and a wire with I = A t
  wA = 100; // A/s
  wb = 2; // loop radius
  wireMode: 'centered' | 'beside' = 'centered';
  wd = 0.8;
  ww = 2;
  wl = 3;

  // stretchable square
  stB = 0.8;
  stL = 3;
  stT = 3;

  /** Time within the current run of the scenario (restarts for non-periodic profiles). */
  t = 0;
  /** Time that never restarts, for the plots. */
  clock = 0;
  series = new TimeSeries(3, WINDOW);
  private dotPhase = 0;
  private iRef = 1e-12;
  private areaKey = '';
  private areaVal = 0;
  private tube!: Mesh;
  private cyl!: Mesh;
  private slab!: Mesh;

  constructor() {
    super();
    this.camera.distance = 15;
    this.view3D();
  }

  protected init() {
    const gl = this.r.gl;
    this.tube = new Mesh(gl, cylinderGeo(56, false));
    this.cyl = new Mesh(gl, cylinderGeo(24, true));
    this.slab = new Mesh(gl, boxGeo());
  }

  dispose() {
    this.tube?.dispose();
    this.cyl?.dispose();
    this.slab?.dispose();
  }

  view3D() {
    this.camera.yaw = 0.5;
    this.camera.pitch = 0.4;
  }

  boardView() {
    this.camera.yaw = 0;
    this.camera.pitch = 0;
  }

  setScenario(s: IndScenario) {
    this.scenario = s;
    this.camera.target = s === 'slide' ? [2.5, 0, 0] : [0, 0, 0];
    this.camera.distance = s === 'slide' ? 17 : 15;
    // flat set-ups read best looking straight at the board
    if (s === 'slide' || s === 'stretch' || s === 'wire') this.boardView();
    else this.view3D();
    this.restart();
  }

  restart() {
    this.t = 0;
    this.clock = 0;
    this.series.clear();
    this.iRef = 1e-12;
    this.dotPhase = 0;
  }

  preset(name: string) {
    switch (name) {
      case 'p24':
        this.setScenario('rotate');
        break;
      case 'p25':
        this.setScenario('uniform');
        this.profile = 'linear';
        this.shape = 'circle';
        break;
      case 'p26':
        this.setScenario('uniform');
        this.profile = 'cos';
        break;
      case 'p36':
        this.setScenario('uniform');
        this.profile = 'linear';
        this.shape = 'square';
        this.size = 2;
        break;
      case 'p37':
        this.setScenario('wire');
        this.wireMode = 'centered';
        break;
      case 'p38':
        this.setScenario('uniform');
        this.profile = 'exp';
        this.shape = 'square';
        this.size = 2;
        break;
      case 'p39':
        this.setScenario('uniform');
        this.profile = 'linear';
        this.shape = 'circle';
        this.showE = true;
        this.boardView();
        break;
      case 'p40':
        this.setScenario('stretch');
        break;
      case 'slide':
        this.setScenario('slide');
        break;
      default:
        if ((['uniform', 'slide', 'rotate', 'wire', 'stretch'] as string[]).includes(name)) this.setScenario(name as IndScenario);
        return;
    }
    this.restart();
  }

  // ---------- physics ----------

  get prof(): Profile {
    if (this.profile === 'linear') return { kind: 'linear', A: this.A };
    if (this.profile === 'cos') return { kind: 'cos', b: this.b, w: this.w };
    return { kind: 'exp', C: this.Cc, a: this.a };
  }

  /** How long one run lasts before it starts again (0 = runs forever). */
  get period(): number {
    switch (this.scenario) {
      case 'uniform': return this.profile === 'linear' ? 6 : this.profile === 'exp' ? Math.min(12, 5 / this.a) : 0;
      case 'slide': return (REGION.x1 - REGION.x0 + this.sW + 2.4) / Math.max(0.1, this.sV);
      case 'wire': return 6;
      case 'stretch': return this.stT + 1.5;
      default: return 0;
    }
  }

  /** Units used on the plots: [multiplier, flux unit, emf unit, current unit]. */
  get units(): [number, string, string, string] {
    return this.scenario === 'wire' ? [1e6, 'µWb', 'µV', 'µA'] : [1, 'Wb', 'V', 'A'];
  }

  get solB(): number {
    return solenoidField(this.solN, this.solI);
  }

  /** Unit normal of the loop. Positive emf drives current counter-clockwise about it. */
  normal(t = this.t): V3 {
    if (this.scenario === 'uniform') {
      const a = (this.tilt * Math.PI) / 180;
      return [0, Math.sin(a), Math.cos(a)];
    }
    if (this.scenario === 'rotate') return [Math.cos(this.rw * t), 0, -Math.sin(this.rw * t)];
    return [0, 0, 1];
  }

  /** Part of the loop's area that the field actually passes through (uniform scenario). */
  private effectiveArea(): number {
    const full = loopArea(this.shape, this.size);
    if (!this.confined) return full;
    if (this.shape === 'circle') return Math.PI * Math.min(this.size, this.Rs) ** 2;
    const key = `${this.size}|${this.Rs}`;
    if (key !== this.areaKey) {
      // overlap of a centred square (side = size) with a disc of radius Rs
      const n = 200, h = this.size / 2;
      let c = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = (((i + 0.5) / n) * 2 - 1) * h, y = (((j + 0.5) / n) * 2 - 1) * h;
          if (x * x + y * y < this.Rs * this.Rs) c++;
        }
      }
      this.areaVal = (c / (n * n)) * this.size * this.size;
      this.areaKey = key;
    }
    return this.areaVal;
  }

  at(t = this.t): IndState {
    let flux = 0, emf = 0, B = 0;
    switch (this.scenario) {
      case 'uniform': {
        const area = this.effectiveArea();
        // with the field confined to a tube the tilt does not matter for a loop that still surrounds it
        const cos = this.confined ? 1 : Math.cos((this.tilt * Math.PI) / 180);
        B = profileB(this.prof, t);
        flux = B * area * cos;
        emf = -profileDB(this.prof, t) * area * cos;
        break;
      }
      case 'slide': {
        // field points into the board (-z) when sB > 0; the loop normal is +z
        const s = slidingLoop({ B: -this.sB, w: this.sW, h: this.sH, v: this.sV, x0: REGION.x0 - 1.2, regionStart: REGION.x0, regionEnd: REGION.x1 }, t);
        flux = s.flux;
        emf = s.emf;
        B = this.sB;
        break;
      }
      case 'rotate': {
        const s = rotatingLoop(this.solB, this.ra, this.rw, this.R, t);
        flux = s.flux;
        emf = s.emf;
        B = this.solB;
        break;
      }
      case 'wire': {
        if (this.wireMode === 'beside') {
          // wire along +y, loop on the +x side: B points into the board there
          flux = -fluxBesideWire(this.wA * t, this.wl, this.wd, this.ww);
          emf = fluxBesideWire(this.wA, this.wl, this.wd, this.ww);
        }
        B = (MU0 * this.wA * t) / (2 * Math.PI * (this.wireMode === 'beside' ? this.wd : this.wb));
        break;
      }
      case 'stretch': {
        const s = stretchLoop(this.stB, this.stL, this.stT, t);
        flux = s.flux;
        emf = s.emf;
        B = this.stB;
        break;
      }
    }
    return { flux, emf, current: emf / this.R, B };
  }

  /** Size of the induced electric field along the loop, for a circular loop: E = |emf| / 2 pi R. */
  inducedField(): number {
    const s = this.at();
    const R = this.scenario === 'uniform' ? this.size : this.scenario === 'wire' ? this.wb : this.ra;
    return Math.abs(inducedE(s.emf, R));
  }

  /** Largest emf the present settings can give (for the "maximum emf" problems). */
  maxEmf(): number | null {
    if (this.scenario === 'uniform') {
      const area = this.effectiveArea() * (this.confined ? 1 : Math.abs(Math.cos((this.tilt * Math.PI) / 180)));
      if (this.profile === 'linear') return Math.abs(this.A) * area;
      if (this.profile === 'cos') return Math.abs(this.b * this.w) * area;
      return Math.abs(this.Cc * this.a) * area;
    }
    if (this.scenario === 'rotate') return Math.abs(this.solB * Math.PI * this.ra * this.ra * this.rw);
    if (this.scenario === 'slide') return Math.abs(this.sB * this.sH * this.sV);
    if (this.scenario === 'stretch') return Math.abs((this.stB * 3 * this.stL * this.stL) / (4 * this.stT));
    return null;
  }

  /** Lenz's law in words for the present moment. */
  lenz(): string {
    const s = this.at();
    const tiny = 1e-9 * Math.max(1e-12, this.maxEmf() ?? 1e-6);
    if (Math.abs(s.emf) <= tiny) {
      if (this.scenario === 'wire' && this.wireMode === 'centered') {
        return 'The wire’s field circles around it inside the plane of the loop. None of it passes through the loop, so the flux is zero at all times and no current is induced, however fast the current in the wire changes.';
      }
      return 'The flux through the loop is not changing right now, so there is no emf and no induced current.';
    }
    const dPhi = -s.emf;
    const growing = Math.abs(s.flux) < 1e-12 ? true : dPhi * s.flux > 0;
    const ccw = s.emf > 0;
    const sense = ccw ? 'counter-clockwise' : 'clockwise';
    const view = this.scenario === 'rotate' || (this.scenario === 'uniform' && this.tilt !== 0) ? 'looking at the loop with its normal n̂ pointing at you' : 'seen from the front';
    return `The flux through the loop is ${growing ? 'growing' : 'shrinking'}. The induced current flows ${sense} (${view}), so the field it makes inside the loop points ${growing ? 'against' : 'the same way as'} the original flux. It always fights the change, never the flux itself.`;
  }

  protected update(dt: number) {
    if (dt <= 0) return;
    this.t += dt;
    this.clock += dt;
    const p = this.period;
    if (p > 0 && this.t > p) this.t = 0;
    const s = this.at();
    const [k] = this.units;
    this.series.push(this.clock, [s.flux * k, s.emf * k, s.current * k]);
    this.iRef = Math.max(this.iRef, Math.abs(s.current));
    this.dotPhase += dt * 0.3 * clamp(s.current / this.iRef, -1, 1);
  }

  fluxPlot = (): PlotData => {
    const u = this.units;
    const x1 = Math.max(WINDOW, this.clock);
    return {
      x0: x1 - WINDOW, x1, includeZero: true, minSpan: this.scenario === 'wire' ? 1 : 0.2,
      yLabel: `flux Φ (${u[1]})`, xLabel: 't (s)',
      curves: [{ color: C.B, xs: this.series.t, ys: this.series.v[0], width: 2.2 }],
    };
  };

  emfPlot = (): PlotData => {
    const u = this.units;
    const x1 = Math.max(WINDOW, this.clock);
    return {
      x0: x1 - WINDOW, x1, includeZero: true, minSpan: this.scenario === 'wire' ? 1 : 0.2,
      yLabel: `emf (${u[2]})`, xLabel: 't (s)',
      curves: [{ color: C.I, xs: this.series.t, ys: this.series.v[1], width: 2.2 }],
    };
  };

  // ---------- drawing ----------

  /** Corner or outline points of the loop, counter-clockwise about its normal. */
  loopPoints(): V3[] {
    const n = this.normal();
    switch (this.scenario) {
      case 'uniform': {
        if (this.shape === 'circle') return circlePoints([0, 0, 0], this.size, n, 72).slice(0, -1);
        const u: V3 = [1, 0, 0];
        const v = cross(n, u);
        const h = this.size / 2;
        return rectPts([0, 0, 0], u, v, h, h);
      }
      case 'slide': {
        const front = REGION.x0 - 1.2 + this.sV * this.t;
        return rectPts([front - this.sW / 2, 0, 0], [1, 0, 0], [0, 1, 0], this.sW / 2, this.sH / 2);
      }
      case 'rotate':
        return circlePoints([0, 0, 0], this.ra, n, 72).slice(0, -1);
      case 'wire':
        if (this.wireMode === 'centered') return circlePoints([0, 0, 0], this.wb, n, 72).slice(0, -1);
        return rectPts([this.wd + this.ww / 2, 0, 0], [1, 0, 0], [0, 1, 0], this.ww / 2, this.wl / 2);
      case 'stretch': {
        const h = stretchLoop(this.stB, this.stL, this.stT, this.t).side / 2;
        return rectPts([0, 0, 0], [1, 0, 0], [0, 1, 0], h, h);
      }
    }
  }

  private drawLoop(state: IndState) {
    const r = this.r;
    const pts = this.loopPoints();
    const n = pts.length;
    r.layer(6);
    const wire: RGBA = [0.88, 0.86, 0.8, 1];
    for (let i = 0; i < n; i++) r.seg(pts[i], pts[(i + 1) % n], wire, 4.5);
    // arc-length table for dots and arrowheads
    const cum: number[] = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + len(sub(pts[(i + 1) % n], pts[i])));
    const total = cum[n];
    const at = (f: number): V3 => {
      const d = (((f % 1) + 1) % 1) * total;
      let i = 0;
      while (i < n - 1 && cum[i + 1] < d) i++;
      const seg = cum[i + 1] - cum[i];
      return lerp(pts[i], pts[(i + 1) % n], seg > 0 ? (d - cum[i]) / seg : 0);
    };
    const flowing = Math.abs(state.current) > 1e-6 * this.iRef;
    if (flowing) {
      const dir = Math.sign(state.current);
      r.layer(7);
      for (let k = 0; k < 14; k++) r.disc(at(k / 14 + this.dotPhase), 4.2, C.I);
      for (const f of [0.125, 0.375, 0.625, 0.875]) {
        r.head(at(f + dir * 0.02), at(f - dir * 0.02), C.I, 15);
      }
    }
    // loop normal
    const c = scale(pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / n);
    const nn = this.normal();
    r.layer(8);
    r.arrow(c, addScaled(c, nn, 1.2), [0.85, 0.88, 0.95, 1], 2);
    r.label(addScaled(c, nn, 1.45), '\\hat n', { tex: true, size: 14 });
    // induced electric field: tangent arrows round the loop
    if (this.showE && flowing && (this.scenario === 'uniform' || this.scenario === 'rotate')) {
      const dir = Math.sign(state.emf);
      const L = 0.75 * clamp(Math.abs(state.emf) / Math.max(1e-12, this.maxEmf() ?? 1), 0.25, 1);
      for (let k = 0; k < 10; k++) {
        const p = at((k + 0.5) / 10), q = at((k + 0.5) / 10 + 0.01 * dir);
        const tdir = norm(sub(q, p));
        const out = norm(sub(p, c));
        const o = addScaled(p, out, 0.35);
        r.arrow(addScaled(o, tdir, -L / 2), addScaled(o, tdir, L / 2), C.E, 2.4, 10);
      }
      r.label(addScaled(at(0.05), norm(sub(at(0.05), c)), 0.8), '\\vec E', { tex: true, color: css(C.E), size: 14 });
    }
    r.layer(0);
  }

  /** A lattice of field markers in the board plane: arrows along z in 3D, dots/crosses when seen face-on. */
  private drawFieldZ(B: number, ref: number, inside: (x: number, y: number) => boolean, x0 = -4, x1 = 4, y0 = -3, y1 = 3) {
    const r = this.r;
    if (Math.abs(B) < 1e-9 * ref) return;
    const k = clamp(Math.abs(B) / ref, 0, 1);
    const facing = Math.abs(this.camera.forward[2]) > 0.94;
    const s = Math.sign(B);
    for (let x = x0; x <= x1 + 1e-9; x += 1) {
      for (let y = y0; y <= y1 + 1e-9; y += 1) {
        if (!inside(x, y)) continue;
        if (facing) {
          // +z is out of the board when the camera looks down -z
          intoOut(r, [x, y, 0], s * -this.camera.forward[2] > 0, alpha(C.B, 0.35 + 0.65 * k), 3.5 + 5 * k);
        } else {
          const L = 0.25 + 1.5 * k;
          r.arrow([x, y, (-s * L) / 2], [x, y, (s * L) / 2], alpha(C.B, 0.35 + 0.55 * k), 1.8, 8);
        }
      }
    }
  }

  protected draw() {
    const r = this.r;
    const st = this.at();
    gridXY(r, 7, 1, 0);
    axes3D(r, 1.2, [-6.6, -6.4, 0]);

    switch (this.scenario) {
      case 'uniform': {
        const ref = this.profile === 'linear' ? Math.abs(this.A) * 6 : this.profile === 'cos' ? Math.abs(this.b) : Math.abs(this.Cc);
        const Rs = this.Rs;
        this.drawFieldZ(st.B, Math.max(ref, 1e-9), (x, y) => !this.confined || x * x + y * y < Rs * Rs,
          this.confined ? -Rs : -4, this.confined ? Rs : 4, this.confined ? -Rs : -3, this.confined ? Rs : 3);
        if (this.confined) {
          r.polyline(circlePoints([0, 0, 0], Rs, [0, 0, 1], 64), alpha(C.B, 0.7), 1.5, false, 5);
          r.layer(50);
          r.mesh(this.tube, alignY([0, 0, -3], [0, 0, 1], Rs, 6), alpha(C.B, 0.07), { rim: 2 });
          r.layer(0);
        }
        break;
      }
      case 'slide': {
        const cx = (REGION.x0 + REGION.x1) / 2, hw = (REGION.x1 - REGION.x0) / 2;
        r.layer(50);
        r.mesh(this.slab, mul(translation([cx, 0, -0.02]), scaling(hw, REGION.y, 0.01)), alpha(C.B, 0.12), { unlit: true });
        r.layer(0);
        r.polyline(rectPts([cx, 0, 0], [1, 0, 0], [0, 1, 0], hw, REGION.y), alpha(C.B, 0.6), 1.3, true, 5);
        this.drawFieldZ(-this.sB, 1.5, (x, y) => x > REGION.x0 && x < REGION.x1 && Math.abs(y) < REGION.y, 0.5, 5.5, -2, 2);
        r.label([cx, REGION.y + 0.35, 0], this.sB >= 0 ? 'B into the board' : 'B out of the board', { color: css(C.B), size: 12 });
        // velocity of the loop and the magnetic drag on it
        const front = REGION.x0 - 1.2 + this.sV * this.t;
        const c: V3 = [front - this.sW / 2, 0, 0];
        r.layer(9);
        r.arrow([c[0], -this.sH / 2 - 0.45, 0], [c[0] + 1.1, -this.sH / 2 - 0.45, 0], C.v, 3);
        r.label([c[0] + 1.45, -this.sH / 2 - 0.45, 0], '\\vec v', { tex: true, color: css(C.v), size: 14 });
        if (Math.abs(st.current) > 1e-9) {
          r.arrow([c[0], this.sH / 2 + 0.45, 0], [c[0] - 1.1, this.sH / 2 + 0.45, 0], C.F, 3);
          r.label([c[0] - 1.5, this.sH / 2 + 0.45, 0], '\\vec F', { tex: true, color: css(C.F), size: 14 });
        }
        r.layer(0);
        break;
      }
      case 'rotate': {
        const R = 2.3, half = 5;
        const s = Math.sign(this.solI) || 1;
        for (let x = -half; x <= half + 1e-9; x += 0.5) r.polyline(circlePoints([x, 0, 0], R, [1, 0, 0], 48), alpha(C.I, 0.3), 1.2);
        for (const [y, z] of [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]] as const) {
          r.seg([-half, y, z], [half, y, z], alpha(C.B, 0.34), 1.3, 0, 0);
          for (const x of [-3.2, 0, 3.2]) r.head([x + s * 0.22, y, z], [x - s * 0.22, y, z], alpha(C.B, 0.65), 9);
        }
        r.label([half + 0.5, 0, 0], '\\vec B', { tex: true, color: css(C.B), size: 15 });
        r.layer(50);
        r.mesh(this.tube, alignY([-half, 0, 0], [1, 0, 0], R, half * 2), alpha(C.I, 0.05), { rim: 2 });
        r.layer(0);
        // rotation axis
        r.seg([0, -2.8, 0], [0, 2.8, 0], alpha(C.dim, 0.7), 1.2, 5, 0);
        break;
      }
      case 'wire': {
        const I = this.wA * this.t;
        const k = clamp(I / (this.wA * 6), 0, 1);
        if (this.wireMode === 'centered') {
          r.mesh(this.cyl, alignY([0, 0, -4], [0, 0, 1], 0.1, 8), [0.8, 0.75, 0.58, 1]);
          r.layer(100);
          intoOut(r, [0, 0, 0], true, C.I, 9);
          r.label([0, 0, 0], 'I = At, out of the board', { color: css(C.I), size: 11.5, dy: 22 });
          r.layer(0);
          for (const rad of [0.6, 1.2, 1.8, 2.6, 3.4]) {
            r.polyline(circlePoints([0, 0, 0], rad, [0, 0, 1], 64), alpha(C.B, (0.2 + 0.7 * k) / Math.sqrt(rad + 0.4)), 1.4);
            for (let j = 0; j < 4; j++) {
              const th = (j / 4) * Math.PI * 2 + rad;
              const p: V3 = [rad * Math.cos(th), rad * Math.sin(th), 0];
              const t: V3 = [-Math.sin(th), Math.cos(th), 0];
              r.head(addScaled(p, t, 0.16), addScaled(p, t, -0.16), alpha(C.B, 0.35 + 0.65 * k), 9);
            }
          }
        } else {
          r.mesh(this.cyl, alignY([0, -4.5, 0], [0, 1, 0], 0.1, 9), [0.8, 0.75, 0.58, 1]);
          for (const y of [-2.5, 2.5]) r.head([0, y + 0.4, 0], [0, y - 0.4, 0], C.I, 15);
          r.label([0, 4.3, 0], 'I = At', { color: css(C.I), size: 12, dx: 26 });
          // field: into the board on the right, out on the left, weaker further away
          for (let x = -4.5; x <= 4.5; x += 1) {
            for (let y = -3; y <= 3; y += 1) {
              const m = clamp((k * 0.6) / Math.abs(x), 0, 1);
              intoOut(r, [x, y + 0.5, 0], x < 0, alpha(C.B, 0.25 + 0.75 * m), 3 + 6 * m);
            }
          }
        }
        break;
      }
      case 'stretch': {
        this.drawFieldZ(this.stB, 1.5, () => true, -3, 3, -3, 3);
        const h = this.stL / 2;
        r.polyline(rectPts([0, 0, 0], [1, 0, 0], [0, 1, 0], h, h), alpha(C.dim, 0.6), 1.2, true, 5);
        r.polyline(rectPts([0, 0, 0], [1, 0, 0], [0, 1, 0], h / 2, h / 2), alpha(C.dim, 0.6), 1.2, true, 5);
        break;
      }
    }

    this.drawLoop(st);

    const [k, fu, eu] = this.units;
    const f = (x: number) => (Math.abs(x) < 1e-9 ? '0' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2)).replace('-', '−');
    r.labelScreen(r.width - 12, 62, `Φ = ${f(st.flux * k)} ${fu}`, { align: 'right', size: 12.5, color: css(C.B), bg: true });
    r.labelScreen(r.width - 12, 84, `emf = ${f(st.emf * k)} ${eu}`, { align: 'right', size: 12.5, color: css(C.I), bg: true });
  }
}

/** Rectangle corners, counter-clockwise about u x v, subdivided so dots travel smoothly. */
function rectPts(c: V3, u: V3, v: V3, hu: number, hv: number): V3[] {
  const corners: V3[] = [
    add(c, add(scale(u, -hu), scale(v, -hv))),
    add(c, add(scale(u, hu), scale(v, -hv))),
    add(c, add(scale(u, hu), scale(v, hv))),
    add(c, add(scale(u, -hu), scale(v, hv))),
  ];
  return corners;
}

import { C, RGBA, alpha, css } from '../../engine/colors';
import { axes3D, circlePoints, intoOut } from '../../engine/draw';
import { Handle, Lab3D } from '../../engine/lab';
import { Renderer } from '../../engine/renderer';
import { V3, add, addScaled, alignY, basis, clamp, cross, dot, len, norm, perp, scale, sub } from '../../engine/math';
import { Mesh, cylinderGeo, planeGeo } from '../../engine/mesh';
import { MU0 } from '../../physics/fields';
import { ParticleState, borisStep, forceOnSegment, magneticForce, solenoidB, wireB } from '../../physics/magnetic';

// Units in this lab: charge in µC, mass in mg, speed in m/s, B in tesla, E in V/m.
// Then q/m is in C/kg, forces come out in µN and energies in µJ with no extra factors.
// Wire currents are in mega-amps and solenoid currents in kilo-amps so that paths curve on a metre scale.

export type MagScenario = 'uniform' | 'selector' | 'wire' | 'solenoid' | 'loop';
export type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export const AXIS: Record<Axis, V3> = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1],
};
export const AXIS_NAME: Record<Axis, string> = {
  '+x': 'right (+x)', '-x': 'left (−x)', '+y': 'up (+y)', '-y': 'down (−y)',
  '+z': 'out of the board (+z)', '-z': 'into the board (−z)',
};

/** Plain-language name for a direction, in the "board" language the problems use. */
export function dirName(v: readonly number[]): string {
  const l = len(v);
  if (l < 1e-9) return 'zero';
  const n = [v[0] / l, v[1] / l, (v[2] ?? 0) / l];
  for (const k of Object.keys(AXIS) as Axis[]) {
    if (dot(n, AXIS[k]) > 0.985) return AXIS_NAME[k];
  }
  const f = (x: number) => (Math.abs(x) < 0.005 ? '0' : x.toFixed(2).replace('-', '−'));
  return `(${f(n[0])}, ${f(n[1])}, ${f(n[2])})`;
}

export function gridXY(r: Renderer, half = 8, step = 1, z = 0, color: RGBA = C.grid) {
  for (let i = -half; i <= half; i += step) {
    const c = i === 0 ? C.gridStrong : color;
    r.seg([i, -half, z], [i, half, z], c, 1, 0, 0);
    r.seg([-half, i, z], [half, i, z], c, 1, 0, 0);
  }
}

const SOL_HALF = 6;

export class MagForceLab extends Lab3D {
  scenario: MagScenario = 'uniform';
  /** µC */
  q = 1;
  /** mg */
  m = 1;
  /** launch speed, m/s */
  v0 = 2;
  dir: V3 = [1, 0, 0];
  start: V3 = [0, 2, 0];
  /** uniform field magnitude (T) and direction */
  B = 1;
  bAxis: Axis = '+z';
  /** velocity selector: E magnitude (V/m), pointing along -y when positive */
  E = 2;
  /** wire current in MA, positive along +x */
  wireI = 5;
  /** solenoid: turns per metre, current in kA (positive gives B along +z), radius */
  solN = 1000;
  solI = 0.8;
  solR = 2.5;
  solInside = true;
  /** current loop: amps, sense seen from +z, side length */
  loopI = 2;
  loopCW = true;
  loopSide = 3;

  running = false;
  elapsed = 0;
  state: ParticleState = { x: [0, 2, 0], v: [2, 0, 0] };
  workB = 0;
  workE = 0;
  showPlane = true;
  showField = true;

  private trail: number[] = [];
  private loopPhase = 0;
  private cyl!: Mesh;
  private tube!: Mesh;
  private plane!: Mesh;

  constructor() {
    super();
    this.setScenario('uniform');
    this.view3D();
  }

  protected init() {
    const gl = this.r.gl;
    this.cyl = new Mesh(gl, cylinderGeo(24, true));
    this.tube = new Mesh(gl, cylinderGeo(56, false));
    this.plane = new Mesh(gl, planeGeo());
  }

  dispose() {
    this.cyl?.dispose();
    this.tube?.dispose();
    this.plane?.dispose();
  }

  // ---------- set-up ----------

  view3D() {
    this.camera.yaw = 0.55;
    this.camera.pitch = 0.38;
  }

  boardView() {
    this.camera.yaw = 0;
    this.camera.pitch = 0;
  }

  setScenario(s: MagScenario) {
    this.scenario = s;
    this.camera.target = [0, 0, 0];
    this.camera.distance = 17;
    this.q = 1;
    this.m = 1;
    this.v0 = 2;
    this.dir = [1, 0, 0];
    switch (s) {
      case 'uniform':
        this.B = 1;
        this.bAxis = '+z';
        this.start = [0, 2, 0];
        break;
      case 'selector':
        this.B = 1;
        this.bAxis = '-z';
        this.E = 2;
        this.start = [-6, 0, 0];
        break;
      case 'wire':
        this.wireI = 5;
        this.start = [-4, 2, 0];
        break;
      case 'solenoid':
        this.solI = 0.8;
        this.solN = 1000;
        this.solInside = true;
        this.v0 = 1;
        this.start = [0, 1, 0];
        break;
      case 'loop':
        this.B = 0.5;
        this.bAxis = '+z';
        this.loopCW = true;
        this.camera.distance = 13;
        break;
    }
    this.reset();
  }

  preset(name: string) {
    switch (name) {
      case 'p28':
        this.setScenario('wire');
        this.start = [0, 2, 0];
        this.dir = [0, 0, -1];
        break;
      case 'p29':
        this.setScenario('wire');
        this.wireI = -5;
        this.q = -1;
        this.start = [-3, -2, 0];
        this.dir = [1, 0, 0];
        this.boardView();
        break;
      case 'p30':
        this.setScenario('uniform');
        break;
      case 'p31':
        this.setScenario('uniform');
        this.start = [0, 0, -4];
        this.dir = [0, 0, 1];
        break;
      case 'p32':
        this.setScenario('loop');
        this.boardView();
        break;
      case 'p33':
        this.setScenario('solenoid');
        this.start = [0, 1, -4];
        this.dir = [0, 0, 1];
        break;
      case 'helix':
        this.setScenario('uniform');
        this.dir = norm([1, 0, 0.45]);
        this.start = [0, 2, -4];
        break;
      case 'selector':
        this.setScenario('selector');
        break;
      default:
        if ((['uniform', 'selector', 'wire', 'solenoid', 'loop'] as string[]).includes(name)) this.setScenario(name as MagScenario);
        return;
    }
    this.reset();
  }

  setSolInside(inside: boolean) {
    this.solInside = inside;
    this.start = inside ? [0, 1, 0] : [4.2, 0, 0];
    this.reset();
  }

  reset() {
    this.running = false;
    this.elapsed = 0;
    this.state = { x: [...this.start] as V3, v: scale(this.dir, this.v0) };
    this.trail = [];
    this.workB = 0;
    this.workE = 0;
  }

  get ready() {
    return this.elapsed === 0 && !this.running;
  }

  toggleRun() {
    if (this.ready) this.state = { x: [...this.start] as V3, v: scale(this.dir, this.v0) };
    this.running = !this.running;
  }

  setSpeed(v: number) {
    const cur = len(this.state.v);
    this.v0 = v;
    if (this.ready || cur < 1e-9) this.state.v = scale(this.dir, v);
    else this.state.v = scale(this.state.v, v / cur);
  }

  setDir(d: readonly number[]) {
    this.dir = norm(d);
    if (this.ready) this.state.v = scale(this.dir, this.v0);
  }

  // ---------- physics ----------

  get bVec(): V3 {
    return scale(AXIS[this.bAxis], this.B);
  }

  get solB(): number {
    return MU0 * this.solN * this.solI * 1e3;
  }

  fieldAt(p: readonly number[]): { E: V3; B: V3 } {
    switch (this.scenario) {
      case 'selector':
        return { E: [0, -this.E, 0], B: this.bVec };
      case 'wire':
        return { E: [0, 0, 0], B: wireB(this.wireI * 1e6, [0, 0, 0], [1, 0, 0], p, 0.12) };
      case 'solenoid':
        return { E: [0, 0, 0], B: solenoidB(this.solN, this.solI * 1e3, [0, 0, 0], [0, 0, 1], this.solR, p) };
      default:
        return { E: [0, 0, 0], B: this.bVec };
    }
  }

  /** Everything the panel shows about the particle right now. */
  info() {
    const { x, v } = this.state;
    const f = this.fieldAt(x);
    const Bm = len(f.B);
    const speed = len(v);
    const FB = magneticForce(this.q, v, f.B);
    const FE = scale(f.E, this.q);
    const F = add(FB, FE);
    const bHat = Bm > 1e-12 ? scale(f.B, 1 / Bm) : ([0, 0, 0] as V3);
    const vPar = dot(v, bHat);
    const vPerp = Math.sqrt(Math.max(0, speed * speed - vPar * vPar));
    const sin = speed > 1e-12 && Bm > 1e-12 ? vPerp / speed : 0;
    return {
      B: f.B, E: f.E, Bm, speed, FB, FE, F, Fm: len(F), FBm: len(FB),
      vPar, vPerp, sin,
      angle: (Math.asin(clamp(sin, 0, 1)) * 180) / Math.PI,
      radius: Bm > 1e-12 && vPerp > 1e-9 ? (this.m * vPerp) / (Math.abs(this.q) * Bm) : Infinity,
      period: Bm > 1e-12 ? (2 * Math.PI * this.m) / (Math.abs(this.q) * Bm) : Infinity,
      kinetic: 0.5 * this.m * speed * speed,
      zeroForce: len(F) < 1e-6 * Math.max(1e-9, Math.abs(this.q) * (speed * Bm + len(f.E))) || (Bm < 1e-12 && len(f.E) < 1e-12),
      vxB: cross(v, f.B),
    };
  }

  /** Square loop corners in the order the current flows. */
  loopCorners(): V3[] {
    const h = this.loopSide / 2;
    const cw: V3[] = [[-h, h, 0], [h, h, 0], [h, -h, 0], [-h, -h, 0]];
    return this.loopCW ? cw : cw.slice().reverse();
  }

  loopInfo() {
    const c = this.loopCorners();
    const B = this.bVec;
    const sides = c.map((a, i) => {
      const b = c[(i + 1) % 4];
      const mid = scale(add(a, b), 0.5);
      // name by where the side is
      const name = Math.abs(mid[1]) > Math.abs(mid[0]) ? (mid[1] > 0 ? 'top' : 'bottom') : mid[0] > 0 ? 'right' : 'left';
      return { a, b, mid, name, F: forceOnSegment(this.loopI, a, b, B) };
    });
    const net: V3 = [0, 0, 0];
    let torque: V3 = [0, 0, 0];
    for (const s of sides) {
      net[0] += s.F[0]; net[1] += s.F[1]; net[2] += s.F[2];
      torque = add(torque, cross(s.mid, s.F));
    }
    return { sides, net, torque };
  }

  protected update(dt: number) {
    this.loopPhase = (this.loopPhase + dt * 0.22 * Math.sign(this.loopI || 1)) % 1;
    if (!this.running || this.scenario === 'loop' || dt <= 0) return;
    const s = this.state;
    const f0 = this.fieldAt(s.x);
    const omega = (Math.abs(this.q) * len(f0.B)) / this.m;
    const n = clamp(Math.ceil((dt * Math.max(omega, 2)) / 0.03), 2, 800);
    const h = dt / n;
    const qm = this.q / this.m;
    let lastX = this.trail.length >= 3 ? (this.trail.slice(-3) as V3) : null;
    if (!lastX) {
      this.trail.push(s.x[0], s.x[1], s.x[2]);
      lastX = [...s.x] as V3;
    }
    for (let i = 0; i < n; i++) {
      const f = this.fieldAt(s.x);
      this.workB += dot(magneticForce(this.q, s.v, f.B), s.v) * h;
      const before = s.x;
      borisStep(s, qm, f.E, f.B, h);
      this.workE += this.q * dot(f.E, sub(s.x, before));
      if (len(sub(s.x, lastX)) > 0.04) {
        this.trail.push(s.x[0], s.x[1], s.x[2]);
        lastX = [...s.x] as V3;
      }
    }
    if (this.trail.length > 3 * 7000) this.trail.splice(0, this.trail.length - 3 * 7000);
    this.elapsed += dt;
    if (len(s.x) > 45) this.running = false;
    // a real particle cannot fly through the wire: stop it there
    if (this.scenario === 'wire' && Math.hypot(s.x[1], s.x[2]) < 0.13) this.running = false;
  }

  // ---------- interaction ----------

  private arrowLen() {
    return 1.7;
  }

  handles(): Handle[] {
    if (this.scenario === 'loop' || !this.ready) return [];
    const L = this.arrowLen();
    return [
      {
        id: 'dir',
        get: () => addScaled(this.start, this.dir, L),
        set: (p) => {
          const d = sub(p, this.start);
          if (len(d) > 0.08) this.setDir(d);
        },
        radius: 18,
      },
      {
        id: 'start',
        get: () => this.start,
        set: (p) => {
          this.start = [clamp(p[0], -8, 8), clamp(p[1], -8, 8), clamp(p[2], -8, 8)];
          this.state.x = [...this.start] as V3;
        },
        radius: 16,
      },
    ];
  }

  // ---------- drawing ----------

  private drawUniformB(Bv: V3, spacing = 2.6, n = 2, halfLen = 6) {
    const r = this.r;
    const Bm = len(Bv);
    if (Bm < 1e-9) return;
    const b = scale(Bv, 1 / Bm);
    const facing = dot(b, this.camera.forward);
    const u = Math.abs(b[2]) > 0.9 ? ([1, 0, 0] as V3) : perp(b);
    const v = cross(b, u);
    const col = alpha(C.B, 0.34);
    const head = Math.abs(facing) > 0.94;
    if (head) n = Math.max(n, 2);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const c = add(scale(u, i * spacing), scale(v, j * spacing));
        if (head) {
          intoOut(r, c, facing < 0, alpha(C.B, 0.75), 7);
        } else {
          r.seg(addScaled(c, b, -halfLen), addScaled(c, b, halfLen), col, 1.3, 0, 0);
          for (const k of [-halfLen * 0.55, 0, halfLen * 0.55]) {
            r.head(addScaled(c, b, k + 0.22), addScaled(c, b, k - 0.22), alpha(C.B, 0.6), 9);
          }
        }
      }
    }
  }

  private drawWire() {
    const r = this.r;
    const sgn = Math.sign(this.wireI);
    r.mesh(this.cyl, alignY([-10, 0, 0], [1, 0, 0], 0.09, 20), [0.78, 0.74, 0.6, 1]);
    if (sgn !== 0) {
      for (const x of [-6, -2, 2, 6]) r.head([x + sgn * 0.45, 0, 0], [x - sgn * 0.45, 0, 0], C.I, 16);
      r.label([sgn * 7.6, 0.45, 0], 'I', { color: css(C.I), tex: true, size: 15 });
      if (!this.showField) return;
      for (const x0 of [-5, 0, 5]) {
        for (const rad of [1, 2, 3.2]) {
          const col = alpha(C.B, 0.55 / Math.sqrt(rad));
          r.polyline(circlePoints([x0, 0, 0], rad, [1, 0, 0], 64), col, 1.4);
          for (let k = 0; k < 4; k++) {
            const th = (k / 4) * Math.PI * 2 + 0.4;
            const p: V3 = [x0, rad * Math.cos(th), rad * Math.sin(th)];
            const t: V3 = [0, -Math.sin(th) * sgn, Math.cos(th) * sgn];
            r.head(addScaled(p, t, 0.2), addScaled(p, t, -0.2), alpha(C.B, 0.8), 9);
          }
        }
      }
    }
  }

  private drawSolenoid() {
    const r = this.r;
    const R = this.solR;
    const sgn = Math.sign(this.solI);
    for (let z = -SOL_HALF; z <= SOL_HALF + 1e-6; z += 0.75) {
      r.polyline(circlePoints([0, 0, z], R, [0, 0, 1], 56), alpha(C.I, 0.55), 1.5);
      if (sgn !== 0 && Math.abs(z % 3) < 1e-6) {
        for (let k = 0; k < 3; k++) {
          const th = (k / 3) * Math.PI * 2 + 0.6;
          const p: V3 = [R * Math.cos(th), R * Math.sin(th), z];
          const t: V3 = [-Math.sin(th) * sgn, Math.cos(th) * sgn, 0];
          r.head(addScaled(p, t, 0.22), addScaled(p, t, -0.22), C.I, 11);
        }
      }
    }
    if (this.showField && sgn !== 0) {
      const b: V3 = [0, 0, sgn];
      const facing = dot(b, this.camera.forward);
      const s = R * 0.5;
      for (const c of [[0, 0], [s, s], [-s, s], [s, -s], [-s, -s]] as const) {
        const o: V3 = [c[0], c[1], 0];
        if (Math.abs(facing) > 0.94) intoOut(r, o, facing < 0, alpha(C.B, 0.75), 7);
        else {
          r.seg(addScaled(o, b, -SOL_HALF), addScaled(o, b, SOL_HALF), alpha(C.B, 0.34), 1.3, 0, 0);
          for (const k of [-3.5, 0, 3.5]) r.head(addScaled(o, b, k + 0.22), addScaled(o, b, k - 0.22), alpha(C.B, 0.6), 9);
        }
      }
    }
    r.layer(50);
    r.mesh(this.tube, alignY([0, 0, -SOL_HALF], [0, 0, 1], R, SOL_HALF * 2), alpha(C.I, 0.07), { rim: 2.2 });
    r.layer(0);
    r.label([R * 0.75, R * 0.75 + 0.5, SOL_HALF], 'B = 0 outside', { color: css(C.dim), size: 12 });
  }

  private drawLoop() {
    const r = this.r;
    const info = this.loopInfo();
    const fMax = Math.max(1e-9, Math.abs(this.loopI) * this.loopSide * Math.abs(this.B));
    r.layer(4);
    const wire: RGBA = [0.86, 0.8, 0.55, 1];
    for (const s of info.sides) {
      r.seg(s.a, s.b, wire, 5);
      if (this.loopI !== 0) r.head(addScaled(s.mid, sub(s.b, s.a), 0.1), s.a, C.I, 15);
    }
    // moving current dots
    if (this.loopI !== 0) {
      const per = 4 * this.loopSide;
      for (let k = 0; k < 16; k++) {
        const d = (((k / 16 + Math.abs(this.loopPhase)) % 1) * per);
        const side = Math.min(3, Math.floor(d / this.loopSide));
        const t = d / this.loopSide - side;
        const s = info.sides[side];
        r.disc(addScaled(s.a, sub(s.b, s.a), t), 4, C.I);
      }
    }
    r.layer(6);
    for (const s of info.sides) {
      const fm = len(s.F);
      if (fm < 1e-9 * fMax) continue;
      const tip = addScaled(s.mid, s.F, 0.95 / fMax);
      r.arrow(s.mid, tip, C.F, 4);
      const beside = norm(cross(s.F, this.camera.forward));
      r.label(addScaled(scale(add(s.mid, tip), 0.5), beside, 0.5), `\\vec F_{\\text{${s.name}}}`, { tex: true, color: css(C.F), size: 13 });
    }
    r.label([0, -this.loopSide / 2 - 0.55, 0], this.loopCW ? 'I flows clockwise' : 'I flows counter-clockwise', { color: css(C.I), size: 12 });
  }

  protected draw() {
    const r = this.r;
    const sc = this.scenario;
    gridXY(r, 8, 1, 0);
    axes3D(r, 1.3, [-7.6, -7.6, 0]);

    if (sc === 'wire') this.drawWire();
    else if (sc === 'solenoid') this.drawSolenoid();
    else if (this.showField) this.drawUniformB(this.bVec, sc === 'loop' ? 1.5 : 2.8, sc === 'loop' ? 2 : 1);

    if (sc === 'selector' && this.showField && Math.abs(this.E) > 1e-9) {
      const e: V3 = [0, -Math.sign(this.E), 0];
      for (let x = -6; x <= 6; x += 2) {
        for (const y of [-2.2, 2.2]) {
          const o: V3 = [x, y - e[1] * 0.7, 0];
          r.arrow(o, addScaled(o, e, 1.4), alpha(C.E, 0.55), 1.8, 9);
        }
      }
      r.label([-7, 2.9, 0], '\\vec E', { tex: true, color: css(C.E), size: 15 });
    }

    if (sc === 'loop') {
      this.drawLoop();
      return;
    }

    // particle
    const p = this.state.x;
    const info = this.info();
    r.layer(3);
    if (this.trail.length >= 6) r.polyline(new Float32Array(this.trail), [0.45, 0.8, 0.4, 1], 2);

    r.layer(5);
    const col = this.q >= 0 ? C.pos : C.neg;
    const L = this.arrowLen();
    const vHat = info.speed > 1e-9 ? scale(this.state.v, 1 / info.speed) : this.dir;
    const vTip = addScaled(p, vHat, L * clamp(info.speed / Math.max(this.v0, 0.5), 0.45, 1.6));
    const lab = (tip: V3, text: string, c: RGBA) => {
      const d = norm(sub(tip, p));
      r.label(addScaled(tip, d, 0.35), text, { tex: true, color: css(c), size: 15 });
    };
    if (info.speed > 1e-9 || this.ready) {
      r.arrow(p, vTip, C.v, 3.5);
      lab(vTip, '\\vec v', C.v);
    }
    let bTip: V3 | null = null;
    if (info.Bm > 1e-9) {
      bTip = addScaled(p, info.B, (1.5 * clamp(info.Bm, 0.4, 1.3)) / info.Bm);
      r.arrow(p, bTip, C.B, 3.5);
      lab(bTip, '\\vec B', C.B);
    }
    const fRef = Math.abs(this.q) * (info.speed * info.Bm + len(info.E));
    if (info.Fm > 1e-6 * Math.max(fRef, 1e-9)) {
      const fTip = addScaled(p, info.F, (L * clamp(info.Fm / fRef, 0.12, 1.3)) / info.Fm);
      r.arrow(p, fTip, C.F, 4);
      lab(fTip, '\\vec F', C.F);
    } else if (sc !== 'selector' || Math.abs(this.E) < 1e-9) {
      r.label(p, info.Bm < 1e-9 ? 'B = 0 here, so F = 0' : 'v ∥ B, so F = 0', { color: css(C.good), size: 13, dy: -34, bg: true });
    } else {
      r.label(p, 'qE cancels qv×B: straight line', { color: css(C.good), size: 13, dy: -34, bg: true });
    }
    if (sc === 'selector' && Math.abs(this.E) > 1e-9 && info.speed > 1e-9) {
      // show the two competing forces separately
      const fb = info.FB, fe = info.FE;
      const ref = Math.max(len(fb), len(fe), 1e-9);
      if (len(fb) > 1e-9) r.arrow(p, addScaled(p, fb, 1.3 / ref), alpha(C.B, 0.9), 2);
      if (len(fe) > 1e-9) r.arrow(p, addScaled(p, fe, 1.3 / ref), alpha(C.E, 0.9), 2);
    }

    r.disc(p, 0.42, alpha(col, 0.28), { world: true, style: 'glow' });
    r.disc(p, 0.17, col, { world: true, style: 'sphere' });
    r.label(p, this.q >= 0 ? '+' : '−', { color: '#fff', size: 13, bold: true });

    if (this.ready) {
      r.layer(100);
      r.disc(addScaled(this.start, this.dir, L), 9, alpha(C.v, 0.9), { style: 'ring', ring: 1.6 });
    }

    // the plane containing v and B: F is perpendicular to it
    if (this.showPlane && bTip && info.sin > 0.05 && info.speed > 1e-9) {
      const a = sub(vTip, p), b = sub(bTip, p);
      const n = norm(cross(a, b));
      r.layer(50);
      r.mesh(this.plane, basis(scale(a, 0.5), n, scale(b, 0.5), add(p, scale(add(a, b), 0.5))), alpha(C.F, 0.13), { unlit: true });
      r.layer(0);
    }
  }
}

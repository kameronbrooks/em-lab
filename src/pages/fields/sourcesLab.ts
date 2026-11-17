import { C, RGBA, alpha, css } from '../../engine/colors';
import { axes3D, circlePoints, intoOut } from '../../engine/draw';
import { Handle, Lab3D } from '../../engine/lab';
import { V3, add, addScaled, alignY, basis, clamp, dot, fmt, len, mul, norm, scale, scaling, sub, translation } from '../../engine/math';
import { Mesh, boxGeo, cylinderGeo, discGeo, sphereGeo } from '../../engine/mesh';
import { MU0 } from '../../physics/fields';
import {
  biotSavartPieces, circlePath, fluxThroughDisc, forcePerLength, lineIntegral, rectPath, solenoidB, wireB,
} from '../../physics/magnetic';
import { gridXY } from './magForceLab';

// Real SI units here: currents in amps, distances in metres. Fields are shown in microtesla.

export type SourceScenario = 'wire' | 'two' | 'sheet' | 'solenoid';
export type LoopShape = 'circle' | 'rect';
export type FluxShape = 'none' | 'coil' | 'sphere' | 'cube';

const CORE = 0.14;
const WIRE_HALF = 5;

export class SourcesLab extends Lab3D {
  scenario: SourceScenario = 'wire';
  /** Wire current (A), positive is out of the board (+z). */
  I = 10;
  I2 = 10;
  /** Separation of the two wires (m). */
  sep = 3;
  /** Sheet current per unit width (A/m), positive is out of the board. */
  K = 100;
  /** Solenoid: turns per metre, current (A), radius (m). Axis along x. */
  solN = 200;
  solI = 5;
  solR = 2;
  /** Alternating current I = A cos(wt). */
  ac = false;
  omega = 1.5;

  loopOn = true;
  loopShape: LoopShape = 'circle';
  loop = { x: 0, y: 0, r: 2, w: 4, h: 3 };

  showArrows = true;
  showProbe = true;
  probe = { x: 2.5, y: 1.5 };

  /** Biot-Savart view (single wire only). */
  showBS = false;
  bsN = 10;
  bsHalf = 3;

  fluxShape: FluxShape = 'none';
  flux = { x: 0, y: 0, z: 0, size: 1, tilt: 0 };

  private cyl!: Mesh;
  private tube!: Mesh;
  private sphere!: Mesh;
  private box!: Mesh;
  private disc!: Mesh;
  private plane!: Mesh;

  constructor() {
    super();
    this.camera.distance = 19;
    this.view3D();
  }

  protected init() {
    const gl = this.r.gl;
    this.cyl = new Mesh(gl, cylinderGeo(24, true));
    this.tube = new Mesh(gl, cylinderGeo(56, false));
    this.sphere = new Mesh(gl, sphereGeo());
    this.box = new Mesh(gl, boxGeo());
    this.disc = new Mesh(gl, discGeo(56));
    this.plane = new Mesh(gl, boxGeo());
  }

  dispose() {
    for (const m of [this.cyl, this.tube, this.sphere, this.box, this.disc, this.plane]) m?.dispose();
  }

  view3D() {
    this.camera.yaw = 0.42;
    this.camera.pitch = 0.36;
  }

  boardView() {
    this.camera.yaw = 0;
    this.camera.pitch = 0;
  }

  setScenario(s: SourceScenario) {
    this.scenario = s;
    this.showBS = false;
    this.loopOn = true;
    this.fluxShape = 'none';
    this.flux = { x: 0, y: 0, z: 0, size: 1, tilt: 0 };
    switch (s) {
      case 'wire':
        this.loopShape = 'circle';
        this.loop = { x: 0, y: 0, r: 2, w: 4, h: 3 };
        this.probe = { x: 2.5, y: 1.5 };
        break;
      case 'two':
        this.loopShape = 'circle';
        this.loop = { x: -1.5, y: 0, r: 1, w: 5, h: 3 };
        this.probe = { x: 0, y: 2 };
        break;
      case 'sheet':
        this.loopShape = 'rect';
        this.loop = { x: 0, y: 0, r: 2, w: 4, h: 2.5 };
        this.probe = { x: 3, y: 2.5 };
        break;
      case 'solenoid':
        this.loopShape = 'rect';
        this.loop = { x: 0, y: 2, r: 1.5, w: 4, h: 2 };
        this.probe = { x: -3, y: 0.5 };
        break;
    }
  }

  preset(name: string) {
    switch (name) {
      case 'p27':
        this.setScenario('wire');
        this.ac = true;
        break;
      case 'p34':
        this.setScenario('solenoid');
        this.fluxShape = 'sphere';
        this.loopOn = false;
        break;
      case 'p35':
        this.setScenario('solenoid');
        this.fluxShape = 'coil';
        this.loopOn = false;
        break;
      case 'p26':
        this.setScenario('sheet');
        this.fluxShape = 'cube';
        this.flux = { x: 0, y: 2.2, z: 0, size: 1, tilt: 0 };
        this.loopOn = false;
        break;
      case 'biot':
        this.setScenario('wire');
        this.showBS = true;
        this.loopOn = false;
        break;
      default:
        if ((['wire', 'two', 'sheet', 'solenoid'] as string[]).includes(name)) this.setScenario(name as SourceScenario);
    }
  }

  // ---------- physics ----------

  /** Time factor for alternating current. */
  get phase() {
    return this.ac ? Math.cos(this.omega * this.time) : 1;
  }

  /** Wires through the board: position and present current. */
  wires(): { x: number; y: number; I: number; amp: number }[] {
    const f = this.phase;
    if (this.scenario === 'wire') return [{ x: 0, y: 0, I: this.I * f, amp: this.I }];
    if (this.scenario === 'two') {
      return [
        { x: -this.sep / 2, y: 0, I: this.I * f, amp: this.I },
        { x: this.sep / 2, y: 0, I: this.I2 * f, amp: this.I2 },
      ];
    }
    return [];
  }

  /** Flat layers of current crossing the board along y = y0, with current per metre K (+ is out of the board). */
  sheets(): { y: number; K: number }[] {
    const f = this.phase;
    if (this.scenario === 'sheet') return [{ y: 0, K: this.K * f }];
    if (this.scenario === 'solenoid') {
      const k = this.solN * this.solI * f;
      return [{ y: this.solR, K: k }, { y: -this.solR, K: -k }];
    }
    return [];
  }

  field = (p: readonly number[]): V3 => {
    const b: V3 = [0, 0, 0];
    for (const w of this.wires()) {
      const f = wireB(w.I, [w.x, w.y, 0], [0, 0, 1], p, CORE);
      b[0] += f[0]; b[1] += f[1]; b[2] += f[2];
    }
    if (this.scenario === 'sheet') {
      const s = Math.sign(p[1]);
      // K along +z, normal +y: B = (mu0 K / 2) (z x n) = -x above, +x below
      b[0] += (-s * MU0 * this.K * this.phase) / 2;
    } else if (this.scenario === 'solenoid') {
      const f = solenoidB(this.solN, this.solI * this.phase, [0, 0, 0], [1, 0, 0], this.solR, p);
      b[0] += f[0]; b[1] += f[1]; b[2] += f[2];
    }
    return b;
  };

  /** A typical field strength for scaling the arrows (uses the amplitude, so AC arrows visibly shrink and flip). */
  get bRef(): number {
    switch (this.scenario) {
      case 'wire': return (MU0 * Math.max(0.1, Math.abs(this.I))) / (2 * Math.PI);
      case 'two': return (MU0 * Math.max(0.1, Math.abs(this.I), Math.abs(this.I2))) / (2 * Math.PI);
      case 'sheet': return (MU0 * Math.max(1, Math.abs(this.K))) / 2;
      case 'solenoid': return MU0 * Math.max(1, Math.abs(this.solN * this.solI));
    }
  }

  loopPath(n = 360): V3[] {
    const l = this.loop;
    return this.loopShape === 'circle'
      ? circlePath([l.x, l.y, 0], l.r, [0, 0, 1], n)
      : rectPath([l.x, l.y, 0], [1, 0, 0], [0, 1, 0], l.w, l.h, Math.round(n / 4));
  }

  /** Current passing through the Ampere loop (A), counted positive out of the board. */
  enclosed(): number {
    const l = this.loop;
    let sum = 0;
    for (const w of this.wires()) {
      const inside = this.loopShape === 'circle'
        ? Math.hypot(w.x - l.x, w.y - l.y) < l.r
        : Math.abs(w.x - l.x) < l.w / 2 && Math.abs(w.y - l.y) < l.h / 2;
      if (inside) sum += w.I;
    }
    for (const s of this.sheets()) {
      const dy = s.y - l.y;
      let chord = 0;
      if (this.loopShape === 'circle') chord = Math.abs(dy) < l.r ? 2 * Math.sqrt(l.r * l.r - dy * dy) : 0;
      else chord = Math.abs(dy) < l.h / 2 ? l.w : 0;
      sum += s.K * chord;
    }
    return sum;
  }

  ampere() {
    const circulation = lineIntegral(this.loopPath(720), this.field);
    const iEnc = this.enclosed();
    return { circulation, iEnc, mu0I: MU0 * iEnc };
  }

  probeInfo() {
    const b = this.field([this.probe.x, this.probe.y, 0]);
    const w = this.wires();
    let r = NaN;
    if (w.length === 1) r = Math.hypot(this.probe.x - w[0].x, this.probe.y - w[0].y);
    return { b, mag: len(b), r };
  }

  biot() {
    const P: V3 = [this.probe.x, this.probe.y, 0];
    const I = this.I * this.phase;
    const sum = biotSavartPieces(I, [0, 0, -this.bsHalf], [0, 0, this.bsHalf], Math.round(this.bsN), P);
    const r = Math.max(1e-6, Math.hypot(P[0], P[1]));
    const infinite = (MU0 * I) / (2 * Math.PI * r);
    return { ...sum, mag: len(sum.total), infinite, r, P };
  }

  twoWire() {
    const f = forcePerLength(this.I * this.phase, this.I2 * this.phase, this.sep);
    return { perLength: f, attract: f > 0 };
  }

  fluxNormal(): V3 {
    const t = (this.flux.tilt * Math.PI) / 180;
    return [Math.cos(t), Math.sin(t), 0];
  }

  /** Flux through the probe surface. Closed surfaces also report how much goes in and how much comes out. */
  fluxInfo(): { net: number; out: number; in: number; closed: boolean } {
    const f = this.flux;
    const c: V3 = [f.x, f.y, f.z];
    if (this.fluxShape === 'coil') {
      const net = fluxThroughDisc(c, this.fluxNormal(), f.size, this.field, 14, 40);
      return { net, out: Math.max(net, 0), in: Math.min(net, 0), closed: false };
    }
    let out = 0, inn = 0;
    const acc = (p: V3, n: V3, dA: number) => {
      const v = dot(this.field(p), n) * dA;
      if (v > 0) out += v;
      else inn += v;
    };
    if (this.fluxShape === 'sphere') {
      const nt = 20, np = 40;
      for (let i = 0; i < nt; i++) {
        const th = ((i + 0.5) / nt) * Math.PI;
        const dA = f.size * f.size * Math.sin(th) * (Math.PI / nt) * ((2 * Math.PI) / np);
        for (let j = 0; j < np; j++) {
          const ph = ((j + 0.5) / np) * 2 * Math.PI;
          const n: V3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
          acc(addScaled(c, n, f.size), n, dA);
        }
      }
    } else if (this.fluxShape === 'cube') {
      const n = 12;
      const dA = Math.pow((2 * f.size) / n, 2);
      for (let axis = 0; axis < 3; axis++) {
        for (const sgn of [-1, 1]) {
          const nv: V3 = [0, 0, 0];
          nv[axis] = sgn;
          const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              const p: V3 = [c[0], c[1], c[2]];
              p[axis] += sgn * f.size;
              p[a1] += (((i + 0.5) / n) * 2 - 1) * f.size;
              p[a2] += (((j + 0.5) / n) * 2 - 1) * f.size;
              acc(p, nv, dA);
            }
          }
        }
      }
    }
    return { net: out + inn, out, in: inn, closed: true };
  }

  // ---------- interaction ----------

  handles(): Handle[] {
    const hs: Handle[] = [];
    const plane: V3 = [0, 0, 1];
    const l = this.loop;
    if (this.loopOn) {
      hs.push({
        id: 'loop',
        get: () => [l.x, l.y, 0],
        set: (p) => {
          l.x = clamp(p[0], -7, 7);
          l.y = clamp(p[1], -6, 6);
        },
        planeNormal: plane,
        radius: 16,
      });
      if (this.loopShape === 'circle') {
        hs.push({
          id: 'loop-size',
          get: () => [l.x + l.r * Math.SQRT1_2, l.y + l.r * Math.SQRT1_2, 0],
          set: (p) => {
            l.r = clamp(Math.hypot(p[0] - l.x, p[1] - l.y), 0.3, 6);
          },
          planeNormal: plane,
          radius: 14,
        });
      } else {
        hs.push({
          id: 'loop-size',
          get: () => [l.x + l.w / 2, l.y + l.h / 2, 0],
          set: (p) => {
            l.w = clamp(2 * (p[0] - l.x), 0.5, 12);
            l.h = clamp(2 * (p[1] - l.y), 0.5, 10);
          },
          planeNormal: plane,
          radius: 14,
        });
      }
    }
    if (this.showProbe || this.showBS) {
      hs.push({
        id: 'probe',
        get: () => [this.probe.x, this.probe.y, 0],
        set: (p) => {
          this.probe.x = clamp(p[0], -7.5, 7.5);
          this.probe.y = clamp(p[1], -6, 6);
        },
        planeNormal: plane,
        radius: 15,
      });
    }
    if (this.fluxShape !== 'none') {
      const f = this.flux;
      hs.push({
        id: 'flux',
        get: () => [f.x, f.y, f.z],
        set: (p) => {
          f.x = clamp(p[0], -7, 7);
          f.y = clamp(p[1], -6, 6);
        },
        planeNormal: plane,
        radius: 18,
      });
    }
    return hs;
  }

  // ---------- drawing ----------

  private drawSources() {
    const r = this.r;
    const half = this.showBS && this.scenario === 'wire' ? this.bsHalf : WIRE_HALF;
    for (const w of this.wires()) {
      r.layer(2);
      const pieces = this.showBS && this.scenario === 'wire';
      if (!pieces) r.mesh(this.cyl, alignY([w.x, w.y, -half], [0, 0, 1], 0.11, half * 2), [0.8, 0.75, 0.58, 1]);
      if (Math.abs(w.I) > 1e-9 && !pieces) {
        const s = Math.sign(w.I);
        for (const z of [-half * 0.5, half * 0.5]) r.head([w.x, w.y, z + s * 0.4], [w.x, w.y, z - s * 0.4], C.I, 15);
      }
      r.layer(100);
      if (Math.abs(w.I) > 1e-9) intoOut(r, [w.x, w.y, 0], w.I > 0, C.I, 10);
      r.label([w.x, w.y, 0], `${fmt(w.I, 3)} A ${Math.abs(w.I) < 1e-9 ? '' : w.I > 0 ? 'out' : 'in'}`, { color: css(C.I), size: 11.5, dy: 22 });
      r.layer(0);
    }
    if (this.scenario === 'sheet') {
      const k = this.K * this.phase;
      r.layer(50);
      r.mesh(this.plane, mul(translation([0, 0, 0]), scaling(8, 0.03, WIRE_HALF)), alpha(C.I, 0.2), { rim: 1 });
      r.layer(100);
      if (Math.abs(k) > 1e-9) for (let x = -7.5; x <= 7.5; x += 0.75) intoOut(r, [x, 0, 0], k > 0, C.I, 5.5);
      r.layer(0);
    }
    if (this.scenario === 'solenoid') {
      const R = this.solR;
      const k = this.solN * this.solI * this.phase;
      // the windings; seen face-on they would only be clutter, so fade them out in board view
      const side = 1 - Math.abs(this.camera.forward[2]);
      if (side > 0.02) {
        for (let x = -8; x <= 8.001; x += 0.5) {
          r.polyline(circlePoints([x, 0, 0], R, [1, 0, 0], 48), alpha(C.I, 0.38 * Math.min(1, side * 6)), 1.3);
        }
      }
      r.seg([-8, R, 0], [8, R, 0], alpha(C.I, 0.5), 1.5, 0, 0);
      r.seg([-8, -R, 0], [8, -R, 0], alpha(C.I, 0.5), 1.5, 0, 0);
      r.layer(100);
      if (Math.abs(k) > 1e-9) {
        for (let x = -7.75; x <= 7.75; x += 0.5) {
          intoOut(r, [x, R, 0], k > 0, C.I, 5);
          intoOut(r, [x, -R, 0], k < 0, C.I, 5);
        }
      }
      r.layer(50);
      r.mesh(this.tube, alignY([-8, 0, 0], [1, 0, 0], R, 16), alpha(C.I, 0.06), { rim: 2 });
      r.layer(0);
    }
  }

  private drawArrows() {
    const r = this.r;
    const ref = this.bRef;
    const wires = this.wires();
    for (let x = -7; x <= 7; x += 1) {
      for (let y = -5; y <= 5; y += 1) {
        const p: V3 = [x + 0.5 * (this.scenario === 'wire' || this.scenario === 'two' ? 1 : 0), y + 0.5, 0];
        if (p[0] > 7.2 || p[1] > 5.2) continue;
        let skip = false;
        for (const w of wires) if (Math.hypot(p[0] - w.x, p[1] - w.y) < 0.45) skip = true;
        if (skip) continue;
        const b = this.field(p);
        const m = len(b);
        if (m < 1e-4 * ref) continue;
        const t = clamp(Math.sqrt(m / ref), 0, 1);
        const L = 0.42 * (0.3 + 0.7 * t);
        const u = scale(b, 1 / m);
        r.arrow(addScaled(p, u, -L), addScaled(p, u, L), alpha(C.B, 0.28 + 0.72 * t), 1.7, 8);
      }
    }
    // field circles around a single wire
    if (this.scenario === 'wire' && Math.abs(this.I * this.phase) > 1e-9) {
      const fade = Math.abs(this.phase);
      for (const rad of [1, 2, 3, 4]) {
        r.polyline(circlePoints([0, 0, 0], rad, [0, 0, 1], 72), alpha(C.B, (0.42 / Math.sqrt(rad)) * fade), 1.2);
      }
    }
  }

  private drawLoop() {
    const r = this.r;
    const path = this.loopPath(180);
    const ref = this.bRef;
    r.layer(6);
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length];
      const mid = scale(add(a, b), 0.5);
      const t = norm(sub(b, a));
      const bt = dot(this.field(mid), t) / ref;
      const k = clamp(Math.sqrt(Math.abs(bt)), 0, 1);
      const col: RGBA = Math.abs(bt) < 1e-3 ? [0.55, 0.6, 0.7, 0.85] : bt > 0 ? alpha(C.B, 0.45 + 0.55 * k) : alpha(C.F, 0.45 + 0.55 * k);
      r.seg(a, b, col, 3.5);
    }
    // direction of travel round the loop (counter-clockwise)
    for (const f of [0.08, 0.33, 0.58, 0.83]) {
      const i = Math.floor(f * path.length);
      r.head(path[(i + 2) % path.length], path[i], C.white, 10);
    }
    r.layer(100);
    const l = this.loop;
    r.disc([l.x, l.y, 0], 5, C.white);
    const hp: V3 = this.loopShape === 'circle' ? [l.x + l.r * Math.SQRT1_2, l.y + l.r * Math.SQRT1_2, 0] : [l.x + l.w / 2, l.y + l.h / 2, 0];
    r.disc(hp, 6, C.white, { style: 'ring', ring: 2 });
    const a = this.ampere();
    const top: V3 = this.loopShape === 'circle' ? [l.x, l.y - l.r, 0] : [l.x, l.y - l.h / 2, 0];
    r.label(top, `∮B·dr = ${fmt(a.circulation * 1e6, 3)} µT·m`, { size: 12, dy: 16, bg: true, color: css(C.text) });
    r.layer(0);
  }

  private drawProbe() {
    const r = this.r;
    const P: V3 = [this.probe.x, this.probe.y, 0];
    const info = this.probeInfo();
    r.layer(100);
    if (info.mag > 1e-12 && !this.showBS) {
      const u = scale(info.b, 1 / info.mag);
      const L = 1.3 * clamp(Math.sqrt(info.mag / this.bRef), 0.35, 1.2);
      const tip = addScaled(P, u, L);
      r.arrow(P, tip, C.B, 3.5);
      r.label(addScaled(tip, u, 0.35), '\\vec B', { tex: true, color: css(C.B), size: 15 });
    }
    r.disc(P, 6.5, C.v, { style: 'sphere' });
    r.label(P, `P   |B| = ${fmt(info.mag * 1e6, 3)} µT`, { size: 11.5, dy: 18, color: css(C.v), bg: true });
    r.layer(0);
  }

  private drawBiot() {
    const r = this.r;
    const bs = this.biot();
    const n = bs.mids.length;
    const dz = (2 * this.bsHalf) / n;
    r.layer(4);
    bs.mids.forEach((m, i) => {
      const col: RGBA = i % 2 ? [1, 0.88, 0.4, 1] : [1, 0.62, 0.25, 1];
      r.seg([0, 0, m[2] - dz / 2 + 0.03], [0, 0, m[2] + dz / 2 - 0.03], col, 7, 0, 0);
      if (n <= 40) r.seg(m, bs.P, alpha(C.dim, 0.3), 1, 0, 0);
    });
    // stack the contributions tip to tail at P
    if (Math.abs(bs.infinite) > 1e-15) {
      const s = 2.6 / Math.abs(bs.infinite);
      let at: V3 = bs.P;
      r.layer(101);
      bs.dB.forEach((d, i) => {
        const next = addScaled(at, d, s);
        r.seg(at, next, i % 2 ? C.B : [0.75, 1, 0.95, 1], 5, 0, 0);
        at = next;
      });
      r.head(addScaled(at, norm(bs.total), 0.28), at, C.B, 13);
      const target = addScaled(bs.P, norm(bs.total), 2.6);
      r.disc(target, 7, C.white, { style: 'ring', ring: 1.6 });
      r.label(target, 'infinite wire', { size: 11, dy: -15, color: css(C.text) });
      r.layer(0);
    }
  }

  private drawFlux() {
    const r = this.r;
    const f = this.flux;
    const c: V3 = [f.x, f.y, f.z];
    const tint = alpha(C.surface, 0.24);
    r.layer(60);
    if (this.fluxShape === 'coil') {
      const n = this.fluxNormal();
      const u: V3 = [-n[1], n[0], 0];
      r.mesh(this.disc, basis(scale(u, f.size), n, [0, 0, f.size], c), tint, { unlit: true });
      r.layer(7);
      r.polyline(circlePoints(c, f.size, n, 64), [0.85, 0.9, 1, 1], 3);
      r.arrow(c, addScaled(c, n, 1.1), C.white, 2.2);
      r.label(addScaled(c, n, 1.4), '\\hat n', { tex: true, size: 14 });
    } else if (this.fluxShape === 'sphere') {
      r.mesh(this.sphere, mul(translation(c), scaling(f.size)), tint, { rim: 2.5 });
    } else if (this.fluxShape === 'cube') {
      r.mesh(this.box, mul(translation(c), scaling(f.size)), tint, { rim: 1.5 });
    }
    r.layer(100);
    r.disc(c, 5, C.surface);
    r.layer(0);
  }

  protected draw() {
    const r = this.r;
    gridXY(r, 8, 1, 0, alpha(C.grid, 0.8));
    axes3D(r, 1.2, [-7.6, -7.4, 0]);
    this.drawSources();
    if (this.showArrows) this.drawArrows();
    if (this.scenario === 'two') {
      // force on each wire, per metre of length
      const w = this.wires();
      const tw = this.twoWire();
      if (Math.abs(tw.perLength) > 1e-15) {
        const dir = tw.attract ? 1 : -1;
        r.layer(101);
        r.arrow([w[0].x, 0, 0], [w[0].x + dir * 1.1, 0, 0], C.F, 4);
        r.arrow([w[1].x, 0, 0], [w[1].x - dir * 1.1, 0, 0], C.F, 4);
        r.label([w[0].x + dir * 0.55, 0, 0], '\\vec F', { tex: true, color: css(C.F), size: 14, dy: -15 });
        r.layer(0);
      }
    }
    if (this.loopOn) this.drawLoop();
    if (this.showBS && this.scenario === 'wire') this.drawBiot();
    if (this.fluxShape !== 'none') this.drawFlux();
    if (this.showProbe || this.showBS) this.drawProbe();
  }
}

import { C, RGBA, alpha, css, mix } from '../../engine/colors';
import { grid2D, sign } from '../../engine/draw';
import { Program } from '../../engine/gl';
import { Handle, Lab2D } from '../../engine/lab';
import { fmt } from '../../engine/math';
import { FieldLine, PointCharge, eField, eFieldOf, potential, traceFieldLines } from '../../physics/fields';

export interface Charge extends PointCharge {
  id: number;
}

/** Full-screen potential map + equipotential lines for up to 32 point charges. */
export const MAP_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform vec3 uCharges[32];
uniform int uN;
uniform float uMap;
uniform float uEquip;
uniform float uV0;
uniform vec3 uBg;
out vec4 frag;
void main() {
  vec2 p = uCenter + vNdc * uHalf;
  float V = 0.0;
  for (int i = 0; i < 32; i++) {
    if (i >= uN) break;
    vec3 c = uCharges[i];
    V += 8.9875517923 * c.z / max(length(p - c.xy), 1e-4);
  }
  float t = V / (abs(V) + uV0);
  vec3 col = uBg;
  if (uMap > 0.5) {
    vec3 warm = vec3(1.0, 0.36, 0.36);
    vec3 cool = vec3(0.29, 0.66, 1.0);
    col = mix(uBg, t > 0.0 ? warm : cool, pow(abs(t), 0.85) * 0.6);
  }
  if (uEquip > 0.5) {
    float f = sign(V) * log(1.0 + abs(V) / uV0 * 4.0) * 2.4;
    float w = fwidth(f);
    float d = abs(fract(f - 0.5) - 0.5);
    float line = 1.0 - smoothstep(0.0, 1.5 * w, d);
    line *= 1.0 - smoothstep(0.22, 0.55, w);
    col = mix(col, vec3(0.74, 0.6, 1.0), line * 0.8);
  }
  frag = vec4(col, 1.0);
}`;

const FLOW_N = 1400;

export class ChargeLab extends Lab2D {
  charges: Charge[] = [];
  selected: Charge | null = null;
  private nextId = 1;

  showVectors = true;
  showLines = true;
  showPotential = false;
  showEquip = false;
  showFlow = false;
  showContrib = true;
  showProbe = true;

  /** Test charge: q in nC, m in micrograms. */
  test = { on: true, x: 0, y: 1.6, q: 1, m: 1, vx: 0, vy: 0, released: false };
  private trail: number[] = [];
  private testStart = { x: 0, y: 1.6 };

  private lines: FieldLine[] = [];
  private linesKey = '';
  private mapProg!: Program;
  private flow = new Float32Array(FLOW_N * 4);
  private chargeBuf = new Float32Array(32 * 3);

  constructor() {
    super();
    this.camera.zoom = 72;
    this.preset('dipole');
  }

  protected init() {
    this.mapProg = this.r.fullscreenProgram(MAP_FS);
    this.linesKey = '';
    for (let i = 0; i < FLOW_N; i++) this.flow[i * 4 + 3] = 0;
  }

  dispose() {
    this.mapProg?.dispose();
  }

  // ---------- scene editing ----------

  add(q: number, x?: number, y?: number): Charge {
    const c: Charge = {
      id: this.nextId++,
      q,
      x: x ?? this.camera.cx + (Math.random() - 0.5) * 1.5,
      y: y ?? this.camera.cy + (Math.random() - 0.5) * 1.5,
    };
    if (this.charges.length < 32) this.charges.push(c);
    this.selected = c;
    return c;
  }

  remove(c: Charge | null) {
    if (!c) return;
    this.charges = this.charges.filter((k) => k !== c);
    if (this.selected === c) this.selected = null;
  }

  clear() {
    this.charges = [];
    this.selected = null;
    this.resetTest();
  }

  preset(name: string) {
    this.charges = [];
    this.selected = null;
    const cam = this.camera;
    cam.cx = 0;
    cam.cy = 0;
    cam.zoom = 72;
    this.test.on = true;
    this.test.q = 1;
    let tx = 0, ty = 1.6;
    switch (name) {
      case 'single':
        this.add(2, 0, 0);
        tx = 1.5;
        ty = 1;
        break;
      case 'negative':
        this.add(-2, 0, 0);
        tx = 1.5;
        ty = 1;
        break;
      case 'like':
        this.add(2, -1.5, 0);
        this.add(2, 1.5, 0);
        break;
      case 'unequal':
        this.add(4, -1.5, 0);
        this.add(-1, 1.5, 0);
        tx = 0.5;
        ty = 1.4;
        break;
      case 'quad':
        this.add(2, -1.2, 1.2);
        this.add(-2, 1.2, 1.2);
        this.add(2, 1.2, -1.2);
        this.add(-2, -1.2, -1.2);
        tx = 0;
        ty = 0.5;
        break;
      case 'plates':
        for (let i = -4; i <= 4; i++) {
          this.add(0.6, -1.5, i * 0.45);
          this.add(-0.6, 1.5, i * 0.45);
        }
        tx = -0.6;
        ty = 0.4;
        break;
      case 'p1':
        // Problem 1: charge q at (-3, 8); the test particle carries -q.
        this.add(2, -3, 8);
        cam.cx = -1.5;
        cam.cy = 4.5;
        cam.zoom = 44;
        this.test.q = -2;
        tx = 1;
        ty = 3;
        break;
      case 'dipole':
      default:
        this.add(2, -1.5, 0);
        this.add(-2, 1.5, 0);
        break;
    }
    this.selected = null;
    this.testStart = { x: tx, y: ty };
    this.resetTest();
  }

  resetTest() {
    const t = this.test;
    t.x = this.testStart.x;
    t.y = this.testStart.y;
    t.vx = t.vy = 0;
    t.released = false;
    this.trail.length = 0;
  }

  release() {
    const t = this.test;
    if (!t.released) {
      this.testStart = { x: t.x, y: t.y };
      t.vx = t.vy = 0;
      this.trail.length = 0;
    }
    t.released = !t.released;
  }

  // ---------- derived values for the panel ----------

  /** Field, potential and energies at the test charge. */
  probe() {
    const t = this.test;
    const e = eField(this.charges, t.x, t.y);
    const v = potential(this.charges, t.x, t.y);
    const speed = Math.hypot(t.vx, t.vy);
    return {
      ex: e[0], ey: e[1], e: Math.hypot(e[0], e[1]), v,
      fx: t.q * e[0], fy: t.q * e[1], f: Math.abs(t.q) * Math.hypot(e[0], e[1]),
      speed, kinetic: 0.5 * t.m * speed * speed, potentialEnergy: t.q * v,
    };
  }

  // ---------- interaction ----------

  handles(): Handle[] {
    const hs: Handle[] = this.charges.map((c) => ({
      id: c,
      get: () => [c.x, c.y, 0],
      set: (p) => {
        c.x = p[0];
        c.y = p[1];
      },
      down: () => {
        this.selected = c;
      },
      radius: 20,
    }));
    if (this.test.on) {
      const t = this.test;
      hs.push({
        id: 'test',
        get: () => [t.x, t.y, 0],
        set: (p) => {
          t.x = p[0];
          t.y = p[1];
          t.vx = t.vy = 0;
          t.released = false;
          this.trail.length = 0;
          this.testStart = { x: t.x, y: t.y };
        },
        radius: 16,
      });
    }
    return hs;
  }

  protected onClick(): boolean {
    this.selected = null;
    return true;
  }

  onKey(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
      this.remove(this.selected);
      return true;
    }
    return false;
  }

  // ---------- simulation ----------

  protected update(dt: number) {
    const t = this.test;
    if (t.on && t.released && dt > 0) {
      const sub = 12;
      const h = dt / sub;
      for (let s = 0; s < sub; s++) {
        // velocity Verlet; a = qE/m (nC * N/C / micrograms = m/s^2)
        const e0 = eField(this.charges, t.x, t.y);
        const ax = (t.q * e0[0]) / t.m, ay = (t.q * e0[1]) / t.m;
        t.x += t.vx * h + 0.5 * ax * h * h;
        t.y += t.vy * h + 0.5 * ay * h * h;
        const e1 = eField(this.charges, t.x, t.y);
        t.vx += 0.5 * (ax + (t.q * e1[0]) / t.m) * h;
        t.vy += 0.5 * (ay + (t.q * e1[1]) / t.m) * h;
        let hit = false;
        for (const c of this.charges) if (Math.hypot(t.x - c.x, t.y - c.y) < 0.1) hit = true;
        if (hit || Math.abs(t.x) > 200 || Math.abs(t.y) > 200) {
          t.released = false;
          break;
        }
      }
      this.trail.push(t.x, t.y, 0);
      if (this.trail.length > 3 * 3000) this.trail.splice(0, 3);
    }
    if (this.showFlow && dt > 0) this.updateFlow(dt);
  }

  private updateFlow(dt: number) {
    const b = this.camera.bounds();
    const f = this.flow;
    const speed = 110 / this.camera.zoom;
    for (let i = 0; i < FLOW_N; i++) {
      const k = i * 4;
      f[k + 2] += dt;
      let dead = f[k + 2] > f[k + 3];
      if (!dead) {
        const e = eField(this.charges, f[k], f[k + 1]);
        const m = Math.hypot(e[0], e[1]);
        if (m < 1e-6) dead = true;
        else {
          f[k] += (e[0] / m) * speed * dt;
          f[k + 1] += (e[1] / m) * speed * dt;
          if (f[k] < b.x0 || f[k] > b.x1 || f[k + 1] < b.y0 || f[k + 1] > b.y1) dead = true;
          for (const c of this.charges) {
            if (c.q < 0 && Math.hypot(f[k] - c.x, f[k + 1] - c.y) < 0.12) dead = true;
          }
        }
      }
      if (dead) {
        f[k] = b.x0 + Math.random() * (b.x1 - b.x0);
        f[k + 1] = b.y0 + Math.random() * (b.y1 - b.y0);
        f[k + 2] = 0;
        f[k + 3] = 0.8 + Math.random() * 2.2;
      }
    }
  }

  // ---------- drawing ----------

  private rebuildLines() {
    const b = this.camera.bounds();
    const key = this.charges.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.q}`).join(';') +
      `|${b.x0.toFixed(2)},${b.x1.toFixed(2)},${b.y0.toFixed(2)},${b.y1.toFixed(2)}`;
    if (key === this.linesKey) return;
    this.linesKey = key;
    const padX = (b.x1 - b.x0) * 0.25, padY = (b.y1 - b.y0) * 0.25;
    const maxQ = Math.max(1e-6, ...this.charges.map((c) => Math.abs(c.q)));
    this.lines = traceFieldLines(this.charges, {
      bounds: { x0: b.x0 - padX, x1: b.x1 + padX, y0: b.y0 - padY, y1: b.y1 + padY },
      density: Math.min(8, 16 / maxQ),
      maxLinesPerCharge: this.charges.length > 10 ? 6 : 24,
      capture: Math.min(0.09, 7 / this.camera.zoom),
    });
  }

  protected draw() {
    const r = this.r;
    const cam = this.camera;
    const b = cam.bounds();
    const charges = this.charges;

    if (this.showPotential || this.showEquip) {
      const n = Math.min(32, charges.length);
      for (let i = 0; i < n; i++) {
        this.chargeBuf[i * 3] = charges[i].x;
        this.chargeBuf[i * 3 + 1] = charges[i].y;
        this.chargeBuf[i * 3 + 2] = charges[i].q;
      }
      r.fullscreen(this.mapProg, (p) => {
        p.f2('uCenter', cam.cx, cam.cy).f2('uHalf', (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2)
          .fv3('uCharges', this.chargeBuf).i1('uN', n)
          .f1('uMap', this.showPotential ? 1 : 0).f1('uEquip', this.showEquip ? 1 : 0)
          .f1('uV0', 12).f3('uBg', C.bg[0], C.bg[1], C.bg[2]);
      });
    }

    r.layer(0);
    grid2D(r, cam, { labels: true });

    // field lines
    if (this.showLines && charges.length) {
      this.rebuildLines();
      r.layer(1);
      const col: RGBA = [1, 0.86, 0.55, 0.62];
      const headCol: RGBA = [1, 0.86, 0.55, 0.9];
      const gap = 150 / cam.zoom;
      for (const l of this.lines) {
        r.polyline(l.pts, col, 1.5, false, 0, l.n);
        let acc = gap * 0.5;
        for (let i = 1; i < l.n; i++) {
          const j = i * 3;
          const dx = l.pts[j] - l.pts[j - 3], dy = l.pts[j + 1] - l.pts[j - 2];
          acc += Math.hypot(dx, dy);
          if (acc >= gap) {
            acc = 0;
            r.head([l.pts[j], l.pts[j + 1]], [l.pts[j - 3], l.pts[j - 2]], headCol, 9);
          }
        }
      }
    }

    // vector grid
    if (this.showVectors && charges.length) {
      r.layer(2);
      const step = Math.pow(2, Math.round(Math.log2(48 / cam.zoom)));
      const len = (step * 0.82) / 2;
      const cold: RGBA = [0.42, 0.5, 0.66, 1];
      for (let x = Math.floor(b.x0 / step) * step; x <= b.x1; x += step) {
        for (let y = Math.floor(b.y0 / step) * step; y <= b.y1; y += step) {
          let skip = false;
          for (const c of charges) if (Math.hypot(x - c.x, y - c.y) < step * 0.45) skip = true;
          if (skip) continue;
          const e = eField(charges, x, y);
          const m = Math.hypot(e[0], e[1]);
          if (m < 1e-9) continue;
          const t = Math.min(1, Math.log10(m / 0.3 + 1) / 2.5);
          const L = len * (0.45 + 0.55 * t);
          const ux = e[0] / m, uy = e[1] / m;
          const col = mix(cold, C.E, t);
          col[3] = 0.3 + 0.7 * t;
          r.arrow([x - ux * L, y - uy * L], [x + ux * L, y + uy * L], col, 1.6, 7);
        }
      }
    }

    // flow particles
    if (this.showFlow && charges.length) {
      r.layer(3);
      const f = this.flow;
      const streak = 9 / cam.zoom;
      for (let i = 0; i < FLOW_N; i++) {
        const k = i * 4;
        if (f[k + 3] <= 0) continue;
        const e = eField(charges, f[k], f[k + 1]);
        const m = Math.hypot(e[0], e[1]);
        if (m < 1e-6) continue;
        const a = Math.sin((Math.PI * f[k + 2]) / f[k + 3]);
        r.seg([f[k] - (e[0] / m) * streak, f[k + 1] - (e[1] / m) * streak], [f[k], f[k + 1]], [1, 0.8, 0.4, 0.75 * a], 1.6);
      }
    }

    // test charge
    const t = this.test;
    if (t.on) {
      r.layer(5);
      if (this.trail.length >= 6) r.polyline(new Float32Array(this.trail), alpha(C.v, 0.9), 2);
      if (charges.length) {
        const contribs = charges.map((c) => eFieldOf(c, t.x, t.y));
        const net = eField(charges, t.x, t.y);
        const maxMag = Math.max(1e-9, Math.hypot(net[0], net[1]), ...contribs.map((e) => Math.hypot(e[0], e[1])));
        const s = 95 / cam.zoom / maxMag;
        const fScale = s * Math.min(1.6, Math.max(0.35, Math.abs(t.q) * 1.25)) * Math.sign(t.q || 1);
        const fTip = [t.x + net[0] * fScale, t.y + net[1] * fScale];
        r.arrow([t.x, t.y], fTip, C.F, 4);
        if (this.showContrib && charges.length > 1 && charges.length <= 8) {
          charges.forEach((c, i) => {
            const e = contribs[i];
            const col = alpha(c.q >= 0 ? C.pos : C.neg, 0.95);
            r.arrow([t.x, t.y], [t.x + e[0] * s, t.y + e[1] * s], col, 2);
          });
          // parallelogram guide for two charges
          if (charges.length === 2) {
            const a = contribs[0], bb = contribs[1];
            const g = alpha(C.dim, 0.7);
            r.seg([t.x + a[0] * s, t.y + a[1] * s], [t.x + net[0] * s, t.y + net[1] * s], g, 1, 4, 0);
            r.seg([t.x + bb[0] * s, t.y + bb[1] * s], [t.x + net[0] * s, t.y + net[1] * s], g, 1, 4, 0);
          }
        }
        const eTip = [t.x + net[0] * s, t.y + net[1] * s];
        r.arrow([t.x, t.y], eTip, C.E, 3);
        const lab = (tip: number[], text: string, color: RGBA) => {
          const dx = tip[0] - t.x, dy = tip[1] - t.y;
          const l = Math.hypot(dx, dy) || 1;
          r.label([tip[0] + (dx / l) * (16 / cam.zoom), tip[1] + (dy / l) * (16 / cam.zoom)], text, {
            color: css(color), tex: true, size: 14,
          });
        };
        lab(eTip, '\\vec E', C.E);
        if (Math.hypot(fTip[0] - eTip[0], fTip[1] - eTip[1]) * cam.zoom > 22) lab(fTip, '\\vec F', C.F);
      }
      r.disc([t.x, t.y], 15, alpha(C.v, 0.25), { style: 'glow' });
      r.disc([t.x, t.y], 7, C.v, { style: 'sphere' });
      r.label([t.x, t.y], 'q_0', { tex: true, size: 12, dy: 17, color: css(C.v) });
    }

    // charges
    r.layer(6);
    for (const c of charges) {
      const col = c.q >= 0 ? C.pos : C.neg;
      const rad = 9 + 3.2 * Math.sqrt(Math.abs(c.q));
      r.disc([c.x, c.y], rad * 2.6, alpha(col, 0.32), { style: 'glow' });
      r.disc([c.x, c.y], rad, col, { style: 'sphere' });
      sign(r, [c.x, c.y], c.q >= 0, C.white, rad * 0.42, 2.2);
      if (c === this.selected) r.disc([c.x, c.y], rad + 5, C.white, { style: 'ring', ring: 1.5 });
      if (charges.length <= 10) {
        r.label([c.x, c.y], `${c.q > 0 ? '+' : ''}${fmt(c.q, 2)} nC`, { size: 11, dy: rad + 12, color: css(alpha(col, 1)) });
      }
    }

    // probe under the cursor
    if (this.showProbe && this.pointer.inside && !this.hovered && !this.dragging && charges.length) {
      const m = this.mouse;
      const e = eField(charges, m[0], m[1]);
      const v = potential(charges, m[0], m[1]);
      const mag = Math.hypot(e[0], e[1]);
      if (mag > 1e-9) {
        r.layer(7);
        const L = 34 / cam.zoom;
        r.arrow(m, [m[0] + (e[0] / mag) * L, m[1] + (e[1] / mag) * L], alpha(C.E, 0.95), 2.2, 9);
        r.labelScreen(this.pointer.x + 14, this.pointer.y + 22, `|E| = ${fmt(mag, 3)} N/C   V = ${fmt(v, 3)} V`, {
          size: 11.5, align: 'left', bg: true, color: css(C.text),
        });
      }
    }
  }
}

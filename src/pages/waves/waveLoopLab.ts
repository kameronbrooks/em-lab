import { C, RGBA, alpha, css, signed } from '../../engine/colors';
import { vector } from '../../engine/draw';
import { Handle, Lab3D } from '../../engine/lab';
import { V3, add, addScaled, basis, clamp, cross, norm, perp, scale, sub } from '../../engine/math';
import { Mesh, discGeo, torusGeo } from '../../engine/mesh';
import { Plot, PlotData, TimeSeries } from '../../engine/plot';
import { LoopFluxes, loopFluxes, loopNormal } from '../../physics/waves';
import { drawAxes, drawEMWave } from './emDraw';

const HALF = 6.5;
const WINDOW = 10;
const NORMAL_LEN = 2.1;

/** A circular loop in a plane wave travelling along +z with E along x and B along y. */
export class WaveLoopLab extends Lab3D {
  /** Polar angle of the loop normal from +z, degrees. */
  theta = 90;
  /** Azimuth of the loop normal from +x toward +y, degrees. */
  phi = 90;
  R = 1.5;
  lambda = 12;
  /** Angular frequency used for the animation (rad/s). */
  omega = 1.8;
  showB = true;
  showE = true;
  showWave = true;

  seriesB = new TimeSeries(2, WINDOW);
  seriesE = new TimeSeries(2, WINDOW);
  plotB: Plot;
  plotE: Plot;
  flux: LoopFluxes = { phiB: 0, emf: 0, phiE: 0, dPhiE: 0, emfAmp: 0, dPhiEAmp: 0 };

  private torus!: Mesh;
  private disc!: Mesh;

  constructor() {
    super();
    this.camera.distance = 13.5;
    this.camera.yaw = 0.95;
    this.camera.pitch = 0.32;
    this.plotB = new Plot(() => this.plotData(this.seriesB, 'Φ_B', 'emf', C.B, C.I));
    this.plotE = new Plot(() => this.plotData(this.seriesE, 'Φ_E', 'dΦ_E/dt', C.E, C.F));
  }

  protected init() {
    const gl = this.r.gl;
    this.torus = new Mesh(gl, torusGeo(0.035, 72, 10));
    this.disc = new Mesh(gl, discGeo(64));
  }

  dispose() {
    this.torus?.dispose();
    this.disc?.dispose();
  }

  get normal(): V3 {
    return loopNormal(this.theta, this.phi);
  }
  get k() {
    return (2 * Math.PI) / this.lambda;
  }
  /** Largest possible rate of change of flux for this loop size (small-loop limit). */
  get maxRate() {
    return this.omega * Math.PI * this.R * this.R;
  }

  setPlane(plane: 'xy' | 'yz' | 'xz') {
    if (plane === 'xy') {
      this.theta = 0;
      this.phi = 0;
    } else if (plane === 'yz') {
      this.theta = 90;
      this.phi = 0;
    } else {
      this.theta = 90;
      this.phi = 90;
    }
    this.clearPlots();
  }

  /** Which coordinate plane the loop lies in, if any. */
  plane(): 'xy' | 'yz' | 'xz' | null {
    const n = this.normal;
    if (Math.abs(n[2]) > 0.999) return 'xy';
    if (Math.abs(n[0]) > 0.999) return 'yz';
    if (Math.abs(n[1]) > 0.999) return 'xz';
    return null;
  }

  preset(name: string) {
    if (name === 'p63') this.setPlane('xz');
    else if (name === 'p64') this.setPlane('yz');
    else if (name === 'xy') this.setPlane('xy');
  }

  clearPlots() {
    this.seriesB.clear();
    this.seriesE.clear();
    this.plotB.resetRange();
    this.plotE.resetRange();
  }

  handles(): Handle[] {
    return [
      {
        id: 'normal',
        get: () => scale(this.normal, NORMAL_LEN),
        set: (p) => {
          const n = norm(p);
          if (n[0] === 0 && n[1] === 0 && n[2] === 0) return;
          this.theta = (Math.acos(clamp(n[2], -1, 1)) * 180) / Math.PI;
          if (Math.hypot(n[0], n[1]) > 1e-3) this.phi = ((Math.atan2(n[1], n[0]) * 180) / Math.PI + 360) % 360;
          this.clearPlots();
        },
        radius: 18,
      },
    ];
  }

  protected update(dt: number) {
    this.flux = loopFluxes(this.normal, this.R, this.k, this.omega, this.time);
    if (dt > 0) {
      this.seriesB.push(this.time, [this.flux.phiB, this.flux.emf]);
      this.seriesE.push(this.time, [this.flux.phiE, this.flux.dPhiE]);
    }
  }

  private plotData(s: TimeSeries, n0: string, n1: string, c0: RGBA, c1: RGBA): PlotData {
    const lim = Math.max(this.maxRate, Math.PI * this.R * this.R) * 1.15;
    return {
      x0: this.time - WINDOW,
      x1: this.time,
      y0: -lim,
      y1: lim,
      xLabel: 'time (s)',
      curves: [
        { name: n0, color: c0, xs: s.t, ys: s.v[0], width: 2 },
        { name: n1, color: c1, xs: s.t, ys: s.v[1], width: 2.4 },
      ],
    };
  }

  protected draw() {
    const r = this.r;
    const n = this.normal;
    const k = this.k;
    const phase = (z: number) => Math.cos(k * z - this.omega * this.time);
    drawAxes(r, HALF + 0.4);

    if (this.showWave) {
      r.layer(1);
      drawEMWave(r, {
        axis: [0, 0, 1], travel: 1, e: [1, 0, 0], b: [0, 1, 0], a: k, phi: this.omega * this.time, amp: 1.3, half: HALF,
        showE: this.showE, showB: this.showB, opacity: 0.55, step: 0.4,
      });
      r.arrow([0, 0, HALF + 1.2], [0, 0, HALF + 2.8], C.S, 4, 15);
      r.label([0, 0, HALF + 3.2], 'travel', { color: css(C.S), size: 12, bold: true });
    }

    // loop geometry
    const u = perp(n);
    const v = cross(u, n);
    const model = basis(scale(u, this.R), scale(n, this.R), scale(v, this.R));
    r.layer(2);
    r.mesh(this.torus, model, [0.86, 0.88, 0.94, 1]);

    // field threading the loop, sampled at a few points inside it
    r.layer(3);
    const pts: V3[] = [[0, 0, 0]];
    for (const [frac, count] of [[0.62, 6]] as const) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + frac;
        pts.push(add(scale(u, Math.cos(a) * this.R * frac), scale(v, Math.sin(a) * this.R * frac)));
      }
    }
    for (const p of pts) {
      const c = phase(p[2]);
      if (Math.abs(c) < 0.03) continue;
      if (this.showB) r.arrow(addScaled(p, [0, 1, 0], -0.55 * c), addScaled(p, [0, 1, 0], 0.55 * c), C.B, 2.2, 8);
      if (this.showE) r.arrow(addScaled(p, [1, 0, 0], -0.55 * c), addScaled(p, [1, 0, 0], 0.55 * c), C.E, 2.2, 8);
    }

    // normal (draggable)
    r.layer(4);
    vector(r, [0, 0, 0], scale(n, NORMAL_LEN), C.white, '\\hat n', 3);
    r.disc(scale(n, NORMAL_LEN), this.hovered || this.dragging ? 9 : 6.5, C.white, { style: 'ring', ring: 2 });

    // induced current around the loop
    const f = this.flux;
    const strength = this.maxRate > 0 ? f.emf / this.maxRate : 0;
    if (Math.abs(strength) > 0.03) {
      const dir = Math.sign(strength);
      const size = 7 + 11 * Math.min(1, Math.abs(strength));
      const count = 10;
      for (let i = 0; i < count; i++) {
        // positive emf drives current counter-clockwise about n (right-hand rule): tangent = n x radial
        const a = (i / count) * Math.PI * 2 + dir * this.time * 1.4;
        const radial = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)));
        const tangent = scale(cross(n, radial), dir);
        const p = scale(radial, this.R);
        r.head(addScaled(p, tangent, 0.16), sub(p, scale(tangent, 0.16)), C.I, size);
      }
    }

    // translucent disc coloured by the magnetic flux through it
    r.layer(50);
    const area = Math.PI * this.R * this.R;
    const tint = signed(clamp(f.phiB / area, -1, 1), 0.2 + 0.25 * Math.min(1, Math.abs(f.phiB) / area));
    r.mesh(this.disc, model, alpha(tint, tint[3]), { rim: 0.6, unlit: true });
  }
}

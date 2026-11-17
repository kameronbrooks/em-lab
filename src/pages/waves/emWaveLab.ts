import { C, alpha, css } from '../../engine/colors';
import { vector } from '../../engine/draw';
import { Lab3D } from '../../engine/lab';
import { V3, addScaled, cross, scale } from '../../engine/math';
import { AXES, Axis, GivenField, Sign, WaveAnalysis, analyseField, bDirection, unit } from '../../physics/waves';
import { drawAxes, drawEMWave } from './emDraw';

const HALF = 6;
/** On-screen speed of the wave in build mode (world units per second): slow motion, not to scale. */
const VIS_SPEED = 2.2;
export const C_LIGHT = 299792458;

export class EMWaveLab extends Lab3D {
  /** 'build': choose the travel direction and E. 'given': read a wave off one field (Problem 65). */
  mode: 'build' | 'given' = 'build';

  // build mode
  kAxis: Axis = 'x';
  kSign: Sign = 1;
  eAxis: Axis = 'y';
  eSign: Sign = 1;
  /** Peak electric field in V/m. */
  E0 = 120;
  /** Wavelength in metres. */
  lambda = 4;

  // given mode
  given: GivenField = { field: 'B', comp: 'y', compSign: 1, variable: 'x', form: 1, a: 1.5, b: 3 };

  showE = true;
  showB = true;
  showTriad = true;

  private phi = 0;
  private crest = 0;

  constructor() {
    super();
    this.camera.distance = 23;
    this.camera.yaw = 0.62;
    this.camera.pitch = 0.36;
  }

  preset(name: string) {
    if (name === 'p65') {
      this.mode = 'given';
      this.given = { field: 'B', comp: 'y', compSign: 1, variable: 'x', form: 1, a: 1.5, b: 3 };
    } else if (name === 'p63' || name === 'p64') {
      // plane wave travelling along z with E along x
      this.mode = 'build';
      this.kAxis = 'z';
      this.kSign = 1;
      this.eAxis = 'x';
      this.eSign = 1;
    } else {
      this.mode = 'build';
      this.kAxis = 'x';
      this.kSign = 1;
      this.eAxis = 'y';
      this.eSign = 1;
    }
  }

  setTravel(axis: Axis, sign: Sign) {
    this.kAxis = axis;
    this.kSign = sign;
    if (this.eAxis === axis) this.eAxis = AXES.find((a) => a !== axis)!;
  }

  /** Frequency in Hz (lambda * f = c). */
  get frequency() {
    return C_LIGHT / this.lambda;
  }
  set frequency(f: number) {
    this.lambda = C_LIGHT / f;
  }

  analysis(): WaveAnalysis | null {
    return this.mode === 'given' ? analyseField(this.given) : null;
  }

  /** Everything the drawing needs, for either mode. */
  state() {
    if (this.mode === 'given') {
      const an = analyseField(this.given);
      return {
        valid: an.valid, axisName: this.given.variable, axis: unit(this.given.variable), travel: an.travel.sign,
        e: an.e, b: an.b, a: this.given.a, rate: this.given.b, amp: 1.3,
      };
    }
    const k = unit(this.kAxis, this.kSign);
    const e = unit(this.eAxis, this.eSign);
    const a = (2 * Math.PI) / this.lambda;
    return {
      valid: true, axisName: this.kAxis, axis: unit(this.kAxis), travel: this.kSign,
      e, b: bDirection(k, e), a, rate: a * VIS_SPEED, amp: 0.45 + (this.E0 / 300) * 1.35,
    };
  }

  protected update(dt: number) {
    const s = this.state();
    this.phi += s.rate * dt;
    // follow one crest: a*x - travel*phi = 2 pi n
    const crestNear = (x: number) => (2 * Math.PI * Math.round((s.a * x - s.travel * this.phi) / (2 * Math.PI)) + s.travel * this.phi) / s.a;
    let x = crestNear(this.crest + (s.travel * s.rate * dt) / s.a);
    const lim = HALF - 1.2;
    if (x > lim) x = crestNear(-lim + Math.PI / s.a);
    else if (x < -lim) x = crestNear(lim - Math.PI / s.a);
    this.crest = x;
  }

  protected draw() {
    const r = this.r;
    const s = this.state();
    drawAxes(r, HALF + 0.6);
    if (!s.valid) {
      r.label([0, 1.2, 0], 'Not a possible electromagnetic wave: the field points along the direction of travel.', {
        color: css(C.warn), size: 14, bg: true,
      });
      return;
    }
    r.layer(1);
    drawEMWave(r, {
      axis: s.axis, travel: s.travel, e: s.e, b: s.b, a: s.a, phi: this.phi, amp: s.amp, half: HALF,
      showE: this.showE, showB: this.showB,
    });

    const k = scale(s.axis, s.travel);

    // direction of travel
    r.layer(2);
    const start = scale(k, HALF + 1.2);
    const end = scale(k, HALF + 2.9);
    r.arrow(start, end, C.S, 5, 18);
    r.label(addScaled(end, k, 0.5), 'direction of travel', { color: css(C.S), size: 12.5, bold: true, dy: -16 });

    // wavelength bracket, offset to the side opposite E
    const lam = (2 * Math.PI) / s.a;
    if (lam < HALF * 1.6) {
      const c0 = this.crest + lam <= HALF ? this.crest : this.crest - lam;
      const off = scale(s.e, -(s.amp + 0.45));
      const p0 = addScaled(off, s.axis, c0), p1 = addScaled(off, s.axis, c0 + lam);
      const mid = addScaled(off, s.axis, c0 + lam / 2);
      r.arrow(mid, p0, C.V, 2, 8);
      r.arrow(mid, p1, C.V, 2, 8);
      r.seg(scale(s.axis, c0), p0, alpha(C.V, 0.6), 1, 4, 0);
      r.seg(scale(s.axis, c0 + lam), p1, alpha(C.V, 0.6), 1, 4, 0);
      r.label(addScaled(mid, s.e, -0.4), '\\lambda', { tex: true, color: css(C.V), size: 15 });
    }

    // E, B and E x B riding on one crest
    if (this.showTriad) {
      r.layer(3);
      const p: V3 = scale(s.axis, this.crest);
      r.disc(p, 5, C.white, { style: 'sphere' });
      vector(r, p, scale(s.e, s.amp), C.E, '\\vec E', 4.5);
      vector(r, p, scale(s.b, s.amp), C.B, '\\vec B', 4.5);
      vector(r, p, scale(cross(s.e, s.b), 1.7), C.S, '\\vec E\\times\\vec B', 4);
    }
  }
}

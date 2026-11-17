import { describe, expect, it } from 'vitest';
import { cross, dot } from '../engine/math';
import {
  AXES, Wave1D, analyseField, bDirection, d2dt2, d2dx2, discPhasors, eDirection, frequency, lastCrestTime,
  loopFluxes, loopNormal, nearestCrest, period, unit, waveDirection, waveSpeed, waveValue, waveVelocity, wavelength,
} from './waves';

describe('1D travelling wave', () => {
  const w: Wave1D = { A: 1.5, a: 2, b: 3, form: 1 };

  it('has speed b/a, wavelength 2π/a, period 2π/b', () => {
    expect(waveSpeed(2, 3)).toBeCloseTo(1.5, 12);
    expect(wavelength(2)).toBeCloseTo(Math.PI, 12);
    expect(period(3)).toBeCloseTo((2 * Math.PI) / 3, 12);
    expect(frequency(3)).toBeCloseTo(3 / (2 * Math.PI), 12);
    expect(wavelength(2) / period(3)).toBeCloseTo(waveSpeed(2, 3), 12);
  });

  it('ax − bt moves toward +x and ax + bt toward −x', () => {
    expect(waveDirection(w)).toBe(1);
    expect(waveDirection({ ...w, form: -1 })).toBe(-1);
    expect(waveVelocity({ ...w, form: -1 })).toBeCloseTo(-1.5, 12);
  });

  it('a crest really travels at the wave velocity', () => {
    for (const form of [1, -1] as const) {
      const ww = { ...w, form };
      const x0 = nearestCrest(ww, 0.3, 0);
      const dt = 0.01;
      const x1 = nearestCrest(ww, x0 + waveVelocity(ww) * dt, dt);
      expect(waveValue(ww, x0, 0)).toBeCloseTo(ww.A, 9);
      expect(waveValue(ww, x1, dt)).toBeCloseTo(ww.A, 9);
      expect((x1 - x0) / dt).toBeCloseTo(waveVelocity(ww), 9);
    }
  });

  it('repeats after one wavelength and one period', () => {
    expect(waveValue(w, 0.7 + wavelength(w.a), 0.4)).toBeCloseTo(waveValue(w, 0.7, 0.4), 9);
    expect(waveValue(w, 0.7, 0.4 + period(w.b))).toBeCloseTo(waveValue(w, 0.7, 0.4), 9);
  });

  it('finds the last crest time at a point', () => {
    for (const form of [1, -1] as const) {
      const ww = { ...w, form };
      const tc = lastCrestTime(ww, 1.3, 5);
      expect(tc).toBeLessThanOrEqual(5);
      expect(5 - tc).toBeLessThan(period(ww.b));
      expect(waveValue(ww, 1.3, tc)).toBeCloseTo(ww.A, 9);
    }
  });

  it('satisfies the wave equation with v = b/a', () => {
    const f = (x: number, t: number) => waveValue(w, x, t);
    const v = waveSpeed(w.a, w.b);
    const fxx = d2dx2(f, 0.83, 1.7);
    const ftt = d2dt2(f, 0.83, 1.7);
    expect(fxx).toBeCloseTo(ftt / (v * v), 4);
    expect(fxx).toBeCloseTo(-w.a * w.a * f(0.83, 1.7), 4);
  });
});

describe('plane electromagnetic wave directions', () => {
  it('E × B points along the direction of travel for all six directions', () => {
    for (const kAxis of AXES) {
      for (const kSign of [1, -1] as const) {
        const k = unit(kAxis, kSign);
        for (const eAxis of AXES) {
          if (eAxis === kAxis) continue;
          for (const eSign of [1, -1] as const) {
            const e = unit(eAxis, eSign);
            const b = bDirection(k, e);
            expect(cross(e, b).map((c) => c + 0)).toEqual(k.map((c) => c + 0));
            expect(dot(e, b)).toBe(0);
            expect(dot(b, k)).toBe(0);
            // and the inverse relation recovers E from B
            expect(eDirection(k, b).map((c) => c + 0)).toEqual(e.map((c) => c + 0));
          }
        }
      }
    }
  });

  it('Problem 65: B = B0 cos(ax − bt) ĵ', () => {
    const r = analyseField({ field: 'B', comp: 'y', compSign: 1, variable: 'x', form: 1, a: 2, b: 6 });
    expect(r.valid).toBe(true);
    expect(r.speed).toBeCloseTo(3, 12); // (a) b/a
    expect(r.travel).toEqual({ axis: 'x', sign: 1 }); // (b) +x
    expect(r.other).toEqual({ axis: 'z', sign: -1 }); // (c) E along z (−k̂ when B is along +ĵ)
    expect(r.wavelength).toBeCloseTo(Math.PI, 12); // (d) 2π/a
    expect(cross(r.e, r.b).map((c) => c + 0)).toEqual([1, 0, 0]);
  });

  it('the plus form travels the other way', () => {
    const r = analyseField({ field: 'B', comp: 'y', compSign: 1, variable: 'x', form: -1, a: 2, b: 6 });
    expect(r.travel).toEqual({ axis: 'x', sign: -1 });
    expect(r.other).toEqual({ axis: 'z', sign: 1 });
  });

  it('works from a given E field too', () => {
    const r = analyseField({ field: 'E', comp: 'x', compSign: 1, variable: 'z', form: 1, a: 1, b: 1 });
    expect(r.travel).toEqual({ axis: 'z', sign: 1 });
    expect(r.other).toEqual({ axis: 'y', sign: 1 });
  });

  it('rejects a field along the direction of travel', () => {
    expect(analyseField({ field: 'B', comp: 'x', compSign: 1, variable: 'x', form: 1, a: 1, b: 1 }).valid).toBe(false);
  });
});

describe('loop in a wave travelling along z with E along x and B along y', () => {
  const R = 1, k = (2 * Math.PI) / 12, omega = 2;
  const planes = {
    xy: loopNormal(0, 0), // normal along z
    yz: loopNormal(90, 0), // normal along x
    xz: loopNormal(90, 90), // normal along y
  };

  it('normals of the three coordinate planes', () => {
    expect(planes.xy[2]).toBeCloseTo(1, 12);
    expect(planes.yz[0]).toBeCloseTo(1, 12);
    expect(planes.xz[1]).toBeCloseTo(1, 12);
  });

  it('small-loop limit of the disc integral is the area', () => {
    const p = discPhasors([0, 1, 0], 0.05, k);
    expect(p.c / (Math.PI * 0.05 * 0.05)).toBeCloseTo(1, 3);
    expect(p.s).toBeCloseTo(0, 9);
  });

  it('Problem 63: the emf is largest with the loop in the xz plane (normal along B)', () => {
    const amp = (n: number[]) => loopFluxes(n, R, k, omega, 0.3).emfAmp;
    expect(amp(planes.xz)).toBeGreaterThan(0.9 * omega * Math.PI * R * R);
    expect(amp(planes.xy)).toBeCloseTo(0, 9);
    expect(amp(planes.yz)).toBeCloseTo(0, 9);
    for (let th = 0; th <= 180; th += 15) {
      for (let ph = 0; ph < 360; ph += 15) {
        expect(amp(loopNormal(th, ph))).toBeLessThanOrEqual(amp(planes.xz) + 1e-9);
      }
    }
  });

  it('Problem 64: the changing electric flux is largest with the loop in the yz plane (normal along E)', () => {
    const amp = (n: number[]) => loopFluxes(n, R, k, omega, 0.3).dPhiEAmp;
    expect(amp(planes.yz)).toBeGreaterThan(0.9 * omega * Math.PI * R * R);
    expect(amp(planes.xy)).toBeCloseTo(0, 9);
    expect(amp(planes.xz)).toBeCloseTo(0, 9);
    for (let th = 0; th <= 180; th += 15) {
      for (let ph = 0; ph < 360; ph += 15) {
        expect(amp(loopNormal(th, ph))).toBeLessThanOrEqual(amp(planes.yz) + 1e-9);
      }
    }
  });

  it('emf equals −dΦ_B/dt and dΦ_E/dt matches a finite difference', () => {
    const n = loopNormal(60, 40);
    const h = 1e-5, t = 0.77, z0 = 0.6;
    const f = (tt: number) => loopFluxes(n, R, k, omega, tt, 1, 1, z0);
    const dB = (f(t + h).phiB - f(t - h).phiB) / (2 * h);
    const dE = (f(t + h).phiE - f(t - h).phiE) / (2 * h);
    expect(f(t).emf).toBeCloseTo(-dB, 6);
    expect(f(t).dPhiE).toBeCloseTo(dE, 6);
  });
});

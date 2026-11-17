import { describe, expect, it } from 'vitest';
import { MU0 } from './fields';
import {
  Profile, emfUniform, fluxBesideWire, fluxUniform, inducedE, loopArea, numericEmf, rotatingLoop, slidingLoop,
  solenoidField, stretchFieldFromEmf, stretchLoop,
} from './induction';

const close = (a: number, b: number, rel = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1e-30, Math.abs(b)));

describe('uniform time-varying field', () => {
  it('analytic emf matches -dPhi/dt for every profile', () => {
    const profiles: Profile[] = [
      { kind: 'linear', A: 0.7 },
      { kind: 'cos', b: 1.2, w: 3 },
      { kind: 'exp', C: 2, a: 0.8 },
      { kind: 'const', B: 1 },
    ];
    for (const p of profiles) {
      for (const t of [0.1, 0.9, 2.3]) {
        const area = loopArea('circle', 1.3), c = 0.6;
        const num = numericEmf((x) => fluxUniform(p, area, c, x), t);
        expect(Math.abs(num - emfUniform(p, area, c, t))).toBeLessThan(1e-6);
      }
    }
  });

  it('Problem 25: B = At through a circle of radius R gives |emf| = A pi R^2', () => {
    const A = 0.4, R = 1.5;
    close(Math.abs(emfUniform({ kind: 'linear', A }, loopArea('circle', R), 1, 3.3)), A * Math.PI * R * R);
  });

  it('Problem 36: B = at through a square of side L gives |emf| = a L^2', () => {
    const a = 0.25, L = 2;
    close(Math.abs(emfUniform({ kind: 'linear', A: a }, loopArea('square', L), 1, 1)), a * L * L);
  });

  it('Problem 38: B = C exp(-at) through a square of side L has maximum |emf| = C a L^2, at t = 0', () => {
    const C = 1.5, a = 0.6, L = 2;
    const p: Profile = { kind: 'exp', C, a };
    let max = 0, tMax = -1;
    for (let t = 0; t <= 10; t += 0.01) {
      const e = Math.abs(emfUniform(p, loopArea('square', L), 1, t));
      if (e > max) { max = e; tMax = t; }
    }
    close(max, C * a * L * L);
    expect(tMax).toBe(0);
  });

  it('tilting the loop scales the emf by cos(theta): the maximum is with the loop face-on to B', () => {
    const p: Profile = { kind: 'linear', A: 1 };
    const full = Math.abs(emfUniform(p, 2, 1, 0));
    close(Math.abs(emfUniform(p, 2, Math.cos(1), 0)), full * Math.cos(1));
    expect(Math.abs(emfUniform(p, 2, 0, 0))).toBe(0);
  });
});

describe('Problem 24: loop rotating inside a solenoid', () => {
  it('maximum induced current is w mu0 n I pi a^2 / R', () => {
    const n = 1500, I = 3, a = 0.2, w = 12, R = 4;
    const B0 = solenoidField(n, I);
    close(B0, MU0 * n * I);
    let max = 0;
    for (let t = 0; t < (2 * Math.PI) / w; t += 1e-4) max = Math.max(max, Math.abs(rotatingLoop(B0, a, w, R, t).current));
    const expected = (w * MU0 * n * I * Math.PI * a * a) / R;
    close(max, expected, 1e-5);
    close(rotatingLoop(B0, a, w, R, 0).maxCurrent, expected);
    // flux = mu0 n I pi a^2 cos(wt) and emf is its negative derivative
    const t = 0.123;
    close(rotatingLoop(B0, a, w, R, t).flux, MU0 * n * I * Math.PI * a * a * Math.cos(w * t));
    expect(Math.abs(numericEmf((x) => rotatingLoop(B0, a, w, R, x).flux, t) - rotatingLoop(B0, a, w, R, t).emf)).toBeLessThan(1e-9);
  });
});

describe('Problem 39: induced electric field', () => {
  it('E = emf / (2 pi R)', () => {
    close(inducedE(6, 1.5), 6 / (2 * Math.PI * 1.5));
  });
});

describe('Problem 40: stretchable square loop', () => {
  it('shrinking from L to L/2 in t* gives emf = 3 B L^2 / (4 t*), so B = 4 chi t* / (3 L^2)', () => {
    const B = 0.8, L = 2, tStar = 1.6;
    const s = stretchLoop(B, L, tStar, 0.5);
    const chi = s.emf;
    close(chi, (3 * B * L * L) / (4 * tStar));
    close(stretchFieldFromEmf(chi, L, tStar), B);
    // emf really is -dPhi/dt (flux falls, so the sign convention gives a positive number here)
    close(numericEmf((t) => stretchLoop(B, L, tStar, t).flux, 0.5), chi, 1e-6);
    close(stretchLoop(B, L, tStar, tStar).side, L / 2);
    expect(stretchLoop(B, L, tStar, tStar + 1).emf).toBe(0);
  });
});

describe('loop sliding into a field region', () => {
  const s = { B: 0.5, w: 2, h: 1.5, v: 1, x0: -1, regionStart: 0, regionEnd: 6 };
  it('emf = B h v while entering, zero while fully inside, opposite sign while leaving', () => {
    expect(slidingLoop(s, 0.5).emf).toBe(0); // not there yet
    close(slidingLoop(s, 2).emf, -s.B * s.h * s.v); // entering: flux growing
    expect(slidingLoop(s, 5).emf).toBe(0); // fully inside: flux constant
    close(slidingLoop(s, 8).emf, s.B * s.h * s.v); // leaving: flux falling
    expect(slidingLoop(s, 12).emf).toBe(0);
    close(slidingLoop(s, 5).flux, s.B * s.h * s.w);
  });
  it('matches a numerical derivative of the flux', () => {
    for (const t of [1.7, 4.2, 7.9]) {
      expect(Math.abs(numericEmf((x) => slidingLoop(s, x).flux, t) - slidingLoop(s, t).emf)).toBeLessThan(1e-6);
    }
  });
});

describe('flux beside a long wire (video 47)', () => {
  it('matches a numerical integral of mu0 I / (2 pi r) over the rectangle', () => {
    const I = 20, length = 1.5, d = 0.4, w = 1.1;
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = d + ((i + 0.5) / N) * w;
      sum += ((MU0 * I) / (2 * Math.PI * r)) * length * (w / N);
    }
    close(fluxBesideWire(I, length, d, w), sum, 1e-6);
  });
});

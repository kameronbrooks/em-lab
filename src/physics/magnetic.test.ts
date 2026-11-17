import { describe, expect, it } from 'vitest';
import { V3, dot, len, norm } from '../engine/math';
import { MU0 } from './fields';
import {
  ParticleState, biotSavartPieces, borisStep, circlePath, cyclotronPeriod, cyclotronRadius, finiteWireB,
  fluxThroughCube, fluxThroughDisc, fluxThroughSphere, forceOnSegment, forcePerLength, lineIntegral, lorentzForce,
  magneticForce, rectPath, sheetB, solenoidB, wireB,
} from './magnetic';

const close = (a: number, b: number, rel = 1e-3) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1e-30, Math.abs(b)));

describe('Boris pusher', () => {
  it('moves on a circle of radius mv/|q|B and keeps its speed over many periods', () => {
    const q = -2, m = 3, v0 = 4, B = 1.5;
    const s: ParticleState = { x: [0, 0, 0], v: [v0, 0, 0] };
    const T = cyclotronPeriod(m, q, B);
    const dt = T / 400;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (let i = 0; i < 400 * 50; i++) {
      borisStep(s, q / m, [0, 0, 0], [0, 0, B], dt);
      minX = Math.min(minX, s.x[0]); maxX = Math.max(maxX, s.x[0]);
      minY = Math.min(minY, s.x[1]); maxY = Math.max(maxY, s.x[1]);
    }
    const r = cyclotronRadius(m, v0, q, B);
    expect(r).toBeCloseTo((m * v0) / (2 * 1.5), 12);
    close((maxX - minX) / 2, r, 2e-3);
    close((maxY - minY) / 2, r, 2e-3);
    // speed is conserved to rounding error
    expect(Math.abs(len(s.v) - v0)).toBeLessThan(1e-9);
    // after a whole number of periods it is back near the start
    expect(len(s.x)).toBeLessThan(0.05 * r);
  });

  it('gives a helix when v has a component along B: the parallel part is untouched', () => {
    const s: ParticleState = { x: [0, 0, 0], v: [1, 0, 2] };
    for (let i = 0; i < 1000; i++) borisStep(s, 1, [0, 0, 0], [0, 0, 1], 0.01);
    expect(s.v[2]).toBeCloseTo(2, 12);
    expect(s.x[2]).toBeCloseTo(20, 9);
    expect(Math.hypot(s.v[0], s.v[1])).toBeCloseTo(1, 9);
  });

  it('passes straight through a velocity selector when v = E/B', () => {
    // v along +x, B along -z, E along -y: qE + qv x B = 0 when v = E/B
    const E = 3, B = 1.5;
    const s: ParticleState = { x: [0, 0, 0], v: [E / B, 0, 0] };
    for (let i = 0; i < 2000; i++) borisStep(s, 5, [0, -E, 0], [0, 0, -B], 0.001);
    expect(Math.abs(s.x[1])).toBeLessThan(1e-9);
    expect(s.v[0]).toBeCloseTo(E / B, 9);
  });
});

describe('magnetic force', () => {
  it('is zero when v is parallel or antiparallel to B (Problem 31)', () => {
    expect(len(magneticForce(2, [0, 0, 5], [0, 0, 3]))).toBe(0);
    expect(len(magneticForce(2, [0, 0, -5], [0, 0, 3]))).toBe(0);
    expect(len(magneticForce(2, [5, 0, 0], [0, 0, 3]))).toBeGreaterThan(0);
  });

  it('is perpendicular to v, so it does no work', () => {
    const v: V3 = [1.2, -0.7, 2.1], B: V3 = [0.3, 0.9, -0.4];
    expect(dot(magneticForce(1.7, v, B), v)).toBeCloseTo(0, 12);
  });

  it('Problem 30: v = b x-hat, B = B z-hat gives F = -q b B y-hat', () => {
    const q = 2, b = 3, B = 5;
    const F = lorentzForce(q, [b, 0, 0], [0, 0, 0], [0, 0, B]);
    expect(F[0]).toBeCloseTo(0, 12);
    expect(F[1]).toBeCloseTo(-q * b * B, 12);
    expect(F[2]).toBeCloseTo(0, 12);
  });

  it('Problem 28: directly above a left-right wire, v into or out of the board feels no force', () => {
    const B = wireB(10, [0, 0, 0], [1, 0, 0], [0, 2, 0]);
    // B above a wire carrying current to the right points out of the board (+z)
    expect(norm(B)[2]).toBeCloseTo(1, 12);
    expect(len(magneticForce(1, [0, 0, 4], B))).toBeCloseTo(0, 15);
    expect(len(magneticForce(1, [0, 0, -4], B))).toBeCloseTo(0, 15);
    expect(len(magneticForce(1, [4, 0, 0], B))).toBeGreaterThan(0);
  });

  it('Problem 29: charge -q moving right, a distance d below a wire carrying 2I to the left', () => {
    const q = 1.5, V0 = 7, I = 4, d = 0.8;
    const B = wireB(2 * I, [0, 0, 0], [-1, 0, 0], [0, -d, 0]);
    const F = magneticForce(-q, [V0, 0, 0], B);
    close(len(F), (q * V0 * MU0 * I) / (Math.PI * d), 1e-12);
    // toward the wire = +y for a particle below it
    expect(norm(F)[1]).toBeCloseTo(1, 12);
  });

  it('Problem 32: top side of a clockwise loop in a field out of the board is pushed downward', () => {
    // clockwise seen from +z: the top side carries current to the right (+x)
    const F = forceOnSegment(2, [-1, 1, 0], [1, 1, 0], [0, 0, 0.5]);
    expect(norm(F)[1]).toBeCloseTo(-1, 12);
    // the four sides cancel: no net force on a closed loop in a uniform field
    const corners: V3[] = [[-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0]];
    const net: V3 = [0, 0, 0];
    corners.forEach((c, i) => {
      const f = forceOnSegment(2, c, corners[(i + 1) % 4], [0, 0, 0.5]);
      net[0] += f[0]; net[1] += f[1]; net[2] += f[2];
    });
    expect(len(net)).toBeCloseTo(0, 12);
  });

  it('Problem 33: inside a solenoid only motion along the axis is force free; outside there is no field', () => {
    const inside = solenoidB(1000, 2, [0, 0, 0], [0, 0, 1], 1, [0.3, 0.2, 5]);
    close(inside[2], MU0 * 1000 * 2, 1e-12);
    expect(len(magneticForce(1, [0, 0, 3], inside))).toBe(0);
    expect(len(magneticForce(1, [3, 0, 0], inside))).toBeGreaterThan(0);
    expect(len(solenoidB(1000, 2, [0, 0, 0], [0, 0, 1], 1, [1.5, 0, 0]))).toBe(0);
  });
});

describe("Ampere's law", () => {
  const I = 12;
  const field = (p: V3) => wireB(I, [0, 0, 0], [0, 0, 1], p);
  it('gives mu0 I for a circle centred on the wire', () => {
    close(lineIntegral(circlePath([0, 0, 0], 2), field), MU0 * I, 1e-6);
  });
  it('gives mu0 I for an off-centre circle and for a rectangle that still enclose the wire', () => {
    close(lineIntegral(circlePath([1.2, -0.5, 0], 2), field), MU0 * I, 1e-5);
    close(lineIntegral(rectPath([0.7, 0.3, 0], [1, 0, 0], [0, 1, 0], 3, 2), field), MU0 * I, 1e-5);
  });
  it('gives zero when the loop does not enclose the wire', () => {
    expect(Math.abs(lineIntegral(circlePath([4, 1, 0], 1.5), field))).toBeLessThan(1e-6 * MU0 * I);
    expect(Math.abs(lineIntegral(rectPath([-5, 0, 0], [1, 0, 0], [0, 1, 0], 2, 3), field))).toBeLessThan(1e-6 * MU0 * I);
  });
  it('adds enclosed currents with their signs', () => {
    const two = (p: V3): V3 => {
      const a = wireB(5, [-1, 0, 0], [0, 0, 1], p), b = wireB(-3, [1, 0, 0], [0, 0, 1], p);
      return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    };
    close(lineIntegral(circlePath([0, 0, 0], 3, [0, 0, 1], 720), two), MU0 * 2, 1e-5);
    close(lineIntegral(circlePath([-1, 0, 0], 0.8), two), MU0 * 5, 1e-5);
  });
  it('gives mu0 K w for a rectangle straddling a sheet of current, and mu0 n I per length for a solenoid wall', () => {
    const K = 40;
    const sheet = (p: V3) => sheetB(K, [0, 1, 0], [0, 0, 1], [0, 0, 0], p);
    close(lineIntegral(rectPath([0.5, 0.2, 0], [1, 0, 0], [0, 1, 0], 3, 2), sheet), MU0 * K * 3, 1e-9);
    expect(Math.abs(lineIntegral(rectPath([0, 3, 0], [1, 0, 0], [0, 1, 0], 3, 2), sheet))).toBeLessThan(1e-12);
    // the field is mu0 K / 2 on each side, in opposite directions
    close(len(sheet([0, 1, 0])), (MU0 * K) / 2, 1e-12);
    expect(sheet([0, 1, 0])[0]).toBeLessThan(0);
    expect(sheet([0, -1, 0])[0]).toBeGreaterThan(0);
  });
});

describe('Biot-Savart', () => {
  it('sum over pieces converges to mu0 I / (2 pi r) for a long wire', () => {
    const I = 3, r = 0.5;
    const exact = (MU0 * I) / (2 * Math.PI * r);
    const coarse = len(biotSavartPieces(I, [0, 0, -2], [0, 0, 2], 8, [r, 0, 0]).total);
    const fine = len(biotSavartPieces(I, [0, 0, -400], [0, 0, 400], 80000, [r, 0, 0]).total);
    close(fine, exact, 1e-4);
    expect(Math.abs(coarse - exact)).toBeGreaterThan(Math.abs(fine - exact));
    // direction: current along +z, point on +x, field along +y
    expect(norm(biotSavartPieces(I, [0, 0, -50], [0, 0, 50], 2000, [r, 0, 0]).total)[1]).toBeCloseTo(1, 9);
  });
  it('agrees with the exact finite-wire formula, which tends to the infinite wire', () => {
    const I = 3, p: V3 = [0.7, 0.2, 0.4];
    const sum = biotSavartPieces(I, [0, 0, -3], [0, 0, 5], 20000, p).total;
    const exact = finiteWireB(I, [0, 0, -3], [0, 0, 5], p);
    close(len(sum), len(exact), 1e-5);
    const inf = wireB(I, [0, 0, 0], [0, 0, 1], p);
    close(len(finiteWireB(I, [0, 0, -1e5], [0, 0, 1e5], p)), len(inf), 1e-6);
  });
  it('parallel currents attract with mu0 I1 I2 / (2 pi d) per length', () => {
    const I1 = 4, I2 = 6, d = 0.3;
    const B = wireB(I1, [0, 0, 0], [0, 0, 1], [d, 0, 0]);
    const F = forceOnSegment(I2, [d, 0, 0], [d, 0, 1], B);
    close(len(F), forcePerLength(I1, I2, d), 1e-12);
    expect(F[0]).toBeLessThan(0); // toward the first wire
    expect(forcePerLength(I1, -I2, d)).toBeLessThan(0); // opposite currents repel
  });
});

describe('magnetic flux', () => {
  const n = 800, I = 2.5, R = 1.5;
  const sol = (p: V3) => solenoidB(n, I, [0, 0, 0], [1, 0, 0], R, p);
  it('Problem 35: the most flux through a coil of radius L inside a solenoid is mu0 n I pi L^2', () => {
    const L = 0.9;
    close(fluxThroughDisc([0.4, 0.1, 0], [1, 0, 0], L, sol), MU0 * n * I * Math.PI * L * L, 1e-3);
    // tilting the coil reduces it by cos(theta); edge-on gives zero
    const th = 0.7;
    close(fluxThroughDisc([0, 0, 0], [Math.cos(th), 0, Math.sin(th)], 0.5, sol), MU0 * n * I * Math.PI * 0.25 * Math.cos(th), 1e-3);
    expect(Math.abs(fluxThroughDisc([0, 0, 0], [0, 0, 1], 0.5, sol))).toBeLessThan(1e-15);
  });
  it('Problems 26 and 34: the flux through any closed surface is zero', () => {
    const scale = MU0 * n * I;
    expect(Math.abs(fluxThroughSphere([0.2, 0.1, 0], 0.8, sol))).toBeLessThan(1e-9 * scale);
    expect(Math.abs(fluxThroughCube([0.2, 0.1, 0], 0.5, sol))).toBeLessThan(1e-9 * scale);
    const wire = (p: V3) => wireB(10, [0, 0, 0], [0, 0, 1], p, 0.1);
    expect(Math.abs(fluxThroughSphere([1.5, 0.3, 0.2], 1, wire))).toBeLessThan(1e-9 * MU0 * 10);
    // off-centre cube around the wire: limited only by the quadrature
    expect(Math.abs(fluxThroughCube([0.3, 0.2, 0], 1, wire, 24))).toBeLessThan(1e-3 * MU0 * 10);
  });
  it('Problem 37: no flux through a loop that lies in the board and is centred on a wire out of the board', () => {
    const wire = (p: V3) => wireB(50, [0, 0, 0], [0, 0, 1], p, 0.05);
    expect(Math.abs(fluxThroughDisc([0, 0, 0], [0, 0, 1], 2, wire))).toBeLessThan(1e-18);
    expect(Math.abs(fluxThroughDisc([0.6, -0.3, 0], [0, 0, 1], 2, wire))).toBeLessThan(1e-18);
  });
});

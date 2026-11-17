import { describe, expect, it } from 'vitest';
import { K_NC, eField, potential, traceFieldLines } from './fields';

describe('point-charge fields', () => {
  it('field of a single charge is k q / r^2, pointing away from a positive charge (Problem 10)', () => {
    const e = eField([{ x: 0, y: 0, q: 2 }], 3, 4);
    const mag = Math.hypot(e[0], e[1]);
    expect(mag).toBeCloseTo((K_NC * 2) / 25, 9);
    expect(e[0] / mag).toBeCloseTo(3 / 5, 9);
    expect(e[1] / mag).toBeCloseTo(4 / 5, 9);
  });

  it('Problem 1: force on -q from q at (-3, 8) points toward the source', () => {
    const q = 2;
    const [x, y] = [1, 3];
    const e = eField([{ x: -3, y: 8, q }], x, y);
    const f = [-q * e[0], -q * e[1]];
    // expected: F = -k q^2 [(x+3) i + (y-8) j] / [(x+3)^2 + (y-8)^2]^(3/2)
    const r3 = Math.pow((x + 3) ** 2 + (y - 8) ** 2, 1.5);
    expect(f[0]).toBeCloseTo((-K_NC * q * q * (x + 3)) / r3, 9);
    expect(f[1]).toBeCloseTo((-K_NC * q * q * (y - 8)) / r3, 9);
  });

  it('superposition: the field midway between equal charges is zero', () => {
    const e = eField([{ x: -1, y: 0, q: 3 }, { x: 1, y: 0, q: 3 }], 0, 0);
    expect(Math.hypot(e[0], e[1])).toBeLessThan(1e-9);
  });

  it('E is minus the gradient of V', () => {
    const charges = [{ x: -1.5, y: 0.2, q: 2 }, { x: 1.1, y: -0.7, q: -3 }];
    const [x, y, h] = [0.4, 1.3, 1e-5];
    const e = eField(charges, x, y);
    const gx = (potential(charges, x + h, y) - potential(charges, x - h, y)) / (2 * h);
    const gy = (potential(charges, x, y + h) - potential(charges, x, y - h)) / (2 * h);
    expect(e[0]).toBeCloseTo(-gx, 4);
    expect(e[1]).toBeCloseTo(-gy, 4);
  });

  it('field lines of a dipole start on + and end on -', () => {
    const charges = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: -1 }];
    const lines = traceFieldLines(charges, { bounds: { x0: -20, x1: 20, y0: -20, y1: 20 }, density: 8 });
    expect(lines.length).toBeGreaterThanOrEqual(8);
    let connected = 0;
    for (const l of lines) {
      const sx = l.pts[0], sy = l.pts[1];
      const ex = l.pts[(l.n - 1) * 3], ey = l.pts[(l.n - 1) * 3 + 1];
      const startsOnPlus = Math.hypot(sx + 1, sy) < 0.2;
      const endsOnMinus = Math.hypot(ex - 1, ey) < 0.2;
      // every line touches a charge at one end at least; lines that run off to "infinity" touch only one
      expect(startsOnPlus || endsOnMinus).toBe(true);
      if (startsOnPlus && endsOnMinus) connected++;
    }
    expect(connected).toBeGreaterThanOrEqual(4);
  });
});

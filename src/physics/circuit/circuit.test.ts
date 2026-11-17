import { describe, expect, it } from 'vitest';
import { analyzeSeries, drivenAmplitude, rlcRegime, rlcRoots } from './analytic';
import { CElement, Circuit, ElType, Pt, makeElement } from './solver';

/** Build a single rectangular loop from a list of elements placed in order around it. */
function loop(parts: [ElType, number, Partial<CElement>?][]): { c: Circuit; els: CElement[] } {
  const c = new Circuit();
  const n = parts.length;
  // points around a ring: 0..n-1 mapped onto distinct grid points
  const pt = (k: number): Pt => [k % n, k % n === 0 ? 0 : 1 + (k % n)];
  const els = parts.map(([type, value, extra], k) => c.add(makeElement(type, pt(k), pt(k + 1), value, extra)));
  c.reset();
  return { c, els };
}

describe('resistive circuits', () => {
  it('series resistors add', () => {
    const { c, els } = loop([['battery', 12], ['resistor', 100], ['resistor', 200], ['resistor', 300]]);
    c.run(0.05);
    expect(els[0].i).toBeCloseTo(12 / 600, 6);
    expect(els[1].v).toBeCloseTo(2, 5);
    expect(els[3].v).toBeCloseTo(6, 5);
  });

  it('parallel resistors: 1/Req = sum of 1/R', () => {
    const c = new Circuit();
    const bat = c.add(makeElement('battery', [0, 0], [0, 1], 12));
    c.add(makeElement('resistor', [0, 1], [0, 0], 100));
    c.add(makeElement('resistor', [0, 1], [1, 1], 200));
    c.add(makeElement('wire', [1, 1], [1, 0]));
    c.add(makeElement('wire', [1, 0], [0, 0]));
    c.reset();
    c.run(0.05);
    const req = 1 / (1 / 100 + 1 / 200);
    expect(12 / bat.i).toBeCloseTo(req, 3);
  });

  it('Problem 42: three equal resistors, 33 V and 1 A in series, are 11/3 ohm in parallel', () => {
    const series = loop([['battery', 33], ['resistor', 11], ['resistor', 11], ['resistor', 11]]);
    series.c.run(0.02);
    expect(series.els[0].i).toBeCloseTo(1, 5);

    const c = new Circuit();
    const bat = c.add(makeElement('battery', [0, 0], [0, 1], 33));
    for (let k = 1; k <= 3; k++) {
      c.add(makeElement('wire', [k - 1, 1], [k, 1]));
      c.add(makeElement('resistor', [k, 1], [k, 0], 11));
      c.add(makeElement('wire', [k, 0], [k - 1, 0]));
    }
    c.reset();
    c.run(0.02);
    expect(33 / bat.i).toBeCloseTo(11 / 3, 4);
  });
});

describe('RC and RL decay', () => {
  it('RC discharge follows q0 exp(-t/RC) within 1%', () => {
    const R = 100, C = 0.01, V0 = 10;
    const { c, els } = loop([['capacitor', C, { ic: V0 }], ['resistor', R], ['wire', 0]]);
    for (const t of [0.5, 1, 2, 3]) {
      c.run(t - c.time);
      const exact = V0 * Math.exp(-c.time / (R * C));
      expect(Math.abs(els[0].v - exact) / exact).toBeLessThan(0.01);
    }
    // Problem 47: energy left after t = 3RC is exp(-6) of the initial energy
    const u0 = 0.5 * C * V0 * V0;
    expect(c.energies().uc / u0).toBeCloseTo(Math.exp(-6), 4);
    // energy conservation: what left the capacitor became heat
    expect(c.energies().uc + c.heat).toBeCloseTo(u0, 3);
  });

  it('RL decay follows i0 exp(-Rt/L) within 1%', () => {
    const R = 2, L = 1, I0 = 1;
    const { c, els } = loop([['inductor', L, { ic: I0 }], ['resistor', R], ['wire', 0]]);
    for (const t of [0.25, 0.5, 1, 1.5]) {
      c.run(t - c.time);
      const exact = I0 * Math.exp((-R * c.time) / L);
      expect(Math.abs(els[0].i - exact) / exact).toBeLessThan(0.01);
    }
  });

  it('Problem 41: resistor and inductor voltages always add up to the battery voltage', () => {
    const { c, els } = loop([['battery', 20], ['resistor', 10], ['inductor', 5]]);
    for (let k = 0; k < 5; k++) {
      c.run(0.2);
      expect(els[1].v + els[2].v).toBeCloseTo(20, 3);
    }
    expect(els[1].i).toBeCloseTo(2 * (1 - Math.exp(-c.time / 0.5)), 2);
  });
});

describe('LC oscillation', () => {
  const L = 1, C = 0.1, V0 = 10;
  it('conserves total energy within 0.1% over 20 periods', () => {
    const { c } = loop([['capacitor', C, { ic: V0 }], ['inductor', L], ['wire', 0]]);
    const u0 = 0.5 * C * V0 * V0;
    const T = 2 * Math.PI * Math.sqrt(L * C);
    let worst = 0;
    for (let k = 0; k < 200; k++) {
      c.run(T / 10);
      const e = c.energies();
      worst = Math.max(worst, Math.abs(e.uc + e.ul - u0) / u0);
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it('has period 2 pi sqrt(LC)', () => {
    const { c, els } = loop([['capacitor', C, { ic: V0 }], ['inductor', L], ['wire', 0]]);
    const T = 2 * Math.PI * Math.sqrt(L * C);
    // time the downward zero crossings of the capacitor voltage
    const crossings: number[] = [];
    let prev = els[0].v, prevT = 0;
    while (c.time < 5.2 * T) {
      c.run(c.stepSize);
      if (prev > 0 && els[0].v <= 0) crossings.push(prevT + (c.time - prevT) * (prev / (prev - els[0].v)));
      prev = els[0].v;
      prevT = c.time;
    }
    expect(crossings.length).toBeGreaterThanOrEqual(5);
    const measured = (crossings[4] - crossings[0]) / 4;
    expect(Math.abs(measured - T) / T).toBeLessThan(2e-3);
  });

  it('Problem 45: when i is half its maximum, a quarter of the energy is in the inductor', () => {
    const { c, els } = loop([['capacitor', C, { ic: V0 }], ['inductor', L], ['wire', 0]]);
    const iMax = V0 * Math.sqrt(C / L);
    let prev = 0;
    while (c.time < 2) {
      c.run(c.stepSize);
      const i = Math.abs(els[1].i);
      if (prev < iMax / 2 && i >= iMax / 2) break;
      prev = i;
    }
    const e = c.energies();
    expect(e.ul / (e.ul + e.uc)).toBeCloseTo(0.25, 2);
  });
});

describe('RLC damping', () => {
  const L = 1, C = 0.1;
  const rc = Math.sqrt((4 * L) / C);

  it('regime switches at R = sqrt(4L/C)', () => {
    expect(rlcRegime(0.9 * rc, L, C)).toBe('underdamped');
    expect(rlcRegime(rc, L, C)).toBe('critical');
    expect(rlcRegime(1.1 * rc, L, C)).toBe('overdamped');
    expect(rlcRegime(Math.sqrt((7 * L) / C) * 1.01, L, C)).toBe('overdamped');
    expect(rlcRoots(0.5 * rc, L, C).im).toBeGreaterThan(0);
    expect(rlcRoots(2 * rc, L, C).im).toBe(0);
  });

  const crossesZero = (R: number) => {
    const { c, els } = loop([['capacitor', C, { ic: 10 }], ['inductor', L], ['resistor', R]]);
    let crossed = false;
    while (c.time < 12) {
      c.run(0.01);
      if (els[0].v < -1e-6) crossed = true;
    }
    return crossed;
  };

  it('the simulated charge oscillates below the critical resistance and not at or above it', () => {
    expect(crossesZero(0.5 * rc)).toBe(true);
    expect(crossesZero(rc)).toBe(false);
    expect(crossesZero(1.5 * rc)).toBe(false);
  });

  it('the simulation matches the formula-sheet solution in all three regimes', () => {
    for (const R of [1, rc, 10]) {
      const { c, els } = loop([['capacitor', C, { ic: 10 }], ['inductor', L], ['resistor', R]]);
      const info = analyzeSeries(c)!;
      expect(info.kind).toBe('RLC');
      for (let k = 0; k < 20; k++) {
        c.run(0.15);
        const p = info.element(els[0], c.time)!;
        expect(Math.abs(p.v - els[0].v)).toBeLessThan(0.02);
        const pi = info.element(els[1], c.time)!;
        expect(Math.abs(pi.i - els[1].i)).toBeLessThan(0.01);
      }
    }
  });

  it('Problem 58: the driven current is largest at f = 1/(2 pi sqrt(LC))', () => {
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const at = (f: number) => drivenAmplitude(5, f, 2, L, C);
    expect(at(f0)).toBeCloseTo(5 / 2, 6);
    expect(at(f0)).toBeGreaterThan(at(f0 * 0.9));
    expect(at(f0)).toBeGreaterThan(at(f0 * 1.1));
    // and the simulator agrees once the transient has died away
    const { c, els } = loop([['ac', 5, { freq: f0 }], ['resistor', 2], ['inductor', L], ['capacitor', C]]);
    c.run(12);
    let peak = 0;
    for (let k = 0; k < 400; k++) {
      c.run(0.01);
      peak = Math.max(peak, Math.abs(els[1].i));
    }
    expect(peak).toBeCloseTo(2.5, 1);
  });
});

describe('switches', () => {
  it('an RC circuit only starts charging once the switch is closed', () => {
    const { c, els } = loop([['battery', 10], ['switch', 0], ['resistor', 100], ['capacitor', 0.01]]);
    c.run(0.5);
    expect(Math.abs(els[3].v)).toBeLessThan(1e-3);
    els[1].closed = true;
    c.discontinuity();
    const t0 = c.time;
    c.run(1);
    expect(els[3].v).toBeCloseTo(10 * (1 - Math.exp(-(c.time - t0) / 1)), 2);
  });
});

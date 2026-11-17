import { describe, expect, it } from 'vitest';
import {
  chargeAtCurrent, currentAtCharge, exactValue, frac, lcOmega, lcPeakCharge, lcPeakCurrent, lcPeriod, lcStateAt,
  lcTotalEnergy, parseValue, rootOf, workLC,
} from './lc';

const L = 10e-3, C = 100e-6, q0 = 200e-6;

describe('LC circuit state', () => {
  it('keeps the total energy constant and the squared fractions adding to 1', () => {
    const E = lcTotalEnergy(q0, C);
    for (let k = 0; k <= 200; k++) {
      const s = lcStateAt((k / 200) * 4 * Math.PI, q0, L, C);
      expect(s.EC + s.EL).toBeCloseTo(E, 14);
      expect(s.qFrac ** 2 + s.iFrac ** 2).toBeCloseTo(1, 12);
    }
  });

  it('has i = dq/dt and obeys the loop rule q/C + L di/dt = 0', () => {
    const w = lcOmega(L, C), h = 1e-7;
    for (const t of [0.0003, 0.0011, 0.0029, 0.0047]) {
      const at = (x: number) => lcStateAt(w * x, q0, L, C);
      const dq = (at(t + h).q - at(t - h).q) / (2 * h);
      const di = (at(t + h).i - at(t - h).i) / (2 * h);
      expect(dq).toBeCloseTo(at(t).i, 6);
      expect(at(t).q / C + L * di).toBeCloseTo(0, 4);
    }
  });

  it('reaches the peak current a quarter period after the capacitor is full', () => {
    const iMax = lcPeakCurrent(q0, L, C);
    expect(iMax).toBeCloseTo(0.2, 12);
    const quarter = lcStateAt(lcOmega(L, C) * (lcPeriod(L, C) / 4), q0, L, C);
    expect(quarter.q).toBeCloseTo(0, 12);
    expect(Math.abs(quarter.i)).toBeCloseTo(iMax, 12);
    expect(quarter.EL).toBeCloseTo(lcTotalEnergy(q0, C), 14);
    expect(lcPeakCharge(iMax, L, C)).toBeCloseTo(q0, 14);
  });

  it('gets the current from the charge and the charge from the current', () => {
    for (const theta of [0.2, 0.9, 1.4, 2.5, 4.0, 5.7]) {
      const s = lcStateAt(theta, q0, L, C);
      expect(currentAtCharge(s.q, q0, L, C)).toBeCloseTo(Math.abs(s.i), 10);
      expect(chargeAtCurrent(s.i, q0, L, C)).toBeCloseTo(Math.abs(s.q), 12);
    }
    expect(currentAtCharge(q0, q0, L, C)).toBe(0);
    expect(chargeAtCurrent(0, q0, L, C)).toBeCloseTo(q0, 14);
  });
});

describe('reading a typed fraction', () => {
  it('keeps whole-number fractions and short decimals exact', () => {
    expect(parseValue('1/7')).toMatchObject({ frac: { n: 1, d: 7 }, exact: true });
    expect(parseValue(' 2 / 6 ')).toMatchObject({ frac: { n: 1, d: 3 } });
    expect(parseValue('0.25')).toMatchObject({ frac: { n: 1, d: 4 }, tex: String.raw`\frac{1}{4}` });
    expect(parseValue('25%')).toMatchObject({ frac: { n: 1, d: 4 } });
    expect(parseValue('1')).toMatchObject({ frac: { n: 1, d: 1 }, tex: '1' });
    expect(parseValue('.5/2')).toMatchObject({ frac: { n: 1, d: 4 } });
  });
  it('rejects things that are not numbers', () => {
    for (const bad of ['', 'abc', '1/0', '1/', '/3', '1/2/3', 'q/2']) expect(parseValue(bad)).toBeNull();
  });
});

describe('know one fraction, find the rest', () => {
  const given = (n: number, d: number) => exactValue(frac(n, d));

  it('Problem 45: current at half its maximum puts 1/4 of the energy in the inductor', () => {
    const w = workLC('i', given(1, 2))!;
    expect(w.EL.frac).toEqual({ n: 1, d: 4 });
    expect(w.EC.frac).toEqual({ n: 3, d: 4 });
    expect(w.q.tex).toBe(String.raw`\frac{\sqrt{3}}{2}`);
  });

  it('Problem 53: a seventh of the maximum charge leaves 48/49 in the inductor', () => {
    const w = workLC('q', given(1, 7))!;
    expect(w.EL.frac).toEqual({ n: 48, d: 49 });
    expect(w.i.tex).toBe(String.raw`\frac{4\sqrt{3}}{7}`);
    expect(w.i.value).toBeCloseTo(Math.sqrt(48) / 7, 12);
  });

  it('Problem 54: a third of the maximum current leaves 2√2/3 of the maximum charge', () => {
    const w = workLC('i', given(1, 3))!;
    expect(w.q.tex).toBe(String.raw`\frac{2\sqrt{2}}{3}`);
    expect(w.q.value).toBeCloseTo((2 * Math.SQRT2) / 3, 12);
    expect(w.steps).toHaveLength(3);
  });

  it('gives whole-number answers for 3-4-5 fractions', () => {
    expect(workLC('q', given(3, 5))!.i.frac).toEqual({ n: 4, d: 5 });
    expect(workLC('i', given(5, 13))!.q.frac).toEqual({ n: 12, d: 13 });
  });

  it('works from an energy share', () => {
    const half = workLC('EC', given(1, 2))!;
    expect(half.q.tex).toBe(String.raw`\frac{\sqrt{2}}{2}`);
    expect(half.i.value).toBeCloseTo(Math.SQRT1_2, 12);
    const w = workLC('EL', given(1, 9))!;
    expect(w.i.frac).toEqual({ n: 1, d: 3 });
    expect(w.q.tex).toBe(String.raw`\frac{2\sqrt{2}}{3}`);
  });

  it('is consistent for every kind of input: shares add to 1 and match the squared fractions', () => {
    for (const kind of ['q', 'i', 'EC', 'EL'] as const) {
      for (const v of [given(0, 1), given(1, 1), given(2, 7), parseValue('0.3141592653')!]) {
        const w = workLC(kind, v)!;
        expect(w.EC.value + w.EL.value).toBeCloseTo(1, 12);
        expect(w.q.value ** 2).toBeCloseTo(w.EC.value, 12);
        expect(w.i.value ** 2).toBeCloseTo(w.EL.value, 12);
        expect(w[kind].value).toBeCloseTo(v.value, 12);
      }
    }
  });

  it('agrees with the circuit itself at the moment it describes', () => {
    const w = workLC('q', given(2, 5))!;
    const s = lcStateAt(Math.acos(2 / 5), q0, L, C);
    expect(Math.abs(s.iFrac)).toBeCloseTo(w.i.value, 12);
    expect(s.EL / s.E).toBeCloseTo(w.EL.value, 12);
  });

  it('refuses fractions outside 0 to 1', () => {
    expect(workLC('q', parseValue('1.2')!)).toBeNull();
    expect(workLC('EC', parseValue('-0.5')!)).toBeNull();
  });

  it('pulls square factors out of roots', () => {
    expect(rootOf(given(8, 9)).tex).toBe(String.raw`\frac{2\sqrt{2}}{3}`);
    expect(rootOf(given(1, 49)).frac).toEqual({ n: 1, d: 7 });
    expect(rootOf(given(3, 1)).tex).toBe(String.raw`\sqrt{3}`);
    expect(rootOf(given(0, 1)).value).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { evaluate, parse } from '../../mathlab';
import { checkAnswer } from '../../mathlab/answers';
import { currentAtCharge, chargeAtCurrent, lcPeakCurrent, lcStateAt, lcTotalEnergy } from '../../physics/lc';
import { TEMPLATES, makeDrill } from './lcDrill';

// Arbitrary circuit values for evaluating the symbolic answers.
const L = 0.37, C = 0.0081, q0 = 2.3, I = 1.7;
const env = { L, C, q_0: q0, I };
const root = Math.sqrt(L * C);

/** What each answer should be, worked out independently of the answer expression. */
const EXPECTED: Record<string, (x: number) => number> = {
  'q-from-i': (x) => Math.sqrt(1 - x * x),
  'i-from-q': (x) => Math.sqrt(1 - x * x),
  'EL-from-q': (x) => 1 - x * x,
  'EC-from-i': (x) => 1 - x * x,
  'EL-from-i': (x) => x * x,
  'EC-from-q': (x) => x * x,
  'q-from-EC': (x) => Math.sqrt(x),
  'q-from-EL': (x) => Math.sqrt(1 - x),
  'i-from-EC': (x) => Math.sqrt(1 - x),
  'i-from-EL': (x) => Math.sqrt(x),
  'peak-current': () => lcPeakCurrent(q0, L, C),
  'i-at-q': (x) => currentAtCharge(x * q0, q0, L, C),
  'peak-charge': () => I * root,
  'q-at-i': (x) => chargeAtCurrent(x * I, I * root, L, C),
  'energy-from-I': () => (L * I * I) / 2,
  'energy-from-q': () => lcTotalEnergy(q0, C),
  'EL-at-q': (x) => lcStateAt(Math.acos(x), q0, L, C).EL,
  // time questions: the answer is the first time the described state is reached
  't-empty': () => (Math.PI / 2) * root,
  't-equal': () => (Math.PI / 4) * root,
  't-reversed': () => Math.PI * root,
  't-half': () => (Math.PI / 3) * root,
  'i-at-time': () => Math.abs(lcStateAt(Math.PI / 6, q0, L, C).i),
};

describe('LC drill questions', () => {
  const fractions: [number, number][] = [[1, 2], [1, 3], [3, 5], [2, 7], [12, 13]];

  it('has an independent expected value for every template', () => {
    const ids = TEMPLATES.map((t) => t(1, 3).id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [m, n] of fractions) {
    it(`gives the right answers for ${m}/${n}`, () => {
      for (const t of TEMPLATES) {
        const q = t(m, n);
        expect(evaluate(parse(q.expr), env), q.id).toBeCloseTo(EXPECTED[q.id](m / n), 10);
        // the reference answer is accepted, a wrong one is not
        expect(checkAnswer(q.expr, { expr: q.expr }), q.id).toEqual({ ok: true });
        expect(checkAnswer(`2\\left(${q.expr}\\right)`, { expr: q.expr }).ok, q.id).toBe(false);
        expect(q.solution.length).toBeGreaterThan(0);
        expect(q.text).not.toMatch(/undefined|NaN/);
        expect(q.solution.join(' ')).not.toMatch(/undefined|NaN/);
      }
    });
  }

  it('describes the right moment for "show on the circle"', () => {
    for (const t of TEMPLATES) {
      const q = t(3, 5);
      if (q.showQ === undefined) continue;
      expect(q.showQ).toBeGreaterThanOrEqual(-1);
      expect(q.showQ).toBeLessThanOrEqual(1);
    }
    // state checks at that moment
    const at = (id: string) => TEMPLATES.map((t) => t(3, 5)).find((q) => q.id === id)!;
    expect(at('q-from-i').showQ).toBeCloseTo(4 / 5, 12);
    expect(at('i-at-q').showQ).toBeCloseTo(3 / 5, 12);
    expect(at('t-equal').showQ).toBeCloseTo(Math.SQRT1_2, 12);
    expect(at('t-reversed').showQ).toBeCloseTo(-1, 12);
  });

  it('accepts other forms of a fraction answer', () => {
    const q = TEMPLATES[0](1, 3);
    expect(checkAnswer(String.raw`\frac{2\sqrt{2}}{3}`, { expr: q.expr })).toEqual({ ok: true });
    expect(checkAnswer(String.raw`\sqrt{\frac{8}{9}}`, { expr: q.expr })).toEqual({ ok: true });
    expect(checkAnswer(String.raw`\frac{2}{3}`, { expr: q.expr }).ok).toBe(false);
  });

  it('never repeats the previous template', () => {
    let seed = 7;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let prev = makeDrill(undefined, rng);
    const seen = new Set<string>([prev.id]);
    for (let k = 0; k < 400; k++) {
      const q = makeDrill(prev, rng);
      expect(q.id).not.toBe(prev.id);
      seen.add(q.id);
      prev = q;
    }
    expect(seen.size).toBe(TEMPLATES.length);
  });
});

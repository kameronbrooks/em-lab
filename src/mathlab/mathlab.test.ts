import { describe, expect, it } from 'vitest';
import { derivative, equivalent, evaluate, expand, integrate, parse, simplify, solveFor, toPrettyTex, toTex, tryParse, variables } from './index';

const ev = (tex: string, env: Record<string, number> = {}) => evaluate(parse(tex), env);

describe('parse: physics symbols are variables', () => {
  it('treats i as current, not the imaginary unit', () => {
    expect(variables(parse('v = iR'))).toEqual(['v', 'i', 'R']);
    expect(ev('iR', { i: 2, R: 5 })).toBe(10);
  });
  it('keeps subscripted names together', () => {
    expect(variables(parse(String.raw`q_0 e^{-t/RC}`))).toEqual(['q_0', 't', 'R', 'C']);
    expect(variables(parse(String.raw`\frac{1}{4\pi\epsilon_0}\frac{q_1 q_2}{r^2}`))).toEqual(['epsilon_0', 'q_1', 'q_2', 'r']);
    expect(variables(parse(String.raw`R_{eq} + i_{enc.} + v_{*}`))).toEqual(['R_eq', 'i_enc', 'v_*']);
    expect(variables(parse(String.raw`\mu_0 n I \pi L^2`))).toEqual(['mu_0', 'n', 'I', 'L']);
  });
  it('reads e as Euler only as the base of a power', () => {
    expect(ev('e^{2}')).toBeCloseTo(Math.exp(2), 12);
    expect(variables(parse('2e'))).toEqual(['e']);
    expect(ev(String.raw`\exp(-6)`)).toBeCloseTo(Math.exp(-6), 15);
    expect(ev('exp(-6)')).toBeCloseTo(Math.exp(-6), 15);
  });
  it('treats E, I and d as variables', () => {
    expect(ev('E d', { E: 3, d: 4 })).toBe(12);
    expect(ev(String.raw`\frac{L i^2}{2}`, { L: 2, i: 3 })).toBe(9);
  });
  it('drops vector arrows and keeps decorations as part of the name', () => {
    expect(variables(parse(String.raw`\vec{F}_B = q\vec{v}B`))).toEqual(['F_B', 'q', 'v', 'B']);
    expect(variables(parse(String.raw`\Delta V + \hat{r}`))).toEqual(['Delta:V', 'hat:r']);
  });
});

describe('parse: structure', () => {
  it('lets implicit products bind tighter than a slash', () => {
    expect(ev('R/2L', { R: 8, L: 2 })).toBe(2);
    expect(ev('e^{-t/RC}', { t: 6, R: 2, C: 3 })).toBeCloseTo(Math.exp(-1), 12);
    expect(ev('4/LC', { L: 2, C: 2 })).toBe(1);
    expect(ev('(L/R)x', { L: 6, R: 3, x: 5 })).toBe(10);
  });
  it('handles fractions, roots, powers and brackets', () => {
    expect(ev(String.raw`\sqrt{\frac{2qEd}{m}}`, { q: 1, E: 2, d: 4, m: 1 })).toBe(4);
    expect(ev(String.raw`\sqrt[3]{27}`)).toBeCloseTo(3, 12);
    expect(ev(String.raw`\left(1+2\right)^{2}`)).toBe(9);
    expect(ev(String.raw`\frac12 + \frac{1}{2}`)).toBe(1);
    expect(ev('-x^2', { x: 3 })).toBe(-9);
    expect(ev('2^{-1}')).toBe(0.5);
    expect(ev(String.raw`\left|x-5\right|`, { x: 2 })).toBe(3);
    expect(ev('|x-5|', { x: 2 })).toBe(3);
  });
  it('handles trig, logs and explicit products', () => {
    expect(ev(String.raw`\cos(ax-bt)`, { a: 1, x: 2, b: 1, t: 2 })).toBe(1);
    expect(ev(String.raw`\cos \omega t`, { omega: Math.PI, t: 1 })).toBeCloseTo(-1, 12);
    expect(ev(String.raw`\sin^2 x + \cos^2 x`, { x: 0.7 })).toBeCloseTo(1, 12);
    expect(ev(String.raw`\sin^{-1}(1)`)).toBeCloseTo(Math.PI / 2, 12);
    expect(ev(String.raw`\ln(e^{3})`)).toBeCloseTo(3, 12);
    expect(ev(String.raw`\log(10)`)).toBeCloseTo(Math.log(10), 12); // course convention: log = ln
    expect(ev(String.raw`\log_{10}(1000)`)).toBeCloseTo(3, 12);
    expect(ev(String.raw`1.6\times10^{-19}`)).toBeCloseTo(1.6e-19, 30);
    expect(ev(String.raw`3\cdot 4`)).toBe(12);
  });
  it('supports plus-minus', () => {
    const n = parse(String.raw`-\frac{R}{2L} \pm \frac{1}{2}\sqrt{\left(\frac{R}{L}\right)^2-\frac{4}{LC}}`);
    const env = { R: 6, L: 1, C: 0.2 };
    expect(evaluate(n, env, { pm: 1 })).toBeCloseTo(-1, 12);
    expect(evaluate(n, env, { pm: -1 })).toBeCloseTo(-5, 12);
  });
  it('uses SI values for physical constants unless overridden', () => {
    expect(ev(String.raw`\frac{1}{4\pi\epsilon_0}`)).toBeCloseTo(8.9875517923e9, -1);
    expect(ev(String.raw`\frac{1}{\sqrt{\mu_0\epsilon_0}}`)).toBeCloseTo(299792458, -3);
    expect(ev('c', { c: 5 })).toBe(5);
  });
  it('reports readable errors', () => {
    expect(tryParse('').error).toMatch(/Type an expression/);
    expect(tryParse(String.raw`\frac{1}{}`).error).toBeTruthy();
    expect(tryParse('(x+1').error).toBeTruthy();
    expect(tryParse(String.raw`\int x dx`).error).toMatch(/integral/i);
    expect(tryParse('a=b=c').error).toMatch(/one "="/);
    expect(() => ev('x+1')).toThrow(/No value for x/);
  });
});

describe('simplify and print', () => {
  const s = (tex: string) => toPrettyTex(simplify(parse(tex)));
  it('combines like terms and powers', () => {
    expect(s('x + x + 2x')).toBe('4 x');
    expect(s('x \\cdot x^2')).toBe('x^{3}');
    expect(s(String.raw`\frac{x^2 y}{x y^3}`)).toBe(String.raw`\frac{x}{y^{2}}`);
    expect(s('a - a')).toBe('0');
    expect(s(String.raw`\sqrt{4L/C}`)).toBe(String.raw`\frac{2 \sqrt{L}}{\sqrt{C}}`);
    expect(s(String.raw`e^{a}e^{-a}`)).toBe('1');
  });
  it('round-trips through its own LaTeX', () => {
    for (const tex of [
      String.raw`\frac{m v_0^2}{2 q E}`, String.raw`q_0 e^{-t/RC}`, String.raw`-\frac{L}{R}\ln(0.1)`,
      String.raw`\frac{\mu_0 I}{2\pi r}`, String.raw`\sqrt{\frac{2qEd}{m}}`, String.raw`\frac{2\sqrt{2}}{3}`,
      String.raw`A\cos(\omega t + \phi) - \frac{x^{3/2}}{y}`, String.raw`\frac{1}{2\pi\sqrt{LC}}`,
    ]) {
      const n = parse(tex);
      expect(equivalent(toTex(n), n).equal, `toTex ${tex}`).toBe(true);
      expect(equivalent(toPrettyTex(simplify(n)), n).equal, `pretty ${tex}`).toBe(true);
      expect(equivalent(toPrettyTex(expand(n)), n).equal, `expand ${tex}`).toBe(true);
    }
  });
  it('expands products of sums', () => {
    expect(equivalent(toPrettyTex(expand(parse('(x+1)^2'))), 'x^2+2x+1').equal).toBe(true);
    expect(s('(x+1)^2 - (x+1)^2')).toBe('0');
  });
});

describe('derivative', () => {
  const d = (tex: string, x: string) => derivative(parse(tex), x);
  it('differentiates the course formulas', () => {
    expect(equivalent(d(String.raw`q_0 e^{-t/RC}`, 't'), String.raw`-\frac{q_0}{RC}e^{-t/RC}`).equal).toBe(true);
    expect(equivalent(d(String.raw`q_0\cos(\omega t+\phi)`, 't'), String.raw`-q_0\omega\sin(\omega t+\phi)`).equal).toBe(true);
    expect(equivalent(d(String.raw`\frac{L i^2}{2}`, 'i'), 'L i').equal).toBe(true);
    expect(equivalent(d('x^n', 'x'), 'n x^{n-1}').equal).toBe(true);
    expect(equivalent(d(String.raw`\frac{1}{r^2}`, 'r'), String.raw`-\frac{2}{r^3}`).equal).toBe(true);
    expect(equivalent(d(String.raw`\sqrt{x}\ln x`, 'x'), String.raw`\frac{\ln x}{2\sqrt x}+\frac{1}{\sqrt x}`).equal).toBe(true);
    expect(toPrettyTex(d('a b', 'x'))).toBe('0');
  });
});

describe('solveFor', () => {
  const solve = (tex: string, x: string, env = {}) => solveFor(parse(tex), x, env);
  const exact = (tex: string, x: string, expected: string) => {
    const r = solve(tex, x);
    expect(r.kind, `${tex} for ${x}`).toBe('exact');
    if (r.kind !== 'exact') return;
    expect(r.solutions.some((s) => equivalent(s, expected).equal), `${tex} for ${x}: got ${r.solutions.map((k) => toPrettyTex(k)).join(' ; ')}`).toBe(true);
  };
  it('isolates a variable that appears once', () => {
    exact('v = iR', 'R', String.raw`\frac{v}{i}`);
    exact(String.raw`q = q_0 e^{-t/RC}`, 't', String.raw`RC\ln\left(\frac{q_0}{q}\right)`);
    exact(String.raw`K = \frac{1}{2}mv^2`, 'v', String.raw`\sqrt{\frac{2K}{m}}`);
    exact(String.raw`\omega = \frac{1}{\sqrt{LC}}`, 'C', String.raw`\frac{1}{L\omega^2}`);
    exact(String.raw`F = \frac{1}{4\pi\epsilon_0}\frac{q_1q_2}{r^2}`, 'r', String.raw`\sqrt{\frac{q_1q_2}{4\pi\epsilon_0 F}}`);
    exact(String.raw`y = A\cos(kx)`, 'x', String.raw`\frac{1}{k}\arccos\left(\frac{y}{A}\right)`);
  });
  it('solves linear equations where the variable appears more than once', () => {
    exact('v = iR + ir', 'i', String.raw`\frac{v}{R+r}`);
    exact(String.raw`\frac{1}{R} = \frac{1}{a} + \frac{1}{b}`, 'R', String.raw`\frac{ab}{a+b}`);
    exact('3x + 2 = x - 4', 'x', '-3');
  });
  it('solves quadratics', () => {
    const r = solve('x^2 - 5x + 6 = 0', 'x');
    expect(r.kind).toBe('exact');
    if (r.kind === 'exact') expect(r.solutions.map((s) => evaluate(s)).sort()).toEqual([2, 3]);
    exact(String.raw`L a^2 + R a + \frac{1}{C} = 0`, 'a', String.raw`\frac{-R + \sqrt{R^2 - 4L/C}}{2L}`);
  });
  it('falls back to numeric roots, and says what it needs', () => {
    const need = solve('x = a\\cos(x)', 'x');
    expect(need).toEqual({ kind: 'needs-values', missing: ['a'] });
    const r = solve('x = a\\cos(x)', 'x', { a: 1 });
    expect(r.kind).toBe('numeric');
    if (r.kind === 'numeric') expect(r.values[0]).toBeCloseTo(0.7390851332, 8);
    const r2 = solve('x^3 - 6x^2 + 11x - 6', 'x');
    expect(r2.kind).toBe('numeric');
    if (r2.kind === 'numeric') r2.values.forEach((v, i) => expect(v).toBeCloseTo(i + 1, 8));
  });
  it('rejects a variable that is not there', () => {
    expect(solve('a = b', 'z').kind).toBe('none');
  });
});

describe('integrate', () => {
  const I = (tex: string, x: string, a: number, b: number, env = {}) => integrate(parse(tex), x, a, b, env).value;
  it('matches known definite integrals', () => {
    expect(I('x^2', 'x', 0, 3)).toBeCloseTo(9, 9);
    expect(I(String.raw`\sin x`, 'x', 0, Math.PI)).toBeCloseTo(2, 9);
    expect(I(String.raw`\frac{1}{\sqrt{x}}`, 'x', 0, 1)).toBeCloseTo(2, 6);
    expect(I(String.raw`e^{-x^2}`, 'x', -Infinity, Infinity)).toBeCloseTo(Math.sqrt(Math.PI), 8);
    expect(I(String.raw`\frac{1}{x^2}`, 'x', 1, Infinity)).toBeCloseTo(1, 8);
    expect(I('c x', 'x', 0, 2, { c: 3 })).toBeCloseTo(6, 9); // problem 22: work = q c d^2 / 2
    expect(I('x', 'x', 2, 0)).toBeCloseTo(-2, 9);
  });
});

describe('equivalent', () => {
  it('accepts algebraically equal forms', () => {
    expect(equivalent(String.raw`\frac{mv_0^2}{2qE}`, String.raw`\frac{m v_0^{2}}{2 E q}`).equal).toBe(true);
    expect(equivalent(String.raw`m v_0^2/2qE`, String.raw`\frac{mv_0^2}{2qE}`).equal).toBe(true);
    expect(equivalent(String.raw`RC\ln(10)`, String.raw`-RC\log(0.1)`).equal).toBe(true);
    expect(equivalent(String.raw`\frac{kq}{r^2}`, String.raw`\frac{q}{4\pi\epsilon_0 r^2}`).equal).toBe(true);
    expect(equivalent(String.raw`x = \frac{mv^2}{2qE}`, String.raw`\frac{mv^2}{2qE}`).equal).toBe(true);
    expect(equivalent(String.raw`e^{-6}`, String.raw`\exp(-6)`).equal).toBe(true);
    expect(equivalent(String.raw`\frac{2\sqrt2}{3}`, String.raw`\sqrt{\frac{8}{9}}`).equal).toBe(true);
    expect(equivalent(String.raw`(x+1)^2`, 'x^2+2x+1').equal).toBe(true);
  });
  it('rejects different answers and says how they differ', () => {
    expect(equivalent(String.raw`\frac{mv^2}{qE}`, String.raw`\frac{mv^2}{2qE}`)).toMatchObject({ equal: false, reason: 'factor', factor: 2 });
    expect(equivalent('-qbB', 'qbB')).toMatchObject({ equal: false, reason: 'sign' });
    expect(equivalent('-qbB', 'qbB', { allowSign: true }).equal).toBe(true);
    expect(equivalent('Ed', 'E').equal).toBe(false);
    expect(equivalent('Ed', 'E').extra).toEqual(['d']);
    expect(equivalent('E', 'Ed').missing).toEqual(['d']);
    expect(equivalent('x^2', 'x^3').reason).toBe('different');
    expect(equivalent('(x', 'x').reason).toBe('error');
  });
});

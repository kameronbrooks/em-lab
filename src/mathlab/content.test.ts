import { describe, expect, it } from 'vitest';
import { FORMULAS, getFormula } from '../content/formulas';
import { PROBLEMS } from '../content/problems';
import { VIDEOS } from '../content/videos';
import { checkAnswer } from './answers';
import { CONSTANTS, equivalent, parse, solveFor, toPrettyTex, toTex, variables } from './index';
import { evaluate } from './evaluate';
import { randomEnv } from './solve';

describe('problem set', () => {
  it('has all 65 problems in order', () => {
    expect(PROBLEMS.map((p) => p.n)).toEqual(Array.from({ length: 65 }, (_, i) => i + 1));
  });

  it('references real formulas and videos, and has hints and a solution', () => {
    for (const p of PROBLEMS) {
      for (const id of p.uses) expect(getFormula(id), `problem ${p.n} uses ${id}`).toBeTruthy();
      for (const v of p.videos) expect(v >= 1 && v <= VIDEOS.length, `problem ${p.n} video ${v}`).toBe(true);
      expect(p.hints.length, `problem ${p.n} hints`).toBeGreaterThanOrEqual(1);
      expect(p.solution.length, `problem ${p.n} solution`).toBeGreaterThanOrEqual(3);
      expect(p.videos.length, `problem ${p.n} videos`).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps dollar signs balanced in every text field', () => {
    for (const p of PROBLEMS) {
      const texts = [p.statement, p.answer, p.sheetAnswer ?? '', ...p.hints, ...p.solution, ...p.checks.map((c) => c.prompt)];
      for (const t of texts) expect((t.match(/\$/g) ?? []).length % 2, `problem ${p.n}: ${t.slice(0, 40)}`).toBe(0);
    }
  });

  const checks = PROBLEMS.flatMap((p) => p.checks.map((c, i) => ({ p, c, id: `problem ${p.n}${c.label ? ' ' + c.label : ''} #${i}` })));

  it('has a machine-checkable answer for every formula problem', () => {
    expect(checks.length).toBeGreaterThanOrEqual(45);
  });

  it.each(checks.map((k) => [k.id, k] as const))('%s: accepts itself and an equivalent form, rejects wrong answers', (_id, { c }) => {
    // the reference against itself
    expect(equivalent(c.expr, c.expr).equal).toBe(true);
    expect(checkAnswer(c.expr, c)).toEqual({ ok: true });
    // a hand-written equivalent form
    expect(c.alt).not.toBe(c.expr);
    expect(checkAnswer(c.alt, c), `alt form ${c.alt}`).toEqual({ ok: true });
    // typed as an equation
    expect(checkAnswer(`X = ${c.alt}`, c)).toEqual({ ok: true });
    // its own pretty-printed and raw LaTeX round trip
    expect(checkAnswer(toTex(parse(c.expr)), c)).toEqual({ ok: true });
    // wrong answers
    expect(checkAnswer(`2\\left(${c.expr}\\right) + 1`, c).ok).toBe(false);
    expect(checkAnswer(`\\left(${c.expr}\\right) + Z`, c).ok).toBe(false);
    const isZero = variables(parse(c.expr)).length === 0 && evaluate(parse(c.expr)) === 0;
    if (!isZero) {
      expect(checkAnswer(`3\\left(${c.expr}\\right)`, c)).toMatchObject({ ok: false, kind: 'factor' });
      expect(checkAnswer(`-\\left(${c.expr}\\right)`, c).ok).toBe(!!c.allowSign);
    }
    expect(checkAnswer('', c)).toMatchObject({ ok: false, kind: 'empty' });
    expect(checkAnswer('\\frac{1}{', c)).toMatchObject({ ok: false, kind: 'syntax' });
  });

  it('accepts aliases for symbols', () => {
    const p24 = PROBLEMS[23].checks[0];
    expect(checkAnswer(String.raw`\frac{w\mu_0 n I\pi a^2}{R}`, p24)).toEqual({ ok: true });
    const p19 = PROBLEMS[18].checks[0];
    expect(checkAnswer(String.raw`\sqrt{V_0^2+\frac{2q\phi}{m}}`, p19)).toEqual({ ok: true });
    const p20 = PROBLEMS[19].checks[0];
    expect(checkAnswer(String.raw`\frac{m v_*^2}{2qE}`, p20)).toEqual({ ok: true });
    const p43 = PROBLEMS[42].checks[0];
    expect(checkAnswer(String.raw`-RC\log(0.1)`, p43)).toEqual({ ok: true }); // the sheet's own form
    const p54 = PROBLEMS[53].checks[0];
    expect(checkAnswer(String.raw`\frac{2\cdot 2^{1/2}}{3}`, p54)).toEqual({ ok: true });
    expect(checkAnswer(String.raw`\frac{2\cdot 2^{1.2}}{3}`, p54).ok).toBe(false); // the sheet's typo is not accepted
  });

  it('gives useful feedback', () => {
    const p7 = PROBLEMS[6].checks[0];
    expect(checkAnswer(String.raw`\frac{m v_0^2}{qE}`, p7)).toMatchObject({ kind: 'factor' });
    const r = checkAnswer(String.raw`\frac{m v_0}{2qE}`, p7);
    expect(r.ok).toBe(false);
    const missing = checkAnswer(String.raw`\frac{m v_0^2}{2q}`, p7);
    expect(missing.ok === false && missing.message).toMatch(/depends on \$E\$/);
  });
});

describe('formula sheet', () => {
  it('has unique ids and 31 entries', () => {
    expect(new Set(FORMULAS.map((f) => f.id)).size).toBe(FORMULAS.length);
    expect(FORMULAS.length).toBe(31);
  });

  it('describes every variable its calculators use', () => {
    for (const f of FORMULAS) {
      const known = new Set(f.vars.map((v) => v.sym).filter(Boolean));
      for (const c of f.calcs) {
        const node = parse(c.tex);
        expect(node.t, `${f.id}: calculators are equations`).toBe('eq');
        for (const v of variables(node)) expect(known.has(v), `${f.id}: variable ${v} is not described`).toBe(true);
      }
    }
  });

  it('can solve every calculator form for every variable', () => {
    for (const f of FORMULAS) {
      for (const c of f.calcs) {
        const node = parse(c.tex);
        const names = variables(node);
        for (const x of names) {
          if (CONSTANTS[x]) continue;
          const others = names.filter((n) => n !== x);
          const r = solveFor(node, x);
          // every formula on the sheet can be rearranged exactly for each of its variables
          expect(r.kind, `${f.id} for ${x}: ${JSON.stringify(r).slice(0, 120)}`).toBe('exact');
          if (r.kind !== 'exact') continue;
          // and the rearrangement satisfies the original equation (for some random values:
          // inverse trig and square roots are only real / principal on part of the range)
          let ok = false;
          for (let i = 0; i < 400 && !ok; i++) {
            const env = randomEnv(others);
            if (i % 2 === 1) for (const n of others) env[n] = 0.05 + Math.random() * 0.9;
            ok = r.solutions.some((s) =>
              ([1, -1] as const).some((pm) => {
                const xv = evaluate(s, env, { pm, constants: false });
                if (!isFinite(xv)) return false;
                const res = evaluate(node, { ...env, [x]: xv }, { pm, constants: false });
                return Math.abs(res) < 1e-6 * (1 + Math.abs(xv));
              }),
            );
          }
          expect(ok, `${f.id} for ${x}: ${r.solutions.map((s) => toPrettyTex(s)).join(' ; ')}`).toBe(true);
        }
      }
    }
  });
});

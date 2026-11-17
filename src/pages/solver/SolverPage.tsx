import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../app/router';
import {
  CONSTANTS, Env, Node, derivative, evaluate, hasPm, integrate, numTex, simplify, solveFor, symTex, toPrettyTex, toTex, tryParse, variables,
} from '../../mathlab';
import { ceSimplify } from '../../mathlab/ce';
import { Tex } from '../../ui/controls';
import { FormulaSheet } from './FormulaSheet';
import { MathField } from './MathField';
import { parseNumber } from './numbers';
import './solver.css';

const r = String.raw;
const EXAMPLES: { label: string; tex: string }[] = [
  { label: 'Ohm’s law', tex: r`v=iR` },
  { label: 'RC decay', tex: r`q=q_0e^{-t/RC}` },
  { label: 'Coulomb force', tex: r`F=\frac{1}{4\pi\epsilon_0}\frac{q_1q_2}{r^2}` },
  { label: 'Energy balance', tex: r`\frac{1}{2}mv_0^2+q\phi=\frac{1}{2}mv^2` },
  { label: 'RLC roots', tex: r`a=-\frac{R}{2L}\pm\frac{1}{2}\sqrt{\left(\frac{R}{L}\right)^2-\frac{4}{LC}}` },
  { label: 'Quadratic', tex: r`x^2-5x+6=0` },
  { label: 'Expression', tex: r`\frac{x^2y}{xy^3}+\sqrt{\frac{4L}{C}}` },
];

function safe<T>(f: () => T): { value?: T; error?: string } {
  try {
    return { value: f() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function VarPicker({ names, value, onChange, label }: { names: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="var-picker" role="radiogroup" aria-label={label}>
      {names.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={n === value} className={n === value ? 'on' : ''} onClick={() => onChange(n)}>
          <Tex>{symTex(n)}</Tex>
        </button>
      ))}
    </div>
  );
}

export default function SolverPage() {
  const route = useRoute();
  const [latex, setLatex] = useState(() => route.query.expr ?? EXAMPLES[1].tex);
  const [values, setValues] = useState<Record<string, string>>({});
  const [solveVar, setSolveVar] = useState('');
  const [diffVar, setDiffVar] = useState('');
  const [intVar, setIntVar] = useState('');
  const [limits, setLimits] = useState({ a: '0', b: '1' });
  const [ceTex, setCeTex] = useState<string | null>(null);

  useEffect(() => {
    if (route.query.expr) setLatex(route.query.expr);
  }, [route.query.expr]);

  const parsed = useMemo(() => (latex.trim() ? tryParse(latex) : null), [latex]);
  const node: Node | undefined = parsed?.node;
  const names = useMemo(() => (node ? variables(node) : []), [node]);
  const isEquation = node?.t === 'eq';
  const pm = node ? hasPm(node) : false;

  // keep the chosen variables valid as the expression changes
  const defaultSolve = useMemo(() => {
    if (!node || !names.length) return '';
    if (node.t === 'eq' && node.l.t === 'sym') return names.find((n) => n !== (node.l as { name: string }).name && !CONSTANTS[n]) ?? names[0];
    return names.find((n) => !CONSTANTS[n]) ?? names[0];
  }, [node, names]);
  const sv = names.includes(solveVar) ? solveVar : defaultSolve;
  // sensible default for calculus: time or position if present, and never the left-hand symbol of "q = ..."
  const lhsName = node?.t === 'eq' && node.l.t === 'sym' ? node.l.name : '';
  const candidates = names.filter((n) => !CONSTANTS[n] && n !== lhsName);
  const firstVar = ['t', 'x', 'r'].find((n) => candidates.includes(n)) ?? candidates[0] ?? names[0] ?? '';
  const dv = names.includes(diffVar) ? diffVar : firstVar;
  const iv = names.includes(intVar) ? intVar : firstVar;

  const env: Env = {};
  const missing: string[] = [];
  for (const n of names) {
    const v = parseNumber(values[n]);
    if (v !== null) env[n] = v;
    else if (CONSTANTS[n]) env[n] = CONSTANTS[n].value;
    else missing.push(n);
  }

  const simplified = useMemo(() => (node ? safe(() => simplify(node)) : null), [node]);
  const simplifiedTex = simplified?.value ? toPrettyTex(simplified.value) : null;

  // second opinion from Compute Engine, loaded lazily and only shown when it differs
  useEffect(() => {
    setCeTex(null);
    if (!node || pm) return;
    let live = true;
    const id = window.setTimeout(() => {
      ceSimplify(node).then((out) => {
        if (!live || !out) return;
        // Only worth showing if it is a genuinely different arrangement (factored, cancelled, ...),
        // not the same thing with the factors in another order.
        const canonical = safe(() => toPrettyTex(simplify(out))).value ?? null;
        const mine = safe(() => toPrettyTex(simplify(node))).value ?? null;
        if (!canonical || canonical === mine) return;
        const shown = safe(() => toPrettyTex(out)).value ?? null;
        if (shown) setCeTex(shown);
      });
    }, 450);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [node, pm]);

  const open = (tex: string) => {
    setLatex(tex);
    setValues({});
    document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ----- numeric value -----
  let valueBlock: React.ReactNode = null;
  if (node && !parsed?.error) {
    if (missing.length) {
      valueBlock = <p className="muted">Enter a value for <Tex>{missing.map(symTex).join(',\\ ')}</Tex> to get a number.</p>;
    } else if (isEquation && node.t === 'eq') {
      const signs: (1 | -1)[] = pm ? [1, -1] : [1];
      valueBlock = (
        <>
          {signs.map((s) => {
            const l = safe(() => evaluate(node.l, env, { pm: s }));
            const rr = safe(() => evaluate(node.r, env, { pm: s }));
            if (l.value === undefined || rr.value === undefined) return <p key={s} className="calc-msg warn">{l.error ?? rr.error}</p>;
            const same = Math.abs(l.value - rr.value) <= 1e-9 * Math.max(Math.abs(l.value), Math.abs(rr.value), 1e-300);
            return (
              <div key={s} className="value-line">
                {pm && <span className="badge">{s === 1 ? '+' : '−'}</span>}
                <Tex>{`\\text{left} = ${numTex(l.value)},\\quad \\text{right} = ${numTex(rr.value)}`}</Tex>
                <span className={`badge ${same ? 'good' : 'warn'}`}>{same ? 'both sides agree' : 'sides differ'}</span>
              </div>
            );
          })}
        </>
      );
    } else {
      const signs: (1 | -1)[] = pm ? [1, -1] : [1];
      valueBlock = (
        <>
          {signs.map((s) => {
            const v = safe(() => evaluate(node, env, { pm: s }));
            return (
              <div key={s} className="value-line big">
                {pm && <span className="badge">{s === 1 ? '+' : '−'}</span>}
                {v.value !== undefined ? <Tex>{`= ${numTex(v.value, 8)}`}</Tex> : <span className="calc-msg warn">{v.error}</span>}
                {v.value !== undefined && isNaN(v.value) && <span className="muted"> (not a real number for these values)</span>}
              </div>
            );
          })}
        </>
      );
    }
  }

  // ----- solve -----
  let solveBlock: React.ReactNode = null;
  if (node && sv) {
    const res = safe(() => solveFor(node, sv, env));
    const sol = res.value;
    if (!sol) solveBlock = <p className="calc-msg warn">{res.error}</p>;
    else if (sol.kind === 'exact') {
      const others = names.filter((n) => n !== sv && env[n] === undefined);
      solveBlock = (
        <>
          {sol.solutions.map((s, i) => {
            const signs: (1 | -1)[] = hasPm(s) ? [1, -1] : [1];
            const nums = others.length ? [] : signs.map((sg) => safe(() => evaluate(s, env, { pm: sg })).value).filter((v): v is number => v !== undefined && isFinite(v));
            return (
              <div key={i} className="solution">
                <Tex block>{`${symTex(sv)} = ${toPrettyTex(s)}`}</Tex>
                {nums.length > 0 && <Tex>{`\\approx ${nums.map((v) => numTex(v)).join(',\\ ')}`}</Tex>}
              </div>
            );
          })}
          <p className="muted">
            <span className="badge good">exact</span>{' '}
            {sol.method === 'isolate' ? 'Rearranged by undoing each operation.' : sol.method === 'linear' ? 'Linear in this variable.' : 'From the quadratic formula.'}{' '}
            {sol.note}
            {others.length > 0 && ' Enter values above to get a number.'}
          </p>
        </>
      );
    } else if (sol.kind === 'numeric') {
      solveBlock = (
        <>
          <div className="solution">
            <Tex block>{`${symTex(sv)} \\approx ${sol.values.map((v) => numTex(v, 8)).join(',\\quad ')}`}</Tex>
          </div>
          <p className="muted">
            <span className="badge">numeric</span> No exact rearrangement was found, so this was solved numerically for the values above. {sol.note}
          </p>
        </>
      );
    } else if (sol.kind === 'needs-values') {
      solveBlock = (
        <p className="muted">
          No exact rearrangement was found for <Tex>{symTex(sv)}</Tex>. Enter values for <Tex>{sol.missing.map(symTex).join(',\\ ')}</Tex> above and
          it will be solved numerically.
        </p>
      );
    } else solveBlock = <p className="calc-msg warn">{sol.reason}</p>;
  }

  // ----- derivative -----
  // "q = f(t)" differentiates to dq/dt = f'(t); any other equation has both sides differentiated.
  const namedLhs = node?.t === 'eq' && node.l.t === 'sym' && node.l.name !== dv && !variables(node.r).includes(node.l.name) ? node.l.name : '';
  const deriv = node && dv ? safe(() => derivative(namedLhs && node.t === 'eq' ? node.r : node, dv)) : null;

  // ----- integral -----
  let integralBlock: React.ReactNode = null;
  if (node && !isEquation && iv) {
    const a = parseNumber(limits.a), b = parseNumber(limits.b);
    const need = names.filter((n) => n !== iv && env[n] === undefined);
    if (a === null || b === null) integralBlock = <p className="calc-msg warn">The limits must be numbers (for example 0, 2.5, pi, inf).</p>;
    else if (need.length) integralBlock = <p className="muted">Enter a value for <Tex>{need.map(symTex).join(',\\ ')}</Tex> above to integrate.</p>;
    else {
      const res = safe(() => integrate(node, iv, a, b, env));
      integralBlock = res.value ? (
        <>
          <Tex block>{`\\int_{${numTex(a)}}^{${numTex(b)}} ${toTex(node)}\\,d${symTex(iv)} \\approx ${numTex(res.value.value, 8)}`}</Tex>
          {!res.value.converged && <p className="calc-msg warn">This estimate did not settle. The integrand may blow up or oscillate too fast in this range.</p>}
          {!isFinite(res.value.value) && <p className="calc-msg warn">The integral does not have a finite value on this range.</p>}
        </>
      ) : (
        <p className="calc-msg warn">{res.error}</p>
      );
    }
  }

  return (
    <div className="page solver">
      <h1>Solver &amp; formula sheet</h1>
      <p className="page-lead">
        Type any formula the way you would write it. Letters are treated as physics variables: <Tex>{'i'}</Tex> is a current,{' '}
        <Tex>{'E'}</Tex> is a field, and <Tex>{'q_0'}</Tex> is one symbol. Add an equals sign to solve for a variable.
      </p>

      <div className="box solver-input">
        <MathField value={latex} onChange={setLatex} label="Expression or equation" placeholder={r`\text{Type an expression or equation}`} autoFocus />
        <div className="examples">
          <span className="muted">Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e.label} type="button" className="chip" onClick={() => open(e.tex)}>
              {e.label}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => open('')}>Clear</button>
        </div>
        {parsed?.error && <p className="calc-msg warn" role="status">{parsed.error}</p>}
        {node && (
          <div className="read-as">
            <span className="muted">Read as</span>
            <Tex>{safe(() => toTex(node)).value ?? ''}</Tex>
          </div>
        )}
        <p className="fineprint">
          A slash divides by everything written right after it, the way formulas are written by hand: <Tex>{'R/2L'}</Tex> means{' '}
          <Tex>{r`\frac{R}{2L}`}</Tex>. Use the fraction key or brackets if you mean something else. <Tex>{r`\log`}</Tex> is the natural log, as
          in the course. Type Greek letters by name (omega, epsilon, mu, pi) and subscripts with an underscore.
        </p>
      </div>

      {node && (
        <div className="result-grid">
          <section className="box result">
            <h3>Simplified</h3>
            {simplifiedTex ? <Tex block>{simplifiedTex}</Tex> : <p className="calc-msg warn">{simplified?.error}</p>}
            {ceTex && simplifiedTex && ceTex !== simplifiedTex && (
              <div className="alt-form">
                <span className="muted">Another form</span>
                <Tex block>{ceTex}</Tex>
              </div>
            )}
            <p className="fineprint">Variables are assumed positive, so <Tex>{r`\sqrt{x^2}`}</Tex> becomes <Tex>{'x'}</Tex>.</p>
          </section>

          <section className="box result">
            <h3>Numbers</h3>
            {names.length > 0 ? (
              <div className="var-inputs">
                {names.map((n) => (
                  <label key={n} className="var-input">
                    <span><Tex>{symTex(n)}</Tex> =</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={values[n] ?? ''}
                      placeholder={CONSTANTS[n] ? `${CONSTANTS[n].value.toPrecision(4)} (${CONSTANTS[n].label})` : 'value'}
                      aria-label={`Value of ${n}`}
                      onChange={(e) => setValues({ ...values, [n]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted">No variables: this is a plain number.</p>
            )}
            {valueBlock}
          </section>

          {names.length > 0 && (
            <section className="box result">
              <h3>{isEquation ? 'Solve for' : 'Solve “expression = 0” for'}</h3>
              <VarPicker names={names} value={sv} onChange={setSolveVar} label="Variable to solve for" />
              {solveBlock}
            </section>
          )}

          {names.length > 0 && (
            <section className="box result">
              <h3>Derivative with respect to</h3>
              <VarPicker names={names} value={dv} onChange={setDiffVar} label="Differentiate with respect to" />
              {deriv?.value ? (
                namedLhs ? (
                  <Tex block>{`\\frac{d${symTex(namedLhs)}}{d${symTex(dv)}} = ${toPrettyTex(deriv.value)}`}</Tex>
                ) : isEquation ? (
                  <Tex block>{toPrettyTex(deriv.value)}</Tex>
                ) : (
                  <Tex block>{`\\frac{d}{d${symTex(dv)}}\\left[${toTex(node)}\\right] = ${toPrettyTex(deriv.value)}`}</Tex>
                )
              ) : (
                <p className="calc-msg warn">{deriv?.error}</p>
              )}
              {isEquation && !namedLhs && <p className="fineprint">Both sides were differentiated.</p>}
            </section>
          )}

          {names.length > 0 && !isEquation && (
            <section className="box result">
              <h3>Definite integral over</h3>
              <VarPicker names={names} value={iv} onChange={setIntVar} label="Integrate over" />
              <div className="limits">
                <label>from <input type="text" value={limits.a} aria-label="Lower limit" onChange={(e) => setLimits({ ...limits, a: e.target.value })} /></label>
                <label>to <input type="text" value={limits.b} aria-label="Upper limit" onChange={(e) => setLimits({ ...limits, b: e.target.value })} /></label>
              </div>
              {integralBlock}
              <p className="fineprint">
                <span className="badge">numeric</span> Integrals are worked out numerically. You get a number, not a formula. Limits can be
                numbers, pi, or inf.
              </p>
            </section>
          )}
        </div>
      )}

      <h2 className="sheet-title">Formula sheet</h2>
      <p className="page-lead">
        Every formula from the course sheet, written the way the sheet writes it. Open one to see what each symbol means and to solve it for
        any variable.
      </p>
      <FormulaSheet onOpenInSolver={open} />
    </div>
  );
}

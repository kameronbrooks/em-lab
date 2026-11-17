import { useMemo, useState } from 'react';
import { FORMULAS, Formula, FormulaGroup, GROUP_TITLES } from '../../content/formulas';
import { CONSTANTS, Env, evaluate, hasPm, numTex, parse, solveFor, symTex, toPrettyTex, variables } from '../../mathlab';
import { Tex } from '../../ui/controls';
import { parseNumber } from './numbers';

const GROUPS: FormulaGroup[] = ['electrostatics', 'magnetism', 'induction', 'circuits', 'waves'];

/** Real, finite, distinct values. */
function distinct(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (!isFinite(v)) continue;
    if (!out.some((q) => Math.abs(q - v) <= 1e-9 * Math.max(1e-300, Math.abs(q), Math.abs(v)))) out.push(v);
  }
  return out;
}

function Calculator({ formula, onOpen }: { formula: Formula; onOpen: (tex: string) => void }) {
  const [which, setWhich] = useState(0);
  const [vals, setVals] = useState<Record<string, string>>({});
  const calc = formula.calcs[Math.min(which, formula.calcs.length - 1)];
  const node = useMemo(() => parse(calc.tex), [calc.tex]);
  const names = useMemo(() => variables(node), [node]);
  const info = (name: string) => formula.vars.find((v) => v.sym === name);

  const blanks = names.filter((n) => !(vals[n] ?? '').trim() && !CONSTANTS[n]);
  const bad = names.filter((n) => (vals[n] ?? '').trim() && parseNumber(vals[n]) === null);
  const env: Env = {};
  for (const n of names) {
    const v = parseNumber(vals[n]);
    if (v !== null) env[n] = v;
    else if (CONSTANTS[n]) env[n] = CONSTANTS[n].value;
  }

  let result: React.ReactNode;
  if (bad.length) {
    result = <p className="calc-msg warn">Could not read the value for <Tex>{bad.map(symTex).join(',\\ ')}</Tex>. Use numbers like 12, 1.6e-19 or 3*10^8.</p>;
  } else if (blanks.length === 1) {
    const x = blanks[0];
    const r = solveFor(node, x, env);
    const unit = info(x)?.unit;
    if (r.kind === 'exact') {
      const pms: (1 | -1)[] = r.solutions.some(hasPm) ? [1, -1] : [1];
      const values = distinct(
        r.solutions.flatMap((s) =>
          pms.map((pm) => {
            try {
              return evaluate(s, env, { pm });
            } catch {
              return NaN;
            }
          }),
        ),
      );
      result = (
        <div className="calc-result">
          <div className="calc-rearranged">
            {r.solutions.map((s, i) => (
              <Tex key={i} block>{`${symTex(x)} = ${toPrettyTex(s)}`}</Tex>
            ))}
          </div>
          {values.length ? (
            <div className="calc-value">
              <Tex>{`${symTex(x)} ${values.length > 1 ? '\\in \\{' : '='} ${values.map((v) => numTex(v, 5)).join(',\\ ')} ${values.length > 1 ? '\\}' : ''}`}</Tex>
              {unit && <span className="calc-unit">{unit}</span>}
            </div>
          ) : (
            <p className="calc-msg warn">No real value for these numbers.</p>
          )}
          {r.note && <p className="calc-msg">{r.note}</p>}
        </div>
      );
    } else if (r.kind === 'numeric') {
      result = (
        <div className="calc-result">
          <div className="calc-value">
            <Tex>{`${symTex(x)} \\approx ${r.values.map((v) => numTex(v, 5)).join(',\\ ')}`}</Tex>
            {unit && <span className="calc-unit">{unit}</span>}
            <span className="badge">numeric</span>
          </div>
        </div>
      );
    } else {
      result = <p className="calc-msg warn">{r.kind === 'none' ? r.reason : 'Fill in the other values first.'}</p>;
    }
  } else if (blanks.length === 0) {
    let left = NaN, right = NaN;
    if (node.t === 'eq') {
      try {
        left = evaluate(node.l, env);
        right = evaluate(node.r, env);
      } catch {
        /* shown as not matching */
      }
    }
    const match = isFinite(left) && isFinite(right) && Math.abs(left - right) <= 1e-6 * Math.max(Math.abs(left), Math.abs(right), 1e-300);
    result = match ? (
      <p className="calc-msg good">These values satisfy the formula. Clear one field to solve for it.</p>
    ) : (
      <p className="calc-msg warn">
        These values do not fit together: the left side is <Tex>{numTex(left, 5)}</Tex> and the right side is{' '}
        <Tex>{numTex(right, 5)}</Tex>. Clear one field to solve for it.
      </p>
    );
  } else {
    result = <p className="calc-msg">Fill in every field except one. The empty one is solved for.</p>;
  }

  return (
    <div className="calc">
      {formula.calcs.length > 1 && (
        <div className="segmented calc-forms">
          {formula.calcs.map((c, i) => (
            <button key={i} type="button" className={i === which ? 'on' : ''} onClick={() => { setWhich(i); setVals({}); }}>
              {c.label ?? `Form ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <Tex block>{calc.tex}</Tex>
      {calc.note && <p className="calc-note">{calc.note}</p>}
      <div className="calc-fields">
        {names.map((n) => {
          const v = info(n);
          const constant = CONSTANTS[n];
          return (
            <label key={n} className={`calc-field ${blanks.length === 1 && blanks[0] === n ? 'unknown' : ''}`}>
              <span className="calc-sym"><Tex>{v?.tex ?? symTex(n)}</Tex></span>
              <input
                type="text"
                inputMode="decimal"
                value={vals[n] ?? ''}
                placeholder={constant ? numPlain(constant.value) : blanks.length === 1 && blanks[0] === n ? 'solved' : ''}
                aria-label={v?.meaning ?? n}
                onChange={(e) => setVals({ ...vals, [n]: e.target.value })}
              />
              <span className="calc-unit">{v?.unit ?? ''}</span>
              <span className="calc-meaning">{v?.meaning ?? ''}</span>
            </label>
          );
        })}
      </div>
      {result}
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setVals({})}>Clear</button>
        <button type="button" className="btn" onClick={() => onOpen(calc.tex)}>Open in solver</button>
      </div>
    </div>
  );
}

function numPlain(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(4).replace(/\.?0+e/, 'e');
  return String(Number(v.toPrecision(6)));
}

/** The course formula sheet. Each card opens a calculator that solves the formula for any one variable. */
export function FormulaSheet({ onOpenInSolver }: { onOpenInSolver: (tex: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="formula-sheet">
      {GROUPS.map((g) => (
        <section key={g} className="formula-group">
          <h3>{GROUP_TITLES[g]}</h3>
          <div className="formula-grid">
            {FORMULAS.filter((f) => f.group === g).map((f) => {
              const isOpen = open === f.id;
              return (
                <div key={f.id} id={`formula-${f.id}`} className={`formula-card ${isOpen ? 'open' : ''}`}>
                  <button type="button" className="formula-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : f.id)}>
                    <span className="formula-name">{f.name}</span>
                    <Tex block>{f.tex}</Tex>
                    <span className="formula-meaning">{f.meaning}</span>
                    <span className="formula-toggle">{isOpen ? 'Close' : f.calcs.length ? 'Open calculator' : 'Show symbols'}</span>
                  </button>
                  {isOpen && (
                    <div className="formula-body">
                      <table className="formula-vars">
                        <tbody>
                          {f.vars.map((v, i) => (
                            <tr key={i}>
                              <td><Tex>{v.tex ?? symTex(v.sym ?? '')}</Tex></td>
                              <td>{v.meaning}</td>
                              <td className="muted">{v.unit ?? ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {f.calcs.length > 0 ? (
                        <Calculator formula={f} onOpen={onOpenInSolver} />
                      ) : (
                        <p className="calc-msg">This one is a statement about directions or totals, so there is nothing to plug numbers into.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

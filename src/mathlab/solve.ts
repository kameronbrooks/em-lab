// Solve an equation for one variable: exactly where possible, numerically otherwise.

import { CONSTANTS, E, Node, add, contains, countOccurrences, div, fn, hasPm, mul, neg, num, pow, sub, substitute, sym, variables } from './ast';
import { Env, evaluate } from './evaluate';
import { expand, isZero, simplify } from './simplify';

export type SolveResult =
  | { kind: 'exact'; solutions: Node[]; method: 'isolate' | 'linear' | 'quadratic'; note?: string }
  | { kind: 'numeric'; values: number[]; note?: string }
  | { kind: 'needs-values'; missing: string[] }
  | { kind: 'none'; reason: string };

function residual(equation: Node): Node {
  return equation.t === 'eq' ? sub(equation.l, equation.r) : equation;
}

/** Random positive test values for every variable in the given expressions. */
export function randomEnv(names: string[], rng: () => number = Math.random): Env {
  const env: Env = {};
  for (const n of names) env[n] = 0.6 + rng() * 1.9;
  return env;
}

/** Does `solution` satisfy the equation at random values of the other variables? */
export function verify(equation: Node, x: string, solution: Node): boolean {
  const f = residual(equation);
  const names = [...new Set([...variables(f), ...variables(solution)])].filter((n) => n !== x);
  const pms: (1 | -1)[] = hasPm(solution) || hasPm(f) ? [1, -1] : [1];
  let ok = 0, bad = 0;
  for (let i = 0; i < 160; i++) {
    if (ok >= 3 && i >= 12) break;
    // alternate between values around 1-2 and small values, so inverse trig functions get valid inputs
    const env = randomEnv(names);
    if (i % 2 === 1) for (const n of names) env[n] = 0.05 + Math.random() * 0.9;
    for (const pm of pms) {
      let xv: number;
      try {
        xv = evaluate(solution, env, { pm, constants: false });
      } catch {
        return false;
      }
      if (xv === Infinity || xv === -Infinity) return false;
      if (isNaN(xv)) continue;
      const full = { ...env, [x]: xv };
      let r: number, scale: number;
      try {
        r = evaluate(f, full, { pm, constants: false });
        scale = equation.t === 'eq'
          ? Math.abs(evaluate(equation.l, full, { pm, constants: false })) + Math.abs(evaluate(equation.r, full, { pm, constants: false }))
          : 1;
      } catch {
        return false;
      }
      if (!isFinite(r)) continue;
      if (Math.abs(r) > 1e-7 * Math.max(1, scale)) bad++;
      else ok++;
    }
  }
  // A wrong solution essentially never satisfies the equation at random points. A right one can
  // still miss on some of them when it involves an inverse function (principal branch only),
  // and may not be real at all for positive test values (square root of a negative number).
  if (ok + bad === 0) return true;
  return ok >= 1;
}

/** Peel operations off the side containing x until x stands alone. Returns null if it gets stuck. */
function isolate(left: Node, right: Node, x: string): { solutions: Node[]; note?: string } | null {
  let L = left;
  let rs: Node[] = [right];
  let note: string | undefined;
  for (let guard = 0; guard < 200; guard++) {
    if (L.t === 'sym') return L.name === x ? { solutions: rs, note } : null;
    switch (L.t) {
      case 'neg':
        rs = rs.map((r) => neg(r));
        L = L.x;
        break;
      case 'add': {
        const i = L.a.findIndex((k) => contains(k, x));
        const others = L.a.filter((_, j) => j !== i);
        rs = rs.map((r) => sub(r, add(...others)));
        L = L.a[i];
        break;
      }
      case 'mul': {
        const i = L.a.findIndex((k) => contains(k, x));
        const others = L.a.filter((_, j) => j !== i);
        rs = rs.map((r) => div(r, mul(...others)));
        L = L.a[i];
        break;
      }
      case 'div': {
        const n = L.n, d = L.d;
        if (contains(n, x)) {
          rs = rs.map((r) => mul(r, d));
          L = n;
        } else {
          rs = rs.map((r) => div(n, r));
          L = d;
        }
        break;
      }
      case 'pow': {
        const b = L.b, e = L.e;
        if (contains(b, x)) {
          let even = false;
          try {
            const ev = evaluate(e, {}, { constants: false });
            even = Number.isInteger(ev) && ev % 2 === 0;
          } catch {
            /* symbolic exponent */
          }
          const root = (r: Node) => pow(r, div(num(1), e));
          rs = even ? rs.flatMap((r) => [root(r), neg(root(r))]) : rs.map(root);
          L = b;
        } else {
          const isE = b.t === 'const' && b.name === 'e';
          rs = rs.map((r) => (isE ? fn('ln', r) : div(fn('ln', r), fn('ln', b))));
          L = e;
        }
        break;
      }
      case 'fn': {
        const u = L.args[0];
        const name = L.name;
        const principal = () => {
          note = 'Principal value shown. Other angles that differ by a full period also work.';
        };
        switch (name) {
          case 'sin': rs = rs.map((r) => fn('asin', r)); principal(); break;
          case 'cos': rs = rs.map((r) => fn('acos', r)); principal(); break;
          case 'tan': rs = rs.map((r) => fn('atan', r)); principal(); break;
          case 'sec': rs = rs.map((r) => fn('acos', div(num(1), r))); principal(); break;
          case 'csc': rs = rs.map((r) => fn('asin', div(num(1), r))); principal(); break;
          case 'cot': rs = rs.map((r) => fn('atan', div(num(1), r))); principal(); break;
          case 'asin': rs = rs.map((r) => fn('sin', r)); break;
          case 'acos': rs = rs.map((r) => fn('cos', r)); break;
          case 'atan': rs = rs.map((r) => fn('tan', r)); break;
          case 'exp': rs = rs.map((r) => fn('ln', r)); break;
          case 'ln': rs = rs.map((r) => pow(E, r)); break;
          case 'log10': rs = rs.map((r) => pow(num(10), r)); break;
          case 'sqrt': rs = rs.map((r) => pow(r, num(2))); break;
          case 'abs': rs = rs.flatMap((r) => [r, neg(r)]); break;
          default: return null;
        }
        L = u;
        break;
      }
      case 'pm': {
        if (!L.l || contains(L.r, x)) return null;
        const pmNode = L;
        rs = rs.map((r) => ({ t: 'pm', l: r, r: pmNode.r, minus: !pmNode.minus }) as Node);
        L = L.l;
        break;
      }
      default:
        return null;
    }
  }
  return null;
}

/** Numeric degree test: 1 = linear in x, 2 = quadratic, 0 = neither (or could not tell). */
export function degreeIn(f: Node, x: string): 0 | 1 | 2 {
  const names = variables(f).filter((n) => n !== x);
  let linear = true, quadratic = true, samples = 0;
  for (let i = 0; i < 8; i++) {
    const env = randomEnv(names);
    const x0 = 0.7 + Math.random() * 1.5, h = 0.11;
    const at = (v: number) => evaluate(f, { ...env, [x]: v }, { constants: false });
    let v: number[];
    try {
      v = [at(x0 - h), at(x0), at(x0 + h), at(x0 + 2 * h)];
    } catch {
      return 0;
    }
    if (v.some((k) => !isFinite(k))) continue;
    samples++;
    const scale = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) + Math.abs(v[3]) + 1e-300;
    if (Math.abs(v[0] - 2 * v[1] + v[2]) > 1e-9 * scale) linear = false;
    if (Math.abs(v[3] - 3 * v[2] + 3 * v[1] - v[0]) > 1e-8 * scale) quadratic = false;
  }
  if (samples < 3) return 0;
  return linear ? 1 : quadratic ? 2 : 0;
}

/** The equation as an expression f = 0 without any ±, or null if the ± cannot be removed. */
export function withoutPm(equation: Node): Node | null {
  const f = residual(equation);
  if (!hasPm(f)) return f;
  if (equation.t !== 'eq') return null;
  const [side, other] = equation.r.t === 'pm' ? [equation.r, equation.l] : equation.l.t === 'pm' ? [equation.l, equation.r] : [null, null];
  if (!side || side.t !== 'pm' || hasPm(other) || hasPm(side.r) || (side.l && hasPm(side.l))) return null;
  const P = side.l ?? num(0);
  // simplify so that (sqrt(X))^2 becomes X and stays real when X is negative
  return simplify(sub(pow(sub(other, P), num(2)), pow(side.r, num(2))));
}

/** Exact roots when f is linear or quadratic in x (checked numerically, built symbolically). */
export function polySolve(f: Node, x: string): { solutions: Node[]; method: 'linear' | 'quadratic' } | null {
  const deg = degreeIn(f, x);
  if (deg !== 1 && deg !== 2) return null;
  const f0 = substitute(f, x, num(0));
  const f1 = substitute(f, x, num(1));
  if (deg === 1) {
    const A = expand(sub(f1, f0));
    if (isZero(A)) return null;
    return { solutions: [simplify(div(neg(expand(f0)), A))], method: 'linear' };
  }
  const fm = substitute(f, x, num(-1));
  const C = expand(f0);
  const A = expand(div(sub(add(f1, fm), mul(num(2), f0)), num(2)));
  const B = expand(div(sub(f1, fm), num(2)));
  if (isZero(A)) return null;
  if (isZero(B)) {
    const root = simplify(pow(div(neg(C), A), num(0.5)));
    return { solutions: [root, simplify(neg(root))], method: 'quadratic' };
  }
  const disc = fn('sqrt', expand(sub(pow(B, num(2)), mul(num(4), A, C))));
  return {
    solutions: [simplify(div(add(neg(B), disc), mul(num(2), A))), simplify(div(sub(neg(B), disc), mul(num(2), A)))],
    method: 'quadratic',
  };
}

/** Find real roots of g on a wide logarithmic + linear grid, refined by bisection. */
export function findRoots(g: (x: number) => number, max = 8): number[] {
  const xs: number[] = [];
  for (let k = 14; k >= -14; k -= 0.04) xs.push(-Math.pow(10, k));
  xs.push(0);
  for (let k = -14; k <= 14; k += 0.04) xs.push(Math.pow(10, k));
  for (let v = -20; v <= 20; v += 0.037) xs.push(v);
  xs.sort((a, b) => a - b);
  const roots: number[] = [];
  const addRoot = (r: number) => {
    if (!roots.some((q) => Math.abs(q - r) <= 1e-7 * Math.max(1e-12, Math.abs(q), Math.abs(r)))) roots.push(r);
  };
  let px = xs[0], pv = g(px);
  for (let i = 1; i < xs.length; i++) {
    const cx = xs[i];
    if (cx === px) continue;
    const cv = g(cx);
    if (isFinite(pv) && isFinite(cv)) {
      if (pv === 0) addRoot(px);
      else if (pv * cv < 0) {
        let a = px, b = cx, fa = pv, fb = cv;
        for (let it = 0; it < 200 && Math.abs(b - a) > 1e-15 * Math.max(1e-300, Math.abs(a) + Math.abs(b)); it++) {
          const m = (a + b) / 2;
          const fm = g(m);
          if (!isFinite(fm)) break;
          if (fa * fm <= 0) {
            b = m;
            fb = fm;
          } else {
            a = m;
            fa = fm;
          }
        }
        const r = Math.abs(fa) < Math.abs(fb) ? a : b;
        // reject sign changes across a pole: the function must actually get small
        if (Math.abs(g(r)) <= 1e-6 * (Math.abs(pv) + Math.abs(cv))) addRoot(r);
      }
    }
    px = cx;
    pv = cv;
  }
  roots.sort((a, b) => a - b);
  return roots.slice(0, max);
}

/**
 * Solve `equation` for `x`. An expression without "=" is solved as expression = 0.
 * `env` supplies numbers for the other variables; it is only needed when no exact solution exists.
 */
export function solveFor(equation: Node, x: string, env: Env = {}): SolveResult {
  const f = residual(equation);
  if (!contains(f, x)) return { kind: 'none', reason: `The equation does not contain that variable.` };

  // 1. x appears once: undo the operations around it
  if (countOccurrences(f, x) === 1) {
    const [l, r] = equation.t === 'eq' ? (contains(equation.l, x) ? [equation.l, equation.r] : [equation.r, equation.l]) : [f, num(0)];
    const iso = isolate(l, r, x);
    if (iso) {
      const solutions = iso.solutions.map(simplify).filter((s) => verify(equation, x, s));
      if (solutions.length) {
        const note = iso.solutions.length > 1 && !iso.note ? 'Both signs solve the equation. A physical quantity that must be positive takes the positive one.' : iso.note;
        return { kind: 'exact', solutions: dedupe(solutions), method: 'isolate', note };
      }
    }
  }

  // 2. linear or quadratic in x, or in 1/x. An equation of the form  lhs = P ± Q  is squared first
  //    to remove the ±:  (lhs − P)² = Q².
  const g = withoutPm(equation);
  if (g) {
    const attempts: { poly: Node; back: (s: Node) => Node }[] = [
      { poly: g, back: (s) => s },
      { poly: substitute(g, x, div(num(1), sym(x))), back: (s) => simplify(div(num(1), s)) },
    ];
    for (const { poly, back } of attempts) {
      let found: { solutions: Node[]; method: 'linear' | 'quadratic' } | null = null;
      try {
        found = polySolve(poly, x);
      } catch {
        found = null;
      }
      if (!found) continue;
      const solutions = found.solutions.map(back).filter((s) => verify(equation, x, s));
      if (solutions.length) return { kind: 'exact', solutions: dedupe(solutions), method: found.method };
    }
  }

  // 3. numeric
  const others = variables(f).filter((n) => n !== x);
  const missing = others.filter((n) => env[n] === undefined && !CONSTANTS[n]);
  if (missing.length) return { kind: 'needs-values', missing };
  const values: number[] = [];
  for (const pm of (hasPm(f) ? [1, -1] : [1]) as (1 | -1)[]) {
    const local: Env = { ...env };
    const g = (v: number) => {
      local[x] = v;
      try {
        return evaluate(f, local, { pm });
      } catch {
        return NaN;
      }
    };
    for (const r of findRoots(g)) if (!values.some((q) => Math.abs(q - r) <= 1e-7 * Math.max(1e-12, Math.abs(q)))) values.push(r);
  }
  values.sort((a, b) => a - b);
  if (!values.length) return { kind: 'none', reason: 'No real solution was found for these values.' };
  return { kind: 'numeric', values, note: values.length >= 8 ? 'Showing the first 8 solutions found.' : undefined };
}

function dedupe(nodes: Node[]): Node[] {
  const seen = new Set<string>();
  const out: Node[] = [];
  for (const n of nodes) {
    const k = JSON.stringify(n);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

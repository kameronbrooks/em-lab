import { MathError, Node, add, contains, div, fn, mul, neg, num, pow, sub } from './ast';
import { Env, EvalOpts, compile1 } from './evaluate';
import { simplify } from './simplify';

function d(n: Node, x: string): Node {
  if (!contains(n, x)) return num(0);
  switch (n.t) {
    case 'num':
    case 'const':
      return num(0);
    case 'sym':
      return num(n.name === x ? 1 : 0);
    case 'add':
      return add(...n.a.map((k) => d(k, x)));
    case 'neg':
      return neg(d(n.x, x));
    case 'mul': {
      const terms: Node[] = [];
      n.a.forEach((f, i) => {
        if (!contains(f, x)) return;
        terms.push(mul(d(f, x), ...n.a.filter((_, j) => j !== i)));
      });
      return add(...terms);
    }
    case 'div':
      return div(sub(mul(d(n.n, x), n.d), mul(n.n, d(n.d, x))), pow(n.d, num(2)));
    case 'pow': {
      const inBase = contains(n.b, x), inExp = contains(n.e, x);
      if (inBase && !inExp) return mul(n.e, pow(n.b, sub(n.e, num(1))), d(n.b, x));
      if (!inBase && inExp) {
        const lnb: Node = n.b.t === 'const' && n.b.name === 'e' ? num(1) : fn('ln', n.b);
        return mul(n, lnb, d(n.e, x));
      }
      return mul(n, add(mul(d(n.e, x), fn('ln', n.b)), div(mul(n.e, d(n.b, x)), n.b)));
    }
    case 'fn': {
      const u = n.args[0];
      const du = d(u, x);
      const outer = ((): Node => {
        switch (n.name) {
          case 'sin': return fn('cos', u);
          case 'cos': return neg(fn('sin', u));
          case 'tan': return pow(fn('cos', u), num(-2));
          case 'sec': return mul(fn('sec', u), fn('tan', u));
          case 'csc': return neg(mul(fn('csc', u), fn('cot', u)));
          case 'cot': return neg(pow(fn('sin', u), num(-2)));
          case 'asin': return pow(sub(num(1), pow(u, num(2))), num(-0.5));
          case 'acos': return neg(pow(sub(num(1), pow(u, num(2))), num(-0.5)));
          case 'atan': return div(num(1), add(num(1), pow(u, num(2))));
          case 'sinh': return fn('cosh', u);
          case 'cosh': return fn('sinh', u);
          case 'tanh': return pow(fn('cosh', u), num(-2));
          case 'exp': return fn('exp', u);
          case 'ln': return div(num(1), u);
          case 'log10': return div(num(1), mul(u, fn('ln', num(10))));
          case 'sqrt': return div(num(1), mul(num(2), fn('sqrt', u)));
          case 'abs': return div(u, fn('abs', u));
        }
      })();
      return mul(outer, du);
    }
    case 'pm':
      return { t: 'pm', l: n.l ? d(n.l, x) : null, r: d(n.r, x), minus: n.minus };
    case 'eq':
      return { t: 'eq', l: d(n.l, x), r: d(n.r, x) };
  }
}

/** Symbolic derivative with respect to `x`, simplified. For an equation, both sides are differentiated. */
export function derivative(n: Node, x: string): Node {
  return simplify(d(n, x));
}

export interface IntegralResult {
  value: number;
  /** Rough estimate of the absolute error. */
  error: number;
  /** False if the estimate did not settle (singular or oscillatory integrand). */
  converged: boolean;
}

/**
 * Numeric definite integral by tanh-sinh quadrature, which copes with endpoint singularities.
 * Infinite limits are mapped onto a finite interval first.
 */
export function integrate(n: Node, x: string, a: number, b: number, env: Env = {}, opts: EvalOpts = {}): IntegralResult {
  if (n.t === 'eq') throw new MathError('Integrate an expression, not an equation.', 'unsupported');
  if (isNaN(a) || isNaN(b)) throw new MathError('The limits must be numbers.', 'domain');
  if (a === b) return { value: 0, error: 0, converged: true };
  if (a > b) {
    const r = integrate(n, x, b, a, env, opts);
    return { ...r, value: -r.value };
  }
  const f0 = compile1(n, x, env, opts);
  let f = f0;
  let lo = a, hi = b;
  // map infinite ranges to finite ones
  if (!isFinite(a) && !isFinite(b)) {
    // x = t / (1 - t^2), t in (-1, 1)
    f = (t) => {
      const den = 1 - t * t;
      return f0(t / den) * ((1 + t * t) / (den * den));
    };
    lo = -1;
    hi = 1;
  } else if (!isFinite(b)) {
    // x = a + t / (1 - t), t in [0, 1)
    f = (t) => f0(a + t / (1 - t)) / ((1 - t) * (1 - t));
    lo = 0;
    hi = 1;
  } else if (!isFinite(a)) {
    f = (t) => f0(b - t / (1 - t)) / ((1 - t) * (1 - t));
    lo = 0;
    hi = 1;
  }
  const c = (lo + hi) / 2, h2 = (hi - lo) / 2;
  const g = (t: number): number => {
    const s = (Math.PI / 2) * Math.sinh(t);
    const xk = Math.tanh(s);
    const w = ((Math.PI / 2) * Math.cosh(t)) / (Math.cosh(s) * Math.cosh(s));
    const v = f(c + h2 * xk) * w;
    return isFinite(v) ? v : 0;
  };
  let h = 1;
  let sum = g(0);
  for (let k = 1; k <= 4; k++) sum += g(k * h) + g(-k * h);
  let prev = sum * h;
  let value = prev, error = Infinity, converged = false;
  for (let level = 1; level <= 9; level++) {
    h /= 2;
    let extra = 0;
    const count = Math.round(4 / h);
    for (let k = 1; k <= count; k += 2) extra += g(k * h) + g(-k * h);
    sum += extra;
    value = sum * h;
    error = Math.abs(value - prev);
    if (error <= 1e-11 * Math.max(1, Math.abs(value))) {
      converged = true;
      break;
    }
    prev = value;
  }
  return { value: value * h2, error: error * h2, converged };
}

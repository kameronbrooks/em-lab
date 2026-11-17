import { CONSTANTS, FnName, MathError, Node } from './ast';

export type Env = Record<string, number>;

export function applyFn(name: FnName, x: number): number {
  switch (name) {
    case 'sin': return Math.sin(x);
    case 'cos': return Math.cos(x);
    case 'tan': return Math.tan(x);
    case 'sec': return 1 / Math.cos(x);
    case 'csc': return 1 / Math.sin(x);
    case 'cot': return 1 / Math.tan(x);
    case 'asin': return Math.asin(x);
    case 'acos': return Math.acos(x);
    case 'atan': return Math.atan(x);
    case 'sinh': return Math.sinh(x);
    case 'cosh': return Math.cosh(x);
    case 'tanh': return Math.tanh(x);
    case 'exp': return Math.exp(x);
    case 'ln': return Math.log(x);
    case 'log10': return Math.log10(x);
    case 'sqrt': return Math.sqrt(x);
    case 'abs': return Math.abs(x);
  }
}

/** Real power: negative bases are allowed for integer and odd-root exponents. */
export function realPow(b: number, e: number): number {
  if (b >= 0 || Number.isInteger(e)) return Math.pow(b, e);
  const inv = 1 / e;
  if (Math.abs(inv - Math.round(inv)) < 1e-12 && Math.abs(Math.round(inv)) % 2 === 1) return -Math.pow(-b, e);
  return NaN;
}

export interface EvalOpts {
  /** Sign used for ± (and its opposite for ∓). Default +1. */
  pm?: 1 | -1;
  /** Use built-in values for ε₀, μ₀, c, k when the environment does not define them. Default true. */
  constants?: boolean;
}

/**
 * Numeric value of an expression. Variables come from `env`; physical constants fall back to
 * their SI values. An equation evaluates to left − right. Throws MathError('missing') if a
 * variable has no value.
 */
export function evaluate(n: Node, env: Env = {}, opts: EvalOpts = {}): number {
  const pm = opts.pm ?? 1;
  const useConst = opts.constants !== false;
  const ev = (k: Node): number => {
    switch (k.t) {
      case 'num':
        return k.v;
      case 'const':
        return k.name === 'pi' ? Math.PI : k.name === 'e' ? Math.E : Infinity;
      case 'sym': {
        const v = env[k.name];
        if (v !== undefined) return v;
        if (useConst && CONSTANTS[k.name]) return CONSTANTS[k.name].value;
        throw new MathError(`No value for ${k.name}.`, 'missing', k.name);
      }
      case 'add': {
        let s = 0;
        for (const c of k.a) s += ev(c);
        return s;
      }
      case 'mul': {
        let p = 1;
        for (const c of k.a) p *= ev(c);
        return p;
      }
      case 'neg':
        return -ev(k.x);
      case 'div':
        return ev(k.n) / ev(k.d);
      case 'pow':
        return realPow(ev(k.b), ev(k.e));
      case 'fn':
        return applyFn(k.name, ev(k.args[0]));
      case 'pm': {
        const s = k.minus ? -pm : pm;
        return (k.l ? ev(k.l) : 0) + s * ev(k.r);
      }
      case 'eq':
        return ev(k.l) - ev(k.r);
    }
  };
  return ev(n);
}

/** Compile an expression of one variable into a fast JS function (other variables fixed by env). */
export function compile1(n: Node, variable: string, env: Env = {}, opts: EvalOpts = {}): (x: number) => number {
  const local: Env = { ...env };
  return (x: number) => {
    local[variable] = x;
    try {
      return evaluate(n, local, opts);
    } catch {
      return NaN;
    }
  };
}

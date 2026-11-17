// Optional second opinion from Compute Engine (loaded lazily: it is a large library).
//
// Compute Engine reads "i" as the imaginary unit and "e" as Euler's number, even in MathJSON.
// So we never give it our LaTeX. Instead our tree is converted to MathJSON with every variable
// renamed to a neutral name (u_1, u_2, ...), simplified there, converted back, and accepted only
// if it is numerically identical to what we started with.

import { E, FnName, MathError, Node, PI, add, div, eq, fn, mul, neg, num, pow, sym, variables } from './ast';
import { equivalent } from './equivalent';

type Json = number | string | Json[] | { num?: string; sym?: string; fn?: Json[] };

const FN_TO_JSON: Record<FnName, string> = {
  sin: 'Sin', cos: 'Cos', tan: 'Tan', sec: 'Sec', csc: 'Csc', cot: 'Cot', asin: 'Arcsin', acos: 'Arccos', atan: 'Arctan',
  sinh: 'Sinh', cosh: 'Cosh', tanh: 'Tanh', exp: 'Exp', ln: 'Ln', log10: 'Log', sqrt: 'Sqrt', abs: 'Abs',
};
const JSON_TO_FN: Record<string, FnName> = Object.fromEntries(Object.entries(FN_TO_JSON).map(([k, v]) => [v, k as FnName]));

export function toMathJson(n: Node, names: Map<string, string>): Json {
  const go = (k: Node): Json => {
    switch (k.t) {
      case 'num':
        return k.v;
      case 'sym': {
        let safe = names.get(k.name);
        if (!safe) {
          safe = `u_${names.size + 1}`;
          names.set(k.name, safe);
        }
        return safe;
      }
      case 'const':
        return k.name === 'pi' ? 'Pi' : k.name === 'e' ? 'ExponentialE' : 'PositiveInfinity';
      case 'add':
        return ['Add', ...k.a.map(go)];
      case 'mul':
        return ['Multiply', ...k.a.map(go)];
      case 'neg':
        return ['Negate', go(k.x)];
      case 'div':
        return ['Divide', go(k.n), go(k.d)];
      case 'pow':
        return ['Power', go(k.b), go(k.e)];
      case 'fn':
        return [FN_TO_JSON[k.name], go(k.args[0])];
      case 'eq':
        return ['Equal', go(k.l), go(k.r)];
      case 'pm':
        throw new MathError('± is not sent to Compute Engine.', 'unsupported');
    }
  };
  return go(n);
}

export function fromMathJson(j: Json, back: Map<string, string>): Node {
  const go = (k: Json): Node => {
    if (typeof k === 'number') return num(k);
    if (typeof k === 'string') {
      if (k === 'Pi') return PI;
      if (k === 'ExponentialE') return E;
      if (k === 'Half') return num(0.5);
      if (k === 'PositiveInfinity') return { t: 'const', name: 'inf' };
      const orig = back.get(k);
      if (orig === undefined) throw new MathError(`Unexpected symbol ${k}`, 'unsupported');
      return sym(orig);
    }
    if (!Array.isArray(k)) {
      if (k.num !== undefined) {
        const v = Number(k.num);
        if (!isFinite(v)) throw new MathError('Unreadable number', 'unsupported');
        return num(v);
      }
      if (k.sym !== undefined) return go(k.sym);
      if (k.fn) return go(k.fn);
      throw new MathError('Unreadable MathJSON', 'unsupported');
    }
    const [head, ...args] = k;
    const a = () => args.map(go);
    switch (head) {
      case 'Add': return add(...a());
      case 'Multiply': return mul(...a());
      case 'Negate': return neg(go(args[0]));
      case 'Subtract': return add(go(args[0]), neg(go(args[1])));
      case 'Divide': return div(go(args[0]), go(args[1]));
      case 'Rational': return div(go(args[0]), go(args[1]));
      case 'Power': return pow(go(args[0]), go(args[1]));
      case 'Square': return pow(go(args[0]), num(2));
      case 'Sqrt': return fn('sqrt', go(args[0]));
      case 'Root': return pow(go(args[0]), div(num(1), go(args[1])));
      case 'Equal': return eq(go(args[0]), go(args[1]));
      case 'Log':
        if (args.length === 1) return fn('log10', go(args[0]));
        return div(fn('ln', go(args[0])), fn('ln', go(args[1])));
      default:
        if (typeof head === 'string' && JSON_TO_FN[head] && args.length === 1) return fn(JSON_TO_FN[head], go(args[0]));
        throw new MathError(`Unsupported MathJSON head ${String(head)}`, 'unsupported');
    }
  };
  return go(j);
}

interface Boxed {
  simplify(): Boxed;
  json: Json;
}
interface Engine {
  box(j: Json): Boxed;
}
let enginePromise: Promise<Engine> | null = null;
function engine(): Promise<Engine> {
  enginePromise ??= import('@cortex-js/compute-engine').then((m) => new m.ComputeEngine() as unknown as Engine);
  return enginePromise;
}

/**
 * Ask Compute Engine to simplify an expression. Resolves to null when it cannot help
 * (unsupported construct, or its answer is not numerically identical to the input).
 */
export async function ceSimplify(n: Node): Promise<Node | null> {
  try {
    const names = new Map<string, string>();
    const json = toMathJson(n, names);
    const back = new Map([...names].map(([orig, safe]) => [safe, orig]));
    const ce = await engine();
    const out = fromMathJson(ce.box(json).simplify().json, back);
    // never trust a rewrite that changes the value or drops/adds variables unexpectedly
    if (!equivalent(out, n).equal) return null;
    if (variables(out).some((v) => !variables(n).includes(v))) return null;
    return out;
  } catch {
    return null;
  }
}

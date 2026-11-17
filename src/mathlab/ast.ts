// Expression tree for the maths layer.
//
// Physics conventions baked in here (they differ from a general CAS):
//  - i, I, E, d, e are ordinary variables. Only "e^{...}" and \exp mean Euler's number.
//  - Subscripted names are single symbols: q_0, v_0, R_{eq}, \epsilon_0, \mu_0.
//  - \log means the natural log, as the course uses it. \log_{10} is base 10.

export type FnName =
  | 'sin' | 'cos' | 'tan' | 'sec' | 'csc' | 'cot'
  | 'asin' | 'acos' | 'atan'
  | 'sinh' | 'cosh' | 'tanh'
  | 'exp' | 'ln' | 'log10' | 'sqrt' | 'abs';

export type Node =
  | { t: 'num'; v: number }
  | { t: 'sym'; name: string }
  | { t: 'const'; name: 'pi' | 'e' | 'inf' }
  | { t: 'add'; a: Node[] }
  | { t: 'mul'; a: Node[] }
  | { t: 'neg'; x: Node }
  | { t: 'div'; n: Node; d: Node }
  | { t: 'pow'; b: Node; e: Node }
  | { t: 'fn'; name: FnName; args: Node[] }
  /** l ± r (l may be absent for a leading ±). `minus` marks ∓. */
  | { t: 'pm'; l: Node | null; r: Node; minus?: boolean }
  | { t: 'eq'; l: Node; r: Node };

export const num = (v: number): Node => ({ t: 'num', v });
export const sym = (name: string): Node => ({ t: 'sym', name });
export const PI: Node = { t: 'const', name: 'pi' };
export const E: Node = { t: 'const', name: 'e' };
export const add = (...a: Node[]): Node => ({ t: 'add', a });
export const mul = (...a: Node[]): Node => ({ t: 'mul', a });
export const neg = (x: Node): Node => ({ t: 'neg', x });
export const div = (n: Node, d: Node): Node => ({ t: 'div', n, d });
export const pow = (b: Node, e: Node): Node => ({ t: 'pow', b, e });
export const fn = (name: FnName, ...args: Node[]): Node => ({ t: 'fn', name, args });
export const eq = (l: Node, r: Node): Node => ({ t: 'eq', l, r });
export const sub = (a: Node, b: Node): Node => add(a, neg(b));

export class MathError extends Error {
  constructor(message: string, readonly kind: 'syntax' | 'missing' | 'domain' | 'unsupported' = 'syntax', readonly symbol?: string) {
    super(message);
  }
}

/** Children of a node, for generic traversals. */
export function children(n: Node): Node[] {
  switch (n.t) {
    case 'add':
    case 'mul':
      return n.a;
    case 'neg':
      return [n.x];
    case 'div':
      return [n.n, n.d];
    case 'pow':
      return [n.b, n.e];
    case 'fn':
      return n.args;
    case 'pm':
      return n.l ? [n.l, n.r] : [n.r];
    case 'eq':
      return [n.l, n.r];
    default:
      return [];
  }
}

/** Rebuild a node with transformed children. */
export function mapChildren(n: Node, f: (c: Node) => Node): Node {
  switch (n.t) {
    case 'add':
      return { t: 'add', a: n.a.map(f) };
    case 'mul':
      return { t: 'mul', a: n.a.map(f) };
    case 'neg':
      return neg(f(n.x));
    case 'div':
      return div(f(n.n), f(n.d));
    case 'pow':
      return pow(f(n.b), f(n.e));
    case 'fn':
      return { t: 'fn', name: n.name, args: n.args.map(f) };
    case 'pm':
      return { t: 'pm', l: n.l ? f(n.l) : null, r: f(n.r), minus: n.minus };
    case 'eq':
      return eq(f(n.l), f(n.r));
    default:
      return n;
  }
}

/** Free variables in order of first appearance. */
export function variables(n: Node): string[] {
  const out: string[] = [];
  const walk = (k: Node) => {
    if (k.t === 'sym') {
      if (!out.includes(k.name)) out.push(k.name);
    } else children(k).forEach(walk);
  };
  walk(n);
  return out;
}

export function contains(n: Node, name: string): boolean {
  if (n.t === 'sym') return n.name === name;
  return children(n).some((c) => contains(c, name));
}

export function countOccurrences(n: Node, name: string): number {
  if (n.t === 'sym') return n.name === name ? 1 : 0;
  return children(n).reduce((s, c) => s + countOccurrences(c, name), 0);
}

export function hasPm(n: Node): boolean {
  return n.t === 'pm' || children(n).some(hasPm);
}

/** Replace a symbol with an expression. */
export function substitute(n: Node, name: string, value: Node): Node {
  if (n.t === 'sym') return n.name === name ? value : n;
  return mapChildren(n, (c) => substitute(c, name, value));
}

/** Deterministic structural key (used to compare and group sub-expressions). */
export function key(n: Node): string {
  switch (n.t) {
    case 'num':
      return `#${n.v}`;
    case 'sym':
      return `$${n.name}`;
    case 'const':
      return `@${n.name}`;
    case 'add':
      return `(+ ${n.a.map(key).join(' ')})`;
    case 'mul':
      return `(* ${n.a.map(key).join(' ')})`;
    case 'neg':
      return `(- ${key(n.x)})`;
    case 'div':
      return `(/ ${key(n.n)} ${key(n.d)})`;
    case 'pow':
      return `(^ ${key(n.b)} ${key(n.e)})`;
    case 'fn':
      return `(${n.name} ${n.args.map(key).join(' ')})`;
    case 'pm':
      return `(${n.minus ? 'mp' : 'pm'} ${n.l ? key(n.l) : '_'} ${key(n.r)})`;
    case 'eq':
      return `(= ${key(n.l)} ${key(n.r)})`;
  }
}

/** Physical constants that get default values when evaluating numerically (SI units). */
export const CONSTANTS: Record<string, { value: number; unit: string; label: string }> = {
  epsilon_0: { value: 8.8541878128e-12, unit: 'C²/(N·m²)', label: 'permittivity of free space' },
  mu_0: { value: 4e-7 * Math.PI, unit: 'T·m/A', label: 'permeability of free space' },
  c: { value: 299792458, unit: 'm/s', label: 'speed of light' },
  k: { value: 8.9875517923e9, unit: 'N·m²/C²', label: 'Coulomb constant 1/(4πε₀)' },
};

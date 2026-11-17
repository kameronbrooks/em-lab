// Algebraic simplification into a canonical form.
//
// The canonical form uses only num / sym / const / add / mul / pow / fn (plus pm and eq at the top):
// subtraction becomes multiplication by -1, division becomes a power of -1, sqrt becomes a power of 1/2.
// Variables are assumed to be positive real numbers (true for almost every physics quantity here),
// which is what allows (x^2)^(1/2) -> x and (ab)^n -> a^n b^n.

import { E, FnName, Node, eq, fn, key, mul, num, pow } from './ast';
import { applyFn, evaluate, realPow } from './evaluate';

const clean = (v: number): number => {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-12 * Math.max(1, Math.abs(v))) return r === 0 ? 0 : r;
  return v;
};

/** Best rational p/q for v with a small denominator, or null if v is not (nearly) rational. */
export function toFraction(v: number, maxDen = 10000): [number, number] | null {
  if (!isFinite(v)) return null;
  const sign = v < 0 ? -1 : 1;
  let x = Math.abs(v);
  if (Math.abs(x - Math.round(x)) < 1e-12 * Math.max(1, x)) return [sign * Math.round(x), 1];
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  const target = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(target - h1 / k1) < 1e-12 * Math.max(1, target)) return [sign * h1, k1];
    const frac = x - a;
    if (frac < 1e-14) break;
    x = 1 / frac;
  }
  return null;
}

const isNice = (v: number) => toFraction(v, 64) !== null;

function hasSymbols(n: Node): boolean {
  if (n.t === 'sym') return true;
  if (n.t === 'num' || n.t === 'const') return false;
  if (n.t === 'pm') return true;
  switch (n.t) {
    case 'add':
    case 'mul':
      return n.a.some(hasSymbols);
    case 'pow':
      return hasSymbols(n.b) || hasSymbols(n.e);
    case 'fn':
      return n.args.some(hasSymbols);
    case 'neg':
      return hasSymbols(n.x);
    case 'div':
      return hasSymbols(n.n) || hasSymbols(n.d);
    case 'eq':
      return true;
  }
}

/** Leading numeric coefficient of a canonical term. */
function leadingCoef(n: Node): number {
  if (n.t === 'num') return n.v;
  if (n.t === 'mul' && n.a[0].t === 'num') return n.a[0].v;
  return 1;
}

function expN(x: Node): Node {
  if (x.t === 'num' && x.v === 0) return num(1);
  if (x.t === 'fn' && x.name === 'ln') return x.args[0];
  if (x.t === 'mul' && x.a.length === 2 && x.a[0].t === 'num' && x.a[1].t === 'fn' && x.a[1].name === 'ln') {
    return powN(x.a[1].args[0], x.a[0]);
  }
  return fn('exp', x);
}

function lnN(x: Node): Node {
  if (x.t === 'num' && x.v === 1) return num(0);
  if (x.t === 'fn' && x.name === 'exp') return x.args[0];
  if (x.t === 'const' && x.name === 'e') return num(1);
  if (x.t === 'pow' && x.e.t === 'num') return mulN([x.e, lnN(x.b)]);
  if (x.t === 'num' && x.v > 0 && x.v < 1) {
    // ln(0.1) -> -ln(10): keeps answers like RC ln(10) and -RC ln(0.1) identical
    const f = toFraction(x.v, 1000);
    if (f && f[0] === 1) return mulN([num(-1), fn('ln', num(f[1]))]);
  }
  return fn('ln', x);
}

function fnN(name: FnName, x: Node): Node {
  if (name === 'sqrt') return powN(x, num(0.5));
  if (name === 'exp') return expN(x);
  if (name === 'ln') return lnN(x);
  if (name === 'log10') return mulN([lnN(x), powN(fn('ln', num(10)), num(-1))]);
  if (!hasSymbols(x)) {
    try {
      const v = applyFn(name, evaluate(x));
      const f = isFinite(v) ? toFraction(v, 2) : null;
      if (f) return num(f[0] / f[1]);
    } catch {
      /* keep symbolic */
    }
  }
  const negArg = leadingCoef(x) < 0;
  if (negArg && (name === 'sin' || name === 'tan' || name === 'asin' || name === 'atan' || name === 'sinh' || name === 'tanh')) {
    return mulN([num(-1), fn(name, mulN([num(-1), x]))]);
  }
  if (negArg && (name === 'cos' || name === 'cosh' || name === 'abs')) return fn(name, mulN([num(-1), x]));
  if (name === 'abs' && x.t === 'num') return num(Math.abs(x.v));
  return fn(name, x);
}

function powN(b: Node, e: Node): Node {
  if (e.t === 'num') {
    if (e.v === 0) return num(1);
    if (e.v === 1) return b;
    if (b.t === 'num') {
      const v = realPow(b.v, e.v);
      if (isFinite(v) && (Number.isInteger(e.v) || isNice(v))) return num(clean(v));
      // pull out a perfect square: sqrt(8) -> 2 sqrt(2)
      if (isFinite(v) && Math.abs(e.v) === 0.5 && Number.isInteger(b.v) && b.v > 0) {
        let inside = b.v, outside = 1;
        for (let k = 2; k * k <= inside; k++) {
          while (inside % (k * k) === 0) {
            inside /= k * k;
            outside *= k;
          }
        }
        if (outside > 1) return mul(num(e.v > 0 ? outside : 1 / outside), pow(num(inside), e));
      }
      return pow(b, e);
    }
    if (b.t === 'const' && b.name === 'e') return expN(e);
    if (b.t === 'fn' && b.name === 'exp') return expN(mulN([b.args[0], e]));
    if (b.t === 'pow') {
      if (b.e.t === 'num') return powN(b.b, num(clean(b.e.v * e.v)));
      if (Number.isInteger(e.v)) return pow(b.b, mulN([b.e, e]));
    }
    if (b.t === 'mul') {
      const c = b.a[0].t === 'num' ? b.a[0].v : 1;
      if (c < 0 && !Number.isInteger(e.v)) {
        // A root of a negative product: never split off (-1)^(1/2). Move the minus sign into a
        // sum if there is one, (-2(W - x))^(1/2) -> (2(x - W))^(1/2); otherwise leave it whole.
        const idx = b.a.findIndex((f) => f.t === 'add' || (f.t === 'pow' && f.b.t === 'add' && f.e.t === 'num' && Number.isInteger(f.e.v) && f.e.v % 2 !== 0));
        if (idx < 0) return pow(b, e);
        const f = b.a[idx];
        const flipped = f.t === 'pow' ? pow(negateSum(f.b), f.e) : negateSum(f);
        return mulN(b.a.map((g, i) => powN(i === 0 ? num(-c) : i === idx ? flipped : g, e)));
      }
      return mulN(b.a.map((f) => powN(f, e)));
    }
    return pow(b, e);
  }
  if (b.t === 'const' && b.name === 'e') return expN(e);
  if (b.t === 'num' && b.v === 1) return num(1);
  if (b.t === 'fn' && b.name === 'exp') return expN(mulN([b.args[0], e]));
  return pow(b, e);
}

function rank(n: Node): number {
  switch (n.t) {
    case 'num': return 0;
    case 'const': return 1;
    case 'sym': return 2;
    case 'pow': return n.b.t === 'sym' ? 2 : n.b.t === 'num' || n.b.t === 'const' ? 1 : 3;
    case 'fn': return 4;
    default: return 5;
  }
}
function sortName(n: Node): string {
  if (n.t === 'sym') return n.name;
  if (n.t === 'pow') return sortName(n.b);
  return key(n);
}
function compareFactors(a: Node, b: Node): number {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  const na = sortName(a), nb = sortName(b);
  const la = na.toLowerCase(), lb = nb.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return na < nb ? 1 : na > nb ? -1 : 0;
}

function allNegative(n: Node): boolean {
  return n.t === 'add' && n.a.every((t) => leadingCoef(t) < 0);
}
function negateSum(n: Node): Node {
  return n.t === 'add' ? addN(n.a.map((t) => mulN([num(-1), t]))) : n;
}

function mulN(list: Node[]): Node {
  const flat: Node[] = [];
  const push = (n: Node) => {
    if (n.t === 'mul') n.a.forEach(push);
    else flat.push(n);
  };
  list.forEach(push);
  let coef = 1;
  const groups = new Map<string, { base: Node; exps: Node[] }>();
  for (let f of flat) {
    if (f.t === 'num') {
      coef *= f.v;
      continue;
    }
    // pull a common minus sign out of sums: (-a - b) -> -(a + b), 1/(-a - b) -> -1/(a + b)
    if (allNegative(f)) {
      coef *= -1;
      f = negateSum(f);
    } else if (f.t === 'pow' && f.e.t === 'num' && Number.isInteger(f.e.v) && allNegative(f.b)) {
      if (f.e.v % 2 !== 0) coef *= -1;
      f = pow(negateSum(f.b), f.e);
    }
    let base: Node = f, exp: Node = num(1);
    if (f.t === 'pow') {
      base = f.b;
      exp = f.e;
    } else if (f.t === 'fn' && f.name === 'exp') {
      base = E;
      exp = f.args[0];
    }
    const k = key(base);
    const g = groups.get(k);
    if (g) g.exps.push(exp);
    else groups.set(k, { base, exps: [exp] });
  }
  if (coef === 0) return num(0);
  const factors: Node[] = [];
  const again: Node[] = [];
  for (const g of groups.values()) {
    const e = g.exps.length === 1 ? g.exps[0] : addN(g.exps);
    const p = g.exps.length === 1 && e.t !== 'num' && g.base.t !== 'const' ? pow(g.base, e) : powN(g.base, e);
    if (p.t === 'num') coef *= p.v;
    else if (p.t === 'mul') again.push(p);
    else factors.push(p);
  }
  if (again.length) return mulN([num(coef), ...factors, ...again]);
  coef = clean(coef);
  if (coef === 0) return num(0);
  factors.sort(compareFactors);
  if (!factors.length) return num(coef);
  if (coef === 1) return factors.length === 1 ? factors[0] : mul(...factors);
  return mul(num(coef), ...factors);
}

function addN(list: Node[]): Node {
  const flat: Node[] = [];
  const push = (n: Node) => {
    if (n.t === 'add') n.a.forEach(push);
    else flat.push(n);
  };
  list.forEach(push);
  let c = 0;
  const groups = new Map<string, { coef: number; rest: Node }>();
  for (const t of flat) {
    if (t.t === 'num') {
      c += t.v;
      continue;
    }
    let coef = 1, rest: Node = t;
    if (t.t === 'mul' && t.a[0].t === 'num') {
      coef = t.a[0].v;
      rest = t.a.length === 2 ? t.a[1] : mul(...t.a.slice(1));
    }
    const k = key(rest);
    const g = groups.get(k);
    if (g) g.coef += coef;
    else groups.set(k, { coef, rest });
  }
  const terms: Node[] = [];
  for (const g of groups.values()) {
    const coef = clean(g.coef);
    if (Math.abs(coef) < 1e-14) continue;
    if (coef === 1) terms.push(g.rest);
    else terms.push(g.rest.t === 'mul' ? mul(num(coef), ...g.rest.a) : mul(num(coef), g.rest));
  }
  c = clean(c);
  if (c !== 0) terms.push(num(c));
  if (!terms.length) return num(0);
  return terms.length === 1 ? terms[0] : { t: 'add', a: terms };
}

function S(n: Node): Node {
  switch (n.t) {
    case 'num':
      return n.v === 0 ? num(0) : n;
    case 'sym':
    case 'const':
      return n;
    case 'neg':
      return mulN([num(-1), S(n.x)]);
    case 'div':
      return mulN([S(n.n), powN(S(n.d), num(-1))]);
    case 'add':
      return addN(n.a.map(S));
    case 'mul':
      return mulN(n.a.map(S));
    case 'pow':
      return powN(S(n.b), S(n.e));
    case 'fn':
      return fnN(n.name, S(n.args[0]));
    case 'pm':
      return { t: 'pm', l: n.l ? S(n.l) : null, r: S(n.r), minus: n.minus };
    case 'eq':
      return eq(S(n.l), S(n.r));
  }
}

/** Simplify into canonical form (see the note at the top of this file). */
export function simplify(n: Node): Node {
  // A second pass catches combinations exposed by the first (e.g. powers that became numbers).
  const once = S(n);
  const twice = S(once);
  return key(twice) === key(once) ? once : S(twice);
}

/** Multiply out products of sums and small integer powers of sums, then simplify. */
export function expand(n: Node): Node {
  const LIMIT = 400;
  const X = (k: Node): Node => {
    switch (k.t) {
      case 'add':
        return addN(k.a.map(X));
      case 'mul': {
        let terms: Node[] = [num(1)];
        for (const f0 of k.a) {
          const f = X(f0);
          const fs = f.t === 'add' ? f.a : [f];
          const next: Node[] = [];
          for (const a of terms) for (const b of fs) next.push(mulN([a, b]));
          if (next.length > LIMIT) return k;
          terms = next;
        }
        return addN(terms);
      }
      case 'pow': {
        const b = X(k.b);
        if (b.t === 'add' && k.e.t === 'num' && Number.isInteger(k.e.v) && k.e.v >= 2 && k.e.v <= 6) {
          return X(mul(...Array.from({ length: k.e.v }, () => b)));
        }
        return powN(b, X(k.e));
      }
      case 'fn':
        return fnN(k.name, X(k.args[0]));
      case 'pm':
        return { t: 'pm', l: k.l ? X(k.l) : null, r: X(k.r), minus: k.minus };
      case 'eq':
        return eq(X(k.l), X(k.r));
      default:
        return k;
    }
  };
  return simplify(X(simplify(n)));
}

/** True if the (simplified) expression is exactly the number zero. */
export function isZero(n: Node): boolean {
  const s = simplify(n);
  return s.t === 'num' && s.v === 0;
}

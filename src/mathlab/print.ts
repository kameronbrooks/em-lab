// Expression tree -> LaTeX.

import { Node, div, fn, mul, neg, num, pow } from './ast';
import { toFraction } from './simplify';

const GREEK_TEX: Record<string, string> = {
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', epsilon: '\\epsilon', zeta: '\\zeta',
  eta: '\\eta', theta: '\\theta', iota: '\\iota', kappa: '\\kappa', lambda: '\\lambda', mu: '\\mu', nu: '\\nu',
  xi: '\\xi', rho: '\\rho', sigma: '\\sigma', tau: '\\tau', upsilon: '\\upsilon', phi: '\\phi', chi: '\\chi',
  psi: '\\psi', omega: '\\omega', Gamma: '\\Gamma', Delta: '\\Delta', Theta: '\\Theta', Lambda: '\\Lambda',
  Xi: '\\Xi', Pi: '\\Pi', Sigma: '\\Sigma', Upsilon: '\\Upsilon', Phi: '\\Phi', Psi: '\\Psi', Omega: '\\Omega',
  ell: '\\ell', hbar: '\\hbar',
};

/** LaTeX for a symbol name such as q_0, epsilon_0, R_eq, Delta:V, hat:r. */
export function symTex(name: string): string {
  const colon = name.indexOf(':');
  if (colon > 0) {
    const prefix = name.slice(0, colon);
    const rest = symTex(name.slice(colon + 1));
    if (prefix === 'Delta') return `\\Delta ${rest}`;
    return `\\${prefix}{${rest}}`;
  }
  let marks = '';
  let core = name;
  while (core.endsWith("'") || core.endsWith('*')) {
    marks = core[core.length - 1] + marks;
    core = core.slice(0, -1);
  }
  const us = core.indexOf('_');
  const base = us >= 0 ? core.slice(0, us) : core;
  const subText = us >= 0 ? core.slice(us + 1) : '';
  let out = GREEK_TEX[base] ?? (base.length === 1 ? base : `\\mathrm{${base}}`);
  let subTex = '';
  if (subText) {
    if (GREEK_TEX[subText]) subTex = GREEK_TEX[subText];
    else if (subText.length === 1 || /^[0-9]+$/.test(subText)) subTex = subText;
    else subTex = `\\mathrm{${subText}}`;
  }
  const stars = marks.replace(/'/g, '');
  const primes = marks.replace(/\*/g, '');
  if (stars) subTex = subTex ? `${subTex},*` : '*';
  if (subTex) out += `_{${subTex}}`;
  if (primes) out += primes;
  return out;
}

/** Number formatting for LaTeX output. */
export function numTex(v: number, digits = 6): string {
  if (!isFinite(v)) return isNaN(v) ? '\\text{undefined}' : v > 0 ? '\\infty' : '-\\infty';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e9) return String(v);
  if (a >= 1e6 || a < 1e-4) {
    const e = Math.floor(Math.log10(a));
    let m = v / Math.pow(10, e);
    let ms = Number(m.toPrecision(digits)).toString();
    let ee = e;
    if (Math.abs(Number(ms)) >= 10) {
      m /= 10;
      ee += 1;
      ms = Number(m.toPrecision(digits)).toString();
    }
    if (ms === '1') return `10^{${ee}}`;
    if (ms === '-1') return `-10^{${ee}}`;
    return `${ms}\\times 10^{${ee}}`;
  }
  return Number(v.toPrecision(digits)).toString();
}

const isNegNum = (n: Node) => n.t === 'num' && n.v < 0;
const isOne = (n: Node) => n.t === 'num' && n.v === 1;

/**
 * Turn a canonical tree (powers of -1, coefficients of -1) into one that reads naturally:
 * fractions, leading minus signs and square roots. Safe to call on any tree.
 */
export function toDisplay(n: Node): Node {
  switch (n.t) {
    case 'num': {
      if (n.v < 0) return neg(toDisplay(num(-n.v)));
      const f = Number.isInteger(n.v) ? null : toFraction(n.v, 1000);
      if (f && f[1] !== 1) return div(num(f[0]), num(f[1]));
      return n;
    }
    case 'sym':
    case 'const':
      return n;
    case 'neg':
      return neg(toDisplay(n.x));
    case 'div':
      return div(toDisplay(n.n), toDisplay(n.d));
    case 'add':
      return { t: 'add', a: n.a.map(toDisplay) };
    case 'fn':
      return { t: 'fn', name: n.name, args: n.args.map(toDisplay) };
    case 'eq':
      return { t: 'eq', l: toDisplay(n.l), r: toDisplay(n.r) };
    case 'pm':
      return { t: 'pm', l: n.l ? toDisplay(n.l) : null, r: toDisplay(n.r), minus: n.minus };
    case 'pow': {
      if (n.e.t === 'num') {
        if (n.e.v < 0) return div(num(1), toDisplay(pow(n.b, num(-n.e.v))));
        if (n.e.v === 0.5) return fn('sqrt', toDisplay(n.b));
        if (n.e.v === 1) return toDisplay(n.b);
      }
      return pow(toDisplay(n.b), toDisplay(n.e));
    }
    case 'mul': {
      let negative = false;
      const numer: Node[] = [];
      const denom: Node[] = [];
      for (const f of n.a) {
        if (f.t === 'num') {
          let v = f.v;
          if (v < 0) {
            negative = !negative;
            v = -v;
          }
          const fr = toFraction(v, 1000);
          if (fr) {
            if (fr[0] !== 1) numer.push(num(fr[0]));
            if (fr[1] !== 1) denom.push(num(fr[1]));
          } else numer.push(num(v));
        } else if (f.t === 'pow' && f.e.t === 'num' && f.e.v < 0) {
          denom.push(toDisplay(pow(f.b, num(-f.e.v))));
        } else if (f.t === 'neg') {
          negative = !negative;
          numer.push(toDisplay(f.x));
        } else if (f.t === 'div') {
          numer.push(toDisplay(f.n));
          denom.push(toDisplay(f.d));
        } else numer.push(toDisplay(f));
      }
      // numbers first in each part
      const order = (xs: Node[]) => [...xs.filter((x) => x.t === 'num'), ...xs.filter((x) => x.t !== 'num')];
      const build = (xs: Node[]): Node => (xs.length === 0 ? num(1) : xs.length === 1 ? xs[0] : mul(...order(xs)));
      let out: Node = denom.length ? div(build(numer), build(denom)) : build(numer);
      if (negative) out = neg(out);
      return out;
    }
  }
}

// precedence: 0 add, 1 mul, 2 unary minus, 3 power, 4 atom
function prec(n: Node): number {
  switch (n.t) {
    case 'add':
    case 'pm':
    case 'eq':
      return 0;
    case 'mul':
      return 1;
    case 'neg':
      return 2;
    case 'num':
      return n.v < 0 ? 2 : 4;
    case 'pow':
      return 3;
    default:
      return 4;
  }
}

function wrap(n: Node, minPrec: number): string {
  const s = texOf(n);
  return prec(n) < minPrec ? `\\left(${s}\\right)` : s;
}

const FN_TEX: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
  asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  ln: '\\ln', log10: '\\log_{10}',
};

function startsWithDigit(s: string): boolean {
  return /^[0-9.]/.test(s);
}

function texOf(n: Node): string {
  switch (n.t) {
    case 'num':
      return numTex(n.v);
    case 'sym':
      return symTex(n.name);
    case 'const':
      return n.name === 'pi' ? '\\pi' : n.name === 'e' ? 'e' : '\\infty';
    case 'add': {
      let out = '';
      n.a.forEach((term, i) => {
        if (i === 0) {
          out += texOf(term);
          return;
        }
        if (term.t === 'neg') out += ' - ' + wrap(term.x, 1);
        else if (isNegNum(term)) out += ' - ' + numTex(-(term as { v: number }).v);
        else if (term.t === 'mul' && isNegNum(term.a[0])) {
          const first = num(-(term.a[0] as { v: number }).v);
          const rest = term.a.slice(1);
          out += ' - ' + texOf(isOne(first) && rest.length ? (rest.length === 1 ? rest[0] : mul(...rest)) : mul(first, ...rest));
        } else if (term.t === 'pm') out += ' + ' + `\\left(${texOf(term)}\\right)`;
        else out += ' + ' + texOf(term);
      });
      return out;
    }
    case 'mul': {
      let out = '';
      n.a.forEach((f, i) => {
        let s = wrap(f, i === 0 ? 1 : 3);
        if (i === 0 && f.t === 'num' && f.v === -1 && n.a.length > 1) {
          out += '-';
          return;
        }
        if (f.t === 'num' && f.v < 0 && i > 0) s = `\\left(${s}\\right)`;
        if (i > 0 && out !== '-' && (startsWithDigit(s) || n.a[i - 1].t === 'num' && f.t === 'num')) out += ' \\cdot ' + s;
        else if (i > 0 && out !== '-' && f.t === 'fn' && f.name !== 'sqrt' && f.name !== 'abs' && n.a[i - 1].t !== 'num') out += ' \\, ' + s;
        else out += (out && out !== '-' ? ' ' : '') + s;
      });
      return out;
    }
    case 'neg':
      return '-' + (n.x.t === 'neg' || isNegNum(n.x) ? `\\left(${texOf(n.x)}\\right)` : wrap(n.x, 1));
    case 'div':
      return `\\frac{${texOf(n.n)}}{${texOf(n.d)}}`;
    case 'pow': {
      if (n.b.t === 'const' && n.b.name === 'e') return `e^{${texOf(n.e)}}`;
      const baseAtomic = n.b.t === 'sym' || n.b.t === 'const' || (n.b.t === 'num' && n.b.v >= 0 && Number.isInteger(n.b.v));
      const base = baseAtomic ? texOf(n.b) : `\\left(${texOf(n.b)}\\right)`;
      return `${base}^{${texOf(n.e)}}`;
    }
    case 'fn': {
      const a = n.args[0];
      if (n.name === 'sqrt') return `\\sqrt{${texOf(a)}}`;
      if (n.name === 'abs') return `\\left|${texOf(a)}\\right|`;
      if (n.name === 'exp') return `e^{${texOf(a)}}`;
      return `${FN_TEX[n.name]}\\left(${texOf(a)}\\right)`;
    }
    case 'pm': {
      const op = n.minus ? '\\mp' : '\\pm';
      return n.l ? `${texOf(n.l)} ${op} ${wrap(n.r, 1)}` : `${op} ${wrap(n.r, 1)}`;
    }
    case 'eq':
      return `${texOf(n.l)} = ${texOf(n.r)}`;
  }
}

/** LaTeX for an expression exactly as structured (use for "read as" echoes). */
export function toTex(n: Node): string {
  return texOf(n);
}

/** LaTeX for a simplified expression, laid out with fractions and roots. */
export function toPrettyTex(n: Node): string {
  return texOf(toDisplay(n));
}

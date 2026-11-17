// LaTeX -> expression tree, for the subset of LaTeX that MathLive emits and physics formulas use.
//
// Reading rules worth knowing:
//  - Implicit multiplication binds tighter than a slash, the way physics formulas are written inline:
//    R/2L is R/(2L), e^{-t/RC} is e^{-t/(RC)}, 4/LC is 4/(LC). Use \frac or brackets to say otherwise.
//  - i, I, E, d are variables. e is Euler's number only as the base of a power (e^{...}).
//  - \log is the natural log (course convention); \log_{10} is base 10.

import { E, FnName, MathError, Node, PI, add, div, fn, mul, neg, num, pow, sym } from './ast';

interface Tok {
  k: 'num' | 'let' | 'cmd' | 'sym';
  s: string;
}

const GREEK: Record<string, string> = {
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon', varepsilon: 'epsilon',
  zeta: 'zeta', eta: 'eta', theta: 'theta', vartheta: 'theta', iota: 'iota', kappa: 'kappa', lambda: 'lambda',
  mu: 'mu', nu: 'nu', xi: 'xi', rho: 'rho', varrho: 'rho', sigma: 'sigma', tau: 'tau', upsilon: 'upsilon',
  phi: 'phi', varphi: 'phi', chi: 'chi', psi: 'psi', omega: 'omega',
  Gamma: 'Gamma', Theta: 'Theta', Lambda: 'Lambda', Xi: 'Xi', Pi: 'Pi', Sigma: 'Sigma', Upsilon: 'Upsilon',
  Phi: 'Phi', Psi: 'Psi', Omega: 'Omega', ell: 'ell', hbar: 'hbar',
};

const FUNCS: Record<string, FnName | 'log'> = {
  sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot',
  arcsin: 'asin', arccos: 'acos', arctan: 'atan', asin: 'asin', acos: 'acos', atan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  exp: 'exp', ln: 'ln', log: 'log', lg: 'log10', sqrt: 'sqrt', abs: 'abs',
};
const INVERSE: Partial<Record<FnName, FnName>> = { sin: 'asin', cos: 'acos', tan: 'atan' };
/** Function names recognised when typed as plain letters followed by a bracket, longest first. */
const PLAIN_FUNCS = ['arcsin', 'arccos', 'arctan', 'sqrt', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'exp', 'abs', 'log', 'ln'];

const SKIP_CMDS = new Set([
  'quad', 'qquad', 'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'big', 'Big', 'bigg', 'Bigg',
  'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'nobreak', 'allowbreak', 'enspace', 'thinspace', 'space',
]);
const TEXT_CMDS = new Set(['text', 'mathrm', 'operatorname', 'textrm', 'mathit', 'textit', 'mathsf', 'textnormal']);
const PLAIN_WRAP = new Set(['vec', 'mathbf', 'boldsymbol', 'bm', 'overrightarrow', 'mathbb', 'mathcal', 'textbf', 'vb']);
const DECOR: Record<string, string> = { hat: 'hat', widehat: 'hat', dot: 'dot', ddot: 'ddot', bar: 'bar', overline: 'bar', tilde: 'tilde' };
/** Commands that can never start a factor. */
const STOP_CMDS = new Set([
  'cdot', 'times', 'div', 'pm', 'mp', 'right', 'mright', 'rbrace', 'rangle', 'rvert', 'rbrack', 'rparen',
  'le', 'ge', 'leq', 'geq', 'neq', 'ne', 'approx', 'equiv', 'to', 'rightarrow', 'Rightarrow', 'lt', 'gt', 'ast', 'star', 'prime',
]);
const UNSUPPORTED: Record<string, string> = {
  int: 'Integral signs are not read here. Use the definite integral tool instead.',
  oint: 'Closed integrals are not read here.',
  sum: 'Summation signs are not supported.',
  prod: 'Product signs are not supported.',
  lim: 'Limits are not supported.',
  partial: 'Partial derivatives are not read here. Use the derivative tool instead.',
  nabla: 'Vector calculus operators are not supported.',
};

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch) || ch === '~') {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
        j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      } else if (src[j] === '.' && j > i) {
        j++; // trailing dot as in "2."
      }
      if (j === i) {
        // a lone dot (e.g. after \left or \right) is passed through as a symbol
        out.push({ k: 'sym', s: '.' });
        i++;
        continue;
      }
      out.push({ k: 'num', s: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      out.push({ k: 'let', s: ch });
      i++;
      continue;
    }
    if (ch === '\\') {
      const next = src[i + 1] ?? '';
      if (/[a-zA-Z]/.test(next)) {
        let j = i + 1;
        while (j < n && /[a-zA-Z]/.test(src[j])) j++;
        const name = src.slice(i + 1, j);
        i = j;
        if (!SKIP_CMDS.has(name)) out.push({ k: 'cmd', s: name });
        continue;
      }
      i += 2;
      if (next === '{') out.push({ k: 'cmd', s: 'lbrace' });
      else if (next === '}') out.push({ k: 'cmd', s: 'rbrace' });
      else if (next === '|') out.push({ k: 'sym', s: '|' });
      else if (next === '%') throw new MathError('Percent signs are not supported.', 'unsupported');
      // \, \; \: \! \  and anything else: spacing, ignored
      continue;
    }
    // unicode conveniences
    if (ch === '−' || ch === '–') out.push({ k: 'sym', s: '-' });
    else if (ch === '×' || ch === '·' || ch === '⋅') out.push({ k: 'cmd', s: 'cdot' });
    else if (ch === '÷') out.push({ k: 'sym', s: '/' });
    else if (ch === 'π') out.push({ k: 'cmd', s: 'pi' });
    else if (ch === '√') out.push({ k: 'cmd', s: 'sqrt' });
    else if (ch === '±') out.push({ k: 'cmd', s: 'pm' });
    else out.push({ k: 'sym', s: ch });
    i++;
  }
  return out;
}

class Parser {
  pos = 0;
  absDepth = 0;
  constructor(readonly toks: Tok[]) {}

  peek(o = 0): Tok | undefined {
    return this.toks[this.pos + o];
  }
  next(): Tok {
    const t = this.toks[this.pos++];
    if (!t) throw new MathError('The expression ends too soon.');
    return t;
  }
  isSym(s: string, o = 0) {
    const t = this.peek(o);
    return !!t && t.k === 'sym' && t.s === s;
  }
  isCmd(s: string, o = 0) {
    const t = this.peek(o);
    return !!t && t.k === 'cmd' && t.s === s;
  }
  expectSym(s: string) {
    if (!this.isSym(s)) throw new MathError(`Expected "${s}"${this.peek() ? ` but found "${describe(this.peek()!)}"` : ' before the end'}.`);
    this.pos++;
  }

  parseTop(): Node {
    if (!this.toks.length) throw new MathError('Type an expression first.');
    const left = this.parseExpr();
    if (this.isSym('=')) {
      this.pos++;
      const right = this.parseExpr();
      if (this.isSym('=')) throw new MathError('Use one "=" sign per equation.');
      this.finish();
      return { t: 'eq', l: left, r: right };
    }
    this.finish();
    return left;
  }

  finish() {
    const t = this.peek();
    if (t) {
      if (t.k === 'cmd' && ['le', 'ge', 'leq', 'geq', 'neq', 'ne', 'approx', 'lt', 'gt', 'equiv'].includes(t.s)) {
        throw new MathError('Only "=" relations are supported.', 'unsupported');
      }
      throw new MathError(`Did not expect "${describe(t)}" here.`);
    }
  }

  /** Sum of terms. */
  parseExpr(): Node {
    let terms: Node[] = [];
    let first = true;
    for (;;) {
      let sign: '+' | '-' | 'pm' | 'mp' | null = null;
      if (this.isSym('+')) sign = '+';
      else if (this.isSym('-')) sign = '-';
      else if (this.isCmd('pm')) sign = 'pm';
      else if (this.isCmd('mp')) sign = 'mp';
      if (sign) this.pos++;
      else if (!first) break;
      const term = this.parseTerm();
      if (sign === 'pm' || sign === 'mp') {
        const left = terms.length === 0 ? null : terms.length === 1 ? terms[0] : add(...terms);
        terms = [{ t: 'pm', l: left, r: term, minus: sign === 'mp' }];
      } else {
        terms.push(sign === '-' ? neg(term) : term);
      }
      first = false;
    }
    return terms.length === 1 ? terms[0] : add(...terms);
  }

  /** Factors joined by explicit operators. Implicit products bind tighter than "/". */
  parseTerm(): Node {
    let left = this.parseSigned();
    for (;;) {
      if (this.isSym('*') || this.isCmd('cdot') || this.isCmd('times')) {
        this.pos++;
        left = mul(left, this.parseSigned());
      } else if (this.isSym('/') || this.isCmd('div')) {
        this.pos++;
        left = div(left, this.parseSigned());
      } else break;
    }
    return left;
  }

  parseSigned(): Node {
    if (this.isSym('-')) {
      this.pos++;
      return neg(this.parseSigned());
    }
    if (this.isSym('+')) {
      this.pos++;
      return this.parseSigned();
    }
    return this.parseImplicit();
  }

  startsFactor(t: Tok | undefined): boolean {
    if (!t) return false;
    if (t.k === 'num' || t.k === 'let') return true;
    if (t.k === 'sym') return t.s === '(' || t.s === '[' || t.s === '{' || (t.s === '|' && this.absDepth === 0);
    return !STOP_CMDS.has(t.s);
  }

  parseImplicit(stopAtFunctions = false): Node {
    const factors: Node[] = [this.parsePostfix()];
    while (this.startsFactor(this.peek())) {
      if (stopAtFunctions && this.isFunctionStart()) break;
      factors.push(this.parsePostfix());
    }
    return factors.length === 1 ? factors[0] : mul(...factors);
  }

  isFunctionStart(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.k === 'cmd') return t.s in FUNCS && t.s !== 'sqrt';
    return t.k === 'let' && this.plainFunction() !== null;
  }

  /** A plain-letter function name followed by a bracket at the cursor, e.g. "exp(". */
  plainFunction(): string | null {
    let run = '';
    for (let o = 0; o < 6; o++) {
      const t = this.peek(o);
      if (!t || t.k !== 'let') break;
      run += t.s;
    }
    for (const name of PLAIN_FUNCS) {
      if (!run.startsWith(name)) continue;
      const after = this.peek(name.length);
      if (after && ((after.k === 'sym' && after.s === '(') || (after.k === 'cmd' && (after.s === 'left' || after.s === 'mleft')))) return name;
    }
    return null;
  }

  parsePostfix(): Node {
    let base = this.parseAtom();
    while (this.isSym('^')) {
      this.pos++;
      base = pow(base, this.parseScript());
    }
    if (this.isSym('!')) throw new MathError('Factorials are not supported.', 'unsupported');
    return base;
  }

  /** Argument of ^, _ , \frac, \sqrt: a braced group or a single token. */
  parseScript(): Node {
    const t = this.peek();
    if (!t) throw new MathError('Something is missing after "^".');
    if (t.k === 'sym' && t.s === '{') {
      this.pos++;
      if (this.isSym('}')) throw new MathError('There is an empty box in the expression.');
      const e = this.parseExpr();
      this.expectSym('}');
      return e;
    }
    if (t.k === 'num') {
      // LaTeX takes a single digit: x^23 is x^2 times 3
      if (t.s.length > 1) {
        const d = t.s[0];
        this.toks[this.pos] = { k: 'num', s: t.s.slice(1) };
        return num(parseFloat(d));
      }
      this.pos++;
      return num(parseFloat(t.s));
    }
    if (t.k === 'sym' && t.s === '-') {
      this.pos++;
      return neg(this.parseScript());
    }
    return this.parseAtom();
  }

  /** Raw text of a subscript, used as part of a symbol name. */
  readSubscript(): string {
    const t = this.next();
    const one = (k: Tok): string => {
      if (k.k === 'num' || k.k === 'let') return k.s;
      if (k.k === 'cmd') {
        if (GREEK[k.s]) return GREEK[k.s];
        if (k.s === 'ast' || k.s === 'star') return '*';
        if (k.s === 'infty') return 'inf';
        if (k.s === 'perp') return 'perp';
        if (k.s === 'parallel') return 'par';
        return '';
      }
      if (k.s === '*' || k.s === ',' || k.s === '+' || k.s === '-') return k.s;
      return '';
    };
    if (t.k === 'sym' && t.s === '{') {
      let depth = 1;
      let out = '';
      for (;;) {
        const k = this.next();
        if (k.k === 'sym' && k.s === '{') depth++;
        else if (k.k === 'sym' && k.s === '}') {
          if (--depth === 0) break;
        } else out += one(k);
      }
      if (!out) throw new MathError('A subscript is empty.');
      return out;
    }
    if (t.k === 'num' && t.s.length > 1) {
      this.pos--;
      this.toks[this.pos] = { k: 'num', s: t.s.slice(1) };
      return t.s[0];
    }
    const s = one(t);
    if (!s) throw new MathError('A subscript could not be read.');
    return s;
  }

  /** Subscripts, primes and stars that belong to a symbol name. */
  parseSuffix(base: string): string {
    let subText = '';
    let marks = '';
    for (;;) {
      if (this.isSym('_')) {
        this.pos++;
        subText += this.readSubscript();
        continue;
      }
      if (this.isSym("'")) {
        this.pos++;
        marks += "'";
        continue;
      }
      if (this.isSym('^')) {
        const a = this.peek(1);
        const isMark = (k?: Tok) => !!k && ((k.k === 'sym' && k.s === '*') || (k.k === 'cmd' && (k.s === 'ast' || k.s === 'star' || k.s === 'prime')));
        const markOf = (k: Tok) => (k.k === 'cmd' && k.s === 'prime' ? "'" : '*');
        if (isMark(a)) {
          marks += markOf(a!);
          this.pos += 2;
          continue;
        }
        if (a && a.k === 'sym' && a.s === '{' && isMark(this.peek(2)) && this.isSym('}', 3)) {
          marks += markOf(this.peek(2)!);
          this.pos += 4;
          continue;
        }
      }
      break;
    }
    return base + (subText ? '_' + subText : '') + marks;
  }

  /** Letters inside \text{...}, \mathrm{...}, \operatorname{...}. */
  readText(): string {
    if (!this.isSym('{')) {
      const t = this.next();
      return t.k === 'let' || t.k === 'num' ? t.s : '';
    }
    this.pos++;
    let out = '';
    let depth = 1;
    for (;;) {
      const k = this.next();
      if (k.k === 'sym' && k.s === '{') depth++;
      else if (k.k === 'sym' && k.s === '}') {
        if (--depth === 0) break;
      } else if (k.k === 'let' || k.k === 'num') out += k.s;
    }
    return out;
  }

  parseFunction(name: string): Node {
    const f = FUNCS[name];
    let power: Node | null = null;
    let base: Node | null = null;
    for (;;) {
      if (this.isSym('^') && !power) {
        this.pos++;
        power = this.parseScript();
      } else if (this.isSym('_') && !base && f === 'log') {
        this.pos++;
        base = this.parseScript();
      } else break;
    }
    const arg = this.parseFunctionArg(name);
    let node: Node;
    if (f === 'log') {
      if (base && base.t === 'num' && base.v === 10) node = fn('log10', arg);
      else if (base) node = div(fn('ln', arg), fn('ln', base));
      else node = fn('ln', arg);
    } else node = fn(f, arg);
    if (power) {
      const isMinusOne = (power.t === 'neg' && power.x.t === 'num' && power.x.v === 1) || (power.t === 'num' && power.v === -1);
      if (isMinusOne && node.t === 'fn' && INVERSE[node.name]) return fn(INVERSE[node.name]!, arg);
      return pow(node, power);
    }
    return node;
  }

  parseFunctionArg(name: string): Node {
    const t = this.peek();
    if (!t) throw new MathError(`"${name}" needs something to act on.`);
    if (t.k === 'sym' && t.s === '(') {
      this.pos++;
      const e = this.parseExpr();
      this.expectSym(')');
      return e;
    }
    if ((t.k === 'cmd' && (t.s === 'left' || t.s === 'mleft')) || (t.k === 'sym' && t.s === '{')) return this.parseAtom();
    if (!this.startsFactor(t)) throw new MathError(`"${name}" needs something to act on.`);
    // \cos \omega t  reads as cos(ωt)
    return this.parseImplicit(true);
  }

  parseAtom(): Node {
    const t = this.next();
    if (t.k === 'num') {
      const v = parseFloat(t.s);
      if (!isFinite(v)) throw new MathError(`"${t.s}" is not a number.`);
      return num(v);
    }
    if (t.k === 'let') {
      this.pos--;
      const f = this.plainFunction();
      if (f) {
        this.pos += f.length;
        return this.parseFunction(f);
      }
      this.pos++;
      if (t.s === 'e' && this.isSym('^')) return E;
      return sym(this.parseSuffix(t.s));
    }
    if (t.k === 'sym') {
      if (t.s === '(' || t.s === '[' || t.s === '{') {
        const close = t.s === '(' ? ')' : t.s === '[' ? ']' : '}';
        if (this.isSym(close)) throw new MathError(t.s === '{' ? 'There is an empty box in the expression.' : 'There are empty brackets in the expression.');
        const saved = this.absDepth;
        this.absDepth = 0;
        const e = this.parseExpr();
        this.absDepth = saved;
        this.expectSym(close);
        return e;
      }
      if (t.s === '|') {
        this.absDepth++;
        const e = this.parseExpr();
        this.absDepth--;
        this.expectSym('|');
        return fn('abs', e);
      }
      if (t.s === '-') return neg(this.parsePostfix());
      throw new MathError(`Did not expect "${t.s}" here.`);
    }
    // commands
    const c = t.s;
    if (UNSUPPORTED[c]) throw new MathError(UNSUPPORTED[c], 'unsupported');
    if (c === 'pi') return PI;
    if (c === 'infty') return { t: 'const', name: 'inf' };
    if (c === 'exponentialE') return E;
    if (c === 'imaginaryI') return sym(this.parseSuffix('i'));
    if (c === 'differentialD') return sym(this.parseSuffix('d'));
    if (c === 'placeholder') {
      if (this.isSym('{')) this.readText();
      throw new MathError('Fill in the empty box first.');
    }
    if (c === 'frac' || c === 'dfrac' || c === 'tfrac' || c === 'cfrac') {
      const n = this.parseScript();
      const d = this.parseScript();
      return div(n, d);
    }
    if (c === 'sqrt') {
      if (this.isSym('[')) {
        this.pos++;
        const k = this.parseExpr();
        this.expectSym(']');
        return pow(this.parseScript(), div(num(1), k));
      }
      return fn('sqrt', this.parseScript());
    }
    if (c === 'left' || c === 'mleft') {
      const d = this.next();
      const open = d.k === 'cmd' ? d.s : d.s;
      const isAbs = open === '|' || open === 'lvert' || open === 'vert';
      const saved = this.absDepth;
      this.absDepth = 0;
      const e = this.parseExpr();
      this.absDepth = saved;
      if (!(this.isCmd('right') || this.isCmd('mright'))) throw new MathError('A bracket is not closed.');
      this.pos++;
      this.next(); // closing delimiter
      return isAbs ? fn('abs', e) : e;
    }
    if (c === 'lbrace') {
      const e = this.parseExpr();
      if (!this.isCmd('rbrace')) throw new MathError('A brace is not closed.');
      this.pos++;
      return e;
    }
    if (c in FUNCS) return this.parseFunction(c);
    if (GREEK[c]) return sym(this.parseSuffix(GREEK[c]));
    if (c === 'Delta') {
      const nx = this.peek();
      if (nx && (nx.k === 'let' || (nx.k === 'cmd' && (GREEK[nx.s] || PLAIN_WRAP.has(nx.s))))) {
        const inner = this.parseAtom();
        if (inner.t === 'sym') return sym('Delta:' + inner.name);
        return mul(sym('Delta'), inner);
      }
      return sym(this.parseSuffix('Delta'));
    }
    if (TEXT_CMDS.has(c)) {
      const text = this.readText();
      if (!text) throw new MathError('A text box is empty.');
      if (text in FUNCS) return this.parseFunction(text);
      if (text === 'e' && this.isSym('^')) return E;
      return sym(this.parseSuffix(text));
    }
    if (PLAIN_WRAP.has(c) || DECOR[c]) {
      let inner: Node;
      if (this.isSym('{')) {
        this.pos++;
        inner = this.parseExpr();
        this.expectSym('}');
      } else inner = this.parseAtom();
      if (inner.t !== 'sym') {
        if (DECOR[c]) throw new MathError(`"\\${c}" can only decorate a single symbol.`);
        return inner;
      }
      const name = DECOR[c] ? `${DECOR[c]}:${inner.name}` : inner.name;
      // a subscript after the decoration belongs to the same symbol: \vec{F}_B
      return sym(this.parseSuffix(name));
    }
    if (c === 'right' || c === 'mright') throw new MathError('A bracket is closed without being opened.');
    throw new MathError(`"\\${c}" is not supported.`, 'unsupported');
  }
}

function describe(t: Tok): string {
  return t.k === 'cmd' ? '\\' + t.s : t.s;
}

/** Parse LaTeX into an expression tree. Throws MathError with a readable message. */
export function parse(latex: string): Node {
  return new Parser(tokenize(latex)).parseTop();
}

/** Parse, returning either the tree or the error message. */
export function tryParse(latex: string): { node: Node; error?: undefined } | { node?: undefined; error: string } {
  try {
    return { node: parse(latex) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

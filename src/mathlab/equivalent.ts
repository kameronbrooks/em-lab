// Decide whether two expressions are algebraically the same by evaluating both at random points.
// This accepts any equivalent form of an answer (factored, expanded, k vs 1/(4πε₀), ...).

import { Node, hasPm, sub, variables } from './ast';
import { Env, evaluate } from './evaluate';
import { parse } from './parse';
import { simplify } from './simplify';

export interface EquivOpts {
  /** Also accept answers that differ only by an overall minus sign. */
  allowSign?: boolean;
  /** Seed for the random test points (results are reproducible for a given seed). */
  seed?: number;
}

export interface EquivResult {
  equal: boolean;
  /** Why not: off by a sign, off by a constant factor, different, or unreadable. */
  reason?: 'sign' | 'factor' | 'different' | 'error';
  /** For reason 'factor': answer a divided by answer b. */
  factor?: number;
  /** Variables that appear in only one of the two (after simplifying). */
  missing?: string[];
  extra?: string[];
  error?: string;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "x = expr" is compared by its right-hand side; other equations by left − right. */
function comparable(n: Node): { node: Node; isResidual: boolean } {
  if (n.t !== 'eq') return { node: n, isResidual: false };
  if (n.l.t === 'sym') return { node: n.r, isResidual: false };
  if (n.r.t === 'sym') return { node: n.l, isResidual: false };
  return { node: sub(n.l, n.r), isResidual: true };
}

function toNode(x: string | Node): Node {
  return typeof x === 'string' ? parse(x) : x;
}

/**
 * Compare two expressions (LaTeX strings or parsed trees).
 * `a` is the candidate (student answer), `b` the reference.
 */
export function equivalent(a: string | Node, b: string | Node, opts: EquivOpts = {}): EquivResult {
  let A: { node: Node; isResidual: boolean }, B: { node: Node; isResidual: boolean };
  try {
    A = comparable(toNode(a));
    B = comparable(toNode(b));
  } catch (e) {
    return { equal: false, reason: 'error', error: e instanceof Error ? e.message : String(e) };
  }
  const names = [...new Set([...variables(A.node), ...variables(B.node)])];
  const rng = mulberry32(opts.seed ?? 20241117);
  const pms: (1 | -1)[] = hasPm(A.node) || hasPm(B.node) ? [1, -1] : [1];
  const residualMode = A.isResidual || B.isResidual;

  let valid = 0, same = 0, negated = 0;
  let ratio: number | null = null;
  let ratioConstant = true;
  const ranges: [number, number][] = [[0.6, 2.6], [0.05, 0.95], [1.5, 9]];
  for (const [lo, hi] of ranges) {
    for (let i = 0; i < 8; i++) {
      const env: Env = {};
      for (const n of names) env[n] = lo + rng() * (hi - lo);
      // physical constants that are tied to each other
      if (names.includes('k') && names.includes('epsilon_0')) env.k = 1 / (4 * Math.PI * env.epsilon_0);
      if (names.includes('c') && names.includes('epsilon_0') && names.includes('mu_0')) env.c = 1 / Math.sqrt(env.epsilon_0 * env.mu_0);
      for (const pm of pms) {
        let va: number, vb: number;
        try {
          va = evaluate(A.node, env, { pm, constants: false });
          vb = evaluate(B.node, env, { pm, constants: false });
        } catch (e) {
          return { equal: false, reason: 'error', error: e instanceof Error ? e.message : String(e) };
        }
        if (!isFinite(va) && !isFinite(vb)) continue;
        valid++;
        if (!isFinite(va) || !isFinite(vb)) {
          ratioConstant = false;
          continue;
        }
        const scale = Math.max(Math.abs(va), Math.abs(vb), 1e-300);
        const tol = 1e-7 * scale + 1e-12;
        if (Math.abs(va - vb) <= tol) same++;
        if (Math.abs(va + vb) <= tol) negated++;
        if (Math.abs(vb) > 1e-300) {
          const q = va / vb;
          if (ratio === null) ratio = q;
          else if (Math.abs(q - ratio) > 1e-6 * Math.max(Math.abs(q), Math.abs(ratio))) ratioConstant = false;
        } else if (Math.abs(va) > tol) ratioConstant = false;
      }
    }
    if (valid >= 6) break;
  }

  if (valid < 3) {
    return { equal: false, reason: 'error', error: 'These expressions could not be evaluated to compare them.' };
  }
  if (same === valid) return { equal: true };
  if (residualMode && ratioConstant && ratio !== null && isFinite(ratio) && Math.abs(ratio) > 1e-12) return { equal: true };
  if (negated === valid) return opts.allowSign ? { equal: true } : { equal: false, reason: 'sign' };

  const result: EquivResult = { equal: false, reason: 'different' };
  if (ratioConstant && ratio !== null && isFinite(ratio) && Math.abs(ratio) > 1e-12) {
    result.reason = 'factor';
    result.factor = ratio;
  }
  try {
    const va = variables(simplify(A.node)), vb = variables(simplify(B.node));
    result.missing = vb.filter((n) => !va.includes(n));
    result.extra = va.filter((n) => !vb.includes(n));
  } catch {
    /* optional detail */
  }
  return result;
}

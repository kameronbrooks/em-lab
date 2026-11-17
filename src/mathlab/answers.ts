// Checking a typed answer against a reference expression, with feedback a student can act on.

import { Node, mapChildren, sym } from './ast';
import { equivalent } from './equivalent';
import { parse } from './parse';
import { symTex } from './print';
import { toFraction } from './simplify';

export interface AnswerSpec {
  /** Reference answer (LaTeX). */
  expr: string;
  /** Accept an answer that differs only by an overall sign. */
  allowSign?: boolean;
  /** Other names a student might type for a symbol: { typed: canonical }. */
  aliases?: Record<string, string>;
}

export type AnswerVerdict =
  | { ok: true }
  | { ok: false; kind: 'empty' | 'syntax' | 'sign' | 'factor' | 'different'; message: string };

function rename(n: Node, aliases: Record<string, string>): Node {
  if (n.t === 'sym') return aliases[n.name] ? sym(aliases[n.name]) : n;
  return mapChildren(n, (c) => rename(c, aliases));
}

function factorText(f: number): string {
  const fr = toFraction(f, 24);
  if (fr) return fr[1] === 1 ? `${fr[0]}` : `${fr[0]}/${fr[1]}`;
  const overPi = toFraction(f / Math.PI, 12);
  if (overPi) return `${overPi[0] === 1 ? '' : overPi[0]}π${overPi[1] === 1 ? '' : '/' + overPi[1]}`;
  const timesPi = toFraction(f * Math.PI, 12);
  if (timesPi) return `${timesPi[0]}/${timesPi[1] === 1 ? '' : timesPi[1]}π`;
  return Number(f.toPrecision(3)).toString();
}

const list = (names: string[]) => names.map((n) => `$${symTex(n)}$`).join(', ');

/**
 * Check a typed LaTeX answer. Any algebraically equal form is accepted.
 * If the student types "something = answer", the right-hand side is checked.
 * Messages may contain inline LaTeX between dollar signs.
 */
export function checkAnswer(input: string, spec: AnswerSpec): AnswerVerdict {
  if (!input.trim()) return { ok: false, kind: 'empty', message: 'Type your answer first.' };
  let node: Node;
  try {
    node = parse(input);
  } catch (e) {
    return { ok: false, kind: 'syntax', message: e instanceof Error ? e.message : String(e) };
  }
  if (node.t === 'eq') node = node.r;
  if (spec.aliases) node = rename(node, spec.aliases);
  const r = equivalent(node, spec.expr, { allowSign: spec.allowSign });
  if (r.equal) return { ok: true };
  if (r.reason === 'error') return { ok: false, kind: 'syntax', message: r.error ?? 'This answer could not be read.' };
  if (r.reason === 'sign') return { ok: false, kind: 'sign', message: 'Right size, wrong sign. Check the direction.' };
  if (r.reason === 'factor' && r.factor !== undefined) {
    return {
      ok: false,
      kind: 'factor',
      message: `Close. Your answer is ${factorText(r.factor)} times the expected one, so look for a missing or extra constant factor.`,
    };
  }
  const parts: string[] = [];
  if (r.missing?.length) parts.push(`The expected answer depends on ${list(r.missing)}, which yours does not use.`);
  if (r.extra?.length) parts.push(`Your answer contains ${list(r.extra)}, which should not appear.`);
  if (!parts.length) parts.push('It has the right variables but they are combined differently. Check the powers and what is in the denominator.');
  return { ok: false, kind: 'different', message: `Not equal to the expected answer. ${parts.join(' ')}` };
}

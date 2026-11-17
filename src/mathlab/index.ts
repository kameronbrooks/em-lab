// mathlab: LaTeX in, maths out.
//
//   parse(latex)                 -> expression tree (throws MathError with a readable message)
//   variables(node)              -> free variables in order of appearance
//   evaluate(node, env)          -> number (ε₀, μ₀, c, k default to SI values)
//   simplify(node) / expand(node)
//   derivative(node, 'x')        -> symbolic derivative
//   solveFor(equation, 'x', env) -> exact solutions, or numeric roots when no exact form is found
//   integrate(node, 'x', a, b)   -> numeric definite integral
//   equivalent(a, b)             -> are two answers algebraically the same?
//   toTex(node) / toPrettyTex(node) / symTex(name)

export * from './ast';
export { parse, tryParse } from './parse';
export { evaluate, compile1, applyFn, realPow } from './evaluate';
export type { Env, EvalOpts } from './evaluate';
export { simplify, expand, isZero, toFraction } from './simplify';
export { toTex, toPrettyTex, toDisplay, symTex, numTex } from './print';
export { derivative, integrate } from './calculus';
export type { IntegralResult } from './calculus';
export { solveFor, findRoots, randomEnv } from './solve';
export type { SolveResult } from './solve';
export { equivalent } from './equivalent';
export type { EquivOpts, EquivResult } from './equivalent';

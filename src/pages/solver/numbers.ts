import { evaluate, parse } from '../../mathlab';

/**
 * Read a number typed into a plain text box. Accepts 12, 1.6e-19, 3*10^8, 1/2, pi, 2pi, inf.
 * Returns null if the text is empty or not a number.
 */
export function parseNumber(text: string | undefined): number | null {
  const t = (text ?? '').trim().replace(/−/g, '-');
  if (!t) return null;
  const direct = Number(t);
  if (!isNaN(direct)) return direct;
  try {
    const src = t
      .replace(/inf(inity)?/gi, '\\infty ')
      .replace(/pi|π/g, '\\pi ')
      .replace(/(\d(?:\.\d+)?)[eE]([-+]?\d+)/g, '$1\\cdot 10^{$2}')
      .replace(/\*\*/g, '^');
    const v = evaluate(parse(src), {}, { constants: false });
    return isNaN(v) ? null : v;
  } catch {
    return null;
  }
}

import { describe, expect, it } from 'vitest';
import { ceSimplify } from './ce';
import { equivalent, parse, toPrettyTex, variables } from './index';

describe('Compute Engine bridge', () => {
  it('simplifies without confusing i / e / E with constants', async () => {
    for (const tex of [
      'v - iR + 2iR',
      String.raw`\frac{L i^2}{2} + \frac{L i^2}{2}`,
      String.raw`\frac{x^2-1}{x-1}`,
      String.raw`q_0 e^{-t/RC} \cdot e^{t/RC}`,
      String.raw`E d + e d`,
      String.raw`\sqrt{\frac{4L}{C}}`,
      String.raw`\sin^2\theta + \cos^2\theta`,
    ]) {
      const n = parse(tex);
      const out = await ceSimplify(n);
      // null means "no help", which is acceptable; a result must be equivalent and use the same names
      if (out) {
        expect(equivalent(out, n).equal, tex).toBe(true);
        for (const v of variables(out)) expect(variables(n), `${tex} -> ${toPrettyTex(out)}`).toContain(v);
      }
    }
  });
  it('returns something for a basic case', async () => {
    const out = await ceSimplify(parse('v - iR + 2iR'));
    expect(out).not.toBeNull();
  });
});

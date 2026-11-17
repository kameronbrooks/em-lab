import { describe, expect, it } from 'vitest';
import { boxGeo, sphereGeo } from '../engine/mesh';
import { FLUX_UNIT, fluxThroughMesh } from './flux';

/** Scale + translate unit geometry and orient every triangle outward from `center`. */
function closed(geo: { positions: number[]; indices: number[] }, size: number, center: [number, number, number]) {
  const pos = new Float32Array(geo.positions.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = geo.positions[i] * size + center[0];
    pos[i + 1] = geo.positions[i + 1] * size + center[1];
    pos[i + 2] = geo.positions[i + 2] * size + center[2];
  }
  const idx = geo.indices.slice();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (pos[a] + pos[b] + pos[c]) / 3 - center[0];
    const my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3 - center[1];
    const mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 - center[2];
    if (nx * mx + ny * my + nz * mz < 0) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  }
  return { pos, idx };
}

describe('Gauss flux', () => {
  it('sphere around a charge gives q/eps0, even off-centre', () => {
    const { pos, idx } = closed(sphereGeo(12, 16), 2, [0, 0, 0]);
    const f = fluxThroughMesh(pos, idx, [{ x: 0.9, y: -0.4, z: 0.3, q: 3 }]);
    expect(f.total / FLUX_UNIT).toBeCloseTo(3, 4);
  });

  it('charge outside a sphere gives zero flux (Problem 5)', () => {
    const { pos, idx } = closed(sphereGeo(12, 16), 1, [3, 0, 0]);
    const f = fluxThroughMesh(pos, idx, [{ x: 0, y: 0, z: 0, q: 1 }]);
    expect(Math.abs(f.total / FLUX_UNIT)).toBeLessThan(1e-4);
  });

  it('each face of a cube gets q/(6 eps0) from a central charge (Problem 12)', () => {
    const geo = boxGeo(2);
    const { pos, idx } = closed(geo, 1, [0, 0, 0]);
    const f = fluxThroughMesh(pos, idx, [{ x: 0, y: 0, z: 0, q: 1 }]);
    const perFace = f.perTri.length / 6;
    for (let face = 0; face < 6; face++) {
      let s = 0;
      for (let t = 0; t < perFace; t++) s += f.perTri[face * perFace + t];
      expect(s / FLUX_UNIT).toBeCloseTo(1 / 6, 4);
    }
  });

  it('2q and -q inside a cube give q/eps0 (Problem 15)', () => {
    const { pos, idx } = closed(boxGeo(1), 1, [0, 0, 0]);
    const f = fluxThroughMesh(pos, idx, [
      { x: 0.9, y: 0.9, z: 0.9, q: 2 },
      { x: -0.9, y: -0.9, z: -0.9, q: -1 },
    ]);
    expect(f.total / FLUX_UNIT).toBeCloseTo(1, 4);
  });

  it('uniform field through a tilted closed cube is zero (Problem 6)', () => {
    const { pos, idx } = closed(boxGeo(1), 1.3, [0.5, 0.2, -1]);
    const f = fluxThroughMesh(pos, idx, [], [0.3, 5, -0.7]);
    expect(Math.abs(f.total)).toBeLessThan(1e-4);
  });
});

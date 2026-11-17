import { GL } from './gl';
import { V3, cross, norm, sub } from './math';

export interface Geometry {
  positions: number[];
  normals: number[];
  indices: number[];
}

/** A static triangle mesh with optional per-vertex colours that can be updated every frame. */
export class Mesh {
  vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private nbo: WebGLBuffer;
  private cbo: WebGLBuffer;
  private ibo: WebGLBuffer;
  count: number;
  vertexCount: number;
  /** Centroid in model space, used for back-to-front sorting of transparent meshes. */
  centroid: V3 = [0, 0, 0];

  constructor(readonly gl: GL, geo: Geometry, colors?: Float32Array) {
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.nbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    this.vertexCount = geo.positions.length / 3;
    this.cbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cbo);
    const col = colors ?? new Float32Array(this.vertexCount * 4).fill(1);
    gl.bufferData(gl.ARRAY_BUFFER, col, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    this.ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(geo.indices), gl.STATIC_DRAW);
    this.count = geo.indices.length;
    gl.bindVertexArray(null);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < geo.positions.length; i += 3) {
      cx += geo.positions[i]; cy += geo.positions[i + 1]; cz += geo.positions[i + 2];
    }
    const n = Math.max(1, this.vertexCount);
    this.centroid = [cx / n, cy / n, cz / n];
  }

  /** Replace per-vertex RGBA colours (length = vertexCount * 4). */
  setColors(colors: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.nbo);
    gl.deleteBuffer(this.cbo);
    gl.deleteBuffer(this.ibo);
  }
}

/** Unit sphere centred at the origin. */
export function sphereGeo(rings = 24, sectors = 36): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let r = 0; r <= rings; r++) {
    const th = (r / rings) * Math.PI;
    for (let s = 0; s <= sectors; s++) {
      const ph = (s / sectors) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      g.positions.push(x, y, z);
      g.normals.push(x, y, z);
    }
  }
  const w = sectors + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * w + s, b = a + w;
      g.indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return g;
}

/** Axis-aligned box from -1..1 on each axis. Each face has its own 4 vertices (flat normals). `div` subdivides faces. */
export function boxGeo(div = 1): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  const faces: [V3, V3, V3][] = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  for (const [n, u, v] of faces) {
    const base = g.positions.length / 3;
    for (let i = 0; i <= div; i++) {
      for (let j = 0; j <= div; j++) {
        const a = (i / div) * 2 - 1, b = (j / div) * 2 - 1;
        g.positions.push(n[0] + u[0] * a + v[0] * b, n[1] + u[1] * a + v[1] * b, n[2] + u[2] * a + v[2] * b);
        g.normals.push(n[0], n[1], n[2]);
      }
    }
    const w = div + 1;
    for (let i = 0; i < div; i++) {
      for (let j = 0; j < div; j++) {
        const p = base + i * w + j;
        g.indices.push(p, p + w, p + 1, p + 1, p + w, p + w + 1);
      }
    }
  }
  return g;
}

/** Cylinder of radius 1 along +Y from y=0 to y=1. */
export function cylinderGeo(sectors = 40, capped = true, rings = 1): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let r = 0; r <= rings; r++) {
    const y = r / rings;
    for (let s = 0; s <= sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      const x = Math.cos(a), z = Math.sin(a);
      g.positions.push(x, y, z);
      g.normals.push(x, 0, z);
    }
  }
  const w = sectors + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * w + s, b = a + w;
      g.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  if (capped) {
    for (const y of [0, 1]) {
      const base = g.positions.length / 3;
      g.positions.push(0, y, 0);
      g.normals.push(0, y ? 1 : -1, 0);
      for (let s = 0; s <= sectors; s++) {
        const a = (s / sectors) * Math.PI * 2;
        g.positions.push(Math.cos(a), y, Math.sin(a));
        g.normals.push(0, y ? 1 : -1, 0);
      }
      for (let s = 0; s < sectors; s++) g.indices.push(base, base + 1 + s, base + 2 + s);
    }
  }
  return g;
}

/** Cone with base radius 1 at y=0 and tip at y=1. */
export function coneGeo(sectors = 28): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let s = 0; s <= sectors; s++) {
    const a = (s / sectors) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    const n = norm([x, 1, z]);
    g.positions.push(x, 0, z, 0, 1, 0);
    g.normals.push(n[0], n[1], n[2], n[0], n[1], n[2]);
  }
  for (let s = 0; s < sectors; s++) g.indices.push(s * 2, s * 2 + 1, s * 2 + 2);
  const base = g.positions.length / 3;
  g.positions.push(0, 0, 0);
  g.normals.push(0, -1, 0);
  for (let s = 0; s <= sectors; s++) {
    const a = (s / sectors) * Math.PI * 2;
    g.positions.push(Math.cos(a), 0, Math.sin(a));
    g.normals.push(0, -1, 0);
  }
  for (let s = 0; s < sectors; s++) g.indices.push(base, base + 2 + s, base + 1 + s);
  return g;
}

/** Flat square in the xz plane from -1..1, normal +Y. */
export function planeGeo(div = 1): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let i = 0; i <= div; i++) {
    for (let j = 0; j <= div; j++) {
      g.positions.push((i / div) * 2 - 1, 0, (j / div) * 2 - 1);
      g.normals.push(0, 1, 0);
    }
  }
  const w = div + 1;
  for (let i = 0; i < div; i++) {
    for (let j = 0; j < div; j++) {
      const p = i * w + j;
      g.indices.push(p, p + 1, p + w, p + 1, p + w + 1, p + w);
    }
  }
  return g;
}

/** Flat disc (or annulus) in the xz plane, outer radius 1, normal +Y. */
export function discGeo(sectors = 48, inner = 0, rings = 1): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let r = 0; r <= rings; r++) {
    const rad = inner + ((1 - inner) * r) / rings;
    for (let s = 0; s <= sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      g.positions.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      g.normals.push(0, 1, 0);
    }
  }
  const w = sectors + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * w + s, b = a + w;
      g.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return g;
}

/** Torus in the xz plane with major radius 1 and tube radius `tube`. */
export function torusGeo(tube = 0.05, sectors = 64, sides = 12): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let s = 0; s <= sectors; s++) {
    const a = (s / sectors) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    for (let t = 0; t <= sides; t++) {
      const b = (t / sides) * Math.PI * 2;
      const nx = Math.cos(b) * cx, ny = Math.sin(b), nz = Math.cos(b) * cz;
      g.positions.push(cx + tube * nx, tube * ny, cz + tube * nz);
      g.normals.push(nx, ny, nz);
    }
  }
  const w = sides + 1;
  for (let s = 0; s < sectors; s++) {
    for (let t = 0; t < sides; t++) {
      const a = s * w + t, b = a + w;
      g.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return g;
}

/** Recompute flat normals for arbitrary triangle soup (positions + indices). */
export function flatNormals(positions: number[], indices: number[]): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let i = 0; i < indices.length; i += 3) {
    const p = [0, 1, 2].map((k) => {
      const j = indices[i + k] * 3;
      return [positions[j], positions[j + 1], positions[j + 2]] as V3;
    });
    const n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    for (const q of p) {
      g.positions.push(q[0], q[1], q[2]);
      g.normals.push(n[0], n[1], n[2]);
      g.indices.push(g.indices.length);
    }
  }
  return g;
}

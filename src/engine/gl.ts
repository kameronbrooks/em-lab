// Thin WebGL2 helpers: shader programs with cached uniform locations.

export type GL = WebGL2RenderingContext;

function compile(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error: ${log}\n${src}`);
  }
  return sh;
}

export class Program {
  readonly prog: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();

  constructor(readonly gl: GL, vs: string, fs: string) {
    const v = compile(gl, gl.VERTEX_SHADER, vs);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    this.prog = p;
  }

  use() {
    this.gl.useProgram(this.prog);
    return this;
  }

  loc(name: string) {
    let l = this.locs.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, name);
      this.locs.set(name, l);
    }
    return l;
  }

  f1(name: string, x: number) { this.gl.uniform1f(this.loc(name), x); return this; }
  f2(name: string, x: number, y: number) { this.gl.uniform2f(this.loc(name), x, y); return this; }
  f3(name: string, x: number, y: number, z: number) { this.gl.uniform3f(this.loc(name), x, y, z); return this; }
  f4(name: string, x: number, y: number, z: number, w: number) { this.gl.uniform4f(this.loc(name), x, y, z, w); return this; }
  i1(name: string, x: number) { this.gl.uniform1i(this.loc(name), x); return this; }
  fv1(name: string, v: Float32Array | number[]) { this.gl.uniform1fv(this.loc(name), v); return this; }
  fv2(name: string, v: Float32Array | number[]) { this.gl.uniform2fv(this.loc(name), v); return this; }
  fv3(name: string, v: Float32Array | number[]) { this.gl.uniform3fv(this.loc(name), v); return this; }
  fv4(name: string, v: Float32Array | number[]) { this.gl.uniform4fv(this.loc(name), v); return this; }
  m4(name: string, m: Float32Array) { this.gl.uniformMatrix4fv(this.loc(name), false, m); return this; }

  dispose() {
    this.gl.deleteProgram(this.prog);
  }
}

/** Growable float buffer for per-frame instance data. */
export class FloatBuf {
  data: Float32Array;
  n = 0;
  constructor(initial = 4096) {
    this.data = new Float32Array(initial);
  }
  reserve(extra: number) {
    if (this.n + extra > this.data.length) {
      const next = new Float32Array(Math.max(this.data.length * 2, this.n + extra));
      next.set(this.data.subarray(0, this.n));
      this.data = next;
    }
  }
  reset() {
    this.n = 0;
  }
}

/** Vertex shader for full-screen passes. Outputs vNdc in [-1, 1] and vUV in [0, 1]. */
export const FULLSCREEN_VS = `#version 300 es
out vec2 vNdc;
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(vNdc, 0.0, 1.0);
}`;

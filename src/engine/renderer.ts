// Batched immediate-mode WebGL2 renderer.
//
// Labs call seg / arrow / disc / mesh / label every frame; the renderer packs them into
// instance buffers and draws each primitive type with a single instanced draw call per layer.
//
// Layers (draw order, low to high):
//   0..49    normal. In 3D: depth-tested and depth-writing.
//   50..99   translucent. In 3D: depth-tested but not depth-writing (draw glassy things here).
//   100+     overlay. Never depth-tested (gizmos, handles).
// In 2D there is no depth test at all; layers and call order decide what is on top.

import katex from 'katex';
import { Camera } from './camera';
import { RGBA, css } from './colors';
import { FloatBuf, FULLSCREEN_VS, GL, Program } from './gl';
import { Mat4, P, lerp, mat4, transform } from './math';
import { Mesh } from './mesh';

const SEG_STRIDE = 13;
const HEAD_STRIDE = 11;
const DISC_STRIDE = 11;

const SEG_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec3 iA;
layout(location=2) in vec3 iB;
layout(location=3) in vec4 iColor;
layout(location=4) in vec3 iParams; // width px, dash px, cap flags
uniform mat4 uVP;
uniform vec2 uRes;
out vec4 vColor;
out vec2 vP;
out float vLen;
out float vHalfW;
out float vDash;
out float vCap;
void main() {
  vec4 ca = uVP * vec4(iA, 1.0);
  vec4 cb = uVP * vec4(iB, 1.0);
  float eps = 1e-4;
  if (ca.w < eps && cb.w < eps) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (ca.w < eps) { float t = (eps - ca.w) / (cb.w - ca.w); ca = mix(ca, cb, t); }
  else if (cb.w < eps) { float t = (eps - cb.w) / (ca.w - cb.w); cb = mix(cb, ca, t); }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uRes;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uRes;
  vec2 d = sb - sa;
  float L = length(d);
  vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float hw = iParams.x * 0.5 + 1.0;
  float along = corner.x > 0.0 ? L + hw : -hw;
  vec2 p = sa + dir * along + n * corner.y * hw;
  float t = clamp(along / max(L, 1e-5), 0.0, 1.0);
  float z = mix(ca.z / ca.w, cb.z / cb.w, t);
  gl_Position = vec4(p / uRes * 2.0 - 1.0, z, 1.0);
  vP = vec2(along, corner.y * hw);
  vLen = L;
  vHalfW = iParams.x * 0.5;
  vDash = iParams.y;
  vCap = iParams.z;
  vColor = iColor;
}`;

const SEG_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vP;
in float vLen;
in float vHalfW;
in float vDash;
in float vCap;
out vec4 frag;
void main() {
  bool roundStart = mod(vCap, 2.0) > 0.5;
  bool roundEnd = vCap > 1.5;
  float a = 1.0;
  float dx = 0.0;
  if (vP.x < 0.0) {
    if (roundStart) dx = -vP.x; else a *= 1.0 - smoothstep(-0.5, 0.5, -vP.x);
  } else if (vP.x > vLen) {
    if (roundEnd) dx = vP.x - vLen; else a *= 1.0 - smoothstep(-0.5, 0.5, vP.x - vLen);
  }
  float dist = length(vec2(dx, vP.y));
  a *= 1.0 - smoothstep(vHalfW - 0.6, vHalfW + 0.6, dist);
  if (vDash > 0.0) {
    float ph = mod(vP.x, vDash * 2.0);
    a *= 1.0 - smoothstep(vDash - 0.5, vDash + 0.5, ph);
  }
  if (a < 0.01) discard;
  frag = vec4(vColor.rgb, vColor.a * a);
}`;

const HEAD_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec3 iTip;
layout(location=2) in vec3 iFrom;
layout(location=3) in vec4 iColor;
layout(location=4) in float iSize;
uniform mat4 uVP;
uniform vec2 uRes;
out vec4 vColor;
void main() {
  vec4 ct = uVP * vec4(iTip, 1.0);
  vec4 cf = uVP * vec4(iFrom, 1.0);
  if (ct.w < 1e-4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (cf.w < 1e-4) { float t = (1e-4 - cf.w) / (ct.w - cf.w); cf = mix(cf, ct, t); }
  vec2 st = (ct.xy / ct.w * 0.5 + 0.5) * uRes;
  vec2 sf = (cf.xy / cf.w * 0.5 + 0.5) * uRes;
  vec2 d = st - sf;
  float L = length(d);
  vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 p = st + dir * corner.x * iSize + n * corner.y * iSize;
  gl_Position = vec4(p / uRes * 2.0 - 1.0, ct.z / ct.w, 1.0);
  vColor = iColor;
}`;

const HEAD_FS = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 frag;
void main() { frag = vColor; }`;

const DISC_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 iCR;
layout(location=2) in vec4 iColor;
layout(location=3) in vec3 iParams; // style, world-sized flag, extra
uniform mat4 uVP;
uniform vec2 uRes;
uniform vec3 uCamUp;
out vec2 vUV;
out vec4 vColor;
out float vR;
out float vStyle;
out float vExtra;
void main() {
  vec4 c = uVP * vec4(iCR.xyz, 1.0);
  if (c.w < 1e-4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float rpx = iCR.w;
  if (iParams.y > 0.5) {
    vec4 c2 = uVP * vec4(iCR.xyz + uCamUp * iCR.w, 1.0);
    rpx = length((c2.xy / c2.w - c.xy / c.w) * 0.5 * uRes);
  }
  vec2 off = corner * (rpx + 1.5);
  gl_Position = vec4(c.xy / c.w + off / uRes * 2.0, c.z / c.w, 1.0);
  vUV = off;
  vR = rpx;
  vStyle = iParams.x;
  vExtra = iParams.z;
  vColor = iColor;
}`;

const DISC_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
in float vR;
in float vStyle;
in float vExtra;
out vec4 frag;
void main() {
  float d = length(vUV);
  float edge = 1.0 - smoothstep(vR - 0.7, vR + 0.7, d);
  vec3 col = vColor.rgb;
  float a = edge;
  if (vStyle > 0.5 && vStyle < 1.5) {
    vec2 n2 = vUV / max(vR, 1e-3);
    float z = sqrt(max(0.0, 1.0 - dot(n2, n2)));
    vec3 n = vec3(n2, z);
    float diff = max(dot(n, normalize(vec3(-0.45, 0.6, 0.66))), 0.0);
    float spec = pow(max(dot(n, normalize(vec3(-0.3, 0.45, 0.84))), 0.0), 36.0);
    col = col * (0.32 + 0.8 * diff) + vec3(0.55) * spec;
  } else if (vStyle > 1.5 && vStyle < 2.5) {
    a = edge * smoothstep(vR - vExtra - 0.7, vR - vExtra + 0.7, d);
  } else if (vStyle > 2.5) {
    float t = clamp(1.0 - d / max(vR, 1e-3), 0.0, 1.0);
    a = t * t;
  }
  if (a < 0.01) discard;
  frag = vec4(col, vColor.a * a);
}`;

const MESH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
uniform mat4 uVP;
uniform mat4 uModel;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uVP * w;
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
uniform vec4 uTint;
uniform vec3 uEye;
uniform float uUnlit;
uniform float uRim;
out vec4 frag;
void main() {
  vec4 base = vColor * uTint;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEye - vWorld);
  float ndv = dot(N, V);
  if (ndv < 0.0) { N = -N; ndv = -ndv; }
  vec3 L = normalize(vec3(0.35, 0.85, 0.45));
  float diff = max(dot(N, L), 0.0) * 0.55 + max(ndv, 0.0) * 0.35 + 0.28;
  vec3 col = mix(base.rgb * diff, base.rgb, uUnlit);
  float a = base.a;
  if (uRim > 0.0) {
    float rim = pow(1.0 - ndv, 2.5);
    a = clamp(a * (1.0 + uRim * rim), 0.0, 1.0);
    col += base.rgb * rim * 0.35;
  }
  frag = vec4(col, a);
}`;

interface LayerBatch {
  segs: FloatBuf;
  heads: FloatBuf;
  discs: FloatBuf;
}

interface MeshCmd {
  mesh: Mesh;
  model: Mat4;
  tint: RGBA;
  layer: number;
  transparent: boolean;
  unlit: boolean;
  rim: number;
  cull: boolean;
  depth: number;
}

export interface LabelOpts {
  color?: string;
  size?: number;
  align?: 'center' | 'left' | 'right';
  dx?: number;
  dy?: number;
  bold?: boolean;
  /** Render the text as LaTeX through KaTeX. */
  tex?: boolean;
  /** Draw a small dark pill behind the text for legibility. */
  bg?: boolean;
  opacity?: number;
}

export interface DiscOpts {
  /** Radius is in world units instead of pixels. */
  world?: boolean;
  style?: 'flat' | 'sphere' | 'ring' | 'glow';
  /** Ring thickness in pixels (ring style). */
  ring?: number;
}

export interface MeshOpts {
  transparent?: boolean;
  unlit?: boolean;
  /** Fresnel rim strength, makes transparent surfaces look glassy. */
  rim?: number;
  cull?: boolean;
}

const texCache = new Map<string, string>();
function renderTex(src: string): string {
  let h = texCache.get(src);
  if (h === undefined) {
    try {
      h = katex.renderToString(src, { throwOnError: false, output: 'html' });
    } catch {
      h = src;
    }
    texCache.set(src, h);
  }
  return h;
}

interface LabelSlot {
  el: HTMLDivElement;
  text: string;
  tex: boolean;
  styleKey: string;
}

export class Renderer {
  readonly gl: GL;
  /** Viewport size in CSS pixels. */
  width = 1;
  height = 1;
  dpr = 1;
  camera!: Camera;

  private segProg: Program;
  private headProg: Program;
  private discProg: Program;
  private meshProg: Program;
  private quadVbo: WebGLBuffer;
  private triVbo: WebGLBuffer;
  private segVao: WebGLVertexArrayObject;
  private headVao: WebGLVertexArrayObject;
  private discVao: WebGLVertexArrayObject;
  private fsVao: WebGLVertexArrayObject;
  private segBuf: WebGLBuffer;
  private headBuf: WebGLBuffer;
  private discBuf: WebGLBuffer;

  private layers = new Map<number, LayerBatch>();
  private meshCmds: MeshCmd[] = [];
  private currentLayer = 0;
  private cur!: LayerBatch;

  private labelSlots: LabelSlot[] = [];
  private labelCount = 0;
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement, readonly overlay: HTMLElement | null) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.segProg = new Program(gl, SEG_VS, SEG_FS);
    this.headProg = new Program(gl, HEAD_VS, HEAD_FS);
    this.discProg = new Program(gl, DISC_VS, DISC_FS);
    this.meshProg = new Program(gl, MESH_VS, MESH_FS);

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.triVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, -1, 0.42, -1, -0.42]), gl.STATIC_DRAW);

    this.segBuf = gl.createBuffer()!;
    this.headBuf = gl.createBuffer()!;
    this.discBuf = gl.createBuffer()!;
    this.segVao = this.makeVao(this.quadVbo, this.segBuf, SEG_STRIDE, [3, 3, 4, 3]);
    this.headVao = this.makeVao(this.triVbo, this.headBuf, HEAD_STRIDE, [3, 3, 4, 1]);
    this.discVao = this.makeVao(this.quadVbo, this.discBuf, DISC_STRIDE, [4, 4, 3]);
    this.fsVao = gl.createVertexArray()!;
    this.layer(0);
  }

  private makeVao(cornerVbo: WebGLBuffer, instBuf: WebGLBuffer, stride: number, sizes: number[]) {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    let off = 0;
    sizes.forEach((size, i) => {
      gl.enableVertexAttribArray(i + 1);
      gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, stride * 4, off * 4);
      gl.vertexAttribDivisor(i + 1, 1);
      off += size;
    });
    gl.bindVertexArray(null);
    return vao;
  }

  /** Match the drawing buffer to the canvas's CSS size. Returns true if the size changed. */
  resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      return true;
    }
    return false;
  }

  /** Start a frame: set the camera and clear. */
  begin(camera: Camera, clear: RGBA) {
    const gl = this.gl;
    this.resize();
    this.camera = camera;
    camera.update(this.width, this.height);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.depthMask(true);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const b of this.layers.values()) {
      b.segs.reset();
      b.heads.reset();
      b.discs.reset();
    }
    this.meshCmds.length = 0;
    this.labelCount = 0;
    this.layer(0);
  }

  /** Select the layer for subsequent draw calls. */
  layer(n: number) {
    this.currentLayer = n;
    let b = this.layers.get(n);
    if (!b) {
      b = { segs: new FloatBuf(SEG_STRIDE * 256), heads: new FloatBuf(HEAD_STRIDE * 64), discs: new FloatBuf(DISC_STRIDE * 64) };
      this.layers.set(n, b);
    }
    this.cur = b;
  }

  /** Line segment. cap: 3 round both ends, 1 round start only, 2 round end only, 0 butt. */
  seg(a: P, b: P, color: RGBA, width = 2, dash = 0, cap = 3) {
    const buf = this.cur.segs;
    buf.reserve(SEG_STRIDE);
    const d = buf.data;
    let i = buf.n;
    d[i++] = a[0]; d[i++] = a[1]; d[i++] = a[2] ?? 0;
    d[i++] = b[0]; d[i++] = b[1]; d[i++] = b[2] ?? 0;
    d[i++] = color[0]; d[i++] = color[1]; d[i++] = color[2]; d[i++] = color[3];
    d[i++] = width; d[i++] = dash; d[i++] = cap;
    buf.n = i;
  }

  /** Connected line through points. Accepts an array of points or a flat xyz Float32Array. */
  polyline(pts: readonly P[] | Float32Array, color: RGBA, width = 2, closed = false, dash = 0, count?: number) {
    const cap = color[3] >= 0.99 && dash === 0 ? 3 : 0;
    if (pts instanceof Float32Array) {
      const n = count ?? pts.length / 3;
      for (let i = 0; i + 1 < n; i++) {
        const j = i * 3;
        this.seg([pts[j], pts[j + 1], pts[j + 2]], [pts[j + 3], pts[j + 4], pts[j + 5]], color, width, dash, cap);
      }
      if (closed && n > 2) {
        const j = (n - 1) * 3;
        this.seg([pts[j], pts[j + 1], pts[j + 2]], [pts[0], pts[1], pts[2]], color, width, dash, cap);
      }
      return;
    }
    const n = count ?? pts.length;
    for (let i = 0; i + 1 < n; i++) this.seg(pts[i], pts[i + 1], color, width, dash, cap);
    if (closed && n > 2) this.seg(pts[n - 1], pts[0], color, width, dash, cap);
  }

  /** Arrow head only (triangle) with its tip at `tip`, pointing away from `from`. */
  head(tip: P, from: P, color: RGBA, size = 10) {
    const buf = this.cur.heads;
    buf.reserve(HEAD_STRIDE);
    const d = buf.data;
    let i = buf.n;
    d[i++] = tip[0]; d[i++] = tip[1]; d[i++] = tip[2] ?? 0;
    d[i++] = from[0]; d[i++] = from[1]; d[i++] = from[2] ?? 0;
    d[i++] = color[0]; d[i++] = color[1]; d[i++] = color[2]; d[i++] = color[3];
    d[i++] = size;
    buf.n = i;
  }

  /** Arrow from a to b. Head size is in pixels and shrinks automatically for short arrows. */
  arrow(a: P, b: P, color: RGBA, width = 2.5, headSize = 0) {
    const sa = this.camera.project(a);
    const sb = this.camera.project(b);
    if (sa[2] <= 0 || sb[2] <= 0) {
      this.seg(a, b, color, width);
      return;
    }
    const L = Math.hypot(sb[0] - sa[0], sb[1] - sa[1]);
    if (L < 0.75) return;
    let h = headSize || Math.max(9, width * 4.2);
    h = Math.min(h, L * 0.62);
    const t = 1 - (h * 0.8) / L;
    this.seg(a, lerp(a, b, t), color, Math.min(width, h * 0.55), 0, 1);
    this.head(b, a, color, h);
  }

  /** Filled disc / shaded sphere / ring / soft glow billboard. Radius in pixels unless opts.world. */
  disc(center: P, radius: number, color: RGBA, opts?: DiscOpts) {
    const buf = this.cur.discs;
    buf.reserve(DISC_STRIDE);
    const d = buf.data;
    let i = buf.n;
    const style = opts?.style;
    d[i++] = center[0]; d[i++] = center[1]; d[i++] = center[2] ?? 0; d[i++] = radius;
    d[i++] = color[0]; d[i++] = color[1]; d[i++] = color[2]; d[i++] = color[3];
    d[i++] = style === 'sphere' ? 1 : style === 'ring' ? 2 : style === 'glow' ? 3 : 0;
    d[i++] = opts?.world ? 1 : 0;
    d[i++] = opts?.ring ?? 2;
    buf.n = i;
  }

  /** Queue a triangle mesh. */
  mesh(mesh: Mesh, model: Mat4, tint: RGBA, opts?: MeshOpts) {
    const transparent = opts?.transparent ?? tint[3] < 0.999;
    let depth = 0;
    if (transparent) {
      const c = transform(model, mesh.centroid);
      const e = this.camera.eye;
      depth = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]);
    }
    this.meshCmds.push({
      mesh, model, tint, layer: this.currentLayer, transparent,
      unlit: opts?.unlit ?? false, rim: opts?.rim ?? 0, cull: opts?.cull ?? false, depth,
    });
  }

  /** Run a full-screen shader pass immediately (call before other drawing so it sits underneath). */
  fullscreen(program: Program, setup?: (p: Program) => void, blend = false) {
    const gl = this.gl;
    program.use();
    setup?.(program);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    if (blend) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else gl.disable(gl.BLEND);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
  }

  /** Compile a fragment shader for use with fullscreen(). */
  fullscreenProgram(fs: string) {
    return new Program(this.gl, FULLSCREEN_VS, fs);
  }

  /** Text pinned to a world position (DOM overlay, so it is always crisp). */
  label(pos: P, text: string, opts?: LabelOpts) {
    const s = this.camera.project(pos);
    if (s[2] <= 0) return;
    this.labelScreen(s[0], s[1], text, opts);
  }

  /** Text at a screen position in CSS pixels. */
  labelScreen(x: number, y: number, text: string, opts?: LabelOpts) {
    if (!this.overlay) return;
    if (x < -200 || y < -100 || x > this.width + 200 || y > this.height + 100) return;
    let slot = this.labelSlots[this.labelCount];
    if (!slot) {
      const el = document.createElement('div');
      el.className = 'gl-label';
      this.overlay.appendChild(el);
      slot = { el, text: '\u0000', tex: false, styleKey: '' };
      this.labelSlots.push(slot);
    }
    this.labelCount++;
    const tex = !!opts?.tex;
    if (slot.text !== text || slot.tex !== tex) {
      if (tex) slot.el.innerHTML = renderTex(text);
      else slot.el.textContent = text;
      slot.text = text;
      slot.tex = tex;
    }
    const color = opts?.color ?? '#e6ecf7';
    const size = opts?.size ?? 13;
    const align = opts?.align ?? 'center';
    const styleKey = `${color}|${size}|${align}|${opts?.bold ? 1 : 0}|${opts?.bg ? 1 : 0}|${opts?.opacity ?? 1}`;
    if (slot.styleKey !== styleKey) {
      const st = slot.el.style;
      st.color = color;
      st.fontSize = `${size}px`;
      st.fontWeight = opts?.bold ? '650' : '500';
      st.opacity = String(opts?.opacity ?? 1);
      slot.el.classList.toggle('gl-label-bg', !!opts?.bg);
      slot.styleKey = styleKey;
    }
    const tx = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';
    slot.el.style.transform = `translate(${(x + (opts?.dx ?? 0)).toFixed(1)}px, ${(y + (opts?.dy ?? 0)).toFixed(1)}px) translate(${tx}, -50%)`;
    slot.el.style.display = '';
  }

  /** Finish the frame: draw everything that was queued. */
  end() {
    const gl = this.gl;
    const cam = this.camera;
    const is3D = cam.is3D;
    const order = [...this.layers.keys()];
    for (const m of this.meshCmds) if (!order.includes(m.layer)) order.push(m.layer);
    order.sort((a, b) => a - b);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);

    for (const layer of order) {
      const depthTest = is3D && layer < 100;
      const depthWrite = is3D && layer < 50;
      if (depthTest) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);

      const meshes = this.meshCmds.filter((m) => m.layer === layer);
      const opaque = meshes.filter((m) => !m.transparent);
      const transparent = meshes.filter((m) => m.transparent).sort((a, b) => b.depth - a.depth);

      gl.depthMask(depthWrite);
      this.drawMeshes(opaque);

      const b = this.layers.get(layer);
      if (b) {
        if (b.segs.n) {
          this.segProg.use().m4('uVP', cam.viewProj).f2('uRes', this.width, this.height);
          this.drawInstanced(this.segVao, this.segBuf, b.segs, SEG_STRIDE, gl.TRIANGLE_STRIP, 4);
        }
        if (b.heads.n) {
          this.headProg.use().m4('uVP', cam.viewProj).f2('uRes', this.width, this.height);
          this.drawInstanced(this.headVao, this.headBuf, b.heads, HEAD_STRIDE, gl.TRIANGLES, 3);
        }
        if (b.discs.n) {
          this.discProg.use().m4('uVP', cam.viewProj).f2('uRes', this.width, this.height)
            .f3('uCamUp', cam.up[0], cam.up[1], cam.up[2]);
          this.drawInstanced(this.discVao, this.discBuf, b.discs, DISC_STRIDE, gl.TRIANGLE_STRIP, 4);
        }
      }

      gl.depthMask(false);
      this.drawMeshes(transparent);
    }
    gl.depthMask(true);
    gl.bindVertexArray(null);

    for (let i = this.labelCount; i < this.labelSlots.length; i++) {
      const s = this.labelSlots[i];
      if (s.el.style.display !== 'none') s.el.style.display = 'none';
    }
  }

  private drawInstanced(vao: WebGLVertexArrayObject, vbo: WebGLBuffer, buf: FloatBuf, stride: number, mode: number, verts: number) {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf.data.subarray(0, buf.n), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(mode, 0, verts, buf.n / stride);
  }

  private drawMeshes(cmds: MeshCmd[]) {
    if (!cmds.length) return;
    const gl = this.gl;
    const cam = this.camera;
    const p = this.meshProg.use();
    p.m4('uVP', cam.viewProj).f3('uEye', cam.eye[0], cam.eye[1], cam.eye[2]);
    for (const c of cmds) {
      if (c.cull) gl.enable(gl.CULL_FACE);
      else gl.disable(gl.CULL_FACE);
      p.m4('uModel', c.model).f4('uTint', c.tint[0], c.tint[1], c.tint[2], c.tint[3])
        .f1('uUnlit', c.unlit ? 1 : 0).f1('uRim', c.rim);
      gl.bindVertexArray(c.mesh.vao);
      gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.CULL_FACE);
  }

  /** Identity matrix helper for mesh() calls. */
  static readonly IDENTITY = mat4();

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    this.segProg.dispose();
    this.headProg.dispose();
    this.discProg.dispose();
    this.meshProg.dispose();
    for (const s of this.labelSlots) s.el.remove();
    this.labelSlots.length = 0;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export { css };

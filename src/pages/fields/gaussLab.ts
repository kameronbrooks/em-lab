import { C, RGBA, alpha, css } from '../../engine/colors';
import { axes3D, grid3D, sign } from '../../engine/draw';
import { Handle, Lab3D } from '../../engine/lab';
import { Mat4, V3, fmt, mul, norm, rotation, scaling, transformPoint, translation } from '../../engine/math';
import { Geometry, Mesh, boxGeo, cylinderGeo, discGeo, planeGeo, sphereGeo } from '../../engine/mesh';
import { Charge3, FLUX_UNIT, FluxResult, Line3, eField3, fibonacciSphere, fluxThroughMesh, traceFieldLines3 } from '../../physics/flux';

export type SurfaceType = 'sphere' | 'cube' | 'cylinder' | 'hemisphere' | 'disc' | 'square';
export type SourceType = 'points' | 'uniform' | 'plane' | 'line' | 'shell' | 'solid';

export interface UserCharge extends Charge3 {
  id: number;
}

interface SurfDef {
  geo: Geometry;
  /** Face index of each triangle. */
  faceOf: Uint8Array;
  faces: string[];
  closed: boolean;
}

function withFaces(geo: Geometry, faces: string[], faceOfTri: (t: number) => number, closed: boolean): SurfDef {
  const nt = geo.indices.length / 3;
  const faceOf = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) faceOf[t] = faceOfTri(t);
  return { geo, faceOf, faces, closed };
}

function hemisphereGeo(rings = 10, sectors = 28): Geometry {
  const g: Geometry = { positions: [], normals: [], indices: [] };
  for (let r = 0; r <= rings; r++) {
    const th = (r / rings) * (Math.PI / 2);
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

function closedCylinderGeo(): { geo: Geometry; sideTris: number; capTris: number } {
  const side = cylinderGeo(32, false, 6);
  for (let i = 1; i < side.positions.length; i += 3) side.positions[i] = side.positions[i] * 2 - 1;
  const g: Geometry = { positions: side.positions.slice(), normals: side.normals.slice(), indices: side.indices.slice() };
  const sideTris = side.indices.length / 3;
  const cap = discGeo(32, 0, 4);
  for (const y of [1, -1]) {
    const base = g.positions.length / 3;
    for (let i = 0; i < cap.positions.length; i += 3) {
      g.positions.push(cap.positions[i], y, cap.positions[i + 2]);
      g.normals.push(0, y, 0);
    }
    for (const k of cap.indices) g.indices.push(base + k);
  }
  return { geo: g, sideTris, capTris: cap.indices.length / 3 };
}

function buildSurfaces(): Record<SurfaceType, SurfDef> {
  const box = boxGeo(4);
  const perFace = box.indices.length / 3 / 6;
  const cyl = closedCylinderGeo();
  return {
    sphere: withFaces(sphereGeo(16, 24), ['Whole sphere'], () => 0, true),
    cube: withFaces(box, ['+x face', '−x face', '+y face (top)', '−y face (bottom)', '+z face', '−z face'], (t) => Math.floor(t / perFace), true),
    cylinder: withFaces(cyl.geo, ['Curved side', 'Top cap', 'Bottom cap'], (t) => (t < cyl.sideTris ? 0 : t < cyl.sideTris + cyl.capTris ? 1 : 2), true),
    hemisphere: withFaces(hemisphereGeo(12, 72), ['Dome'], () => 0, false),
    disc: withFaces(discGeo(72, 0, 5), ['Disc'], () => 0, false),
    square: withFaces(planeGeo(8), ['Square'], () => 0, false),
  };
}

const SURFACES = buildSurfaces();

export class GaussLab extends Lab3D {
  source: SourceType = 'points';
  points: UserCharge[] = [];
  selected: UserCharge | null = null;
  private nextId = 1;
  /** Strength of the built-in source: E0 (N/C), sigma (nC/m^2), lambda (nC/m) or total Q (nC). */
  strength = 2;
  /** Radius of the shell / solid sphere source. */
  sourceR = 2;
  private dist: Charge3[] = [];
  private distKey = '';

  surf = { type: 'sphere' as SurfaceType, c: [0, 0, 0] as V3, size: 1.5, length: 3, tiltX: 0, tiltZ: 0 };

  showLines = true;
  showArrows = true;
  showColors = true;

  /** Results for the panel. */
  flux = 0;
  qEnc = 0;
  faceFlux: number[] = [];
  /** Surface normal for open surfaces. */
  normal: V3 = [0, 1, 0];

  private meshes = {} as Record<SurfaceType, Mesh>;
  private sheet!: Mesh;
  private world = new Float32Array(0);
  private idx: number[] = [];
  private colors = new Float32Array(0);
  private result: FluxResult | undefined;
  private model: Mat4 = new Float32Array(16);
  private key = '';
  private lines: Line3[] = [];
  private linesKey = '';

  constructor() {
    super();
    this.camera.distance = 12;
    this.camera.target = [0, 0.3, 0];
    this.camera.yaw = 0.6;
    this.camera.pitch = 0.32;
    this.preset('p12');
  }

  protected init() {
    const gl = this.r.gl;
    (Object.keys(SURFACES) as SurfaceType[]).forEach((k) => {
      this.meshes[k] = new Mesh(gl, SURFACES[k].geo);
    });
    this.sheet = new Mesh(gl, planeGeo(1));
    this.key = '';
  }

  dispose() {
    Object.values(this.meshes).forEach((m) => m.dispose());
    this.sheet?.dispose();
  }

  get def(): SurfDef {
    return SURFACES[this.surf.type];
  }
  get faceNames(): string[] {
    return this.def.faces;
  }
  get closed(): boolean {
    return this.def.closed;
  }
  get all(): Charge3[] {
    return this.dist.length ? [...this.points, ...this.dist] : this.points;
  }
  get uniform(): V3 {
    return this.source === 'uniform' ? [0, this.strength, 0] : [0, 0, 0];
  }

  // ---------- scene ----------

  addPoint(q: number, p?: V3): UserCharge {
    const c: UserCharge = {
      id: this.nextId++, q,
      x: p ? p[0] : (Math.random() - 0.5) * 3,
      y: p ? p[1] : (Math.random() - 0.5) * 2,
      z: p ? p[2] : (Math.random() - 0.5) * 3,
    };
    this.points.push(c);
    this.selected = c;
    return c;
  }

  removePoint(c: UserCharge | null) {
    if (!c) return;
    this.points = this.points.filter((k) => k !== c);
    if (this.selected === c) this.selected = null;
  }

  setSource(s: SourceType) {
    this.source = s;
    if (s !== 'points') this.points = [];
    this.selected = null;
    if (s === 'uniform') this.strength = 5;
    else if (s === 'plane') this.strength = 1;
    else if (s === 'line') this.strength = 1.5;
    else if (s === 'shell' || s === 'solid') this.strength = 4;
    if (s === 'points' && this.points.length === 0) this.addPoint(1, [0, 0, 0]);
    this.selected = null;
  }

  setSurface(type: SurfaceType) {
    this.surf.type = type;
  }

  centre() {
    this.surf.c = [0, 0, 0];
  }

  preset(name: string) {
    const s = this.surf;
    this.points = [];
    this.selected = null;
    this.source = 'points';
    s.c = [0, 0, 0];
    s.size = 1.5;
    s.length = 3;
    s.tiltX = 0;
    s.tiltZ = 0;
    s.type = 'sphere';
    switch (name) {
      case 'p5':
        this.addPoint(1, [0, 0, 0]);
        s.c = [3, 0, 0];
        s.size = 1.4;
        break;
      case 'p13':
        this.addPoint(1, [0, 0, 0]);
        s.type = 'disc';
        s.c = [0, 1.5, 0];
        break;
      case 'p15':
      case 'p16':
        s.type = 'cube';
        this.addPoint(2, [1.2, 1.2, 1.2]);
        this.addPoint(-1, [-1.2, -1.2, 1.2]);
        break;
      case 'p17': {
        s.type = 'cube';
        this.addPoint(3, [0, 0, 0]);
        const spots: V3[] = [[0.9, 0.5, 0.2], [-0.8, 0.9, -0.5], [0.3, -1, 0.9], [-1, -0.6, -0.9], [1, -0.8, -1], [-0.4, 0.2, 1.1]];
        for (const p of spots) this.addPoint(-0.5, p);
        break;
      }
      case 'p6':
        this.setSource('uniform');
        s.type = 'cube';
        s.tiltX = 0.6;
        s.tiltZ = 0.35;
        break;
      case 'p21':
        this.setSource('uniform');
        s.type = 'hemisphere';
        s.size = 2;
        break;
      case 'p9':
        this.setSource('plane');
        s.c = [0, 2.6, 0];
        s.size = 1.4;
        break;
      case 'p2':
        this.setSource('line');
        s.type = 'cylinder';
        s.size = 1.6;
        s.length = 4;
        break;
      case 'p4':
        this.setSource('solid');
        s.size = 1.2;
        break;
      case 'p11':
        this.setSource('shell');
        s.size = 1.2;
        break;
      case 'p8':
        this.setSource('shell');
        s.size = 3;
        break;
      case 'p12':
      default:
        s.type = 'cube';
        this.addPoint(1, [0, 0, 0]);
        break;
    }
    this.selected = null;
  }

  // ---------- derived data ----------

  private rebuildDist() {
    const key = `${this.source}|${this.strength}|${this.sourceR}`;
    if (key === this.distKey) return;
    this.distKey = key;
    const d: Charge3[] = [];
    const s = this.strength;
    if (this.source === 'plane') {
      const n = 20, half = 7, step = (2 * half) / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          d.push({ x: -half + (i + 0.5) * step, y: 0, z: -half + (j + 0.5) * step, q: s * step * step });
        }
      }
    } else if (this.source === 'line') {
      const n = 140, half = 9, step = (2 * half) / n;
      for (let i = 0; i < n; i++) d.push({ x: 0, y: -half + (i + 0.5) * step, z: 0, q: s * step });
    } else if (this.source === 'shell') {
      const dirs = fibonacciSphere(240);
      for (const p of dirs) d.push({ x: p[0] * this.sourceR, y: p[1] * this.sourceR, z: p[2] * this.sourceR, q: s / dirs.length });
    } else if (this.source === 'solid') {
      // Uniform fill: radii stratified so the charge inside radius r is exactly Q r^3/R^3,
      // directions from a low-discrepancy (R2) sequence so every shell is evenly covered.
      const R = this.sourceR;
      const n = 360;
      const g = 1.32471795724474602596;
      const a1 = 1 / g, a2 = 1 / (g * g);
      for (let i = 0; i < n; i++) {
        const rad = R * Math.cbrt((i + 0.5) / n);
        const u = (0.5 + a1 * (i + 1)) % 1, v = (0.5 + a2 * (i + 1)) % 1;
        const ct = 2 * u - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * Math.PI * v;
        d.push({ x: rad * st * Math.cos(ph), y: rad * ct, z: rad * st * Math.sin(ph), q: s / n });
      }
    }
    this.dist = d;
  }

  private scaleOf(): V3 {
    const s = this.surf;
    switch (s.type) {
      case 'cylinder':
        return [s.size, s.length / 2, s.size];
      case 'disc':
      case 'square':
        return [s.size, 1, s.size];
      default:
        return [s.size, s.size, s.size];
    }
  }

  private rot(): Mat4 {
    return mul(rotation([0, 0, 1], this.surf.tiltZ), rotation([1, 0, 0], this.surf.tiltX));
  }

  /** True if a world point is inside the (closed) Gaussian surface. */
  inside(p: Charge3): boolean {
    if (!this.closed) return false;
    const s = this.surf;
    const R = this.rot();
    // inverse rotation = transpose
    const dx = p.x - s.c[0], dy = p.y - s.c[1], dz = p.z - s.c[2];
    const lx = R[0] * dx + R[1] * dy + R[2] * dz;
    const ly = R[4] * dx + R[5] * dy + R[6] * dz;
    const lz = R[8] * dx + R[9] * dy + R[10] * dz;
    const sc = this.scaleOf();
    const x = lx / sc[0], y = ly / sc[1], z = lz / sc[2];
    if (s.type === 'sphere') return x * x + y * y + z * z < 1;
    if (s.type === 'cube') return Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) < 1;
    return x * x + z * z < 1 && Math.abs(y) < 1;
  }

  private recompute() {
    this.rebuildDist();
    const s = this.surf;
    const all = this.all;
    const key = [
      s.type, s.c.map((v) => v.toFixed(4)).join(','), s.size, s.length, s.tiltX, s.tiltZ, this.source, this.strength, this.sourceR,
      this.points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)},${p.q}`).join(';'), this.showColors,
    ].join('|');
    if (key === this.key) return;
    this.key = key;

    const def = this.def;
    const sc = this.scaleOf();
    const R = this.rot();
    this.model = mul(translation(s.c), mul(R, scaling(sc[0], sc[1], sc[2])));
    this.normal = norm(transformPoint(R, [0, 1, 0]));
    const P = def.geo.positions;
    const nv = P.length / 3;
    if (this.world.length !== P.length) this.world = new Float32Array(P.length);
    for (let i = 0; i < nv; i++) {
      const w = transformPoint(this.model, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      this.world[i * 3] = w[0];
      this.world[i * 3 + 1] = w[1];
      this.world[i * 3 + 2] = w[2];
    }
    // orient triangles: outward for closed surfaces and the dome, along the surface normal for flat ones
    const idx = def.geo.indices.slice();
    const W = this.world;
    const flat = s.type === 'disc' || s.type === 'square';
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = W[b] - W[a], uy = W[b + 1] - W[a + 1], uz = W[b + 2] - W[a + 2];
      const vx = W[c] - W[a], vy = W[c + 1] - W[a + 1], vz = W[c + 2] - W[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      let d: number;
      if (flat) d = nx * this.normal[0] + ny * this.normal[1] + nz * this.normal[2];
      else {
        d = nx * ((W[a] + W[b] + W[c]) / 3 - s.c[0]) + ny * ((W[a + 1] + W[b + 1] + W[c + 1]) / 3 - s.c[1]) + nz * ((W[a + 2] + W[b + 2] + W[c + 2]) / 3 - s.c[2]);
      }
      if (d < 0) {
        const tmp = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = tmp;
      }
    }
    this.idx = idx;
    this.result = fluxThroughMesh(W, idx, all, this.uniform, this.result);
    const res = this.result;
    this.flux = res.total;
    this.faceFlux = def.faces.map(() => 0);
    for (let t = 0; t < res.perTri.length; t++) this.faceFlux[def.faceOf[t]] += res.perTri[t];
    this.qEnc = 0;
    if (def.closed) for (const c of all) if (this.inside(c)) this.qEnc += c.q;

    // per-vertex colours from flux density
    if (this.colors.length !== nv * 4) this.colors = new Float32Array(nv * 4);
    const dens = new Float32Array(nv);
    const cnt = new Uint16Array(nv);
    for (let t = 0; t < res.perTri.length; t++) {
      const dd = res.area[t] > 1e-12 ? res.perTri[t] / res.area[t] : 0;
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        dens[v] += dd;
        cnt[v]++;
      }
    }
    let max = 1e-9;
    for (let v = 0; v < nv; v++) {
      if (cnt[v]) dens[v] /= cnt[v];
      max = Math.max(max, Math.abs(dens[v]));
    }
    const base = C.surface;
    for (let v = 0; v < nv; v++) {
      const t = this.showColors ? Math.sign(dens[v]) * Math.pow(Math.abs(dens[v]) / max, 0.55) : 0;
      const k = Math.abs(t);
      const target = t >= 0 ? C.pos : C.neg;
      this.colors[v * 4] = base[0] + (target[0] - base[0]) * k;
      this.colors[v * 4 + 1] = base[1] + (target[1] - base[1]) * k;
      this.colors[v * 4 + 2] = base[2] + (target[2] - base[2]) * k;
      this.colors[v * 4 + 3] = 0.16 + 0.5 * k;
    }
    this.meshes[s.type]?.setColors(this.colors);
  }

  // ---------- interaction ----------

  handles(): Handle[] {
    const s = this.surf;
    const hs: Handle[] = [
      {
        id: 'surface',
        get: () => s.c,
        set: (p) => {
          s.c = [p[0], p[1], p[2]];
        },
        radius: 18,
      },
    ];
    for (const c of this.points) {
      hs.push({
        id: c,
        get: () => [c.x, c.y, c.z],
        set: (p) => {
          c.x = p[0];
          c.y = p[1];
          c.z = p[2];
        },
        down: () => {
          this.selected = c;
        },
        radius: 18,
      });
    }
    return hs;
  }

  onKey(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
      this.removePoint(this.selected);
      return true;
    }
    return false;
  }

  // ---------- drawing ----------

  private outline(col: RGBA) {
    const r = this.r;
    const M = this.model;
    const s = this.surf;
    const P = (x: number, y: number, z: number) => transformPoint(M, [x, y, z]);
    const ring = (f: (a: number) => V3, a0 = 0, a1 = Math.PI * 2, n = 56) => {
      const pts: V3[] = [];
      for (let i = 0; i <= n; i++) pts.push(f(a0 + ((a1 - a0) * i) / n));
      r.polyline(pts, col, 1.6);
    };
    switch (s.type) {
      case 'sphere':
        ring((a) => P(Math.cos(a), 0, Math.sin(a)));
        ring((a) => P(Math.cos(a), Math.sin(a), 0));
        ring((a) => P(0, Math.sin(a), Math.cos(a)));
        break;
      case 'hemisphere':
        ring((a) => P(Math.cos(a), 0, Math.sin(a)));
        ring((a) => P(Math.cos(a), Math.sin(a), 0), 0, Math.PI, 28);
        ring((a) => P(0, Math.sin(a), Math.cos(a)), 0, Math.PI, 28);
        break;
      case 'cube': {
        const e = [-1, 1];
        for (const a of e) {
          for (const b of e) {
            r.seg(P(-1, a, b), P(1, a, b), col, 1.6);
            r.seg(P(a, -1, b), P(a, 1, b), col, 1.6);
            r.seg(P(a, b, -1), P(a, b, 1), col, 1.6);
          }
        }
        break;
      }
      case 'cylinder':
        ring((a) => P(Math.cos(a), 1, Math.sin(a)));
        ring((a) => P(Math.cos(a), -1, Math.sin(a)));
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          r.seg(P(Math.cos(a), -1, Math.sin(a)), P(Math.cos(a), 1, Math.sin(a)), col, 1.2);
        }
        break;
      case 'disc':
        ring((a) => P(Math.cos(a), 0, Math.sin(a)));
        break;
      case 'square':
        r.polyline([P(-1, 0, -1), P(1, 0, -1), P(1, 0, 1), P(-1, 0, 1)], col, 1.6, true);
        break;
    }
  }

  protected draw() {
    const r = this.r;
    this.recompute();
    const s = this.surf;
    const all = this.all;
    const uni = this.uniform;

    r.layer(0);
    if (this.source !== 'plane') grid3D(r, 6, 1, -3.5, alpha(C.grid, 0.8));
    axes3D(r, 1.2, [-5.5, -3.45, -5.5]);

    // built-in source
    if (this.dist.length) {
      const col = this.strength >= 0 ? C.pos : C.neg;
      const rad = this.source === 'solid' ? 0.05 : this.source === 'line' ? 0.06 : 0.07;
      for (const c of this.dist) r.disc([c.x, c.y, c.z], rad, col, { world: true, style: 'sphere' });
      if (this.source === 'line') r.seg([0, -9, 0], [0, 9, 0], alpha(col, 0.5), 3);
    }
    if (this.source === 'uniform') {
      const col = alpha(C.E, 0.45);
      const L = 0.9 * Math.sign(this.strength || 1);
      for (let x = -4; x <= 4; x += 2) {
        for (let z = -4; z <= 4; z += 2) {
          for (let y = -3; y <= 3; y += 2) r.arrow([x, y - L / 2, z], [x, y + L / 2, z], col, 1.6, 8);
        }
      }
    }

    // field lines of the user's point charges
    if (this.showLines && this.source === 'points' && this.points.length && this.points.length <= 8) {
      const key = this.points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)},${p.q}`).join(';');
      if (key !== this.linesKey) {
        this.linesKey = key;
        this.lines = traceFieldLines3(this.points, [0, 0, 0], { perCharge: this.points.length > 3 ? 10 : 16, radius: 8 });
      }
      const col: RGBA = [1, 0.86, 0.55, 0.5];
      for (const l of this.lines) {
        r.polyline(l.pts, col, 1.3, false, 0, l.n);
        const m = Math.min(l.n - 1, Math.max(1, Math.floor(l.n * 0.45)));
        if (l.n > 6) {
          r.head([l.pts[m * 3], l.pts[m * 3 + 1], l.pts[m * 3 + 2]], [l.pts[m * 3 - 3], l.pts[m * 3 - 2], l.pts[m * 3 - 1]], [1, 0.86, 0.55, 0.85], 8);
        }
      }
    }

    // user point charges
    for (const c of this.points) {
      const col = c.q >= 0 ? C.pos : C.neg;
      const rad = 0.13 + 0.05 * Math.sqrt(Math.abs(c.q));
      const p: V3 = [c.x, c.y, c.z];
      r.disc(p, rad, col, { world: true, style: 'sphere' });
      if (c === this.selected) r.disc(p, rad * 1.5, C.white, { world: true, style: 'ring', ring: 1.5 });
    }

    // field arrows where the field crosses the surface
    if (this.showArrows && this.result) {
      const W = this.world, idx = this.idx, res = this.result;
      const nt = res.perTri.length;
      const stride = Math.max(1, Math.round(nt / 90));
      let maxD = 1e-9;
      for (let t = 0; t < nt; t++) if (res.area[t] > 1e-12) maxD = Math.max(maxD, Math.abs(res.perTri[t] / res.area[t]));
      for (let t = Math.floor(stride / 2); t < nt; t += stride) {
        const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
        const cx = (W[a] + W[b] + W[c]) / 3, cy = (W[a + 1] + W[b + 1] + W[c + 1]) / 3, cz = (W[a + 2] + W[b + 2] + W[c + 2]) / 3;
        const e = eField3(all, cx, cy, cz, uni);
        const m = Math.hypot(e[0], e[1], e[2]);
        if (m < 1e-9) continue;
        const dens = res.area[t] > 1e-12 ? res.perTri[t] / res.area[t] : 0;
        const k = Math.pow(Math.min(1, Math.abs(dens) / maxD), 0.4);
        const L = 0.25 + 0.5 * k;
        const col = dens >= 0 ? alpha(C.E, 0.55 + 0.45 * k) : alpha(C.B, 0.55 + 0.45 * k);
        r.arrow([cx, cy, cz], [cx + (e[0] / m) * L, cy + (e[1] / m) * L, cz + (e[2] / m) * L], col, 1.8, 8);
      }
    }

    // the Gaussian surface
    r.layer(50);
    if (this.source === 'plane') {
      r.mesh(this.sheet, scaling(7, 1, 7), alpha(this.strength >= 0 ? C.pos : C.neg, 0.1), { transparent: true });
    }
    r.mesh(this.meshes[s.type], this.model, [1, 1, 1, 1], { transparent: true, rim: 1.2 });
    this.outline(alpha(C.surface, 0.9));
    if (!this.closed) {
      const tip: V3 = [s.c[0] + this.normal[0] * 1.3, s.c[1] + this.normal[1] * 1.3, s.c[2] + this.normal[2] * 1.3];
      r.layer(100);
      r.arrow(s.c, tip, C.white, 2.4);
      r.label(tip, 'd\\vec a', { tex: true, size: 13, dy: -12 });
    }

    // overlay: handle, signs and labels
    r.layer(100);
    r.disc(s.c, 6, C.white, { style: 'ring', ring: 1.6 });
    r.disc(s.c, 2.2, C.white);
    for (const c of this.points) {
      sign(r, [c.x, c.y, c.z], c.q >= 0, C.white, 4.5, 1.8);
      r.label([c.x, c.y, c.z], `${c.q > 0 ? '+' : ''}${fmt(c.q, 2)} nC`, { size: 11, dy: 20, color: css(c.q >= 0 ? C.pos : C.neg) });
    }
    const units = this.flux / FLUX_UNIT;
    const txt = Math.abs(units) < 5e-4 ? 'Φ = 0' : `Φ = ${fmt(units, 3)} q/ε₀`;
    r.label(s.c, txt, { size: 13, dy: -20, bg: true, bold: true });
  }
}

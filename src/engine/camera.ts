import { Mat4, P, V3, add, clamp, cross, invert, lookAt, mul, norm, ortho, perspective, scale, sub, transform } from './math';

export interface Ray {
  o: V3;
  d: V3;
}

export interface Camera {
  readonly is3D: boolean;
  viewProj: Mat4;
  /** World-space camera right / up / forward unit vectors. */
  right: V3;
  up: V3;
  forward: V3;
  eye: V3;
  /** Recompute matrices for a viewport in CSS pixels. */
  update(width: number, height: number): void;
  /** World -> screen CSS pixels (origin top-left). Third value is clip w (<= 0 means behind the camera). */
  project(p: P): [number, number, number];
  /** Screen CSS pixel -> world ray. */
  ray(sx: number, sy: number): Ray;
  /** Approximate pixels per world unit at a world point. */
  pxPerUnit(p: P): number;
}

/** 2D pan/zoom camera looking down -z at the xy plane. */
export class Camera2D implements Camera {
  readonly is3D = false;
  cx = 0;
  cy = 0;
  /** Pixels per world unit. */
  zoom = 60;
  minZoom = 4;
  maxZoom = 2000;
  width = 1;
  height = 1;
  viewProj: Mat4 = new Float32Array(16);
  right: V3 = [1, 0, 0];
  up: V3 = [0, 1, 0];
  forward: V3 = [0, 0, -1];
  eye: V3 = [0, 0, 100];

  update(width: number, height: number) {
    this.width = width;
    this.height = height;
    const hw = width / 2 / this.zoom;
    const hh = height / 2 / this.zoom;
    this.viewProj = ortho(this.cx - hw, this.cx + hw, this.cy - hh, this.cy + hh, -1000, 1000);
    this.eye = [this.cx, this.cy, 100];
  }

  project(p: P): [number, number, number] {
    return [
      (p[0] - this.cx) * this.zoom + this.width / 2,
      this.height / 2 - (p[1] - this.cy) * this.zoom,
      1,
    ];
  }

  toWorld(sx: number, sy: number): V3 {
    return [
      (sx - this.width / 2) / this.zoom + this.cx,
      (this.height / 2 - sy) / this.zoom + this.cy,
      0,
    ];
  }

  ray(sx: number, sy: number): Ray {
    const w = this.toWorld(sx, sy);
    return { o: [w[0], w[1], 100], d: [0, 0, -1] };
  }

  pxPerUnit() {
    return this.zoom;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.toWorld(sx, sy);
    this.cx += before[0] - after[0];
    this.cy += before[1] - after[1];
  }

  panPixels(dx: number, dy: number) {
    this.cx -= dx / this.zoom;
    this.cy += dy / this.zoom;
  }

  /** Visible world rectangle. */
  bounds() {
    const hw = this.width / 2 / this.zoom;
    const hh = this.height / 2 / this.zoom;
    return { x0: this.cx - hw, x1: this.cx + hw, y0: this.cy - hh, y1: this.cy + hh };
  }

  /** Fit a world rectangle into view. */
  fit(x0: number, x1: number, y0: number, y1: number, pad = 1.15) {
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2;
    const zx = this.width / ((x1 - x0) * pad);
    const zy = this.height / ((y1 - y0) * pad);
    this.zoom = clamp(Math.min(zx, zy), this.minZoom, this.maxZoom);
  }
}

/** Orbit camera for 3D labs. Y is up. */
export class OrbitCamera implements Camera {
  readonly is3D = true;
  target: V3 = [0, 0, 0];
  distance = 12;
  /** Azimuth around Y, radians. */
  yaw = 0.7;
  /** Elevation above the xz plane, radians. */
  pitch = 0.45;
  fov = (40 * Math.PI) / 180;
  minDistance = 1.5;
  maxDistance = 200;
  width = 1;
  height = 1;
  view: Mat4 = new Float32Array(16);
  proj: Mat4 = new Float32Array(16);
  viewProj: Mat4 = new Float32Array(16);
  invViewProj: Mat4 = new Float32Array(16);
  right: V3 = [1, 0, 0];
  up: V3 = [0, 1, 0];
  forward: V3 = [0, 0, -1];
  eye: V3 = [0, 0, 10];

  update(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pitch = clamp(this.pitch, -1.5, 1.5);
    this.distance = clamp(this.distance, this.minDistance, this.maxDistance);
    const cp = Math.cos(this.pitch);
    this.eye = [
      this.target[0] + this.distance * cp * Math.sin(this.yaw),
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * cp * Math.cos(this.yaw),
    ];
    this.view = lookAt(this.eye, this.target, [0, 1, 0]);
    this.proj = perspective(this.fov, width / Math.max(1, height), this.distance * 0.02, this.distance * 40 + 100);
    this.viewProj = mul(this.proj, this.view);
    this.invViewProj = invert(this.viewProj);
    this.forward = norm(sub(this.target, this.eye));
    this.right = norm(cross(this.forward, [0, 1, 0]));
    this.up = cross(this.right, this.forward);
  }

  project(p: P): [number, number, number] {
    const c = transform(this.viewProj, p);
    const w = c[3];
    if (w <= 1e-6) return [-1e6, -1e6, w];
    return [(c[0] / w * 0.5 + 0.5) * this.width, (1 - (c[1] / w * 0.5 + 0.5)) * this.height, w];
  }

  ray(sx: number, sy: number): Ray {
    const nx = (sx / this.width) * 2 - 1;
    const ny = 1 - (sy / this.height) * 2;
    const a = transform(this.invViewProj, [nx, ny, -1]);
    const b = transform(this.invViewProj, [nx, ny, 1]);
    const pa: V3 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    const pb: V3 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    return { o: pa, d: norm(sub(pb, pa)) };
  }

  pxPerUnit(p: P) {
    const depth = Math.max(1e-3, sub(p, this.eye).reduce((s, v, i) => s + v * this.forward[i], 0));
    return this.height / (2 * Math.tan(this.fov / 2) * depth);
  }

  orbit(dx: number, dy: number) {
    this.yaw -= dx * 0.008;
    this.pitch = clamp(this.pitch + dy * 0.008, -1.5, 1.5);
  }

  dolly(factor: number) {
    this.distance = clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  panPixels(dx: number, dy: number) {
    const k = (2 * Math.tan(this.fov / 2) * this.distance) / this.height;
    this.target = add(this.target, add(scale(this.right, -dx * k), scale(this.up, dy * k)));
  }
}

/** Intersect a ray with the plane through `point` with normal `normal`. Returns null if parallel. */
export function rayPlane(ray: Ray, point: P, normal: P): V3 | null {
  const denom = ray.d[0] * normal[0] + ray.d[1] * normal[1] + ray.d[2] * (normal[2] ?? 0);
  if (Math.abs(denom) < 1e-8) return null;
  const diff = sub(point, ray.o);
  const t = (diff[0] * normal[0] + diff[1] * normal[1] + diff[2] * (normal[2] ?? 0)) / denom;
  return [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t];
}

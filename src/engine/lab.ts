// Base classes for interactive labs. A lab owns its simulation state, draws itself with the
// Renderer every frame, and receives pointer input. React only renders the control panel.

import { Camera, Camera2D, OrbitCamera, rayPlane } from './camera';
import { C, RGBA } from './colors';
import { P, V3, add, sub } from './math';
import { Renderer } from './renderer';

/** A draggable point in the scene. */
export interface Handle {
  /** Current world position. */
  get(): P;
  /** Called while dragging with the proposed new world position. */
  set(p: V3): void;
  /** Hit radius in pixels (default 16). */
  radius?: number;
  /** 3D only: normal of the plane the handle slides on. Defaults to the view plane. */
  planeNormal?: P;
  /** Called on a click without a drag. */
  click?(): void;
  down?(): void;
  up?(): void;
  /** Arbitrary tag so labs can tell which object is hovered / dragged. */
  id?: unknown;
}

interface PointerInfo {
  x: number;
  y: number;
}

export abstract class Lab {
  r!: Renderer;
  abstract camera: Camera;
  /** Simulation time in seconds. */
  time = 0;
  paused = false;
  /** Simulation speed multiplier. */
  speed = 1;
  fps = 60;
  background: RGBA = C.bg;

  pointer = { x: 0, y: 0, inside: false, down: false };
  hovered: Handle | null = null;
  dragging: Handle | null = null;

  private pointers = new Map<number, PointerInfo>();
  private dragOffset: V3 = [0, 0, 0];
  private dragPlanePoint: V3 = [0, 0, 0];
  private dragPlaneNormal: V3 = [0, 0, 1];
  private camDrag: 'none' | 'orbit' | 'pan' = 'none';
  private downAt = { x: 0, y: 0 };
  private moved = false;
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  /** Set when the scene changed and derived data should be rebuilt. Labs may use it freely. */
  dirty = true;

  attach(r: Renderer) {
    this.r = r;
    this.camera.update(Math.max(1, r.canvas.clientWidth), Math.max(1, r.canvas.clientHeight));
    this.init();
  }

  /** Create GL resources here (called every time the lab is mounted). */
  protected init(): void {}
  /** Advance the simulation by dt simulated seconds. */
  protected update(_dt: number): void {}
  /** Draw the scene. */
  protected abstract draw(): void;
  /** Draggable handles currently in the scene. */
  handles(): Handle[] {
    return [];
  }
  dispose(): void {}

  frame(dtReal: number) {
    this.fps += (1 / Math.max(dtReal, 1e-3) - this.fps) * 0.05;
    const dt = this.paused ? 0 : dtReal * this.speed;
    this.time += dt;
    this.update(dt);
    this.r.begin(this.camera, this.background);
    this.draw();
    this.r.end();
  }

  // ---------- input ----------

  /** Called for a click on empty space (no drag). Return true if handled. */
  protected onClick(_x: number, _y: number, _e: PointerEvent): boolean {
    return false;
  }
  /** Called on pointer down on empty space. Return true to take over (suppresses camera drag). */
  protected onBackgroundDown(_x: number, _y: number, _e: PointerEvent): boolean {
    return false;
  }
  protected onBackgroundDrag(_x: number, _y: number, _e: PointerEvent): void {}
  protected onBackgroundUp(_x: number, _y: number, _e: PointerEvent): void {}
  protected onHover(_x: number, _y: number): void {}
  onKey(_e: KeyboardEvent): boolean {
    return false;
  }
  private bgTaken = false;

  hitTest(x: number, y: number): Handle | null {
    let best: Handle | null = null;
    let bestD = Infinity;
    for (const h of this.handles()) {
      const s = this.camera.project(h.get());
      if (s[2] <= 0) continue;
      const d = Math.hypot(s[0] - x, s[1] - y);
      const rad = h.radius ?? 16;
      if (d <= rad && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  /** World point under the cursor on the plane through `point` (2D: the xy plane). */
  pick(x: number, y: number, point: P = [0, 0, 0], normal?: P): V3 | null {
    const cam = this.camera;
    if (!cam.is3D) return (cam as unknown as Camera2D).toWorld(x, y);
    return rayPlane(cam.ray(x, y), point, normal ?? cam.forward);
  }

  onPointerDown(x: number, y: number, e: PointerEvent) {
    this.pointers.set(e.pointerId, { x, y });
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.down = true;
    this.downAt = { x, y };
    this.moved = false;
    if (this.pointers.size === 2) {
      // start pinch
      this.dragging?.up?.();
      this.dragging = null;
      this.camDrag = 'none';
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    const h = this.hitTest(x, y);
    if (h && e.button === 0) {
      this.dragging = h;
      const pos = h.get();
      this.dragPlanePoint = [pos[0], pos[1], pos[2] ?? 0];
      const n = h.planeNormal ?? this.camera.forward;
      this.dragPlaneNormal = [n[0], n[1], n[2] ?? 0];
      const hit = this.pick(x, y, this.dragPlanePoint, this.dragPlaneNormal);
      this.dragOffset = hit ? sub(this.dragPlanePoint, hit) : [0, 0, 0];
      h.down?.();
      return;
    }
    this.bgTaken = e.button === 0 && this.onBackgroundDown(x, y, e);
    if (this.bgTaken) return;
    if (this.camera.is3D) {
      this.camDrag = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
    } else {
      this.camDrag = 'pan';
    }
  }

  onPointerMove(x: number, y: number, e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId);
    const dx = prev ? x - prev.x : 0;
    const dy = prev ? y - prev.y : 0;
    if (prev) this.pointers.set(e.pointerId, { x, y });
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;
    if (Math.hypot(x - this.downAt.x, y - this.downAt.y) > 4) this.moved = true;

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0 && d > 0) {
        const f = d / this.pinchDist;
        if (this.camera.is3D) {
          const cam = this.camera as unknown as OrbitCamera;
          cam.dolly(1 / f);
          cam.panPixels(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
        } else {
          const cam = this.camera as unknown as Camera2D;
          cam.zoomAt(mid.x, mid.y, f);
          cam.panPixels(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
        }
      }
      this.pinchDist = d;
      this.pinchMid = mid;
      return;
    }

    if (this.dragging) {
      const hit = this.pick(x, y, this.dragPlanePoint, this.dragPlaneNormal);
      if (hit) this.dragging.set(add(hit, this.dragOffset));
      this.dirty = true;
      return;
    }
    if (this.bgTaken) {
      this.onBackgroundDrag(x, y, e);
      return;
    }
    if (this.camDrag !== 'none' && prev) {
      if (this.camera.is3D) {
        const cam = this.camera as unknown as OrbitCamera;
        if (this.camDrag === 'orbit') cam.orbit(dx, dy);
        else cam.panPixels(dx, dy);
      } else {
        (this.camera as unknown as Camera2D).panPixels(dx, dy);
      }
      this.dirty = true;
      return;
    }
    this.hovered = this.hitTest(x, y);
    this.onHover(x, y);
  }

  onPointerUp(x: number, y: number, e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) return;
    this.pointer.down = false;
    this.pinchDist = 0;
    if (this.dragging) {
      const h = this.dragging;
      this.dragging = null;
      h.up?.();
      if (!this.moved) h.click?.();
    } else if (this.bgTaken) {
      this.onBackgroundUp(x, y, e);
      if (!this.moved) this.onClick(x, y, e);
    } else if (!this.moved && e.button === 0) {
      this.onClick(x, y, e);
    }
    this.bgTaken = false;
    this.camDrag = 'none';
  }

  onPointerLeave() {
    this.pointer.inside = false;
    if (!this.dragging) this.hovered = null;
  }

  onWheel(x: number, y: number, deltaY: number) {
    const f = Math.exp(-deltaY * 0.0012);
    if (this.camera.is3D) (this.camera as unknown as OrbitCamera).dolly(1 / f);
    else (this.camera as unknown as Camera2D).zoomAt(x, y, f);
    this.dirty = true;
  }

  cursor(): string {
    if (this.dragging) return 'grabbing';
    if (this.hovered) return 'grab';
    return 'default';
  }
}

export abstract class Lab2D extends Lab {
  camera = new Camera2D();
  /** World position under the pointer. */
  get mouse(): V3 {
    return this.camera.toWorld(this.pointer.x, this.pointer.y);
  }
}

export abstract class Lab3D extends Lab {
  camera = new OrbitCamera();
}

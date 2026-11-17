import { useEffect, useRef, useState } from 'react';
import { Lab } from '../engine/lab';
import { Renderer } from '../engine/renderer';

/** Mounts a Lab on a WebGL2 canvas, runs its frame loop and forwards pointer input. */
export function LabCanvas({ lab, className, style }: { lab: Lab; className?: string; style?: React.CSSProperties }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current!;
    // A fresh canvas for every mount: a canvas whose context was released cannot be reused.
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    setError(null);
    let r: Renderer;
    try {
      r = new Renderer(canvas, overlayRef.current);
      lab.attach(r);
    } catch (e) {
      console.error(e);
      canvas.remove();
      setError(e instanceof Error ? e.message.split('\n')[0] : String(e));
      return;
    }
    let raf = 0;
    let last = performance.now();
    let dead = false;
    const loop = (now: number) => {
      if (dead) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        lab.frame(dt);
        const cur = lab.cursor();
        if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message.split('\n')[0] : String(e));
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const pos = (e: MouseEvent): [number, number] => {
      const b = canvas.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      lab.onPointerDown(x, y, e);
    };
    const move = (e: PointerEvent) => {
      const [x, y] = pos(e);
      lab.onPointerMove(x, y, e);
    };
    const up = (e: PointerEvent) => {
      const [x, y] = pos(e);
      lab.onPointerUp(x, y, e);
    };
    const leave = () => lab.onPointerLeave();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = pos(e);
      lab.onWheel(x, y, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY);
    };
    const ctx = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'MATH-FIELD' || t.isContentEditable)) return;
      if (lab.onKey(e)) e.preventDefault();
    };
    const lost = (e: Event) => {
      e.preventDefault();
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      setError('The browser paused this view to save graphics memory.');
    };
    window.addEventListener('keydown', key);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', ctx);
    canvas.addEventListener('webglcontextlost', lost);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
      canvas.removeEventListener('webglcontextlost', lost);
      try {
        lab.dispose();
      } catch (e) {
        console.error(e);
      }
      r.dispose();
      canvas.remove();
    };
  }, [lab, attempt]);

  return (
    <div className={`lab-canvas ${className ?? ''}`} style={style}>
      <div className="lab-canvas-host" ref={hostRef} />
      <div className="gl-overlay" ref={overlayRef} />
      {error && (
        <div className="lab-error">
          <strong>This view stopped.</strong>
          <span>{error}</span>
          <button type="button" className="btn primary" onClick={() => setAttempt((a) => a + 1)}>
            Restart view
          </button>
        </div>
      )}
    </div>
  );
}

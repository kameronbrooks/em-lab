import { useState } from 'react';
import { findPage } from '../app/registry';
import { href, useRoute } from '../app/router';
import { getVideo, videoUrl } from '../content/videos';
import { Lab } from '../engine/lab';
import { LabCanvas } from './LabCanvas';

/**
 * Lab pages must call useLabUI() (from ui/controls) at the top of their component so the
 * panel re-renders as the simulation runs.
 */
interface LabPageProps {
  lab: Lab;
  /** Short explanation shown at the top of the side panel. */
  intro?: React.ReactNode;
  /** Side panel contents (controls, readouts, formulas). */
  children: React.ReactNode;
  /** Buttons / chips floating over the top-left of the canvas. */
  toolbar?: React.ReactNode;
  /** One-line interaction hint at the bottom of the canvas. */
  hint?: string;
  /** Content under the canvas (plots). */
  below?: React.ReactNode;
}

/** Standard layout for a lab: canvas on the left, control panel on the right. */
export function LabPage({ lab, intro, children, toolbar, hint, below }: LabPageProps) {
  const route = useRoute();
  const page = findPage(route.path);
  return (
    <>
      <div className="lab-page">
        <div className="lab-main">
          <div className="lab-stage">
            <LabCanvas lab={lab} />
            {toolbar && <div className="lab-toolbar">{toolbar}</div>}
            {hint && <div className="lab-hint">{hint}</div>}
            <div className="lab-fps" title="Frames per second">{Math.round(lab.fps)} fps</div>
          </div>
          {below && <div className="lab-below">{below}</div>}
        </div>
        <aside className="panel">
          {page && <h2 className="panel-title">{page.title}</h2>}
          {intro && <div className="panel-intro">{intro}</div>}
          {children}
          {page && <Related videos={page.videos} problems={page.problems} />}
        </aside>
      </div>
    </>
  );
}

/** Links to the playlist videos and practice problems that belong to a page. */
export function Related({ videos, problems }: { videos: number[]; problems: number[] }) {
  const [open, setOpen] = useState(false);
  if (!videos.length && !problems.length) return null;
  const shown = open ? videos : videos.slice(0, 4);
  return (
    <section className="section related">
      {videos.length > 0 && (
        <>
          <header className="section-head">
            <h3>Videos for this lab</h3>
          </header>
          <ul className="video-list">
            {shown.map((n) => {
              const v = getVideo(n);
              if (!v) return null;
              return (
                <li key={n}>
                  <a href={videoUrl(v)} target="_blank" rel="noreferrer">
                    <span className="video-n">{n}</span>
                    <span className="video-title">{v.title}</span>
                    <span className="video-dur">{v.duration}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          {videos.length > 4 && (
            <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
              {open ? 'Show fewer' : `Show all ${videos.length}`}
            </button>
          )}
        </>
      )}
      {problems.length > 0 && (
        <>
          <header className="section-head">
            <h3>Practice problems</h3>
          </header>
          <div className="chips">
            {problems.map((n) => (
              <a key={n} className="chip" href={href(`/practice/${n}`)}>
                {n}
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

import { GROUPS, PAGES, PageDef } from '../app/registry';
import { href } from '../app/router';
import { VIDEOS, videoUrl } from '../content/videos';

const UNITS: { title: string; from: number; to: number; color: string }[] = [
  { title: 'Electric force, field and Gauss’s law', from: 1, to: 19, color: 'var(--c-E)' },
  { title: 'Electric potential and energy', from: 20, to: 24, color: 'var(--c-V)' },
  { title: 'Magnetic fields and forces', from: 25, to: 40, color: 'var(--c-B)' },
  { title: 'Induction and Maxwell’s equations', from: 41, to: 50, color: 'var(--c-F)' },
  { title: 'Resistive circuits', from: 51, to: 58, color: 'var(--c-I)' },
  { title: 'LC, RC, RL and RLC circuits', from: 59, to: 76, color: 'var(--c-pos)' },
  { title: 'Electromagnetic waves', from: 77, to: 84, color: 'var(--c-neg)' },
];

function labFor(n: number): PageDef | undefined {
  return PAGES.find((p) => p.videos.includes(n));
}

export function HomePage() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Electricity &amp; Magnetism, hands on</h1>
        <p>
          Every topic in the course playlist has a lab here. Drag charges, launch particles through magnetic fields,
          build circuits and watch them run, then check yourself on the 65 practice problems.
        </p>
      </section>

      {GROUPS.map((g) => (
        <section key={g} className="home-group">
          <h2>{g}</h2>
          <div className="cards">
            {PAGES.filter((p) => p.group === g).map((p) => (
              <a key={p.path} className="card" href={href(p.path)}>
                <h3>{p.title}</h3>
                <p>{p.blurb}</p>
                {(p.videos.length > 0 || p.problems.length > 0) && (
                  <span className="card-meta">
                    {p.videos.length > 0 && <span>{p.videos.length} videos</span>}
                    {p.problems.length > 0 && <span>{p.problems.length} problems</span>}
                  </span>
                )}
              </a>
            ))}
          </div>
        </section>
      ))}

      <section className="home-group">
        <h2>Course map</h2>
        <p className="muted">All 84 videos in playlist order. Each one links to the lab that covers it.</p>
        <div className="units">
          {UNITS.map((u) => (
            <div className="unit" key={u.title}>
              <h3 style={{ borderColor: u.color }}>{u.title}</h3>
              <ol className="unit-videos" start={u.from}>
                {VIDEOS.slice(u.from - 1, u.to).map((v) => {
                  const lab = labFor(v.n);
                  return (
                    <li key={v.n}>
                      <a href={videoUrl(v)} target="_blank" rel="noreferrer" className="unit-video">
                        {v.title}
                      </a>
                      <span className="video-dur">{v.duration}</span>
                      {lab && (
                        <a className="unit-lab" href={href(lab.path)}>
                          Lab
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

import { Suspense, useEffect, useState } from 'react';
import { HomePage } from '../pages/HomePage';
import { GROUPS, PAGES, findPage } from './registry';
import { href, useRoute } from './router';

export function App() {
  const route = useRoute();
  const page = findPage(route.path);
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [route.path]);
  useEffect(() => {
    document.title = page ? `${page.title} · E&M Lab` : 'E&M Lab';
  }, [page]);
  const Component = page?.component;

  return (
    <div className={`app ${menu ? 'menu-open' : ''}`}>
      <header className="topbar">
        <button type="button" className="menu-btn" aria-label="Menu" onClick={() => setMenu(!menu)}>
          <span />
          <span />
          <span />
        </button>
        <a className="brand" href={href('/')}>
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="3.2" fill="#ffc145" />
              <ellipse cx="12" cy="12" rx="10" ry="4.2" fill="none" stroke="#2fe0c4" strokeWidth="1.5" />
              <ellipse cx="12" cy="12" rx="10" ry="4.2" fill="none" stroke="#4aa8ff" strokeWidth="1.5" transform="rotate(60 12 12)" />
              <ellipse cx="12" cy="12" rx="10" ry="4.2" fill="none" stroke="#ff5c5c" strokeWidth="1.5" transform="rotate(120 12 12)" />
            </svg>
          </span>
          E&amp;M Lab
        </a>
        <span className="topbar-page">{page?.title ?? 'PHYS 2212'}</span>
      </header>
      <nav className="sidebar">
        <a className={`nav-link ${route.path === '/' ? 'on' : ''}`} href={href('/')}>
          Course map
        </a>
        {GROUPS.map((g) => (
          <div className="nav-group" key={g}>
            <div className="nav-group-title">{g}</div>
            {PAGES.filter((p) => p.group === g).map((p) => (
              <a key={p.path} className={`nav-link ${page === p ? 'on' : ''}`} href={href(p.path)}>
                {p.title}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="scrim" onClick={() => setMenu(false)} />
      <main className="content">
        {Component ? (
          <Suspense fallback={<div className="loading">Loading…</div>}>
            <Component key={page!.path} />
          </Suspense>
        ) : (
          <HomePage />
        )}
      </main>
    </div>
  );
}

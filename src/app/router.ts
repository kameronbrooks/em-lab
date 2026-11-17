import { useEffect, useState } from 'react';

export interface Route {
  /** Path without the leading '#', e.g. '/fields/gauss'. */
  path: string;
  parts: string[];
  query: Record<string, string>;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query: Record<string, string> = {};
  if (qs) for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
  const clean = path.startsWith('/') ? path : '/' + path;
  return { path: clean, parts: clean.split('/').filter(Boolean), query };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = path;
}

/** href for an in-app link. */
export const href = (path: string) => `#${path}`;

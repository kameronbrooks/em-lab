import { useCallback, useEffect, useState } from 'react';

export type Status = 'solved' | 'review';

export interface Entry {
  status?: Status;
  /** Number of times an answer was checked. */
  attempts: number;
  /** Hints revealed (most ever shown for this problem). */
  hints: number;
  /** Time of the last status change (ms since epoch). */
  at?: number;
}

export type Progress = Record<number, Entry>;

const KEY = 'emlab.practice.v1';

function load(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? (data as Progress) : {};
  } catch {
    return {};
  }
}

function save(p: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode or storage full: progress just will not persist */
  }
}

/** Practice progress, stored in this browser. */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(load);

  // pick up changes made in another tab
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === KEY) setProgress(load());
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const update = useCallback((n: number, patch: (e: Entry) => Entry) => {
    setProgress((prev) => {
      const next = { ...prev, [n]: patch(prev[n] ?? { attempts: 0, hints: 0 }) };
      save(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    save({});
    setProgress({});
  }, []);

  return { progress, update, reset };
}

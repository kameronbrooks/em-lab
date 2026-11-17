import { lazy } from 'react';
import { range } from '../content/videos';

export interface PageDef {
  path: string;
  title: string;
  /** Sidebar group. */
  group: 'Fields' | 'Circuits' | 'Waves' | 'Tools';
  blurb: string;
  /** Playlist video numbers this page covers. */
  videos: number[];
  /** Problem numbers from the additional problem set this page helps with. */
  problems: number[];
  component: React.LazyExoticComponent<React.ComponentType>;
}

export const PAGES: PageDef[] = [
  {
    path: '/fields/charges',
    title: 'Charges & electric field',
    group: 'Fields',
    blurb: 'Drag point charges and watch the field, field lines and potential respond.',
    videos: range(1, 7),
    problems: [1, 10, 23],
    component: lazy(() => import('../pages/fields/ChargesPage')),
  },
  {
    path: '/fields/continuous',
    title: 'Continuous charge',
    group: 'Fields',
    blurb: 'Build the field of lines, rings, planes and spheres by adding up small pieces dq.',
    videos: [8, 9, 10, 19],
    problems: [2, 4, 8, 11],
    component: lazy(() => import('../pages/fields/ContinuousPage')),
  },
  {
    path: '/fields/gauss',
    title: "Flux & Gauss's law",
    group: 'Fields',
    blurb: 'Move a closed surface around charges and see the flux count only what is inside.',
    videos: range(11, 18),
    problems: [2, 4, 5, 6, 8, 9, 11, 12, 13, 15, 16, 17, 21],
    component: lazy(() => import('../pages/fields/GaussPage')),
  },
  {
    path: '/fields/potential',
    title: 'Potential & energy',
    group: 'Fields',
    blurb: 'Accelerate a charge through a field and watch work turn into kinetic energy.',
    videos: range(20, 24),
    problems: [3, 7, 14, 18, 19, 20, 22],
    component: lazy(() => import('../pages/fields/PotentialPage')),
  },
  {
    path: '/fields/magforce',
    title: 'Magnetic force',
    group: 'Fields',
    blurb: 'Launch a charged particle through a magnetic field and see v, B and F in 3D.',
    videos: [25, 26, 27, 28, 35, 39],
    problems: [28, 29, 30, 31, 32, 33],
    component: lazy(() => import('../pages/fields/MagForcePage')),
  },
  {
    path: '/fields/sources',
    title: "Currents & Ampère's law",
    group: 'Fields',
    blurb: 'Fields made by wires, sheets and solenoids, with Ampère loops you can resize.',
    videos: [29, 30, 31, 32, 33, 34, 36, 37, 38, 40],
    problems: [27, 34, 35],
    component: lazy(() => import('../pages/fields/SourcesPage')),
  },
  {
    path: '/fields/induction',
    title: 'Induction',
    group: 'Fields',
    blurb: 'Change the magnetic flux through a loop and watch the emf and current appear.',
    videos: range(41, 50),
    problems: [24, 25, 26, 36, 37, 38, 39, 40],
    component: lazy(() => import('../pages/fields/InductionPage')),
  },
  {
    path: '/circuits',
    title: 'Circuit builder',
    group: 'Circuits',
    blurb: 'Build RC, RL, LC and RLC circuits, run them, and compare with the formula sheet.',
    videos: range(51, 76),
    problems: range(41, 62),
    component: lazy(() => import('../pages/circuits/CircuitsPage')),
  },
  {
    path: '/waves/1d',
    title: 'Travelling waves',
    group: 'Waves',
    blurb: 'Wavelength, period, speed and direction of cos(ax − bt).',
    videos: [79, 80, 81],
    problems: [65],
    component: lazy(() => import('../pages/waves/Wave1DPage')),
  },
  {
    path: '/waves/em',
    title: 'Electromagnetic waves',
    group: 'Waves',
    blurb: 'E, B and the direction of travel in 3D.',
    videos: [77, 78, 82, 83, 84],
    problems: [63, 64, 65],
    component: lazy(() => import('../pages/waves/EMWavePage')),
  },
  {
    path: '/waves/loop',
    title: 'Loop in a wave',
    group: 'Waves',
    blurb: 'Orient a loop in an electromagnetic wave to maximise the induced emf.',
    videos: [77, 82, 83],
    problems: [63, 64],
    component: lazy(() => import('../pages/waves/WaveLoopPage')),
  },
  {
    path: '/solver',
    title: 'Solver & formula sheet',
    group: 'Tools',
    blurb: 'Type LaTeX, solve for any variable, and use every formula on the course sheet.',
    videos: [],
    problems: [],
    component: lazy(() => import('../pages/solver/SolverPage')),
  },
  {
    path: '/practice',
    title: 'Practice problems',
    group: 'Tools',
    blurb: 'The 65 additional problems with hints, worked solutions and answer checking.',
    videos: [],
    problems: [],
    component: lazy(() => import('../pages/practice/PracticePage')),
  },
];

export const GROUPS: PageDef['group'][] = ['Fields', 'Circuits', 'Waves', 'Tools'];

export function findPage(path: string): PageDef | undefined {
  return PAGES.find((p) => path === p.path || path.startsWith(p.path + '/'));
}

/** The lab page that best matches a problem number (for "open in lab" links). */
export function pageForProblem(n: number): PageDef | undefined {
  return PAGES.find((p) => p.problems.includes(n));
}

// Randomised LC questions of the kinds the course asks: fractions of charge, current and energy,
// peak values, and "at what time". Answers are LaTeX the maths layer can check.

import { Known, exactValue, frac, knownTex, workLC } from '../../physics/lc';

const r = String.raw;

export interface DrillQ {
  /** Template id. */
  id: string;
  /** The fraction m/n used in the question (1/1 for questions without one). */
  m: number;
  n: number;
  /** Question text; inline LaTeX between dollar signs. */
  text: string;
  /** Reference answer (LaTeX). */
  expr: string;
  /** The answer is a pure number, so a rounded decimal is accepted as well. */
  numeric: boolean;
  /** Worked solution, one step per entry. */
  solution: string[];
  /** Charge fraction q/q0 at the moment the question is about (to show it on the circle). */
  showQ?: number;
}

type Template = (m: number, n: number) => Omit<DrillQ, 'm' | 'n'>;

const fr = (m: number, n: number) => (n === 1 ? `${m}` : r`\frac{${m}}{${n}}`);
const WORD: Record<Known, string> = {
  q: 'fraction of its maximum charge is on the capacitor',
  i: 'fraction of its maximum value is the current',
  EC: 'fraction of the total energy is in the capacitor',
  EL: 'fraction of the total energy is in the inductor',
};
const GIVEN: Record<Known, (f: string) => string> = {
  q: (f) => `the capacitor holds $${f}$ of its maximum charge`,
  i: (f) => `the current is $${f}$ of its maximum value`,
  EC: (f) => `$${f}$ of the total energy is in the capacitor`,
  EL: (f) => `$${f}$ of the total energy is in the inductor`,
};

/** "Given one fraction, find another" question, solved with workLC. */
function fraction(id: string, given: Known, ask: Known, expr: (f: string) => string): Template {
  return (m, n) => {
    const f = fr(m, n);
    const w = workLC(given, exactValue(frac(m, n)))!;
    // keep the steps up to the one that produces what was asked for
    const last = w.steps.findIndex((s) => s.tex.startsWith(knownTex(ask)));
    const steps = w.steps.slice(0, last + 1).map((s) => `${s.say} $${s.tex}$`);
    return {
      id,
      text: `In an LC circuit, ${GIVEN[given](f)}. What ${WORD[ask]} at that moment?`,
      expr: expr(f),
      numeric: true,
      solution: steps,
      showQ: w.q.value,
    };
  };
}

const START = r`A capacitor $C$ holding charge $q_0$ is connected across an inductor $L$ at $t = 0$.`;
const ENERGY = r`Energy is conserved: $\dfrac{q^2}{2C} + \dfrac{Li^2}{2} = \dfrac{q_0^2}{2C}$.`;

function timeQuestion(id: string, what: string, angle: string, angleValue: number, why: string): Template {
  return () => ({
    id,
    text: `${START} Find the first time at which ${what}. Answer in terms of $L$ and $C$.`,
    expr: r`${angle}\sqrt{LC}`,
    numeric: false,
    solution: [
      r`$q = q_0\cos\!\left(\dfrac{t}{\sqrt{LC}}\right)$, starting from a full capacitor.`,
      why,
      r`So $\dfrac{t}{\sqrt{LC}} = ${angle}$, which gives $t = ${angle}\sqrt{LC}$.`,
    ],
    showQ: Math.cos(angleValue),
  });
}

export const TEMPLATES: Template[] = [
  fraction('q-from-i', 'i', 'q', (f) => r`\sqrt{1-\left(${f}\right)^2}`),
  fraction('i-from-q', 'q', 'i', (f) => r`\sqrt{1-\left(${f}\right)^2}`),
  fraction('EL-from-q', 'q', 'EL', (f) => r`1-\left(${f}\right)^2`),
  fraction('EC-from-i', 'i', 'EC', (f) => r`1-\left(${f}\right)^2`),
  fraction('EL-from-i', 'i', 'EL', (f) => r`\left(${f}\right)^2`),
  fraction('EC-from-q', 'q', 'EC', (f) => r`\left(${f}\right)^2`),
  fraction('q-from-EC', 'EC', 'q', (f) => r`\sqrt{${f}}`),
  fraction('q-from-EL', 'EL', 'q', (f) => r`\sqrt{1-${f}}`),
  fraction('i-from-EC', 'EC', 'i', (f) => r`\sqrt{1-${f}}`),
  fraction('i-from-EL', 'EL', 'i', (f) => r`\sqrt{${f}}`),

  () => ({
    id: 'peak-current',
    text: `${START} Find the maximum current, in terms of $q_0$, $L$ and $C$.`,
    expr: r`\frac{q_0}{\sqrt{LC}}`,
    numeric: false,
    solution: [
      r`At the start all the energy is in the capacitor: $E_{total} = \dfrac{q_0^2}{2C}$.`,
      r`The current is largest when the capacitor is empty, so then all of it is in the inductor: $\dfrac{Li_{max}^2}{2} = \dfrac{q_0^2}{2C}$.`,
      r`Solve for the current: $i_{max}^2 = \dfrac{q_0^2}{LC}$, so $i_{max} = \dfrac{q_0}{\sqrt{LC}}$.`,
    ],
    showQ: 0,
  }),
  (m, n) => {
    const f = fr(m, n);
    const w = workLC('q', exactValue(frac(m, n)))!;
    return {
      id: 'i-at-q',
      text: `${START} Find the size of the current at the moment the charge on the capacitor is $${f}\\,q_0$. Answer in terms of $q_0$, $L$ and $C$.`,
      expr: r`\frac{q_0}{\sqrt{LC}}\sqrt{1-\left(${f}\right)^2}`,
      numeric: false,
      solution: [
        ENERGY,
        r`Put in $q = ${f}\,q_0$: $\dfrac{Li^2}{2} = \dfrac{q_0^2}{2C}\left(1 - ${w.EC.tex}\right) = ${w.EL.tex}\cdot\dfrac{q_0^2}{2C}$.`,
        r`Solve for the current: $i = ${w.i.tex}\cdot\dfrac{q_0}{\sqrt{LC}}$. That is $${w.i.tex}$ of the maximum current $\dfrac{q_0}{\sqrt{LC}}$.`,
      ],
      showQ: m / n,
    };
  },
  () => ({
    id: 'peak-charge',
    text: r`The maximum current in an LC circuit is $I$. Find the maximum charge on the capacitor, in terms of $I$, $L$ and $C$.`,
    expr: r`I\sqrt{LC}`,
    numeric: false,
    solution: [
      r`When the current is at its maximum the capacitor is empty: $E_{total} = \dfrac{LI^2}{2}$.`,
      r`The charge is largest when the current is zero, so then all of it is in the capacitor: $\dfrac{q_0^2}{2C} = \dfrac{LI^2}{2}$.`,
      r`Solve for the charge: $q_0^2 = LC\,I^2$, so $q_0 = I\sqrt{LC}$.`,
    ],
    showQ: 1,
  }),
  (m, n) => {
    const f = fr(m, n);
    const w = workLC('i', exactValue(frac(m, n)))!;
    return {
      id: 'q-at-i',
      text: `The maximum current in an LC circuit is $I$. Find the size of the charge on the capacitor at the moment the current is $${f}\\,I$. Answer in terms of $I$, $L$ and $C$.`,
      expr: r`I\sqrt{LC}\sqrt{1-\left(${f}\right)^2}`,
      numeric: false,
      solution: [
        r`Total energy, from the moment of maximum current: $E_{total} = \dfrac{LI^2}{2}$.`,
        r`With $i = ${f}\,I$ the inductor holds $${w.EL.tex}$ of it, so the capacitor holds $${w.EC.tex}$: $\dfrac{q^2}{2C} = ${w.EC.tex}\cdot\dfrac{LI^2}{2}$.`,
        r`Solve for the charge: $q = ${w.q.tex}\cdot I\sqrt{LC}$. That is $${w.q.tex}$ of the maximum charge $I\sqrt{LC}$.`,
      ],
      showQ: w.q.value,
    };
  },
  () => ({
    id: 'energy-from-I',
    text: r`The maximum current in an LC circuit is $I$. Find the total energy in the circuit, in terms of $I$, $L$ and $C$.`,
    expr: r`\frac{LI^2}{2}`,
    numeric: false,
    solution: [
      r`At the moment of maximum current the capacitor is empty, so every bit of the energy is in the inductor.`,
      r`$E_{total} = \dfrac{LI^2}{2}$. It has this value at every other moment too.`,
    ],
    showQ: 0,
  }),
  () => ({
    id: 'energy-from-q',
    text: r`The maximum charge on the capacitor of an LC circuit is $q_0$. Find the total energy in the circuit, in terms of $q_0$, $L$ and $C$.`,
    expr: r`\frac{q_0^2}{2C}`,
    numeric: false,
    solution: [
      r`At the moment of maximum charge the current is zero, so every bit of the energy is in the capacitor.`,
      r`$E_{total} = \dfrac{q_0^2}{2C}$. It has this value at every other moment too.`,
    ],
    showQ: 1,
  }),
  (m, n) => {
    const f = fr(m, n);
    const w = workLC('q', exactValue(frac(m, n)))!;
    return {
      id: 'EL-at-q',
      text: `${START} Find the energy stored in the inductor at the moment the charge on the capacitor is $${f}\\,q_0$. Answer in terms of $q_0$, $L$ and $C$.`,
      expr: r`\frac{q_0^2}{2C}\left(1-\left(${f}\right)^2\right)`,
      numeric: false,
      solution: [
        r`Total energy: $E_{total} = \dfrac{q_0^2}{2C}$.`,
        r`Capacitor at that moment: $E_C = \dfrac{\left(${f}\,q_0\right)^2}{2C} = ${w.EC.tex}\cdot\dfrac{q_0^2}{2C}$.`,
        r`The inductor has the rest: $E_L = E_{total} - E_C = ${w.EL.tex}\cdot\dfrac{q_0^2}{2C}$.`,
      ],
      showQ: m / n,
    };
  },

  timeQuestion('t-empty', 'the capacitor is completely discharged', r`\frac{\pi}{2}`, Math.PI / 2,
    r`The charge is zero when the cosine is zero, which first happens when its angle is $\dfrac{\pi}{2}$ (a quarter of a cycle).`),
  timeQuestion('t-equal', 'the energy is shared equally between the capacitor and the inductor', r`\frac{\pi}{4}`, Math.PI / 4,
    r`Half the energy in the capacitor means $\left(\dfrac{q}{q_0}\right)^2 = \dfrac12$, so $\cos = \dfrac{1}{\sqrt2}$, which first happens at angle $\dfrac{\pi}{4}$.`),
  timeQuestion('t-reversed', 'the capacitor is fully charged again, with the opposite sign', r`\pi`, Math.PI,
    r`Fully charged with the opposite sign means $q = -q_0$, so the cosine is $-1$, which first happens at angle $\pi$ (half a cycle).`),
  timeQuestion('t-half', 'the charge on the capacitor has dropped to half its maximum', r`\frac{\pi}{3}`, Math.PI / 3,
    r`$\dfrac{q}{q_0} = \dfrac12$ means the cosine is $\dfrac12$, which first happens at angle $\dfrac{\pi}{3}$ (60°).`),
  () => ({
    id: 'i-at-time',
    text: `${START} Find the size of the current at $t = \\dfrac{\\pi}{6}\\sqrt{LC}$. Answer in terms of $q_0$, $L$ and $C$.`,
    expr: r`\frac{q_0}{2\sqrt{LC}}`,
    numeric: false,
    solution: [
      r`$q = q_0\cos\!\left(\dfrac{t}{\sqrt{LC}}\right)$, and the current is its rate of change: $i = -\dfrac{q_0}{\sqrt{LC}}\sin\!\left(\dfrac{t}{\sqrt{LC}}\right)$.`,
      r`At $t = \dfrac{\pi}{6}\sqrt{LC}$ the angle is $\dfrac{\pi}{6}$ (30°), and $\sin\dfrac{\pi}{6} = \dfrac12$.`,
      r`Size of the current: $\dfrac{q_0}{2\sqrt{LC}}$, half of the maximum. (The minus sign says the capacitor is discharging.)`,
    ],
    showQ: Math.cos(Math.PI / 6),
  }),
];

/** Fractions that show up in this kind of question. Several give clean answers (3/5 pairs with 4/5). */
const FRACTIONS: [number, number][] = [
  [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [1, 7], [2, 7], [1, 8], [1, 10], [5, 13], [12, 13],
];

/** A random question, different from the previous one. The first ten templates (pure fractions) come up most. */
export function makeDrill(previous?: DrillQ, rng: () => number = Math.random): DrillQ {
  for (let guard = 0; guard < 50; guard++) {
    const core = rng() < 0.6;
    const index = core ? Math.floor(rng() * 10) : 10 + Math.floor(rng() * (TEMPLATES.length - 10));
    const [m, n] = FRACTIONS[Math.floor(rng() * FRACTIONS.length)];
    const q = { ...TEMPLATES[index](m, n), m, n };
    if (!previous || q.id !== previous.id) return q;
  }
  return { ...TEMPLATES[0](1, 3), m: 1, n: 3 };
}

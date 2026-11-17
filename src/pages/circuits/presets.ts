import { CElement, ElType, Pt, makeElement } from '../../physics/circuit/solver';

export interface Preset {
  id: string;
  label: string;
  group: 'Resistors' | 'RC and RL' | 'LC and RLC';
  /** One-line description of what to watch. */
  note: string;
  /** Plot window in simulated seconds. */
  window: number;
  build(): CElement[];
}

const el = (type: ElType, a: Pt, b: Pt, value?: number, extra?: Partial<CElement>) => makeElement(type, a, b, value, extra);
const wire = (a: Pt, b: Pt) => makeElement('wire', a, b);

const L0 = 1;
const C0 = 0.1;
/** Critical resistance for the RLC presets: sqrt(4L/C). */
export const R_CRIT = Math.sqrt((4 * L0) / C0);
export const F0 = 1 / (2 * Math.PI * Math.sqrt(L0 * C0));

function rlc(R: number): CElement[] {
  return [
    el('capacitor', [0, 3], [0, 0], C0, { ic: 10 }),
    el('resistor', [0, 3], [2, 3], R),
    wire([2, 3], [4, 3]),
    el('inductor', [4, 3], [4, 0], L0),
    wire([4, 0], [0, 0]),
  ];
}

function parallel(V: number, R: number[]): CElement[] {
  const out: CElement[] = [el('battery', [0, 0], [0, 3], V)];
  R.forEach((r, k) => {
    const x = 2 * (k + 1);
    out.push(wire([x - 2, 3], [x, 3]), el('resistor', [x, 3], [x, 0], r), wire([x, 0], [x - 2, 0]));
  });
  return out;
}

export const PRESETS: Preset[] = [
  {
    id: 'series', label: 'Resistors in series', group: 'Resistors', window: 3,
    note: 'One path, so the same current goes through every resistor. The voltages add up to the battery voltage.',
    build: () => [
      el('battery', [0, 0], [0, 3], 12),
      el('resistor', [0, 3], [2, 3], 100),
      el('resistor', [2, 3], [4, 3], 200),
      el('resistor', [4, 3], [4, 0], 300),
      wire([4, 0], [0, 0]),
    ],
  },
  {
    id: 'parallel', label: 'Resistors in parallel', group: 'Resistors', window: 3,
    note: 'Every resistor sees the full battery voltage. The current splits, with more going through the smaller resistance.',
    build: () => parallel(12, [100, 200, 300]),
  },
  {
    id: 'p42', label: 'Problem 42: three equal resistors', group: 'Resistors', window: 3,
    note: '33 V drove 1 A through the three in series, so each is 11 Ω. Side by side they give 11/3 Ω.',
    build: () => parallel(33, [11, 11, 11]),
  },
  {
    id: 'mixed', label: 'Series and parallel together', group: 'Resistors', window: 3,
    note: 'Collapse the parallel pair first (200 Ω ∥ 200 Ω = 100 Ω), then add the series resistor.',
    build: () => [
      el('battery', [0, 0], [0, 3], 12),
      el('resistor', [0, 3], [2, 3], 100),
      wire([2, 3], [4, 3]),
      el('resistor', [2, 3], [2, 0], 200),
      el('resistor', [4, 3], [4, 0], 200),
      wire([4, 0], [2, 0]),
      wire([2, 0], [0, 0]),
    ],
  },
  {
    id: 'rc-discharge', label: 'RC: capacitor discharging', group: 'RC and RL', window: 6,
    note: 'The charge falls by the same fraction every RC seconds. It gets closer and closer to zero but never arrives.',
    build: () => [
      el('capacitor', [0, 3], [0, 0], 0.01, { ic: 10 }),
      wire([0, 3], [4, 3]),
      el('resistor', [4, 3], [4, 0], 100),
      wire([4, 0], [0, 0]),
    ],
  },
  {
    id: 'rc-charge', label: 'RC: charging through a switch', group: 'RC and RL', window: 6,
    note: 'Click the switch to close it. The current is largest at the first instant and dies away as the capacitor fills.',
    build: () => [
      el('battery', [0, 0], [0, 3], 10),
      el('switch', [0, 3], [2, 3], 0, { closed: false }),
      el('resistor', [2, 3], [4, 3], 100),
      el('capacitor', [4, 3], [4, 0], 0.01),
      wire([4, 0], [0, 0]),
    ],
  },
  {
    id: 'rl-decay', label: 'RL: current dying away', group: 'RC and RL', window: 3,
    note: 'The inductor keeps the current going for a while. It decays with time constant L/R.',
    build: () => [
      el('inductor', [0, 0], [0, 3], 1, { ic: 1 }),
      wire([0, 3], [4, 3]),
      el('resistor', [4, 3], [4, 0], 2),
      wire([4, 0], [0, 0]),
    ],
  },
  {
    id: 'rl-battery', label: 'RL with a battery (Problem 41)', group: 'RC and RL', window: 3,
    note: 'Click the switch. The resistor and inductor voltages change, but together they always equal the 20 V battery.',
    build: () => [
      el('battery', [0, 0], [0, 3], 20),
      el('switch', [0, 3], [2, 3], 0, { closed: false }),
      el('resistor', [2, 3], [4, 3], 10),
      el('inductor', [4, 3], [4, 0], 5),
      wire([4, 0], [0, 0]),
    ],
  },
  {
    id: 'lc', label: 'LC: charged capacitor and inductor', group: 'LC and RLC', window: 6,
    note: 'Energy sloshes between the capacitor and the inductor. The total never changes.',
    build: () => [
      el('capacitor', [0, 3], [0, 0], C0, { ic: 10 }),
      wire([0, 3], [4, 3]),
      el('inductor', [4, 3], [4, 0], L0),
      wire([4, 0], [0, 0]),
    ],
  },
  {
    id: 'rlc-under', label: 'RLC: underdamped', group: 'LC and RLC', window: 12,
    note: 'With a small resistance the charge still oscillates, but each swing is smaller as the resistor turns energy into heat.',
    build: () => rlc(1),
  },
  {
    id: 'rlc-critical', label: 'RLC: critically damped', group: 'LC and RLC', window: 6,
    note: 'R = √(4L/C) exactly. The charge returns to zero as fast as it can without ever crossing it.',
    build: () => rlc(R_CRIT),
  },
  {
    id: 'rlc-over', label: 'RLC: overdamped (R > √(7L/C))', group: 'LC and RLC', window: 6,
    note: 'More resistance than the critical value. The charge just drops exponentially without oscillating.',
    build: () => rlc(10),
  },
  {
    id: 'rlc-driven', label: 'Driven RLC at resonance (Problem 58)', group: 'LC and RLC', window: 12,
    note: 'Change the source frequency. The current, and so the resistor voltage, is largest at f = 1/(2π√(LC)).',
    build: () => [
      el('ac', [0, 0], [0, 3], 5, { freq: Number(F0.toFixed(3)) }),
      el('resistor', [0, 3], [2, 3], 2),
      el('inductor', [2, 3], [4, 3], L0),
      el('capacitor', [4, 3], [4, 0], C0),
      wire([4, 0], [0, 0]),
    ],
  },
];

export const findPreset = (id: string) => PRESETS.find((p) => p.id === id);

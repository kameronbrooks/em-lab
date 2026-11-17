// The course formula sheet, in the course's own notation and order.
// `tex` is the formula as written on the sheet. `calcs` are scalar forms of the same statement
// that the calculator can solve for any one variable.

const r = String.raw;

export type FormulaGroup = 'electrostatics' | 'magnetism' | 'induction' | 'circuits' | 'waves';

export const GROUP_TITLES: Record<FormulaGroup, string> = {
  electrostatics: 'Electric force, field and energy',
  magnetism: 'Magnetic force and field',
  induction: 'Induction',
  circuits: 'Circuits',
  waves: 'Waves',
};

export interface FormulaVar {
  /** Symbol name as the parser produces it (q_0, epsilon_0, Delta:V, ...). Omit for symbols that only appear in the sheet form. */
  sym?: string;
  /** LaTeX for the symbol when it is not derivable from `sym`. */
  tex?: string;
  meaning: string;
  unit?: string;
}

export interface FormulaCalc {
  /** Short label when a formula has more than one calculator form. */
  label?: string;
  /** LaTeX equation the calculator solves. */
  tex: string;
  /** When this scalar form applies. */
  note?: string;
}

export interface Formula {
  id: string;
  group: FormulaGroup;
  name: string;
  /** As written on the sheet. */
  tex: string;
  /** One line, plain words. */
  meaning: string;
  vars: FormulaVar[];
  calcs: FormulaCalc[];
}

const EPS: FormulaVar = { sym: 'epsilon_0', meaning: 'permittivity of free space, 8.85×10⁻¹² C²/(N·m²)', unit: 'C²/(N·m²)' };
const MU: FormulaVar = { sym: 'mu_0', meaning: 'permeability of free space, 4π×10⁻⁷ T·m/A', unit: 'T·m/A' };

export const FORMULAS: Formula[] = [
  // ---------- electrostatics ----------
  {
    id: 'coulomb',
    group: 'electrostatics',
    name: "Coulomb's law",
    tex: r`\vec F_e = \frac{1}{4\pi\epsilon_0}\frac{q_1 q_2}{r^2}\,\hat r`,
    meaning: 'Force between two point charges: along the line joining them, weaker with the square of the distance.',
    vars: [
      { sym: 'F_e', meaning: 'electric force', unit: 'N' },
      { sym: 'q_1', meaning: 'first charge', unit: 'C' },
      { sym: 'q_2', meaning: 'second charge', unit: 'C' },
      { sym: 'r', meaning: 'distance between the charges', unit: 'm' },
      { tex: r`\hat r`, meaning: 'unit vector along the line between the charges' },
      EPS,
    ],
    calcs: [{ tex: r`F_e = \frac{1}{4\pi\epsilon_0}\frac{q_1 q_2}{r^2}`, note: 'Magnitude. Positive means repulsion, negative means attraction.' }],
  },
  {
    id: 'force-field',
    group: 'electrostatics',
    name: 'Force from a field',
    tex: r`\vec F_e = q\vec E`,
    meaning: 'A charge q sitting in a field E feels a force qE. Negative charges are pushed against the field.',
    vars: [
      { sym: 'F_e', meaning: 'electric force on the charge', unit: 'N' },
      { sym: 'q', meaning: 'charge that feels the force', unit: 'C' },
      { sym: 'E', meaning: 'electric field at the charge', unit: 'N/C' },
    ],
    calcs: [{ tex: r`F_e = qE` }],
  },
  {
    id: 'field-integral',
    group: 'electrostatics',
    name: 'Field of a charge distribution',
    tex: r`\vec E = \frac{1}{4\pi\epsilon_0}\int \frac{dq}{r^2}\,\hat r`,
    meaning: 'Chop the charge into small pieces dq, treat each as a point charge, and add up their fields as vectors.',
    vars: [
      { sym: 'E', meaning: 'electric field', unit: 'N/C' },
      { tex: 'dq', meaning: 'a small piece of the charge', unit: 'C' },
      { sym: 'q', meaning: 'charge of a single point charge', unit: 'C' },
      { sym: 'r', meaning: 'distance from the piece dq to the point where you want the field', unit: 'm' },
      { tex: r`\hat r`, meaning: 'unit vector from the piece dq toward that point' },
      EPS,
    ],
    calcs: [{ tex: r`E = \frac{1}{4\pi\epsilon_0}\frac{q}{r^2}`, note: 'The single point charge case (one piece).' }],
  },
  {
    id: 'gauss-e',
    group: 'electrostatics',
    name: "Gauss's law",
    tex: r`\oint \vec E\cdot d\vec a = \frac{q_{enc.}}{\epsilon_0}`,
    meaning: 'The total electric flux out of any closed surface depends only on the charge inside it.',
    vars: [
      { sym: 'E', meaning: 'electric field on the surface', unit: 'N/C' },
      { tex: r`d\vec a`, meaning: 'small patch of the closed surface, pointing outward', unit: 'm²' },
      { sym: 'q_enc', tex: r`q_{enc.}`, meaning: 'net charge enclosed by the surface', unit: 'C' },
      { sym: 'phi_E', meaning: 'total electric flux through the closed surface', unit: 'N·m²/C' },
      { sym: 'A', meaning: 'area of the part of the surface the field passes straight through', unit: 'm²' },
      EPS,
    ],
    calcs: [
      { label: 'Total flux', tex: r`\phi_E = \frac{q_{enc}}{\epsilon_0}` },
      { label: 'Symmetric surface', tex: r`E A = \frac{q_{enc}}{\epsilon_0}`, note: 'When E is constant and perpendicular over an area A of the surface (sphere 4πr², cylinder side 2πrL).' },
    ],
  },
  {
    id: 'work',
    group: 'electrostatics',
    name: 'Work',
    tex: r`W \equiv \int \vec F\cdot d\vec r`,
    meaning: 'Work is force times the distance moved along the force, added up along the path.',
    vars: [
      { sym: 'W', meaning: 'work done by the force', unit: 'J' },
      { sym: 'F', meaning: 'force', unit: 'N' },
      { tex: r`d\vec r`, meaning: 'small step along the path', unit: 'm' },
      { sym: 'd', meaning: 'distance moved along the force', unit: 'm' },
    ],
    calcs: [{ tex: r`W = F d`, note: 'Constant force along the direction of motion. For a field: W = qEd.' }],
  },
  {
    id: 'kinetic',
    group: 'electrostatics',
    name: 'Kinetic energy',
    tex: r`K \equiv \frac{1}{2}m\vec v^{\,2}`,
    meaning: 'Energy of motion.',
    vars: [
      { sym: 'K', meaning: 'kinetic energy', unit: 'J' },
      { sym: 'm', meaning: 'mass', unit: 'kg' },
      { sym: 'v', meaning: 'speed', unit: 'm/s' },
    ],
    calcs: [{ tex: r`K = \frac{1}{2}mv^2` }],
  },
  {
    id: 'charge-density',
    group: 'electrostatics',
    name: 'Charge from a density',
    tex: r`q = \lambda\ell = \sigma A = \rho V`,
    meaning: 'Charge on a uniformly charged line, surface or volume: density times length, area or volume.',
    vars: [
      { sym: 'q', meaning: 'total charge', unit: 'C' },
      { sym: 'lambda', meaning: 'charge per length', unit: 'C/m' },
      { sym: 'ell', meaning: 'length', unit: 'm' },
      { sym: 'sigma', meaning: 'charge per area', unit: 'C/m²' },
      { sym: 'A', meaning: 'area', unit: 'm²' },
      { sym: 'rho', meaning: 'charge per volume', unit: 'C/m³' },
      { sym: 'V', meaning: 'volume', unit: 'm³' },
    ],
    calcs: [
      { label: 'Line', tex: r`q = \lambda\ell` },
      { label: 'Surface', tex: r`q = \sigma A` },
      { label: 'Volume', tex: r`q = \rho V` },
    ],
  },
  {
    id: 'work-energy',
    group: 'electrostatics',
    name: 'Work–kinetic energy theorem',
    tex: r`W = \Delta K`,
    meaning: 'The work done on a particle equals the change in its kinetic energy.',
    vars: [
      { sym: 'W', meaning: 'net work done on the particle', unit: 'J' },
      { tex: r`\Delta K`, meaning: 'change in kinetic energy, final minus initial', unit: 'J' },
      { sym: 'm', meaning: 'mass', unit: 'kg' },
      { sym: 'v', meaning: 'final speed', unit: 'm/s' },
      { sym: 'v_0', meaning: 'initial speed', unit: 'm/s' },
    ],
    calcs: [{ tex: r`W = \frac{1}{2}mv^2 - \frac{1}{2}mv_0^2` }],
  },
  {
    id: 'potential',
    group: 'electrostatics',
    name: 'Potential difference',
    tex: r`\Delta V \equiv -\int \vec E\cdot d\vec r`,
    meaning: 'Potential drops as you move along the field. A charge q that moves through ΔV changes its energy by qΔV.',
    vars: [
      { sym: 'Delta:V', meaning: 'potential difference between the end and the start of the path', unit: 'V' },
      { sym: 'E', meaning: 'electric field', unit: 'N/C' },
      { tex: r`d\vec r`, meaning: 'small step along the path', unit: 'm' },
      { sym: 'd', meaning: 'distance moved along the field', unit: 'm' },
    ],
    calcs: [{ tex: r`\Delta V = -E d`, note: 'Uniform field, moving a distance d along the field.' }],
  },
  {
    id: 'flux-e',
    group: 'electrostatics',
    name: 'Electric flux',
    tex: r`\phi_E \equiv \int \vec E\cdot d\vec a`,
    meaning: 'How much field passes through a surface. Only the part of E perpendicular to the surface counts.',
    vars: [
      { sym: 'phi_E', meaning: 'electric flux', unit: 'N·m²/C' },
      { sym: 'E', meaning: 'electric field', unit: 'N/C' },
      { sym: 'A', meaning: 'area of the surface', unit: 'm²' },
      { sym: 'theta', meaning: 'angle between the field and the normal to the surface', unit: 'rad' },
    ],
    calcs: [{ tex: r`\phi_E = E A\cos\theta`, note: 'Uniform field through a flat surface. θ is in radians.' }],
  },

  // ---------- magnetism ----------
  {
    id: 'gauss-b',
    group: 'magnetism',
    name: "Gauss's law for magnetism",
    tex: r`\oint \vec B\cdot d\vec a = 0`,
    meaning: 'The magnetic flux through any closed surface is zero: field lines never start or stop, so what goes in comes out.',
    vars: [
      { sym: 'B', meaning: 'magnetic field', unit: 'T' },
      { tex: r`d\vec a`, meaning: 'small patch of the closed surface', unit: 'm²' },
    ],
    calcs: [],
  },
  {
    id: 'lorentz',
    group: 'magnetism',
    name: 'Magnetic force on a moving charge',
    tex: r`\vec F_B = q\vec v\times\vec B`,
    meaning: 'The force is perpendicular to both the velocity and the field. Motion along the field feels no force.',
    vars: [
      { sym: 'F_B', meaning: 'magnetic force', unit: 'N' },
      { sym: 'q', meaning: 'charge', unit: 'C' },
      { sym: 'v', meaning: 'velocity', unit: 'm/s' },
      { sym: 'B', meaning: 'magnetic field', unit: 'T' },
    ],
    calcs: [],
  },
  {
    id: 'lorentz-mag',
    group: 'magnetism',
    name: 'Size of the magnetic force',
    tex: r`|\vec F_B| = |q|\,|\vec v|\,|\vec B|\sin\phi`,
    meaning: 'Largest when v is perpendicular to B, zero when they are parallel.',
    vars: [
      { sym: 'F_B', meaning: 'magnitude of the magnetic force', unit: 'N' },
      { sym: 'q', meaning: 'size of the charge', unit: 'C' },
      { sym: 'v', meaning: 'speed', unit: 'm/s' },
      { sym: 'B', meaning: 'field strength', unit: 'T' },
      { sym: 'phi', meaning: 'angle between v and B', unit: 'rad' },
    ],
    calcs: [{ tex: r`F_B = q v B\sin\phi`, note: 'Magnitudes. φ is in radians (90° = π/2 ≈ 1.5708).' }],
  },
  {
    id: 'biot-savart',
    group: 'magnetism',
    name: 'Biot–Savart law',
    tex: r`\vec B = \frac{\mu_0}{4\pi}\int \frac{I\,d\vec\ell\times\hat r}{r^2}`,
    meaning: 'Each short piece of current makes a field that circles around it. Add up the pieces to get the total field.',
    vars: [
      { sym: 'B', meaning: 'magnetic field', unit: 'T' },
      { sym: 'I', meaning: 'current', unit: 'A' },
      { tex: r`d\vec\ell`, meaning: 'short piece of the wire, along the current', unit: 'm' },
      { sym: 'r', meaning: 'distance from the piece of wire to the field point', unit: 'm' },
      MU,
    ],
    calcs: [{ tex: r`B = \frac{\mu_0 I}{2\pi r}`, note: 'Result for a long straight wire at distance r.' }],
  },
  {
    id: 'ampere',
    group: 'magnetism',
    name: "Ampère's law",
    tex: r`\oint \vec B\cdot d\vec r = \mu_0\, i_{enc.}`,
    meaning: 'Add up B along any closed loop: the total depends only on the current passing through the loop.',
    vars: [
      { sym: 'B', meaning: 'magnetic field along the loop', unit: 'T' },
      { tex: r`d\vec r`, meaning: 'small step along the closed loop', unit: 'm' },
      { sym: 'i_enc', tex: r`i_{enc.}`, meaning: 'current passing through the loop', unit: 'A' },
      { sym: 'ell', meaning: 'length of the part of the loop that runs along B', unit: 'm' },
      { sym: 'n', meaning: 'turns per length (solenoid)', unit: '1/m' },
      { sym: 'I', meaning: 'current in each turn (solenoid)', unit: 'A' },
      MU,
    ],
    calcs: [
      { label: 'Symmetric loop', tex: r`B\ell = \mu_0 i_{enc}`, note: 'When B is constant along a length ℓ of the loop (circle around a wire: ℓ = 2πr).' },
      { label: 'Solenoid', tex: r`B = \mu_0 n I`, note: 'Inside a long solenoid. Outside, B = 0.' },
    ],
  },
  {
    id: 'force-wire',
    group: 'magnetism',
    name: 'Magnetic force on a current',
    tex: r`\vec F_B = \int I\,d\vec\ell\times\vec B`,
    meaning: 'A current-carrying wire in a field is pushed sideways, perpendicular to both the wire and the field.',
    vars: [
      { sym: 'F_B', meaning: 'magnetic force on the wire', unit: 'N' },
      { sym: 'I', meaning: 'current', unit: 'A' },
      { sym: 'ell', meaning: 'length of wire in the field', unit: 'm' },
      { sym: 'B', meaning: 'magnetic field', unit: 'T' },
      { sym: 'phi', meaning: 'angle between the wire and B', unit: 'rad' },
    ],
    calcs: [{ tex: r`F_B = I\ell B\sin\phi`, note: 'Straight wire in a uniform field.' }],
  },
  {
    id: 'flux-b',
    group: 'magnetism',
    name: 'Magnetic flux',
    tex: r`\phi_B \equiv \int \vec B\cdot d\vec a`,
    meaning: 'How much magnetic field passes through a surface.',
    vars: [
      { sym: 'phi_B', meaning: 'magnetic flux', unit: 'T·m²' },
      { sym: 'B', meaning: 'magnetic field', unit: 'T' },
      { sym: 'A', meaning: 'area of the surface', unit: 'm²' },
      { sym: 'theta', meaning: 'angle between B and the normal to the surface', unit: 'rad' },
    ],
    calcs: [{ tex: r`\phi_B = B A\cos\theta`, note: 'Uniform field through a flat surface.' }],
  },

  // ---------- induction ----------
  {
    id: 'faraday',
    group: 'induction',
    name: "Faraday's law",
    tex: r`\mathcal{E} = -\frac{d\phi_B}{dt}`,
    meaning: 'A changing magnetic flux through a loop drives an emf around it. The minus sign says the emf opposes the change.',
    vars: [
      { sym: 'E', tex: r`\mathcal{E}`, meaning: 'induced emf', unit: 'V' },
      { sym: 'Delta:phi_B', meaning: 'change in magnetic flux', unit: 'T·m²' },
      { sym: 'Delta:t', meaning: 'time the change takes', unit: 's' },
    ],
    calcs: [{ tex: r`\mathcal{E} = -\frac{\Delta \phi_B}{\Delta t}`, note: 'Flux changing at a steady rate.' }],
  },

  // ---------- circuits ----------
  {
    id: 'ohm',
    group: 'circuits',
    name: "Ohm's law",
    tex: r`v = iR`,
    meaning: 'Voltage across a resistor is current times resistance.',
    vars: [
      { sym: 'v', meaning: 'voltage across the resistor', unit: 'V' },
      { sym: 'i', meaning: 'current through it', unit: 'A' },
      { sym: 'R', meaning: 'resistance', unit: 'Ω' },
    ],
    calcs: [{ tex: r`v = iR` }],
  },
  {
    id: 'series',
    group: 'circuits',
    name: 'Resistors in series',
    tex: r`R_{eq.} = \sum_i R_i`,
    meaning: 'In series the same current flows through each resistor, so resistances add.',
    vars: [
      { sym: 'R_eq', tex: r`R_{eq.}`, meaning: 'equivalent resistance', unit: 'Ω' },
      { sym: 'R_1', meaning: 'first resistor', unit: 'Ω' },
      { sym: 'R_2', meaning: 'second resistor', unit: 'Ω' },
      { sym: 'R_3', meaning: 'third resistor', unit: 'Ω' },
    ],
    calcs: [
      { label: 'Two', tex: r`R_{eq} = R_1 + R_2` },
      { label: 'Three', tex: r`R_{eq} = R_1 + R_2 + R_3` },
    ],
  },
  {
    id: 'parallel',
    group: 'circuits',
    name: 'Resistors in parallel',
    tex: r`\frac{1}{R_{eq.}} = \sum_i \frac{1}{R_i}`,
    meaning: 'In parallel each resistor has the same voltage, so the currents add and the total resistance drops.',
    vars: [
      { sym: 'R_eq', tex: r`R_{eq.}`, meaning: 'equivalent resistance', unit: 'Ω' },
      { sym: 'R_1', meaning: 'first resistor', unit: 'Ω' },
      { sym: 'R_2', meaning: 'second resistor', unit: 'Ω' },
      { sym: 'R_3', meaning: 'third resistor', unit: 'Ω' },
    ],
    calcs: [
      { label: 'Two', tex: r`\frac{1}{R_{eq}} = \frac{1}{R_1} + \frac{1}{R_2}` },
      { label: 'Three', tex: r`\frac{1}{R_{eq}} = \frac{1}{R_1} + \frac{1}{R_2} + \frac{1}{R_3}` },
    ],
  },
  {
    id: 'energy-l',
    group: 'circuits',
    name: 'Energy in an inductor',
    tex: r`E_L = \frac{L\,i^2}{2}`,
    meaning: 'An inductor stores energy in its magnetic field, set by the current through it.',
    vars: [
      { sym: 'E_L', meaning: 'energy stored in the inductor', unit: 'J' },
      { sym: 'L', meaning: 'inductance', unit: 'H' },
      { sym: 'i', meaning: 'current', unit: 'A' },
    ],
    calcs: [{ tex: r`E_L = \frac{L i^2}{2}` }],
  },
  {
    id: 'energy-c',
    group: 'circuits',
    name: 'Energy in a capacitor',
    tex: r`E_C = \frac{q^2}{2C}`,
    meaning: 'A capacitor stores energy in its electric field, set by the charge on it.',
    vars: [
      { sym: 'E_C', meaning: 'energy stored in the capacitor', unit: 'J' },
      { sym: 'q', meaning: 'charge on the capacitor', unit: 'C' },
      { sym: 'C', meaning: 'capacitance', unit: 'F' },
    ],
    calcs: [{ tex: r`E_C = \frac{q^2}{2C}` }],
  },
  {
    id: 'capacitance',
    group: 'circuits',
    name: 'Capacitance',
    tex: r`C \equiv \frac{q}{V}`,
    meaning: 'How much charge a capacitor holds per volt across it.',
    vars: [
      { sym: 'C', meaning: 'capacitance', unit: 'F' },
      { sym: 'q', meaning: 'charge on the capacitor', unit: 'C' },
      { sym: 'V', meaning: 'voltage across it', unit: 'V' },
    ],
    calcs: [{ tex: r`C = \frac{q}{V}` }],
  },
  {
    id: 'lc-charge',
    group: 'circuits',
    name: 'LC circuit',
    tex: r`q = q_0\cos\!\left(\frac{t}{\sqrt{LC}} + \phi\right)`,
    meaning: 'With no resistance the charge swings back and forth forever, trading energy between capacitor and inductor.',
    vars: [
      { sym: 'q', meaning: 'charge on the capacitor at time t', unit: 'C' },
      { sym: 'q_0', meaning: 'maximum charge', unit: 'C' },
      { sym: 't', meaning: 'time', unit: 's' },
      { sym: 'L', meaning: 'inductance', unit: 'H' },
      { sym: 'C', meaning: 'capacitance', unit: 'F' },
      { sym: 'phi', meaning: 'phase: sets where in the cycle t = 0 falls', unit: 'rad' },
    ],
    calcs: [{ tex: r`q = q_0\cos\left(\frac{t}{\sqrt{LC}} + \phi\right)` }],
  },
  {
    id: 'rc-charge',
    group: 'circuits',
    name: 'RC circuit (discharging)',
    tex: r`q = q_0\,e^{-t/RC}`,
    meaning: 'A capacitor emptying through a resistor loses the same fraction of its charge in every equal time step.',
    vars: [
      { sym: 'q', meaning: 'charge at time t', unit: 'C' },
      { sym: 'q_0', meaning: 'charge at t = 0', unit: 'C' },
      { sym: 't', meaning: 'time', unit: 's' },
      { sym: 'R', meaning: 'resistance', unit: 'Ω' },
      { sym: 'C', meaning: 'capacitance', unit: 'F' },
    ],
    calcs: [{ tex: r`q = q_0 e^{-t/RC}` }],
  },
  {
    id: 'rl-current',
    group: 'circuits',
    name: 'RL circuit (decaying)',
    tex: r`i = i_0\,e^{-\frac{Rt}{L}}`,
    meaning: 'Current in an inductor dies away exponentially through a resistor, with time constant L/R.',
    vars: [
      { sym: 'i', meaning: 'current at time t', unit: 'A' },
      { sym: 'i_0', meaning: 'current at t = 0', unit: 'A' },
      { sym: 't', meaning: 'time', unit: 's' },
      { sym: 'R', meaning: 'resistance', unit: 'Ω' },
      { sym: 'L', meaning: 'inductance', unit: 'H' },
    ],
    calcs: [{ tex: r`i = i_0 e^{-Rt/L}` }],
  },
  {
    id: 'rlc-charge',
    group: 'circuits',
    name: 'RLC circuit: trial solution',
    tex: r`q = q_0\,e^{at}`,
    meaning: 'In a series RLC circuit the charge behaves like an exponential with rate a. Whether a is real or complex decides if it oscillates.',
    vars: [
      { sym: 'q', meaning: 'charge at time t', unit: 'C' },
      { sym: 'q_0', meaning: 'charge at t = 0', unit: 'C' },
      { sym: 'a', meaning: 'rate constant from the formula below', unit: '1/s' },
      { sym: 't', meaning: 'time', unit: 's' },
    ],
    calcs: [{ tex: r`q = q_0 e^{at}`, note: 'For real a (the non-oscillating cases).' }],
  },
  {
    id: 'rlc-roots',
    group: 'circuits',
    name: 'RLC circuit: rate constant',
    tex: r`a = -\frac{R}{2L} \pm \frac{1}{2}\sqrt{\left(\frac{R}{L}\right)^2 - \frac{4}{LC}}`,
    meaning: 'If the square root is real (R² > 4L/C) the charge just decays. If it is imaginary the charge oscillates while it decays. R² = 4L/C is the borderline.',
    vars: [
      { sym: 'a', meaning: 'rate constant in the trial solution q = q₀ exp(at)', unit: '1/s' },
      { sym: 'R', meaning: 'resistance', unit: 'Ω' },
      { sym: 'L', meaning: 'inductance', unit: 'H' },
      { sym: 'C', meaning: 'capacitance', unit: 'F' },
    ],
    calcs: [{ tex: r`a = -\frac{R}{2L} \pm \frac{1}{2}\sqrt{\left(\frac{R}{L}\right)^2 - \frac{4}{LC}}`, note: 'Real values only: needs R² ≥ 4L/C. Both signs are shown.' }],
  },
  {
    id: 'omega',
    group: 'circuits',
    name: 'Natural frequency',
    tex: r`\omega = \frac{1}{\sqrt{LC}}`,
    meaning: 'Angular frequency of an LC circuit, and the driving frequency at which an RLC circuit resonates.',
    vars: [
      { sym: 'omega', meaning: 'angular frequency (ω = 2πf)', unit: 'rad/s' },
      { sym: 'L', meaning: 'inductance', unit: 'H' },
      { sym: 'C', meaning: 'capacitance', unit: 'F' },
    ],
    calcs: [{ tex: r`\omega = \frac{1}{\sqrt{LC}}` }],
  },

  // ---------- waves ----------
  {
    id: 'poynting',
    group: 'waves',
    name: 'Direction of an electromagnetic wave',
    tex: r`\vec E\times\vec B = 4\pi\,\vec S`,
    meaning: 'E, B and the direction of travel S are all perpendicular. Point your fingers along E, curl them toward B, and your thumb gives the direction the wave travels.',
    vars: [
      { sym: 'E', meaning: 'electric field of the wave', unit: 'N/C' },
      { sym: 'B', meaning: 'magnetic field of the wave', unit: 'T' },
      { sym: 'S', meaning: 'energy flow, pointing along the direction of travel' },
    ],
    calcs: [{ tex: r`E B = 4\pi S`, note: 'Magnitudes, as written on the course sheet (E perpendicular to B). In SI units the constant is μ₀ instead of 4π.' }],
  },
];

export const getFormula = (id: string): Formula | undefined => FORMULAS.find((f) => f.id === id);

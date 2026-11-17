import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../app/router';
import { fmt } from '../../engine/math';
import { Plot } from '../../engine/plot';
import { SeriesInfo } from '../../physics/circuit/analytic';
import { CElement } from '../../physics/circuit/solver';
import { Bar, Button, ButtonRow, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Tex, Toggle, bumpAll, useLabUI } from '../../ui/controls';
import { LabCanvas } from '../../ui/LabCanvas';
import { LabPage } from '../../ui/LabPage';
import { CircuitLab, TYPE_NAME, Tool, si } from './circuitLab';
import './circuits.css';
import { PRESETS } from './presets';

type ScopeView = 'vi' | 'energy' | 'all';
/** Window width above which all three scope plots fit side by side. */
const WIDE = 1280;

const TOOLS: { tool: Tool; label: string; key: string; title: string }[] = [
  { tool: 'select', label: 'Select', key: 'V', title: 'Select, move and edit parts' },
  { tool: 'wire', label: 'Wire', key: 'W', title: 'Drag between grid points to draw a wire' },
  { tool: 'resistor', label: 'Resistor', key: 'R', title: 'Drag between grid points to place a resistor' },
  { tool: 'capacitor', label: 'Capacitor', key: 'C', title: 'Drag between grid points to place a capacitor' },
  { tool: 'inductor', label: 'Inductor', key: 'L', title: 'Drag between grid points to place an inductor' },
  { tool: 'battery', label: 'Battery', key: 'B', title: 'Drag from the − end to the + end' },
  { tool: 'ac', label: 'AC', key: 'A', title: 'Drag between grid points to place an alternating source' },
  { tool: 'switch', label: 'Switch', key: 'S', title: 'Drag to place a switch, click it to flip it' },
  { tool: 'delete', label: 'Delete', key: 'X', title: 'Click a part to remove it' },
];

const tex = (x: number, digits = 3) => {
  if (!isFinite(x)) return '\\infty';
  const s = fmt(x, digits).replace('−', '-');
  const m = s.match(/^(-?[\d.]+)×10(.+)$/);
  if (!m) return s;
  const sup: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  return `${m[1]}\\times 10^{${m[2].split('').map((c) => sup[c] ?? c).join('')}}`;
};

export default function CircuitsPage() {
  useLabUI(8);
  const lab = useMemo(() => new CircuitLab(), []);
  const vPlot = useMemo(() => new Plot(() => lab.plotData('v')), [lab]);
  const iPlot = useMemo(() => new Plot(() => lab.plotData('i')), [lab]);
  const ePlot = useMemo(() => new Plot(() => lab.plotData('e')), [lab]);
  const rPlot = useMemo(() => new Plot(() => lab.resonanceData() ?? { x0: 0, x1: 1, curves: [] }), [lab]);
  const route = useRoute();
  const [view, setView] = useState<ScopeView>(() => (window.innerWidth >= WIDE ? 'all' : 'vi'));
  useEffect(() => {
    if (route.query.preset) {
      lab.loadPreset(route.query.preset);
      for (const p of [vPlot, iPlot, ePlot]) p.resetRange();
      if (window.innerWidth < WIDE) setView(lab.preset?.group === 'LC and RLC' ? 'energy' : 'vi');
      bumpAll();
    }
  }, [lab, route.query.preset, vPlot, iPlot, ePlot]);

  const c = lab.circuit;
  const sel = lab.selected;
  const scope = lab.scopeEl();
  const an = lab.analysis;
  const en = c.energies();
  const total = en.uc + en.ul + en.heat;
  const eMax = Math.max(1e-9, total, en.work);
  const req = lab.equivalentR();
  const hasSource = c.elements.some((e) => e.type === 'battery' || e.type === 'ac');
  const resistors = c.elements.filter((e) => e.type === 'resistor');
  const damping = an && (an.kind === 'RLC' || an.kind === 'LC') && !an.ac && resistors.length === 1 && an.rCrit ? resistors[0] : null;
  const acSrc = an?.ac ? c.elements.find((e) => e.type === 'ac') ?? null : null;
  const resetPlots = () => {
    vPlot.resetRange();
    iPlot.resetRange();
    ePlot.resetRange();
  };
  const edit = (tag: string, fn: () => void) => {
    lab.pushUndo(tag);
    fn();
    lab.edited();
  };

  return (
    <LabPage
      lab={lab}
      hint={
        lab.tool === 'select'
          ? 'Click a part to edit it · drag to move · scroll to zoom'
          : lab.tool === 'delete'
            ? 'Click a part to delete it'
            : `Drag between two grid points to place a ${TYPE_NAME[lab.tool as keyof typeof TYPE_NAME].toLowerCase()}`
      }
      toolbar={
        <div className="circuit-tools">
          {TOOLS.map((t) => (
            <Button key={t.tool} active={lab.tool === t.tool} title={`${t.title} (${t.key})`} onClick={() => lab.setTool(t.tool)}>
              {t.label}
            </Button>
          ))}
          <span className="sep" />
          <Button title="Undo (Ctrl+Z)" disabled={!lab.canUndo} onClick={() => lab.undo()}>Undo</Button>
          <Button title="Remove everything" onClick={() => lab.clear()}>Clear</Button>
        </div>
      }
      below={
        <>
          <div className="scope-head">
            <span>
              Scope: <b>{scope ? `${lab.elementName(scope)} (${TYPE_NAME[scope.type].toLowerCase()})` : 'nothing selected'}</b>
            </span>
            {an?.hasSolution && (
              <span>
                <i className="scope-dash" />
                {an.ac ? 'steady state from the formulas' : 'formula-sheet prediction'}
              </span>
            )}
            <span className="spacer" />
            <Segmented value={view} onChange={setView} options={[
              { value: 'vi', label: 'V and I' }, { value: 'energy', label: 'Energy' }, { value: 'all', label: 'All' },
            ]} />
            <Segmented value={lab.window} onChange={(w) => { lab.setWindow(w); resetPlots(); }} options={[
              { value: 3, label: '3 s' }, { value: 6, label: '6 s' }, { value: 12, label: '12 s' },
            ]} />
          </div>
          <div className={`scope-row ${view === 'vi' ? 'n2' : view === 'energy' ? 'n1' : ''}`}>
            {view !== 'energy' && <div className="scope-cell"><LabCanvas lab={vPlot} /></div>}
            {view !== 'energy' && <div className="scope-cell"><LabCanvas lab={iPlot} /></div>}
            {view !== 'vi' && <div className="scope-cell"><LabCanvas lab={ePlot} /></div>}
          </div>
        </>
      }
      intro={
        <p>
          Build a circuit and watch it run. Yellow dots are moving charge, wire colour is voltage (red high, blue
          low). The dashed line on the scope is what the formula sheet predicts.
        </p>
      }
    >
      <Section title="Circuit">
        <label className="ctl select">
          <span className="ctl-label">Start from</span>
          <select
            value={lab.preset?.id ?? ''}
            onChange={(e) => {
              if (!e.target.value) return;
              lab.loadPreset(e.target.value);
              const g = PRESETS.find((p) => p.id === e.target.value)?.group;
              if (window.innerWidth < WIDE) setView(g === 'LC and RLC' ? 'energy' : 'vi');
              resetPlots();
              bumpAll();
            }}
          >
            {!lab.preset && <option value="">Your own circuit</option>}
            {(['Resistors', 'RC and RL', 'LC and RLC'] as const).map((g) => (
              <optgroup key={g} label={g}>
                {PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {lab.preset && <Note>{lab.preset.note}</Note>}
        <ButtonRow>
          <Button kind="primary" onClick={() => (lab.paused = !lab.paused)}>{lab.paused ? 'Run' : 'Pause'}</Button>
          <Button onClick={() => { lab.restart(); resetPlots(); }}>Restart</Button>
          <Button onClick={() => lab.stepOnce()} title="Advance a small step while paused">Step</Button>
        </ButtonRow>
        <Slider label="Speed" value={lab.speed} min={0.05} max={8} log format={(v) => `${fmt(v, 2)}×`} onChange={(v) => (lab.speed = v)} />
        <div className="toggles">
          <Toggle label="Moving charge" value={lab.showDots} onChange={(v) => (lab.showDots = v)} />
          <Toggle label="Values" value={lab.showValues} onChange={(v) => (lab.showValues = v)} />
        </div>
        <Readouts>
          <Readout label="Time" value={`${c.time.toFixed(2)} s`} />
          {req !== null && <Readout label="Equivalent resistance V/I" value={si(req, 'Ω', 4)} color="var(--c-I)" />}
        </Readouts>
      </Section>

      <Section title={sel ? `Selected: ${lab.elementName(sel)}` : 'Selected part'}>
        {sel ? <Editor lab={lab} e={sel} edit={edit} /> : <p className="muted">Click a part on the canvas to change its value.</p>}
      </Section>

      {damping && an?.rCrit && (
        <Section title="Damping">
          <Slider label="Resistance R" value={damping.value} min={an.rCrit * 0.02} max={an.rCrit * 4} log
            format={(v) => si(v, 'Ω')} color="var(--warn)" onChange={(v) => edit('damp', () => (damping.value = v))} />
          <div className="crit-scale">
            <i style={{ left: `${(Math.log(1 / 0.02) / Math.log(4 / 0.02)) * 100}%` }} />
            <span style={{ left: `${(Math.log(1 / 0.02) / Math.log(4 / 0.02)) * 100}%` }}>critical {si(an.rCrit, 'Ω')}</span>
          </div>
          <ButtonRow>
            <Button onClick={() => edit('', () => (damping.value = an.rCrit! * 0.15))}>Under</Button>
            <Button onClick={() => edit('', () => (damping.value = an.rCrit!))}>Critical</Button>
            <Button onClick={() => edit('', () => (damping.value = Math.sqrt((7 * an.L) / an.C) * 1.05))}>Over (√(7L/C))</Button>
          </ButtonRow>
        </Section>
      )}

      {acSrc && (
        <Section title="Drive frequency">
          <Slider label="Source frequency f" value={acSrc.freq} min={(an!.f0 ?? 1) * 0.2} max={(an!.f0 ?? 1) * 3} log unit="Hz"
            color="var(--c-I)" onChange={(v) => edit('freq', () => (acSrc.freq = v))} />
          {an?.f0 && (
            <ButtonRow>
              <Button onClick={() => edit('', () => (acSrc.freq = an.f0! * 0.5))}>½ f₀</Button>
              <Button onClick={() => edit('', () => (acSrc.freq = Number(an.f0!.toFixed(4))))}>f₀ (resonance)</Button>
              <Button onClick={() => edit('', () => (acSrc.freq = an.f0! * 2))}>2 f₀</Button>
            </ButtonRow>
          )}
          {an?.f0 && <div className="res-plot"><LabCanvas lab={rPlot} /></div>}
        </Section>
      )}

      <Section title="Live values">
        {scope && (
          <Readouts>
            <Readout label={`${lab.elementName(scope)} voltage`} value={si(scope.v, 'V')} color="var(--c-V)" />
            <Readout label={`${lab.elementName(scope)} current`} value={si(scope.i, 'A')} color="var(--c-I)" />
            {scope.type === 'capacitor' && <Readout label="Charge q = CV" value={si(scope.value * scope.v, 'C')} />}
            {scope.type === 'resistor' && <Readout label="Power i²R" value={si(scope.v * scope.i, 'W')} />}
          </Readouts>
        )}
        <Bar label="Capacitor" value={en.uc} max={eMax} color="var(--c-V)" text={si(en.uc, 'J')} />
        <Bar label="Inductor" value={en.ul} max={eMax} color="var(--c-B)" text={si(en.ul, 'J')} />
        <Bar label="Heat so far" value={en.heat} max={eMax} color="#ff8a3c" text={si(en.heat, 'J')} />
        <Bar label="Total" value={total} max={eMax} color="var(--text-2)" text={si(total, 'J')} />
        {hasSource && <Bar label="Source work" value={en.work} max={eMax} color="var(--good)" text={si(en.work, 'J')} />}
        {en.uc + en.ul > 1e-9 && (
          <Readouts>
            <Readout label="Fraction in inductor" value={`${((en.ul / (en.uc + en.ul)) * 100).toFixed(1)} %`} color="var(--c-B)" />
            <Readout label="Fraction in capacitor" value={`${((en.uc / (en.uc + en.ul)) * 100).toFixed(1)} %`} color="var(--c-V)" />
          </Readouts>
        )}
      </Section>

      <Section title="What the formula sheet says">
        <Sheet an={an} lab={lab} />
      </Section>

      <Section title="What to notice">
        <Notes an={an} />
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`v = iR`}>Ohm's law.</Formula>
        <Formula tex={String.raw`R_{eq} = \sum_i R_i \qquad \frac{1}{R_{eq}} = \sum_i \frac{1}{R_i}`}>Resistors in series, resistors in parallel.</Formula>
        <Formula tex={String.raw`C \equiv \frac{q}{V} \quad E_C = \frac{q^2}{2C} \quad E_L = \frac{L i^2}{2}`}>Energy stored in a capacitor and in an inductor.</Formula>
        <Formula tex={String.raw`q = q_0 e^{-t/RC} \qquad i = i_0 e^{-Rt/L}`}>RC and RL circuits decay exponentially.</Formula>
        <Formula tex={String.raw`q = q_0\cos\!\left(\frac{t}{\sqrt{LC}} + \phi\right)`}>LC circuits oscillate with ω = 1/√(LC).</Formula>
        <Formula tex={String.raw`q = q_0 e^{at}`}>Try this in the RLC loop equation and you get:</Formula>
        <Formula tex={String.raw`a = -\frac{R}{2L} \pm \frac12\sqrt{\left(\frac{R}{L}\right)^2 - \frac{4}{LC}}`}>
          RLC: if the square root is imaginary the charge oscillates while it decays.
        </Formula>
      </Section>
    </LabPage>
  );
}

function Editor({ lab, e, edit }: { lab: CircuitLab; e: CElement; edit: (tag: string, fn: () => void) => void }) {
  const tag = (f: string) => `${e.id}:${f}`;
  return (
    <>
      {e.type === 'resistor' && (
        <Slider label="Resistance R" value={e.value} min={0.1} max={10000} log format={(v) => si(v, 'Ω')} onChange={(v) => edit(tag('v'), () => (e.value = v))} />
      )}
      {e.type === 'capacitor' && (
        <>
          <Slider label="Capacitance C" value={e.value} min={1e-4} max={1} log format={(v) => si(v, 'F')} onChange={(v) => edit(tag('v'), () => (e.value = v))} />
          <Slider label="Starting voltage" value={e.ic} min={-20} max={20} step={0.5} unit="V" color="var(--c-V)" onChange={(v) => edit(tag('ic'), () => (e.ic = v))} />
          <Readouts>
            <Readout label="Starting charge q₀ = CV" value={si(e.value * e.ic, 'C')} />
          </Readouts>
        </>
      )}
      {e.type === 'inductor' && (
        <>
          <Slider label="Inductance L" value={e.value} min={0.01} max={20} log format={(v) => si(v, 'H')} onChange={(v) => edit(tag('v'), () => (e.value = v))} />
          <Slider label="Starting current" value={e.ic} min={-5} max={5} step={0.1} unit="A" color="var(--c-I)" onChange={(v) => edit(tag('ic'), () => (e.ic = v))} />
        </>
      )}
      {e.type === 'battery' && (
        <Slider label="Voltage" value={e.value} min={0} max={40} step={0.5} unit="V" onChange={(v) => edit(tag('v'), () => (e.value = v))} />
      )}
      {e.type === 'ac' && (
        <>
          <Slider label="Peak voltage" value={e.value} min={0} max={40} step={0.5} unit="V" onChange={(v) => edit(tag('v'), () => (e.value = v))} />
          <Slider label="Frequency" value={e.freq} min={0.05} max={20} log unit="Hz" onChange={(v) => edit(tag('f'), () => (e.freq = v))} />
        </>
      )}
      {e.type === 'switch' && (
        <ButtonRow>
          <Button kind="primary" onClick={() => lab.toggleSwitch(e)}>{e.closed ? 'Open the switch' : 'Close the switch'}</Button>
        </ButtonRow>
      )}
      {e.type === 'wire' && <p className="muted">A wire has no resistance. Its two ends are always at the same voltage.</p>}
      <ButtonRow>
        {(e.type === 'battery' || e.type === 'capacitor' || e.type === 'inductor' || e.type === 'ac') && (
          <Button onClick={() => lab.flip(e)} title="Swap the two ends">Flip direction</Button>
        )}
        <Button kind="danger" onClick={() => lab.deleteElement(e)}>Delete</Button>
      </ButtonRow>
    </>
  );
}

/** The "what the formula sheet says" box for the circuit as it is now. */
function Sheet({ an, lab }: { an: SeriesInfo | null; lab: CircuitLab }) {
  if (!an) {
    const open = lab.circuit.elements.some((e) => e.type === 'switch' && !e.closed);
    return (
      <p className="muted">
        {open
          ? 'The switch is open, so no current flows yet. Close it and the formulas for the loop appear here.'
          : 'The formula sheet covers a single loop: one path through R, L and C in series. This circuit has branches, so read the values from the scope instead.'}
      </p>
    );
  }
  const { R, L, C } = an;
  if (an.ac) {
    return (
      <div className="sheet-box">
        <div className="sheet-kind">Driven series circuit</div>
        {an.f0 && <Tex block>{String.raw`f_0 = \frac{1}{2\pi\sqrt{LC}} = ${tex(an.f0)}\ \text{Hz}`}</Tex>}
        <Tex block>{String.raw`I_{peak} = \frac{V_0}{\sqrt{R^2 + \left(\omega L - \frac{1}{\omega C}\right)^2}} = ${tex(an.iAmp ?? 0)}\ \text{A}`}</Tex>
        <p>
          At f = {fmt(an.ac.freq, 3)} Hz the loop current peaks at {si(an.iAmp ?? 0, 'A')}, so the resistor voltage peaks at{' '}
          {si((an.iAmp ?? 0) * R, 'V')}. At f₀ the inductor and capacitor cancel and all {si(an.ac.amp, 'V')} appears across R.
        </p>
      </div>
    );
  }
  switch (an.kind) {
    case 'R':
      return (
        <div className="sheet-box">
          <div className="sheet-kind">Resistors in one loop</div>
          <Tex block>{String.raw`R_{eq} = \sum R_i = ${tex(R)}\ \Omega`}</Tex>
          <Tex block>{String.raw`i = \frac{V}{R_{eq}} =${tex(R > 0 ? an.E / R : 0)}\ \text{A}`}</Tex>
        </div>
      );
    case 'RC':
      return (
        <div className="sheet-box">
          <div className="sheet-kind">RC circuit</div>
          <Tex block>{String.raw`RC = ${tex(an.tau!)}\ \text{s},\quad q = q_0 e^{-t/RC}`}</Tex>
          <Tex block>{String.raw`\text{drop by 10:}\quad t = -RC\ln(0.1) = ${tex(an.tau! * Math.LN10)}\ \text{s}`}</Tex>
          <p>Every {fmt(an.tau!, 3)} s the remaining change shrinks to 37%. Energy goes as q², so it shrinks twice as fast: after 3RC only e⁻⁶ is left.</p>
        </div>
      );
    case 'RL':
      return (
        <div className="sheet-box">
          <div className="sheet-kind">RL circuit</div>
          <Tex block>{String.raw`\frac{L}{R} = ${tex(an.tau!)}\ \text{s},\quad i = i_0 e^{-Rt/L}`}</Tex>
          <Tex block>{String.raw`\text{drop by 10:}\quad t = -\frac{L}{R}\ln(0.1) = ${tex(an.tau! * Math.LN10)}\ \text{s}`}</Tex>
          {an.E !== 0 && <p>With the battery in the loop the current heads for V/R = {si(an.E / R, 'A')} instead of zero, with the same time constant.</p>}
        </div>
      );
    case 'LC':
    case 'RLC': {
      const r = an.roots!;
      const regime = an.regime!;
      const label = { undamped: 'no damping', underdamped: 'underdamped', critical: 'critically damped', overdamped: 'overdamped' }[regime];
      const cls = { undamped: 'undamped', underdamped: 'under', critical: 'critical', overdamped: 'over' }[regime];
      return (
        <div className="sheet-box">
          <div className="sheet-kind">
            {an.kind === 'LC' ? 'LC circuit' : 'Series RLC circuit'} <span className={`badge ${cls}`}>{label}</span>
          </div>
          <Tex block>{String.raw`\omega = \frac{1}{\sqrt{LC}} = ${tex(an.omega0!)}\ \text{rad/s}`}</Tex>
          <Tex block>{String.raw`T = 2\pi\sqrt{LC} =${tex((2 * Math.PI) / an.omega0!)}\ \text{s}`}</Tex>
          {an.kind === 'RLC' && (
            <>
              <Tex block>{String.raw`a = -\frac{R}{2L} \pm \frac12\sqrt{\left(\frac{R}{L}\right)^2 - \frac{4}{LC}}`}</Tex>
              <Tex block>
                {r.im > 0
                  ? String.raw`a = ${tex(r.re1)} \pm ${tex(r.im)}\,i\ \ \text{s}^{-1}`
                  : String.raw`a = ${tex(r.re1)},\ \ ${tex(r.re2)}\ \ \text{s}^{-1}`}
              </Tex>
              <Tex block>{String.raw`R_{crit} = \sqrt{\frac{4L}{C}} = ${tex(an.rCrit!)}\ \Omega,\quad R = ${tex(R)}\ \Omega`}</Tex>
              <p>
                {regime === 'underdamped' && 'R is below the critical value, so the square root is imaginary: the charge oscillates inside a decaying envelope.'}
                {regime === 'critical' && 'R equals the critical value, so the square root is zero: the charge drops without oscillating, as fast as possible.'}
                {regime === 'overdamped' && 'R is above the critical value, so both roots are real and negative: the charge drops exponentially without oscillating.'}
              </p>
            </>
          )}
          {an.kind === 'LC' && (
            <>
              <Tex block>{String.raw`q = q_0\cos\!\left(\frac{t}{\sqrt{LC}} + \phi\right)`}</Tex>
              <p>
                No resistor means no heat, so the total energy q²/2C + Li²/2 stays constant while it moves back and
                forth. L = {si(L, 'H')}, C = {si(C, 'F')}.
              </p>
            </>
          )}
        </div>
      );
    }
    default:
      return <p className="muted">Add a resistor, capacitor or inductor to the loop to see its formulas.</p>;
  }
}

function Notes({ an }: { an: SeriesInfo | null }) {
  const kind = an?.ac ? 'AC' : an?.kind;
  return (
    <>
      {(kind === 'LC' || kind === 'RLC') && (
        <>
          <Note title="Energy fractions (Problems 45, 53, 54)">
            Inductor energy goes as i², capacitor energy as q². When the current is half its maximum the inductor holds
            (½)² = ¼ of the total. When the charge is 1/7 of its maximum the capacitor holds 1/49, leaving 48/49 in the
            inductor. Pause the LC preset and check the fractions above.
          </Note>
          <Note title="Damping regimes (Problems 56, 57, 61, 62)" kind="good">
            Compare R with √(4L/C). R = √(4L/C) is critical and R &gt; √(7L/C) is well past it, so in both cases the
            charge drops exponentially without oscillating. Drag the damping slider across the mark and watch the
            oscillation disappear.
          </Note>
        </>
      )}
      {kind === 'RC' && (
        <>
          <Note title="It never quite finishes (Problems 46, 48)">
            The charge is largest at t = 0 and falls as e^(−t/RC). An exponential never reaches zero, so a full
            discharge takes an infinite time.
          </Note>
          <Note title="Energy after 3RC (Problem 47)" kind="good">
            Energy is q²/2C, so it falls as e^(−2t/RC). At t = 3RC the fraction left is e⁻⁶ ≈ 0.25%. Pause near t = 3RC
            and read the capacitor bar.
          </Note>
          <Note title="Drop by a factor of 10 (Problems 43, 59)">Set e^(−t/RC) = 0.1 and solve: t = −RC ln(0.1) = RC ln 10 ≈ 2.3 RC.</Note>
        </>
      )}
      {kind === 'RL' && (
        <>
          <Note title="Voltages add up (Problem 41)">
            Going round the loop, the resistor voltage iR and the inductor voltage L di/dt always sum to the battery
            voltage. Select R and then L and compare their voltages on the scope at any instant.
          </Note>
          <Note title="Current and energy never hit zero (Problems 44, 49, 50, 60)" kind="good">
            i = i₀e^(−Rt/L) falls by 10 after t = −(L/R) ln(0.1), but reaching exactly zero takes an infinite time. The
            inductor energy Li²/2 follows the current, so the same is true for it.
          </Note>
        </>
      )}
      {kind === 'AC' && (
        <Note title="Resonance (Problem 58)">
          The inductor and capacitor voltages are opposite in sign. At f = 1/(2π√(LC)) they cancel exactly, the loop
          looks like the resistor alone, and the resistor voltage reaches the full source voltage. Move the frequency
          away from f₀ on either side and the current drops.
        </Note>
      )}
      {(kind === 'R' || !an) && (
        <Note title="Series and parallel (Problem 42)">
          In series the same current passes through every resistor and the resistances add. In parallel each resistor
          gets the full voltage and the currents add, so 1/R adds. Three equal resistors R in series give 3R; the same
          three in parallel give R/3.
        </Note>
      )}
      <Note title="Reading the picture">
        Dots move in the direction positive charge flows and slow down as the current dies. Plus and minus signs on a
        capacitor show its charge, the teal glow on an inductor is stored magnetic energy, and the orange glow on a
        resistor is heat.
      </Note>
    </>
  );
}

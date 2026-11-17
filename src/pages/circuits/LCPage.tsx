import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from '../../app/router';
import { AnswerVerdict, checkAnswer } from '../../mathlab/answers';
import { evaluate, tryParse } from '../../mathlab';
import {
  Known, Value, decimalTex, firstPhaseFor, knownTex, lcPeakCurrent, parseValue, workLC,
} from '../../physics/lc';
import {
  Button, ButtonRow, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Tex, Toggle, useLabUI,
} from '../../ui/controls';
import { LabCanvas } from '../../ui/LabCanvas';
import { LabPage } from '../../ui/LabPage';
import { MathField } from '../solver/MathField';
import { RichText } from '../solver/RichText';
import '../solver/solver.css';
import { si } from './circuitLab';
import { DrillQ, makeDrill } from './lcDrill';
import { LCLab } from './lcLab';
import './lc.css';

const r = String.raw;
const TAU = Math.PI * 2;

const KNOWN_OPTIONS: { value: Known; label: React.ReactNode; title: string }[] = [
  { value: 'q', label: <Tex>{r`q/q_0`}</Tex>, title: 'Fraction of the maximum charge' },
  { value: 'i', label: <Tex>{r`i/i_{max}`}</Tex>, title: 'Fraction of the maximum current' },
  { value: 'EC', label: <Tex>{r`E_C/E`}</Tex>, title: 'Fraction of the total energy in the capacitor' },
  { value: 'EL', label: <Tex>{r`E_L/E`}</Tex>, title: 'Fraction of the total energy in the inductor' },
];
const QUICK = ['1/2', '1/3', '1/4', '1/7', '2/3', '3/5'];

/** Problems from the additional set that this page sets up: what is given, and its value. */
const PROBLEM_PRESETS: Record<string, { kind: Known; text: string }> = {
  p45: { kind: 'i', text: '1/2' },
  p53: { kind: 'q', text: '1/7' },
  p54: { kind: 'i', text: '1/3' },
};

interface Given {
  kind: Known;
  text: string;
}

function ResultCell({ label, v, color }: { label: string; v: Value; color: string }) {
  const whole = v.frac && v.frac.d === 1;
  return (
    <div className="lc-result">
      <Tex>{label}</Tex>
      <span className="lc-result-value" style={{ color }}>
        <Tex>{v.tex}</Tex>
      </span>
      <span className="lc-result-approx">{v.exact && !whole ? `≈ ${decimalTex(v.value)}` : ' '}</span>
    </div>
  );
}

/** "Know one fraction, find the other three", with the steps written out. */
function KnownSolver({ lab, given, setGiven }: { lab: LCLab; given: Given; setGiven: (g: Given) => void }) {
  const value = parseValue(given.text);
  const work = value ? workLC(given.kind, value) : null;
  const theta = work ? firstPhaseFor(work.q.value) : 0;
  return (
    <>
      <Segmented label="I am told" value={given.kind} options={KNOWN_OPTIONS} onChange={(kind) => setGiven({ ...given, kind })} />
      <label className="ctl lc-given">
        <span className="ctl-label">and it equals (a fraction or a decimal)</span>
        <input
          value={given.text}
          spellCheck={false}
          inputMode="decimal"
          aria-label="Value of the known fraction"
          onChange={(e) => setGiven({ ...given, text: e.target.value })}
        />
      </label>
      <div className="chips lc-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" className={`chip ${given.text.trim() === q ? 'on' : ''}`} onClick={() => setGiven({ ...given, text: q })}>
            {q}
          </button>
        ))}
      </div>

      {!work ? (
        <Note kind="warn">
          Type a number between 0 and 1, such as <b>1/3</b> or <b>0.25</b>. A fraction of a maximum cannot be bigger than 1.
        </Note>
      ) : (
        <>
          <div className="lc-results">
            <ResultCell label={r`q/q_0`} v={work.q} color="var(--c-E)" />
            <ResultCell label={r`i/i_{max}`} v={work.i} color="var(--c-B)" />
            <ResultCell label={r`E_C/E_{total}`} v={work.EC} color="var(--c-E)" />
            <ResultCell label={r`E_L/E_{total}`} v={work.EL} color="var(--c-B)" />
          </div>
          <ol className="lc-steps">
            {work.steps.map((s, k) => (
              <li key={k}>
                <span>{s.say}</span>
                <Tex block>{s.tex}</Tex>
              </li>
            ))}
          </ol>
          <ButtonRow>
            <Button kind="primary" onClick={() => lab.showCharge(work.q.value)}>Show it on the circle</Button>
          </ButtonRow>
          <Readouts>
            <Readout label="Charge in this circuit" value={`±${si(work.q.value * lab.q0, 'C')}`} color="var(--c-E)" />
            <Readout label="Current in this circuit" value={`±${si(work.i.value * lcPeakCurrent(lab.q0, lab.L, lab.C), 'A')}`} color="var(--c-B)" />
            <Readout label="First happens at" value={`${si(theta / lab.omega, 's')} (${decimalTex(theta / TAU)} T)`} />
          </Readouts>
          <Note>
            Energy only fixes the <b>sizes</b>. Each pair of sizes happens four times per cycle, once with each combination
            of signs: those are the four pink rings on the circle.
          </Note>
        </>
      )}
    </>
  );
}

/** Numeric value of a typed answer that contains no symbols, or null. */
function numberOf(latex: string): number | null {
  const p = tryParse(latex);
  if (!p.node) return null;
  try {
    const v = evaluate(p.node.t === 'eq' ? p.node.r : p.node, {}, { constants: false });
    return isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

type DrillVerdict = AnswerVerdict | { ok: true; rounded: true };

function Drill({ lab }: { lab: LCLab }) {
  const [q, setQ] = useState<DrillQ>(() => makeDrill());
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  const [verdict, setVerdict] = useState<DrillVerdict | null>(null);
  const [steps, setSteps] = useState(false);
  const [score, setScore] = useState({ right: 0, tried: 0 });
  /** A question counts once, and not at all after the steps were opened. */
  const counted = useRef(false);

  const check = (typed?: string) => {
    if (typed !== undefined) {
      inputRef.current = typed;
      setInput(typed);
    }
    let v: DrillVerdict = checkAnswer(inputRef.current, { expr: q.expr, allowSign: !q.numeric });
    if (!v.ok && q.numeric && v.kind !== 'empty' && v.kind !== 'syntax') {
      const typedValue = numberOf(inputRef.current), exact = numberOf(q.expr);
      if (typedValue !== null && exact !== null && Math.abs(typedValue - exact) <= 0.006 * Math.max(Math.abs(exact), 0.05)) {
        v = { ok: true, rounded: true };
      } else {
        // "your answer is 0.745 times the expected one" says nothing useful about a plain number
        v = {
          ok: false,
          kind: 'different',
          message: 'Not that. Square the fraction you were given to get an energy share, subtract from 1 for the other share, and take a square root only if the question asks for a charge or a current.',
        };
      }
    }
    setVerdict(v);
    if (!counted.current && (v.ok || (v.kind !== 'empty' && v.kind !== 'syntax'))) {
      counted.current = true;
      setScore((s) => ({ right: s.right + (v.ok && !steps ? 1 : 0), tried: s.tried + 1 }));
    }
  };

  const next = () => {
    setQ(makeDrill(q));
    setInput('');
    inputRef.current = '';
    setVerdict(null);
    setSteps(false);
    counted.current = false;
  };

  return (
    <div className="lc-drill">
      <p className="lc-question">
        <RichText text={q.text} />
      </p>
      <div className="lc-answer">
        <MathField
          key={q.id + q.m + q.n}
          value={input}
          onChange={(tex) => {
            if (tex === inputRef.current) return;
            inputRef.current = tex;
            setInput(tex);
            setVerdict(null);
          }}
          onEnter={(tex) => check(tex)}
          label="Your answer"
          placeholder={r`\text{Type your answer}`}
        />
        <button type="button" className="btn primary" onClick={() => check()}>Check</button>
      </div>
      {verdict && (
        <p className={`lc-verdict ${verdict.ok ? 'good' : 'bad'}`} role="status">
          {verdict.ok ? (
            'rounded' in verdict ? (
              <>Correct to rounding. Exact: <Tex>{q.expr}</Tex></>
            ) : (
              'Correct.'
            )
          ) : (
            <RichText text={verdict.message} />
          )}
        </p>
      )}
      {steps && (
        <ol className="lc-steps">
          {q.solution.map((s, k) => (
            <li key={k}>
              <RichText text={s} />
            </li>
          ))}
        </ol>
      )}
      <ButtonRow>
        <Button kind={verdict?.ok ? 'primary' : undefined} onClick={next}>Next question</Button>
        {!steps && <Button onClick={() => setSteps(true)}>Show the steps</Button>}
        {q.showQ !== undefined && <Button onClick={() => lab.showCharge(q.showQ!)}>Show on the circle</Button>}
      </ButtonRow>
      {score.tried > 0 && (
        <p className="muted lc-score">
          {score.right} of {score.tried} right without opening the steps.
        </p>
      )}
    </div>
  );
}

const MOMENTS: { label: string; theta: number }[] = [
  { label: 't = 0', theta: 0 },
  { label: 'T/8', theta: TAU / 8 },
  { label: 'T/4', theta: TAU / 4 },
  { label: 'T/2', theta: TAU / 2 },
  { label: '3T/4', theta: (3 * TAU) / 4 },
];

export default function LCPage() {
  useLabUI();
  const lab = useMemo(() => new LCLab(), []);
  const route = useRoute();
  const [given, setGiven] = useState<Given>({ kind: 'i', text: '1/3' });

  useEffect(() => {
    const preset = PROBLEM_PRESETS[route.query.preset ?? ''];
    if (!preset) return;
    setGiven(preset);
    const w = workLC(preset.kind, parseValue(preset.text)!);
    if (w) lab.showCharge(w.q.value);
  }, [lab, route.query.preset]);

  const s = lab.state;
  const iMax = lcPeakCurrent(lab.q0, lab.L, lab.C);
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

  return (
    <LabPage
      lab={lab}
      hint="Drag the white dot around the circle · scroll to zoom"
      toolbar={
        <>
          <Button kind="ghost" onClick={() => (lab.paused = !lab.paused)}>{lab.paused ? '▶ Play' : '❚❚ Pause'}</Button>
          <Button kind="ghost" onClick={() => lab.restart()}>Restart with a full capacitor</Button>
        </>
      }
      below={
        <div className="plot-row">
          <div className="plot-cell">
            <LabCanvas lab={lab.qPlot} />
          </div>
          <div className="plot-cell">
            <LabCanvas lab={lab.ePlot} />
          </div>
        </div>
      }
      intro={
        <p>
          Nearly every LC question about “how much charge” or “how much current” is one idea: the capacitor and the
          inductor <b>share a fixed amount of energy</b>. Find one share and you have the other.
        </p>
      }
    >
      <Section title="The one rule">
        <Formula tex={r`\underbrace{\frac{q^2}{2C}}_{E_C} + \underbrace{\frac{L i^2}{2}}_{E_L} = E_{total} = \frac{q_0^2}{2C} = \frac{L\,i_{max}^2}{2}`}>
          The two energies add up to a constant. It is not zero: it is whatever the capacitor held when it was full.
        </Formula>
        <Formula tex={r`\left(\frac{q}{q_0}\right)^2 + \left(\frac{i}{i_{max}}\right)^2 = 1`}>
          The same rule divided by the total. The first term is the capacitor’s share, the second is the inductor’s.
        </Formula>
        <Note kind="warn" title="Two rules that are easy to mix up">
          <p>
            <b>Energies add to a constant.</b> Use this to get a charge from a current, or a current from a charge.
          </p>
          <p>
            <b>Voltages around the loop add to zero:</b> <Tex>{r`\frac{q}{C} + L\frac{di}{dt} = 0`}</Tex>. That is the one
            with a zero in it. It gives <Tex>{r`q = q_0\cos(t/\sqrt{LC})`}</Tex>, and you only need it when the question asks
            about time.
          </p>
        </Note>
        <Note title="The method">
          <p><b>1.</b> Square the fraction you are given. That is that element’s share of the energy.</p>
          <p><b>2.</b> Subtract from 1. That is the other element’s share.</p>
          <p><b>3.</b> If they ask for a charge or a current, take the square root. If they ask for an energy, stop at step 2.</p>
        </Note>
      </Section>

      <Section title="Know one, find the rest">
        <KnownSolver lab={lab} given={given} setGiven={setGiven} />
      </Section>

      <Section title="Right now">
        <Readouts>
          <Readout label="Charge q" value={`${si(s.q, 'C')}  (${s.qFrac.toFixed(3).replace('-', '−')} q₀)`} color="var(--c-E)" />
          <Readout label="Current i" value={`${si(s.i, 'A')}  (${s.iFrac.toFixed(3).replace('-', '−')} i_max)`} color="var(--c-B)" />
          <Readout label="In the capacitor" value={`${si(s.EC, 'J')}  (${pct(s.EC / s.E)})`} color="var(--c-E)" />
          <Readout label="In the inductor" value={`${si(s.EL, 'J')}  (${pct(s.EL / s.E)})`} color="var(--c-B)" />
          <Readout label="Total" value={si(s.EC + s.EL, 'J')} />
        </Readouts>
        <Note>
          The triangle on the circle has legs <Tex>{r`q/q_0`}</Tex> and <Tex>{r`i/i_{max}`}</Tex> and a hypotenuse of 1.
          Pythagoras on that triangle <i>is</i> energy conservation.
        </Note>
      </Section>

      <Section title="Test yourself">
        <Drill lab={lab} />
      </Section>

      <Section title="Questions about time">
        <ButtonRow>
          {MOMENTS.map((m) => (
            <Button key={m.label} onClick={() => lab.goTo(m.theta)}>{m.label}</Button>
          ))}
        </ButtonRow>
        <Formula tex={r`\begin{aligned} q &= q_0\cos\!\left(\frac{t}{\sqrt{LC}}\right) \\[4pt] i = \frac{dq}{dt} &= -\frac{q_0}{\sqrt{LC}}\sin\!\left(\frac{t}{\sqrt{LC}}\right) \end{aligned}`}>
          Starting from a full capacitor. The dot goes once round the circle in one period{' '}
          <Tex>{r`T = 2\pi\sqrt{LC}`}</Tex>.
        </Formula>
        <Note>
          Every quarter period the energy has moved completely from one element to the other. At <b>T/8</b> it is split
          half and half, and both fractions are <Tex>{r`1/\sqrt2 \approx 0.707`}</Tex>, not 0.5.
        </Note>
      </Section>

      <Section title="Circuit">
        <Slider label="Inductance L" value={lab.L * 1e3} min={2} max={50} step={1} unit="mH" onChange={(v) => (lab.L = v * 1e-3)} color="var(--c-B)" />
        <Slider label="Capacitance C" value={lab.C * 1e6} min={20} max={500} step={10} unit="µF" onChange={(v) => (lab.C = v * 1e-6)} color="var(--c-E)" />
        <Slider label="Maximum charge q₀" value={lab.q0 * 1e6} min={20} max={500} step={10} unit="µC" onChange={(v) => (lab.q0 = v * 1e-6)} color="var(--c-E)" />
        <Slider label="Playback speed" value={lab.speed} min={0.1} max={8} log unit="×" onChange={(v) => (lab.speed = v)} />
        <Readouts>
          <Readout label="" tex={r`i_{max} = q_0/\sqrt{LC}`} value={si(iMax, 'A')} color="var(--c-B)" />
          <Readout label="" tex={r`E_{total} = q_0^2/2C`} value={si(s.E, 'J')} />
          <Readout label="" tex={r`\omega = 1/\sqrt{LC}`} value={si(lab.omega, 'rad/s')} />
          <Readout label="" tex={r`T = 2\pi\sqrt{LC}`} value={si(lab.period, 's')} />
        </Readouts>
        <Toggle label="Show the mass-on-a-spring twin" value={lab.showSpring} onChange={(v) => (lab.showSpring = v)} />
        <p className="muted lc-small">Slow motion: one second on screen is one millisecond in the circuit.</p>
      </Section>

      <Section title="What to notice">
        <Note>
          <p>
            When the capacitor is <b>full</b> the current is <b>zero</b>, and when the capacitor is <b>empty</b> the
            current is at its <b>largest</b>. They are never both big at once.
          </p>
          <p>
            The fractions do not add to 1. Their <b>squares</b> do. A current at half its maximum leaves the charge at
            87% of its maximum, not 50%.
          </p>
        </Note>
        <Note kind="good" title="Try this">
          Change L or C. The speed of the swing and the peak current change, but for a given charge fraction the current
          fraction is always the same. That is why these questions never need the values of L and C.
        </Note>
      </Section>
    </LabPage>
  );
}

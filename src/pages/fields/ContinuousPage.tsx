import { useEffect, useMemo } from 'react';
import { useRoute } from '../../app/router';
import { Plot } from '../../engine/plot';
import { Formula, Note, Readout, Readouts, Section, Select, Slider, Toggle, useLabUI } from '../../ui/controls';
import { LabCanvas } from '../../ui/LabCanvas';
import { LabPage } from '../../ui/LabPage';
import { ContinuousLab, SHAPES, Shape } from './continuousLab';

const FORMULAS: Record<Shape, { tex: string; text: string; notice: React.ReactNode }> = {
  line: {
    tex: String.raw`E = \frac{\lambda}{2\pi\epsilon_0 r}\quad\text{(very long line)}`,
    text: 'Field of a long line of charge at distance r. It falls off as 1/r, slower than a point charge.',
    notice: (
      <>
        Each piece <b>dq = λ dℓ</b> acts like a point charge. Pieces on the left and right push sideways in opposite
        directions and cancel, so near the middle only the part pointing away from the line survives. Make the line
        longer and the sum approaches the long-line formula.
      </>
    ),
  },
  ring: {
    tex: String.raw`E_x = \frac{1}{4\pi\epsilon_0}\frac{Q\,x}{(x^2+a^2)^{3/2}}`,
    text: 'On the axis of a ring of radius a. Zero at the centre, largest near x = a/√2.',
    notice: (
      <>
        The ring is seen edge-on, so it looks like a vertical line. Every piece pulls partly sideways, and the piece
        on the opposite side cancels that part. Only the components along the axis add up. At the centre everything
        cancels and E = 0.
      </>
    ),
  },
  plane: {
    tex: String.raw`E = \frac{\sigma}{2\epsilon_0}`,
    text: 'An infinite plane gives the same field at every distance.',
    notice: (
      <>
        Move P closer and further: the yellow curve stays flat as long as the plane is much bigger than your
        distance from it. Far pieces contribute less each, but there are more of them. Shrink the included part of
        the plane and the field starts to fall off.
      </>
    ),
  },
  plates: {
    tex: String.raw`E = \frac{\sigma}{\epsilon_0}\ \text{between},\qquad E = 0\ \text{outside}`,
    text: 'Two opposite planes: their fields add between the plates and cancel outside.',
    notice: (
      <>
        Each plate alone gives σ/2ε₀ pointing away from the positive plate and toward the negative one. Between them
        the two fields point the same way and add. Outside they point opposite ways and cancel. Drag P across a
        plate to see the jump.
      </>
    ),
  },
  cylshell: {
    tex: String.raw`E = 0\ \ (r<a),\qquad E = \frac{\sigma a}{\epsilon_0 r}\ \ (r>a)`,
    text: 'Problem 2. Seen end-on, the shell is a circle of long charged rods.',
    notice: (
      <>
        Drag P inside the circle and turn on “tip to tail”: the arrows from all the rods close up into a loop, so
        the total is zero. A few nearby rods push hard, many far rods push gently the other way, and they balance
        exactly. Outside, it behaves like a single line of charge on the axis.
      </>
    ),
  },
  shell: {
    tex: String.raw`E = 0\ \ (r<a),\qquad E = \frac{Q}{4\pi\epsilon_0 r^2}\ \ (r>a)`,
    text: 'Problems 8 and 11. With surface density σ the total charge is Q = 4πa²σ.',
    notice: (
      <>
        Inside the shell the field is zero everywhere, not just at the centre. Outside, the shell acts exactly like
        a point charge Q sitting at its centre. For Problem 8 put Q = 4πa²(3σ) to get E = 3σa²/(ε₀r²).
      </>
    ),
  },
  solid: {
    tex: String.raw`E = \frac{Q_0\,r}{4\pi\epsilon_0 d^3}\ \ (r<d),\qquad E = \frac{Q_0}{4\pi\epsilon_0 r^2}\ \ (r>d)`,
    text: 'Problem 4. Inside, only the charge closer to the centre than you counts.',
    notice: (
      <>
        Inside the sphere the field grows in a straight line with r, because the enclosed charge grows as r³ while
        the area of your Gaussian sphere grows as r². At the surface it peaks, then falls off as 1/r² like a point
        charge.
      </>
    ),
  },
};

export default function ContinuousPage() {
  useLabUI();
  const lab = useMemo(() => new ContinuousLab(), []);
  const plot = useMemo(() => new Plot(lab.plotData), [lab]);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const info = lab.info;
  const f = FORMULAS[lab.shape];
  const num = lab.numeric(lab.p.x, lab.p.y);
  const ideal = lab.ideal(lab.p.x, lab.p.y);
  const nm = Math.hypot(num[0], num[1]);
  const im = Math.hypot(ideal[0], ideal[1]);
  const diff = im > 1e-9 ? (Math.abs(nm - im) / im) * 100 : nm > 1e-3 ? Infinity : 0;

  return (
    <LabPage
      lab={lab}
      hint="Drag the green point P · scroll to zoom"
      below={
        <div className="plot-cell" style={{ height: 190 }}>
          <LabCanvas lab={plot} />
        </div>
      }
      intro={
        <p>
          A continuous charge is just a lot of small pieces <b>dq</b>. Each piece makes the field of a point charge,
          and you add them all up. The white arrow is the textbook formula, the yellow arrow is the sum of the
          pieces.
        </p>
      }
    >
      <Section title="Charge distribution">
        <Select
          value={lab.shape}
          options={(Object.keys(SHAPES) as Shape[]).map((k) => ({ value: k, label: SHAPES[k].label }))}
          onChange={(v) => lab.setShape(v)}
        />
        <Slider label={info.amount.label} value={lab.amount} min={info.amount.min} max={info.amount.max} step={0.1} unit={info.amount.unit}
          onChange={(v) => (lab.amount = v === 0 ? 0.1 : v)} />
        <Slider label={info.size.label} value={lab.size} min={info.size.min} max={info.size.max} step={0.1} unit="m" onChange={(v) => (lab.size = v)} />
        <Slider label="Number of pieces N" value={lab.n} min={2} max={info.nMax} step={1} onChange={(v) => (lab.n = Math.round(v))} />
        <div className="toggles">
          <Toggle label="Each piece's dE" value={lab.showPieces} onChange={(v) => (lab.showPieces = v)} />
          <Toggle label="Tip to tail" value={lab.chain} onChange={(v) => (lab.chain = v)} />
        </div>
        {lab.n > 90 && lab.showPieces && <p className="muted">Individual arrows are hidden above 90 pieces.</p>}
      </Section>

      <Section title="Field at P">
        <Readouts>
          <Readout label={`Sum of ${Math.round(lab.n)} pieces`} value={nm} unit="N/C" color="var(--c-E)" />
          <Readout label="Formula" value={im} unit="N/C" />
          <Readout label="Difference" value={isFinite(diff) ? `${diff.toFixed(diff < 10 ? 1 : 0)} %` : 'formula gives 0'} color={diff < 2 ? 'var(--good)' : 'var(--warn)'} />
        </Readouts>
        <Note kind="good" title="Try this">
          Start with N = 2 and raise it. The sum snaps onto the formula once the pieces are small compared with your
          distance from them. That is all an integral is.
        </Note>
      </Section>

      <Section title="What to notice">
        <Note>{f.notice}</Note>
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\vec E = \frac{1}{4\pi\epsilon_0}\int \frac{dq}{r^2}\,\hat r`}>Add the point-charge field of every piece dq.</Formula>
        <Formula tex={String.raw`q = \lambda \ell = \sigma A = \rho V`}>How much charge is in a piece of a line, a surface or a volume.</Formula>
        <Formula tex={f.tex}>{f.text}</Formula>
      </Section>
    </LabPage>
  );
}

import { useEffect, useMemo } from 'react';
import { useRoute } from '../../app/router';
import { fmt } from '../../engine/math';
import { AXES, Axis, Sign, axisOf } from '../../physics/waves';
import {
  Button, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Tex, Toggle, useLabUI,
} from '../../ui/controls';
import { LabPage } from '../../ui/LabPage';
import { C_LIGHT, EMWaveLab } from './emWaveLab';
import './waves.css';

const HAT: Record<Axis, string> = { x: String.raw`\hat{\imath}`, y: String.raw`\hat{\jmath}`, z: String.raw`\hat{k}` };
const dirName = (axis: Axis, sign: number) => `${sign >= 0 ? '+' : '−'}${axis}`;
const hatTex = (axis: Axis, sign: number) => `${sign >= 0 ? '' : '-'}${HAT[axis]}`;
const n3 = (x: number) => fmt(x, 3).replace('−', '-');

const DIRS: { value: string; axis: Axis; sign: Sign }[] = AXES.flatMap((axis) => [
  { value: `+${axis}`, axis, sign: 1 as Sign },
  { value: `-${axis}`, axis, sign: -1 as Sign },
]);

export default function EMWavePage() {
  useLabUI();
  const lab = useMemo(() => new EMWaveLab(), []);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const s = lab.state();
  const eDir = axisOf(s.e), bDir = axisOf(s.b);
  const arg = (a: string, b: string) => `${a}\\,${s.axisName} ${s.travel === 1 ? '-' : '+'} ${b}\\,t`;

  return (
    <LabPage
      lab={lab}
      hint="Drag to orbit · scroll to zoom · shift-drag to pan"
      toolbar={
        <>
          <Button kind="ghost" onClick={() => (lab.paused = !lab.paused)}>{lab.paused ? '▶ Play' : '❚❚ Pause'}</Button>
        </>
      }
      intro={
        <p>
          In an electromagnetic wave the electric field, the magnetic field and the direction of travel are all at
          right angles. <b>E × B</b> always points the way the wave is going.
        </p>
      }
    >
      <Section>
        <Segmented
          value={lab.mode}
          options={[
            { value: 'build', label: 'Build a wave' },
            { value: 'given', label: 'Read a given field', title: 'Problem 65 style' },
          ]}
          onChange={(m) => (lab.mode = m)}
        />
      </Section>

      {lab.mode === 'build' ? (
        <>
          <Section title="Directions">
            <Segmented
              label="The wave travels toward"
              wrap
              value={`${lab.kSign === 1 ? '+' : '-'}${lab.kAxis}`}
              options={DIRS.map((d) => ({ value: d.value, label: dirName(d.axis, d.sign) }))}
              onChange={(v) => {
                const d = DIRS.find((k) => k.value === v)!;
                lab.setTravel(d.axis, d.sign);
              }}
            />
            <Segmented
              label="E points along"
              value={`${lab.eSign === 1 ? '+' : '-'}${lab.eAxis}`}
              options={DIRS.filter((d) => d.axis !== lab.kAxis).map((d) => ({ value: d.value, label: dirName(d.axis, d.sign) }))}
              onChange={(v) => {
                const d = DIRS.find((k) => k.value === v)!;
                lab.eAxis = d.axis;
                lab.eSign = d.sign;
              }}
            />
            <Readouts>
              <Readout label="So B must point along" value={dirName(bDir.axis, bDir.sign)} color="var(--c-B)" />
            </Readouts>
            <Note title="Right-hand rule">
              Point your fingers along <b>E</b> and curl them toward <b>B</b>. Your thumb is the direction of travel.
              Here: (<Tex>{hatTex(eDir.axis, eDir.sign)}</Tex>) × (<Tex>{hatTex(bDir.axis, bDir.sign)}</Tex>) ={' '}
              <Tex>{hatTex(lab.kAxis, lab.kSign)}</Tex>.
            </Note>
            <Tex block>{String.raw`\vec E = ${eDir.sign === 1 ? '' : '-'}E_0\cos(${arg('a', 'b')})\,${HAT[eDir.axis]}`}</Tex>
            <Tex block>{String.raw`\vec B = ${bDir.sign === 1 ? '' : '-'}B_0\cos(${arg('a', 'b')})\,${HAT[bDir.axis]}`}</Tex>
          </Section>

          <Section title="Size">
            <Slider label="Electric amplitude E₀" value={lab.E0} min={10} max={300} step={5} unit="V/m" color="var(--c-E)" onChange={(v) => (lab.E0 = v)} />
            <Slider label="Wavelength λ" value={lab.lambda} min={1} max={8} step={0.1} unit="m" color="var(--c-V)" onChange={(v) => (lab.lambda = v)} />
            <Slider label="Frequency f" value={lab.frequency / 1e6} min={C_LIGHT / 8e6} max={C_LIGHT / 1e6} log unit="MHz"
              onChange={(v) => (lab.frequency = v * 1e6)} />
            <Readouts>
              <Readout label="Magnetic amplitude B₀ = E₀/c" value={(lab.E0 / C_LIGHT) * 1e9} unit="nT" color="var(--c-B)" />
              <Readout label="λ × f" value="c = 3.00×10⁸ m/s" />
              <Readout label="Period T = 1/f" value={(1 / lab.frequency) * 1e9} unit="ns" />
            </Readouts>
            <Note>
              Wavelength and frequency are tied together: every electromagnetic wave in vacuum moves at c, so a longer
              wavelength means a lower frequency. The animation is slowed down enormously, and E and B are drawn the
              same length even though their units differ.
            </Note>
          </Section>
        </>
      ) : (
        <GivenPanel lab={lab} />
      )}

      <Section title="Show">
        <div className="toggles">
          <Toggle label="E field" value={lab.showE} color="var(--c-E)" onChange={(v) => (lab.showE = v)} />
          <Toggle label="B field" value={lab.showB} color="var(--c-B)" onChange={(v) => (lab.showB = v)} />
          <Toggle label="E, B, E×B on a crest" value={lab.showTriad} onChange={(v) => (lab.showTriad = v)} />
        </div>
      </Section>

      <Section title="What to notice">
        <Note>
          <p>
            E (yellow) and B (teal) rise and fall together: they peak at the same places and pass through zero at the
            same places. They are in phase.
          </p>
          <p>
            Flip E and B flips with it, so that E × B keeps pointing along the direction of travel. Reverse the travel
            direction with E fixed and only B flips.
          </p>
        </Note>
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\vec E \times \vec B = 4\pi\,\vec S`}>
          As written on the course formula sheet: the energy flow S points along E × B, which is the direction of
          travel.
        </Formula>
        <Formula tex={String.raw`E_0 = c\,B_0 \qquad c = \frac{1}{\sqrt{\mu_0\epsilon_0}}`}>
          In SI units the amplitudes are locked together by the speed of light (and S = E × B / μ₀).
        </Formula>
        <Formula tex={String.raw`\lambda = \frac{2\pi}{a} \qquad v = \frac{b}{a}`}>
          For a field written as cos(ax ∓ bt).
        </Formula>
      </Section>
    </LabPage>
  );
}

function GivenPanel({ lab }: { lab: EMWaveLab }) {
  const g = lab.given;
  const an = lab.analysis()!;
  const sym = g.field === 'B' ? 'B' : 'E';
  const otherSym = g.field === 'B' ? 'E' : 'B';
  const formTex = (a: string, b: string) => `${a}\\,${g.variable} ${g.form === 1 ? '-' : '+'} ${b}\\,t`;
  const DIRS6 = AXES.flatMap((axis) => [1, -1].map((sign) => ({ value: `${sign === 1 ? '+' : '-'}${axis}`, axis, sign: sign as Sign })));
  return (
    <>
      <Section title="The field you are given">
        <Tex block>{String.raw`\vec ${sym} = ${g.compSign === 1 ? '' : '-'}${sym}_0\cos(${formTex('a', 'b')})\,${HAT[g.comp]}`}</Tex>
        <Segmented label="Which field" value={g.field}
          options={[{ value: 'B', label: 'Magnetic field B' }, { value: 'E', label: 'Electric field E' }]}
          onChange={(v) => (g.field = v)} />
        <Segmented label="It points along" wrap value={`${g.compSign === 1 ? '+' : '-'}${g.comp}`}
          options={DIRS6.map((d) => ({ value: d.value, label: <Tex>{hatTex(d.axis, d.sign)}</Tex> }))}
          onChange={(v) => {
            const d = DIRS6.find((k) => k.value === v)!;
            g.comp = d.axis;
            g.compSign = d.sign;
          }} />
        <div className="wave-given">
          <Segmented label="Variable in the cosine" value={g.variable}
            options={AXES.map((a) => ({ value: a, label: a }))} onChange={(v) => (g.variable = v)} />
          <Segmented label="Sign" value={g.form}
            options={[{ value: 1, label: '−  bt' }, { value: -1, label: '+  bt' }]} onChange={(v) => (g.form = v as Sign)} />
        </div>
        <Slider label="a" value={g.a} min={0.5} max={3} step={0.05} unit="rad/m" onChange={(v) => (g.a = v)} />
        <Slider label="b" value={g.b} min={0.5} max={5} step={0.05} unit="rad/s" onChange={(v) => (g.b = v)} />
      </Section>

      <Section title="What it tells you">
        {an.valid ? (
          <>
            <ol className="wave-steps" type="a">
              <li>
                <b>Speed</b> = b/a = {n3(an.speed)} m/s. Follow a crest: the argument {g.variable === 'x' ? 'ax' : `a${g.variable}`}{' '}
                {g.form === 1 ? '−' : '+'} bt stays constant when {g.variable} changes by b/a every second.
              </li>
              <li>
                <b>Travels toward {dirName(an.travel.axis, an.travel.sign)}</b>. The variable in the cosine is {g.variable}, and a{' '}
                {g.form === 1 ? 'minus' : 'plus'} sign means it moves toward {g.form === 1 ? 'positive' : 'negative'} {g.variable}.
              </li>
              <li>
                <b>{otherSym} points along {dirName(an.other.axis, an.other.sign)}</b> (when {sym} is along{' '}
                {dirName(g.comp, g.compSign)}). It has to be perpendicular to both {sym} and the direction of travel, with E × B
                along the travel direction: <Tex>{`(${hatTex(axisOf(an.e).axis, axisOf(an.e).sign)})\\times(${hatTex(axisOf(an.b).axis, axisOf(an.b).sign)}) = ${hatTex(an.travel.axis, an.travel.sign)}`}</Tex>.
              </li>
              <li>
                <b>Wavelength</b> = 2π/a = {n3(an.wavelength)} m. That is how far {g.variable} must change for the cosine to repeat.
              </li>
            </ol>
            <Tex block>{String.raw`\vec ${otherSym} = ${an.other.sign === 1 ? '' : '-'}${otherSym}_0\cos(${formTex('a', 'b')})\,${HAT[an.other.axis]}`}</Tex>
            <Note kind="good">
              These answers stay in terms of a and b in a symbolic problem: speed b/a, wavelength 2π/a. The picture
              uses the slider values so you can see them.
            </Note>
          </>
        ) : (
          <Note kind="warn" title="Not a possible wave">
            {an.reason} Pick a field direction that is different from the variable in the cosine.
          </Note>
        )}
      </Section>
    </>
  );
}

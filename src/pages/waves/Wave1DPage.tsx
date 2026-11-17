import { useEffect, useMemo } from 'react';
import { useRoute } from '../../app/router';
import { fmt } from '../../engine/math';
import { frequency, period, waveDirection, waveSpeed, wavelength, Wave1D } from '../../physics/waves';
import {
  Button, ButtonRow, Formula, Note, Readout, Readouts, Section, Segmented, Select, Slider, Tex, Toggle, useLabUI,
} from '../../ui/controls';
import { LabCanvas } from '../../ui/LabCanvas';
import { LabPage } from '../../ui/LabPage';
import { Wave1DLab } from './wave1dLab';
import './waves.css';

const PRESETS = [
  { value: 'right', label: 'cos(ax − bt): moves toward +x' },
  { value: 'left', label: 'cos(ax + bt): moves toward −x' },
  { value: 'p65', label: 'Problem 65 numbers: a = 2, b = 3' },
  { value: 'standing', label: 'Two opposite waves: standing wave' },
  { value: 'beats', label: 'Two close wavelengths: beats' },
];

const n3 = (x: number) => fmt(x, 3).replace('−', '-');
function waveTex(w: Wave1D, sub = ''): string {
  return String.raw`f${sub}(x,t) = ${n3(w.A)}\cos\!\left(${n3(w.a)}\,x ${w.form === 1 ? '-' : '+'} ${n3(w.b)}\,t\right)`;
}

function WaveControls({ w, onChange, color }: { w: Wave1D; onChange: () => void; color?: string }) {
  return (
    <>
      <Segmented
        label="Sign in the argument"
        value={w.form}
        options={[
          { value: 1, label: 'ax − bt', title: 'Moves toward +x' },
          { value: -1, label: 'ax + bt', title: 'Moves toward −x' },
        ]}
        onChange={(v) => {
          w.form = v as 1 | -1;
          onChange();
        }}
      />
      <Slider label="Amplitude A" value={w.A} min={0.2} max={3} step={0.1} color={color} onChange={(v) => { w.A = v; onChange(); }} />
      <Slider label="a (multiplies x)" value={w.a} min={0.3} max={6} step={0.05} unit="rad/m" color={color} onChange={(v) => { w.a = v; onChange(); }} />
      <Slider label="b (multiplies t)" value={w.b} min={0.2} max={8} step={0.05} unit="rad/s" color={color} onChange={(v) => { w.b = v; onChange(); }} />
    </>
  );
}

export default function Wave1DPage() {
  useLabUI();
  const lab = useMemo(() => new Wave1DLab(), []);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const w = lab.w;
  const lam = wavelength(w.a), T = period(w.b), v = waveSpeed(w.a, w.b);
  const dir = waveDirection(w);
  const eq = lab.waveEq();
  const sameSpeed = !lab.second || Math.abs(waveSpeed(lab.w2.a, lab.w2.b) - v) < 1e-6;
  const eqOk = Math.abs(eq.fxx - eq.rhs) < 1e-3 * Math.max(1, Math.abs(eq.fxx));

  return (
    <LabPage
      lab={lab}
      hint="Drag the pink probe along x · drag empty space to pan · scroll to zoom"
      toolbar={
        <>
          <Button kind="ghost" onClick={() => (lab.paused = !lab.paused)}>{lab.paused ? '▶ Play' : '❚❚ Pause'}</Button>
          <Button kind="ghost" onClick={() => lab.restart()}>Restart at t = 0</Button>
        </>
      }
      below={
        <div className="plot-cell wave-plot">
          <LabCanvas lab={lab.plot} />
        </div>
      }
      intro={
        <p>
          A travelling wave is a fixed shape that slides sideways. The top view is a snapshot in space at one instant.
          The plot underneath is what one point (the pink probe) does over time.
        </p>
      }
    >
      <Section title="Wave">
        <Select label="Start from" value={'' as string} options={[{ value: '', label: 'Choose a setup…' }, ...PRESETS]} onChange={(p) => p && lab.preset(p)} />
        <Tex block>{waveTex(w, lab.second ? '_1' : '')}</Tex>
        <WaveControls w={w} onChange={() => lab.resetHistory()} />
        <Slider label="Playback speed" value={lab.speed} min={0.1} max={2} step={0.05} unit="×" onChange={(s) => (lab.speed = s)} />
      </Section>

      <Section title="Read it off">
        <Readouts>
          <Readout label="Wavelength λ = 2π/a" value={lam} unit="m" color="var(--c-V)" />
          <Readout label="Period T = 2π/b" value={T} unit="s" color="var(--c-v)" />
          <Readout label="Frequency 1/T" value={frequency(w.b)} unit="Hz" />
          <Readout label="Speed v = b/a" value={v} unit="m/s" color="var(--c-v)" />
          <Readout label="Direction" value={dir === 1 ? 'toward +x' : 'toward −x'} color="var(--c-E)" />
        </Readouts>
        <Note title="Which way does it move?">
          Follow one crest, where the argument stays equal to zero. For <Tex>{'ax - bt = 0'}</Tex> you need{' '}
          <Tex>{'x = (b/a)\\,t'}</Tex>, so x grows with time: the wave moves toward +x. For{' '}
          <Tex>{'ax + bt'}</Tex> you get <Tex>{'x = -(b/a)\\,t'}</Tex>: it moves toward −x. Either way the speed is b/a.
        </Note>
      </Section>

      <Section title="Wave equation at the probe">
        <Readouts>
          <Readout label="" tex={String.raw`\partial^2 f/\partial x^2`} value={eq.fxx} color="var(--c-E)" />
          <Readout label="" tex={String.raw`\tfrac{1}{v^2}\,\partial^2 f/\partial t^2`} value={eq.rhs} color="var(--c-F)" />
        </Readouts>
        {eqOk ? (
          <Note kind="good">
            The two numbers match at every point and every instant. That is what it means for f to solve the wave
            equation with speed v = b/a.
          </Note>
        ) : (
          <Note kind="warn">
            {sameSpeed
              ? 'The two sides differ slightly here because of rounding.'
              : 'The two sides do not match: the second wave has a different speed b/a, so the sum does not solve a wave equation with one speed.'}
          </Note>
        )}
      </Section>

      <Section title="Add a second wave">
        <Toggle label="Add a second wave" value={lab.second} onChange={(s) => { lab.second = s; lab.resetHistory(); }} />
        {lab.second && (
          <>
            <Tex block>{waveTex(lab.w2, '_2')}</Tex>
            <WaveControls w={lab.w2} onChange={() => lab.resetHistory()} color="var(--c-pos)" />
            <Note>
              The yellow curve is the sum of the blue and red waves. Give them the same a and b but opposite signs and
              the crests stop travelling: that is a standing wave.
            </Note>
          </>
        )}
      </Section>

      <Section title="Show">
        <div className="toggles">
          <Toggle label="Crest marker" value={lab.showMarker} onChange={(s) => (lab.showMarker = s)} />
          <Toggle label="Earlier shape" value={lab.showGhost} onChange={(s) => (lab.showGhost = s)} />
        </div>
      </Section>

      <Section title="What to notice">
        <Note>
          <p>
            The green dot rides one crest, so it moves at the wave speed. The pink dot is stuck at one x and only
            goes up and down. The wave carries the pattern along, not the material.
          </p>
          <p>
            Raise <b>a</b> and the crests squeeze together (shorter λ). Raise <b>b</b> and the probe wiggles faster
            (shorter T). The speed is the ratio of the two.
          </p>
        </Note>
        <Note kind="good" title="Try this">
          Double a and b together. The wavelength and period both halve, but the green dot keeps the same speed.
        </Note>
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\frac{\partial^2 f}{\partial x^2} = \frac{1}{v^2}\frac{\partial^2 f}{\partial t^2}`}>
          The wave equation. Anything of the form f(ax ∓ bt) solves it with v = b/a.
        </Formula>
        <Formula tex={String.raw`\lambda = \frac{2\pi}{a} \qquad T = \frac{2\pi}{b}`}>
          The cosine repeats when its argument changes by 2π.
        </Formula>
        <Formula tex={String.raw`v = \frac{\lambda}{T} = \frac{b}{a}`}>One wavelength passes a point every period.</Formula>
      </Section>
    </LabPage>
  );
}

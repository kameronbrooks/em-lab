import { useEffect, useMemo } from 'react';
import { useRoute } from '../../app/router';
import {
  Bar, Button, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Tex, Toggle, useLabUI,
} from '../../ui/controls';
import { LabCanvas } from '../../ui/LabCanvas';
import { LabPage } from '../../ui/LabPage';
import { WaveLoopLab } from './waveLoopLab';
import './waves.css';

const pct = (x: number) => `${Math.round(Math.min(1, x) * 100)}%`;

export default function WaveLoopPage() {
  useLabUI();
  const lab = useMemo(() => new WaveLoopLab(), []);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const f = lab.flux;
  const n = lab.normal;
  const max = lab.maxRate;
  const emfFrac = max > 0 ? f.emfAmp / max : 0;
  const eFrac = max > 0 ? f.dPhiEAmp / max : 0;
  const plane = lab.plane();
  const comp = (x: number) => (Math.abs(x) < 5e-3 ? '0' : x.toFixed(2).replace('-', '−'));

  let verdict: React.ReactNode;
  if (plane === 'xz') {
    verdict = (
      <Note kind="good" title="Loop in the xz plane: biggest emf">
        The loop's normal lies along B, so the whole magnetic field passes straight through it. The magnetic flux
        swings as far as it can, and so does the emf. No electric field threads the loop, so the electric flux is zero.
      </Note>
    );
  } else if (plane === 'yz') {
    verdict = (
      <Note kind="good" title="Loop in the yz plane: biggest changing electric flux">
        The loop's normal lies along E, so the whole electric field passes straight through it and the electric flux
        changes as fast as it can. B only skims along the loop's surface, so the magnetic flux and the emf are zero.
      </Note>
    );
  } else if (plane === 'xy') {
    verdict = (
      <Note kind="warn" title="Loop in the xy plane: nothing">
        The loop faces the oncoming wave. Both E and B lie flat in the loop's plane, so neither one passes through
        it. Both fluxes are zero the whole time.
      </Note>
    );
  } else {
    verdict = (
      <Note title="Tilted loop">
        Only the part of each field along the normal counts. The emf scales with the y part of the normal ({comp(n[1])})
        and the electric flux with its x part ({comp(n[0])}).
      </Note>
    );
  }

  return (
    <LabPage
      lab={lab}
      hint="Drag the white ring on n̂ to tilt the loop · drag to orbit · scroll to zoom"
      toolbar={
        <>
          <Button kind="ghost" onClick={() => (lab.paused = !lab.paused)}>{lab.paused ? '▶ Play' : '❚❚ Pause'}</Button>
          <Button kind="ghost" active={plane === 'xz'} onClick={() => lab.setPlane('xz')}>xz plane</Button>
          <Button kind="ghost" active={plane === 'yz'} onClick={() => lab.setPlane('yz')}>yz plane</Button>
          <Button kind="ghost" active={plane === 'xy'} onClick={() => lab.setPlane('xy')}>xy plane</Button>
        </>
      }
      below={
        <div className="plot-row">
          <div className="plot-cell">
            <LabCanvas lab={lab.plotB} />
          </div>
          <div className="plot-cell">
            <LabCanvas lab={lab.plotE} />
          </div>
        </div>
      }
      intro={
        <p>
          A plane wave travels along +z with <b>E</b> along x and <b>B</b> along y. A wire loop sits in its path. How
          you turn the loop decides which field passes through it.
        </p>
      }
    >
      <Section title="Loop orientation">
        <Segmented
          label="Loop lies in the"
          value={plane ?? 'tilt'}
          options={[
            { value: 'xz', label: 'xz plane', title: 'Normal along y (along B)' },
            { value: 'yz', label: 'yz plane', title: 'Normal along x (along E)' },
            { value: 'xy', label: 'xy plane', title: 'Normal along z (along the travel direction)' },
          ]}
          onChange={(p) => p !== 'tilt' && lab.setPlane(p)}
        />
        <Slider label="Tilt of normal from z" value={lab.theta} min={0} max={180} step={1} unit="°" onChange={(v) => { lab.theta = v; lab.clearPlots(); }} />
        <Slider label="Turn of normal about z" value={lab.phi} min={0} max={360} step={1} unit="°" onChange={(v) => { lab.phi = v; lab.clearPlots(); }} />
        <Readouts>
          <Readout label="Normal n̂ (x, y, z)" value={`(${comp(n[0])}, ${comp(n[1])}, ${comp(n[2])})`} />
        </Readouts>
      </Section>

      <Section title="How much gets through">
        <div className="wave-verdict">
          <Bar label="Peak emf" value={emfFrac} max={1} color="var(--c-I)" text={pct(emfFrac)} />
          <Bar label="Peak dΦ_E/dt" value={eFrac} max={1} color="var(--c-F)" text={pct(eFrac)} />
        </div>
        <p className="muted">Each bar is a fraction of the most this loop could ever get.</p>
        {verdict}
        <Readouts>
          <Readout label="Magnetic flux Φ_B now" value={f.phiB} color="var(--c-B)" />
          <Readout label="emf = −dΦ_B/dt now" value={f.emf} color="var(--c-I)" />
          <Readout label="Electric flux Φ_E now" value={f.phiE} color="var(--c-E)" />
          <Readout label="dΦ_E/dt now" value={f.dPhiE} color="var(--c-F)" />
        </Readouts>
      </Section>

      <Section title="Wave and loop">
        <Slider label="Loop radius R" value={lab.R} min={0.4} max={2.5} step={0.05} unit="m" onChange={(v) => { lab.R = v; lab.clearPlots(); }} />
        <Slider label="Wavelength λ" value={lab.lambda} min={4} max={24} step={0.5} unit="m" color="var(--c-V)" onChange={(v) => { lab.lambda = v; lab.clearPlots(); }} />
        <Slider label="Angular frequency" value={lab.omega} min={0.5} max={4} step={0.1} unit="rad/s" onChange={(v) => { lab.omega = v; lab.time = 0; lab.clearPlots(); }} />
        <div className="toggles">
          <Toggle label="B field" value={lab.showB} color="var(--c-B)" onChange={(v) => (lab.showB = v)} />
          <Toggle label="E field" value={lab.showE} color="var(--c-E)" onChange={(v) => (lab.showE = v)} />
          <Toggle label="Wave on the axis" value={lab.showWave} onChange={(v) => (lab.showWave = v)} />
        </div>
      </Section>

      <Section title="What to notice">
        <Note>
          <p>
            Flux counts only the part of a field that goes <i>through</i> the loop, along its normal n̂. A field lying
            in the plane of the loop contributes nothing.
          </p>
          <p>
            <b>Problem 63:</b> the emf comes from changing magnetic flux, so aim the normal along B (y). That puts the
            loop in the xz plane. The yellow arrowheads on the wire show the induced current, and they reverse every
            half cycle.
          </p>
          <p>
            <b>Problem 64:</b> for the largest changing electric flux aim the normal along E (x). That puts the loop in
            the yz plane.
          </p>
        </Note>
        <Note kind="good" title="Same answer from the electric field">
          The emf is also <Tex>{String.raw`\oint \vec E\cdot d\vec r`}</Tex> around the wire. E points along x and
          changes with z, so only a loop that has sides along x at different z (the xz plane) gets a net push.
        </Note>
        <Note title="Displacement current">
          A changing electric flux acts like a current: it makes a magnetic field curl around it, just as a real
          current does. That extra term is what lets E and B keep regenerating each other in empty space.
        </Note>
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\phi_B \equiv \int \vec B\cdot d\vec a \qquad \mathcal{E} = -\frac{d\phi_B}{dt}`}>
          Faraday's law: a changing magnetic flux drives an emf around the loop.
        </Formula>
        <Formula tex={String.raw`\phi_E \equiv \int \vec E\cdot d\vec a`}>Electric flux through the loop.</Formula>
        <Formula tex={String.raw`\oint \vec B\cdot d\vec r = \mu_0\, i_{enc} + \mu_0\epsilon_0\frac{d\phi_E}{dt}`}>
          Ampère's law with the displacement-current term.
        </Formula>
      </Section>
    </LabPage>
  );
}

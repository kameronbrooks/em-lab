import { useEffect, useMemo } from 'react';
import './magnetism.css';
import { useRoute } from '../../app/router';
import { fmt } from '../../engine/math';
import { Plot } from '../../engine/plot';
import { Button, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Toggle, useLabUI } from '../../ui/controls';
import { LabCanvas } from '../../ui/LabCanvas';
import { LabPage } from '../../ui/LabPage';
import { IndScenario, InductionLab, ProfileKind } from './inductionLab';

const SCENARIOS: { value: IndScenario; label: string }[] = [
  { value: 'uniform', label: 'Changing B' },
  { value: 'slide', label: 'Loop enters a field' },
  { value: 'rotate', label: 'Rotating loop' },
  { value: 'wire', label: 'Loop and a wire' },
  { value: 'stretch', label: 'Shrinking loop' },
];

const PROFILES: { value: ProfileKind; label: string }[] = [
  { value: 'linear', label: 'B = At' },
  { value: 'cos', label: 'B = b cos(ωt)' },
  { value: 'exp', label: 'B = C e^(−at)' },
];

export default function InductionPage() {
  useLabUI();
  const lab = useMemo(() => new InductionLab(), []);
  const fluxPlot = useMemo(() => new Plot(lab.fluxPlot), [lab]);
  const emfPlot = useMemo(() => new Plot(lab.emfPlot), [lab]);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) {
      lab.preset(route.query.preset);
      fluxPlot.resetRange();
      emfPlot.resetRange();
    }
  }, [lab, fluxPlot, emfPlot, route.query.preset]);

  const sc = lab.scenario;
  const s = lab.at();
  const [k, fu, eu, iu] = lab.units;
  const maxEmf = lab.maxEmf();
  const val = (x: number) => (Math.abs(x * k) < 1e-9 ? '0' : fmt(x * k, 3));
  /** After any change that alters the scale of the traces, start the run and the plots again. */
  const again = () => {
    lab.restart();
    fluxPlot.resetRange();
    emfPlot.resetRange();
  };

  return (
    <LabPage
      lab={lab}
      hint="Drag to orbit · scroll to zoom · the yellow dots show the induced current"
      toolbar={
        <>
          <Button kind="primary" onClick={() => (lab.paused = !lab.paused)}>{lab.paused ? 'Play' : 'Pause'}</Button>
          <Button kind="ghost" onClick={again}>Restart</Button>
          <Button kind="ghost" onClick={() => lab.boardView()} title="Look straight at the board: +z points out at you">Board view</Button>
          <Button kind="ghost" onClick={() => lab.view3D()}>3D view</Button>
        </>
      }
      below={
        <div className="plot-row">
          <div className="plot-cell">
            <LabCanvas lab={fluxPlot} />
          </div>
          <div className="plot-cell">
            <LabCanvas lab={emfPlot} />
          </div>
        </div>
      }
      intro={
        <p>
          A loop does not care how much magnetic field passes through it, only how fast that amount is changing. Change
          the flux and an emf appears around the loop, driving a current that pushes back against the change.
        </p>
      }
    >
      <Section title="Situation">
        <Segmented wrap value={sc} options={SCENARIOS} onChange={(v) => { lab.setScenario(v); again(); }} />
      </Section>

      <Section title="Set-up">
        {sc === 'uniform' && (
          <>
            <Segmented wrap label="How the field changes" value={lab.profile} options={PROFILES} onChange={(v) => { lab.profile = v; again(); }} />
            {lab.profile === 'linear' && <Slider label="Rate A" value={lab.A} min={-0.5} max={0.5} step={0.05} unit="T/s" color="var(--c-B)" onChange={(v) => { lab.A = v; again(); }} />}
            {lab.profile === 'cos' && (
              <>
                <Slider label="Amplitude b" value={lab.b} min={0.1} max={2} step={0.1} unit="T" color="var(--c-B)" onChange={(v) => (lab.b = v)} />
                <Slider label="Angular frequency ω" value={lab.w} min={0.5} max={6} step={0.1} unit="rad/s" onChange={(v) => { lab.w = v; again(); }} />
              </>
            )}
            {lab.profile === 'exp' && (
              <>
                <Slider label="Starting field C" value={lab.Cc} min={0.2} max={2} step={0.1} unit="T" color="var(--c-B)" onChange={(v) => { lab.Cc = v; again(); }} />
                <Slider label="Decay rate a" value={lab.a} min={0.2} max={2} step={0.05} unit="1/s" onChange={(v) => { lab.a = v; again(); }} />
              </>
            )}
            <Segmented label="Loop shape" value={lab.shape} options={[{ value: 'circle' as const, label: 'Circle' }, { value: 'square' as const, label: 'Square' }]}
              onChange={(v) => (lab.shape = v)} />
            <Slider label={lab.shape === 'circle' ? 'Radius R' : 'Side L'} value={lab.size} min={0.5} max={3} step={0.1} unit="m" onChange={(v) => (lab.size = v)} />
            {!lab.confined && <Slider label="Tilt of the loop away from B" value={lab.tilt} min={0} max={90} step={5} unit="°" onChange={(v) => (lab.tilt = v)} />}
            <Toggle label="Field only inside a solenoid of radius Rₛ" value={lab.confined} onChange={(v) => { lab.confined = v; if (v) lab.tilt = 0; }} />
            {lab.confined && <Slider label="Solenoid radius Rₛ" value={lab.Rs} min={0.3} max={2.5} step={0.1} unit="m" onChange={(v) => (lab.Rs = v)} />}
            <Toggle label="Show the induced electric field" value={lab.showE} onChange={(v) => (lab.showE = v)} color="var(--c-E)" />
          </>
        )}
        {sc === 'slide' && (
          <>
            <Slider label="Field B (+ is into the board)" value={lab.sB} min={-1.5} max={1.5} step={0.1} unit="T" color="var(--c-B)" onChange={(v) => (lab.sB = v)} />
            <Slider label="Loop speed v" value={lab.sV} min={0.3} max={3} step={0.1} unit="m/s" color="var(--c-v)" onChange={(v) => { lab.sV = v; again(); }} />
            <Slider label="Loop width (along the motion)" value={lab.sW} min={1} max={4} step={0.25} unit="m" onChange={(v) => (lab.sW = v)} />
            <Slider label="Loop height h" value={lab.sH} min={0.5} max={4} step={0.25} unit="m" onChange={(v) => (lab.sH = v)} />
          </>
        )}
        {sc === 'rotate' && (
          <>
            <Slider label="Turns per metre n" value={lab.solN} min={500} max={4000} step={100} unit="/m" onChange={(v) => (lab.solN = v)} />
            <Slider label="Solenoid current I" value={lab.solI} min={0} max={400} step={10} unit="A" color="var(--c-I)" onChange={(v) => (lab.solI = v)} />
            <Slider label="Loop radius a" value={lab.ra} min={0.4} max={2} step={0.1} unit="m" onChange={(v) => (lab.ra = v)} />
            <Slider label="Rotation rate ω" value={lab.rw} min={0.5} max={6} step={0.1} unit="rad/s" onChange={(v) => { lab.rw = v; again(); }} />
            <Toggle label="Show the induced electric field" value={lab.showE} onChange={(v) => (lab.showE = v)} color="var(--c-E)" />
          </>
        )}
        {sc === 'wire' && (
          <>
            <Segmented label="Where is the loop?" value={lab.wireMode}
              options={[{ value: 'centered' as const, label: 'Around the wire' }, { value: 'beside' as const, label: 'Beside the wire' }]}
              onChange={(v) => { lab.wireMode = v; again(); }} />
            <Slider label="Rate of change of current A" value={lab.wA} min={10} max={300} step={10} unit="A/s" color="var(--c-I)" onChange={(v) => { lab.wA = v; again(); }} />
            {lab.wireMode === 'centered' ? (
              <Slider label="Loop radius b" value={lab.wb} min={0.5} max={3.5} step={0.1} unit="m" onChange={(v) => (lab.wb = v)} />
            ) : (
              <>
                <Slider label="Gap between wire and loop d" value={lab.wd} min={0.2} max={2} step={0.1} unit="m" onChange={(v) => (lab.wd = v)} />
                <Slider label="Loop width w" value={lab.ww} min={0.5} max={3} step={0.1} unit="m" onChange={(v) => (lab.ww = v)} />
                <Slider label="Loop length ℓ (along the wire)" value={lab.wl} min={1} max={6} step={0.25} unit="m" onChange={(v) => (lab.wl = v)} />
              </>
            )}
          </>
        )}
        {sc === 'stretch' && (
          <>
            <Slider label="Field B (constant)" value={lab.stB} min={0.1} max={1.5} step={0.1} unit="T" color="var(--c-B)" onChange={(v) => (lab.stB = v)} />
            <Slider label="Starting side L" value={lab.stL} min={1} max={5} step={0.25} unit="m" onChange={(v) => (lab.stL = v)} />
            <Slider label="Time to shrink, t*" value={lab.stT} min={0.5} max={6} step={0.25} unit="s" onChange={(v) => { lab.stT = v; again(); }} />
          </>
        )}
        <Slider label="Loop resistance R" value={lab.R} min={0.5} max={10} step={0.5} unit="Ω" onChange={(v) => (lab.R = v)} />
      </Section>

      <Section title="Right now">
        <Readouts>
          <Readout label="Time in this run" value={lab.t} unit="s" />
          <Readout label="Flux through the loop Φ" value={val(s.flux)} unit={fu} color="var(--c-B)" />
          <Readout label="emf = −dΦ/dt" value={val(s.emf)} unit={eu} color="var(--c-I)" />
          <Readout label="Induced current i = emf/R" value={val(s.current)} unit={iu} color="var(--c-I)" />
          {maxEmf !== null && <Readout label="Largest emf with these settings" value={val(maxEmf)} unit={eu} />}
          {sc === 'rotate' && <Readout label="B inside = μ₀nI" value={lab.solB} unit="T" color="var(--c-B)" />}
          {sc === 'rotate' && maxEmf !== null && <Readout label="Largest current ωμ₀nIπa²/R" value={maxEmf / lab.R} unit="A" color="var(--c-I)" />}
          {sc === 'slide' && <Readout label="Drag force on the loop |i|hB" value={Math.abs(s.current * lab.sH * lab.sB)} unit="N" color="var(--c-F)" />}
          {(sc === 'uniform' || sc === 'rotate') && (sc === 'rotate' || lab.shape === 'circle') && (
            <Readout label="Induced E around the loop, |emf|/2πR" value={lab.inducedField()} unit="V/m" color="var(--c-E)" />
          )}
          {sc === 'stretch' && <Readout label="B from the emf, 4χt*/3L²" value={maxEmf !== null ? (4 * maxEmf * lab.stT) / (3 * lab.stL ** 2) : 0} unit="T" />}
        </Readouts>
        <Note title="Lenz's law, right now">{lab.lenz()}</Note>
      </Section>

      <Section title="What to notice">
        {sc === 'uniform' && (
          <Note>
            <p>
              Compare the two plots. With B = At the flux climbs in a straight line and the emf is a flat line: Aπ R² for a
              circle (Problem 25) or aL² for a square (Problem 36). With the cosine, the emf is largest when the flux is
              passing through zero, because that is where the flux is changing fastest. With the exponential, the emf is
              largest at the very start, CaL² (Problem 38).
            </p>
            <p>
              Tilt the loop and the emf shrinks by cos θ. "Maximum emf" in the problems means the loop faces the field
              head-on. Turn on the induced electric field for Problem 39: the emf is that field added up around the
              loop, so E = emf/2πR.
            </p>
            <p>
              Confine the field to a solenoid and make the loop bigger than it: the flux stops growing, because only the
              part of the loop with field in it counts.
            </p>
          </Note>
        )}
        {sc === 'slide' && (
          <Note>
            <p>
              The emf only exists while an edge of the loop is crossing the boundary of the field. Once the loop is fully
              inside, the flux is large but steady, so the emf is zero. On the way out the emf reverses.
            </p>
            <p>
              While current flows, the field pushes back on the loop (pink arrow), opposing the motion both going in and
              coming out. That is Lenz's law as a force.
            </p>
          </Note>
        )}
        {sc === 'rotate' && (
          <Note>
            <p>
              Problem 24. The field inside the solenoid is steady, but the loop turns, so the flux is μ₀nIπa² cos(ωt).
              Differentiating gives an emf of ωμ₀nIπa² sin(ωt), and dividing by R gives the current. The largest current
              is ωμ₀nIπa²/R, when the loop is edge-on to the field and the flux is zero.
            </p>
          </Note>
        )}
        {sc === 'wire' && (
          <Note>
            <p>
              Problem 37. With the loop in the plane of the board and the wire coming straight out through its centre, the
              wire's field circles around inside that plane. No field line pokes through the loop, so the flux is zero and
              stays zero. No emf, no current, however fast the current ramps.
            </p>
            <p>
              Move the loop beside the wire instead (video 47) and now the field does pass through it. The flux grows as
              the current grows, and a steady emf appears.
            </p>
          </Note>
        )}
        {sc === 'stretch' && (
          <Note>
            <p>
              Problem 40. The field never changes, but the loop's area does. Going from side L to L/2 the area drops from
              L² to L²/4, so the flux changes by 3BL²/4. Spread over a time t*, the emf is χ = 3BL²/(4t*), which you can
              turn around to get B = 4χt*/(3L²).
            </p>
          </Note>
        )}
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\mathcal{E} = -\frac{d\phi_B}{dt}`}>Faraday's law: the emf is the rate of change of magnetic flux.</Formula>
        <Formula tex={String.raw`\phi_B \equiv \int \vec B\cdot d\vec a`}>Flux: how much field passes through the loop.</Formula>
        <Formula tex={String.raw`v = iR`}>Ohm's law turns the emf into a current.</Formula>
        {(sc === 'uniform' || sc === 'rotate') && (
          <Formula tex={String.raw`\oint \vec E\cdot d\vec r = -\frac{d\phi_B}{dt}`}>A changing flux makes an electric field that circles around it.</Formula>
        )}
      </Section>
    </LabPage>
  );
}

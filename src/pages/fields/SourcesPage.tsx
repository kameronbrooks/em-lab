import { useEffect, useMemo } from 'react';
import './magnetism.css';
import { useRoute } from '../../app/router';
import { fmt } from '../../engine/math';
import { MU0 } from '../../physics/fields';
import { Button, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Toggle, useLabUI } from '../../ui/controls';
import { LabPage } from '../../ui/LabPage';
import { FluxShape, LoopShape, SourceScenario, SourcesLab } from './sourcesLab';

const SCENARIOS: { value: SourceScenario; label: string }[] = [
  { value: 'wire', label: 'Long wire' },
  { value: 'two', label: 'Two wires' },
  { value: 'sheet', label: 'Plane of current' },
  { value: 'solenoid', label: 'Solenoid' },
];

const micro = (x: number, digits = 3) => (Math.abs(x) < 1e-13 ? '0' : fmt(x * 1e6, digits));

export default function SourcesPage() {
  useLabUI();
  const lab = useMemo(() => new SourcesLab(), []);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const sc = lab.scenario;
  const amp = lab.loopOn ? lab.ampere() : null;
  const probe = lab.probeInfo();
  const bs = lab.showBS && sc === 'wire' ? lab.biot() : null;
  const flux = lab.fluxShape !== 'none' ? lab.fluxInfo() : null;
  const two = sc === 'two' ? lab.twoWire() : null;
  const match = amp ? Math.abs(amp.circulation - amp.mu0I) <= 0.02 * Math.max(Math.abs(amp.mu0I), 1e-4 * lab.bRef) : false;
  const solB = MU0 * lab.solN * lab.solI * lab.phase;

  return (
    <LabPage
      lab={lab}
      hint="Drag the loop, its white handle, and the green point P · drag empty space to orbit · scroll to zoom"
      toolbar={
        <>
          <Button kind="ghost" onClick={() => lab.boardView()} title="Look straight at the board: +z points out at you">Board view</Button>
          <Button kind="ghost" onClick={() => lab.view3D()}>3D view</Button>
        </>
      }
      intro={
        <p>
          Currents make magnetic fields that curl around them. Ampère's law says that if you walk once around any
          closed loop adding up the field along your path, the total depends only on the current passing through the
          loop.
        </p>
      }
    >
      <Section title="Source of the field">
        <Segmented wrap value={sc} options={SCENARIOS} onChange={(v) => lab.setScenario(v)} />
        {(sc === 'wire' || sc === 'two') && (
          <Slider label={sc === 'two' ? 'Left wire current (+ is out of the board)' : 'Current I (+ is out of the board)'} value={lab.I}
            min={-20} max={20} step={1} unit="A" color="var(--c-I)" onChange={(v) => (lab.I = v)} />
        )}
        {sc === 'two' && (
          <>
            <Slider label="Right wire current" value={lab.I2} min={-20} max={20} step={1} unit="A" color="var(--c-I)" onChange={(v) => (lab.I2 = v)} />
            <Slider label="Distance between wires d" value={lab.sep} min={1} max={8} step={0.25} unit="m" onChange={(v) => (lab.sep = v)} />
          </>
        )}
        {sc === 'sheet' && (
          <Slider label="Current per metre of width K (+ is out)" value={lab.K} min={-200} max={200} step={10} unit="A/m" color="var(--c-I)"
            onChange={(v) => (lab.K = v)} />
        )}
        {sc === 'solenoid' && (
          <>
            <Slider label="Turns per metre n" value={lab.solN} min={50} max={500} step={10} unit="/m" onChange={(v) => (lab.solN = v)} />
            <Slider label="Current I" value={lab.solI} min={-10} max={10} step={0.5} unit="A" color="var(--c-I)" onChange={(v) => (lab.solI = v)} />
            <Slider label="Radius R" value={lab.solR} min={1} max={3} step={0.1} unit="m" onChange={(v) => (lab.solR = v)} />
          </>
        )}
        <Toggle label="Alternating current, I = A cos(ωt)" value={lab.ac} onChange={(v) => (lab.ac = v)} />
        {lab.ac && <Slider label="Angular frequency ω" value={lab.omega} min={0.2} max={5} step={0.1} unit="rad/s" onChange={(v) => (lab.omega = v)} />}
        <div className="toggles">
          <Toggle label="Field arrows" value={lab.showArrows} onChange={(v) => (lab.showArrows = v)} />
          <Toggle label="Point P" value={lab.showProbe} onChange={(v) => (lab.showProbe = v)} />
        </div>
      </Section>

      <Section title="Field at P">
        <Readouts>
          <Readout label="|B| at P" value={micro(probe.mag)} unit="µT" color="var(--c-B)" />
          {sc === 'wire' && <Readout label="Distance r from the wire" value={probe.r} unit="m" />}
          {sc === 'wire' && <Readout label="μ₀I / 2πr" value={micro((MU0 * Math.abs(lab.I * lab.phase)) / (2 * Math.PI * probe.r))} unit="µT" />}
          {sc === 'sheet' && <Readout label="μ₀K / 2" value={micro((MU0 * Math.abs(lab.K * lab.phase)) / 2)} unit="µT" />}
          {sc === 'solenoid' && <Readout label="μ₀nI (inside)" value={micro(Math.abs(solB))} unit="µT" />}
          {two && <Readout label="Force per metre of wire" value={micro(Math.abs(two.perLength))} unit="µN/m" color="var(--c-F)" />}
          {two && <Readout label="The wires" value={Math.abs(two.perLength) < 1e-15 ? 'feel no force' : two.attract ? 'attract' : 'repel'} color="var(--c-F)" />}
        </Readouts>
      </Section>

      <Section title="Ampère loop">
        <Toggle label="Show the loop" value={lab.loopOn} onChange={(v) => (lab.loopOn = v)} />
        {lab.loopOn && amp && (
          <>
            <Segmented value={lab.loopShape} options={[{ value: 'circle' as LoopShape, label: 'Circle' }, { value: 'rect' as LoopShape, label: 'Rectangle' }]}
              onChange={(v) => (lab.loopShape = v)} />
            <Readouts>
              <Readout tex={String.raw`\oint \vec B\cdot d\vec r`} label="" value={micro(amp.circulation)} unit="µT·m" color="var(--c-B)" />
              <Readout label="Current through the loop" value={Math.abs(amp.iEnc) < 1e-9 ? '0' : fmt(amp.iEnc, 3)} unit="A" color="var(--c-I)" />
              <Readout tex={String.raw`\mu_0\, i_{enc}`} label="" value={micro(amp.mu0I)} unit="µT·m" color={match ? 'var(--good)' : 'var(--warn)'} />
            </Readouts>
            <p className="muted">
              The loop is walked counter-clockwise. Teal parts are where B points along your walk, pink where it points
              against it.
            </p>
          </>
        )}
      </Section>

      {sc === 'wire' && (
        <Section title="Biot–Savart: add up the pieces">
          <Toggle label="Chop the wire into pieces" value={lab.showBS} onChange={(v) => (lab.showBS = v)} />
          {bs && (
            <>
              <Slider label="Number of pieces" value={lab.bsN} min={1} max={60} step={1} onChange={(v) => (lab.bsN = Math.round(v))} />
              <Slider label="Half-length of the wire" value={lab.bsHalf} min={0.5} max={5} step={0.25} unit="m" onChange={(v) => (lab.bsHalf = v)} />
              <Readouts>
                <Readout label="Sum of the pieces" value={micro(bs.mag)} unit="µT" color="var(--c-B)" />
                <Readout label="Infinite wire, μ₀I / 2πr" value={micro(Math.abs(bs.infinite))} unit="µT" />
                <Readout label="Fraction reached" value={Math.abs(bs.infinite) > 1e-15 ? `${fmt((bs.mag / Math.abs(bs.infinite)) * 100, 3)} %` : '—'} />
              </Readouts>
              <p className="muted">
                Each piece Idℓ adds a small field at P, shown stacked tip to tail. Pieces far from P add very little, so a
                wire only a few times longer than your distance from it is already nearly "infinite". Drag P closer.
              </p>
            </>
          )}
        </Section>
      )}

      <Section title="Magnetic flux">
        <Segmented value={lab.fluxShape}
          options={[
            { value: 'none' as FluxShape, label: 'Off' },
            { value: 'coil' as FluxShape, label: 'Flat coil' },
            { value: 'sphere' as FluxShape, label: 'Sphere' },
            { value: 'cube' as FluxShape, label: 'Cube' },
          ]}
          onChange={(v) => (lab.fluxShape = v)} />
        {flux && (
          <>
            <Slider label={lab.fluxShape === 'cube' ? 'Half-side' : 'Radius'} value={lab.flux.size} min={0.3} max={2.5} step={0.1} unit="m"
              onChange={(v) => (lab.flux.size = v)} />
            {lab.fluxShape === 'coil' && (
              <Slider label="Tilt of the coil" value={lab.flux.tilt} min={0} max={180} step={5} unit="°" onChange={(v) => (lab.flux.tilt = v)} />
            )}
            <Readouts>
              {flux.closed && <Readout label="Flux going out" value={micro(flux.out)} unit="µWb" />}
              {flux.closed && <Readout label="Flux going in" value={micro(flux.in)} unit="µWb" />}
              <Readout label={flux.closed ? 'Net flux through the closed surface' : 'Flux through the coil'}
                value={Math.abs(flux.net) < 1e-4 * lab.bRef ? '0' : micro(flux.net)} unit="µWb" color={flux.closed ? 'var(--good)' : 'var(--c-B)'} />
              {sc === 'solenoid' && lab.fluxShape === 'coil' && (
                <Readout label="μ₀nIπL² (the most possible)" value={micro(Math.abs(solB) * Math.PI * lab.flux.size ** 2)} unit="µWb" />
              )}
            </Readouts>
          </>
        )}
      </Section>

      <Section title="What to notice">
        {sc === 'wire' && (
          <Note>
            <p>
              Drag the loop off-centre, stretch it, or switch to a rectangle. As long as the wire is inside, the total is
              still μ₀I. Slide the loop so the wire is outside and the total drops to zero, even though B is not zero
              anywhere on the loop: the teal and pink parts cancel.
            </p>
            <p>
              Turn on alternating current for Problem 27: the field is still B = μ₀A cos(ωt)/2πr circling the wire, it
              just grows, shrinks and reverses with the current.
            </p>
          </Note>
        )}
        {sc === 'two' && (
          <Note>
            <p>
              Each wire sits in the other's field and feels F = IL × B. Currents in the same direction attract, opposite
              currents repel. Put the loop around one wire, then both: Ampère's law counts the currents with their signs.
            </p>
          </Note>
        )}
        {sc === 'sheet' && (
          <Note>
            <p>
              A flat sheet of current gives a field of the same size, μ₀K/2, at every distance, pointing opposite ways on
              the two sides. A rectangle straddling the sheet picks up μ₀K times its width, however tall it is.
            </p>
            <p>Choose Cube under magnetic flux for Problem 26: as much field goes in one side as comes out the other.</p>
          </Note>
        )}
        {sc === 'solenoid' && (
          <Note>
            <p>
              Seen from the side, the windings come out of the board along the top and go in along the bottom. Inside, the
              two layers add to a uniform field μ₀nI. Outside they cancel. Drag the rectangle so it straddles the top
              wall: only the inside edge contributes.
            </p>
            <p>
              Problem 34: the flux through a sphere inside is zero. Problem 35: a flat coil of radius L catches at most
              μ₀nIπL², when it faces along the axis. Tilt it to see the flux drop.
            </p>
          </Note>
        )}
        <Note kind="good" title="Why closed surfaces always give zero">
          Magnetic field lines never start or stop, they only loop. Whatever goes into a closed surface must come back
          out, so the net magnetic flux is zero for any shape, anywhere.
        </Note>
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\oint \vec B\cdot d\vec r = \mu_0\, i_{enc}`}>Ampère's law.</Formula>
        <Formula tex={String.raw`\vec B = \frac{\mu_0}{4\pi}\int \frac{I\,d\vec\ell\times\hat r}{r^2}`}>Biot–Savart law: the field of each small piece of current.</Formula>
        <Formula tex={String.raw`\oint \vec B\cdot d\vec a = 0`}>Gauss's law for magnetism.</Formula>
        <Formula tex={String.raw`\phi_B \equiv \int \vec B\cdot d\vec a`}>Magnetic flux through a surface.</Formula>
        {sc === 'wire' && <Formula tex={String.raw`B = \frac{\mu_0 I}{2\pi r}`}>Long straight wire.</Formula>}
        {sc === 'two' && <Formula tex={String.raw`\frac{F}{L} = \frac{\mu_0 I_1 I_2}{2\pi d}`}>Force per length between parallel wires.</Formula>}
        {sc === 'sheet' && <Formula tex={String.raw`B = \frac{\mu_0 K}{2}`}>Infinite plane of current, K amps per metre of width.</Formula>}
        {sc === 'solenoid' && <Formula tex={String.raw`B = \mu_0 n I`}>Inside a long solenoid.</Formula>}
      </Section>
    </LabPage>
  );
}

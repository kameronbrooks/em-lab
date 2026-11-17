import { useEffect, useMemo } from 'react';
import './magnetism.css';
import { useRoute } from '../../app/router';
import { fmt, len } from '../../engine/math';
import { Button, ButtonRow, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Tex, Toggle, useLabUI } from '../../ui/controls';
import { LabPage } from '../../ui/LabPage';
import { AXIS, AXIS_NAME, Axis, MagForceLab, MagScenario, dirName } from './magForceLab';

const SCENARIOS: { value: MagScenario; label: string }[] = [
  { value: 'uniform', label: 'Uniform B' },
  { value: 'selector', label: 'Crossed E and B' },
  { value: 'wire', label: 'Near a wire' },
  { value: 'solenoid', label: 'Solenoid' },
  { value: 'loop', label: 'Current loop' },
];

const AXES: Axis[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
const AXIS_SHORT: Record<Axis, string> = { '+x': '+x', '-x': '−x', '+y': '+y', '-y': '−y', '+z': '+z out', '-z': '−z in' };
const axisOptions = AXES.map((a) => ({ value: a, label: AXIS_SHORT[a], title: AXIS_NAME[a] }));

function vecText(v: readonly number[], digits = 2): string {
  const f = (x: number) => (Math.abs(x) < 5e-4 ? '0' : fmt(x, digits));
  return `(${f(v[0])}, ${f(v[1])}, ${f(v[2])})`;
}

export default function MagForcePage() {
  useLabUI();
  const lab = useMemo(() => new MagForceLab(), []);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const sc = lab.scenario;
  const info = lab.info();
  const loop = sc === 'loop' ? lab.loopInfo() : null;
  const dirAxis = AXES.find((a) => Math.abs(AXIS[a][0] - lab.dir[0]) + Math.abs(AXIS[a][1] - lab.dir[1]) + Math.abs(AXIS[a][2] - lab.dir[2]) < 1e-6);

  return (
    <LabPage
      lab={lab}
      hint={
        sc === 'loop'
          ? 'Drag to orbit · scroll to zoom · shift-drag to pan'
          : 'Drag the green arrow tip to aim, drag the particle to move it · drag empty space to orbit · scroll to zoom'
      }
      toolbar={
        <>
          {sc !== 'loop' && (
            <>
              <Button kind="primary" onClick={() => lab.toggleRun()}>
                {lab.running ? 'Pause' : lab.ready ? 'Launch' : 'Resume'}
              </Button>
              <Button kind="ghost" onClick={() => lab.reset()}>Reset</Button>
            </>
          )}
          <Button kind="ghost" onClick={() => lab.boardView()} title="Look straight at the board: +z points out at you">Board view</Button>
          <Button kind="ghost" onClick={() => lab.view3D()}>3D view</Button>
        </>
      }
      intro={
        <p>
          A magnetic field only pushes on a charge that is moving, and the push is always sideways: perpendicular to
          both the velocity and the field. That is why it bends paths into circles but never speeds the particle up.
        </p>
      }
    >
      <Section title="Situation">
        <Segmented wrap value={sc} options={SCENARIOS} onChange={(v) => lab.setScenario(v)} />
      </Section>

      {sc !== 'loop' && (
        <Section title="Particle">
          <Slider label="Charge q" value={lab.q} min={-3} max={3} step={0.5} unit="µC"
            color={lab.q >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'} onChange={(v) => (lab.q = v === 0 ? 0.5 : v)} />
          <Slider label="Mass m" value={lab.m} min={0.25} max={5} step={0.25} unit="mg" onChange={(v) => (lab.m = v)} />
          <Slider label="Speed v" value={lab.v0} min={0} max={5} step={0.1} unit="m/s" color="var(--c-v)" onChange={(v) => lab.setSpeed(v)} />
          <Segmented label="Launch direction" value={(dirAxis ?? '') as Axis} options={axisOptions}
            onChange={(a) => { lab.setDir(AXIS[a]); if (!lab.ready) lab.reset(); }} />
          {sc !== 'wire' && sc !== 'solenoid' && (
            <ButtonRow>
              <Button onClick={() => { lab.setDir(lab.bVec); if (!lab.ready) lab.reset(); }} title="Aim the velocity along the field">Aim along B</Button>
            </ButtonRow>
          )}
        </Section>
      )}

      <Section title="Field">
        {(sc === 'uniform' || sc === 'selector' || sc === 'loop') && (
          <>
            <Slider label="B" value={lab.B} min={0} max={2} step={0.05} unit="T" color="var(--c-B)" onChange={(v) => (lab.B = v)} />
            <Segmented label="B points" value={lab.bAxis} options={axisOptions} onChange={(a) => (lab.bAxis = a)} />
          </>
        )}
        {sc === 'selector' && (
          <Slider label="E (pointing down, −y)" value={lab.E} min={-4} max={4} step={0.1} unit="V/m" color="var(--c-E)" onChange={(v) => (lab.E = v)} />
        )}
        {sc === 'wire' && (
          <>
            <Slider label="Wire current I (+ is to the right)" value={lab.wireI} min={-10} max={10} step={0.5} unit="MA" color="var(--c-I)"
              onChange={(v) => (lab.wireI = v)} />
            <p className="muted">The current is enormous on purpose, so the path bends on a scale you can see.</p>
          </>
        )}
        {sc === 'solenoid' && (
          <>
            <Slider label="Turns per metre n" value={lab.solN} min={200} max={2000} step={50} unit="/m" onChange={(v) => (lab.solN = v)} />
            <Slider label="Current I" value={lab.solI} min={-1.5} max={1.5} step={0.05} unit="kA" color="var(--c-I)" onChange={(v) => (lab.solI = v)} />
            <Segmented label="Start the particle" value={lab.solInside ? 'in' : 'out'}
              options={[{ value: 'in', label: 'Inside' }, { value: 'out', label: 'Outside' }]} onChange={(v) => lab.setSolInside(v === 'in')} />
            <Readouts>
              <Readout label="B inside = μ₀nI" value={lab.solB} unit="T" color="var(--c-B)" />
            </Readouts>
          </>
        )}
        {sc === 'loop' && (
          <>
            <Slider label="Loop current I" value={lab.loopI} min={0} max={5} step={0.25} unit="A" color="var(--c-I)" onChange={(v) => (lab.loopI = v)} />
            <Segmented label="Current flows (seen from the front)" value={lab.loopCW ? 'cw' : 'ccw'}
              options={[{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Counter-clockwise' }]} onChange={(v) => (lab.loopCW = v === 'cw')} />
          </>
        )}
        <div className="toggles">
          <Toggle label="Field lines" value={lab.showField} onChange={(v) => (lab.showField = v)} />
          {sc !== 'loop' && <Toggle label="v–B plane" value={lab.showPlane} onChange={(v) => (lab.showPlane = v)} />}
        </div>
      </Section>

      {sc !== 'loop' ? (
        <Section title="Right now">
          <Readouts>
            <Readout label="v" value={`${dirName(lab.state.v)}`} color="var(--c-v)" />
            <Readout label="B at the particle" value={info.Bm < 1e-12 ? 'zero' : `${fmt(info.Bm, 3)} T, ${dirName(info.B)}`} color="var(--c-B)" />
            <Readout label="Force F" value={info.zeroForce ? 'zero' : `${fmt(info.Fm, 3)} µN, ${dirName(info.F)}`} color="var(--c-F)" />
            <Readout label="Angle between v and B" value={info.Bm < 1e-12 ? '—' : `${fmt(info.angle, 3)}°`} />
            <Readout label="Radius r = mv⊥/|q|B" value={isFinite(info.radius) ? info.radius : '∞ (straight line)'} unit={isFinite(info.radius) ? 'm' : undefined} />
            <Readout label="Period T = 2πm/|q|B" value={isFinite(info.period) ? info.period : '—'} unit={isFinite(info.period) ? 's' : undefined} />
            <Readout label="Speed" value={info.speed} unit="m/s" color="var(--c-v)" />
            <Readout label="Kinetic energy" value={info.kinetic} unit="µJ" />
            <Readout label="Work done by magnetic force" value={Math.abs(lab.workB) < 1e-9 ? '0' : fmt(lab.workB, 2)} unit="µJ" color="var(--good)" />
            {sc === 'selector' && <Readout label="Work done by electric force" value={lab.workE} unit="µJ" color="var(--c-E)" />}
            {sc === 'selector' && <Readout label="Pass-through speed E/B" value={lab.B > 0 ? Math.abs(lab.E) / lab.B : '—'} unit={lab.B > 0 ? 'm/s' : undefined} />}
          </Readouts>
          <Note title="Right-hand rule">
            <p>
              Point your fingers along <b style={{ color: 'var(--c-v)' }}>v</b> ({dirName(lab.state.v)}), curl them toward{' '}
              <b style={{ color: 'var(--c-B)' }}>B</b> ({info.Bm < 1e-12 ? 'no field here' : dirName(info.B)}). Your thumb gives{' '}
              <Tex>{String.raw`\vec v\times\vec B`}</Tex>
              {len(info.vxB) > 1e-9 ? `: ${dirName(info.vxB)}.` : ', which is zero here.'}
              {len(info.vxB) > 1e-9 && lab.q < 0 && ' The charge is negative, so the force is the opposite way.'}
            </p>
          </Note>
        </Section>
      ) : (
        loop && (
          <Section title="Forces on the loop">
            <Readouts>
              {loop.sides.map((s) => (
                <Readout key={s.name} label={`${s.name[0].toUpperCase()}${s.name.slice(1)} side`}
                  value={len(s.F) < 1e-9 ? 'zero' : `${fmt(len(s.F), 3)} N, ${dirName(s.F)}`} color="var(--c-F)" />
              ))}
              <Readout label="Net force" value={len(loop.net) < 1e-9 ? 'zero' : vecText(loop.net)} unit={len(loop.net) < 1e-9 ? undefined : 'N'} color="var(--good)" />
              <Readout label="Torque" value={len(loop.torque) < 1e-9 ? 'zero' : `${fmt(len(loop.torque), 3)} N·m about ${dirName(loop.torque)}`} />
            </Readouts>
          </Section>
        )
      )}

      <Section title="What to notice">
        {sc === 'uniform' && (
          <>
            <Note>
              <p>
                With v perpendicular to B the particle goes round a circle. The speed never changes, because the force is
                always sideways and does no work. Tilt v partly along B and the circle stretches into a helix.
              </p>
              <p>
                Aim v exactly along B (or against it) and the force disappears: that is the answer to Problem 31. Problem 30
                is the default set-up: v along +x and B along +z give a force along −y for a positive charge.
              </p>
            </Note>
            <Note kind="good" title="Try this">
              Double the speed. The circle doubles in size, but the time to go round stays the same.
            </Note>
          </>
        )}
        {sc === 'selector' && (
          <Note>
            <p>
              Here the electric force qE and the magnetic force qv×B point opposite ways. They cancel only at one speed,
              v = E/B, and a particle with that speed goes straight through. Faster particles curve one way, slower ones
              the other.
            </p>
            <p>Only the electric force changes the kinetic energy. The magnetic work readout stays at zero.</p>
          </Note>
        )}
        {sc === 'wire' && (
          <Note>
            <p>
              The wire's field circles around it and gets weaker with distance, B = μ₀I/2πr. Directly above a wire that
              runs left to right, B points straight out of or into the board. So a particle there feels no force only if it
              moves into or out of the board (Problem 28).
            </p>
            <p>
              Problem 29: a negative charge moving right, below a wire whose current runs left, is pushed toward the wire
              with F = qV₀μ₀(2I)/2πd.
            </p>
          </Note>
        )}
        {sc === 'solenoid' && (
          <Note>
            <p>
              Inside a long solenoid the field is uniform and points along the axis, B = μ₀nI. Outside it is zero. So
              inside, only motion along the axis (±z) is force free, while outside every direction is force free
              (Problem 33).
            </p>
          </Note>
        )}
        {sc === 'loop' && (
          <Note>
            <p>
              Each side of the loop is a straight piece of current, and feels F = I L × B. With the current clockwise and B
              out of the board, the top side is pushed down (Problem 32). All four forces point inward and cancel, so the
              net force on a closed loop in a uniform field is always zero.
            </p>
            <p>Flip the current or the field and every force flips to point outward.</p>
          </Note>
        )}
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\vec F_B = q\,\vec v\times\vec B`}>Magnetic force on a moving charge.</Formula>
        <Formula tex={String.raw`|\vec F_B| = |q|\,|\vec v|\,|\vec B|\sin\phi`}>
          ϕ is the angle between v and B. Zero when they are parallel, largest when perpendicular.
        </Formula>
        {sc === 'loop' && <Formula tex={String.raw`\vec F_B = \int I\,d\vec\ell\times\vec B`}>Force on a current-carrying wire.</Formula>}
        {sc !== 'loop' && (
          <Formula tex={String.raw`|q|vB = \frac{mv^2}{r}\;\Rightarrow\; r = \frac{mv}{|q|B}`}>
            The magnetic force supplies the centripetal force for circular motion.
          </Formula>
        )}
        {sc === 'wire' && <Formula tex={String.raw`B = \frac{\mu_0 I}{2\pi r}`}>Field of a long straight wire, from Ampère's law.</Formula>}
        {sc === 'solenoid' && <Formula tex={String.raw`B = \mu_0 n I`}>Field inside a long solenoid with n turns per metre.</Formula>}
      </Section>
    </LabPage>
  );
}

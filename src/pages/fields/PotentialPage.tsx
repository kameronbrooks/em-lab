import { useEffect, useMemo } from 'react';
import { useRoute } from '../../app/router';
import { fmt } from '../../engine/math';
import { Plot } from '../../engine/plot';
import { Bar, Button, ButtonRow, Formula, Note, Readout, Readouts, Section, Segmented, Slider, Toggle, useLabUI } from '../../ui/controls';
import { LabCanvas } from '../../ui/LabCanvas';
import { LabPage } from '../../ui/LabPage';
import { Mode, PotentialLab } from './potentialLab';

const MODES: { value: Mode; label: string }[] = [
  { value: 'speedup', label: 'Speed up' },
  { value: 'brake', label: 'Slow down' },
  { value: 'ramp', label: 'E = c·x' },
  { value: 'path', label: 'Any path' },
];

export default function PotentialPage() {
  useLabUI(8);
  const lab = useMemo(() => new PotentialLab(), []);
  const plot = useMemo(() => new Plot(lab.plotData), [lab]);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const track = lab.mode !== 'path';
  const K = lab.kinetic, U = lab.potentialEnergy, T = lab.totalEnergy;
  const eMax = Math.max(1e-9, Math.abs(T), Math.abs(lab.q * lab.potentialAt(lab.d)), K);
  const pr = track ? null : lab.pathResult();
  const change = () => {
    lab.reset();
    lab.fitCamera();
  };

  return (
    <LabPage
      lab={lab}
      hint={track ? 'Press Release and watch the energy plot below' : 'Drag the path points and the charges'}
      below={
        <div className="plot-cell" style={{ height: 190 }}>
          <LabCanvas lab={plot} />
        </div>
      }
      toolbar={
        <>
          <Button kind="primary" onClick={() => lab.toggleRun()}>
            {lab.running ? 'Pause' : track ? (lab.done ? 'Run again' : lab.stopX !== null ? 'Continue' : 'Release') : lab.done ? 'Walk again' : 'Walk the path'}
          </Button>
          <Button kind="ghost" onClick={() => lab.reset()}>Reset</Button>
        </>
      }
      intro={
        <p>
          The field does work on a charge as it moves, and that work becomes kinetic energy. Potential V is a
          bookkeeping tool for that work: the field does <b>−qΔV</b> of work no matter which route the charge takes.
        </p>
      }
    >
      <Section title="Scenario">
        <Segmented
          wrap
          value={lab.mode}
          options={MODES}
          onChange={(v) => {
            plot.resetRange();
            lab.setMode(v);
          }}
        />
        {track ? (
          <>
            <Slider label="Charge q" value={lab.q} min={-3} max={3} step={0.25} unit="nC" color={lab.q >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}
              onChange={(v) => { lab.q = v === 0 ? 0.25 : v; change(); }} />
            <Slider label="Mass m" value={lab.m} min={0.25} max={8} log unit="µg" onChange={(v) => { lab.m = v; change(); }} />
            <Slider label={lab.mode === 'ramp' ? 'Slope c in E = c·x' : 'Field strength E'} value={lab.e0} min={0.5} max={15} step={0.5}
              unit={lab.mode === 'ramp' ? 'N/C per m' : 'N/C'} color="var(--c-E)" onChange={(v) => { lab.e0 = v; change(); }} />
            <Slider label="Distance d" value={lab.d} min={1} max={10} step={0.5} unit="m" onChange={(v) => { lab.d = v; change(); }} />
            <Slider label="Starting speed v₀" value={lab.v0} min={0} max={12} step={0.5} unit="m/s" color="var(--c-v)" onChange={(v) => { lab.v0 = v; change(); }} />
          </>
        ) : (
          <div className="toggles">
            <Toggle label="Closed loop" value={lab.closed} onChange={(v) => { lab.closed = v; lab.reset(); }} />
            <Toggle label="Potential map" value={lab.showMap} onChange={(v) => (lab.showMap = v)} />
          </div>
        )}
      </Section>

      {track ? (
        <>
          <Section title="Right now">
            <Readouts>
              <Readout label="Position x" value={lab.x} unit="m" />
              <Readout label="Speed v" value={Math.abs(lab.v)} unit="m/s" color="var(--c-v)" />
              <Readout label="Work done by the field" value={lab.work} unit="nJ" color="var(--c-F)" />
              <Readout label="Potential change ΔV" value={lab.potentialAt(lab.x)} unit="V" color="var(--c-V)" />
            </Readouts>
            <Bar label="Kinetic" value={K} max={eMax} color="var(--c-v)" text={`${fmt(K, 3)} nJ`} />
            <Bar label="Potential qV" value={U} max={eMax} color="var(--c-V)" text={`${fmt(U, 3)} nJ`} />
            <Bar label="Total" value={K + U} max={eMax} color="var(--text-2)" text={`${fmt(K + U, 3)} nJ`} />
          </Section>
          <Section title="Prediction from energy">
            {lab.mode === 'brake' ? (
              <>
                <Readouts>
                  <Readout label="Stopping distance m v₀² / (2qE)" value={lab.predictedStop} unit="m" color="var(--warn)" />
                  <Readout label="Where it actually stopped" value={lab.stopX === null ? '—' : `${fmt(lab.stopX, 3)} m`} />
                </Readouts>
                <Note>
                  Problem 20. All the kinetic energy has to be taken away by the field: qEx = ½mv₀², so x = mv₀²/(2qE).
                  If that is longer than d, the charge makes it across.
                </Note>
              </>
            ) : (
              <>
                <Readouts>
                  <Readout label="Speed at the far plate" value={lab.predictedSpeed} unit="m/s" color="var(--c-v)" />
                  <Readout label="Potential difference" value={Math.abs(lab.potentialAt(lab.d))} unit="V" color="var(--c-V)" />
                  <Readout label="Kinetic energy gained q|ΔV|" value={-lab.q * lab.potentialAt(lab.d)} unit="nJ" />
                </Readouts>
                {lab.mode === 'ramp' ? (
                  <Note>
                    Problem 22. The force is not constant, so W = ∫qcx dx = qcd²/2. Set that equal to ½mv² and solve
                    for v.
                  </Note>
                ) : (
                  <Note>
                    Problems 3, 7, 14 and 18. W = qEd = ½mv², so v = √(2qEd/m), and the potential difference is
                    just Ed. Turned around: d = mv₀²/(2qE) and E = W/(qd). With a starting speed (Problem 19),
                    ½mv₀² + q|ΔV| = ½mv².
                  </Note>
                )}
              </>
            )}
            {!isFinite(lab.predictedSpeed) && lab.mode !== 'brake' && (
              <Note kind="warn">With this sign of charge the field pushes it back, so it never reaches the far plate.</Note>
            )}
          </Section>
        </>
      ) : (
        pr && (
          <Section title="Line integral">
            <Readouts>
              <Readout label={lab.closed ? '∮ E·dr around the loop' : '∫ E·dr from A to B'} value={Math.abs(pr.total) < 5e-3 ? 0 : pr.total} unit="V" color="var(--c-E)" />
              {!lab.closed && <Readout label="V(A)" value={pr.va} unit="V" color="var(--c-V)" />}
              {!lab.closed && <Readout label="V(B)" value={pr.vb} unit="V" color="var(--c-V)" />}
              {!lab.closed && <Readout label="V(A) − V(B)" value={pr.drop} unit="V" color="var(--c-V)" />}
            </Readouts>
            <Note kind="good" title="Try this">
              Drag the middle points anywhere. Each leg’s number changes, but the total from A to B never does: it
              always equals V(A) − V(B). Then switch on “Closed loop”: you come back to the same potential, so the
              total is zero.
            </Note>
            <Note>
              Moving along an equipotential line (purple) costs nothing, because the field is perpendicular to it.
              Only movement up or down the “hill” counts.
            </Note>
          </Section>
        )
      )}

      <Section title="Formulas">
        <Formula tex={String.raw`W \equiv \int \vec F\cdot d\vec r \qquad W = \Delta K \qquad K \equiv \tfrac12 m v^2`}>
          Work–kinetic energy theorem.
        </Formula>
        <Formula tex={String.raw`\Delta V \equiv -\int \vec E\cdot d\vec r`}>Potential difference: work per unit charge, with a minus sign.</Formula>
        <Formula tex={String.raw`\oint \vec E\cdot d\vec r = 0 \quad\text{(static charges)}`}>Around any closed path the electrostatic field does no net work.</Formula>
      </Section>
    </LabPage>
  );
}

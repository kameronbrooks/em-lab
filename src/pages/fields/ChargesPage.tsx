import { useEffect, useMemo } from 'react';
import { useRoute } from '../../app/router';
import { Bar, Button, ButtonRow, Formula, Note, Readout, Readouts, Section, Select, Slider, Toggle, useLabUI } from '../../ui/controls';
import { LabPage } from '../../ui/LabPage';
import { ChargeLab } from './chargeLab';

const PRESETS = [
  { value: 'dipole', label: 'Dipole (+ and −)' },
  { value: 'single', label: 'Single positive charge' },
  { value: 'negative', label: 'Single negative charge' },
  { value: 'like', label: 'Two positive charges' },
  { value: 'unequal', label: 'Unequal: +4 and −1' },
  { value: 'quad', label: 'Quadrupole' },
  { value: 'plates', label: 'Parallel plates (rows of charges)' },
  { value: 'p1', label: 'Problem 1: q at (−3, 8)' },
];

export default function ChargesPage() {
  useLabUI();
  const lab = useMemo(() => new ChargeLab(), []);
  const route = useRoute();
  useEffect(() => {
    if (route.query.preset) lab.preset(route.query.preset);
  }, [lab, route.query.preset]);

  const p = lab.probe();
  const t = lab.test;
  const sel = lab.selected;
  const total = p.kinetic + p.potentialEnergy;
  const eMax = Math.max(1e-9, Math.abs(p.kinetic), Math.abs(p.potentialEnergy), Math.abs(total));

  return (
    <LabPage
      lab={lab}
      hint="Drag charges and the green test charge · drag empty space to pan · scroll to zoom"
      toolbar={
        <>
          <Button kind="ghost" onClick={() => lab.add(2)}>
            <span style={{ color: 'var(--c-pos)' }}>＋</span> Add positive
          </Button>
          <Button kind="ghost" onClick={() => lab.add(-2)}>
            <span style={{ color: 'var(--c-neg)' }}>－</span> Add negative
          </Button>
          <Button kind="ghost" onClick={() => lab.clear()}>
            Clear
          </Button>
        </>
      }
      intro={
        <p>
          Every charge fills space with an electric field. A positive charge pushes a positive test charge away, a
          negative one pulls it in, and the fields of several charges simply add as vectors.
        </p>
      }
    >
      <Section title="Scene">
        <Select label="Start from" value={'' as string} options={[{ value: '', label: 'Choose a setup…' }, ...PRESETS]} onChange={(v) => v && lab.preset(v)} />
        {sel ? (
          <>
            <Slider label="Selected charge q" value={sel.q} min={-5} max={5} step={0.5} unit="nC"
              onChange={(v) => (sel.q = v === 0 ? 0.5 : v)} color={sel.q >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'} />
            <Slider label="x" value={sel.x} min={-10} max={10} step={0.1} unit="m" onChange={(v) => (sel.x = v)} />
            <Slider label="y" value={sel.y} min={-10} max={10} step={0.1} unit="m" onChange={(v) => (sel.y = v)} />
            <ButtonRow>
              <Button kind="danger" onClick={() => lab.remove(sel)}>Delete charge</Button>
            </ButtonRow>
          </>
        ) : (
          <p className="muted">Click a charge to change its size or sign.</p>
        )}
      </Section>

      <Section title="Show">
        <div className="toggles">
          <Toggle label="Field arrows" value={lab.showVectors} onChange={(v) => (lab.showVectors = v)} />
          <Toggle label="Field lines" value={lab.showLines} onChange={(v) => (lab.showLines = v)} />
          <Toggle label="Potential map" value={lab.showPotential} onChange={(v) => (lab.showPotential = v)} />
          <Toggle label="Equipotentials" value={lab.showEquip} onChange={(v) => (lab.showEquip = v)} />
          <Toggle label="Flow" value={lab.showFlow} onChange={(v) => (lab.showFlow = v)} />
          <Toggle label="Each charge's E" value={lab.showContrib} onChange={(v) => (lab.showContrib = v)} />
        </div>
      </Section>

      <Section title="Test charge">
        <Toggle label="Show test charge" value={t.on} onChange={(v) => (t.on = v)} />
        {t.on && (
          <>
            <Slider label="Test charge q₀" value={t.q} min={-3} max={3} step={0.25} unit="nC" color="var(--c-v)"
              onChange={(v) => (t.q = v === 0 ? 0.25 : v)} />
            <Slider label="Mass" value={t.m} min={0.2} max={10} log unit="µg" onChange={(v) => (t.m = v)} />
            <ButtonRow>
              <Button kind="primary" onClick={() => lab.release()}>{t.released ? 'Pause' : 'Release'}</Button>
              <Button onClick={() => lab.resetTest()}>Put back</Button>
            </ButtonRow>
            <Readouts>
              <Readout label="E at test charge" value={`(${fmtv(p.ex)}, ${fmtv(p.ey)})`} unit="N/C" color="var(--c-E)" />
              <Readout label="|E|" value={p.e} unit="N/C" color="var(--c-E)" />
              <Readout label="Force F = q₀E" value={`(${fmtv(p.fx)}, ${fmtv(p.fy)})`} unit="nN" color="var(--c-F)" />
              <Readout label="Potential V" value={p.v} unit="V" color="var(--c-V)" />
              <Readout label="Speed" value={p.speed} unit="m/s" color="var(--c-v)" />
            </Readouts>
            <Bar label="Kinetic" value={p.kinetic} max={eMax} color="var(--c-v)" text={`${fmtv(p.kinetic)} nJ`} />
            <Bar label="Potential q₀V" value={p.potentialEnergy} max={eMax} color="var(--c-V)" text={`${fmtv(p.potentialEnergy)} nJ`} />
            <Bar label="Total" value={total} max={eMax} color="var(--text-2)" text={`${fmtv(total)} nJ`} />
          </>
        )}
      </Section>

      <Section title="What to notice">
        <Note>
          <p>
            The yellow arrow is the field <b>E</b> at the test charge. The thin red and blue arrows are what each
            charge contributes on its own. They always add tip to tail to give the yellow one.
          </p>
          <p>
            The pink arrow is the force. Make q₀ negative and it flips, but the field does not: the field belongs to
            the source charges, not to the test charge.
          </p>
        </Note>
        <Note kind="good" title="Try this">
          Release the test charge and watch the bars. Kinetic energy goes up exactly as much as q₀V goes down, so
          the total stays flat.
        </Note>
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\vec F_e = \frac{1}{4\pi\epsilon_0}\frac{q_1 q_2}{r^2}\,\hat r`}>Force between two point charges.</Formula>
        <Formula tex={String.raw`\vec F_e = q\vec E`}>The field is force per unit charge.</Formula>
        <Formula tex={String.raw`\vec E = \frac{1}{4\pi\epsilon_0}\sum_i \frac{q_i}{r_i^2}\,\hat r_i`}>
          Add the field of every charge as vectors.
        </Formula>
      </Section>
    </LabPage>
  );
}

function fmtv(x: number): string {
  if (Math.abs(x) < 5e-4) return '0';
  const a = Math.abs(x);
  return (a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : x.toFixed(2)).replace('-', '−');
}

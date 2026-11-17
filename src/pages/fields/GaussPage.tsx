import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../app/router';
import { fmt } from '../../engine/math';
import { FLUX_UNIT } from '../../physics/flux';
import { Bar, Button, ButtonRow, Formula, Note, Readout, Readouts, Section, Segmented, Select, Slider, Toggle, useLabUI } from '../../ui/controls';
import { LabPage } from '../../ui/LabPage';
import { GaussLab, SourceType, SurfaceType } from './gaussLab';

const PRESETS: { value: string; label: string; note: string }[] = [
  { value: 'p12', label: 'Problem 12: charge at the centre of a cube', note: 'By symmetry each of the six faces gets the same share, so one face carries Q/(6ε₀). Check the face list below.' },
  { value: 'p5', label: 'Problem 5: charge outside a sphere', note: 'Every field line that enters the sphere also leaves it. Blue (inward) and red (outward) patches cancel exactly, so the flux is zero.' },
  { value: 'p13', label: 'Problem 13: charge at the origin, try each surface', note: 'A closed surface around the charge always gives q/ε₀. A closed surface that leaves it outside gives zero. Open surfaces (disc, square) give something in between unless the field only skims along them.' },
  { value: 'p15', label: 'Problems 15 and 16: 2q and −q in a cube', note: 'Net enclosed charge is 2q − q = q, so the flux is q/ε₀. For Problem 16, add a −1 nC charge anywhere inside (or drag one of the charges out) and watch it drop to zero.' },
  { value: 'p17', label: 'Problem 17: Q and six charges of −Q/6', note: 'Drag the six small charges anywhere inside the cube. The flux stays zero because only the total enclosed charge matters, not where it sits.' },
  { value: 'p6', label: 'Problem 6: tilted cube in a uniform field', note: 'There is no charge inside, so whatever flows in through some faces flows out through others. Tilt it any way you like: the total stays zero.' },
  { value: 'p21', label: 'Problem 21: hemisphere in a uniform field', note: 'The flux through the dome equals the flux through its flat circular base, πR²E, and that is the largest it can be: when the base faces the field head on. Tilt the dome to see it shrink.' },
  { value: 'p9', label: 'Problem 9: sphere above a charged plane', note: 'The sphere encloses none of the plane’s charge, so the flux is zero even though a strong field passes straight through it.' },
  { value: 'p2', label: 'Problem 2: cylinder around a line of charge', note: 'Only the curved side carries flux; the field is parallel to the end caps. That is why E·(2πrL) = q_enc/ε₀ gives E so easily.' },
  { value: 'p4', label: 'Problem 4: Gaussian sphere inside a solid sphere', note: 'Shrink and grow the Gaussian sphere. Inside the charge it encloses only the fraction r³/d³ of Q₀. Outside it encloses all of it.' },
  { value: 'p11', label: 'Problems 8 and 11: spherical shell', note: 'A Gaussian sphere smaller than the shell encloses nothing, so E = 0 inside. Make it bigger than the shell and it encloses everything.' },
];

const SOURCES: { value: SourceType; label: string }[] = [
  { value: 'points', label: 'Point charges' },
  { value: 'uniform', label: 'Uniform field' },
  { value: 'plane', label: 'Plane' },
  { value: 'line', label: 'Line' },
  { value: 'shell', label: 'Shell' },
  { value: 'solid', label: 'Solid sphere' },
];

const SURFACES: { value: SurfaceType; label: string }[] = [
  { value: 'sphere', label: 'Sphere' },
  { value: 'cube', label: 'Cube' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'hemisphere', label: 'Dome' },
  { value: 'disc', label: 'Disc' },
  { value: 'square', label: 'Square' },
];

const STRENGTH: Record<SourceType, { label: string; unit: string; min: number; max: number } | null> = {
  points: null,
  uniform: { label: 'Field strength E', unit: 'N/C', min: -10, max: 10 },
  plane: { label: 'Surface charge σ', unit: 'nC/m²', min: -3, max: 3 },
  line: { label: 'Line charge λ', unit: 'nC/m', min: -3, max: 3 },
  shell: { label: 'Total charge Q', unit: 'nC', min: -8, max: 8 },
  solid: { label: 'Total charge Q₀', unit: 'nC', min: -8, max: 8 },
};

const deg = (r: number) => `${Math.round((r * 180) / Math.PI)}°`;

export default function GaussPage() {
  useLabUI();
  const lab = useMemo(() => new GaussLab(), []);
  const route = useRoute();
  const [preset, setPreset] = useState('p12');
  useEffect(() => {
    const p = route.query.preset;
    if (p) {
      lab.preset(p);
      setPreset(PRESETS.some((x) => x.value === p) ? p : p === 'p16' ? 'p15' : p === 'p8' ? 'p11' : '');
    }
  }, [lab, route.query.preset]);

  const s = lab.surf;
  const sel = lab.selected;
  const st = STRENGTH[lab.source];
  const units = lab.flux / FLUX_UNIT;
  const encUnits = lab.qEnc;
  const faceMax = Math.max(1e-9, ...lab.faceFlux.map((f) => Math.abs(f)));
  const note = PRESETS.find((p) => p.value === preset)?.note;
  const z = (x: number) => (Math.abs(x) < 5e-4 ? 0 : x);

  return (
    <LabPage
      lab={lab}
      hint="Drag the white dot to move the surface · drag charges · drag empty space to orbit · scroll to zoom"
      toolbar={
        lab.source === 'points' ? (
          <>
            <Button kind="ghost" onClick={() => lab.addPoint(1)}>
              <span style={{ color: 'var(--c-pos)' }}>＋</span> Add positive
            </Button>
            <Button kind="ghost" onClick={() => lab.addPoint(-1)}>
              <span style={{ color: 'var(--c-neg)' }}>－</span> Add negative
            </Button>
          </>
        ) : undefined
      }
      intro={
        <p>
          Flux counts how much field passes through a surface. For a <b>closed</b> surface the total depends on one
          thing only: the charge inside. Red patches are field leaving, blue patches are field entering.
        </p>
      }
    >
      <Section title="Setup">
        <Select
          label="Start from a problem"
          value={preset}
          options={[{ value: '', label: 'Custom' }, ...PRESETS.map((p) => ({ value: p.value, label: p.label }))]}
          onChange={(v) => {
            setPreset(v);
            if (v) lab.preset(v);
          }}
        />
        {note && <Note kind="good">{note}</Note>}
        <Segmented
          label="Source of the field"
          wrap
          value={lab.source}
          options={SOURCES}
          onChange={(v) => {
            lab.setSource(v);
            setPreset('');
          }}
        />
        {st && (
          <Slider label={st.label} value={lab.strength} min={st.min} max={st.max} step={0.25} unit={st.unit} onChange={(v) => (lab.strength = v)} />
        )}
        {(lab.source === 'shell' || lab.source === 'solid') && (
          <Slider label="Radius of the charged sphere" value={lab.sourceR} min={0.8} max={3.5} step={0.1} unit="m" onChange={(v) => (lab.sourceR = v)} />
        )}
        {lab.source === 'points' &&
          (sel ? (
            <>
              <Slider label="Selected charge" value={sel.q} min={-5} max={5} step={0.5} unit="nC" color={sel.q >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}
                onChange={(v) => (sel.q = v === 0 ? 0.5 : v)} />
              <ButtonRow>
                <Button kind="danger" onClick={() => lab.removePoint(sel)}>Delete charge</Button>
              </ButtonRow>
            </>
          ) : (
            <p className="muted">Click a charge to change it. Drag charges in and out of the surface.</p>
          ))}
      </Section>

      <Section title="Surface">
        <Segmented wrap value={s.type} options={SURFACES} onChange={(v) => lab.setSurface(v)} />
        <Slider label={s.type === 'cube' || s.type === 'square' ? 'Half-width' : 'Radius'} value={s.size} min={0.3} max={5} step={0.05} unit="m" onChange={(v) => (s.size = v)} />
        {s.type === 'cylinder' && <Slider label="Length" value={s.length} min={0.5} max={10} step={0.1} unit="m" onChange={(v) => (s.length = v)} />}
        <Slider label="Tilt" value={s.tiltX} min={-Math.PI} max={Math.PI} step={Math.PI / 36} format={deg} onChange={(v) => (s.tiltX = v)} />
        <Slider label="Tilt (other axis)" value={s.tiltZ} min={-Math.PI} max={Math.PI} step={Math.PI / 36} format={deg} onChange={(v) => (s.tiltZ = v)} />
        <ButtonRow>
          <Button onClick={() => lab.centre()}>Centre on origin</Button>
          <Button onClick={() => { s.tiltX = 0; s.tiltZ = 0; }}>Remove tilt</Button>
        </ButtonRow>
      </Section>

      <Section title="Flux">
        <Readouts>
          <Readout label="Flux through the surface" value={z(lab.flux)} unit="N·m²/C" color="var(--c-E)" />
          <Readout label="Same, in units of q/ε₀" value={z(units)} color="var(--c-E)" />
          {lab.closed ? (
            <>
              <Readout label="Charge enclosed" value={`${fmt(z(encUnits), 3)} q`} />
              <Readout label="q_enc / ε₀" value={z(encUnits * FLUX_UNIT)} unit="N·m²/C" />
            </>
          ) : (
            <Readout label="Charge enclosed" value="open surface" />
          )}
        </Readouts>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Here q means 1 nC, so q/ε₀ = {fmt(FLUX_UNIT, 4)} N·m²/C.
        </p>
        {lab.closed ? (
          <Note kind={Math.abs(units - encUnits) < 0.02 * Math.max(1, Math.abs(encUnits)) ? 'good' : 'warn'}>
            The surface integral gives <b>{fmt(z(units), 3)} q/ε₀</b> and the enclosed charge is{' '}
            <b>{fmt(z(encUnits), 3)} q</b>.{' '}
            {Math.abs(units - encUnits) < 0.02 * Math.max(1, Math.abs(encUnits))
              ? 'They match wherever you put the surface.'
              : 'They differ only because a charge is sitting right on the surface, half in and half out.'}
          </Note>
        ) : (
          <Note>
            An open surface has no “inside”, so Gauss’s law does not apply. The flux is just E·A·cos θ added up over
            the surface, and it changes when you tilt it.
          </Note>
        )}
        {lab.faceNames.length > 1 &&
          lab.faceNames.map((name, i) => (
            <Bar
              key={name}
              label={name}
              value={lab.faceFlux[i] ?? 0}
              max={faceMax}
              color={(lab.faceFlux[i] ?? 0) >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'}
              text={`${fmt(z((lab.faceFlux[i] ?? 0) / FLUX_UNIT), 3)}`}
            />
          ))}
        {lab.faceNames.length > 1 && <p className="muted" style={{ fontSize: 12.5 }}>Flux through each part, in units of q/ε₀.</p>}
      </Section>

      <Section title="Show">
        <div className="toggles">
          <Toggle label="Flux colours" value={lab.showColors} onChange={(v) => (lab.showColors = v)} />
          <Toggle label="Field on surface" value={lab.showArrows} onChange={(v) => (lab.showArrows = v)} />
          <Toggle label="Field lines" value={lab.showLines} onChange={(v) => (lab.showLines = v)} />
        </div>
      </Section>

      <Section title="Formulas">
        <Formula tex={String.raw`\phi_E = \int \vec E\cdot d\vec a`}>Flux: field through a surface, counting only the part along the normal.</Formula>
        <Formula tex={String.raw`\oint \vec E\cdot d\vec a = \frac{q_{enc.}}{\epsilon_0}`}>
          Gauss’s law: for any closed surface, total flux equals enclosed charge over ε₀.
        </Formula>
        <Formula tex={String.raw`q = \lambda \ell = \sigma A = \rho V`}>How to get the enclosed charge for lines, surfaces and volumes.</Formula>
      </Section>
    </LabPage>
  );
}

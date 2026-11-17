# E&M Lab

Interactive study platform for PHYS 2212 (Electricity & Magnetism). Every topic in the course playlist has a lab you
can touch, plus a LaTeX solver, the course formula sheet, and the 65 additional practice problems with worked
solutions.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

Other commands:

```bash
npm test          # physics and maths unit tests (Vitest)
npm run typecheck # TypeScript only
npm run build     # type-check, then build the static site into dist/
```

## Deploy to Vercel

The app is a static site, so no server is needed.

1. Push this folder to a GitHub repository.
2. In Vercel choose **Add New → Project**, import the repository, and accept the detected settings
   (framework: Vite, build command: `npm run build`, output directory: `dist`). `vercel.json` already states these.

Or from this folder with the Vercel CLI: `npx vercel` for a preview, `npx vercel --prod` for production.

Routes use the URL hash (`/#/fields/gauss`), so no rewrite rules are needed on any static host.

## What is where

```
src/
  engine/    Our own WebGL2 renderer (no three.js): cameras, instanced lines, arrows, discs,
             meshes, DOM label overlay, plots, and the Lab base classes.
  physics/   Pure simulation code with unit tests: fields, flux, magnetism, induction,
             circuits (modified nodal analysis), waves.
  mathlab/   LaTeX parsing, evaluation, solving and answer checking.
  content/   The playlist (84 videos), the formula sheet, and the 65 problems.
  pages/     One folder per area: fields, circuits, waves, solver, practice.
  ui/        Shared controls and the lab page layout.
  app/       Shell, hash router, and the page registry.
```

### Adding a lab

1. Write a class extending `Lab2D` or `Lab3D` (`src/engine/lab.ts`). Create GL resources in `init()`, advance the
   simulation in `update(dt)`, draw in `draw()` using `this.r` (`seg`, `arrow`, `disc`, `mesh`, `label`).
2. Write a page component that calls `useLabUI()` and renders `<LabPage lab={lab}>` with controls from
   `src/ui/controls.tsx`.
3. Register it in `src/app/registry.ts`.

Conventions: positive charge red, negative blue, electric field amber, magnetic field teal, velocity green, force
pink, current yellow, potential purple.

# Future work / out of scope

This repo isn't connected to GitHub yet (no remote, so no way to file real
GitHub Issues from here). These are the items the v1.1.0 build brief
explicitly called out as out of scope, logged here instead so they don't
get lost — move each one to a proper GitHub Issue (title + one-sentence
description, `future` label) once the repo has a remote.

- **Full postcode-based Vb,map lookup for Wind Pressure.** The UK NA.1
  dataset is 900k+ rows — unsuitable for a static site with no backend.
  `wind-pressure-ec1.js` takes Vb,map as a manual entry from the NA.1 map
  instead.
- **Plate Load Test brief generator.** Needs a docx-generation library —
  a different pattern from every other calc here (which just render an
  HTML print sheet), so it doesn't fit this toolkit's "one JS file, one
  registry line" model without a bigger architectural change.
- **Track Mat Analysis.** Needs proprietary SignaRoad (or equivalent)
  performance data that hasn't been obtained — nothing to calculate
  against yet.
- **Crane Pad EKKI Mats double-skinned check.** A composite deflection
  calculation — larger scope than a single-pass addition; needs its own
  design pass.
- **Unified Crane Platform (EC7).** A composite of several existing/future
  calcs (piling mat + a crane-outrigger sub-calc + bearing + settlement)
  — better built as an explicit "workflow" that chains the individual
  calcs' outputs (piping values between them, extending the `_pipe`
  pattern already in use for Wind Pressure → Heras Fencing) than as a
  single monolithic calc.

## Also worth knowing about (not blocking, but flagged during the build)

- **Wind Pressure's exposure factor ce(z) is a documented approximation**,
  not a digitisation of UK NA Figures NA.7/NA.8 as the brief asked for —
  see the header comment in `calcs/wind-pressure-ec1.js`. Reproducing a
  copyrighted chart's pixel values from memory isn't something that could
  be done reliably, so this tool instead evaluates the underlying
  EN1991-1-4 §4.3 roughness/turbulence formulas with an approximated
  terrain roughness length. It can diverge materially from the real
  charts, especially at low height in town terrain. Replacing this with a
  genuine NA.7/NA.8 digitisation (or a full Annex A.3 terrain-transition
  calculation) is real follow-up work, not a nice-to-have — Heras Fencing
  can consume this value directly via the `_pipe` handoff.
- **`js/shared-data.js`'s `TIMBER_SECTIONS` list** reads the brief's
  "38x100..225"-style shorthand as literal 25 mm steps; it hasn't been
  checked against Beaver Bridges' actual timber supplier stock list.
  Nothing currently imports it (no timber-design calc has been built yet)
  — worth a proper check before the first calc that does.
- **`cseason` (seasonal wind factor) table** in `wind-pressure-ec1.js` is
  a placeholder, not BB's actual DATA SHEET table (not available to this
  build) — fine as long as `durationMonths` stays `'Not seasonal'`
  (the default), but flag it before running a seasonal case for real.

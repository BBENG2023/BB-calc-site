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
- **Pile cap design (strut-and-tie, BS EN 1992-1-1 §6.5, §9.8.1).** Next
  pass. Source sheet is password-protected; method will be deduced.
- **Pile group block failure, tension and lateral capacity.** Not covered
  by `pile-axial-ec7` (single pile, compression only).
- **Standalone stress distribution page.** `boussinesqRect` and `spread21`
  exist in `js/geo-core.js`; a page can be added if wanted.
- **Password-protected source sheets.** distrib, H-piles via SPT, Pile Cap
  (truss), settle, Settlement and both BRE 470 piling mat copies. Deduced
  calcs should be checked against them once the passwords are found.
- **BS 9295:2020 Table 2 allowable surcharge values.** Entered manually in
  `crane-outrigger-mats` until checked against the published standard.
- **Aluminium track mat supplier data.** MRd, VRd and EI per metre must be
  entered per job; no supplier library yet.

(Done in v1.5.0: PLT brief, Track Mat, EKKI mats and Unified Crane
Platform — all merged into `crane-outrigger-mats`.)

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

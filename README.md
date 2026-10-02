# Beaver Bridges — Engineering Toolkit

A static website hosting a growing library of engineering design
calculation tools for the internal engineering team at Beaver Bridges Ltd.

Plain HTML + CSS + vanilla JavaScript (ES modules). No build step, no
framework, no server, no database. Deploys straight to GitHub Pages.

> **Every output from this toolkit is advisory and must be independently
> verified and signed off by a Chartered Engineer (CEng MICE / MIStructE)
> before use in tender, fabrication, or construction.** All designs must be
> checked against the current Eurocodes with UK National Annexes and the
> applicable DMRB / Network Rail / client-specific standards. CDM 2015
> design responsibilities apply.

## Who this is for

Beaver Bridges engineers deriving design calculation information for
substructure, geotechnical and temporary works elements — quick,
consistent, checkable working. Every calculation must be independently
reviewed and signed off by a Chartered Engineer before it is accepted.

## Running locally

No install required. Either:

- Double-click `index.html` to open it directly in a browser, or
- Serve it locally (recommended, avoids any browser file:// restrictions
  on ES modules in some browsers):

  ```
  npx serve .
  ```

  then open the printed local URL.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a
   branch**.
4. Under **Branch**, choose `main` and folder `/ (root)`, then **Save**.
5. GitHub Pages will build and publish the site at
   `https://<owner>.github.io/<repo-name>/` within a few minutes (the
   owner/repo-name placeholders in this README and in the site footer need
   filling in once the repo exists).

No GitHub Actions workflow is needed — Pages serves the static files
directly from the branch root.

### Why `.nojekyll`

GitHub Pages runs files through Jekyll by default, which ignores any file
or folder starting with an underscore (for example `/calcs/_template.js`).
The empty `.nojekyll` file at the repo root disables Jekyll processing so
every file is served as-is.

## Adding a new calculation

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full calc module contract.
In short:

1. Copy `/calcs/_template.js` to `/calcs/my-new-calc.js`.
2. Fill in the metadata, `inputs`, and `calculate()`.
3. Import and register it with one line in `/js/registry.js`.

No changes to layout, routing, or CSS are needed.

## Validating a calculation change

Open `test.html` (not linked from the navigation) in a browser after
changing any `calculate()` function — or click its **Run all tests**
button. It runs every registered calc's `validation.samples` against its
own logic and reports pass/fail per calc, plus an overall summary. This
matters especially after touching `js/shared-data.js`, since several
calcs share it (see [CONTRIBUTING.md](CONTRIBUTING.md)). From the command
line, `node tools/run-tests.mjs` runs the same samples (Node 22+).

## Cross-calc handoff and the print header

- A field on one calc can pull its value straight from another calc's
  headline result (for example, Heras Fencing's wind pressure input can
  be filled from the Wind Pressure calc) — see the `_pipe` pattern in
  [CONTRIBUTING.md](CONTRIBUTING.md).
- The printed calc sheet's header (project no., title, sheet no., date,
  engineer, checked category) is editable from a "Header details" panel
  above the report preview on every calc page, and persists in the
  browser's `localStorage` across calcs so it doesn't need retyping for
  every sheet in a job.

## Future work

Items explicitly out of scope for the current pass, and a couple of
known approximations worth knowing about before relying on them, are
tracked in [FUTURE.md](FUTURE.md) — move them to real GitHub Issues once
this repo has a remote to file them against.

## Changelog

- **v1.4.2** — Legato abutment designer: nib interlock fixed to the BB
  basis, CLP Structures calc 302 for Elite (21.4 kN per nib, half
  effective); Elite's 32 kN sheet removed. BCB bearing layout taken from
  BB200-CALC-700-001 §3.1 (bearing span = L − 0.355 m, one bearing per
  1.5 m deck unit).
- **v1.4.1** — Legato abutment designer: **nib interlock relied on by
  default**, with a selectable basis — CLP Structures calc 302 for Elite
  (21.4 kN per nib, half effective; default), Elite shear force sheet (32 kN
  per nock, γ = 1.5 by BB), EC2 BB judgement or user-defined — counted at SLS
  and ULS for male nibs under a block above. Standard bridges gain a
  **loading required** option (CS 454 / CS 454 + SV-80 / CS 454 + SV-80
  DAF + OF for SSVB; BCB and Waagner-Biro equivalents); with CS 454 only,
  braking = 0.5 × CS 454 R per the SSVB method. SSVB plain SV-80 reactions
  added.
- **v1.4.0** — Legato abutment designer simplified after trial use.
  **Standard bridge loads built in** (`js/bridge-library.js`): pick SSVB
  (BB200-01-RP-200-001 P03 §7, 4–12 m), BCB (BB200-CALC-700-001 P01
  load table, 1.5–4.0 m × 1.5–6.0 m) or Waagner-Biro panel bridge
  (T18-41-548-02-201 rev 00, 12.192–60.96 m) and a span/width — the
  characteristic reactions, vehicle models, bearings, span and "both
  ends fixed" are filled in and printed with their source. Bespoke loads
  remain available, and editing standard loads is flagged on the report.
  **Simple borehole entry**: depth, soil and SPT N exactly as on the log
  (refusals such as 50/75 accepted); strata are built automatically and
  the detailed strata/lab entry is still available per borehole.
  Rarely used inputs (construction, hydraulic, accidental actions,
  correlation choices, overrides, manual profile, bridge geometry when a
  standard bridge is selected) are collapsed. Anchor edge-distance (L2)
  is reported as a detailing flag rather than driving the governing
  utilisation.
- **v1.3.0** — Added calc 11, **Bridge Abutment — Legato Interlocking
  Block (Bank Seat)**, in a new catalogue category *Bridge Substructures —
  Precast Block Abutments*. Designs and checks dry-laid Elite Legato bank
  seats for single-span bridges: both ends in one design file; ground model
  from SPT boreholes (parser, energy and overburden corrections,
  correlations, characteristic values); EC7 DA1 + EQU external, internal
  and local checks with legacy FoS alongside; Bishop overall stability;
  Burland & Burbidge and consolidation settlement; crossing checks (setback,
  scour, freeboard, regulatory buffer, span feedback); auto-sizing with a
  "why this size" reason; drawings D1–D6; block schedule, levels and slope
  geometry exports; specification clauses, designer's risk assessment and a
  PLT requirement; an 18-section design sheet with "Sheet x of y". Runner
  extensions (backwards-compatible): `customUI` / `renderResults` /
  `buildReport` hooks, a generic `table` input type, tab grouping, per-calc
  debounce, JSON design files, A3 drawing sheets. New shared modules
  `js/geo-core.js`, `js/svg-kit.js`, `js/file-io.js`, `js/table-input.js`,
  `js/tabs.js`. Validation samples V1–V6 plus unit tests; run
  `node tools/run-tests.mjs` or open `test.html`. Method statement for the
  checker: `docs/legato-abutment-method.md`; deferred items:
  `docs/legato-abutment-deferred.md`.
- **v1.2.0** — Every calc now has a live, parametric "Definition diagram"
  (all ten calcs, up from four). Split the combined piling mat/crane
  platform calc into two separate calcs — **Piling Mat Design to BRE
  470** and **Crane Pad Design to BRE 470** — each with its own plant
  identification fields (rig/crane make-model, mass or capacity, mast
  height or boom length/angle) and a diagram showing that specific piece
  of plant (piling rig or crane) sitting on the platform. The shared BRE
  470 punching-shear computation moved to `js/bre470-platform.js` so the
  two calcs can't drift apart. Added a `text` input type to the form
  generator (for the new plant-description fields). Replaced the real
  Beaver Bridges logo (was a placeholder). Corrected the site's framing:
  this toolkit produces design calculation information for direct
  engineering use, not "concept optioneering only" sketches — every
  output still requires independent review and sign-off by a Chartered
  Engineer before acceptance, which hasn't changed and isn't optional.
- **v1.1.0** — Added `js/shared-data.js` (shared engineering data/formula
  module); refactored `bearing-capacity.js` to source its bearing
  capacity factors from it (validated unchanged). Redesigned the printed
  calc-sheet header to Beaver Bridges' house style (company block, project
  block, editable + `localStorage`-persisted). Added five calcs: Haul Road
  / Ramped HGV Access Design, Piling Mat / Crane Platform Design (BRE
  470), Wind Pressure (BS EN 1991-1-4), Heras Fencing — Wind Load &
  Stability, Service Protection Slab. Added the `_pipe` cross-calc value
  handoff pattern (Wind Pressure → Heras Fencing). Landing page now shows
  a live "N calculation tools available" count across 8 categories.
  Replaced the placeholder logo with the real Beaver Bridges wordmark.
  `test.html` gained a "Run all tests" button and an overall pass/fail
  summary line. Several of this pass's calcs ship with **self-consistency
  validation baselines rather than externally-verified figures** — see
  each calc's `assumptions` and its validation sample's `name` for exactly
  which, and verify independently before relying on them; Wind Pressure's
  exposure factor in particular is a documented approximation, not a
  digitisation of UK NA Figures NA.7/NA.8 (see the header comment in
  `wind-pressure-ec1.js`).
- **v1.0.0** — Initial release: Shallow Foundation Bearing Capacity,
  Cantilever Retaining Wall Stability, Schmertmann Settlement, Soil Phase
  Relations Calculator.

## Disclaimer

**DESIGN OUTPUT — REQUIRES CEng REVIEW BEFORE ACCEPTANCE.** Every output
from this toolkit is advisory and must be independently verified and
signed off by a Chartered Engineer (CEng MICE / MIStructE) before use in
tender, fabrication, or construction. All designs must be checked against
the current Eurocodes with UK National Annexes and the applicable DMRB /
Network Rail / client-specific standards. CDM 2015 design responsibilities
apply.

## Licence

Internal use only — see [LICENSE](LICENSE).

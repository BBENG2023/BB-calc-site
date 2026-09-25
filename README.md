# Beaver Bridges — Engineering Toolkit

A static website hosting a growing library of preliminary engineering
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

Beaver Bridges engineers doing early-stage concept optioneering on
substructure, geotechnical and temporary works elements — quick,
consistent, checkable preliminary calculations, not final design.

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
calcs share it (see [CONTRIBUTING.md](CONTRIBUTING.md)).

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

**PRELIMINARY — FOR CONCEPT OPTIONEERING ONLY.** Every output from this
toolkit is advisory and must be independently verified and signed off by a
Chartered Engineer (CEng MICE / MIStructE) before use in tender,
fabrication, or construction. All designs must be checked against the
current Eurocodes with UK National Annexes and the applicable DMRB /
Network Rail / client-specific standards. CDM 2015 design responsibilities
apply.

## Licence

Internal use only — see [LICENSE](LICENSE).

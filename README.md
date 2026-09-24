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
substructure and geotechnical elements — quick, consistent, checkable
preliminary calculations, not final design.

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
changing any `calculate()` function. It runs every calc's
`validation.samples` against its own logic and reports pass/fail.

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

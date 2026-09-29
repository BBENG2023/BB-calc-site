# Legato Abutment Designer — implementation plan (P0)

Written against the spec `beaver-bridges-calc-site-prompt-v3-legato-abutment.md`
(calc 10: "Bridge Abutment — Legato Interlocking Block (Bank Seat)").
Read before writing this: `js/registry.js`, `js/main.js`, `js/report.js`,
`js/shared-data.js`, `css/print.css`, `calcs/_template.js`, `test.html`,
`CONTRIBUTING.md`, `calcs/haul-road.js`, `calcs/wind-pressure-ec1.js`.

## 0. Repo state found at P0

- The repo had **no git history at all** (`git init` had never been run
  here). Initialised git locally and committed the current 10-calc state
  as a baseline (`chore: baseline commit...`) so this build has a clean
  starting point to diff and roll back against, phase by phase. No
  remote is configured — nothing pushes anywhere.
- No `.gitignore` existed. Added one excluding `/_local-reference/` (for
  the Elite drawings/guide, per the spec's guardrails) plus standard OS
  noise. No `_local-reference/` folder exists yet — the Elite reference
  material hasn't been dropped in locally.
- The registry currently holds **10** calcs, not the 9 the spec's
  guardrails/example assume — the piling-mat/crane-pad split (done in
  the prior session) added one. Not a conflict, just a number to update
  mentally when reading the spec's registry.js snippet.

## 1. What the runner already supports

- Flat `inputs[]` form generation (`number` / `select` / `text`), plus
  three custom field types (`layers`, `phase-picker`, `vehicle-rows`)
  that self-render and call `onChange` directly — this is the existing
  pattern for "a flat form can't express this."
- `showIf(values)` conditional visibility, `pipeFrom` cross-calc handoff
  (`js/pipe.js`), `_pipe`/`_pipeReturn` query params.
- Single-section report (`js/report.js` → `buildReportSheet`) — one
  numbered section list, one sign-off block, "Page 1/1" fixed footer,
  A4 portrait only (`css/print.css` `@page`).
- URL round-trip (`initialValues`/`updateUrl`) for every input, including
  JSON-encoded structured types via `STRUCTURED_TYPES`.
- `localStorage`-persisted header details block, shared across calcs.
- Single flat diagram panel per calc (`calc.diagram(v, output)` → SVG
  string), rendered both live and in the printed report.
- `test.html` running every registered calc's `validation.samples`
  against its own `calculate()`.

None of this supports: tabs, a table-with-add/remove/paste-from-sheet
generic input, a `customUI` delegation hook, multi-section reports with
forced page breaks or "Sheet x of y", an A3 landscape page, or JSON
save/load in place of the copy-link button. All of these are additive —
nothing existing needs to change shape, only extend.

## 2. Runner extensions (P1), and how they attach without touching existing calcs

- **`customUI(container, state, api)`** — in `renderCalcPage()`
  (`js/main.js`), after building `calc.diagram`/results panel scaffolding,
  check for `calc.customUI` before falling back to `buildForm`. When
  present, the runner still owns: header block, disclaimer banner (global,
  untouched), results panel, report preview mount point, print button,
  `_pipe` request/response. The calc owns everything inside the form
  column. `api` exposes `{ scheduleRecalc, values: state }` at minimum —
  extended as later phases need it (e.g. a `saveDesignFile`/`loadDesignFile`
  pair for this calc specifically, since "Copy link with inputs" doesn't
  fit a design this large).
- **Generic `table` input type** — for any *other* future calc that wants
  a plain repeating table without a bespoke component (the abutment calc
  itself will mostly use `customUI`'s own table widgets rather than this,
  since its tables have very different column shapes per tab — reaction
  rows, SPT rows, course rows — but the generic type is still worth
  having so the next non-abutment calc doesn't need a fourth bespoke
  `buildXRowsField`). Column schema + add/remove/duplicate + paste
  tab-separated text.
- **`tabs` layout** — a thin wrapper component in `js/main.js` (or a new
  `js/tabs.js` if it gets non-trivial): renders a sticky tab bar + panel
  switcher. Used by `customUI` for Tabs 1–5.
- **Multi-section reports** — `buildReportSheet` currently assumes one
  section list and one footer. Extending this for the abutment calc
  without breaking the other 9: add an optional `calc.buildReport(inputs,
  output, headerDetails)` override that, when present, is called instead
  of the generic per-input-array walk, and can return multiple `<section>`
  page groups with `page-break-before` and a running "Sheet x of y"
  counter. The other 9 calcs don't define it, so `buildReportSheet`'s
  existing path is completely unchanged for them.
- **A3 landscape page** — an additional named `@page a3-landscape` rule
  in `css/print.css`, applied via a class on specific report sections
  (the abutment's drawing sheets), rather than changing the default
  `@page` used by every other calc's single A4 sheet.
- **Save/Load design file** — new `js/file-io.js` (JSON with a schema
  version + migration hook, CSV export, SVG Blob export). The abutment
  calc's button row replaces "Copy link with inputs" with "Save design
  file (.json)" / "Load design file" — implemented as `calc`-level button
  overrides so `buildButtonRow`/`wireButtons` stay generic (a
  `calc.customButtons` array, rendered instead of the default three when
  present, again leaving the other 9 calcs untouched).

None of the above changes an existing exported function's signature —
they're all "check for an optional hook, fall back to current behaviour."
Re-running `test.html` after P1 proves the existing 9 calcs are unaffected
(no calc-logic changes are made in P1 at all, only runner plumbing +
`geo-core.js`/`svg-kit.js`/`file-io.js` as new, unimported-by-anything-yet
modules — so a pass here is close to a formality, but it's still the
checkpoint the spec asks for).

## 3. Phase mapping (spec §15) — how this session will actually sequence it

Given the size of this build (≈20 new files, a Bishop slip-circle search,
an auto-size combinatorial search, six numerically-tight validation
suites, six SVG drawing generators, and a full BB-house-style multi-page
report), this is being treated as a genuinely multi-session build, not a
single pass. Each phase below ends with a commit and a `test.html` run
(all existing + newly-added validation samples), matching the spec's own
"if context runs low: finish the phase, commit, write NEXT STEPS, stop"
instruction — that instruction is being treated as the default cadence,
not a fallback.

| Phase | This session's scope | Exit check |
|---|---|---|
| P0 | This plan doc. Git init + baseline commit + `.gitignore`. | This file committed. |
| P1 | `shared-data.js` additions (§5.1–5.7 tables), `js/geo-core.js` (Ka/Kp/K0, EC7 Annex D bearing, sliding, SPT corrections/correlations as pure functions), `js/svg-kit.js`, `js/file-io.js`, runner extensions from §2 above. | Existing 10 calcs still pass `test.html`; V6 (block volume model) passes. |
| P2 | `ground.js` — SPT parser (all string formats in spec §6/§7), corrections, correlations, characteristic value methods. | V4 passes; parser unit tests pass for every listed SPT string format. |
| P3 | `layout.js`/`optimise.js` groundwork — tiling rules, block schedule, levels solver (auto-size search itself deferred to P9 per the spec's own phase table). | Tiling/levels tests pass; V2's block weights reproduce from the stated course table. |
| P4 | `actions.js` — axis rotation, combination generator, favourable/unfavourable handling. | Combination counts/signs verified at θ = 0° and 90°. |
| P5 | `checks-external.js`, `checks-internal.js`, `checks-local.js`. | V1 and V2 pass in full. |
| P6 | `slope.js` (Bishop simplified search + screening), `settlement.js`, `crossing.js`. | V3 and V5 pass; X1–X6 produce output on the synthetic preset. |
| P7 | `drawings.js` (D1–D6). | Print preview clean on A4 and the A3 drawing sheet; legend/colour key correct. |
| P8 | `report.js` (calc-specific), `spec.js`, DRA rows, PLT object, exports. | Full sheet prints; JSON save → load round-trips identical. |
| P9 | `optimise.js` auto-size search. | Synthetic preset auto-sizes to the V2 arrangement or smaller, with the ruling check stated. |
| P10 | `ui.js` polish, `presets.js`, docs (`legato-abutment-method.md`, README/CONTRIBUTING updates), the deferred-items GitHub Issues list (§16, logged as a plain markdown list under `docs/` since this repo has no GitHub remote to file real Issues against yet). | Definition of done in the spec, checked off explicitly. |

P1 is the only phase started in this same turn as this plan doc, because
it's pure plumbing/data with no new calculation semantics to get subtly
wrong under time pressure — everything from P2 onward touches a number
that has to match one of V1–V6, and those deserve to be built and checked
one at a time rather than in a rush.

## 4. Conflicts / deviations from the spec, flagged now

1. **GitHub Issues (§16).** This repo has no GitHub remote (confirmed:
   no `origin`, in fact no git history at all until P0). The spec says
   "log as GitHub Issues" for out-of-scope items — that's not possible
   yet. P10 will instead produce a `docs/legato-abutment-deferred.md`
   list in the same shape (title + one-line rationale) so it can be
   pasted into real Issues the moment a remote exists, per the existing
   `FUTURE.md` pattern already used for the rest of the toolkit's
   deferred items.
2. **"Do not break the existing 9 calcs."** There are 10 now (see §0).
   Read as "do not break any existing calc," which is the evident intent.
3. **Org-level advisory/CEng-sign-off wording** (carried from the
   previous piece of work on this toolkit) applies to this calc exactly
   as it does to the other 10 — the spec's own "Verification and sign-off"
   report section and CEng statement already match that requirement, so
   there's no actual conflict here, just a note that it's being kept
   consistent with the rest of the site's wording (`js/report.js`'s
   shared sign-off block already covers it; the calc-specific
   `buildReport` override in P8 must keep using that same block, not
   write its own).
4. **Conventional commits.** Every phase above will commit with a
   `feat(legato):` / `docs(legato):` etc. prefix, matching the spec's
   "commit after each with conventional commits."

5. **Module layout.** As the spec's §4, plus `engine.js` (the per-end
   evaluation pipeline, kept out of `index.js` so the module-contract file
   stays small). Generic helpers added beyond the spec's list:
   `js/table-input.js` and `js/tabs.js`.
6. **Engineering deviations and judgement calls** are listed for the
   checker in `docs/legato-abutment-method.md` §8 (End 1 axis flip, I3
   under quasi-permanent loading, E5 verdict on abutment circles,
   surcharge in the traffic group, I4b definition, part checks for sliding
   only, scour constraint on the levels solver).

## Build status (all phases P0–P10 complete)

| Phase | Status |
|---|---|
| P0 | Plan (this file), git baseline, `.gitignore`. |
| P1 | `shared-data.js` §5 tables, `geo-core.js`, `svg-kit.js`, `file-io.js`, runner hooks. V6 passes. |
| P2 | `ground.js`. V4 and parser tests pass. |
| P3 | `layout.js` (Mixed/T/L tiling, block-type rule, schedule, validation, levels). Tiling and levels tests pass; V2 block weights 632.60 kN. |
| P4 | `actions.js` (rotation, situations S1–S7, factor application). Rotation and situation-count tests pass. |
| P5 | External, internal and local checks. V1 and V2 pass in full. |
| P6 | `slope.js`, `settlement.js`, `crossing.js`. V3 and V5 (0.990) pass; X1–X6 produce output. |
| P7 | `drawings.js` D1–D6, print-safe hatching, A3 drawing sheet. |
| P8 | `report.js` (18 sections, Sheet x of y), `spec.js`, DRA, PLT, CSV/JSON/SVG exports. JSON round-trip test passes. |
| P9 | `optimise.js`. The V2 case auto-sizes smaller than the V2 arrangement with the ruling check stated. |
| P10 | `ui.js` (8 tabs, End selector, presets, dashboard, runners), docs, deferred items. Browser-tested at 1440 px and 390 px (no console errors, no horizontal scroll). |

Validation: `node tools/run-tests.mjs` → 11 calcs, 22 samples, 123/123
checks pass; the existing 10 calcs are unchanged.

## NEXT STEPS

- CEng review of the judgement calls in the method statement §8.
- Confirm the data flags with Elite (LG8 volume, LG1–LG3 lifting rating,
  interlock shear).
- Try the calc on a real (non-committed) job with the Elite drawings in
  `/_local-reference/elite/` and compare against an existing BB design.
- Create the GitHub remote and move `docs/legato-abutment-deferred.md` and
  `FUTURE.md` into Issues.

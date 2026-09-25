// _template.js — copy this file to create a new calculation.
// See CONTRIBUTING.md for the full walkthrough (uses phase-relations.js as
// the worked example). Every field below is required unless marked optional.

export default {
  // URL slug. kebab-case, must be unique across /calcs/. Used in
  // calc.html?id=<this> and as the localStorage/URL key namespace.
  id: 'my-new-calc',

  // Displayed as the page <h1> and on the catalogue card.
  title: 'My New Calculation',

  // Free text. Calcs sharing a category string are grouped together on the
  // landing page catalogue.
  category: 'Structural — Example',

  // Optional. Short badge shown on the catalogue card (e.g. the design
  // code it implements). Falls back to `category` if omitted.
  tag: 'BS EN XXXX',

  // Semver string. Bump the minor version when you change the calculation
  // logic so engineers can tell whether an old printed sheet used a
  // different formula version.
  version: '1.0.0',

  // Every reference used in the calculation logic. These render as bullets
  // in the collapsible "References" panel on screen and in the printed
  // report. Cite the exact clause/table where possible.
  references: [
    'BS EN 1990:2002+A1:2005 — Basis of structural design',
    'UK National Annex to BS EN 1990',
  ],

  // One or two sentences. Shown on the catalogue card and the calc page
  // header — this is the engineer's first read on scope, so state the
  // method and the geometry/soil/material types covered.
  description: 'One-line description of what this calc covers and its method.',

  // Rendered as bullets in the "Assumptions" panel and on the printed
  // sheet. State the boundary of validity plainly — anything outside this
  // list needs a different calc or a manual override.
  assumptions: [
    'Static loading only (no seismic, no dynamic/fatigue effects).',
    'State every simplifying assumption a checking engineer would ask about.',
  ],

  // Auto-generates the input form, in the order given. Each entry:
  //   name      — key used in the values object passed to calculate()
  //   label     — human-readable label
  //   type      — 'number' | 'select'
  //   unit      — optional, shown next to the label and in the report table
  //   default   — required; pre-fills the form and is used by "Reset"
  //   min/max   — optional validation bounds (number type only)
  //   step      — optional input step (number type only, default 'any')
  //   options   — required for type 'select': array of option strings
  //   showIf    — optional (values) => boolean; hide the field when false
  //   help      — optional short helper line under the field
  inputs: [
    { name: 'exampleShape', label: 'Shape', type: 'select',
      options: ['A', 'B'], default: 'A' },
    { name: 'exampleValue', label: 'Example value', type: 'number',
      unit: 'kN', default: 10, min: 0, step: 0.1,
      showIf: (v) => v.exampleShape === 'B',
      help: 'Only used for shape B.' },
  ],

  // Optional. (values, output) => SVG markup string. Rendered live in a
  // "Definition diagram" panel on the calc page and in the printed
  // report's "Method & assumptions" section — see js/diagrams.js for the
  // drawing helpers (line, rect, text, arrowHead, hDimension, vDimension,
  // soilHatchDef) and bearing-capacity.js / retaining-wall.js /
  // schmertmann-settlement.js / phase-relations.js for worked examples.
  // Keep it schematic (proportionally clamped, captioned "not to scale")
  // rather than a literal scale drawing, and reference colours via
  // `style="fill:var(--bb-primary)"` etc. so it stays on-brand for free.
  // diagram: (v, output) => svg('0 0 400 300', innerMarkup),

  // Pure function: (values) => output. Must not touch the DOM. Called on
  // every debounced input change (150 ms) and once when building the
  // printed report, so it must be fast and side-effect free.
  //
  // Return shape:
  //   results  — [{ symbol, label, value, unit, precision, highlight? }]
  //              shown in the live results panel and the report summary box.
  //              Set highlight: true on the headline result(s).
  //   steps    — [{ title, formula, substitution, result }] rendered in the
  //              printed report body, in order, one block per intermediate
  //              quantity. Always fill formula/substitution/result as three
  //              separate strings (CONTRIBUTING.md style guide) — do not
  //              collapse them into one line.
  //   warnings — string[] of validation/scope issues, e.g. "Input X is
  //              outside the range this method was validated for."
  //   verdict  — optional { pass: boolean, message: string } overall
  //              pass/fail line, when the calc has a clear accept criterion.
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    // ... derive intermediate values here, pushing a step for each ...

    return { results, steps, warnings };
  },

  // Strongly encouraged. At least one sample with inputs and an expected
  // output (with tolerance) traceable to a public worked example or
  // textbook. Displayed on the hidden validation page and used to sanity
  // check any change to calculate().
  validation: {
    samples: [
      {
        name: 'Description of the source worked example',
        inputs: { exampleShape: 'A', exampleValue: 10 },
        expect: { /* resultSymbol: { value, tol, unit } */ },
      },
    ],
  },
};

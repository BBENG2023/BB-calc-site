# Contributing a new calculation

This toolkit is extensible by design: a new calculation is one file in
`/calcs/` plus one line in `/js/registry.js`. Nothing else — no touching
layout, routing, or CSS.

## The three steps

1. Copy `/calcs/_template.js` to `/calcs/my-new-calc.js`.
2. Fill in the metadata, `inputs`, and `calculate()` (full contract below).
3. Register it in `/js/registry.js`:

   ```js
   import myNewCalc from '../calcs/my-new-calc.js';

   export const registry = [
     bearingCapacity,
     retainingWall,
     schmertmannSettlement,
     phaseRelations,
     myNewCalc, // <- the one line you add
   ];
   ```

Every new calc **must**:

- Reference UK/EC design standards (Eurocodes with UK National Annexes,
  DMRB, Network Rail / client-specific standards) in its `references`
  array — or state clearly why a different source was used.
- Include at least one entry in `validation.samples` with a known
  expected output and tolerance.
- Be understood to carry the standard CEng verification statement — this
  is rendered automatically on every calc page and printed sheet; you do
  not need to add it yourself.

## The calc module contract

Each file in `/calcs/` exports a single default object:

```js
export default {
  id: 'bearing-capacity',                    // URL slug, kebab-case, unique
  title: 'Shallow Foundation Bearing Capacity',
  category: 'Geotechnical — Foundations',     // free text; groups the catalogue
  version: '1.0.0',
  references: [ /* ... */ ],
  description: '...',
  assumptions: [ /* ... */ ],
  inputs: [ /* ... */ ],
  calculate: (v) => ({ results, steps, warnings, verdict }),
  validation: { samples: [ /* ... */ ] },
};
```

### Field-by-field, using `phase-relations.js` as the worked example

- **`id`** — `'phase-relations'`. Used in the URL as `calc.html?id=phase-relations`
  and as the key when saving/restoring inputs from a shared link.

- **`title`** — `'Soil Phase Relations Calculator'`. The page `<h1>` and the
  catalogue card title.

- **`category`** — `'Geotechnical — Soil mechanics'`. Calcs sharing a
  category string are grouped together under one heading on `index.html`.

- **`version`** — `'1.0.0'`. Bump the minor version whenever the
  calculation *logic* changes (not for copy/typo fixes), so an engineer
  can tell whether an old printed sheet used a different formula version.

- **`references`** — an array of exact citations, e.g. `"Craig, R.F.,
  Craig's Soil Mechanics, 8th ed. — phase relationships"`. These render as
  bullets in the collapsible References panel and on the printed sheet.

- **`description`** — one or two sentences. Shown on the catalogue card
  and the calc page header.

- **`assumptions`** — bullets stating the boundary of validity, e.g.
  *"γw = 9.81 kN/m³ (editable)."* Anything outside this list needs a
  different calc or a manual override by the checking engineer.

- **`inputs`** — drives the auto-generated form. Standard entries use
  `type: 'number'` or `type: 'select'`:

  ```js
  { name: 'Gs', label: 'Specific gravity of solids', type: 'number',
    default: 2.65, min: 2.0, max: 3.0, step: 0.01 }
  ```

  Fields:
  - `name` — key used in the `values` object passed to `calculate()`.
  - `label` — human-readable label.
  - `unit` — optional, shown next to the label and in the report table.
  - `default` — required; pre-fills the form and is restored by "Reset".
  - `min` / `max` / `step` — optional validation bounds (number type).
  - `options` — required for `type: 'select'`.
  - `showIf` — optional `(values) => boolean`; hides the field when false.
  - `help` — optional short helper line under the field.

  Two custom input types exist for cases a flat form can't express:

  - **`type: 'layers'`** (used by `schmertmann-settlement.js`) — renders
    an editable table with add/remove rows. `default` is an array of plain
    objects, e.g. `[{ top: 0, bottom: 1, Es: 8 }, ...]`. The row shape is
    specific to that calc — the form generator only renders whatever keys
    the rows contain (`top`, `bottom`, `Es`), so a different layered calc
    can define its own row shape as long as it stays consistent.
  - **`type: 'phase-picker'`** (used by `phase-relations.js`) — renders two
    "choose a quantity + enter its value" rows. Needs a `fields` array
    (`[{ key, label, unit }, ...]`) listing every quantity the engineer can
    pick from, and a `default` of the shape
    `{ pick1, value1, pick2, value2 }`.

  If you need a genuinely new input shape, add a third custom type rather
  than overloading `number`/`select` — see the "Adding a new custom field
  type" section below.

- **`calculate(v)`** — a pure function: `(values) => output`. It must not
  touch the DOM, must not have side effects, and must run fast — it fires
  on every debounced input change (150 ms) and once when building the
  printed report. Return shape:

  - **`results`** — `[{ symbol, label, value, unit, precision, highlight? }]`.
    Shown in the live results panel and the printed report's results
    summary box. Set `highlight: true` on the headline result(s). `symbol`
    is also the key `validation.samples[].expect` looks up — keep it a
    plain identifier (`qRd`, `FoS_OT`, `gammasat`), not a special character,
    so samples can reference it directly.
  - **`steps`** — `[{ title, formula, substitution, result }]`, one block
    per intermediate quantity, in calculation order. **Always fill
    `formula`, `substitution` and `result` as three separate strings** —
    see the style guide below. These render in the printed calculation
    sheet body.
  - **`warnings`** — `string[]` of validation/scope issues, written as full
    sentences an engineer can act on, e.g. *"Water table (Dw = 0.5 m) is
    above founding level (D = 1.0 m). Effective stress calculations use
    submerged unit weight below Dw. Verify assumption."* — not just
    `"Invalid input"`.
  - **`verdict`** — optional `{ pass: boolean, message: string }`, an
    overall pass/fail line, when the calc has a clear accept criterion
    (e.g. all four retaining wall stability checks).

- **`validation.samples`** — **required**. At least one sample:

  ```js
  {
    name: 'e = 0.9, Gs = 2.82, S = 100% (worked in the build brief for this tool)',
    inputs: { Gs: 2.82, gammaw: 9.81, phase: { pick1: 'e', value1: 0.9, pick2: 'S', value2: 100 } },
    expect: {
      gammad:   { value: 14.55, tol: 0.3, unit: 'kN/m³' },
      gammasat: { value: 19.20, tol: 0.3, unit: 'kN/m³' },
    },
  }
  ```

  `inputs` is passed straight to `calculate()`. `expect` maps a `results[]`
  `symbol` to an expected value and an absolute tolerance. Prefer a sample
  traceable to a public worked example or textbook; where that isn't
  available, a self-computed baseline is acceptable **but must say so in
  its `name`**, e.g. *"Self-consistency baseline — not sourced from an
  external worked example; verify independently before relying on this
  tool."* Never label a self-generated number as if it came from a
  specific external source you have not actually checked it against.

  Run `test.html` in a browser after any change to `calculate()` — it
  runs every sample and reports pass/fail per calc.

## Style guide for calculation steps

Every entry in `steps` must show all three of:

```js
{
  title: 'Ultimate bearing resistance',
  formula: "qult = c′·Nc·sc·dc + q′·Nq·sq·dq + 0.5·γ·B·Nγ·sγ",
  substitution: 'qult = 0.0 + 1872.1 + 633.2',
  result: 'qult = 2505.3 kPa',
}
```

Do not collapse these into one line, and do not skip `substitution` even
when it looks redundant — the printed sheet is a calculation record, and a
checking engineer needs to see the actual numbers plugged in, not just the
symbolic formula and the final answer.

## Adding a new custom field type (rare)

Only needed if a calc's inputs genuinely can't be expressed as a flat list
of numbers/selects (as `layers` and `phase-picker` needed). If you must:

1. Add a branch in `buildField()` in `js/main.js` for your new
   `type`, following the pattern of `buildLayersField` /
   `buildPhasePickerField` (self-contained, calls the passed-in `onChange`
   callback directly rather than relying on the delegated form listener).
2. Add a branch in the inputs-table loop in `js/report.js` so the printed
   report renders it sensibly instead of stringifying an object.
3. Handle URL round-tripping in `initialValues()` / `updateUrl()` in
   `js/main.js` if the value isn't a plain string/number (structured
   values are JSON-encoded in the query string — see how `layers` and
   `phase-picker` do it).

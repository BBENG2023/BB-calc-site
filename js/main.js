// main.js — entry point. Detects which page it's on (by looking for that
// page's root element) and wires up the relevant behaviour. No router or
// build step: index.html, calc.html and about.html are plain static pages
// that each load this one module.

import { registry } from './registry.js';
import { fmtUnit, escapeHtml } from './formatters.js';
import { buildReportSheet } from './report.js';

const DEBOUNCE_MS = 150;

document.addEventListener('DOMContentLoaded', () => {
  const catalogueRoot = document.getElementById('catalogue-root');
  if (catalogueRoot) renderCatalogue(catalogueRoot);

  const calcRoot = document.getElementById('calc-root');
  if (calcRoot) renderCalcPage(calcRoot);
});

// ---------------------------------------------------------------------
// Landing page catalogue
// ---------------------------------------------------------------------

function renderCatalogue(root) {
  const byCategory = new Map();
  registry.forEach((calc) => {
    const key = calc.category || 'Uncategorised';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(calc);
  });

  const categories = [...byCategory.keys()].sort();
  categories.forEach((category) => {
    const group = document.createElement('div');
    group.className = 'catalogue-group';
    group.innerHTML = `<h2>${escapeHtml(category)}</h2>`;

    const grid = document.createElement('div');
    grid.className = 'card-grid';
    byCategory.get(category).forEach((calc) => {
      const card = document.createElement('a');
      card.className = 'calc-card';
      card.href = `calc.html?id=${encodeURIComponent(calc.id)}`;
      card.innerHTML = `
        <h3>${escapeHtml(calc.title)}</h3>
        <p>${escapeHtml(calc.description)}</p>
        <span class="open-link">Open →</span>`;
      grid.append(card);
    });
    group.append(grid);
    root.append(group);
  });

  if (!categories.length) {
    root.innerHTML = '<p class="muted">No calculations registered yet.</p>';
  }
}

// ---------------------------------------------------------------------
// Calc runner page
// ---------------------------------------------------------------------

function renderCalcPage(root) {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const calc = registry.find((c) => c.id === id);

  if (!calc) {
    root.innerHTML = `
      <div class="page-header"><h1>Calculation not found</h1></div>
      <p>No calculation is registered with id "${escapeHtml(id || '')}".
      Return to the <a href="index.html">catalogue</a>.</p>`;
    document.title = 'Not found — Beaver Bridges Engineering Toolkit';
    return;
  }

  document.title = `${calc.title} — Beaver Bridges Engineering Toolkit`;

  const values = initialValues(calc, params);

  root.innerHTML = '';
  root.append(buildCalcHeader(calc));

  const layout = document.createElement('div');
  layout.className = 'calc-layout';

  const leftCol = document.createElement('div');
  leftCol.className = 'calc-col-form';
  leftCol.append(buildInfoBlocks(calc));

  const rightCol = document.createElement('div');
  rightCol.className = 'calc-col-results';
  const btnRow = buildButtonRow(calc, values);
  const resultsPanel = document.createElement('div');
  resultsPanel.className = 'results-panel';
  rightCol.append(btnRow, resultsPanel);

  layout.append(leftCol, rightCol);
  root.append(layout);

  const reportSection = document.createElement('section');
  reportSection.className = 'report-section';
  reportSection.innerHTML = '<h2>Preview report</h2><p class="muted">This is exactly what prints when you choose "Print / Save as PDF".</p>';
  const reportFrame = document.createElement('div');
  reportFrame.className = 'report-frame';
  reportFrame.id = 'report-root';
  reportSection.append(reportFrame);
  root.append(reportSection);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = 'Link copied to clipboard';
  document.body.append(toast);

  let debounceHandle = null;
  function scheduleRecalc() {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => recalc(calc, values, resultsPanel, reportFrame), DEBOUNCE_MS);
  }

  let form = buildForm(calc, values, scheduleRecalc);
  leftCol.append(form);
  wireForm(calc, form, values, scheduleRecalc);

  wireButtons(calc, btnRow, values, () => form, (rebuilt) => {
    form = rebuilt;
    updateUrl(calc, values);
    recalc(calc, values, resultsPanel, reportFrame);
  }, scheduleRecalc, toast);

  updateUrl(calc, values);
  recalc(calc, values, resultsPanel, reportFrame);
}

function buildCalcHeader(calc) {
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <span class="tag">${escapeHtml(calc.category)}</span>
    <h1>${escapeHtml(calc.title)}</h1>
    <p>${escapeHtml(calc.description)}</p>
    <p class="muted">ID: ${escapeHtml(calc.id)} · v${escapeHtml(calc.version)}</p>`;
  return header;
}

function buildInfoBlocks(calc) {
  const wrap = document.createElement('div');

  if (calc.references && calc.references.length) {
    const details = document.createElement('details');
    details.className = 'info-block';
    details.innerHTML = `<summary>References</summary>
      <ul>${calc.references.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
    wrap.append(details);
  }

  if (calc.assumptions && calc.assumptions.length) {
    const details = document.createElement('details');
    details.className = 'info-block';
    details.innerHTML = `<summary>Assumptions</summary>
      <ul>${calc.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`;
    wrap.append(details);
  }

  return wrap;
}

// --- Values / URL round-trip -------------------------------------------------

function defaultValueFor(def) {
  // Structured types (arrays/objects) must be cloned per instance so that
  // editing one calc session never mutates the module's shared default.
  if (def.type === 'layers') return def.default.map((row) => ({ ...row }));
  if (def.type === 'phase-picker') return { ...def.default };
  return def.default;
}

function initialValues(calc, params) {
  const values = {};
  calc.inputs.forEach((def) => {
    values[def.name] = defaultValueFor(def);
  });
  calc.inputs.forEach((def) => {
    if (!params.has(def.name)) return;
    const raw = params.get(def.name);
    if (def.type === 'layers' || def.type === 'phase-picker') {
      try { values[def.name] = JSON.parse(raw); } catch { /* keep default on bad payload */ }
    } else if (def.type === 'number') {
      if (raw === '') { values[def.name] = undefined; return; }
      const n = Number(raw);
      if (!Number.isNaN(n)) values[def.name] = n;
    } else {
      values[def.name] = raw;
    }
  });
  return values;
}

function updateUrl(calc, values) {
  const params = new URLSearchParams();
  params.set('id', calc.id);
  calc.inputs.forEach((def) => {
    const v = values[def.name];
    if (v === undefined || v === null || v === '') return;
    if (def.type === 'layers' || def.type === 'phase-picker') {
      params.set(def.name, JSON.stringify(v));
    } else {
      params.set(def.name, String(v));
    }
  });
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

// --- Form generation ---------------------------------------------------------

function isVisible(def, values) {
  return typeof def.showIf !== 'function' || def.showIf(values);
}

function buildForm(calc, values, onChange) {
  const form = document.createElement('form');
  form.className = 'calc-form';
  form.noValidate = true;

  calc.inputs.forEach((def) => {
    form.append(buildField(def, values, onChange));
  });

  return form;
}

function buildField(def, values, onChange) {
  if (def.type === 'layers') return buildLayersField(def, values, onChange);
  if (def.type === 'phase-picker') return buildPhasePickerField(def, values, onChange);

  const field = document.createElement('div');
  field.className = 'field';
  field.dataset.fieldFor = def.name;
  field.style.display = isVisible(def, values) ? '' : 'none';

  const label = document.createElement('label');
  label.htmlFor = `input-${def.name}`;
  label.innerHTML = `${escapeHtml(def.label || def.name)}${def.unit ? ` <span class="field-unit">(${escapeHtml(def.unit)})</span>` : ''}`;
  field.append(label);

  const row = document.createElement('div');
  row.className = 'field-input-row';

  let input;
  if (def.type === 'select') {
    input = document.createElement('select');
    (def.options || []).forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      input.append(o);
    });
    input.value = values[def.name] ?? def.default;
  } else {
    input = document.createElement('input');
    input.type = 'number';
    if (def.min !== undefined) input.min = String(def.min);
    if (def.max !== undefined) input.max = String(def.max);
    if (def.step !== undefined) input.step = String(def.step);
    else input.step = 'any';
    const v = values[def.name];
    input.value = v === undefined || v === null ? '' : String(v);
    if (def.placeholder) input.placeholder = def.placeholder;
  }
  input.id = `input-${def.name}`;
  input.name = def.name;
  row.append(input);
  field.append(row);

  if (def.help) {
    const help = document.createElement('div');
    help.className = 'field-help';
    help.textContent = def.help;
    field.append(help);
  }

  const error = document.createElement('div');
  error.className = 'field-error';
  error.hidden = true;
  field.append(error);

  return field;
}

// --- Custom field: soil layers table (Schmertmann settlement) ---------------

function buildLayersField(def, values, onChange) {
  const field = document.createElement('div');
  field.className = 'field';
  field.dataset.fieldFor = def.name;

  const label = document.createElement('label');
  label.textContent = def.label || def.name;
  field.append(label);

  if (def.help) {
    const help = document.createElement('div');
    help.className = 'field-help';
    help.textContent = def.help;
    field.append(help);
  }

  const table = document.createElement('table');
  table.className = 'layers-table';
  table.innerHTML = `<thead><tr>
    <th>Top (m)</th><th>Bottom (m)</th><th>Es (MPa)</th><th></th>
  </tr></thead><tbody></tbody>`;
  field.append(table);
  const tbody = table.querySelector('tbody');

  function renderRows() {
    tbody.innerHTML = '';
    values[def.name].forEach((row, i) => {
      const tr = document.createElement('tr');

      ['top', 'bottom', 'Es'].forEach((key) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = key === 'Es' ? '1' : '0.1';
        input.min = '0';
        input.value = row[key] ?? '';
        input.addEventListener('input', () => {
          const n = Number(input.value);
          row[key] = input.value === '' || Number.isNaN(n) ? undefined : n;
          onChange();
        });
        td.append(input);
        tr.append(td);
      });

      const tdBtn = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn secondary';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remove layer ${i + 1}`);
      removeBtn.addEventListener('click', () => {
        values[def.name].splice(i, 1);
        renderRows();
        onChange();
      });
      tdBtn.append(removeBtn);
      tr.append(tdBtn);

      tbody.append(tr);
    });
  }
  renderRows();

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn secondary';
  addBtn.textContent = '+ Add layer';
  addBtn.style.marginTop = '0.5rem';
  addBtn.addEventListener('click', () => {
    const last = values[def.name][values[def.name].length - 1];
    const top = last ? last.bottom : 0;
    values[def.name].push({ top, bottom: top + 1, Es: 10 });
    renderRows();
    onChange();
  });
  field.append(addBtn);

  return field;
}

// --- Custom field: "pick any two" phase-relations picker ---------------------

function buildPhasePickerField(def, values, onChange) {
  const field = document.createElement('div');
  field.className = 'field';
  field.dataset.fieldFor = def.name;

  const label = document.createElement('label');
  label.textContent = def.label || def.name;
  field.append(label);

  if (def.help) {
    const help = document.createElement('div');
    help.className = 'field-help';
    help.textContent = def.help;
    field.append(help);
  }

  const grid = document.createElement('div');
  grid.className = 'phase-picker-row';
  field.append(grid);

  function fieldMeta(key) {
    return def.fields.find((f) => f.key === key);
  }

  function buildPickRow(pickKeyName, valueKeyName) {
    const wrap = document.createElement('div');
    const select = document.createElement('select');
    def.fields.forEach((f) => {
      const otherPick = pickKeyName === 'pick1' ? values[def.name].pick2 : values[def.name].pick1;
      if (f.key === otherPick) return; // can't choose the same quantity twice
      const o = document.createElement('option');
      o.value = f.key;
      o.textContent = f.label;
      select.append(o);
    });
    select.value = values[def.name][pickKeyName];

    const inputRow = document.createElement('div');
    inputRow.className = 'field-input-row';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    const meta = fieldMeta(values[def.name][pickKeyName]);
    input.value = values[def.name][valueKeyName] ?? '';
    const unitSpan = document.createElement('span');
    unitSpan.className = 'unit-suffix';
    unitSpan.textContent = meta?.unit || '';
    inputRow.append(input, unitSpan);

    select.addEventListener('change', () => {
      values[def.name][pickKeyName] = select.value;
      onChange();
      rerender();
    });
    input.addEventListener('input', () => {
      const n = Number(input.value);
      values[def.name][valueKeyName] = input.value === '' || Number.isNaN(n) ? undefined : n;
      onChange();
    });

    wrap.append(select, inputRow);
    return wrap;
  }

  function rerender() {
    grid.innerHTML = '';
    grid.append(buildPickRow('pick1', 'value1'), buildPickRow('pick2', 'value2'));
  }
  rerender();

  return field;
}

function wireForm(calc, form, values, onChange) {
  form.addEventListener('input', (evt) => {
    const target = evt.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const def = calc.inputs.find((d) => d.name === target.name);
    if (!def) return;

    if (def.type === 'select') {
      values[def.name] = target.value;
    } else if (target.value === '') {
      values[def.name] = undefined;
    } else {
      const n = Number(target.value);
      values[def.name] = Number.isNaN(n) ? undefined : n;
    }

    validateField(def, values, form);
    refreshVisibility(calc, form, values);
    onChange();
  });
}

function validateField(def, values, form) {
  const field = form.querySelector(`[data-field-for="${CSS.escape(def.name)}"]`);
  if (!field) return;
  const errorEl = field.querySelector('.field-error');
  const v = values[def.name];
  let message = '';

  if (def.type === 'number' && v !== undefined) {
    if (def.min !== undefined && v < def.min) message = `Must be ≥ ${def.min}${def.unit ? ' ' + def.unit : ''}.`;
    if (def.max !== undefined && v > def.max) message = `Must be ≤ ${def.max}${def.unit ? ' ' + def.unit : ''}.`;
  }

  field.classList.toggle('invalid', Boolean(message));
  errorEl.hidden = !message;
  errorEl.textContent = message;
}

function refreshVisibility(calc, form, values) {
  calc.inputs.forEach((def) => {
    const field = form.querySelector(`[data-field-for="${CSS.escape(def.name)}"]`);
    if (!field) return;
    field.style.display = isVisible(def, values) ? '' : 'none';
  });
}

// --- Buttons ------------------------------------------------------------------

function buildButtonRow(calc) {
  const row = document.createElement('div');
  row.className = 'btn-row';
  row.innerHTML = `
    <button type="button" class="btn" data-action="print">Print / Save as PDF</button>
    <button type="button" class="btn secondary" data-action="reset">Reset to defaults</button>
    <button type="button" class="btn secondary" data-action="copy-link">Copy link with inputs</button>`;
  return row;
}

function wireButtons(calc, row, values, getForm, onReset, scheduleRecalc, toast) {
  row.addEventListener('click', (evt) => {
    const btn = evt.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'print') {
      window.print();
    } else if (action === 'reset') {
      calc.inputs.forEach((def) => { values[def.name] = defaultValueFor(def); });
      const rebuilt = buildForm(calc, values, scheduleRecalc);
      getForm().replaceWith(rebuilt);
      wireForm(calc, rebuilt, values, scheduleRecalc);
      onReset(rebuilt);
    } else if (action === 'copy-link') {
      updateUrl(calc, values);
      const url = window.location.href;
      navigator.clipboard?.writeText(url).then(() => {
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 1500);
      }).catch(() => {
        window.prompt('Copy this link:', url);
      });
    }
  });
}

// --- Recalculation --------------------------------------------------------------

function recalc(calc, values, resultsPanel, reportFrame) {
  let output;
  try {
    output = calc.calculate(values) || {};
  } catch (err) {
    output = { results: [], steps: [], warnings: [`Calculation error: ${err.message}`] };
  }

  renderResults(resultsPanel, output);

  const visibleNames = new Set(calc.inputs.filter((d) => isVisible(d, values)).map((d) => d.name));
  reportFrame.innerHTML = '';
  reportFrame.append(buildReportSheet(calc, values, output, visibleNames));
}

function renderResults(panel, output) {
  const { results = [], warnings = [], verdict } = output;
  panel.innerHTML = '';

  if (!results.length) {
    panel.innerHTML = '<p class="muted">Enter inputs to see results.</p>';
  } else {
    results.forEach((r) => {
      const row = document.createElement('div');
      row.className = `result-row${r.highlight ? ' highlight' : ''}`;
      row.innerHTML = `
        <span class="result-label">${escapeHtml(r.label)}${r.symbol ? ` (${escapeHtml(r.symbol)})` : ''}</span>
        <span class="result-value">${fmtUnit(r.value, r.unit, r.precision ?? 2)}</span>`;
      panel.append(row);
    });
  }

  if (verdict) {
    const v = document.createElement('div');
    v.className = `verdict-banner ${verdict.pass ? 'pass' : 'fail'}`;
    v.textContent = `${verdict.pass ? 'PASS' : 'FAIL'} — ${verdict.message}`;
    panel.append(v);
  }

  if (warnings.length) {
    const w = document.createElement('div');
    w.className = 'warnings-list';
    w.innerHTML = `<strong>Warnings</strong><ul>${warnings.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
    panel.append(w);
  }
}

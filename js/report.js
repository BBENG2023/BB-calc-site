// report.js — builds the printable calculation sheet DOM.
// The same markup is used for the on-screen "Preview Report" panel and for
// print.css's @media print output, so what the engineer previews is exactly
// what prints (see calc-site-prompt.md §6).

import { fmtUnit, todayUK, escapeHtml } from './formatters.js';

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function inputLabel(inputDef) {
  return inputDef.label || inputDef.name;
}

function inputDisplayValue(inputDef, value) {
  if (inputDef.type === 'select') return String(value);
  if (typeof value === 'number') {
    return value.toLocaleString('en-GB', { maximumFractionDigits: 3 });
  }
  return String(value ?? '');
}

// Numbered section header, e.g. "2  INPUTS" with the numeral in accent
// colour — see print.css h4.rs-section-title.
function sectionTitle(n, label) {
  return `<h4 class="rs-section-title"><span class="rs-section-num">${n}</span><span>${escapeHtml(label)}</span></h4>`;
}

const BB_ADDRESS = 'The Warehouse, Cartmel Drive, Harlescott, Shrewsbury, SY1 3TB';
const BB_PHONE = '01743 811 811';

/**
 * Build the report-sheet DOM for a calc.
 * @param {object} calc   the calc module definition
 * @param {object} inputs current input values (name -> value)
 * @param {object} output result of calc.calculate(inputs): { results, steps, warnings, verdict }
 * @param {object} visibleInputNames Set of input names currently visible (respecting showIf)
 * @param {object} headerDetails project/sheet/engineer header fields (see js/header-details.js)
 * @returns {HTMLElement}
 */
export function buildReportSheet(calc, inputs, output, visibleInputNames, headerDetails = {}) {
  const { results = [], steps = [], warnings = [], verdict } = output || {};
  let sectionNum = 0;
  const h = headerDetails;

  const sheet = el('div', 'report-sheet rs-border');

  // --- Row 1: company block (left) + project block (right) ---
  const head = el('div', 'rs-head');
  const headLeft = el('div', 'rs-head-left');
  headLeft.innerHTML = `
    <img src="assets/logo.png" alt="" />
    <div class="rs-company-block">
      <div class="rs-company">Beaver Bridges Ltd</div>
      <div class="rs-company-addr">${escapeHtml(BB_ADDRESS)}</div>
      <div class="rs-company-addr">${escapeHtml(BB_PHONE)}</div>
    </div>`;
  const headRight = el('div', 'rs-head-right');
  headRight.innerHTML = `
    <table class="rs-meta-table">
      <tr><td class="rs-meta-label">Project No</td><td class="rs-meta-fill">${escapeHtml(h.projectNo || '') || '&nbsp;'}</td></tr>
      <tr><td class="rs-meta-label">Project Title</td><td class="rs-meta-fill">${escapeHtml(h.projectTitle || '') || '&nbsp;'}</td></tr>
      <tr><td class="rs-meta-label">Sheet No</td><td class="rs-meta-fill">${escapeHtml(h.sheetNo || '') || '&nbsp;'}${h.sheetOf ? ` of ${escapeHtml(h.sheetOf)}` : ''}</td></tr>
      <tr><td class="rs-meta-label">Date</td><td class="rs-meta-fill">${escapeHtml(h.date || '') || todayUK()}</td></tr>
      <tr><td class="rs-meta-label">Engineer</td><td class="rs-meta-fill">${escapeHtml(h.engineerInitials || '') || '&nbsp;'}</td></tr>
      <tr><td class="rs-meta-label">Checked</td><td class="rs-meta-fill">${escapeHtml(h.checkedCategory || '') || '&nbsp;'}</td></tr>
    </table>`;
  head.append(headLeft, headRight);

  // --- Row 2: calc title (bold, left) + ID/version (small, right) ---
  const titleBar = el('div', 'rs-title-bar');
  titleBar.innerHTML = `
    <span class="rs-title-main">${escapeHtml(calc.title)}</span>
    <span class="rs-title-meta">ID: ${escapeHtml(calc.id)} · v${escapeHtml(calc.version)}</span>`;

  // --- Body ---
  const body = el('div', 'rs-body');

  if (calc.references && calc.references.length) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = sectionTitle(++sectionNum, 'References & standards');
    const ul = el('ul', 'rs-bullets');
    calc.references.forEach((r) => ul.append(el('li', null, escapeHtml(r))));
    sec.append(ul);
    body.append(sec);
  }

  // Inputs table
  const inputSec = el('section', 'rs-section');
  inputSec.innerHTML = sectionTitle(++sectionNum, 'Input parameters');
  const table = el('table', 'rs-input-table');
  table.innerHTML = `<thead><tr><th>Symbol</th><th>Description</th><th>Value</th><th>Unit</th></tr></thead>`;
  const tbody = el('tbody');
  calc.inputs.forEach((def) => {
    if (visibleInputNames && !visibleInputNames.has(def.name)) return;
    const value = inputs[def.name];

    if (def.type === 'layers') {
      (value || []).forEach((row, i) => {
        const tr = el('tr');
        tr.innerHTML = `
          <td>Layer ${i + 1}</td>
          <td>Top ${escapeHtml(inputDisplayValue({ type: 'number' }, row.top))} m — Bottom ${escapeHtml(inputDisplayValue({ type: 'number' }, row.bottom))} m</td>
          <td class="num">${escapeHtml(inputDisplayValue({ type: 'number' }, row.Es))}</td>
          <td>MPa</td>`;
        tbody.append(tr);
      });
      return;
    }

    if (def.type === 'vehicle-rows') {
      (value || []).forEach((row, i) => {
        const opt = (def.vehicleOptions || []).find((o) => o.value === row.vehicleType);
        const tr = el('tr');
        tr.innerHTML = `
          <td>Row ${i + 1}</td>
          <td>${escapeHtml(opt?.label || row.vehicleType)}${row.vehicleType === 'custom' ? ` (sa=${escapeHtml(inputDisplayValue({ type: 'number' }, row.customSa))})` : ''}</td>
          <td class="num">${escapeHtml(inputDisplayValue({ type: 'number' }, row.passesPerDay))}/day</td>
          <td>${escapeHtml(inputDisplayValue({ type: 'number' }, row.workingWeeks))} weeks</td>`;
        tbody.append(tr);
      });
      return;
    }

    if (def.type === 'phase-picker') {
      ['pick1', 'pick2'].forEach((pickKey, i) => {
        const valueKey = i === 0 ? 'value1' : 'value2';
        const key = value?.[pickKey];
        const meta = (def.fields || []).find((f) => f.key === key);
        const tr = el('tr');
        tr.innerHTML = `
          <td>${escapeHtml(key || '')}</td>
          <td>${escapeHtml(meta?.label || '')} (given)</td>
          <td class="num">${escapeHtml(inputDisplayValue({ type: 'number' }, value?.[valueKey]))}</td>
          <td>${escapeHtml(meta?.unit || '')}</td>`;
        tbody.append(tr);
      });
      return;
    }

    const tr = el('tr');
    tr.innerHTML = `
      <td>${escapeHtml(def.name)}</td>
      <td>${escapeHtml(inputLabel(def))}</td>
      <td class="num">${escapeHtml(inputDisplayValue(def, value))}</td>
      <td>${escapeHtml(def.unit || '')}</td>`;
    tbody.append(tr);
  });
  table.append(tbody);
  inputSec.append(table);
  body.append(inputSec);

  // Method & assumptions — two-column with the definition diagram when
  // the calc provides one (see js/diagrams.js).
  if ((calc.assumptions && calc.assumptions.length) || calc.diagram) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = sectionTitle(++sectionNum, 'Method & assumptions');

    const ul = el('ul', 'rs-bullets');
    (calc.assumptions || []).forEach((a) => ul.append(el('li', null, escapeHtml(a))));

    if (calc.diagram) {
      const grid = el('div', 'rs-assump-grid');
      grid.append(ul);
      const diagramBox = el('div', 'rs-diagram-box');
      let diagramSvg = '';
      try {
        diagramSvg = calc.diagram(inputs, output);
      } catch (err) {
        diagramSvg = '';
      }
      diagramBox.innerHTML = `<div class="rs-diagram-inner">${diagramSvg}</div>
        <div class="rs-diagram-caption">Fig. 1 — Definition diagram (schematic, not to scale)</div>`;
      grid.append(diagramBox);
      sec.append(grid);
    } else {
      sec.append(ul);
    }
    body.append(sec);
  }

  // Calculation steps
  if (steps.length) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = sectionTitle(++sectionNum, 'Calculation');
    steps.forEach((step, i) => {
      const stepEl = el('div', 'rs-step');
      stepEl.innerHTML = `
        <div class="rs-step-title">Step ${i + 1} — ${escapeHtml(step.title)}</div>
        ${step.formula ? `<div class="rs-step-line"><span class="rs-step-key">Formula:</span><span>${escapeHtml(step.formula)}</span></div>` : ''}
        ${step.substitution ? `<div class="rs-step-line"><span class="rs-step-key">Substitution:</span><span>${escapeHtml(step.substitution)}</span></div>` : ''}
        ${step.result ? `<div class="rs-step-line"><span class="rs-step-key">Result:</span><span>${escapeHtml(step.result)}</span></div>` : ''}`;
      sec.append(stepEl);
    });
    body.append(sec);
  }

  // Results summary — headline (highlighted) results as stat tiles,
  // everything else as a plain row list underneath.
  const resSec = el('section', 'rs-section');
  resSec.innerHTML = sectionTitle(++sectionNum, 'Results summary');
  const highlighted = results.filter((r) => r.highlight);
  const plain = results.filter((r) => !r.highlight);

  if (highlighted.length) {
    const grid = el('div', 'stat-grid');
    highlighted.forEach((r) => {
      const tile = el('div', 'stat-tile');
      tile.innerHTML = `
        <div class="stat-label">${escapeHtml(r.label)}${r.symbol ? ` (${escapeHtml(r.symbol)})` : ''}</div>
        <div class="stat-value">${fmtUnit(r.value, r.unit, r.precision ?? 2)}</div>`;
      grid.append(tile);
    });
    resSec.append(grid);
  }
  if (plain.length) {
    const rows = el('div', 'rs-results-rows');
    plain.forEach((r) => {
      const row = el('div', 'result-row');
      row.innerHTML = `
        <span class="result-label">${escapeHtml(r.label)}${r.symbol ? ` (${escapeHtml(r.symbol)})` : ''}</span>
        <span class="result-value">${fmtUnit(r.value, r.unit, r.precision ?? 2)}</span>`;
      rows.append(row);
    });
    resSec.append(rows);
  }
  if (verdict) {
    const v = el('div', 'rs-verdict');
    v.textContent = `${verdict.pass ? 'PASS' : 'FAIL'} — ${verdict.message}`;
    resSec.append(v);
  }
  body.append(resSec);

  // Warnings
  if (warnings.length) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = sectionTitle(++sectionNum, 'Warnings / notes');
    const ul = el('ul', 'rs-bullets');
    warnings.forEach((w) => ul.append(el('li', null, escapeHtml(w))));
    sec.append(ul);
    body.append(sec);
  }

  // Sign-off block
  const signoff = el('div', 'rs-signoff');
  const signoffStatement = el('div', 'rs-signoff-statement');
  signoffStatement.innerHTML = `<strong>PRELIMINARY — REQUIRES INDEPENDENT VERIFICATION AND SIGN-OFF</strong> BY A
    CHARTERED ENGINEER (CEng MICE / MIStructE) PRIOR TO USE FOR
    FABRICATION, CONSTRUCTION OR TENDER.`;
  const signoffRows = el('div', 'rs-signoff-rows');
  signoffRows.innerHTML = `
    <div class="rs-signoff-row">
      <span>Prepared</span><span class="line"></span>
      <span>Signed</span><span class="line"></span>
      <span>Date</span><span class="line"></span>
    </div>
    <div class="rs-signoff-row">
      <span>Checked</span><span class="line"></span>
      <span>Signed</span><span class="line"></span>
      <span>Date</span><span class="line"></span>
    </div>
    <div class="rs-signoff-row">
      <span>Approved</span><span class="line"></span>
      <span>Signed</span><span class="line"></span>
      <span>Date</span><span class="line"></span>
    </div>`;
  signoff.append(signoffStatement, signoffRows);

  const footer = el('div', 'rs-footer');
  footer.innerHTML = `<span>Beaver Bridges Ltd | Engineering Toolkit</span><span>Page 1/1</span>`;

  sheet.append(head, titleBar, body, signoff, footer);
  return sheet;
}

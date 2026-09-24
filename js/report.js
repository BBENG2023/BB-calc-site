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

/**
 * Build the report-sheet DOM for a calc.
 * @param {object} calc   the calc module definition
 * @param {object} inputs current input values (name -> value)
 * @param {object} output result of calc.calculate(inputs): { results, steps, warnings, verdict }
 * @param {object} visibleInputNames Set of input names currently visible (respecting showIf)
 * @returns {HTMLElement}
 */
export function buildReportSheet(calc, inputs, output, visibleInputNames) {
  const { results = [], steps = [], warnings = [], verdict } = output || {};

  const sheet = el('div', 'report-sheet rs-border');

  // --- Header block: company / logo | project meta ---
  const head = el('div', 'rs-head');
  const headLeft = el('div', 'rs-head-left');
  headLeft.innerHTML = `
    <img src="assets/logo.svg" alt="" />
    <div>
      <div class="rs-company">BEAVER BRIDGES LTD</div>
      <div class="rs-sub">Engineering Toolkit</div>
    </div>`;
  const headRight = el('div', 'rs-head-right');
  headRight.innerHTML = `
    <table class="rs-meta-table">
      <tr><td class="rs-meta-label">Project</td><td class="rs-meta-fill">&nbsp;</td></tr>
      <tr><td class="rs-meta-label">Ref</td><td class="rs-meta-fill">&nbsp;</td></tr>
      <tr><td class="rs-meta-label">Rev</td><td class="rs-meta-fill">A</td></tr>
    </table>`;
  head.append(headLeft, headRight);

  // --- Calc meta block: title/id/date | prepared/checked/sheet ---
  const calcMeta = el('div', 'rs-calc-meta');
  const metaLeft = el('div');
  metaLeft.innerHTML = `
    <div class="rs-calc-title">${escapeHtml(calc.title)}</div>
    <div>ID: ${escapeHtml(calc.id)} v${escapeHtml(calc.version)}</div>
    <div>Date: ${todayUK()}</div>`;
  const metaRight = el('div');
  metaRight.innerHTML = `
    <table class="rs-meta-table">
      <tr><td class="rs-meta-label">Prepared</td><td class="rs-meta-fill">&nbsp;</td></tr>
      <tr><td class="rs-meta-label">Checked</td><td class="rs-meta-fill">&nbsp;</td></tr>
      <tr><td class="rs-meta-label">Sheet</td><td class="rs-meta-fill">1 / 1</td></tr>
    </table>`;
  calcMeta.append(metaLeft, metaRight);

  // --- Body ---
  const body = el('div', 'rs-body');

  if (calc.references && calc.references.length) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = `<h4 class="rs-section-title">References</h4>`;
    const ul = el('ul', 'rs-bullets');
    calc.references.forEach((r) => ul.append(el('li', null, escapeHtml(r))));
    sec.append(ul);
    body.append(sec);
  }

  if (calc.assumptions && calc.assumptions.length) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = `<h4 class="rs-section-title">Assumptions</h4>`;
    const ul = el('ul', 'rs-bullets');
    calc.assumptions.forEach((a) => ul.append(el('li', null, escapeHtml(a))));
    sec.append(ul);
    body.append(sec);
  }

  // Inputs table
  const inputSec = el('section', 'rs-section');
  inputSec.innerHTML = `<h4 class="rs-section-title">Inputs</h4>`;
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

  // Calculation steps
  if (steps.length) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = `<h4 class="rs-section-title">Calculation</h4>`;
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

  // Results summary
  const resSec = el('section', 'rs-section');
  resSec.innerHTML = `<h4 class="rs-section-title">Results summary</h4>`;
  const box = el('div', 'rs-results-box');
  results.forEach((r) => {
    const row = el('div', `result-row${r.highlight ? ' highlight' : ''}`);
    row.innerHTML = `
      <span class="result-label">${escapeHtml(r.label)}${r.symbol ? ` (${escapeHtml(r.symbol)})` : ''}</span>
      <span class="result-value">${fmtUnit(r.value, r.unit, r.precision ?? 2)}</span>`;
    box.append(row);
  });
  if (verdict) {
    const v = el('div', 'rs-verdict');
    v.textContent = `${verdict.pass ? 'PASS' : 'FAIL'} — ${verdict.message}`;
    box.append(v);
  }
  resSec.append(box);
  body.append(resSec);

  // Warnings
  if (warnings.length) {
    const sec = el('section', 'rs-section');
    sec.innerHTML = `<h4 class="rs-section-title">Warnings / notes</h4>`;
    const ul = el('ul', 'rs-bullets');
    warnings.forEach((w) => ul.append(el('li', null, escapeHtml(w))));
    sec.append(ul);
    body.append(sec);
  }

  // Sign-off block
  const signoff = el('div', 'rs-signoff');
  signoff.innerHTML = `
    <div class="rs-signoff-statement">
      PRELIMINARY — REQUIRES INDEPENDENT VERIFICATION AND SIGN-OFF BY A
      CHARTERED ENGINEER (CEng MICE / MIStructE) PRIOR TO USE FOR
      FABRICATION, CONSTRUCTION OR TENDER.
    </div>
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

  const footer = el('div', 'rs-footer');
  footer.innerHTML = `<span>Beaver Bridges Ltd | Engineering Toolkit</span><span>Page 1/1</span>`;

  sheet.append(head, calcMeta, body, signoff, footer);
  return sheet;
}

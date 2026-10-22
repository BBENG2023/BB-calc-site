// ui.js — tabbed input UI (customUI hook), results dashboard
// (renderResults hook), design-file save/load, presets, global stability
// and auto-size runners, drawings and exports.

import { createTabs } from '../../js/tabs.js';
import { createTable } from '../../js/table-input.js';
import { saveJSON, loadJSON, saveCSV, saveSVG } from '../../js/file-io.js';
import { escapeHtml, fmt } from '../../js/formatters.js';
import { LOAD_STANDARDS, LOAD_UNITS } from './schema.js';
import { bothEndsFixed, endBearings } from './actions.js';
import { DISPERSION_MODES } from './dispersion.js';
import { blankState, newEnd } from './schema.js';
import { saveHeaderDetails } from '../../js/header-details.js';
import { FIELDS, getPath, setPath, clone, migrate, inputHash, REACTION_GROUPS, STRATUM_CLASSES, GRANULAR_TYPES, SIMPLE_SOILS, newSimpleBorehole, newCourse, newReaction, ALL_BLOCK_TYPES } from './schema.js';
import { expandSimpleBorehole } from './ground.js';
import { BRIDGE_RANGES, libraryDesign } from '../../js/bridge-library.js';
import { PRESETS, bbStandard } from './presets.js';
import { FACTOR_PRESETS, FILL_MATERIALS } from '../../js/shared-data.js';
import { evaluate } from './engine.js';
import { SLOPE_CASES, runSlopeCase, slopeExport } from './slope.js';
import { autoSizeSteps, familyCourses } from './optimise.js';
import { allDrawings, diagramD2, drawingD3b } from './drawings.js';
import { detectBank } from './crossing.js';
import { defaultClauses, defaultDRA } from './spec.js';
import { defaultL_mm } from './layout.js';
import { parseSPT } from '../../js/geo-core.js';

const AUTOSAVE_KEY = 'bb-legato-abutment-state';
const e = escapeHtml;
const tick = () => new Promise((r) => setTimeout(r, 0));
const bridgeMode = (s) => s.project.mode === 'bridge';

export function loadInitialState() {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* fall through to the preset */ }
  return bbStandard();
}

let saveTimer = null;
function autosave(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }, 400);
}

function h(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

// --- Change indicators ---------------------------------------------------------------
// Utilisations from the previous and the current run, so each bar can show
// "0.87 → 1.32 ▲" after a change. Rolled once per new set of inputs.
let utilPrev = {}, utilCur = {}, utilHash = null;
function rollUtil(D) {
  if (D.hash === utilHash) return;
  utilHash = D.hash;
  utilPrev = utilCur;
  utilCur = { max: D.maxUtil };
  D.ends.forEach((x) => x.util.forEach((u) => { utilCur[`${x.endIdx}-${u.id}`] = u.util; }));
}
function deltaTxt(key, cur) {
  const p = utilPrev[key];
  if (p === undefined || !Number.isFinite(p) || !Number.isFinite(cur) || Math.abs(p - cur) < 0.0005) return null;
  return { text: `${fmt(p, 2)} → ${fmt(cur, 2)} ${cur > p ? '▲' : '▼'}`, up: cur > p };
}

// --- Defaults, clause references and the per-step registry -----------------------------

let rendered = null; // fields rendered on the current step (for "Reset this step")
let DEFAULTS = null;
function defaultsRoot() {
  if (!DEFAULTS) { DEFAULTS = blankState(); DEFAULTS.ends = [newEnd(1), newEnd(2)]; }
  return DEFAULTS;
}
// Path from the state to a nested input object (e.g. ends.0.arrangement.dispersion).
function locate(obj, target, prefix = '', depth = 0) {
  if (obj === target) return prefix;
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  for (const k of Object.keys(obj)) {
    if (k === 'cache' || k === 'boreholes' || k === 'reactions' || k === 'profile') continue;
    const v = obj[k];
    if (v && typeof v === 'object') {
      const r = locate(v, target, prefix ? `${prefix}.${k}` : k, depth + 1);
      if (r !== null) return r;
    }
  }
  return null;
}
function defaultFor(state, target, path) {
  const base = locate(state, target);
  if (base === null) return undefined;
  const full = base ? `${base}.${path}` : path;
  return getPath(defaultsRoot(), full);
}

// Clause and source for the ⓘ tooltip (one line each).
const CLAUSES = {
  'loads.surcharge': 'BS 8002:2015 / PD 6694-1 — 10 kPa pedestrian, 20 kPa vehicular approach surcharge.',
  'loads.surchargeSetback': 'Surcharge starts this far behind the ballast wall.',
  'fill.phi': 'BS EN 1997-1 2.4.5.2 — characteristic φ′ of the backfill; justify values above 40°.',
  'fill.gamma': 'BS EN 1997-1 2.4.5.2 — characteristic bulk unit weight of the backfill.',
  'project.slidingMu': 'BS EN 1337-2 Table 11 (PTFE) or supplier value — free-bearing friction μ.',
  'project.freeboardRequired': 'Regulator requirement (e.g. EA 600 mm) — soffit above DFL.',
  'project.designLife': 'BS EN 1990 Table 2.1 — design working life.',
  'settlementLimit': 'BS EN 1997-1 2.4.8 and Annex H — total settlement limit at this end.',
  'basis.settlementDiffLimit': 'BS EN 1997-1 Annex H — differential settlement between the abutments.',
  'basis.tiltLimit': 'BS EN 1997-1 Annex H — rotation of the base (1 in …).',
  'basis.transDiffLimit': 'Bridge supplier — differential settlement between bearings at one end.',
  'formationMuOverride': 'BS EN 1997-1 6.5.3(10) — interface friction; override needs a justification.',
  'arrangement.pad.thk': 'Type 1 pad 150–500 mm; spread through it at basis.spread V:1H.',
  'arrangement.L_mm': 'Transverse length of the abutment along the face.',
  'crossing.DFL': 'Flood study / regulator — design flood level with climate change allowance.',
  'gwUser': 'BS EN 1997-1 2.4.6.1 — design groundwater level (highest credible).',
  'arrangement.dispersion.angleRatio': 'Load spread per course, capped by the bond overlap.',
};

// --- Generic field ----------------------------------------------------------------

function field(def, target, state, end, onChange) {
  if (def.bridgeOnly && !bridgeMode(state)) return null;
  if (def.showIf && !def.showIf(state, end)) return null;
  const wrap = h('div', `field${def.type === 'checkbox' ? ' field-check' : ''}`);
  const id = `lg-${Math.random().toString(36).slice(2, 9)}`;
  const label = h('label', null, `${e(def.label)}${def.unit ? ` <span class="field-unit">(${e(def.unit)})</span>` : ''}`);
  label.htmlFor = id;
  const val = getPath(target, def.path);
  let input;
  if (def.type === 'select') {
    input = document.createElement('select');
    def.options.forEach(([v, l]) => { const o = document.createElement('option'); o.value = String(v); o.textContent = l; input.append(o); });
    input.value = String(val ?? '');
    input.addEventListener('change', () => { setPath(target, def.path, def.numeric ? Number(input.value) : input.value); onChange(def.rebuild ? 'rebuild' : true); });
  } else if (def.type === 'checkbox') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!val;
    input.addEventListener('change', () => { setPath(target, def.path, input.checked); onChange(true); });
  } else if (def.type === 'text') {
    input = document.createElement('input');
    input.type = 'text';
    input.value = val ?? '';
    input.addEventListener('input', () => { setPath(target, def.path, input.value); onChange(false); });
  } else if (def.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = def.rows || 3;
    input.value = val ?? '';
    input.addEventListener('input', () => { setPath(target, def.path, input.value); onChange(false); });
  } else {
    input = document.createElement('input');
    input.type = 'number';
    input.step = def.step ?? 'any';
    if (def.min !== undefined) input.min = def.min;
    if (def.max !== undefined) input.max = def.max;
    input.value = val === null || val === undefined ? '' : String(val);
    if (def.nullable) input.placeholder = 'blank = auto';
    input.addEventListener('input', () => {
      if (input.value === '') { setPath(target, def.path, def.nullable ? null : 0); onChange(false); return; }
      const n = Number(input.value);
      if (Number.isFinite(n)) { setPath(target, def.path, n); onChange(false); }
    });
  }
  input.id = id;
  // Overridable fields: red outline and a justification marker when the value
  // departs from the default; re-render on change so the justification box shows.
  if (def.override !== undefined) {
    const isOv = def.override === true ? val !== null && val !== undefined && val !== '' : val !== null && val !== undefined && val !== '' && Number(val) !== def.override;
    if (isOv) {
      wrap.classList.add('lg-overridden');
      label.innerHTML += ' <span class="lg-ov-flag" title="Override — needs a justification">⚑ override</span>';
    }
    input.addEventListener('change', () => onChange(true));
  }
  // ⓘ tooltip (clause + one-line explanation) and ↺ reset to default.
  const tip = CLAUSES[def.path] || def.help;
  if (tip) {
    const info = h('button', 'lg-info', 'ⓘ');
    info.type = 'button';
    info.setAttribute('aria-label', `About ${def.label}: ${tip}`);
    info.dataset.tip = tip;
    label.append(' ', info);
  }
  const dflt = def.type === 'text' || def.type === 'textarea' ? undefined : defaultFor(state, target, def.path);
  const hasDefault = dflt !== undefined;
  if (rendered) rendered.push({ target, path: def.path, def: dflt, hasDefault });
  if (hasDefault && JSON.stringify(val ?? null) !== JSON.stringify(dflt ?? null)) {
    const rs = h('button', 'lg-reset', '↺');
    rs.type = 'button';
    rs.title = `Reset to default (${dflt === null ? 'blank' : dflt})`;
    rs.setAttribute('aria-label', `Reset ${def.label} to default`);
    rs.addEventListener('click', () => { setPath(target, def.path, clone(dflt)); onChange(true); });
    label.append(' ', rs);
  }
  const sl = def.type === undefined || def.type === 'number' ? (def.slider || SLIDERS[def.path]) : null;
  if (sl) {
    wrap.classList.add('field-slider');
    wrap.append(label, sliderPair(input, sl, (n) => { setPath(target, def.path, n); onChange(false); }, typeof dflt === 'number' ? dflt : null));
    if (def.help) { wrap.append(h('div', 'field-help', e(def.help))); input.title = def.help; }
    return wrap;
  }
  if (def.type === 'checkbox') { wrap.append(input, label); } else { wrap.append(label, input); }
  if (def.help) { wrap.append(h('div', 'field-help', e(def.help))); input.title = def.help; }
  return wrap;
}

// Range slider kept in step with a number box. `sl` = [min, max, step].
// The number box still accepts values outside the slider range.
function sliderPair(numInput, [min, max, step], set, dflt = null) {
  const box = h('div', 'lg-slider');
  const col = h('div', 'lg-slider-col');
  const r = document.createElement('input');
  r.type = 'range';
  r.min = min; r.max = max; r.step = step;
  r.value = numInput.value === '' ? min : numInput.value;
  r.setAttribute('aria-label', 'Adjust with slider');
  // Default marker (tick) and the range limits under the track.
  if (dflt !== null && dflt >= min && dflt <= max) {
    const dl = document.createElement('datalist');
    dl.id = `lg-dl-${Math.random().toString(36).slice(2, 9)}`;
    const o = document.createElement('option'); o.value = dflt; dl.append(o);
    r.setAttribute('list', dl.id);
    col.append(dl);
  }
  r.addEventListener('input', () => { numInput.value = r.value; set(Number(r.value)); });
  numInput.addEventListener('input', () => { if (numInput.value !== '') r.value = numInput.value; });
  const lim = h('div', 'lg-slider-lim', `<span>${min}</span>${dflt !== null && dflt >= min && dflt <= max ? `<span class="lg-slider-def">default ${dflt}</span>` : ''}<span>${max}</span>`);
  col.prepend(r);
  col.append(lim);
  box.append(col, numInput);
  return box;
}

// Sliders for fields with a natural working range (number box still free).
const SLIDERS = {
  'project.designLife': [1, 120, 1],
  'project.freeboardRequired': [0, 1.5, 0.05],
  'project.dMin': [0, 1.5, 0.05],
  'project.skew': [0, 45, 0.5],
  'project.slidingMu': [0, 0.5, 0.01],
  'loads.surcharge': [0, 30, 0.5],
  'loads.surchargePsi0': [0, 1, 0.05],
  'loads.surchargeSetback': [0, 5, 0.1],
  'loads.waterHead': [0, 3, 0.05],
  'loads.hydraulic.vm': [0, 5, 0.1],
  'loads.plant.pressure': [0, 200, 5],
  'loads.plant.offset': [0, 10, 0.1],
  'crossing.regulatoryBuffer': [0, 20, 0.5],
  'crossing.scourMargin': [0, 1.5, 0.05],
  'crossing.minSetback': [0, 5, 0.1],
  'crossing.thetaInf': [10, 60, 0.5],
  'scour.ds': [0, 3, 0.05],
  'settlementLimit': [5, 100, 1],
  'fill.gamma': [16, 23, 0.1],
  'fill.gammaSat': [17, 24, 0.1],
  'fill.phi': [25, 45, 0.5],
  'arrangement.L_mm': [1600, 12000, 400],
  'arrangement.Bmax_mm': [1600, 9600, 400],
  'arrangement.shelf_mm': [1200, 3200, 400],
  'arrangement.maxSetback': [0, 5, 0.25],
  'arrangement.pad.thk': [0, 500, 25],
  'arrangement.pad.overhangFront': [0, 1000, 50],
  'arrangement.pad.overhangRear': [0, 1000, 50],
  'arrangement.kpMob': [0, 1, 0.05],
  'arrangement.groutBed': [0, 100, 5],
  'arrangement.bearingGrout': [0, 50, 1],
  'basis.muBlock': [0.3, 0.8, 0.01],
  'basis.muConcrete': [0.3, 0.8, 0.01],
  'basis.spread': [1, 4, 0.5],
  'basis.baseInclination': [0, 5, 0.1],
  'basis.coulombDeltaRatio': [0, 0.667, 0.01],
  'basis.backfillSlope': [0, 30, 0.5],
  'basis.settlementDiffLimit': [5, 50, 1],
  'basis.tiltLimit': [100, 1000, 50],
  'basis.transDiffLimit': [2, 30, 1],
  'basis.nibEta': [0, 1, 0.05],
};

function fieldset(title, defs, target, state, end, onChange, cls = '') {
  const fs = h('fieldset', `lg-fieldset ${cls}`);
  fs.append(h('legend', null, e(title)));
  const grid = h('div', 'lg-grid');
  defs.forEach((d) => { const f = field(d, target, state, end, onChange); if (f) grid.append(f); });
  fs.append(grid);
  return fs;
}

const pick = (defs, paths) => defs.filter((d) => paths.includes(d.path));
const omit = (defs, paths) => defs.filter((d) => !paths.includes(d.path));

// --- customUI --------------------------------------------------------------------

export function customUI(container, state, api) {
  container.innerHTML = '';
  container.classList.add('lg-ui');
  state.ui = state.ui || {};
  const quick = state.ui.view !== 'full';
  let tabs;
  const live = {}; // per-panel refresh hooks, called after each recalculation
  const onChange = (structural) => {
    autosave(state);
    if (structural === 'rebuild') { api.rebuild(); api.recalcNow(); return; }
    api.scheduleRecalc();
    if (structural && tabs) tabs.rerender();
  };
  const activeEnd = () => (bridgeMode(state) ? state.ui.activeEnd || 0 : 0);
  const E = () => state.ends[activeEnd()];

  // Toolbar: view switch, end switch, live status, file menu.
  const tb = h('div', 'lg-toolbar');
  const view = h('div', 'lg-seg lg-view');
  view.setAttribute('role', 'group');
  view.setAttribute('aria-label', 'View');
  [['quick', 'Quick design'], ['full', 'Full detail']].forEach(([k, l]) => {
    const on = (k === 'quick') === quick;
    const b = h('button', `lg-seg-btn${on ? ' on' : ''}`, l);
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = k === 'quick' ? 'Seven guided steps with sliders — the usual inputs only' : 'Every input, in eight tabs';
    b.addEventListener('click', () => {
      if (on) return;
      state.ui.view = k;
      state.ui.activeTab = k === 'quick' ? 'q-project' : 'project';
      autosave(state);
      api.rebuild();
      api.recalcNow();
    });
    view.append(b);
  });
  tb.append(view);
  if (bridgeMode(state)) {
    const seg = h('div', 'lg-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Active end');
    [0, 1].forEach((i) => {
      const b = h('button', `lg-seg-btn${activeEnd() === i ? ' on' : ''}`, e(state.ends[i].label || `End ${i + 1}`));
      b.type = 'button';
      b.setAttribute('aria-pressed', activeEnd() === i ? 'true' : 'false');
      b.addEventListener('click', () => { state.ui.activeEnd = i; [...seg.children].forEach((c, j) => { c.classList.toggle('on', j === i); c.setAttribute('aria-pressed', j === i ? 'true' : 'false'); }); tabs.rerender(); api.recalcNow(); });
      seg.append(b);
    });
    tb.append(h('span', 'lg-toolbar-label', 'Editing'), seg);
  }
  const chip = h('button', 'lg-live', 'Calculating…');
  chip.type = 'button';
  chip.title = 'Go to the results';
  chip.addEventListener('click', () => document.querySelector('.results-panel')?.scrollIntoView({ behavior: 'smooth' }));
  tb.append(chip);

  const menu = h('details', 'lg-menu');
  menu.append(h('summary', null, 'File ▾'));
  const mbox = h('div', 'lg-menu-box');
  const presetSel = document.createElement('select');
  presetSel.setAttribute('aria-label', 'Preset');
  PRESETS.forEach((pr) => { const o = document.createElement('option'); o.value = pr.key; o.textContent = pr.label; presetSel.append(o); });
  const loadPreset = h('button', 'btn secondary btn-sm', 'Start from preset');
  loadPreset.type = 'button';
  loadPreset.addEventListener('click', () => {
    if (!window.confirm('Replace the current design with this preset? Unsaved changes will be lost.')) return;
    const pr = PRESETS.find((x) => x.key === presetSel.value);
    const next = pr.build();
    next.ui = { ...(next.ui || {}), view: state.ui.view, activeTab: state.ui.activeTab };
    api.replaceState(next);
  });
  const save = h('button', 'btn btn-sm', 'Save design file (.json)');
  save.type = 'button';
  save.addEventListener('click', () => {
    const name = (api.headerDetails?.projectNo || 'legato-abutment').replace(/[^\w-]+/g, '_');
    saveJSON(`${name}-design.json`, state);
  });
  const load = h('button', 'btn secondary btn-sm', 'Open design file');
  load.type = 'button';
  load.addEventListener('click', async () => {
    try { api.replaceState(await loadJSON({ migrate })); api.toast('Design file loaded'); } catch (err) { if (err.message !== 'No file chosen') window.alert(err.message); }
  });
  mbox.append(h('span', 'lg-toolbar-label', 'Preset'), presetSel, loadPreset, save, load,
    h('p', 'field-help', 'Auto-saved in this browser only. Save a design file to keep or share it.'));
  menu.append(mbox);
  tb.append(menu);
  container.append(tb);

  const T = [];
  if (quick) {
    T.push({ key: 'q-project', label: '1 Project', need: 'You need: the project number and title, and who is designing it.', render: (p) => renderQuickProject(p, state, onChange, api) });
    T.push({ key: 'q-bridge', label: '2 Bridge & bearings', need: bridgeMode(state) ? 'You need: the bridge type and span, and the bearing layout and fixity from the supplier’s GA.' : 'Retaining-wall mode — no bridge.', render: (p) => renderQuickBridge(p, state, onChange, api) });
    T.push({ key: 'q-loads', label: '3 Loads', need: 'You need: the supplier’s reaction schedule (check its units), the load model and the approach surcharge.', render: (p) => renderQuickLoads(p, state, onChange, api) });
    T.push({ key: 'q-ground', label: '4 Ground', need: 'You need: seat and road levels, ground and water levels (GA, topographic survey, flood study) and the borehole logs.', render: (p) => renderQuickGround(p, state, E(), activeEnd(), onChange, api, live) });
    T.push({ key: 'q-size', label: '5 Arrangement', need: 'Press Auto-size, or drag the sliders. The section, the load path and the checks update as you go.', render: (p) => renderQuickSize(p, state, E(), activeEnd(), onChange, api, live) });
    T.push({ key: 'q-limits', label: '6 Limits & overrides', need: 'Use the bridge supplier’s settlement limits. Any override needs a written justification.', render: (p) => renderQuickLimits(p, state, onChange, api, live) });
    T.push({ key: 'q-results', label: '7 Results', need: 'Clear everything in the list, run global stability, then print the report.', render: (p) => renderQuickResults(p, state, api, live) });
  } else {
    T.push({ key: 'project', label: '1 Project & bridge', render: (p) => renderProject(p, state, onChange) });
    T.push({ key: 'loads', label: '2 Loads', render: (p) => renderLoads(p, state, onChange, api) });
    T.push({ key: 'crossing', label: bridgeMode(state) ? '3 Crossing & levels' : '3 Levels', render: (p) => renderCrossing(p, state, E(), activeEnd(), onChange, api) });
    T.push({ key: 'ground', label: '4 Ground', render: (p) => renderGround(p, state, E(), activeEnd(), onChange, api) });
    T.push({ key: 'arrangement', label: '5 Arrangement', render: (p) => renderArrangement(p, state, E(), activeEnd(), onChange, api) });
    T.push({ key: 'basis', label: '6 Design basis', render: (p) => renderBasis(p, state, E(), onChange) });
    T.push({ key: 'spec', label: '7 Spec & DRA', render: (p) => renderSpec(p, state, onChange, api) });
    T.push({ key: 'drawings', label: '8 Drawings & exports', render: (p) => renderDrawings(p, state, api) });
  }
  // Every panel: a "you need" line at the top, Back / Next at the bottom.
  const go = (k) => { tabs.show(k); tabs.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const wrapped = T.map((t, i) => ({
    ...t,
    render: (p) => {
      Object.keys(live).forEach((k) => delete live[k]);
      if (t.need) p.append(h('p', 'lg-need', e(t.need)));
      rendered = [];
      t.render(p);
      const mine = rendered;
      rendered = null;
      const nav = h('div', 'lg-stepnav');
      const resettable = mine.filter((r) => r.hasDefault);
      if (resettable.length) {
        const rs = h('button', 'btn secondary btn-xs lg-step-reset', '↺ Reset this step');
        rs.type = 'button';
        rs.title = 'Set every input on this step back to its default';
        rs.addEventListener('click', () => {
          if (!window.confirm(`Reset the ${resettable.length} inputs on this step to their defaults?`)) return;
          resettable.forEach((r) => setPath(r.target, r.path, clone(r.def)));
          onChange(true);
        });
        p.append(rs);
      }
      if (i > 0) { const b = h('button', 'btn secondary btn-sm', `← ${e(T[i - 1].label)}`); b.type = 'button'; b.addEventListener('click', () => go(T[i - 1].key)); nav.append(b); }
      nav.append(h('span', 'lg-stepnav-pos', `Step ${i + 1} of ${T.length}`));
      if (i < T.length - 1) { const b = h('button', 'btn btn-sm', `${e(T[i + 1].label)} →`); b.type = 'button'; b.addEventListener('click', () => go(T[i + 1].key)); nav.append(b); }
      p.append(nav);
    },
  }));
  tabs = createTabs(wrapped, { active: state.ui.activeTab, onSwitch: (k) => { state.ui.activeTab = k; } });
  container.append(tabs);

  const strip = h('div', 'lg-strip');
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  container.append(strip);
  const refresh = (out) => {
    const D = out?.design;
    if (D) {
      const w = D.ends.flatMap((x) => x.util.filter((u) => !u.info).map((u) => ({ ...u, end: x.label, key: `${x.endIdx}-${u.id}` }))).sort((a, b) => b.util - a.util)[0];
      const dm = deltaTxt('max', D.maxUtil);
      const vs = D.blocked.length ? 'blocked' : out.verdict?.pass ? 'pass' : 'fail';
      strip.className = `lg-strip ${vs}`;
      strip.innerHTML = `<span class="lg-strip-v">${vs === 'pass' ? '✓ PASS' : vs === 'blocked' ? '⛔ NOT VALID' : '✗ FAIL'}</span><span class="lg-strip-u">${fmt(D.maxUtil, 2)}${dm ? ` <span class="lg-delta ${dm.up ? 'up' : 'down'}">${e(dm.text)}</span>` : ''}</span>${w ? `<span class="lg-strip-g">${e(w.id)} ${e(w.title)}${D.bridge ? ` · ${e(w.end)}` : ''}${w.zone ? ` · ${e(w.zone.split(',')[0])}` : ''}</span>` : ''}${D.blocked.length ? `<span class="lg-strip-b">${D.blocked.length} to resolve</span>` : ''}`;
      const worst = D.ends.flatMap((x) => x.util.filter((u) => !u.info).map((u) => ({ ...u, end: x.label }))).sort((a, b) => b.util - a.util)[0];
      chip.className = `lg-live ${D.blocked.length ? 'fail' : out.verdict?.pass ? 'pass' : 'fail'}`;
      chip.innerHTML = `<strong>${out.verdict?.pass ? 'PASS' : 'FAIL'}</strong> ${fmt(D.maxUtil, 2)}${worst ? ` <span>${e(worst.id)} ${e(worst.title)}${D.bridge ? ` · ${e(worst.end)}` : ''}</span>` : ''}`;
      const st = stepStatus(state, D, quick);
      tabs.querySelectorAll('.tab-btn').forEach((b) => {
        const k = st[b.dataset.key];
        b.classList.toggle('st-ok', k === 'ok');
        b.classList.toggle('st-warn', k === 'warn');
        b.title = k === 'ok' ? 'Looks complete' : k === 'warn' ? 'Needs attention' : '';
      });
    }
    Object.values(live).forEach((fn) => fn(out));
    if (tabs.current() === 'drawings') tabs.rerender();
  };
  api.onRecalc?.(refresh);
  if (api.getOutput()?.design) refresh(api.getOutput());
}

// Tick or warning per step, from the latest results.
function stepStatus(state, D, quick) {
  const lib = state.loads.library;
  const libOk = !bridgeMode(state) || (lib?.range && lib.range !== 'bespoke' ? !!lib.row : state.loads.reactions.length > 0);
  const modelsOk = !D.blocked.some((b) => /Load model|thermal restraint|reactions/i.test(b));
  const levelsOk = D.ends.every((x) => x.levels?.status !== 'fail') && !D.blocked.some((b) => /DFL|seat level|X5/.test(b));
  const groundOk = D.ends.every((x) => state.ends[x.endIdx].groundMode === 'manual' || state.boreholes.some((b) => b.end === `End ${x.endIdx + 1}` || b.end === 'Both'));
  const sizeOk = D.ends.every((x) => x.util.filter((u) => !u.info && !/^E6/.test(u.id)).every((u) => u.util <= 1)) && !D.blocked.some((b) => /auto-size/.test(b));
  const limitsOk = D.ends.every((x) => x.util.filter((u) => /^E6/.test(u.id)).every((u) => u.util <= 1)) && !(D.overrides || []).some((o) => o.status !== 'applied');
  const allOk = D.pass;
  const s = (ok) => (ok ? 'ok' : 'warn');
  return quick
    ? { 'q-project': s(true), 'q-bridge': s(libOk && !D.blocked.some((b) => /thermal restraint/.test(b))), 'q-loads': s(libOk && modelsOk), 'q-ground': s(groundOk && levelsOk), 'q-size': s(sizeOk), 'q-limits': s(limitsOk), 'q-results': s(allOk) }
    : { project: s(libOk), loads: s(libOk && modelsOk), crossing: s(levelsOk), ground: s(groundOk), arrangement: s(sizeOk) };
}

// --- Quick design steps -----------------------------------------------------------------

// Step 1 — project details (the sheet header) and design status.
function renderQuickProject(p, state, onChange, api) {
  const hd = api.headerDetails || {};
  const fs = h('fieldset', 'lg-fieldset');
  fs.append(h('legend', null, 'Project details (printed in the sheet header)'));
  const grid = h('div', 'lg-grid');
  [['projectNo', 'Project number'], ['projectTitle', 'Project title'], ['engineerInitials', 'Engineer (initials)'], ['checkedCategory', 'Design check category'], ['date', 'Date']].forEach(([k, l]) => {
    const w = h('div', 'field');
    const id = `lg-hd-${k}`;
    const lab = h('label', null, e(l));
    lab.htmlFor = id;
    const i = document.createElement('input');
    i.type = 'text'; i.id = id; i.value = hd[k] || '';
    if (k === 'date') i.placeholder = 'blank = today';
    if (!i.value && k !== 'date') w.classList.add('lg-missing');
    i.addEventListener('input', () => { hd[k] = i.value; saveHeaderDetails(hd); w.classList.toggle('lg-missing', !i.value && k !== 'date'); api.scheduleRecalc(); });
    w.append(lab, i);
    grid.append(w);
  });
  fs.append(grid, h('p', 'field-help', 'Blank project fields print as “PROJECT DETAILS MISSING”. Saved in this browser and shared with the other calcs.'));
  p.append(fs);
  p.append(fieldset('Design', FIELDS.project.filter((d) => ['project.mode', 'project.status', 'project.designLife'].includes(d.path)), state, state, null, onChange));
}

// Step 2 — bridge, geometry and bearings.
function renderQuickBridge(p, state, onChange, api) {
  if (!bridgeMode(state)) { p.append(h('p', 'field-help', 'Retaining-wall mode: no bridge. Go to Loads.')); return; }
  p.append(renderBridgeLibrary(state, onChange, api));
  const det = h('details', 'lg-more');
  det.open = !usingLibrary(state);
  det.append(h('summary', null, usingLibrary(state) ? 'Bridge geometry — set from the standard bridge (open to adjust)' : 'Bridge geometry'));
  det.append(fieldset('Bridge geometry', pick(FIELDS.project, ['project.span', 'project.deckWidth', 'project.bearingsPerEnd', 'project.bearingCentres', 'project.bearingPlateL', 'project.bearingPlateB', 'project.bearingHeight', 'project.skew']), state, state, null, onChange));
  p.append(det);
  p.append(fieldset('Fixity', pick(FIELDS.project, ['project.fixedEnd', 'project.slidingMu']), state, state, null, onChange));
  renderBearings(p, state, onChange);
  if (bothEndsFixed(state)) p.append(renderThermalRestraint(state, onChange));
}

// Step 3 — loads (schedule, units, models, approach surcharge).
function renderQuickLoads(p, state, onChange, api) {
  renderLoads(p, state, onChange, api, true, true);
  const qb = h('div', 'lg-quickset');
  qb.append(h('span', 'lg-toolbar-label', 'Surcharge'));
  [[10, 'Pedestrian 10 kPa'], [20, 'Vehicular 20 kPa']].forEach(([q, l]) => {
    const b = h('button', `btn ${state.loads.surcharge === q ? '' : 'secondary '}btn-xs`, l);
    b.type = 'button';
    b.addEventListener('click', () => { state.loads.surcharge = q; onChange(true); });
    qb.append(b);
  });
  p.append(qb);
}

// Step 4 — levels, water and boreholes for the active end.
function renderQuickGround(p, state, end, idx, onChange, api, live) {
  const label = bridgeMode(state) ? end.label : 'Wall';
  const seat = Number(end.seatLevel) || 100;
  const lvl = (lo, hi) => [Math.floor((seat + lo) * 2) / 2, Math.ceil((seat + hi) * 2) / 2, 0.05];
  const main = [
    { path: 'seatLevel', label: bridgeMode(state) ? 'Bearing seat level (top of seat course)' : 'Top of wall level', unit: 'mAOD', step: 0.01 },
    { path: 'FRL', label: 'Approach road level (FRL)', unit: 'mAOD', step: 0.01, bridgeOnly: true },
    { path: 'frontGroundOverride', label: 'Ground level at the front face', unit: 'mAOD', step: 0.01, nullable: true, slider: lvl(-6, 0.5), help: bridgeMode(state) ? 'Blank = read from the long section (Full detail → Crossing & levels).' : 'Blank = from the ground profile.' },
    { path: 'gwUser', label: 'Design groundwater level', unit: 'mAOD', step: 0.01, nullable: true, slider: lvl(-10, 0), help: 'Blank = from the borehole water readings. Design level = highest of the readings and this value.' },
  ];
  p.append(fieldset(`${label} — levels`, main, end, state, end, onChange));
  if (bridgeMode(state)) {
    const X = state.crossing;
    const bed = Number(X.bedLevel) || seat - 4;
    const wl = [Math.floor((bed - 0.5) * 2) / 2, Math.ceil((seat + 0.5) * 2) / 2, 0.05];
    p.append(fieldset('Watercourse', [
      ...pick(FIELDS.crossing, ['crossing.watercourse', 'crossing.bedLevel', 'crossing.NWL']),
      { ...FIELDS.crossing.find((d) => d.path === 'crossing.DFL'), slider: wl },
      ...pick(FIELDS.crossing, ['crossing.DFLsource']),
      ...pick(FIELDS.project, ['project.freeboardRequired']),
    ], state, state, end, onChange));
    const bank = pick(FIELDS.end, ['bankCrest.ch', 'bankCrest.level', 'bankToe.ch', 'bankToe.level']);
    const fsB = fieldset(`${label} — river bank`, bank, end, state, end, onChange);
    const det = h('button', 'btn secondary btn-sm', 'Find crest and toe from the long section');
    det.type = 'button';
    det.addEventListener('click', () => {
      const b = detectBank(state, idx);
      if (b) { end.bankCrest = { ...b.crest }; end.bankToe = { ...b.toe }; onChange(true); api.toast('Bank crest and toe found — check them'); }
    });
    fsB.append(det);
    p.append(fsB);
  }
  const ro = h('p', 'lg-readout', 'Calculating…');
  p.append(ro);
  live.site = (o) => {
    const x = o?.design?.ends?.find((q) => q.endIdx === idx);
    if (x) ro.textContent = `${label}: formation ${fmt(x.levels.formation, 2)} mAOD · pad ${Math.round(x.levels.padThk * 1000)} mm · ${x.layout.n} courses · founding on ${x.geom.founding.desc || x.geom.founding.cls}`;
  };
  if (api.getOutput()?.design) live.site(api.getOutput());
  p.append(h('h3', 'lg-h3', 'Boreholes'));
  renderGround(p, state, end, idx, onChange, api);
}

// Step 6 — limits, overrides and what blocks the sheet.
function renderQuickLimits(p, state, onChange, api, live) {
  const ends = bridgeMode(state) ? [0, 1] : [0];
  const row = h('div', 'lg-cols');
  ends.forEach((i) => {
    const end = state.ends[i];
    row.append(fieldset(`${bridgeMode(state) ? end.label : 'Wall'} — limits and overrides`, pick(FIELDS.end, ['settlementLimit', 'settlementLimitJust', 'formationMuOverride', 'formationMuJust']), end, state, end, onChange));
  });
  p.append(row);
  p.append(fieldset('Settlement criteria (defaults — replace with the bridge supplier’s limits)', pick(FIELDS.basis, ['basis.settlementDiffLimit', 'basis.tiltLimit', 'basis.transDiffLimit', 'basis.settlementJust']), state, state, null, onChange));
  const box = h('div', 'lg-livelists');
  p.append(box);
  live.limits = (o) => {
    const D = o?.design;
    if (!D) return;
    const ov = D.overrides || [];
    box.innerHTML = `${D.blocked.length ? `<div class="lg-blocked"><strong>NOT VALID — RE-RUN / RESOLVE</strong><ul>${D.blocked.map((b) => `<li>${e(b)}</li>`).join('')}</ul></div>` : '<p class="lg-okline">✓ Nothing blocks the sheet.</p>'}
      ${ov.length ? `<div class="lg-overrides"><h4 class="lg-h4">Overrides</h4><div class="tbl-scroll"><table class="tbl-input tbl-readonly"><thead><tr><th>Item</th><th>Value</th><th>Justification</th><th>Status</th></tr></thead><tbody>${ov.map((x) => `<tr><td>${e(x.item)}</td><td>${e(String(x.value))}</td><td>${e(x.justification || '— none —')}</td><td>${x.status === 'applied' ? '⚑ applied' : x.status === 'rejected' ? '✗ rejected' : '! ignored — add a justification'}</td></tr>`).join('')}</tbody></table></div></div>` : '<p class="field-help">No overrides.</p>'}
      <div class="lg-bars">${D.ends.flatMap((x) => x.util.filter((u) => /^E6/.test(u.id)).map((u) => barRow(x, u, D))).join('')}</div>`;
  };
  if (api.getOutput()?.design) live.limits(api.getOutput());
}

// One utilisation bar with icon, value and the change since the last run.
function barRow(x, u, D) {
  const cls = u.info ? (u.flag ? 'near' : 'ok') : u.util > 1 ? 'fail' : u.util > 0.9 ? 'near' : 'ok';
  const icon = cls === 'fail' ? '✗' : cls === 'near' ? '!' : '✓';
  const val = u.info ? (u.flag ? 'CHECK DETAIL' : 'OK') : `${fmt(u.util, 2)} ${cls === 'fail' ? 'FAIL' : cls === 'near' ? 'NEAR' : 'OK'}`;
  const d = deltaTxt(`${x.endIdx}-${u.id}`, u.util);
  return `<div class="lg-bar-row" title="${e(u.zone || u.gov || '')}"><span class="lg-bar-label">${D.bridge ? `${e(x.label.replace('End ', 'E'))} · ` : ''}${e(u.id)} ${e(u.title)}</span><span class="lg-bar-track"><span class="lg-bar-fill ${cls}" style="width:${Math.min(100, (u.util / 1.2) * 100)}%"></span><span class="lg-bar-limit"></span></span><span class="lg-bar-val ${cls}"><span aria-hidden="true">${icon}</span> ${val}${d ? ` <span class="lg-delta ${d.up ? 'up' : 'down'}">${e(d.text)}</span>` : ''}</span></div>`;
}

// Reads the course table back into the BB standard family (base width B,
// rear step s, courses below the seat, seat depth, ballast wall). custom =
// true when the table does not follow the family.
function familyFromCourses(A) {
  const c = A.courses;
  const n = c.length;
  if (n < 3) return { B: Math.max(1600, (c[0]?.u_rear ?? 2400) - (c[0]?.u_front ?? 0)), s: 0, nBelow: 1, shelf: 1600, ballast: 800, frontStep: true, custom: true };
  const seat = c[n - 2], bal = c[n - 1];
  const B = c[0].u_rear - c[0].u_front;
  const upperRear = seat.u_rear;
  const ballast = bal.u_rear - bal.u_front;
  const frontStep = seat.u_front > 0;
  const fam = { B, s: B - upperRear, nBelow: n - 2, shelf: frontStep ? upperRear - seat.u_front : Math.max(1600, ballast + 800), ballast, frontStep };
  const regen = familyCourses({ ...fam, orient: c[0].orient });
  const same = c[0].u_front === 0 && regen.every((r, i) => r.u_front === c[i].u_front && r.u_rear === c[i].u_rear && c[i].v_start == null && c[i].v_end == null && c[i].height === 800);
  return { ...fam, custom: !same };
}

function renderQuickSize(p, state, end, idx, onChange, api, live) {
  const A = end.arrangement;
  const label = bridgeMode(state) ? end.label : 'Wall';
  const top = h('div', 'lg-autobox');
  const auto = h('button', 'btn', `Auto-size ${e(label)}`);
  auto.type = 'button';
  auto.disabled = !bridgeMode(state);
  const msg = h('span', 'field-help', bridgeMode(state) ? 'Finds the smallest arrangement that passes every check. Takes a few seconds.' : 'Auto-size is for bridge bank seats. Use the sliders.');
  auto.addEventListener('click', () => {
    auto.disabled = true;
    runAuto(state, api, idx, (f, t) => { msg.textContent = t; });
  });
  top.append(auto, msg);
  const as = state.cache?.autosize?.[idx];
  if (as) top.append(h('p', 'field-help', `<strong>Last auto-size:</strong> ${e(as.why)}`));
  p.append(top);

  const f = familyFromCourses(A);
  if (f.custom) p.append(h('p', 'lg-mod', 'The course table has been edited in Full detail. Moving a slider replaces it with the standard stepped arrangement.'));
  const grid = h('div', 'lg-sizer');
  const readout = h('p', 'lg-readout');
  const ctrls = {};
  const sync = () => {
    Object.entries(ctrls).forEach(([k, c]) => { c.r.value = f[k]; c.out.textContent = c.fmtV(f[k]); });
    readout.textContent = `${f.nBelow + 2} courses: ${f.nBelow} below the seat (base ${fmt(f.B / 1000, 1)} m${f.s ? `, stepped to ${fmt((f.B - f.s) / 1000, 1)} m above` : ''}), seat ${fmt(f.shelf / 1000, 1)} m deep, ballast wall ${f.ballast} mm.`;
  };
  const apply = () => {
    f.shelf = Math.max(f.shelf, f.ballast + 800);
    if (f.B - f.s < f.shelf) f.B = Math.ceil((f.shelf + f.s) / 400) * 400;
    A.courses = familyCourses({ B: f.B, s: f.s, nBelow: f.nBelow, shelf: f.shelf, frontStep: f.frontStep, ballast: f.ballast, orient: A.courses[0]?.orient || 'Mixed' });
    A.mode = 'check';
    sync();
    onChange(false);
  };
  const slider = (key, lab, min, max, step, fmtV, help) => {
    const w = h('div', 'field field-slider');
    const id = `lgq-${key}`;
    const l = h('label', null, `${e(lab)} <output class="lg-val"></output>`);
    l.htmlFor = id;
    const r = document.createElement('input');
    r.type = 'range'; r.id = id; r.min = min; r.max = max; r.step = step;
    r.addEventListener('input', () => { f[key] = Number(r.value); apply(); });
    w.append(l, r);
    if (help) w.append(h('div', 'field-help', e(help)));
    ctrls[key] = { r, out: l.querySelector('output'), fmtV };
    grid.append(w);
  };
  slider('B', 'Base width B', 1600, Math.max(6400, A.Bmax_mm || 6400, f.B), 400, (v) => `${fmt(v / 1000, 1)} m`, 'Front to back of the bottom course.');
  slider('nBelow', 'Courses below the seat', 1, 8, 1, (v) => `${v} — overall ${fmt((v + 2) * 0.8, 1)} m high`);
  slider('s', 'Rear step above the bottom course', 0, 1600, 400, (v) => (v ? `${v} mm (fill sits on the heel)` : 'none'));
  slider('shelf', 'Seat depth', 1600, 3200, 400, (v) => `${fmt(v / 1000, 1)} m`, 'Front-to-back depth of the seat course: ballast wall + bearing shelf (≥ 800 mm).');
  slider('ballast', 'Ballast wall thickness', 800, 1200, 400, (v) => `${v} mm`);

  const lw = h('div', 'field field-slider');
  const ll = h('label', null, 'Abutment length L (along the face) <output class="lg-val"></output>');
  ll.htmlFor = 'lgq-L';
  const lr = document.createElement('input');
  lr.type = 'range'; lr.id = 'lgq-L'; lr.min = 1600; lr.max = Math.max(12000, A.L_mm); lr.step = 400; lr.value = A.L_mm;
  const lout = ll.querySelector('output');
  const lset = () => { lr.value = A.L_mm; lout.textContent = `${fmt(A.L_mm / 1000, 1)} m`; };
  lr.addEventListener('input', () => { A.L_mm = Number(lr.value); lset(); onChange(false); });
  const dl = h('button', 'btn secondary btn-xs', `Reset to default (${fmt(defaultL_mm(state.project) / 1000, 1)} m)`);
  dl.type = 'button';
  dl.addEventListener('click', () => { A.L_mm = defaultL_mm(state.project); lset(); onChange(false); });
  lset();
  lw.append(ll, lr, dl);
  grid.append(lw);

  const pw = h('div', 'field field-slider');
  const pl = h('label', null, 'Pad thickness <output class="lg-val"></output>');
  pl.htmlFor = 'lgq-pad';
  const pr = document.createElement('input');
  pr.type = 'range'; pr.id = 'lgq-pad'; pr.min = 0; pr.max = 500; pr.step = 25; pr.value = A.pad.thk;
  const pout = pl.querySelector('output');
  const pAuto = h('label', 'lg-check');
  const pc = document.createElement('input');
  pc.type = 'checkbox'; pc.checked = A.pad.mode === 'auto';
  pAuto.append(pc, document.createTextNode(' Set by the levels (auto)'));
  const padText = () => { pout.textContent = A.pad.mode === 'auto' ? 'auto' : `${A.pad.thk} mm${A.pad.thk === 0 ? ' (none)' : ''}`; pr.disabled = A.pad.mode === 'auto'; };
  pr.addEventListener('input', () => { A.pad.thk = Number(pr.value); padText(); onChange(false); });
  pc.addEventListener('change', () => { A.pad.mode = pc.checked ? 'auto' : 'fixed'; padText(); onChange(false); });
  padText();
  pw.append(pl, pr, pAuto);
  grid.append(pw);

  const fsS = h('fieldset', 'lg-fieldset');
  fsS.append(h('legend', null, `${label} — arrangement`));
  fsS.append(grid, readout);
  sync();
  p.append(fsS);

  p.append(fieldset(`${label} — pad width`, FIELDS.arrangement.filter((d) => ['arrangement.pad.overhangFront', 'arrangement.pad.overhangRear', 'arrangement.pad.material'].includes(d.path)), end, state, end, onChange));
  if (bridgeMode(state)) p.append(dispersionFieldset(state, end, onChange));
  p.append(fieldset(`${label} — backfill`, [
    { path: 'fill.material', label: 'Backfill material', type: 'select', options: Object.keys(FILL_MATERIALS).filter((k) => FILL_MATERIALS[k].phi).map((k) => [k, k]).concat([['User', 'User-defined']]) },
    { path: 'fill.phi', label: 'Backfill φ′k', unit: '°', min: 20, max: 45, step: 0.5 },
  ], end, state, end, (st) => {
    const m = FILL_MATERIALS[end.fill.material];
    if (st && m && m.phi) { end.fill.gamma = m.gamma; end.fill.gammaSat = m.gamma + 1; end.fill.phi = m.phi; end.fill.phiCv = m.phiCv; }
    onChange(st);
  }));

  // Live section and the worst checks, refreshed after every recalculation.
  const liveBox = h('div', 'lg-livebox');
  const fig = h('figure', 'lg-fig');
  const bars = h('div', 'lg-bars');
  liveBox.append(fig, bars);
  p.append(liveBox);
  const fig3 = h('figure', 'lg-fig lg-fig-wide');
  if (bridgeMode(state)) p.append(fig3);
  live.size = (out) => {
    const D = out?.design;
    const k = D ? D.ends.findIndex((q) => q.endIdx === idx) : -1;
    const x = D?.ends?.[k];
    if (!x) return;
    try { fig.innerHTML = diagramD2(state, D, k); } catch { fig.innerHTML = ''; }
    try { fig3.innerHTML = D.bridge ? drawingD3b(state, D, k, { compact: true }) : ''; } catch { fig3.innerHTML = ''; }
    const zl = x.dispersion?.zones?.length > 1 ? ` Load path: ${x.dispersion.mode}, ${x.dispersion.zones.filter((z) => z.kind === 'loaded').map((z) => `L_eff ${fmt(z.L, 2)} m`).join(', ')}.` : '';
    bars.innerHTML = `<p class="lg-readout">${e(x.label || label)}: ${x.layout.totalBlocks} blocks, ${fmt(x.layout.totalMassT, 1)} t, formation ${fmt(x.levels.formation, 2)} mAOD.${e(zl)} Worst six checks:</p>${[...x.util].filter((u) => !u.info).sort((a, b) => b.util - a.util).slice(0, 6).map((u) => barRow(x, u, D)).join('')}`;
  };
  const cur = api.getOutput();
  if (cur?.design) live.size(cur);
  p.append(h('p', 'field-help', 'Block types, bond, wings, pad overhangs and passive resistance are in Full detail → Arrangement.'));
}

function renderQuickResults(p, state, api, live) {
  const box = h('div');
  p.append(box);
  const figs = h('div', 'lg-livebox');
  const f2 = h('figure', 'lg-fig'), f3 = h('figure', 'lg-fig');
  figs.append(f2, f3);
  p.append(figs);
  p.append(h('p', 'field-help', 'All drawings and CSV exports are in Full detail → Drawings & exports. The design needs CEng review before acceptance.'));
  live.results = (o) => {
    const D = o?.design;
    if (!D) { box.innerHTML = '<p class="muted">Calculating…</p>'; return; }
    const items = [];
    const item = (ok, text) => items.push(`<li class="${ok ? 'ok' : 'warn'}"><span aria-hidden="true">${ok ? '✓' : '!'}</span> ${text}</li>`);
    D.blocked.forEach((b) => item(false, `<strong>Resolve:</strong> ${e(b)}`));
    item(D.ends.every((x) => x.maxUtil <= 1), `All checks at or below 1.0 (governing ${fmt(D.maxUtil, 2)}).`);
    if (D.bridge) item(!!D.slope, D.slope ? 'Global stability run and up to date.' : 'Run global stability from the results panel (a few seconds).');
    item(!D.errors.length, D.errors.length ? `${D.errors.length} input error(s) — see Warnings in the results panel.` : 'No input errors.');
    const hd = api.headerDetails || {};
    item(!!(hd.projectNo && hd.projectTitle && hd.engineerInitials), hd.projectNo && hd.projectTitle && hd.engineerInitials ? 'Project details complete.' : 'Fill in the project details (step 1).');
    item(!(D.overrides || []).some((x) => x.status !== 'applied'), (D.overrides || []).length ? `${D.overrides.length} override(s) — see step 6 and the summary sheet.` : 'No overrides.');
    box.innerHTML = `<ul class="lg-checklist">${items.join('')}</ul><div class="lg-bars">${D.ends.flatMap((x) => x.util.map((u) => barRow(x, u, D))).join('')}</div>`;
    const k = Math.min(D.ends.length - 1, state.ui.activeEnd || 0);
    try { f2.innerHTML = diagramD2(state, D, k, { compact: true }); } catch { f2.innerHTML = ''; }
    try { f3.innerHTML = D.bridge ? drawingD3b(state, D, k, { compact: true }) : ''; } catch { f3.innerHTML = ''; }
  };
  if (api.getOutput()?.design) live.results(api.getOutput());
}

// --- Tab 1 -----------------------------------------------------------------------------

const PROJECT_MAIN = ['project.mode', 'project.status', 'project.designLife', 'project.freeboardRequired', 'project.dMin'];
const usingLibrary = (state) => bridgeMode(state) && state.loads.library && state.loads.library.range && state.loads.library.range !== 'bespoke';

function renderProject(p, state, onChange) {
  p.append(fieldset('Design', FIELDS.project.filter((d) => PROJECT_MAIN.includes(d.path)), state, state, null, onChange));
  const lv = ['seatLevel', 'FRL', 'soffitOverride', 'fillSurfaceMode', 'fillSurfaceZ'];
  const row = h('div', 'lg-cols');
  (bridgeMode(state) ? [0, 1] : [0]).forEach((i) => {
    const end = state.ends[i];
    row.append(fieldset(`${bridgeMode(state) ? end.label : 'Wall'} — levels`, pick(FIELDS.end, lv).map((d) => (d.path === 'seatLevel' && !bridgeMode(state) ? { ...d, label: 'Top of wall level' } : d)), end, state, end, onChange));
  });
  p.append(row);
  if (bridgeMode(state)) {
    const det = h('details', 'lg-more');
    det.open = !usingLibrary(state);
    det.append(h('summary', null, usingLibrary(state) ? 'Bridge geometry and bearings — set from the selected standard bridge (open to adjust)' : 'Bridge geometry and bearings'));
    det.append(fieldset('Bridge geometry and bearings', FIELDS.project.filter((d) => !PROJECT_MAIN.includes(d.path)), state, state, null, onChange));
    p.append(det);
    renderBearings(p, state, onChange);
    p.append(h('p', 'field-help', 'Choose the bridge on the Loads tab — selecting a standard Beaver Bridges product fills in the span, width, bearings and loads.'));
  } else {
    p.append(h('p', 'field-help', 'Retaining-wall mode: analysis per metre run (set L = 1000 mm) or for the full length; bridge, hydraulic and crossing checks are not run.'));
  }
}

// --- Tab 2 -----------------------------------------------------------------------------

const loadSig = (L) => JSON.stringify([L.trafficModels, L.reactions]);

function applyLibrary(state, rangeKey, rowKey, loading) {
  const d = libraryDesign(rangeKey, rowKey, loading);
  if (!d) return false;
  Object.assign(state.project, d.project);
  state.loads.trafficModels = clone(d.trafficModels);
  state.loads.reactions = clone(d.reactions);
  state.loads.unit = 'kN';
  state.ends.forEach((en) => { en.bearings = []; });
  state.loads.library = { range: rangeKey, row: rowKey, loading: d.loading, sig: null };
  state.loads.library.sig = loadSig(state.loads);
  // Widen the abutments if the bridge's bearings don't fit on them.
  // Rounded to 800 so every bond pattern tiles without 400 × 400 pieces.
  const Lmin = Math.ceil(defaultL_mm(state.project) / 800) * 800;
  state.ends.forEach((en) => { if (en.arrangement.L_mm < Lmin) en.arrangement.L_mm = Lmin; });
  return true;
}

function renderBridgeLibrary(state, onChange, api) {
  const L = state.loads;
  L.library = L.library || { range: 'bespoke', row: null, sig: null };
  const fs = h('fieldset', 'lg-fieldset lg-library');
  fs.append(h('legend', null, 'Bridge'));
  const grid = h('div', 'lg-grid');
  const f1 = h('div', 'field');
  f1.append(h('label', null, 'Bridge type'));
  const rangeSel = document.createElement('select');
  rangeSel.setAttribute('aria-label', 'Bridge type');
  [['bespoke', 'Bespoke — enter loads'], ...Object.entries(BRIDGE_RANGES).map(([k, v]) => [k, v.label])].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; rangeSel.append(o); });
  rangeSel.value = L.library.range || 'bespoke';
  f1.append(rangeSel);
  grid.append(f1);
  const range = BRIDGE_RANGES[rangeSel.value];
  const f2 = h('div', 'field');
  let rowSel = null;
  if (range) {
    f2.append(h('label', null, 'Configuration'));
    rowSel = document.createElement('select');
    rowSel.setAttribute('aria-label', 'Bridge configuration');
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = '— choose span / width —'; rowSel.append(blank);
    range.rows.forEach((x) => { const o = document.createElement('option'); o.value = x.key; o.textContent = x.label; rowSel.append(o); });
    rowSel.value = L.library.range === rangeSel.value && L.library.row ? L.library.row : '';
    f2.append(rowSel);
    grid.append(f2);
  }
  let loadSel = null;
  if (range) {
    const f3 = h('div', 'field');
    f3.append(h('label', null, 'Loading required'));
    loadSel = document.createElement('select');
    loadSel.setAttribute('aria-label', 'Loading required');
    range.loadings.forEach((x) => { const o = document.createElement('option'); o.value = x.key; o.textContent = x.label; loadSel.append(o); });
    loadSel.value = L.library.range === rangeSel.value && L.library.loading ? L.library.loading : range.defaultLoading;
    f3.append(loadSel);
    f3.append(h('div', 'field-help', 'CS 454 only: braking = 0.5 × the CS 454 reaction (total, split between fixed ends), as the SSVB spec method.'));
    grid.append(f3);
  }
  fs.append(grid);

  rangeSel.addEventListener('change', () => {
    if (rangeSel.value === 'bespoke') {
      // Library model labels (e.g. a supplier's "Model 2") must not carry over
      // to a bespoke schedule — the designer chooses the load model.
      if (L.library?.row) {
        L.trafficModels.forEach((m) => { m.standard = ''; });
      }
      L.library = { range: 'bespoke', row: null, sig: null };
      onChange(true);
      return;
    }
    L.library = { range: rangeSel.value, row: null, sig: null };
    onChange(true);
  });
  if (rowSel) {
    rowSel.addEventListener('change', () => {
      if (!rowSel.value) return;
      applyLibrary(state, rangeSel.value, rowSel.value, loadSel.value);
      onChange(true);
      api.toast('Standard bridge loads and geometry applied');
    });
  }

  if (loadSel) {
    loadSel.addEventListener('change', () => {
      L.library.loading = loadSel.value;
      if (rowSel && rowSel.value) { applyLibrary(state, rangeSel.value, rowSel.value, loadSel.value); api.toast('Loading requirement applied'); }
      onChange(true);
    });
  }
  if (range && L.library.row) {
    const d = libraryDesign(L.library.range, L.library.row, L.library.loading);
    const modified = L.library.sig && L.library.sig !== loadSig(L);
    fs.append(h('p', 'field-help', `<strong>${e(d.project.bridgeDescription)}</strong> — loading: <strong>${e(d.loadingLabel)}</strong>; span ${fmt(d.project.span, 3)} m (bearing to bearing), ${d.project.fixedEnd === 0 ? 'both ends fixed' : `fixed end ${d.project.fixedEnd}`}. Source: ${e(range.source)}. ${e(d.info || '')}`));
    if (modified) fs.append(h('p', 'lg-mod', '⚠ Loads have been edited since the standard values were applied — the report will say so. Re-select the configuration to restore them.'));
    const t = h('div', 'tbl-scroll');
    t.innerHTML = `<table class="tbl-input tbl-readonly"><thead><tr><th>Characteristic load per abutment</th><th>Model</th><th class="num">Z kN</th><th class="num">X kN</th><th class="num">Y kN</th><th>Resisted at</th></tr></thead><tbody>${L.reactions.map((x) => `<tr><td>${e(x.name)}</td><td>${e(x.model || '—')}</td><td class="num">${fmt(x.Z, 1)}</td><td class="num">${x.X ? `±${fmt(x.X, 1)}` : '—'}</td><td class="num">${x.Y ? `±${fmt(x.Y, 1)}` : '—'}</td><td>${x.X ? (x.xFixedOnly && state.project.fixedEnd !== 0 ? 'fixed end' : 'each end') : ''}</td></tr>`).join('')}</tbody></table>`;
    fs.append(t);
    fs.append(h('p', 'field-help', `Vehicle models are checked one at a time (non-coexistent). Models marked “no accompanying traffic” exclude the approach surcharge and wind: ${state.loads.trafficModels.filter((m) => m.excludeSurchargeWind).map((m) => e(m.name)).join(', ') || 'none'}.`));
    const notes = h('ul', 'lg-notes');
    range.notes.forEach((n) => notes.append(h('li', null, e(n))));
    fs.append(notes);
  } else if (range) {
    fs.append(h('p', 'field-help', 'Choose the span (and width) to load the characteristic reactions and bridge geometry.'));
  } else {
    fs.append(h('p', 'field-help', 'Bespoke: enter the bridge supplier’s reactions below.'));
  }
  return fs;
}

// Both ends fixed: the deck restrains thermal movement — the designer must
// give the restraint force (not a sliding-bearing friction value).
function renderThermalRestraint(state, onChange) {
  state.loads.thermalRestraint = state.loads.thermalRestraint || { F: null, justification: '' };
  const fs = fieldset('Both ends fixed — thermal restraint (required)', [
    { path: 'F', label: 'Thermal restraint force per end', unit: 'kN', min: 0, step: 1, nullable: true, help: 'From the bearing stiffness and the thermal movement (BS EN 1991-1-5 §6), or the supplier. Not a sliding-bearing value.' },
    { path: 'justification', label: 'Source / justification', type: 'text' },
  ], state.loads.thermalRestraint, state, null, onChange, 'lg-required');
  fs.prepend(h('p', 'lg-mod', 'Both abutments have fixed bearings. The supplier schedule usually has one fixed and one sliding end — check the bearing fixity on the Bridge & bearings step.'));
  return fs;
}

// Bearing layout per end: position along the face and fixity.
function renderBearings(p, state, onChange) {
  const nb = Math.max(1, Number(state.project.bearingsPerEnd) || 1);
  const row = h('div', 'lg-cols');
  [0, 1].forEach((i) => {
    const end = state.ends[i];
    end.bearings = end.bearings || [];
    const L = (end.arrangement.L_mm || 4800) / 1000;
    const auto = endBearings(state, i, L, 0);
    while (end.bearings.length < nb) end.bearings.push({ v_mm: null, fixity: '' });
    end.bearings.length = nb;
    const fs = h('fieldset', 'lg-fieldset');
    fs.append(h('legend', null, `${e(end.label)} — bearings`));
    const tbl = createTable({
      columns: [
        { key: 'v_mm', label: 'v from abutment end', type: 'number', unit: 'mm', step: 50, nullable: true },
        { key: 'fixity', label: 'Fixity', type: 'select', options: [['', `From fixed end (${auto[0]?.fixity || '—'})`], ['fixed', 'Fixed'], ['guided', 'Guided (fixed transversely)'], ['free', 'Free (sliding)']] },
      ],
      rows: end.bearings, onChange: () => onChange(false), compact: true, allowDuplicate: false, minRows: nb, rowLabel: (r, k) => `B${k + 1}`,
    });
    tbl.querySelector('.tbl-bar')?.remove();
    fs.append(tbl, h('p', 'field-help', `Blank v = at the bearing centres: ${auto.map((b) => Math.round(b.v * 1000)).join(', ')} mm. Braking and longitudinal wind go to fixed bearings only; free and guided bearings carry ±μ(G + traffic).`));
    row.append(fs);
  });
  p.append(row);
}

// Load path through the blocks (dispersion.js).
function dispersionFieldset(state, end, onChange) {
  const A = end.arrangement;
  A.dispersion = A.dispersion || { mode: 'bond', angleRatio: 2, justification: '', capBeam: { on: false, b: null, h: null, As: null, fck: 32, fyk: 500, cover: 50 } };
  A.dispersion.capBeam = A.dispersion.capBeam || { on: false, fck: 32, fyk: 500, cover: 50 };
  const D = A.dispersion;
  const fs = fieldset(`${bridgeMode(state) ? end.label : 'Wall'} — load path from the bearings`, [
    { path: 'mode', label: 'Dispersion through the courses', type: 'select', options: DISPERSION_MODES, rebuild: false, help: 'Dry-laid blocks: no friction or tension on vertical joints (Elite), so a bearing load reaches only the blocks it bears on. Bond-based is the default; None is the lower bound.' },
    { path: 'angleRatio', label: 'Spread angle (V per 1 H)', min: 0.5, max: 4, step: 0.5, slider: [0.5, 4, 0.5], showIf: () => D.mode === 'angle', help: '2 = 2V:1H. Capped by the bond-based spread.' },
    { path: 'justification', label: 'Justification for the angle (required)', type: 'text', showIf: () => D.mode === 'angle' },
    { path: 'capBeam.on', label: 'RC capping beam / distribution slab present', type: 'checkbox', showIf: () => D.mode === 'full' },
    { path: 'capBeam.b', label: 'Beam width b', unit: 'mm', min: 300, step: 50, nullable: true, showIf: () => D.mode === 'full' && D.capBeam.on },
    { path: 'capBeam.h', label: 'Beam depth h', unit: 'mm', min: 200, step: 25, nullable: true, showIf: () => D.mode === 'full' && D.capBeam.on },
    { path: 'capBeam.As', label: 'Longitudinal steel per face As', unit: 'mm²', min: 0, step: 50, nullable: true, showIf: () => D.mode === 'full' && D.capBeam.on },
    { path: 'capBeam.fck', label: 'Concrete fck', unit: 'N/mm²', min: 20, max: 50, step: 1, showIf: () => D.mode === 'full' && D.capBeam.on },
  ], D, state, end, onChange);
  return fs;
}

function renderLoads(p, state, onChange, api, quick = false, noLibrary = false) {
  const L = state.loads;
  if (bridgeMode(state)) {
    if (!noLibrary) p.append(renderBridgeLibrary(state, onChange, api));
    const det = h('details', 'lg-more');
    det.open = !usingLibrary(state);
    det.append(h('summary', null, usingLibrary(state) ? 'Edit loads (bespoke override of the standard values)' : 'Bridge loads (bespoke)'));
    const fs1 = h('fieldset', 'lg-fieldset');
    fs1.append(h('legend', null, 'Vehicle models (checked one at a time)'));
    L.trafficModels.forEach((m) => { if (m.standard === undefined) m.standard = ''; });
    fs1.append(createTable({
      columns: [
        { key: 'name', label: 'Model', type: 'text', width: '8rem', structural: true },
        { key: 'standard', label: 'Load model', type: 'select', options: LOAD_STANDARDS, width: '13rem', validate: (v) => (v ? '' : 'Choose the load model') },
        { key: 'excludeSurchargeWind', label: 'No accompanying traffic (exclude surcharge & wind)', type: 'checkbox' },
      ],
      rows: L.trafficModels, onChange: (x) => onChange(x.structural), newRow: () => ({ name: `M${L.trafficModels.length + 1}`, standard: '', excludeSurchargeWind: false }), compact: true,
    }));
    if (L.trafficModels.some((m) => String(m.standard || '').startsWith('BD37')) && state.basis.preset === 'A2') fs1.append(h('p', 'lg-mod', 'BD37 nominal loads combined with EN 1990 A2 factors — basis to be justified (verify).'));
    det.append(fs1);
    const fs2 = h('fieldset', 'lg-fieldset');
    fs2.append(h('legend', null, 'Characteristic reactions per abutment'));
    const uw = h('div', 'field lg-unitsel');
    const ul = h('label', null, 'Units of the schedule');
    ul.htmlFor = 'lg-units';
    const us = document.createElement('select');
    us.id = 'lg-units';
    LOAD_UNITS.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; us.append(o); });
    us.value = L.unit || 'kN';
    us.addEventListener('change', () => { L.unit = us.value; onChange(true); });
    uw.append(ul, us, h('div', 'field-help', 'Enter values exactly as the supplier schedule gives them. Tonnes are converted with g = 9.81 m/s². “Per truss” treats every row as per bearing. The kN column shows the value used.'));
    fs2.append(uw);
    fs2.append(h('p', 'field-help', 'X longitudinal (+ End 1 → End 2), Y transverse, Z vertical downward. Paste rows straight from a spreadsheet.'));
    const models = L.trafficModels.map((m) => m.name);
    const k = (L.unit || 'kN').startsWith('t') ? 9.81 : 1;
    const unitTxt = (L.unit || 'kN').startsWith('t') ? 't' : 'kN';
    const chip = (row) => {
      const sp = h('span', 'lg-kn');
      sp.lgRow = row;
      return sp;
    };
    const updChips = () => fs2.querySelectorAll('.lg-kn').forEach((sp) => {
      const r = sp.lgRow;
      const parts = [['Z', r.Z], ['X', r.X], ['Y', r.Y]].filter(([, v]) => Number(v)).map(([a, v]) => `${a} ${fmt(Number(v) * k, 1)}`);
      sp.textContent = parts.length ? `${parts.join(' · ')} kN` : '—';
    });
    fs2.append(createTable({
      columns: [
        { key: 'name', label: 'Load', type: 'text', width: '10rem' },
        { key: 'group', label: 'Type', type: 'select', options: REACTION_GROUPS.map((g) => [g.value, g.label]), width: '10rem' },
        { key: 'model', label: 'Model', type: 'select', options: [['', '—'], ...models.map((m) => [m, m])] },
        { key: 'basis', label: 'Basis', type: 'select', options: [['total', 'Per abutment'], ['perBearing', 'Per bearing']] },
        { key: 'Z', label: 'Z', type: 'number', unit: unitTxt }, { key: 'X', label: 'X', type: 'number', unit: unitTxt }, { key: 'Y', label: 'Y', type: 'number', unit: unitTxt },
        { key: 'kn', label: 'Used (kN)', render: chip },
        { key: 'reversible', label: '±', type: 'checkbox' }, { key: 'xFixedOnly', label: 'X at fixed bearings only', type: 'checkbox' },
        { key: 'psi0', label: 'ψ0', type: 'number', step: 0.05 }, { key: 'psi1', label: 'ψ1', type: 'number', step: 0.05 }, { key: 'psi2', label: 'ψ2', type: 'number', step: 0.05 },
        { key: 'end', label: 'End', type: 'select', options: ['Both', 'End 1', 'End 2'] },
      ],
      rows: L.reactions, onChange: (x) => { updChips(); onChange(x.structural); }, newRow: () => newReaction({ name: `Load ${L.reactions.length + 1}` }),
    }));
    updChips();
    det.append(fs2);
    p.append(det);
    if (bothEndsFixed(state)) p.append(renderThermalRestraint(state, onChange));
  }
  p.append(fieldset('Approach', quick ? pick(FIELDS.loads, ['loads.surcharge', 'loads.surchargeSetback']) : FIELDS.loads, state, state, null, onChange));
  if (bridgeMode(state) && !quick) {
    const more = h('details', 'lg-more');
    more.append(h('summary', null, 'Construction, hydraulic and accidental actions'));
    const fs3 = h('fieldset', 'lg-fieldset');
    fs3.append(h('legend', null, 'Launch / erection point loads'));
    fs3.append(h('p', 'field-help', 'The “abutment built and backfilled, no deck” stage is always checked. Enter launch loads in abutment axes (u landward from the front face, v along the face). Leave z blank for seat level.'));
    fs3.append(createTable({
      columns: [{ key: 'name', label: 'Load', type: 'text', width: '8rem' }, { key: 'u', label: 'u', type: 'number', unit: 'm' }, { key: 'v', label: 'v', type: 'number', unit: 'm' }, { key: 'z', label: 'z', type: 'number', unit: 'm', nullable: true }, { key: 'Fz', label: 'Fz', type: 'number', unit: 'kN' }, { key: 'Fu', label: 'Fu', type: 'number', unit: 'kN' }, { key: 'Fv', label: 'Fv', type: 'number', unit: 'kN' }, { key: 'source', label: 'Source', type: 'text', width: '8rem' }],
      rows: L.launch, onChange: () => onChange(true), newRow: () => ({ name: 'Launch nose', u: 1.2, v: 2.4, z: null, Fz: 100, Fu: 0, Fv: 0, source: '' }),
    }));
    more.append(fs3);
    more.append(fieldset('Plant surcharge on bank (overall stability, construction case)', FIELDS.plant, state, state, null, onChange));
    more.append(fieldset('Hydraulic actions (applied automatically when the abutment or pad is below DFL)', FIELDS.hydraulic, state, state, null, onChange));
    more.append(fieldset('Accidental', FIELDS.impact, state, state, null, onChange));
    p.append(more);
  }
}

// --- Tab 3 -----------------------------------------------------------------------------

function renderCrossing(p, state, end, idx, onChange, api) {
  const X = state.crossing;
  if (bridgeMode(state)) {
    const fs = h('fieldset', 'lg-fieldset');
    fs.append(h('legend', null, 'Long section — bridge centreline, End 1 → End 2'));
    fs.append(h('p', 'field-help', 'Chainage/level pairs from the topographic survey (paste from a spreadsheet), or generate from the helper below.'));
    fs.append(createTable({ columns: [{ key: 'ch', label: 'Chainage', type: 'number', unit: 'm', step: 0.01 }, { key: 'level', label: 'Level', type: 'number', unit: 'mAOD', step: 0.001 }], rows: X.profile, onChange: () => onChange(false), newRow: () => ({ ch: (X.profile[X.profile.length - 1]?.ch ?? 0) + 2, level: X.profile[X.profile.length - 1]?.level ?? 100 }), compact: true, allowDuplicate: false }));
    const helper = h('details', 'lg-helper');
    helper.innerHTML = '<summary>Parametric profile helper</summary>';
    const hp = { crest: 100.5, bed: 97.5, bedWidth: 4, slope: 1.5, crestCh: 2, land: 16 };
    const hs = h('div', 'lg-grid');
    [['crest', 'Bank crest level (mAOD)'], ['bed', 'Bed level (mAOD)'], ['bedWidth', 'Bed width (m)'], ['slope', 'Bank slope (H per 1 V)'], ['crestCh', 'End 1 crest chainage (m)'], ['land', 'Landward extent each side (m)']].forEach(([k, l]) => {
      const f = h('div', 'field');
      f.innerHTML = `<label>${l}</label>`;
      const i = document.createElement('input');
      i.type = 'number'; i.step = 'any'; i.value = hp[k];
      i.addEventListener('input', () => { hp[k] = Number(i.value); });
      f.append(i); hs.append(f);
    });
    const gen = h('button', 'btn secondary btn-sm', 'Generate profile');
    gen.type = 'button';
    gen.addEventListener('click', () => {
      const H = hp.crest - hp.bed, w = H * hp.slope;
      const c1 = hp.crestCh, t1 = c1 + w, t2 = t1 + hp.bedWidth, c2 = t2 + w;
      X.profile.splice(0, X.profile.length, { ch: c1 - hp.land, level: hp.crest }, { ch: c1, level: hp.crest }, { ch: t1, level: hp.bed }, { ch: t2, level: hp.bed }, { ch: c2, level: hp.crest }, { ch: c2 + hp.land, level: hp.crest });
      X.bedLevel = hp.bed;
      state.ends[0].bankCrest = { ch: c1, level: hp.crest }; state.ends[0].bankToe = { ch: t1, level: hp.bed };
      state.ends[1].bankCrest = { ch: c2, level: hp.crest }; state.ends[1].bankToe = { ch: t2, level: hp.bed };
      onChange(true);
    });
    helper.append(hs, gen);
    fs.append(helper);
    p.append(fs);
    p.append(fieldset('Channel levels, scour and regulatory', FIELDS.crossing, state, state, end, onChange));
  }
  const perEnd = omit(FIELDS.end, ['seatLevel', 'FRL', 'soffitOverride', 'fillSurfaceMode', 'fillSurfaceZ']);
  const fsE = fieldset(`${bridgeMode(state) ? end.label : 'Wall'} — geometry, groundwater and ground levels`, perEnd, end, state, end, onChange);
  if (bridgeMode(state)) {
    const det = h('button', 'btn secondary btn-sm', 'Detect bank crest/toe from profile');
    det.type = 'button';
    det.addEventListener('click', () => {
      const b = detectBank(state, idx);
      if (b) { end.bankCrest = { ...b.crest }; end.bankToe = { ...b.toe }; onChange(true); api.toast('Bank crest and toe detected — check them'); }
    });
    fsE.append(det);
  }
  p.append(fsE);
}

// --- Tab 4 -----------------------------------------------------------------------------

function renderGround(p, state, end, idx, onChange, api) {
  const label = bridgeMode(state) ? end.label : 'Wall';
  const endName = `End ${idx + 1}`;
  p.append(h('p', 'field-help lg-lead', `Enter each borehole for ${e(label)} as it appears on the log: the depth, the soil and the SPT N value. The tool corrects N, derives φ′ or cu, sets characteristic values and builds the design profile.`));
  const mine = state.boreholes.map((b, i) => [b, i]).filter(([b]) => b.end === endName || b.end === 'Both');
  if (!mine.length) p.append(h('p', 'lg-mod', `No boreholes for ${e(label)} yet — add one below${end.groundMode === 'manual' ? ' (a manual design profile is currently in use — see Advanced)' : ''}.`));
  mine.forEach(([bh, bi]) => p.append(boreholeCard(state, bh, bi, end, onChange)));
  const addB = h('button', 'btn btn-sm', `+ Add borehole for ${e(label)}`);
  addB.type = 'button';
  addB.addEventListener('click', () => {
    const others = state.boreholes.map((b) => b.id);
    let n = state.boreholes.length + 1;
    while (others.includes(`BH${String(n).padStart(2, '0')}`)) n++;
    state.boreholes.push(newSimpleBorehole({ id: `BH${String(n).padStart(2, '0')}`, end: endName, chainage: end.frontChainage, GL: end.frontGroundOverride ?? 100 }));
    end.groundMode = 'boreholes';
    onChange(true);
  });
  p.append(addB);

  const out = api.getOutput()?.design?.ends?.[idx];
  if (out) {
    const fsP = h('fieldset', 'lg-fieldset');
    fsP.append(h('legend', null, `${label} — design profile used`));
    fsP.innerHTML += `<div class="tbl-scroll"><table class="tbl-input tbl-readonly"><thead><tr><th>#</th><th>Stratum</th><th>From–to (mAOD)</th><th class="num">γ</th><th class="num">φ′k °</th><th class="num">cu,k kPa</th><th class="num">N60</th><th>Basis</th></tr></thead><tbody>${out.ground.layers.map((l, i) => `<tr><td>${i}</td><td>${e(l.desc || l.cls)}${l.unsuitable ? ' ⚠ unsuitable' : ''}</td><td>${fmt(l.topLevel, 2)} – ${fmt(l.baseLevel, 2)}</td><td class="num">${fmt(l.gamma, 1)}</td><td class="num">${fmt(l.phi, 1)}</td><td class="num">${l.cu ? fmt(l.cu, 0) : '—'}</td><td class="num">${l.N60 !== null && l.N60 !== undefined ? fmt(l.N60, 1) : '—'}</td><td>${e(l.char?.phi?.method || l.char?.cu?.method || l.source || '')}</td></tr>`).join('')}</tbody></table></div><p class="field-help">Design borehole ${e(out.ground.designId || 'manual profile')}; groundwater ${Number.isFinite(out.ground.gw.level) ? `${fmt(out.ground.gw.level, 2)} mAOD` : 'deep'}. Formation ${fmt(out.levels.formation, 2)} mAOD on ${e(out.geom.founding.desc || out.geom.founding.cls)}.</p>`;
    p.append(fsP);
  }

  // Advanced options, collapsed.
  const adv = h('details', 'lg-more');
  adv.append(h('summary', null, 'Advanced ground options (correlations, characteristic values, overrides, manual profile)'));
  const ids = mine.map(([b]) => b.id);
  const opts = [
    { path: 'groundMode', label: 'Ground model source', type: 'select', options: [['boreholes', 'Boreholes (SPT)'], ['manual', 'Manual design profile']] },
    { path: 'designBorehole', label: 'Design borehole', type: 'select', options: [['auto', 'Auto — lowest cautious parameter at founding level'], ...ids.map((i) => [i, i])], showIf: (s, en) => en.groundMode === 'boreholes' },
    { path: 'groundOptions.phiMethod', label: 'φ′ correlation', type: 'select', options: [['PHT', 'Peck, Hanson & Thornburn (1974) via Wolff (1989)'], ['HU', 'Hatanaka & Uchida (1996)']] },
    { path: 'groundOptions.charMethod', label: 'Characteristic value (EC7 2.4.5.2)', type: 'select', options: [['auto', 'Auto — cautious mean if n ≥ 5, else minimum'], ['cautious', 'Cautious mean (mean − 0.5 SD)'], ['lowerQuartile', 'Lower quartile'], ['minimum', 'Minimum']] },
    { path: 'groundOptions.Ncap', label: 'N cap before correlation', min: 10, step: 1 },
    { path: 'groundOptions.phiMax', label: 'φ′ max (unless overridden)', unit: '°', min: 25, max: 45, step: 0.5 },
    { path: 'groundOptions.f2', label: 'Stroud f2 for mv', unit: 'MN/m²', min: 0.1, step: 0.01 },
    { path: 'groundOptions.overconsolidated', label: 'Granular soils overconsolidated (E′ = 2·N60)', type: 'checkbox' },
  ];
  adv.append(fieldset(`${label} — correlations and characteristic values`, opts, end, state, end, onChange));
  const fsO = h('fieldset', 'lg-fieldset');
  fsO.append(h('legend', null, `${label} — parameter overrides (justification mandatory)`));
  fsO.append(h('p', 'field-help', 'Use for lab results (e.g. c′ and φ′ from triaxial tests) or to allow a stratum as founding. Stratum numbers refer to the design profile above.'));
  end.groundOptions.overrides = end.groundOptions.overrides || [];
  fsO.append(createTable({
    columns: [
      { key: 'stratumIndex', label: 'Stratum #', type: 'number', step: 1 },
      { key: 'param', label: 'Parameter', type: 'select', options: [['phi', 'φ′'], ['c', 'c′'], ['cu', 'cu'], ['mv', 'mv'], ['E', 'E′'], ['gamma', 'γ'], ['gammaSat', 'γsat'], ['rockRd', 'Rock design bearing (kPa)'], ['founding', 'Allow as founding stratum']] },
      { key: 'value', label: 'Value', type: 'number', nullable: true }, { key: 'justification', label: 'Justification', type: 'text', width: '14rem' },
    ],
    rows: end.groundOptions.overrides, onChange: () => onChange(false), newRow: () => ({ stratumIndex: 1, param: 'phi', value: null, justification: '' }), compact: true,
  }));
  adv.append(fsO);
  if (end.groundMode === 'manual') {
    const fsM = h('fieldset', 'lg-fieldset');
    fsM.append(h('legend', null, `${label} — manual design profile`));
    fsM.append(createTable({
      columns: [
        { key: 'topLevel', label: 'Top', type: 'number', unit: 'mAOD' }, { key: 'baseLevel', label: 'Base', type: 'number', unit: 'mAOD' },
        { key: 'desc', label: 'Description', type: 'text', width: '10rem' }, { key: 'cls', label: 'Class', type: 'select', options: STRATUM_CLASSES },
        { key: 'gamma', label: 'γ', type: 'number', unit: 'kN/m³' }, { key: 'gammaSat', label: 'γsat', type: 'number', unit: 'kN/m³' },
        { key: 'phi', label: 'φ′k', type: 'number', unit: '°' }, { key: 'c', label: 'c′k', type: 'number', unit: 'kPa' }, { key: 'cu', label: 'cu,k', type: 'number', unit: 'kPa', nullable: true },
        { key: 'mv', label: 'mv', type: 'number', unit: 'm²/MN', nullable: true }, { key: 'N60', label: 'N60', type: 'number', nullable: true },
        { key: 'granType', label: 'Granular type', type: 'select', options: GRANULAR_TYPES }, { key: 'rockRd', label: 'Rock Rd', type: 'number', unit: 'kPa', nullable: true },
      ],
      rows: end.manualProfile, onChange: () => onChange(false), newRow: () => ({ topLevel: 95, baseLevel: 90, cls: 'Granular', desc: '', gamma: 19, gammaSat: 20, phi: 32, c: 0, cu: null, mv: null, N60: 20, granType: 'Sand', rockRd: null }),
    }));
    adv.append(fsM);
  }
  p.append(adv);
}

function boreholeCard(state, bh, bi, end, onChange) {
  const fs = h('fieldset', 'lg-fieldset lg-bhcard');
  fs.append(h('legend', null, `${e(bh.id)}${bh.end === 'Both' ? ' (both ends)' : ''}`));
  const hdr = [
    { path: 'id', label: 'Borehole', type: 'text' },
    { path: 'GL', label: 'Ground level', unit: 'mAOD', step: 0.01 },
    { path: 'standing', label: 'Groundwater depth (blank = not met)', unit: 'm bgl', step: 0.1, nullable: true },
    { path: 'chainage', label: 'Chainage (for drawings)', unit: 'm', step: 0.1 },
    { path: 'end', label: 'Use for', type: 'select', options: [['End 1', 'End 1'], ['End 2', 'End 2'], ['Both', 'Both ends']] },
    { path: 'Er', label: 'SPT hammer energy Er (blank = 60%)', unit: '%', step: 1, nullable: true },
  ];
  fs.append(fieldset('Borehole', hdr, bh, state, end, (s) => onChange(s), 'lg-plain'));
  if (bh.simple) {
    fs.append(h('p', 'field-help', 'One row per log entry: depth below ground, the soil as logged and the SPT N as written (e.g. 15, or 50/75 for a refusal). A row with no N marks the top of a new soil. Paste straight from a spreadsheet.'));
    fs.append(createTable({
      columns: [
        { key: 'depth', label: 'Depth', type: 'number', unit: 'm', step: 0.1 },
        { key: 'soil', label: 'Soil', type: 'select', options: SIMPLE_SOILS },
        { key: 'N', label: 'SPT N', type: 'text', width: '6rem', validate: (v) => { if (v === null || v === undefined || String(v).trim() === '') return ''; const r2 = parseSPT(v); return r2.error ? 'Not a readable SPT result' : ''; } },
        { key: 'note', label: 'Log description (optional)', type: 'text', width: '12rem' },
      ],
      rows: bh.simpleRows, onChange: () => onChange(false), compact: true, allowDuplicate: false,
      newRow: () => { const last = bh.simpleRows[bh.simpleRows.length - 1]; return { depth: last ? Number(last.depth) + 1 : 0, soil: last ? last.soil : 'Sand', N: '', note: '' }; },
    }));
  } else {
    bh.strata.forEach((s) => { s.lab = s.lab || {}; });
    fs.append(h('h4', 'lg-h4', 'Strata (detailed entry)'));
    fs.append(createTable({
      columns: [
        { key: 'top', label: 'Top', type: 'number', unit: 'm' }, { key: 'base', label: 'Base', type: 'number', unit: 'm' }, { key: 'desc', label: 'Description', type: 'text', width: '12rem' },
        { key: 'cls', label: 'Class', type: 'select', options: STRATUM_CLASSES }, { key: 'PI', label: 'PI', type: 'number', nullable: true }, { key: 'granType', label: 'Granular type', type: 'select', options: GRANULAR_TYPES },
        { key: 'lab', label: 'Lab γ / φ′ / cu / rock Rd', render: (row) => labCell(row, () => onChange(false)) },
      ],
      rows: bh.strata, onChange: () => onChange(false), newRow: () => { const last = bh.strata[bh.strata.length - 1]; return { top: last ? last.base : 0, base: (last ? last.base : 0) + 1, desc: '', cls: 'Granular', PI: null, granType: 'Sand', lab: {} }; },
    }));
    fs.append(h('h4', 'lg-h4', 'SPT results'));
    fs.append(createTable({
      columns: [{ key: 'depth', label: 'Depth', type: 'number', unit: 'm' }, { key: 'type', label: 'S/C', type: 'select', options: ['S', 'C'] }, { key: 'result', label: 'Result', type: 'text', width: '14rem', validate: (v) => (parseSPT(v).error ? 'Not a readable SPT result' : '') }],
      rows: bh.spt, onChange: () => onChange(false), newRow: () => ({ depth: (bh.spt[bh.spt.length - 1]?.depth ?? 0) + 1, type: 'S', result: '' }), compact: true,
    }));
  }
  const bar = h('div', 'tbl-bar');
  if (bh.simple) {
    const adv = h('button', 'btn secondary btn-sm', 'Detailed entry (PI, lab values, seating blows)');
    adv.type = 'button';
    adv.addEventListener('click', () => {
      if (!window.confirm('Switch this borehole to detailed strata + SPT entry? The simple rows are converted and the simple view is not kept.')) return;
      const x = expandSimpleBorehole(bh);
      bh.strata = x.strata; bh.spt = x.spt; bh.finalDepth = x.finalDepth; bh.simple = false;
      onChange(true);
    });
    bar.append(adv);
  }
  const rm = h('button', 'btn secondary btn-sm', `Remove ${e(bh.id)}`);
  rm.type = 'button';
  rm.addEventListener('click', () => { if (window.confirm(`Remove borehole ${bh.id}?`)) { state.boreholes.splice(bi, 1); onChange(true); } });
  bar.append(rm);
  fs.append(bar);
  return fs;
}

function labCell(row, onChange) {
  const box = h('div', 'lg-lab');
  [['gamma', 'γ'], ['phi', 'φ′'], ['cu', 'cu'], ['rockRd', 'Rd']].forEach(([k, l]) => {
    const i = document.createElement('input');
    i.type = 'number'; i.step = 'any'; i.placeholder = l; i.title = `Lab/assessed ${l} (overrides correlation)`;
    i.setAttribute('aria-label', `Lab ${l}`);
    i.value = row.lab?.[k] ?? '';
    i.addEventListener('input', () => { row.lab = row.lab || {}; row.lab[k] = i.value === '' ? null : Number(i.value); onChange(); });
    box.append(i);
  });
  return box;
}

// --- Tab 5 -----------------------------------------------------------------------------

function renderArrangement(p, state, end, idx, onChange, api) {
  const A = end.arrangement;
  const label = bridgeMode(state) ? end.label : 'Wall';
  p.append(fieldset(`${label} — arrangement settings`, FIELDS.arrangement.filter((d) => !d.path.startsWith('arrangement.pad') && !d.path.startsWith('arrangement.anchors') && !['arrangement.groutBed', 'arrangement.bearingGrout', 'arrangement.bearingU_mm', 'arrangement.passive', 'arrangement.kpMob', 'arrangement.frontFillOnToe'].includes(d.path)), end, state, end, onChange));
  const defL = h('button', 'btn secondary btn-sm', `Set L to default (${defaultL_mm(state.project)} mm)`);
  defL.type = 'button';
  defL.addEventListener('click', () => { A.L_mm = defaultL_mm(state.project); onChange(true); });
  p.lastChild.append(defL);

  const fsT = h('fieldset', 'lg-fieldset');
  fsT.append(h('legend', null, 'Allowed block types'));
  const tg = h('div', 'lg-checks');
  ALL_BLOCK_TYPES.forEach((c) => {
    const l = h('label', 'lg-check');
    const i = document.createElement('input');
    i.type = 'checkbox'; i.checked = A.allowedTypes.includes(c);
    i.addEventListener('change', () => { A.allowedTypes = ALL_BLOCK_TYPES.filter((x) => (x === c ? i.checked : A.allowedTypes.includes(x))); onChange(false); });
    l.append(i, document.createTextNode(` ${c}`));
    tg.append(l);
  });
  fsT.append(tg);
  p.append(fsT);

  const fsC = h('fieldset', 'lg-fieldset');
  fsC.append(h('legend', null, `${label} — course table (bottom = 1)`));
  fsC.append(h('p', 'field-help', 'u from the front face of the bottom course (mm, multiples of 400). v blank = full length L. Bond: Mixed alternates a 1600 L-band and an 800 T-row per course (bonds across rows); T = long axis transverse; L = long axis longitudinal. Role auto: top = ballast wall, next = seat.'));
  fsC.append(createTable({
    columns: [
      { key: 'u_front', label: 'u front', type: 'number', unit: 'mm', step: 400 }, { key: 'u_rear', label: 'u rear', type: 'number', unit: 'mm', step: 400 },
      { key: 'v_start', label: 'v start', type: 'number', unit: 'mm', step: 400, nullable: true }, { key: 'v_end', label: 'v end', type: 'number', unit: 'mm', step: 400, nullable: true },
      { key: 'orient', label: 'Bond', type: 'select', options: [['Mixed', 'Mixed (L + T)'], ['T', 'T (transverse)'], ['L', 'L (longitudinal)']] },
      { key: 'height', label: 'H', type: 'number', unit: 'mm', step: 10 },
      { key: 'role', label: 'Role', type: 'select', options: [['auto', 'Auto'], ['base', 'Base'], ['seat', 'Seat'], ['ballast', 'Ballast wall']] },
      { key: 'typeRule', label: 'Block type', type: 'select', options: [['auto', 'Auto rule'], ['female', 'Female only'], ['male', 'Male + female']] },
      { key: 'special', label: 'Special', type: 'checkbox' }, { key: 'temporary', label: 'Temporary', type: 'checkbox' },
    ],
    rows: A.courses, onChange: () => onChange(false), newRow: () => { const last = A.courses[A.courses.length - 1]; return newCourse(last ? { u_front: last.u_front, u_rear: last.u_rear } : {}); }, rowLabel: (r, i) => `C${i + 1}`, minRows: 1,
  }));
  p.append(fsC);
  p.append(fieldset('Pad, grout, bearings and front', FIELDS.arrangement.filter((d) => d.path.startsWith('arrangement.pad') || d.path.startsWith('arrangement.anchors') || ['arrangement.groutBed', 'arrangement.bearingGrout', 'arrangement.bearingU_mm', 'arrangement.passive', 'arrangement.kpMob', 'arrangement.frontFillOnToe'].includes(d.path)), end, state, end, (s) => {
    const m = A.pad.material;
    if (m === 'Mass concrete' && A.pad.gamma < 22) A.pad.gamma = 24;
    if (m !== 'Mass concrete' && A.pad.gamma > 22) A.pad.gamma = 21;
    onChange(s);
  }));
  if (bridgeMode(state)) p.append(dispersionFieldset(state, end, onChange));
  if (bridgeMode(state)) {
    p.append(fieldset('Wing returns (checked as free-standing gravity sections)', [
      { path: 'arrangement.wings.on', label: 'Wing returns', type: 'checkbox' },
      { path: 'arrangement.wings.length_mm', label: 'Wing length', unit: 'mm', step: 400, showIf: (s, en) => en.arrangement.wings.on },
      { path: 'arrangement.wings.courses', label: 'Wing courses', step: 1, min: 1, showIf: (s, en) => en.arrangement.wings.on },
    ], end, state, end, onChange));
  }
  const fsF = fieldset(`${label} — retained backfill`, [
    { path: 'fill.material', label: 'Material', type: 'select', options: Object.keys(FILL_MATERIALS).filter((k) => FILL_MATERIALS[k].phi).map((k) => [k, k]).concat([['User', 'User-defined']]) },
    ...FIELDS.fill,
  ], end, state, end, (s) => {
    const m = FILL_MATERIALS[end.fill.material];
    if (s && m && m.phi) { end.fill.gamma = m.gamma; end.fill.gammaSat = m.gamma + 1; end.fill.phi = m.phi; end.fill.phiCv = m.phiCv; }
    onChange(s);
  });
  p.append(fsF);
  const out = api.getOutput()?.design?.ends?.[idx];
  if (out) {
    const sc = out.layout.schedule.map((r) => `${r.count} × ${r.key}`).join(', ');
    p.append(h('p', 'field-help', `Current layout: ${out.layout.totalBlocks} blocks (${e(sc)}), ${fmt(out.layout.totalMassT, 2)} t; formation ${fmt(out.levels.formation, 3)} mAOD, pad ${Math.round(out.levels.padThk * 1000)} mm.`));
  }
}

// --- Tab 6 -----------------------------------------------------------------------------

function renderBasis(p, state, end, onChange) {
  const fsP = h('fieldset', 'lg-fieldset');
  fsP.append(h('legend', null, 'Partial factor preset'));
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Factor preset');
  Object.entries(FACTOR_PRESETS).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.label; sel.append(o); });
  sel.value = state.basis.preset;
  sel.addEventListener('change', () => { state.basis.preset = sel.value; state.basis.factors = clone(FACTOR_PRESETS[sel.value]); onChange(true); });
  fsP.append(sel);
  const src = FACTOR_PRESETS[state.basis.preset];
  fsP.append(h('p', 'field-help', `${e(src.source)}. Every value is editable; edits are listed on the printed design basis. ${state.basis.preset === 'User' ? 'Do not mix assessment load factors with EC7 GEO factors without CEng agreement.' : ''}`));
  const F = state.basis.factors;
  const rows = [];
  ['EQU', 'C1', 'C2'].forEach((c) => rows.push({ set: c, ...F[c] }));
  const tbl = createTable({
    columns: [{ key: 'set', label: 'Set', render: (r) => h('strong', null, r.set === 'C1' ? 'DA1-C1' : r.set === 'C2' ? 'DA1-C2' : 'EQU') }, { key: 'gGsup', label: 'γG,sup', type: 'number', step: 0.01 }, { key: 'gGinf', label: 'γG,inf', type: 'number', step: 0.01 }, { key: 'gQt', label: 'γQ traffic', type: 'number', step: 0.01 }, { key: 'gQo', label: 'γQ other', type: 'number', step: 0.01 }, { key: 'M', label: 'M set', type: 'select', options: ['M1', 'M2'] }],
    rows, onChange: () => { rows.forEach((r) => { const { set, ...v } = r; Object.assign(F[set], v); }); onChange(false); }, compact: true, allowDuplicate: false, minRows: 3,
  });
  tbl.querySelector('.tbl-bar').remove();
  fsP.append(tbl);
  fsP.append(fieldset('Material and other factors', [
    { path: 'M2.gPhi', label: 'M2 γφ′ (on tan φ′)', step: 0.01 }, { path: 'M2.gC', label: 'M2 γc′', step: 0.01 }, { path: 'M2.gCu', label: 'M2 γcu', step: 0.01 },
    { path: 'R1.gRv', label: 'R1 γR,v', step: 0.01 }, { path: 'gWater', label: 'γ on water actions', step: 0.01 },
    { path: 'legacy.sliding', label: 'Legacy FoS sliding', step: 0.05 }, { path: 'legacy.toppling', label: 'Legacy FoS toppling', step: 0.05 }, { path: 'legacy.bearing', label: 'Legacy FoS bearing', step: 0.1 },
    { path: 'legacyOnly', label: 'Verdict on legacy FoS only', type: 'checkbox' },
  ], F, state, end, onChange));
  p.append(fsP);
  p.append(fieldset('Blocks, interfaces and methods', FIELDS.basis, state, state, end, onChange));
}

// --- Tab 7 -----------------------------------------------------------------------------

function renderSpec(p, state, onChange, api) {
  const fs = h('fieldset', 'lg-fieldset');
  fs.append(h('legend', null, 'Specification clauses (editable — printed in section 14)'));
  state.spec = state.spec || { overrides: {} };
  defaultClauses({ padText: state.ends[0].arrangement.pad.material, fillText: state.ends[0].fill.material }).forEach((c) => {
    const f = h('div', 'field');
    f.append(h('label', null, e(c.title)));
    const t = document.createElement('textarea');
    t.rows = 3;
    t.value = state.spec.overrides[c.key] ?? c.text;
    t.addEventListener('input', () => { if (t.value === c.text) delete state.spec.overrides[c.key]; else state.spec.overrides[c.key] = t.value; onChange(false); });
    f.append(t);
    fs.append(f);
  });
  const reset = h('button', 'btn secondary btn-sm', 'Reset clauses to default');
  reset.type = 'button';
  reset.addEventListener('click', () => { state.spec.overrides = {}; onChange(true); });
  fs.append(reset);
  p.append(fs);
  const fsD = h('fieldset', 'lg-fieldset');
  fsD.append(h('legend', null, 'Designer’s risk assessment (CDM 2015)'));
  if (!state.dra || !state.dra.length) state.dra = defaultDRA();
  fsD.append(createTable({
    columns: [{ key: 'hazard', label: 'Hazard', type: 'text', width: '12rem' }, { key: 'L', label: 'L', type: 'number', step: 1 }, { key: 'S', label: 'S', type: 'number', step: 1 }, { key: 'R', label: 'R', render: (r) => h('span', null, String((Number(r.L) || 0) * (Number(r.S) || 0))) }, { key: 'action', label: 'Design-stage action', type: 'text', width: '16rem' }, { key: 'residual', label: 'Residual risk', type: 'text', width: '10rem' }],
    rows: state.dra, onChange: (x) => onChange(x.structural), newRow: () => ({ hazard: '', L: 2, S: 3, R: 6, action: '', residual: '' }),
  }));
  p.append(fsD);
  const out = api.getOutput()?.design;
  if (out) {
    const fsP = h('fieldset', 'lg-fieldset');
    fsP.append(h('legend', null, 'PLT requirement (piped as `plt`)'));
    out.ends.filter((x) => x.plt).forEach((x) => fsP.append(h('p', null, `<strong>${e(x.label)}:</strong> target ${x.plt.targetPressure_kPa} kPa — ${e(x.plt.plate)}; ${e(x.plt.acceptance)}; ${e(x.plt.count)}.`)));
    const cp = h('button', 'btn secondary btn-sm', 'Copy PLT requirement (JSON)');
    cp.type = 'button';
    cp.addEventListener('click', () => { navigator.clipboard?.writeText(JSON.stringify(out.ends.map((x) => x.plt), null, 2)).then(() => api.toast('PLT requirement copied')); });
    fsP.append(cp);
    p.append(fsP);
  }
}

// --- Tab 8 -----------------------------------------------------------------------------

function renderDrawings(p, state, api) {
  const out = api.getOutput()?.design;
  if (!out) { p.append(h('p', 'muted', 'Calculating…')); return; }
  const ex = h('fieldset', 'lg-fieldset');
  ex.append(h('legend', null, 'Exports'));
  const bar = h('div', 'btn-row');
  const btn = (label, fn) => { const b = h('button', 'btn secondary btn-sm', label); b.type = 'button'; b.addEventListener('click', fn); bar.append(b); };
  btn('Block schedule (CSV)', () => saveCSV('block-schedule.csv', out.ends.flatMap((x) => x.layout.schedule.map((r) => ({ end: x.label, type: r.key, count: r.count, mass_each_kg: Math.round(r.massEach), total_t: ((r.count * r.massEach) / 1000).toFixed(3), special: r.special ? 'yes' : '', temporary: r.temporary ? 'yes' : '', drawing: r.drawing })))));
  btn('Levels table (CSV)', () => saveCSV('levels.csv', out.ends.flatMap((x) => [{ end: x.label, item: 'Formation', level: x.levels.formation.toFixed(3) }, { end: x.label, item: 'Pad top', level: x.levels.z0Level.toFixed(3) }, ...x.layout.courses.map((c, i) => ({ end: x.label, item: `Course ${c.idx} top (${c.role})`, level: x.levels.tops[i].toFixed(3) }))])));
  btn('Design state (JSON)', () => saveJSON('legato-design.json', state));
  if (out.bridge) {
    out.ends.forEach((x) => {
      btn(`Slope geometry ${x.label} (JSON)`, () => saveJSON(`slope-geometry-end${x.endIdx + 1}.json`, slopeExport(state, x.geom).json));
      btn(`Slope points ${x.label} (CSV)`, () => saveCSV(`slope-points-end${x.endIdx + 1}.csv`, slopeExport(state, x.geom).csvRows));
    });
  }
  ex.append(bar);
  p.append(ex);
  allDrawings(state, out).forEach((d) => {
    if (!d.svg) return;
    const f = h('figure', 'lg-fig');
    f.innerHTML = d.svg;
    const cap = h('figcaption', null, e(d.title));
    const dl = h('button', 'btn secondary btn-xs', 'SVG');
    dl.type = 'button';
    dl.addEventListener('click', () => saveSVG(`${d.key}.svg`, d.svg));
    cap.append(' ', dl);
    f.append(cap);
    p.append(f);
  });
}

// --- Results dashboard --------------------------------------------------------------------

let running = null;

export function renderResults(panel, output, state, api) {
  const D = output.design;
  panel.innerHTML = '';
  if (!D) { panel.innerHTML = '<p class="muted">Calculating…</p>'; return; }
  rollUtil(D);
  const v = h('div', `verdict-banner ${output.verdict.pass ? 'pass' : 'fail'}`, `${output.verdict.pass ? 'PASS' : 'FAIL'} — ${e(output.verdict.message)}`);
  panel.append(v);
  const tiles = h('div', 'stat-grid');
  tiles.innerHTML = `<div class="stat-tile"><div class="stat-label">Governing utilisation</div><div class="stat-value">${fmt(D.maxUtil, 3)}</div></div>`
    + D.ends.filter((x) => x.plt).map((x) => `<div class="stat-tile"><div class="stat-label">PLT target — ${e(x.label)}</div><div class="stat-value">${x.plt.targetPressure_kPa}<span class="stat-unit">kPa</span></div></div>`).join('');
  panel.append(tiles);

  // Runners.
  const act = h('div', 'lg-actions');
  const prog = h('div', 'lg-progress');
  prog.innerHTML = '<div class="lg-progress-bar"></div><span class="lg-progress-text"></span>';
  prog.hidden = !running;
  const setProg = (f, t) => { prog.hidden = false; prog.querySelector('.lg-progress-bar').style.width = `${Math.round(f * 100)}%`; prog.querySelector('.lg-progress-text').textContent = t; };
  if (D.bridge) {
    const badge = D.slope ? 'up to date' : D.slopeStale ? 'STALE' : 'not run';
    const b = h('button', 'btn btn-sm', `Run global stability <span class="lg-badge ${D.slope ? 'ok' : 'warn'}">${badge}</span>`);
    b.type = 'button';
    b.disabled = !!running;
    b.addEventListener('click', () => runSlope(state, api, setProg));
    act.append(b);
  }
  D.ends.forEach((x) => {
    const as = state.cache?.autosize?.[x.endIdx];
    const fresh = as && as.hash === D.hash;
    const badge = !as ? '' : !as.passing ? '<span class="lg-badge warn">no pass</span>' : `<span class="lg-badge ${fresh ? 'ok' : 'warn'}">${fresh ? 'applied' : 'stale'}</span>`;
    const b = h('button', `btn ${state.ends[x.endIdx].arrangement.mode === 'auto' ? '' : 'secondary'} btn-sm`, `Auto-size ${e(D.bridge ? x.label : 'wall')} ${badge}`);
    b.type = 'button';
    b.disabled = !!running || !D.bridge;
    if (!D.bridge) b.title = 'Auto-size applies to bridge bank seats';
    b.addEventListener('click', () => runAuto(state, api, x.endIdx, setProg));
    act.append(b);
  });
  panel.append(act, prog);

  // Per-end utilisation bars and metrics.
  D.ends.forEach((x) => {
    const card = h('details', 'lg-card');
    card.open = !D.bridge || (state.ui.activeEnd || 0) === x.endIdx;
    card.append(h('summary', null, `${e(D.bridge ? x.label : 'Wall')} — max utilisation ${fmt(x.maxUtil, 3)}`));
    const list = h('div', 'lg-bars');
    const rows = [...x.util];
    if (D.slope) {
      const se = D.slope.ends.find((s) => s.end === x.endIdx + 1);
      if (se) { const m = Math.min(...se.cases.map((c) => c.governingODF)); rows.push({ id: 'E5', title: `Overall stability (min ODF ${fmt(m, 2)})`, util: 1 / m, pass: m >= 1 }); }
    }
    rows.forEach((u) => {
      const r = h('button', 'lg-bar-row');
      r.type = 'button';
      const cls = u.info ? (u.flag ? 'near' : 'ok') : u.util > 1 ? 'fail' : u.util > 0.9 ? 'near' : 'ok';
      const icon = cls === 'fail' ? '✗' : cls === 'near' ? '!' : '✓';
      const val = u.info ? (u.flag ? 'CHECK DETAIL' : 'OK') : `${fmt(u.util, 3)} ${u.util > 1 ? 'FAIL' : u.util > 0.9 ? 'NEAR' : 'OK'}`;
      const d = deltaTxt(`${x.endIdx}-${u.id}`, u.util);
      r.innerHTML = `<span class="lg-bar-label">${e(u.id)} ${e(u.title)}</span><span class="lg-bar-track"><span class="lg-bar-fill ${cls}" style="width:${Math.min(100, (u.util / 1.2) * 100)}%"></span><span class="lg-bar-limit"></span></span><span class="lg-bar-val ${cls}"><span aria-hidden="true">${icon}</span> ${val}${d ? ` <span class="lg-delta ${d.up ? 'up' : 'down'}">${e(d.text)}</span>` : ''}</span>`;
      if (u.gov || u.zone) r.title = `Governing: ${u.zone || ''}${u.zone && u.gov ? ' — ' : ''}${u.gov || ''}`;
      r.addEventListener('click', () => { const t = document.getElementById(`rep-e${x.endIdx + 1}-${u.id.replace(/[a-d]$/, '')}`) || document.getElementById(`rep-e${x.endIdx + 1}-${u.id}`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      list.append(r);
    });
    card.append(list);
    const s = x.checks.E4.govQ?.formation;
    const cr = D.crossing?.ends?.[x.endIdx];
    const slopeE = D.slope?.ends.find((q) => q.end === x.endIdx + 1);
    const m = [
      ['Formation / pad', `${fmt(x.levels.formation, 3)} mAOD / ${Math.round(x.levels.padThk * 1000)} mm`],
      ['Courses', `${x.layout.n} (B = ${fmt(x.geom.courses[0].u1 - x.geom.courses[0].u0, 2)} m, L = ${fmt(x.geom.L, 2)} m)`],
      ['Blocks', `${x.layout.totalBlocks}: ${x.layout.schedule.map((r) => `${r.count}×${r.key}`).join(', ')}`],
      ['Tonnage / heaviest lift', `${fmt(x.layout.totalMassT, 2)} t / ${x.layout.heaviest ? `${x.layout.heaviest.code} ${Math.round(x.layout.heaviest.massEach)} kg` : '—'}`],
      ['SLS q_max / q_min', s ? `${fmt(s.qmax, 0)} / ${fmt(s.qmin, 0)} kPa` : '—'],
      ['PLT target', x.plt ? `${x.plt.targetPressure_kPa} kPa` : '—'],
      ['Settlement', x.settle ? `${fmt(x.settle.total, 1)} mm${D.diff ? ` (differential ${fmt(D.diff.d, 1)} mm)` : ''}` : '—'],
    ];
    if (D.bridge) {
      m.push(['Min ODF (E5)', slopeE ? fmt(Math.min(...slopeE.cases.map((c) => c.governingODF)), 3) : D.slopeStale ? 'stale — re-run' : 'not run']);
      m.push(['Setback / freeboard', cr ? `${fmt(cr.b, 2)} m / ${fmt(cr.freeboard, 2)} m` : '—']);
    }
    const tbl = h('table', 'lg-metrics');
    tbl.innerHTML = m.map(([a, b]) => `<tr><th>${e(a)}</th><td>${e(b)}</td></tr>`).join('');
    card.append(tbl);
    const as = state.cache?.autosize?.[x.endIdx];
    if (as) card.append(h('p', `field-help${as.hash === D.hash ? '' : ' lg-stale'}`, `<strong>Why this size:</strong> ${e(as.why)}${as.hash === D.hash ? '' : ' (stale — inputs changed since auto-size ran)'}${as.remedies?.length ? `<br>Remedies: ${e(as.remedies.join(' '))}` : ''}`));
    panel.append(card);
  });

  const warn = [...D.errors, ...D.xFails, ...D.warnings];
  const wd = h('details', 'warnings-list lg-warn');
  wd.open = warn.length > 0 && warn.length < 8;
  wd.append(h('summary', null, `<strong>Warnings (${warn.length})</strong>`));
  wd.append(h('ul', null, warn.map((w) => `<li>${e(w)}</li>`).join('')));
  panel.append(wd);
  const df = h('details', 'warnings-list lg-flags');
  df.append(h('summary', null, `<strong>Data flags (${D.dataFlags.length})</strong>`));
  df.append(h('ol', null, D.dataFlags.map((w) => `<li>${e(w)}</li>`).join('')));
  panel.append(df);
}

async function runSlope(state, api, setProg) {
  if (running) return;
  running = 'slope';
  try {
    const design = evaluate(state);
    const total = design.ends.length * SLOPE_CASES.length;
    let k = 0;
    const ends = [];
    for (const er of design.ends) {
      const cases = [];
      for (const cs of SLOPE_CASES) {
        setProg(k / total, `Global stability — ${er.label}: ${cs.label.split(' (')[0]}…`);
        await tick();
        cases.push(runSlopeCase(state, er.geom, state.basis.factors, cs));
        k++;
      }
      ends.push({ end: er.endIdx + 1, cases });
    }
    state.cache = state.cache || {};
    state.cache.slope = { hash: inputHash(state), ends, ranAt: new Date().toISOString() };
    autosave(state);
  } finally {
    running = null;
    api.recalcNow();
  }
}

async function runAuto(state, api, endIdx, setProg) {
  if (running) return;
  running = 'auto';
  let res;
  try {
    const gen = autoSizeSteps(state, endIdx);
    let r = gen.next();
    let n = 0;
    while (!r.done) {
      if (n++ % 3 === 0) { setProg(r.value.progress, `Auto-size ${state.ends[endIdx].label}: ${Math.round(r.value.progress * 100)}%`); await tick(); }
      r = gen.next();
    }
    res = r.value;
    const end = state.ends[endIdx];
    if (res.chosen) {
      end.arrangement.courses = res.chosenCourses;
      end.arrangement.pad.mode = 'auto';
      if (end.arrangement.pad.thk <= 0) end.arrangement.pad.thk = 250;
      if (res.chosen.setback) end.frontChainage += (endIdx === 0 ? -1 : 1) * res.chosen.setback;
    }
    state.cache = state.cache || {};
    state.cache.autosize = state.cache.autosize || [null, null];
    state.cache.autosize[endIdx] = { hash: inputHash(state), why: res.why, remedies: res.remedies, count: res.count, passing: res.passingCount };
    autosave(state);
  } finally {
    running = null;
    api.rebuild();
    api.recalcNow();
    if (res) api.toast(res.chosen ? `Auto-size applied to ${state.ends[endIdx].label}` : 'No passing arrangement found — see “Why this size”');
  }
}

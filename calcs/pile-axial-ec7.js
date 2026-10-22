// pile-axial-ec7.js — Single pile compressive resistance from ground test
// results (BS EN 1997-1 cl. 7.6.2.3) with the UK National Annex: DA1 C1 and
// C2, ξ correlation factor, model factor, separate base and shaft factors.
// Cohesive layers: α method. Granular layers: effective stress (K·σ′v·tanδ)
// or SPT (Meyerhof 1976) for driven piles, including H-piles.

import { svg, line, rect, text, clamp } from '../js/diagrams.js';
import { GAMMA_W, rad } from '../js/geo-core.js';
import {
  bearingCapacityFactors, PILE_RESISTANCE_FACTORS_UKNA, pileXi, PILE_MODEL_FACTOR_UKNA, PILE_INTERFACE,
} from '../js/shared-data.js';

const PILE_TYPES = Object.keys(PILE_INTERFACE);
const LAYER_COLUMNS = [
  { key: 'top', label: 'Top (m bgl)', type: 'number', step: 0.1, width: 70 },
  { key: 'base', label: 'Base (m bgl)', type: 'number', step: 0.1, width: 70 },
  { key: 'type', label: 'Soil', type: 'select', options: ['Cohesive', 'Granular'], width: 90 },
  { key: 'gamma', label: 'γ (kN/m³)', type: 'number', step: 0.5, width: 60 },
  { key: 'cu', label: 'cu (kPa)', type: 'number', step: 1, width: 60 },
  { key: 'phi', label: "φ′ (°)", type: 'number', step: 0.5, width: 55 },
  { key: 'N', label: 'SPT N', type: 'number', step: 1, width: 55 },
  { key: 'method', label: 'Granular method', type: 'select', options: ['Effective stress', 'SPT (Meyerhof)'], width: 120 },
  { key: 'alpha', label: 'α override', type: 'number', step: 0.05, nullable: true, width: 60 },
  { key: 'downdrag', label: 'Downdrag', type: 'checkbox', width: 60 },
];

const DEFAULT_LAYERS = [
  { top: 0, base: 8, type: 'Cohesive', gamma: 19, cu: 60, phi: 0, N: 0, method: 'Effective stress', alpha: null, downdrag: false },
  { top: 8, base: 20, type: 'Granular', gamma: 20, cu: 0, phi: 32, N: 30, method: 'Effective stress', alpha: null, downdrag: false },
];

// --- Geometry ------------------------------------------------------------------

function pileGeometry(v) {
  if (v.pileType === 'Driven H-pile') {
    const h = (v.hH || 0) / 1000, b = (v.hB || 0) / 1000, As = (v.hAs || 0) / 1e4;
    const plugged = v.hBase !== 'Steel area only';
    return {
      perimeter: 2 * (h + b), Ab: plugged ? h * b : As, Asteel: As, width: Math.max(h, b), selfArea: As, gammaPile: 78.5,
      text: `H-section ${v.hH}×${v.hB} mm: shaft perimeter 2(h+b) = ${(2 * (h + b)).toFixed(3)} m; base ${plugged ? 'plugged box h·b' : 'steel area'} = ${(plugged ? h * b : As).toFixed(4)} m²`,
    };
  }
  const D = v.D;
  if (v.section === 'Square') {
    return { perimeter: 4 * D, Ab: D * D, width: D, selfArea: D * D, gammaPile: 25, text: `Square ${D} m: perimeter ${(4 * D).toFixed(3)} m, Ab ${(D * D).toFixed(4)} m²` };
  }
  return {
    perimeter: Math.PI * D, Ab: (Math.PI * D * D) / 4, width: D, selfArea: (Math.PI * D * D) / 4, gammaPile: 25,
    text: `Circular D ${D} m: perimeter πD = ${(Math.PI * D).toFixed(3)} m, Ab πD²/4 = ${((Math.PI * D * D) / 4).toFixed(4)} m²`,
  };
}

// --- Ground ---------------------------------------------------------------------

function layerAt(layers, z) {
  return layers.find((l) => z >= l.top - 1e-9 && z < l.base - 1e-9) || (z >= layers[layers.length - 1]?.base - 1e-9 ? layers[layers.length - 1] : null);
}

// σ′v at depth z (kPa). Layers sorted by top; water at depth zw.
function sigmaV(layers, z, zw) {
  let s = 0;
  for (const l of layers) {
    if (z <= l.top) break;
    const a = l.top, b = Math.min(l.base, z);
    const dry = Math.max(0, Math.min(b, zw) - a);
    const wet = Math.max(0, b - Math.max(a, zw));
    s += l.gamma * dry + (l.gamma - GAMMA_W) * wet;
  }
  return s;
}

// α for cohesive soil. Bored/CFA: 0.5 (Skempton; UK practice for stiff clay).
// Driven: from cu/σ′v (1.0 up to 0.35, linear to 0.5 at 0.8, then 0.5).
function alphaFor(pileCls, cu, sv) {
  if (pileCls !== 'driven') return 0.5;
  const r = sv > 0 ? cu / sv : 10;
  if (r <= 0.35) return 1.0;
  if (r >= 0.8) return 0.5;
  return 1.0 - ((r - 0.35) / (0.8 - 0.35)) * 0.5;
}

// --- Core calculation -------------------------------------------------------------

export function pileCapacity(v) {
  const warnings = [];
  const layers = (v.layers || []).filter((l) => Number.isFinite(l.top) && Number.isFinite(l.base) && l.base > l.top)
    .map((l) => ({ ...l })).sort((a, b) => a.top - b.top);
  const pt = PILE_INTERFACE[v.pileType] || PILE_INTERFACE.Bored;
  const geo = pileGeometry(v);
  const zw = Number.isFinite(v.zw) ? v.zw : 1e6;
  const head = v.head, toe = v.toe, Lp = toe - head;
  if (!layers.length) return { error: 'Enter at least one soil layer.' };
  if (!(Lp > 0)) return { error: 'Toe depth must be below the pile head.' };
  if (layers[0].top > 0.001) warnings.push('The first layer does not start at ground level. σ′v ignores the soil above it.');
  for (let i = 1; i < layers.length; i++) if (Math.abs(layers[i].top - layers[i - 1].base) > 0.001) warnings.push(`Gap or overlap between layers at ${layers[i].top} m. Check the layer table.`);
  if (toe > layers[layers.length - 1].base + 1e-9) warnings.push('Toe is below the deepest layer. The deepest layer is assumed to continue.');
  const ksk0 = Number.isFinite(v.KsK0) ? v.KsK0 : pt.KsK0;
  const dRatio = Number.isFinite(v.deltaRatio) ? v.deltaRatio : pt.deltaRatio;

  // Shaft: integrate layer by layer between head and toe.
  const rows = [];
  let Rs = 0, Fneg = 0;
  layers.forEach((l, idx) => {
    const a = Math.max(l.top, head);
    const b = Math.min(idx === layers.length - 1 ? Math.max(l.base, toe) : l.base, toe);
    if (b <= a) return;
    const n = Math.max(1, Math.ceil((b - a) / 0.05));
    const dz = (b - a) / n;
    let F = 0, qsMax = 0, alphaUsed = null, svMean = 0, Kused = null;
    for (let i = 0; i < n; i++) {
      const z = a + (i + 0.5) * dz;
      const sv = sigmaV(layers, z, zw);
      svMean += sv / n;
      let qs;
      if (l.type === 'Cohesive') {
        const al = Number.isFinite(l.alpha) ? l.alpha : alphaFor(pt.cls, l.cu, sv);
        alphaUsed = al;
        qs = Math.min(al * l.cu, Number.isFinite(v.qsLimClay) ? v.qsLimClay : Infinity);
      } else if (l.method === 'SPT (Meyerhof)') {
        const k = pt.displacement === 'large' ? 2 : 1;
        qs = Math.min(k * (l.N || 0), pt.displacement === 'large' ? 100 : 50);
      } else {
        const K = ksk0 * (1 - Math.sin(rad(l.phi)));
        Kused = K;
        qs = K * sv * Math.tan(rad(dRatio * l.phi));
        if (Number.isFinite(v.qsLimSand)) qs = Math.min(qs, v.qsLimSand);
      }
      qsMax = Math.max(qsMax, qs);
      F += qs * geo.perimeter * dz;
    }
    const row = { layer: idx + 1, type: l.type, method: l.type === 'Cohesive' ? 'α' : l.method, from: a, to: b, svMean, qsMean: F / (geo.perimeter * (b - a)), F, alpha: alphaUsed, K: Kused, downdrag: !!l.downdrag };
    rows.push(row);
    if (l.downdrag) Fneg += F; else Rs += F;
    if (l.type === 'Granular' && l.method === 'SPT (Meyerhof)' && pt.cls !== 'driven') warnings.push(`Layer ${idx + 1}: the Meyerhof SPT method is for driven piles. Use effective stress for ${v.pileType} piles.`);
  });

  // Base
  const tl = layerAt(layers, toe - 1e-6) || layers[layers.length - 1];
  const svToe = sigmaV(layers, toe, zw);
  let qb, baseText;
  if (tl.type === 'Cohesive') {
    qb = 9 * tl.cu;
    baseText = `Cohesive toe: qb = 9·cu = 9 × ${tl.cu}`;
  } else if (tl.method === 'SPT (Meyerhof)') {
    const embed = toe - Math.max(tl.top, head);
    qb = Math.min(40 * tl.N * (embed / geo.width), 400 * tl.N);
    baseText = `SPT (Meyerhof 1976): qb = 40·N·Lb/D ≤ 400·N = min(40 × ${tl.N} × ${embed.toFixed(2)}/${geo.width.toFixed(3)}, 400 × ${tl.N})`;
  } else {
    const Nq = Number.isFinite(v.NqUser) && v.NqUser > 0 ? v.NqUser : bearingCapacityFactors(tl.phi).Nq;
    qb = Nq * svToe;
    baseText = `Granular toe: qb = Nq·σ′v,toe = ${Nq.toFixed(2)} × ${svToe.toFixed(1)}${Number.isFinite(v.NqUser) && v.NqUser > 0 ? ' (user Nq)' : ' (Nq from EC7 Annex D formula at φ′ — conservative against Berezantsev)'}`;
  }
  const qbLim = Number.isFinite(v.qbLim) ? v.qbLim : Infinity;
  if (qb > qbLim) { baseText += `; limited to ${qbLim} kPa`; qb = qbLim; }
  const Rb = qb * geo.Ab;

  // Characteristic resistance
  const { xi3, xi4 } = pileXi(Math.max(1, Math.round(v.nProfiles || 1)));
  let xi = Math.max(xi3, xi4); // one representative profile: mean = min
  if (v.stiffCap === 'Yes') xi = Math.max(1.0, xi / 1.1);
  const gRd = v.loadTest === 'Yes' ? PILE_MODEL_FACTOR_UKNA.loadTest : PILE_MODEL_FACTOR_UKNA.calc;
  const Rbk = Rb / (xi * gRd), Rsk = Rs / (xi * gRd);

  // Actions per pile
  const W = v.selfWeight === 'Include as permanent action' ? geo.selfArea * Lp * geo.gammaPile : 0;
  const F = PILE_RESISTANCE_FACTORS_UKNA[pt.cls];
  const R4 = v.slsVerified === 'Yes' ? F.R4sls : F.R4;
  const C1 = { Fd: 1.35 * (v.Gk + W + Fneg) + 1.5 * v.Qk, Rd: Rbk / F.R1.b + Rsk / F.R1.s, gb: F.R1.b, gs: F.R1.s };
  const C2 = { Fd: 1.0 * (v.Gk + W + Fneg) + 1.3 * v.Qk, Rd: Rbk / R4.b + Rsk / R4.s, gb: R4.b, gs: R4.s };
  C1.util = C1.Fd / C1.Rd; C2.util = C2.Fd / C2.Rd;

  if (geo.width > 0 && Lp / geo.width < 5) warnings.push('L/D < 5 — the pile behaves closer to a deep pad. Check the method.');
  if (Fneg > 0) warnings.push('Downdrag layers are excluded from resistance and their shaft friction is added as a permanent action (EC7 7.3.2.2). A neutral-plane analysis may reduce this.');
  return { layers, rows, geo, pt, Rs, Rb, qb, baseText, svToe, Fneg, xi, xi3, xi4, gRd, Rbk, Rsk, W, C1, C2, R4, ksk0, dRatio, warnings, toeLayer: tl };
}

// --- Diagram -----------------------------------------------------------------------

function diagram(v, output) {
  const layers = (v.layers || []).filter((l) => l.base > l.top).sort((a, b) => a.top - b.top);
  const zMax = Math.max(v.toe + 2, layers.length ? layers[layers.length - 1].base : 10);
  const top = 30, bot = 290, sc = (bot - top) / zMax;
  const Y = (z) => top + z * sc;
  let inner = '';
  layers.forEach((l, i) => {
    const fill = l.type === 'Cohesive' ? 'var(--bb-primary-100)' : 'var(--bb-accent-100, #fdf0dc)';
    inner += rect(30, Y(l.top), 260, (l.base - l.top) * sc, { fill, stroke: 'var(--bb-primary-300)' });
    inner += text(36, Y(l.top) + 12, `${i + 1}. ${l.type}${l.type === 'Cohesive' ? ` cu ${l.cu}` : ` φ′ ${l.phi}°`}${l.downdrag ? ' (downdrag)' : ''}`, { size: 8.5, anchor: 'start' });
  });
  inner += line(30, Y(0), 290, Y(0), { color: 'var(--bb-primary)', width: 2 });
  if (Number.isFinite(v.zw) && v.zw < zMax) {
    inner += line(30, Y(v.zw), 290, Y(v.zw), { color: '#2a7ab8', width: 1, dash: '5 3' });
    inner += text(286, Y(v.zw) - 3, '▽ GWL', { size: 8, anchor: 'end', color: '#2a7ab8' });
  }
  const pw = clamp((v.D || 0.6) * 30, 10, 30);
  inner += rect(200 - pw / 2, Y(v.head), pw, (v.toe - v.head) * sc, { fill: 'var(--bb-primary-500)', stroke: 'var(--bb-primary-800)' });
  inner += text(200 + pw / 2 + 4, Y(v.toe) + 3, `toe ${v.toe} m`, { size: 8.5, anchor: 'start' });
  // Shaft friction profile
  const rows = output?.values?.rows || [];
  const qmax = Math.max(1, ...rows.map((r) => r.qsMean));
  inner += text(345, 22, 'mean qs (kPa)', { size: 9, weight: 700 });
  inner += line(310, top, 310, bot, { color: 'var(--bb-ink)', width: 0.6 });
  rows.forEach((r) => {
    const w = (r.qsMean / qmax) * 80;
    inner += rect(310, Y(r.from), w, (r.to - r.from) * sc, { fill: r.downdrag ? '#d9534f55' : 'var(--bb-accent)', stroke: 'none' });
    inner += text(314 + w, Y((r.from + r.to) / 2) + 3, r.qsMean.toFixed(0), { size: 8, anchor: 'start' });
  });
  return svg('0 0 420 300', inner);
}

export default {
  id: 'pile-axial-ec7',
  title: 'Pile Axial Capacity — EC7 (UK NA)',
  category: 'Geotechnical — Piles',
  tag: 'EC7 7.6 + UK NA',
  version: '1.0.0',
  references: [
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) cl. 7.6.2.3 — compressive resistance from ground test results; cl. 7.3.2.2 — downdrag',
    'UK National Annex to BS EN 1997-1 (NA+A1:2014) Tables A.NA.6, A.NA.7, A.NA.8 (γb, γs), A.NA.10 (ξ3, ξ4), A.3.3.2 (model factor)',
    'Tomlinson, M. & Woodward, J., Pile Design and Construction Practice, 6th ed. — α method, Nq, limiting values',
    'Meyerhof, G.G. (1976) Bearing capacity and settlement of pile foundations, ASCE JGED 102(GT3) — SPT method for driven piles',
    'Kulhawy, F.H. (1984) Limiting tip and side resistance — Ks/K0 and δ/φ′ interface factors',
    'IStructE (2013) Manual for the geotechnical design of structures to Eurocode 7 — α against cu/σ′v (driven piles)',
  ],
  description: 'Compressive resistance of a single bored, CFA or driven pile (including H-piles) from ground test results. α method in clay; effective stress or SPT (Meyerhof) in sand. DA1 C1 and C2 with UK National Annex resistance, correlation and model factors.',
  assumptions: [
    'Single pile, axial compression only. Group (block) failure, tension, lateral load and settlement are not checked here. Use pile-group-settlement for settlement.',
    'One representative ground profile entered: Rc,k = Rc,cal/(ξ·γRd) with ξ = max(ξ3, ξ4) for the number of profiles stated.',
    'Cohesive base qb = 9·cu at the toe. No reduction for fissured clay or base cleanliness — reduce cu if required.',
    'Granular base by Nq·σ′v,toe. The EC7 Annex D Nq is conservative against Berezantsev; enter a chart value to override. Limiting qb applies.',
    'Downdrag layers give no resistance and their shaft friction is a permanent action.',
    'σ′v from layer unit weights with a single groundwater level (hydrostatic).',
    'UK NA factor values are flagged for verification against the current National Annex.',
  ],
  inputs: [
    { name: 'pileType', label: 'Pile type', type: 'select', options: PILE_TYPES, default: 'Bored' },
    { name: 'section', label: 'Section', type: 'select', options: ['Circular', 'Square'], default: 'Circular', showIf: (v) => v.pileType !== 'Driven H-pile' },
    { name: 'D', label: 'Diameter / side D', type: 'number', unit: 'm', default: 0.6, min: 0.1, step: 0.05, showIf: (v) => v.pileType !== 'Driven H-pile' },
    { name: 'hH', label: 'H-section depth h', type: 'number', unit: 'mm', default: 305, min: 100, step: 1, showIf: (v) => v.pileType === 'Driven H-pile' },
    { name: 'hB', label: 'H-section width b', type: 'number', unit: 'mm', default: 305, min: 100, step: 1, showIf: (v) => v.pileType === 'Driven H-pile' },
    { name: 'hAs', label: 'H-section steel area As', type: 'number', unit: 'cm²', default: 140, min: 1, step: 1, showIf: (v) => v.pileType === 'Driven H-pile' },
    { name: 'hBase', label: 'H-pile base area', type: 'select', options: ['Plugged box (h·b)', 'Steel area only'], default: 'Plugged box (h·b)', showIf: (v) => v.pileType === 'Driven H-pile',
      help: 'A plug may not form in loose sand or soft clay. Use steel area only unless the plug is proven.' },
    { name: 'head', label: 'Pile head (cut-off) depth', type: 'number', unit: 'm bgl', default: 0, min: 0, step: 0.1 },
    { name: 'toe', label: 'Pile toe depth', type: 'number', unit: 'm bgl', default: 15, min: 0.5, step: 0.1 },
    { name: 'zw', label: 'Groundwater depth', type: 'number', unit: 'm bgl', default: 50, min: 0, step: 0.1 },
    { name: 'layers', label: 'Soil layers (characteristic values)', type: 'table', columns: LAYER_COLUMNS, default: DEFAULT_LAYERS,
      help: 'Depths below ground level. Split a layer where cu or N changes. α override blank = default α. Tick downdrag for layers that settle relative to the pile.' },
    { name: 'KsK0', label: 'Ks/K0 (granular, effective stress)', type: 'number', default: undefined, min: 0.3, max: 2.5, step: 0.05,
      help: 'Blank = default for the pile type (bored/CFA 0.9, driven displacement 1.5, H-pile 1.0).' },
    { name: 'deltaRatio', label: 'δ/φ′', type: 'number', default: undefined, min: 0.3, max: 1, step: 0.05,
      help: 'Blank = default (cast in place 1.0, precast 0.9, steel 0.7).' },
    { name: 'NqUser', label: 'Base Nq (optional chart value)', type: 'number', default: undefined, min: 1, step: 1,
      help: 'Blank = EC7 Annex D Nq at φ′ of the toe layer.' },
    { name: 'qbLim', label: 'Limiting unit base resistance', type: 'number', unit: 'kPa', default: 10000, min: 0, step: 100 },
    { name: 'qsLimClay', label: 'Limiting unit shaft friction — cohesive', type: 'number', unit: 'kPa', default: 110, min: 0, step: 5 },
    { name: 'qsLimSand', label: 'Limiting unit shaft friction — granular (optional)', type: 'number', unit: 'kPa', default: undefined, min: 0, step: 5 },
    { name: 'nProfiles', label: 'Number of ground test profiles n', type: 'number', default: 1, min: 1, max: 10, step: 1 },
    { name: 'stiffCap', label: 'Structure stiff enough to transfer load between piles (ξ ÷ 1.1)', type: 'select', options: ['No', 'Yes'], default: 'No' },
    { name: 'loadTest', label: 'Verified by maintained load test (model factor 1.2)', type: 'select', options: ['No', 'Yes'], default: 'No' },
    { name: 'slsVerified', label: 'Serviceability explicitly verified (reduced R4)', type: 'select', options: ['No', 'Yes'], default: 'No' },
    { name: 'Gk', label: 'Permanent load per pile Gk', type: 'number', unit: 'kN', default: 500, min: 0, step: 10 },
    { name: 'Qk', label: 'Variable load per pile Qk', type: 'number', unit: 'kN', default: 150, min: 0, step: 10 },
    { name: 'selfWeight', label: 'Pile self-weight', type: 'select', options: ['Ignore (net of displaced soil)', 'Include as permanent action'], default: 'Ignore (net of displaced soil)' },
  ],
  diagram,
  calculate: (v) => {
    const r = pileCapacity(v);
    if (r.error) return { results: [], steps: [], warnings: [r.error] };
    const steps = [];
    steps.push({ title: 'Pile geometry', formula: 'Perimeter and base area', substitution: r.geo.text, result: `L = ${(v.toe - v.head).toFixed(2)} m` });
    steps.push({
      title: 'Shaft resistance by layer (characteristic soil values)',
      formula: 'Cohesive: qs = α·cu ≤ qs,lim.  Granular: qs = K·σ′v·tan(δ), K = (Ks/K0)(1 − sinφ′); or qs = 2N̄ (displacement) / 1N̄ (H-pile) kPa (Meyerhof).  Rs = Σ qs·P·Δz',
      substitution: `Ks/K0 = ${r.ksk0}, δ/φ′ = ${r.dRatio}; ${r.rows.length} layer segment(s)`,
      result: r.rows.map((x) => `L${x.layer} ${x.from.toFixed(1)}–${x.to.toFixed(1)} m ${x.type} (${x.method}${x.alpha !== null ? `, α ${x.alpha.toFixed(2)}` : ''}${x.K !== null ? `, K ${x.K.toFixed(3)}` : ''}): σ′v,mean ${x.svMean.toFixed(1)} kPa, qs,mean ${x.qsMean.toFixed(1)} kPa, ${x.downdrag ? 'downdrag' : 'Rs'} ${x.F.toFixed(1)} kN`).join(';  '),
    });
    steps.push({ title: 'Base resistance', formula: 'Rb,cal = qb·Ab', substitution: `${r.baseText}; σ′v,toe = ${r.svToe.toFixed(1)} kPa`, result: `qb = ${r.qb.toFixed(0)} kPa, Rb,cal = ${r.Rb.toFixed(1)} kN` });
    steps.push({
      title: 'Characteristic resistance (EC7 7.6.2.3, UK NA)',
      formula: 'Rb,k = Rb,cal/(ξ·γRd);  Rs,k = Rs,cal/(ξ·γRd)',
      substitution: `ξ3 = ${r.xi3.toFixed(2)}, ξ4 = ${r.xi4.toFixed(2)} for n = ${v.nProfiles}${v.stiffCap === 'Yes' ? ', ÷1.1 stiff cap' : ''} → ξ = ${r.xi.toFixed(3)}; γRd = ${r.gRd}`,
      result: `Rs,cal = ${r.Rs.toFixed(1)} kN → Rs,k = ${r.Rsk.toFixed(1)} kN;  Rb,cal = ${r.Rb.toFixed(1)} kN → Rb,k = ${r.Rbk.toFixed(1)} kN`,
    });
    steps.push({
      title: 'DA1 Combination 1 (A1 + M1 + R1)',
      formula: 'Fc,d = 1.35(Gk + W + Fneg,k) + 1.5Qk;  Rc,d = Rb,k/γb + Rs,k/γs',
      substitution: `Fc,d = 1.35(${v.Gk} + ${r.W.toFixed(1)} + ${r.Fneg.toFixed(1)}) + 1.5 × ${v.Qk};  γb = ${r.C1.gb}, γs = ${r.C1.gs}`,
      result: `Fc,d = ${r.C1.Fd.toFixed(1)} kN, Rc,d = ${r.C1.Rd.toFixed(1)} kN, utilisation ${r.C1.util.toFixed(3)}`,
    });
    steps.push({
      title: 'DA1 Combination 2 (A2 + M1 + R4)',
      formula: 'Fc,d = 1.0(Gk + W + Fneg,k) + 1.3Qk;  Rc,d = Rb,k/γb + Rs,k/γs',
      substitution: `Fc,d = (${v.Gk} + ${r.W.toFixed(1)} + ${r.Fneg.toFixed(1)}) + 1.3 × ${v.Qk};  ${r.pt.cls} pile R4${v.slsVerified === 'Yes' ? ' (SLS verified)' : ''}: γb = ${r.C2.gb}, γs = ${r.C2.gs}`,
      result: `Fc,d = ${r.C2.Fd.toFixed(1)} kN, Rc,d = ${r.C2.Rd.toFixed(1)} kN, utilisation ${r.C2.util.toFixed(3)}`,
    });
    const gov = r.C1.util >= r.C2.util ? 'C1' : 'C2';
    const util = Math.max(r.C1.util, r.C2.util);
    const results = [
      { symbol: 'Rs,cal', label: 'Calculated shaft resistance', value: r.Rs, unit: 'kN', precision: 1 },
      { symbol: 'Rb,cal', label: 'Calculated base resistance', value: r.Rb, unit: 'kN', precision: 1 },
      { symbol: 'Fneg,k', label: 'Downdrag (characteristic)', value: r.Fneg, unit: 'kN', precision: 1 },
      { symbol: 'Rc,k', label: 'Characteristic compressive resistance', value: r.Rbk + r.Rsk, unit: 'kN', precision: 1 },
      { symbol: 'Rc,d C1', label: 'Design resistance, C1', value: r.C1.Rd, unit: 'kN', precision: 1 },
      { symbol: 'Rc,d C2', label: 'Design resistance, C2', value: r.C2.Rd, unit: 'kN', precision: 1, highlight: true },
      { symbol: 'util', label: `Utilisation (governing ${gov})`, value: util, unit: '', precision: 3, highlight: true },
    ];
    const verdict = { pass: util <= 1, message: util <= 1 ? `Fc,d ≤ Rc,d in both combinations (governing ${gov}, utilisation ${util.toFixed(2)}).` : `Fc,d exceeds Rc,d in ${gov} (utilisation ${util.toFixed(2)}). Lengthen or enlarge the pile.` };
    return { results, steps, warnings: r.warnings, verdict, values: { rows: r.rows } };
  },
  validation: {
    samples: [
      {
        name: 'S2 — first principles (synthetic): 0.6 m bored pile 0–15 m; clay 0–8 m γ 19, cu 60, α 0.5; sand 8–20 m γ 20, φ′ 32°, Ks/K0 0.9, δ = φ′; dry. Hand: Rs 452.4 + 774.4 = 1226.8 kN; Nq 23.18 × 292 kPa × 0.2827 m² = 1913.5 kN; ξ 1.55, γRd 1.4; C2 R4 2.0/1.6 → Rc,d 794.2 kN',
        inputs: {
          pileType: 'Bored', section: 'Circular', D: 0.6, head: 0, toe: 15, zw: 50, layers: DEFAULT_LAYERS, qbLim: 10000, qsLimClay: 110,
          nProfiles: 1, stiffCap: 'No', loadTest: 'No', slsVerified: 'No', Gk: 500, Qk: 150, selfWeight: 'Ignore (net of displaced soil)',
        },
        expect: {
          'Rs,cal': { value: 1226.8, tol: 12.3, unit: 'kN' },
          'Rb,cal': { value: 1913.5, tol: 19.1, unit: 'kN' },
          'Rc,d C2': { value: 794.2, tol: 7.9, unit: 'kN' },
          'Rc,d C1': { value: 1447.1, tol: 14.5, unit: 'kN' },
        },
      },
      {
        name: 'S2 — downdrag and groundwater (synthetic): as above with clay as downdrag and GWL at 2 m. Clay excluded from Rs; Fneg = 30 × 8 × 1.885 = 452.4 kN. Sand σ′v 8–15 m: 38 + 6×9.19 = 93.1 → 93.1 + 7×10.19 = 164.5 kPa; Rs = 0.26437 × 128.8 × 7 × 1.885 = 449.3 kN',
        inputs: {
          pileType: 'Bored', section: 'Circular', D: 0.6, head: 0, toe: 15, zw: 2,
          layers: [{ ...DEFAULT_LAYERS[0], downdrag: true }, DEFAULT_LAYERS[1]], qbLim: 10000, qsLimClay: 110,
          nProfiles: 1, stiffCap: 'No', loadTest: 'No', slsVerified: 'No', Gk: 500, Qk: 150, selfWeight: 'Ignore (net of displaced soil)',
        },
        expect: { 'Fneg,k': { value: 452.4, tol: 4.5, unit: 'kN' }, 'Rs,cal': { value: 449.3, tol: 4.5, unit: 'kN' } },
      },
      {
        name: 'S2 — driven H-pile, SPT method (synthetic): 305×305 mm, plugged; sand 0–20 m N 20, toe 12 m. qs = 1 × 20 = 20 kPa × 1.22 m × 12 m = 292.8 kN; qb = min(40×20×12/0.305, 8000) = 8000 kPa × 0.0930 m² = 744.2 kN',
        inputs: {
          pileType: 'Driven H-pile', hH: 305, hB: 305, hAs: 140, hBase: 'Plugged box (h·b)', head: 0, toe: 12, zw: 50,
          layers: [{ top: 0, base: 20, type: 'Granular', gamma: 19, cu: 0, phi: 32, N: 20, method: 'SPT (Meyerhof)', alpha: null, downdrag: false }],
          qbLim: 10000, qsLimClay: 110, nProfiles: 1, stiffCap: 'No', loadTest: 'No', slsVerified: 'No', Gk: 300, Qk: 100, selfWeight: 'Ignore (net of displaced soil)',
        },
        expect: { 'Rs,cal': { value: 292.8, tol: 2.9, unit: 'kN' }, 'Rb,cal': { value: 744.2, tol: 7.4, unit: 'kN' } },
      },
    ],
  },
};

// crane-outrigger-mats.js — One outrigger (or track) load spread through a
// stack of mats (steel plate, timber, aluminium, HDPE) and a granular
// working platform to the subgrade. Checks each mat (bending, shear,
// stiffness), platform and subgrade bearing to EC7 Annex D (DA1), vertical
// stress on a buried service (Boussinesq), and writes a plate load test brief.

import { svg, line, rect, text, clamp } from '../js/diagrams.js';
import { rad, deg, drainedBearing, undrainedBearing, boussinesqRect, spread21 } from '../js/geo-core.js';
import { TIMBER_STRENGTH_CLASSES } from '../js/shared-data.js';

const MAT_TYPES = ['Steel plate', 'Timber', 'Aluminium mat', 'HDPE / composite mat'];
const GRADES = ['S275', 'S355', 'C24', 'D40', 'D50', 'D60', 'D70', 'Supplier data'];

const MAT_COLUMNS = [
  { key: 'type', label: 'Mat type', type: 'select', options: MAT_TYPES, width: 130 },
  { key: 'L', label: 'L (m)', type: 'number', step: 0.1, width: 55 },
  { key: 'W', label: 'W (m)', type: 'number', step: 0.1, width: 55 },
  { key: 't', label: 't (mm)', type: 'number', step: 1, width: 55 },
  { key: 'n', label: 'Layers', type: 'number', step: 1, width: 50 },
  { key: 'grade', label: 'Grade', type: 'select', options: GRADES, width: 90 },
  { key: 'MRd', label: 'MRd (kNm/m)', type: 'number', step: 0.1, nullable: true, width: 70 },
  { key: 'VRd', label: 'VRd (kN/m)', type: 'number', step: 1, nullable: true, width: 70 },
  { key: 'EI', label: 'EI (kNm²/m)', type: 'number', step: 1, nullable: true, width: 75 },
  { key: 'w', label: 'Weight (kN/m²)', type: 'number', step: 0.05, nullable: true, width: 70 },
];

const DEFAULT_MATS = [
  { type: 'Steel plate', L: 2.0, W: 2.0, t: 50, n: 1, grade: 'S275', MRd: null, VRd: null, EI: null, w: null },
];

// EN 10025-2 yield strength by thickness (N/mm²).
function steelFy(grade, t) {
  const base = grade === 'S355' ? 355 : 275;
  const steps = [16, 40, 63, 80, 100, 150];
  const red = [0, 10, 20, 30, 40, grade === 'S355' ? 60 : 50];
  const i = steps.findIndex((s) => t <= s);
  return base - red[i === -1 ? red.length - 1 : i];
}

// BS 5268-2 cl. 2.10.6 depth factor K7 for bending (h in mm).
function k7(h) {
  if (h <= 72) return 1.17;
  if (h < 300) return (300 / h) ** 0.11;
  return (0.81 * (h * h + 92300)) / (h * h + 56800);
}

// Section capacities per metre width. Steel at ULS (γM0 = 1.0, elastic Z).
// Timber by BS 5268-2 permissible stress (grade × K3 short-term 1.5 × K7 ×
// K8 1.1) — checked against characteristic load. HDPE from solid section,
// fk 25 / 12 N/mm², γM 1.5, E 1000 N/mm² (assumed — replace with supplier data).
function matCapacity(m) {
  const t = (m.t || 0) / 1000;
  const n = Math.max(1, Math.round(m.n || 1));
  const out = { basis: 'ULS', note: '', ok: true };
  if (m.type === 'Steel plate') {
    const fy = steelFy(m.grade, m.t) * 1000; // kPa
    out.MRd = (fy * t * t) / 6;
    out.VRd = ((fy / Math.sqrt(3)) * t) / 1.5;
    out.EI = (210e6 * t ** 3) / 12;
    out.w = 77 * t;
    out.note = `${m.grade} fy = ${steelFy(m.grade, m.t)} N/mm² (t = ${m.t} mm), Z = t²/6, VRd = (fy/√3)·t/1.5`;
  } else if (m.type === 'Timber') {
    const tc = TIMBER_STRENGTH_CLASSES[m.grade] || TIMBER_STRENGTH_CLASSES.D40;
    const K7 = k7(m.t);
    out.MRd = tc.fmk * 1000 * 1.5 * K7 * 1.1 * (t * t) / 6;
    out.VRd = (tc.fvk * 1000 * 1.5 * 1.1 * t) / 1.5;
    out.EI = (tc.E0mean * 1000 * t ** 3) / 12;
    out.w = 10.5 * t;
    out.basis = 'permissible';
    out.note = `${TIMBER_STRENGTH_CLASSES[m.grade] ? m.grade : 'D40'} BS 5268-2: σm = ${tc.fmk} × K3 1.5 × K7 ${K7.toFixed(3)} × K8 1.1; τ = ${tc.fvk} × 1.5 × 1.1`;
  } else if (m.type === 'HDPE / composite mat') {
    out.MRd = ((25e3 / 1.5) * t * t) / 6;
    out.VRd = ((12e3 / 1.5) * t) / 1.5;
    out.EI = (1000e3 * t ** 3) / 12;
    out.w = 9.5 * t;
    out.note = 'Solid HDPE assumed: fm,k 25, fv,k 12 N/mm², γM 1.5, E 1000 N/mm² — replace with supplier data';
  } else {
    out.MRd = NaN; out.VRd = NaN; out.EI = NaN; out.w = 0.3;
    out.note = 'Aluminium mat: enter supplier MRd, VRd and EI per metre width';
  }
  if (Number.isFinite(m.MRd)) out.MRd = m.MRd;
  if (Number.isFinite(m.VRd)) out.VRd = m.VRd;
  if (Number.isFinite(m.EI)) out.EI = m.EI;
  if (Number.isFinite(m.w)) out.w = m.w;
  if ([m.MRd, m.VRd, m.EI].some(Number.isFinite)) out.note += ' (supplier/user values where entered)';
  out.MRd *= n; out.VRd *= n; out.EI *= n; out.w *= n;
  out.ok = [out.MRd, out.VRd, out.EI].every((x) => Number.isFinite(x) && x > 0);
  return out;
}

// Check one mat loaded over a footprint a × b. Returns the effective plan
// dimensions after any reduction for strength or stiffness.
function checkMat(m, cap, a, b, Fk, Fd, defl) {
  // A mat smaller than the footprint above it limits the footprint (no cantilever).
  a = Math.min(a, m.L); b = Math.min(b, m.W);
  const cx0 = (m.L - a) / 2, cy0 = (m.W - b) / 2;
  const F = cap.basis === 'permissible' ? Fk : Fd;
  const evalAt = (s) => {
    const cx = cx0 * s, cy = cy0 * s;
    const L = a + 2 * cx, W = b + 2 * cy;
    const p = F / (L * W), pk = Fk / (L * W);
    const c = Math.max(cx, cy);
    const mEd = (p * c * c) / 2, vEd = p * c;
    const delta = (pk * c ** 4) / (8 * cap.EI);
    const dLim = c / defl;
    return { s, cx, cy, L, W, p, pk, c, mEd, vEd, delta, dLim, uM: mEd / cap.MRd, uV: vEd / cap.VRd, uD: c > 0 ? delta / dLim : 0 };
  };
  const full = evalAt(1);
  let eff = full;
  const gov = (r) => Math.max(r.uM, r.uV, r.uD);
  if (cap.ok && gov(full) > 1) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (gov(evalAt(mid)) > 1) hi = mid; else lo = mid; }
    eff = evalAt(lo);
  }
  return { full, eff, reduced: eff.s < 0.999, F };
}

export function craneMats(v) {
  const warnings = [];
  const Fk = v.loadUnit === 't' ? v.F * 9.81 : v.F;
  const gF = v.gammaF;
  let a, b;
  if (v.padShape === 'Circular') { a = b = Math.sqrt(Math.PI / 4) * v.padA; }
  else if (v.padShape === 'Square') { a = b = v.padA; }
  else { a = v.padA; b = v.padB; }
  const padText = v.padShape === 'Circular' ? `circular Ø${v.padA} m → equivalent square ${a.toFixed(3)} m` : `${a} × ${b} m`;

  const mats = (v.mats || []).filter((m) => m.L > 0 && m.W > 0);
  const layers = [];
  let Wabove = 0; // characteristic weight of mats above
  let fa = a, fb = b;
  let matsOk = true;
  mats.forEach((m, i) => {
    const cap = matCapacity(m);
    const Fk_i = Fk + Wabove;
    const Fd_i = gF * Fk + 1.35 * Wabove;
    if (m.L < fa - 1e-6 || m.W < fb - 1e-6) warnings.push(`Mat ${i + 1} is smaller than the load footprint above it (${fa.toFixed(2)} × ${fb.toFixed(2)} m). The footprint is cut to the mat size; check bearing between the layers.`);
    if (!cap.ok) { warnings.push(`Mat ${i + 1} (${m.type}): structural capacity not defined. Enter supplier MRd, VRd and EI per metre.`); matsOk = false; }
    const chk = cap.ok ? checkMat(m, cap, fa, fb, Fk_i, Fd_i, v.deflRatio) : null;
    const selfW = cap.w * m.L * m.W;
    if (chk?.reduced) warnings.push(`Mat ${i + 1}: full plan area not effective (${v.deflRatio ? 'strength/stiffness' : 'strength'}). Effective footprint reduced to ${chk.eff.L.toFixed(2)} × ${chk.eff.W.toFixed(2)} m.`);
    layers.push({ i: i + 1, m, cap, chk, a: fa, b: fb, selfW, Fk_i, Fd_i });
    if (chk) { fa = chk.eff.L; fb = chk.eff.W; } else { fa = Math.min(fa, m.L); fb = Math.min(fb, m.W); }
    Wabove += selfW;
  });
  const Wm = Wabove;
  const Lb = fa, Wb = fb; // footprint on the platform

  // Platform and subgrade
  const tanT = Math.tan(rad(v.spreadAngle));
  const Lf = Lb + 2 * v.hp * tanT, Wf = Wb + 2 * v.hp * tanT;
  const A1 = Lb * Wb, A2 = Lf * Wf;
  const Wp = v.hp > 0 ? v.gammaP * (v.hp / 3) * (A1 + A2 + Math.sqrt(A1 * A2)) : 0;
  const combos = { C1: { gQ: 1.5, gG: 1.35, gPhi: 1.0, gCu: 1.0 }, C2: { gQ: 1.3, gG: 1.0, gPhi: 1.25, gCu: 1.4 } };
  const plat = {}, sub = {};
  for (const [k, c] of Object.entries(combos)) {
    // platform material directly under the bottom mat (surface footing)
    if (v.hp > 0) {
      const phiD = deg(Math.atan(Math.tan(rad(v.phiP)) / c.gPhi));
      const Bp = Math.min(Lb, Wb), Lp = Math.max(Lb, Wb);
      const r = drainedBearing({ phi: phiD, c: 0, gammaEff: v.gammaP, q: 0, Bp, Lp, V: 1 });
      const Vd = c.gQ * Fk + c.gG * Wm;
      plat[k] = { phiD, RA: r.RA, R: r.RA * Bp * Lp, Vd, util: Vd / (r.RA * Bp * Lp), r };
    }
    const Bs = Math.min(Lf, Wf), Ls = Math.max(Lf, Wf);
    const q = v.gammaP * v.hp;
    const Vd = c.gQ * Fk + c.gG * (Wm + Wp);
    let RA, detail;
    if (v.subType === 'Cohesive (undrained)') {
      const cuD = v.cu / c.gCu;
      const r = undrainedBearing({ cu: cuD, q, Bp: Bs, Lp: Ls });
      RA = r.RA; detail = `cu,d = ${cuD.toFixed(1)} kPa, sc = ${r.sc.toFixed(3)}: R/A′ = (π+2)·cu,d·sc + q = ${r.RA.toFixed(1)} kPa`;
    } else {
      const phiD = deg(Math.atan(Math.tan(rad(v.phiS)) / c.gPhi));
      const cD = (v.cS || 0) / c.gPhi;
      const r = drainedBearing({ phi: phiD, c: cD, gammaEff: v.gammaS, q, Bp: Bs, Lp: Ls, V: Vd });
      RA = r.RA; detail = `φ′d = ${phiD.toFixed(2)}°, Nq ${r.Nq.toFixed(2)}, Nγ ${r.Ngamma.toFixed(2)}, sq ${r.sq.toFixed(3)}, sγ ${r.sg.toFixed(3)}: R/A′ = ${r.RA.toFixed(1)} kPa`;
    }
    sub[k] = { RA, R: RA * Bs * Ls, Vd, util: Vd / (RA * Bs * Ls), detail };
  }
  if (v.hp > 0 && v.hp < 0.3) warnings.push('Platform thinner than 300 mm. BRE 470 recommends a minimum of 300 mm.');

  // Buried service (characteristic) — Boussinesq under the bottom mat
  let service = null;
  if (Number.isFinite(v.zService) && v.zService > 0) {
    const pk = (Fk + Wm) / A1;
    const dsB = boussinesqRect(pk, Lb, Wb, v.zService, v.xService || 0, 0);
    const ds21 = spread21(pk, Lb, Wb, v.zService);
    service = { pk, dsB, ds21, util: Number.isFinite(v.sigAllow) && v.sigAllow > 0 ? dsB / v.sigAllow : null };
  }

  // Plate load test brief (SLS formation pressure)
  const qFormK = (Fk + Wm + Wp) / A2;
  const qTest = Math.ceil(qFormK / 5) * 5;
  const settleLim = (v.pltPct / 100) * v.pltD;
  return { Fk, gF, a, b, padText, layers, Wm, Lb, Wb, Lf, Wf, Wp, plat, sub, service, qFormK, qTest, settleLim, warnings, matsOk };
}

function diagram(v, output) {
  const r = output?.values?.r || craneMats(v);
  const spanM = Math.max(r.Lf, ...r.layers.map((l) => l.m.L), 3) + 1;
  const sx = 340 / spanM, cx = 200;
  const X = (x) => cx + x * sx;
  let y = 70;
  let inner = '';
  // load arrow + pad
  inner += line(cx, 18, cx, y - 8, { color: 'var(--bb-accent)', width: 3 });
  inner += `<path d="M${cx - 6},${y - 14} L${cx + 6},${y - 14} L${cx},${y - 4} Z" style="fill:var(--bb-accent)" />`;
  inner += text(cx + 8, 26, `F = ${r.Fk.toFixed(0)} kN`, { size: 10, weight: 800, anchor: 'start', color: 'var(--bb-accent-700)' });
  inner += rect(X(-r.a / 2), y - 6, r.a * sx, 6, { fill: 'var(--bb-primary-800)', stroke: 'none' });
  r.layers.forEach((l) => {
    const h = clamp((l.m.t || 20) * (l.m.n || 1) * 0.12, 5, 18);
    const fill = l.m.type === 'Steel plate' ? '#6b7a8f' : l.m.type === 'Timber' ? '#b8864b' : l.m.type === 'Aluminium mat' ? '#c9d1db' : '#2f2f2f';
    inner += rect(X(-l.m.L / 2), y, l.m.L * sx, h, { fill, stroke: 'var(--bb-primary-800)' });
    if (l.chk?.reduced) inner += rect(X(-l.chk.eff.L / 2), y, l.chk.eff.L * sx, h, { fill: 'none', stroke: 'var(--bb-accent)' });
    inner += text(X(l.m.L / 2) + 4, y + h - 2, `${l.i}. ${l.m.type} ${l.m.t} mm${l.m.n > 1 ? ` ×${l.m.n}` : ''}`, { size: 8, anchor: 'start' });
    y += h;
  });
  const hp = clamp(v.hp * 80, 0, 90);
  inner += rect(20, y, 360, hp, { fill: 'var(--bb-accent-100, #fdf0dc)', stroke: 'none' });
  inner += rect(20, y + hp, 360, 290 - y - hp, { fill: 'var(--bb-primary-100)', stroke: 'none' });
  inner += line(20, y, 380, y, { color: 'var(--bb-primary)', width: 1.5 });
  inner += line(20, y + hp, 380, y + hp, { color: 'var(--bb-primary-500)', width: 1, dash: '5 3' });
  inner += text(24, y + 12, `PLATFORM ${v.hp} m, φ′ ${v.phiP}°`, { size: 8.5, anchor: 'start', weight: 700 });
  inner += text(24, y + hp + 12, 'SUBGRADE', { size: 8.5, anchor: 'start', weight: 700 });
  inner += line(X(-r.Lb / 2), y, X(-r.Lf / 2), y + hp, { color: 'var(--bb-accent)', width: 1.4, dash: '4 3' });
  inner += line(X(r.Lb / 2), y, X(r.Lf / 2), y + hp, { color: 'var(--bb-accent)', width: 1.4, dash: '4 3' });
  inner += text(cx, y + hp + 14, `${r.Lf.toFixed(2)} × ${r.Wf.toFixed(2)} m, q ${r.qFormK.toFixed(0)} kPa (SLS)`, { size: 8.5 });
  if (Number.isFinite(v.zService) && v.zService > 0) {
    const ys = y + clamp(v.zService * 80, 4, 290 - y - 8);
    inner += `<circle cx="${X(v.xService || 0).toFixed(1)}" cy="${ys.toFixed(1)}" r="6" fill="none" stroke="#2a7ab8" stroke-width="2" />`;
    inner += text(X(v.xService || 0) + 10, ys + 3, 'service', { size: 8, anchor: 'start', color: '#2a7ab8' });
  }
  return svg('0 0 400 300', inner);
}

export default {
  id: 'crane-outrigger-mats',
  title: 'Crane Outrigger Mats and Platform',
  category: 'Temporary Works — Crane & Piling Platforms',
  tag: 'EC7 DA1 + BS 7121',
  version: '1.0.0',
  references: [
    'BS 7121-1:2016 Code of practice for safe use of cranes — ground conditions and outrigger support',
    'CPA (2022) Good practice guide: Ground conditions for construction plant; CIRIA C703 Crane stability on site',
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) Annex D and UK NA Tables A.NA.3, A.NA.4 — DA1 C1 and C2',
    'BS EN 1993-1-1:2005 cl. 6.2.5, 6.2.6 and BS EN 10025-2:2019 Table 7 — steel plate bending, shear and fy by thickness',
    'BS 5268-2:2002 cl. 2.10.6 (K7), Table 17 (K3), cl. 2.9 (K8) — timber permissible stresses',
    'Poulos, H.G. & Davis, E.H. (1974) Elastic Solutions for Soil and Rock Mechanics — Boussinesq rectangle',
    'BS 9295:2020 — guide to the structural design of buried pipes (allowable surcharge — user entry)',
    'BS 1377-9:1990 cl. 4.1 — plate loading test',
  ],
  description: 'One outrigger or track load through a stack of steel, timber, aluminium or HDPE mats and a granular platform. Checks mat bending, shear and stiffness, platform and subgrade bearing (EC7 DA1), stress on a buried service, and writes a plate load test brief.',
  assumptions: [
    'Each mat spreads load from the footprint above it as a two-way cantilever with uniform ground pressure beneath it. Where strength or stiffness fails, the effective plan area is reduced until the mat passes.',
    'Moment per metre m = p·c²/2 and shear v = p·c, taken over the full mat width. Stiffness check: tip deflection p·c⁴/(8EI) ≤ c/ratio at characteristic load.',
    'Steel and HDPE checked at ULS (γF·F). Timber checked by BS 5268-2 permissible stress at characteristic load.',
    'Several identical layers in one row share load in proportion to stiffness (n × capacity).',
    'Outrigger load is a variable action (C1 γQ 1.5, C2 γQ 1.3). Mat and platform weight are permanent.',
    'Platform spread at the stated angle from vertical. Platform bearing checked as a surface footing; subgrade on the spread area with the platform as overburden.',
    'Buried service stress is the Boussinesq increase at the service crown. The allowable value must come from the service owner or BS 9295 — it is not built in.',
    'HDPE default strengths are assumed values from the source sheet. Aluminium mats need supplier data.',
  ],
  inputs: [
    { name: 'loadUnit', label: 'Load unit', type: 'select', options: ['t', 'kN'], default: 't' },
    { name: 'F', label: 'Maximum outrigger load (characteristic)', type: 'number', unit: 't or kN', default: 40, min: 0, step: 0.5,
      help: 'From the crane manufacturer or lift planner, for the worst slew position.' },
    { name: 'gammaF', label: 'Load factor for mat structural checks γF', type: 'number', default: 1.5, min: 1, step: 0.05 },
    { name: 'padShape', label: 'Outrigger float shape', type: 'select', options: ['Square', 'Rectangular', 'Circular'], default: 'Square' },
    { name: 'padA', label: 'Float side / diameter', type: 'number', unit: 'm', default: 0.6, min: 0.1, step: 0.05 },
    { name: 'padB', label: 'Float width', type: 'number', unit: 'm', default: 0.6, min: 0.1, step: 0.05, showIf: (v) => v.padShape === 'Rectangular' },
    { name: 'mats', label: 'Mat stack (top to bottom)', type: 'table', columns: MAT_COLUMNS, default: DEFAULT_MATS,
      help: 'L along the cantilever, W across it. Layers = identical mats stacked in one row. Leave MRd/VRd/EI blank to derive from grade and t (steel, timber, HDPE). Aluminium mats need supplier values.' },
    { name: 'deflRatio', label: 'Mat stiffness limit c / …', type: 'number', default: 100, min: 20, step: 10 },
    { name: 'hp', label: 'Platform thickness', type: 'number', unit: 'm', default: 0.6, min: 0, step: 0.05 },
    { name: 'phiP', label: "Platform φ′ (characteristic)", type: 'number', unit: '°', default: 40, min: 25, max: 50, step: 0.5 },
    { name: 'gammaP', label: 'Platform unit weight', type: 'number', unit: 'kN/m³', default: 20, min: 15, max: 24, step: 0.5 },
    { name: 'spreadAngle', label: 'Load spread angle from vertical', type: 'number', unit: '°', default: 26.6, min: 0, max: 45, step: 0.1,
      help: '26.6° = 2V:1H. Do not exceed the platform φ′.' },
    { name: 'subType', label: 'Subgrade', type: 'select', options: ['Cohesive (undrained)', 'Granular (drained)'], default: 'Cohesive (undrained)' },
    { name: 'cu', label: 'Subgrade cu', type: 'number', unit: 'kPa', default: 50, min: 1, step: 1, showIf: (v) => v.subType === 'Cohesive (undrained)' },
    { name: 'phiS', label: "Subgrade φ′", type: 'number', unit: '°', default: 30, min: 15, max: 45, step: 0.5, showIf: (v) => v.subType !== 'Cohesive (undrained)' },
    { name: 'cS', label: "Subgrade c′", type: 'number', unit: 'kPa', default: 0, min: 0, step: 1, showIf: (v) => v.subType !== 'Cohesive (undrained)' },
    { name: 'gammaS', label: 'Subgrade effective unit weight', type: 'number', unit: 'kN/m³', default: 18, min: 5, max: 24, step: 0.5, showIf: (v) => v.subType !== 'Cohesive (undrained)' },
    { name: 'zService', label: 'Depth to buried service crown below platform surface (optional)', type: 'number', unit: 'm', default: undefined, min: 0, step: 0.05 },
    { name: 'xService', label: 'Service offset from mat centre', type: 'number', unit: 'm', default: 0, min: 0, step: 0.1, showIf: (v) => Number.isFinite(v.zService) },
    { name: 'sigAllow', label: 'Allowable surcharge on service (optional)', type: 'number', unit: 'kPa', default: undefined, min: 0, step: 1, showIf: (v) => Number.isFinite(v.zService),
      help: 'From the asset owner or BS 9295:2020. Blank = report the stress only.' },
    { name: 'pltD', label: 'PLT plate diameter', type: 'number', unit: 'mm', default: 600, min: 300, step: 50 },
    { name: 'pltPct', label: 'PLT acceptance settlement', type: 'number', unit: '% of plate Ø', default: 1.5, min: 0.5, step: 0.1 },
  ],
  diagram,
  calculate: (v) => {
    const r = craneMats(v);
    const steps = [];
    const results = [];
    steps.push({ title: 'Outrigger load and float', formula: 'Fk = F (t) × 9.81', substitution: `Float ${r.padText}`, result: `Fk = ${r.Fk.toFixed(1)} kN; γF·Fk = ${(r.gF * r.Fk).toFixed(1)} kN` });
    let worstMat = 0;
    r.layers.forEach((l) => {
      const base = `Footprint above ${l.a.toFixed(2)} × ${l.b.toFixed(2)} m; ${l.cap.note}`;
      if (!l.chk) { steps.push({ title: `Mat ${l.i} — ${l.m.type}`, formula: '—', substitution: base, result: 'No capacity data — not checked' }); worstMat = Infinity; return; }
      const f = l.chk.full, e = l.chk.eff;
      worstMat = Math.max(worstMat, f.uM, f.uV, f.uD);
      steps.push({
        title: `Mat ${l.i} — ${l.m.type} ${l.m.L} × ${l.m.W} m × ${l.m.t} mm${l.m.n > 1 ? ` × ${l.m.n} layers` : ''} (${l.cap.basis === 'permissible' ? 'permissible stress, Fk' : 'ULS, γF·F'})`,
        formula: 'p = F/(L·W);  c = max[(L − a)/2, (W − b)/2];  m = p·c²/2;  v = p·c;  δ = pk·c⁴/(8EI) ≤ c/ratio',
        substitution: `${base}; F = ${l.chk.F.toFixed(1)} kN, p = ${f.p.toFixed(1)} kPa, c = ${f.c.toFixed(3)} m`,
        result: `m = ${f.mEd.toFixed(2)} / MRd ${l.cap.MRd.toFixed(2)} kNm/m (${f.uM.toFixed(2)}); v = ${f.vEd.toFixed(1)} / VRd ${l.cap.VRd.toFixed(1)} kN/m (${f.uV.toFixed(2)}); δ = ${(f.delta * 1000).toFixed(2)} / ${(f.dLim * 1000).toFixed(1)} mm (${f.uD.toFixed(2)})${l.chk.reduced ? `; effective ${e.L.toFixed(2)} × ${e.W.toFixed(2)} m` : ''}`,
      });
    });
    steps.push({
      title: 'Spread through the platform',
      formula: "L′ = Lb + 2h·tanθ;  W′ = Wb + 2h·tanθ;  platform weight in the spread prism Wp = γp·h/3·(A1 + A2 + √(A1·A2))",
      substitution: `Bottom footprint ${r.Lb.toFixed(2)} × ${r.Wb.toFixed(2)} m; h = ${v.hp} m; θ = ${v.spreadAngle}°; mats ${r.Wm.toFixed(1)} kN`,
      result: `${r.Lf.toFixed(3)} × ${r.Wf.toFixed(3)} m at formation; Wp = ${r.Wp.toFixed(1)} kN`,
    });
    let worstGeo = 0;
    for (const k of ['C1', 'C2']) {
      if (r.plat[k]) {
        const p = r.plat[k];
        worstGeo = Math.max(worstGeo, p.util);
        steps.push({
          title: `Platform bearing under bottom mat — DA1 ${k}`,
          formula: "R/A′ = ½·γ·B′·Nγ·sγ (surface, c′ = 0);  φ′d = tan⁻¹(tanφ′k/γφ)",
          substitution: `φ′d = ${p.phiD.toFixed(2)}°, Nγ = ${p.r.Ngamma.toFixed(2)}, sγ = ${p.r.sg.toFixed(3)}; Vd = ${k === 'C1' ? '1.5' : '1.3'}·Fk + ${k === 'C1' ? '1.35' : '1.0'}·Wmats`,
          result: `R/A′ = ${p.RA.toFixed(1)} kPa, Rd = ${p.R.toFixed(1)} kN, Vd = ${p.Vd.toFixed(1)} kN, utilisation ${p.util.toFixed(3)}`,
        });
      }
      const s = r.sub[k];
      worstGeo = Math.max(worstGeo, s.util);
      steps.push({
        title: `Subgrade bearing on the spread area — DA1 ${k}`,
        formula: 'EC7 Annex D; q = γp·h; Vd = γQ·Fk + γG·(Wmats + Wp)',
        substitution: s.detail,
        result: `Rd = ${s.R.toFixed(1)} kN, Vd = ${s.Vd.toFixed(1)} kN, utilisation ${s.util.toFixed(3)}`,
      });
    }
    if (r.service) {
      steps.push({
        title: 'Vertical stress on the buried service (characteristic)',
        formula: 'Boussinesq under a uniformly loaded rectangle (corner superposition); 2:1 shown for comparison',
        substitution: `pk = (Fk + Wmats)/(Lb·Wb) = ${r.service.pk.toFixed(1)} kPa; z = ${v.zService} m; offset ${v.xService || 0} m`,
        result: `Δσz = ${r.service.dsB.toFixed(1)} kPa (2:1: ${r.service.ds21.toFixed(1)} kPa)${r.service.util !== null ? ` against ${v.sigAllow} kPa allowable (${r.service.util.toFixed(2)})` : ''}`,
      });
    }
    steps.push({
      title: 'Plate load test brief (SLS verification of the formation)',
      formula: 'q,test ≥ (Fk + Wmats + Wp)/(L′·W′), rounded up to 5 kPa;  settlement limit = % × plate Ø',
      substitution: `q = ${r.qFormK.toFixed(1)} kPa`,
      result: `Test to not less than ${r.qTest} kPa with a Ø${v.pltD} mm plate (≥ 25 mm thick) to BS 1377-9, equal increments, two load–unload cycles. Pass: total settlement ≤ ${r.settleLim.toFixed(1)} mm at ${r.qTest} kPa with no abrupt yielding. About 1 test per 40 m², minimum 5 per platform, plus access points and repaired areas; ≥ 1.0 m from edges, ramps and services. Record pressure–settlement to ±0.1 mm with time readings at each stage. Re-work and re-test any failure. Results to the Temporary Works Coordinator before the crane arrives. PLT is an SLS check, not a ULS test.`,
    });

    results.push(
      { symbol: 'Fk', label: 'Outrigger load (characteristic)', value: r.Fk, unit: 'kN', precision: 1 },
      { symbol: "B'", label: 'Spread width at formation', value: Math.min(r.Lf, r.Wf), unit: 'm', precision: 3 },
      { symbol: 'q,form', label: 'Formation pressure (SLS)', value: r.qFormK, unit: 'kPa', precision: 1 },
      { symbol: 'q,test', label: 'PLT target pressure', value: r.qTest, unit: 'kPa', precision: 0, highlight: true },
      { symbol: 'util,sub C1', label: 'Subgrade utilisation C1', value: r.sub.C1.util, unit: '', precision: 3 },
      { symbol: 'util,sub C2', label: 'Subgrade utilisation C2', value: r.sub.C2.util, unit: '', precision: 3 },
    );
    if (Number.isFinite(worstMat)) results.splice(1, 0, { symbol: 'util,mats', label: 'Worst mat utilisation (full plan area)', value: worstMat, unit: '', precision: 2 });
    if (r.plat.C2) results.push({ symbol: 'util,plat C2', label: 'Platform utilisation C2', value: r.plat.C2.util, unit: '', precision: 3 });
    if (r.service) results.push({ symbol: 'Δσ,service', label: 'Stress increase on service', value: r.service.dsB, unit: 'kPa', precision: 1 });
    const svcU = r.service?.util ?? 0;
    const gov = Math.max(worstGeo, svcU);
    results.push({ symbol: 'util,geo', label: 'Governing ground utilisation', value: gov, unit: '', precision: 2, highlight: true });
    const anyReduced = r.layers.some((l) => l.chk?.reduced);
    const pass = gov <= 1 && r.matsOk;
    const verdict = {
      pass,
      message: !r.matsOk ? 'Mat capacity data missing — enter supplier values.'
        : pass ? `Ground checks pass (utilisation ${gov.toFixed(2)})${anyReduced ? ' using reduced effective mat areas' : ''}.`
          : `Ground utilisation ${gov.toFixed(2)} exceeds 1.0. Increase mat size or stiffness, or platform thickness.`,
    };
    return { results, steps, warnings: r.warnings, verdict, values: { r } };
  },
  validation: {
    samples: [
      {
        name: 'S2 — first principles (synthetic): 400 kN on 0.6 m float, steel plate 2.0 × 2.0 m × 50 mm S275 (fy 255), platform 0.6 m φ′ 40° γ 20, 2V:1H spread, subgrade cu 50 kPa. Hand: p = 600/4 = 150 kPa, c 0.7 m, m = 36.75 / MRd 106.25 kNm/m = 0.346; B′ 2.6 m; Wmat 15.4 kN, Wp 63.84 kN; C2 R/A′ = 5.1416 × 35.71 × 1.2 + 12 = 232.4 kPa, Rd 1570.7 kN, Vd 599.2 kN → 0.3815; Boussinesq at 1.0 m under centre = 103.85 × 0.7009 = 72.8 kPa; PLT 70.9 → 75 kPa',
        inputs: {
          loadUnit: 'kN', F: 400, gammaF: 1.5, padShape: 'Square', padA: 0.6, mats: DEFAULT_MATS, deflRatio: 100,
          hp: 0.6, phiP: 40, gammaP: 20, spreadAngle: Math.atan(0.5) * 180 / Math.PI, subType: 'Cohesive (undrained)', cu: 50,
          zService: 1.0, xService: 0, pltD: 600, pltPct: 1.5,
        },
        expect: {
          'util,mats': { value: 0.346, tol: 0.0035 },
          "B'": { value: 2.6, tol: 0.001, unit: 'm' },
          'util,sub C2': { value: 0.3815, tol: 0.0038 },
          'util,sub C1': { value: 0.3263, tol: 0.0033 },
          'Δσ,service': { value: 72.79, tol: 0.73, unit: 'kPa' },
          'q,test': { value: 75, tol: 0.01, unit: 'kPa' },
        },
      },
      {
        name: 'S2 — platform bearing (synthetic, as above): C2 φ′d = tan⁻¹(tan 40°/1.25) = 33.87°, Nγ = 37.56, sγ 0.7 → R/A′ = ½ × 20 × 2 × 37.56 × 0.7 = 525.9 kPa; Rd 2103.6 kN; Vd = 1.3 × 400 + 15.4 = 535.4 kN → 0.2545',
        inputs: {
          loadUnit: 'kN', F: 400, gammaF: 1.5, padShape: 'Square', padA: 0.6, mats: DEFAULT_MATS, deflRatio: 100,
          hp: 0.6, phiP: 40, gammaP: 20, spreadAngle: Math.atan(0.5) * 180 / Math.PI, subType: 'Cohesive (undrained)', cu: 50, pltD: 600, pltPct: 1.5,
        },
        expect: { 'util,plat C2': { value: 0.2545, tol: 0.0026 } },
      },
    ],
  },
};

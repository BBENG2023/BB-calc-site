// index.js — module contract for the Legato interlocking block bank seat
// designer (calc 11). Inputs are rendered by customUI (ui.js), the report by
// buildReport (report.js); calculate() is pure and DOM-free.

import { evaluate } from './engine.js';
import { SCHEMA_VERSION, migrate } from './schema.js';
import { bbStandard, eliteExample, v2Synthetic } from './presets.js';
import { customUI, renderResults, loadInitialState } from './ui.js';
import { buildReport } from './report.js';
import { diagramD2 } from './drawings.js';
import { burlandBurbidge } from './settlement.js';
import { searchCircles } from './slope.js';
import { buildLayout, solveLevels, resolveCourses } from './layout.js';
import { rotateToAbutment, earthCoefficient } from './actions.js';
import { parseSPT, n60, overburdenCN, phiPHT, phiHatanaka, cuStroud } from '../../js/geo-core.js';
import { LEGATO_BLOCKS, legatoVolume } from '../../js/shared-data.js';
import { clone, inputHash } from './schema.js';

function values(o) {
  const v = {};
  o.ends.forEach((e, i) => {
    const p = `e${i + 1}_`;
    const C = e.checks;
    v[`${p}W_blocks`] = e.layout.totalWeight;
    v[`${p}Ka`] = earthCoefficient(e.geom.epMethod, e.geom.fill.phi).Kh;
    const s = C.E4.govQ;
    if (s) Object.assign(v, { [`${p}SLS_V`]: s.V, [`${p}SLS_H`]: s.H, [`${p}SLS_e`]: Math.abs(s.eB), [`${p}SLS_xR`]: s.xRtoe, [`${p}SLS_qmax`]: s.formation.qmax, [`${p}SLS_qmin`]: s.formation.qmin });
    ['C1', 'C2'].forEach((c) => {
      const b = C.E1.govByCat[c];
      if (b) Object.assign(v, { [`${p}E1_${c}_Vd`]: b.V, [`${p}E1_${c}_Hd`]: b.H, [`${p}E1_${c}_e`]: Math.abs(b.eB), [`${p}E1_${c}_Bp`]: b.Bp, [`${p}E1_${c}_Rd`]: b.Rd, [`${p}E1_${c}_util`]: b.util });
      if (b?.drained) Object.assign(v, { [`${p}E1_${c}_phid`]: b.drained.phid, [`${p}E1_${c}_Nq`]: b.drained.Nq, [`${p}E1_${c}_Ng`]: b.drained.Ngamma, [`${p}E1_${c}_m`]: b.drained.m, [`${p}E1_${c}_iq`]: b.drained.iq, [`${p}E1_${c}_ig`]: b.drained.ig, [`${p}E1_${c}_RA`]: b.drained.RA });
      const sl = C.E2.govByCat[c];
      if (sl) Object.assign(v, { [`${p}E2_${c}_Vfav`]: sl.V, [`${p}E2_${c}_tand`]: sl.tanD, [`${p}E2_${c}_Rd`]: sl.RdTotal, [`${p}E2_${c}_Hd`]: sl.H, [`${p}E2_${c}_util`]: sl.util });
    });
    if (C.E3.governing) Object.assign(v, { [`${p}E3_Mdst`]: C.E3.governing.Mdst, [`${p}E3_Mstb`]: C.E3.governing.Mstb, [`${p}E3_util`]: C.E3.governing.util });
    if (C.E3.legacy) Object.assign(v, { [`${p}E3_LEG_FoS`]: C.E3.legacy.fos, [`${p}E3_LEG_Mstb`]: C.E3.legacy.Mstb, [`${p}E3_LEG_Mdst`]: C.E3.legacy.Mdst });
    if (C.E2.legacy) Object.assign(v, { [`${p}E2_LEG_FoS`]: C.E2.legacy.fos, [`${p}E2_LEG_V`]: C.E2.legacy.V, [`${p}E2_LEG_H`]: C.E2.legacy.H });
    e.interfaces.rows.forEach((r) => {
      if (r.slide) v[`${p}I1_${r.k}_util`] = r.slide.util;
      if (r.topple) v[`${p}I2_${r.k}_util`] = r.topple.util;
      if (r.slideLeg) v[`${p}I1_LEG_FoS_${r.k}`] = r.slideLeg.fos;
      if (r.toppleLeg) Object.assign(v, { [`${p}I2_LEG_FoS_${r.k}`]: r.toppleLeg.fos, [`${p}I2_LEG_Mstb_${r.k}`]: r.toppleLeg.Mstb, [`${p}I2_LEG_Mdst_${r.k}`]: r.toppleLeg.Mdst });
    });
    v[`${p}maxUtil`] = e.maxUtil;
    v[`${p}situations`] = e.situations.length;
  });
  return v;
}

function calculate(state) {
  const o = evaluate(state);
  const e1 = o.ends[0];
  const results = [
    { symbol: 'maxUtil', label: 'Governing utilisation (all checks, both ends)', value: o.maxUtil, unit: '', precision: 3, highlight: true },
  ];
  if (e1.plt) results.push({ symbol: 'plt1', label: `PLT target — ${e1.label}`, value: e1.plt.targetPressure_kPa, unit: 'kPa', precision: 0, highlight: true });
  o.ends.forEach((e) => {
    results.push(
      { symbol: `formation_${e.endIdx + 1}`, label: `${e.label} formation level`, value: e.levels.formation, unit: 'mAOD', precision: 3 },
      { symbol: `pad_${e.endIdx + 1}`, label: `${e.label} pad thickness`, value: e.levels.padThk * 1000, unit: 'mm', precision: 0 },
      { symbol: `blocks_${e.endIdx + 1}`, label: `${e.label} blocks / tonnage`, value: e.layout.totalMassT, unit: `t (${e.layout.totalBlocks} blocks)`, precision: 2 },
    );
  });
  const verdict = {
    pass: o.pass,
    message: o.pass ? 'All checks pass (utilisation ≤ 1.0). Requires CEng review before acceptance.' : `One or more checks fail or are incomplete — governing utilisation ${o.maxUtil.toFixed(3)}${o.errors.length ? `; ${o.errors.length} input error(s)` : ''}${o.xFails.length ? `; ${o.xFails.length} crossing failure(s)` : ''}.`,
  };
  return { results, steps: [], warnings: [...o.errors, ...o.xFails, ...o.warnings], verdict, design: o, values: values(o) };
}

const rel = (value, pct = 0.02) => ({ value, tol: Math.max(Math.abs(value) * pct, 1e-4) });

function runTiling() {
  const s = v2Synthetic();
  const L = buildLayout(s, 0);
  const bad = clone(s); bad.ends[0].arrangement.courses[0].u_rear = 2500;
  const over = clone(s); over.ends[0].arrangement.courses[2].u_rear = 2800;
  const Lb = buildLayout(bad, 0), Lo = buildLayout(over, 0);
  return { results: [
    { symbol: 'C1_blocks', value: L.courses[0].pieces.length },
    { symbol: 'C1_LG8', value: L.courses[0].pieces.filter((p) => p.code === 'LG8').length },
    { symbol: 'C3_LG7', value: L.courses[2].pieces.filter((p) => p.code === 'LG7').length },
    { symbol: 'grid_error', value: Lb.errors.filter((e) => e.includes('multiples of 400')).length },
    { symbol: 'overhang_error', value: Lo.errors.filter((e) => e.includes('overhangs')).length },
  ] };
}

function runLevels() {
  const courses = resolveCourses({ arrangement: { L_mm: 4800, courses: [{ u_front: 0, u_rear: 2400 }, { u_front: 0, u_rear: 2400 }, { u_front: 0, u_rear: 2400 }, { u_front: 800, u_rear: 2400 }] } }, 'retaining-wall');
  const pad = { mode: 'auto', thk: 250, min: 150, max: 500 };
  const a = solveLevels({ targetLevel: 101.6, courses, topIdx: 4, pad, maxFormation: 98.0 });
  const b = solveLevels({ targetLevel: 101.6, courses, topIdx: 4, pad, maxFormation: 99.0 });
  const c = solveLevels({ targetLevel: 101.6, courses, topIdx: 4, pad, maxFormation: 97.5 });
  return { results: [
    { symbol: 'a_pad_mm', value: a.padThk * 1000 }, { symbol: 'a_formation', value: a.formation },
    { symbol: 'b_pad_mm', value: b.padThk * 1000 }, { symbol: 'b_formation', value: b.formation },
    { symbol: 'c_fail', value: c.status === 'fail' ? 1 : 0 }, { symbol: 'c_options', value: c.options.length },
  ] };
}

function runRotation() {
  const r = (x, y, t, e) => rotateToAbutment(x, y, t, e);
  return { results: [
    { symbol: 'th0_E2_Fu', value: r(10, 0, 0, 2).Fu }, { symbol: 'th0_E1_Fu', value: r(10, 0, 0, 1).Fu },
    { symbol: 'th0_E2_Fv', value: r(0, 10, 0, 2).Fv }, { symbol: 'th90_E2_FX_Fu', value: r(10, 0, 90, 2).Fu },
    { symbol: 'th90_E2_FX_Fv', value: r(10, 0, 90, 2).Fv }, { symbol: 'th90_E2_FY_Fu', value: r(0, 10, 90, 2).Fu },
  ] };
}

function runParser() {
  const p = (s) => parseSPT(s);
  const t5 = p('50 (24 for 37mm/50 for 113mm)');
  return { results: [
    { symbol: 'N=15', value: p('N=15').N }, { symbol: '15', value: p('15').N },
    { symbol: '50/113', value: p('50/113').N }, { symbol: '50 for 113mm', value: p('50 for 113mm').N },
    { symbol: 'seated', value: t5.N }, { symbol: 'seating_blows', value: t5.seating?.blows ?? -1 },
    { symbol: 'unseated_paren', value: p('50 (50 for 113mm)').N }, { symbol: 'bad_string_error', value: p('refusal').error ? 1 : 0 },
  ] };
}

export default {
  id: 'legato-abutment',
  title: 'Bridge Abutment — Legato Interlocking Block (Bank Seat)',
  category: 'Bridge Substructures — Precast Block Abutments',
  tag: 'EC7 DA1 · Legato',
  version: '1.0.0',
  schemaVersion: SCHEMA_VERSION,
  debounceMs: 300,
  references: [
    'BS EN 1990:2002+A1:2005 — Basis of structural design, Annex A2 (bridges); UK NA Tables NA.A2.4(A)–(C)',
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) — 2.4.5.2 characteristic values; 2.4.7 limit states; 6.5.2 & Annex D bearing; 6.5.3 sliding; 6.5.4 eccentricity; 6.6 settlement; 9.3.2.2 unplanned excavation; Section 11 overall stability; UK NA',
    'BS EN 1992-1-1:2004+A1:2014 — 6.2.5(2) interface friction; Section 12 plain concrete (αcc,pl = αct,pl = 0.6, UK NA); 12.6.3 shear',
    'BS EN 1991-1-6:2005 — 4.9 actions from flowing water',
    'BS EN 1991-1-7:2006 — accidental actions (vehicle impact)',
    'BS EN 1337-2:2004 — sliding bearing friction (PTFE)',
    'BS 8002:2015 — Earth retaining structures (surcharge, compaction pressure)',
    'PD 6694-1:2011+A1:2020 — Recommendations for the design of structures subject to traffic loading to BS EN 1997-1 (surcharge, compaction)',
    'BS 1377-9:1990 — In-situ tests (plate load test)',
    'Specification for Highway Works Series 600 and 800 (earthworks, Type 1 sub-base)',
    'Elite Precast Concrete Ltd — Legato block drawings EPC-LEG-001 to 008; Retaining wall guide EPCL-2017-RWRG-01',
    'Burland, J.B. & Burbidge, M.C. (1985) Settlement of foundations on sand and gravel. Proc. ICE 78(1)',
    'Stroud, M.A. (1974) The standard penetration test in insensitive clays and soft rocks; Stroud & Butler (1975)',
    'Peck, Hanson & Thornburn (1974) via Wolff (1989); Hatanaka & Uchida (1996); Liao & Whitman (1986)',
    'Bishop, A.W. (1955) The use of the slip circle in the stability analysis of slopes. Géotechnique 5(1)',
    'Vesic, A.S. (1975) Bearing capacity of shallow foundations (ground inclination factors)',
    'CIRIA C742 (2015) Manual on scour at bridges; DMRB CD 356',
    'CDM Regulations 2015; LOLER 1998',
  ],
  description: 'Designs and checks dry-laid Legato interlocking concrete block bank seats for single-span bridges: both ends, ground model from SPT boreholes, EC7 DA1 + EQU external/internal/local checks, Bishop overall stability, settlement, crossing checks, auto-sizing, drawings, schedules and a full design sheet.',
  assumptions: [
    'EC7 Design Approach 1 (Combinations 1 and 2) with EQU; legacy unity-factor FoS (1.5 sliding/toppling) reported alongside for comparison with Elite/CPL designs.',
    'Block self-weight from computed net volume × 2350 kg/m³ unless another basis is chosen; handling uses the greater of stated and computed mass.',
    'Block interfaces resist horizontal load by friction only (μk = 0.5); nib shear is an opt-in BB judgement, not manufacturer data. No tension or friction on vertical joints.',
    'Earth pressure on a vertical virtual back at the rear of each checked stack; Rankine Ka (δ = 0) by default. Fill on steps and heels counts as stabilising weight; surcharge is never counted as stabilising.',
    'Variable vertical traffic is set to zero where favourable (sliding, overturning); bearing checks both γG,sup and γG,inf on weights.',
    'Approach surcharge acts with the leading traffic model (same γQ) unless excluded for that model.',
    'Water: total unit weights with pore pressure (uplift) at each cut — equivalent to buoyant weights (blocks 13.24 kN/m³).',
    'Bearing near a slope: Vesic ground-inclination factors applied when the setback b < 2B (conservative); overall stability (E5) must also pass.',
    'Interface kern (I3) checked under quasi-permanent loading; characteristic eccentricity reported for information.',
    'Overall stability: Bishop simplified circular search only; abutment modelled as a strong material. Non-circular surfaces and undrained drawdown are not implemented.',
    'Skew is used for load resolution and plan drawing only; no 3D skew/wing interaction.',
    'Out of scope: BS EN 1992-4 anchor resistance, scour depth calculation, Vee/Duo blocks, DXF, multi-span piers, EN 1997:2024.',
  ],
  inputs: [],
  initialState: loadInitialState,
  migrate,
  customUI,
  renderResults,
  buildReport,
  diagram: (state, output) => (output?.design ? diagramD2(state, output.design, state.ui?.activeEnd || 0, { compact: true }) : ''),
  calculate,
  validation: {
    samples: [
      {
        name: 'V1 — Elite guide design example (retaining-wall mode, unity factors, Rankine, δ = 0, passive off). Elite’s LimitState GEO gives 1.47 for toppling at C1/C2 — method difference; hand method 1.568 expected.',
        inputs: eliteExample(),
        expect: {
          e1_Ka: rel(0.3333), e1_I2_LEG_FoS_1: rel(1.568), e1_I2_LEG_Mstb_1: rel(107.0), e1_I2_LEG_Mdst_1: rel(68.3),
          e1_I1_LEG_FoS_1: rel(1.358), e1_E3_LEG_FoS: rel(2.166), e1_E3_LEG_Mstb: rel(304.6), e1_E3_LEG_Mdst: rel(140.6),
          e1_E2_LEG_FoS: rel(1.583), e1_E2_LEG_V: rel(259.4), e1_E2_LEG_H: rel(81.9),
          e1_SLS_xR: rel(0.632), e1_SLS_e: rel(0.618), e1_SLS_qmax: rel(273.6),
        },
      },
      {
        name: 'V2 — Synthetic BB standard 4-course bank seat (EN 1990 A1 / EC7 Annex A factors; Elite stated masses; no pad; groundwater deep)',
        inputs: v2Synthetic(),
        expect: {
          e1_W_blocks: rel(632.60), e1_SLS_V: rel(1052.6), e1_SLS_H: rel(167.9), e1_SLS_e: rel(0.130), e1_SLS_qmax: rel(121.2), e1_SLS_qmin: rel(61.6),
          e1_E1_C1_Vd: rel(1466.0), e1_E1_C1_Hd: rel(237.2), e1_E1_C1_e: rel(0.141), e1_E1_C1_Bp: rel(2.118), e1_E1_C1_Rd: rel(6332), e1_E1_C1_util: rel(0.232),
          e1_E1_C2_Vd: rel(1142.6), e1_E1_C2_Hd: rel(233.3), e1_E1_C2_e: rel(0.205), e1_E1_C2_Bp: rel(1.989), e1_E1_C2_phid: rel(26.56), e1_E1_C2_Nq: rel(12.59), e1_E1_C2_Ng: rel(11.59),
          e1_E1_C2_m: rel(1.707), e1_E1_C2_iq: rel(0.677), e1_E1_C2_ig: rel(0.539), e1_E1_C2_RA: rel(256.9), e1_E1_C2_Rd: rel(2453), e1_E1_C2_util: rel(0.466),
          e1_E2_C2_Vfav: rel(752.6), e1_E2_C2_tand: rel(0.3124), e1_E2_C2_Rd: rel(235.1), e1_E2_C2_Hd: rel(233.3), e1_E2_C2_util: rel(0.992), e1_E2_C1_util: rel(0.807),
          e1_E3_Mdst: rel(391.9), e1_E3_Mstb: rel(913.0), e1_E3_util: rel(0.429),
          e1_I1_1_util: rel(0.622), e1_I1_2_util: rel(0.704), e1_I1_3_util: rel(0.608),
          e1_I2_1_util: rel(0.313), e1_I2_2_util: rel(0.417), e1_I2_3_util: rel(0.335),
        },
      },
      {
        name: 'V3 — Burland & Burbidge (B 2.4, L 4.8, N̄ 15, q′ 150 kPa gross, σ′v0 15.2 kPa, t = 30 yr)',
        inputs: { B: 2.4, L: 4.8, Nbar: 15, q: 150, sigmaV0: 15.2, tYears: 30 },
        run: (i) => { const r = burlandBurbidge(i); return { results: [{ symbol: 'Ic', value: r.Ic }, { symbol: 'zI', value: r.zI }, { symbol: 'fs', value: r.fs }, { symbol: 's_i', value: r.si }, { symbol: 'ft', value: r.ft }, { symbol: 's_t', value: r.st }] }; },
        expect: { Ic: rel(0.03859), zI: rel(1.950), fs: rel(1.2346), s_i: rel(12.30), ft: rel(1.500), s_t: rel(18.45) },
      },
      {
        name: 'V4 — SPT processing (refusal extrapolation, energy, overburden, correlations)',
        inputs: {},
        run: () => {
          const p = parseSPT('50 (24 for 37mm/50 for 113mm)');
          const N60a = n60(p.N, 64);
          const CN = overburdenCN(50);
          const N160 = CN * 15;
          return { results: [
            { symbol: 'N_extrap', value: p.N }, { symbol: 'N60_Er64', value: N60a }, { symbol: 'N60_capped', value: Math.min(N60a, 50) },
            { symbol: 'CN', value: CN }, { symbol: 'N160', value: N160 }, { symbol: 'phi_PHT', value: phiPHT(N160) },
            { symbol: 'phi_HU', value: phiHatanaka(N160) }, { symbol: 'phi_HU_capped', value: Math.min(phiHatanaka(N160), 40) }, { symbol: 'cu', value: cuStroud(20, 35) },
          ] };
        },
        expect: { N_extrap: rel(132.7), N60_Er64: rel(141.6), N60_capped: rel(50), CN: rel(1.414), N160: rel(21.21), phi_PHT: rel(33.22), phi_HU: rel(40.60), phi_HU_capped: rel(40.0), cu: rel(90) },
      },
      {
        name: 'V5 — Bishop benchmark, ACADS 1(a) simple slope (c′ 3 kPa, φ′ 19.6°, γ 20, dry). Referee 1.00; independent check 0.984.',
        inputs: {},
        run: () => {
          const mat = { gamma: 20, gammaSat: 20, c: 3, phi: 19.6 };
          const model = { surface: [[-30, 0], [0, 0], [20, 10], [60, 10]], materialAt: () => mat, phreatic: () => -Infinity, pondLevel: () => -Infinity, strips: [], points: [], bottom: -10, xRange: [-30, 60], searchX: [-5, 25], heightScale: 10, yTop: 10 };
          const r = searchCircles(model, [{ fac: { gC: 1, gPhi: 1, gCu: 1 }, loadFac: { gG: 1, gQ: 1 }, drainage: 'drained' }]);
          return { results: [{ symbol: 'FoS_min', value: r.best[0].F }] };
        },
        expect: { FoS_min: { value: 0.99, tol: 0.03 } },
      },
      {
        name: 'V6 — Block volume model (LG1–LG7 within ±0.5% of Elite; LG8 computed 1.0151 m³ raises a data warning)',
        inputs: {},
        run: () => ({ results: [
          ...['LG1', 'LG2', 'LG3', 'LG4', 'LG5', 'LG6', 'LG7'].map((k) => ({ symbol: `${k}_ratio`, value: legatoVolume(LEGATO_BLOCKS[k]) / LEGATO_BLOCKS[k].volStated })),
          { symbol: 'LG8_computed', value: legatoVolume(LEGATO_BLOCKS.LG8) },
          { symbol: 'LG8_warning', value: Math.abs(legatoVolume(LEGATO_BLOCKS.LG8) / LEGATO_BLOCKS.LG8.volStated - 1) > 0.02 ? 1 : 0 },
        ] }),
        expect: {
          LG1_ratio: { value: 1, tol: 0.005 }, LG2_ratio: { value: 1, tol: 0.005 }, LG3_ratio: { value: 1, tol: 0.005 }, LG4_ratio: { value: 1, tol: 0.005 },
          LG5_ratio: { value: 1, tol: 0.005 }, LG6_ratio: { value: 1, tol: 0.005 }, LG7_ratio: { value: 1, tol: 0.005 },
          LG8_computed: { value: 1.0151, tol: 0.0005 }, LG8_warning: { value: 1, tol: 0 },
        },
      },
      {
        name: 'Unit — SPT parser formats ("N=15", "15", "50/113", "50 for 113mm", "50 (24 for 37mm/50 for 113mm)")',
        inputs: {}, run: runParser,
        expect: { 'N=15': { value: 15, tol: 0 }, 15: { value: 15, tol: 0 }, '50/113': rel(132.74, 0.001), '50 for 113mm': rel(132.74, 0.001), seated: rel(132.74, 0.001), seating_blows: { value: 24, tol: 0 }, unseated_paren: rel(132.74, 0.001), bad_string_error: { value: 1, tol: 0 } },
      },
      {
        name: 'Unit — tiling validator (V2 courses; 400 mm grid; overhang)',
        inputs: {}, run: runTiling,
        expect: { C1_blocks: { value: 9, tol: 0 }, C1_LG8: { value: 9, tol: 0 }, C3_LG7: { value: 6, tol: 0 }, grid_error: { value: 1, tol: 0 }, overhang_error: { value: 1, tol: 0 } },
      },
      {
        name: 'Unit — levels solver (seat 101.600, 4 × 800 courses, pad 150–500 auto)',
        inputs: {}, run: runLevels,
        expect: { a_pad_mm: { value: 400, tol: 0.5 }, a_formation: { value: 98.0, tol: 0.0005 }, b_pad_mm: { value: 150, tol: 0.5 }, b_formation: { value: 98.25, tol: 0.0005 }, c_fail: { value: 1, tol: 0 }, c_options: { value: 3, tol: 0 } },
      },
      {
        name: 'Unit — axis rotation (θ = 0°, 90°; End 1 flips so +u is landward)',
        inputs: {}, run: runRotation,
        expect: { th0_E2_Fu: { value: 10, tol: 1e-9 }, th0_E1_Fu: { value: -10, tol: 1e-9 }, th0_E2_Fv: { value: 10, tol: 1e-9 }, th90_E2_FX_Fu: { value: 0, tol: 1e-9 }, th90_E2_FX_Fv: { value: -10, tol: 1e-9 }, th90_E2_FY_Fu: { value: 10, tol: 1e-9 } },
      },
      {
        name: 'Unit — design file JSON round trip (save → load → identical inputs and results)',
        inputs: {},
        run: () => {
          const a = bbStandard();
          const b = migrate(JSON.parse(JSON.stringify(a)));
          const ra = calculate(a).values, rb = calculate(b).values;
          const same = Object.keys(ra).every((k) => ra[k] === rb[k] || (Number.isNaN(ra[k]) && Number.isNaN(rb[k])));
          return { results: [{ symbol: 'hash_equal', value: inputHash(a) === inputHash(b) ? 1 : 0 }, { symbol: 'results_equal', value: same ? 1 : 0 }] };
        },
        expect: { hash_equal: { value: 1, tol: 0 }, results_equal: { value: 1, tol: 0 } },
      },
      {
        name: 'Unit — combination generator (situation counts)',
        inputs: {},
        run: () => ({ results: [{ symbol: 'V2_situations', value: calculate(v2Synthetic()).values.e1_situations }, { symbol: 'BB_situations', value: calculate(bbStandard()).values.e1_situations }] }),
        expect: { V2_situations: { value: 2, tol: 0 }, BB_situations: { value: 6, tol: 0 } },
      },
    ],
  },
};

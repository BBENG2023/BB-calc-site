// presets.js — synthetic example states. No project data: every value is
// either synthetic or taken from the public Elite retaining wall guide.

import { blankState, newEnd, newCourse, newBorehole, newReaction, clone } from './schema.js';
import { FACTOR_PRESETS } from '../../js/shared-data.js';

function setPreset(s, key) {
  s.basis.preset = key;
  s.basis.factors = clone(FACTOR_PRESETS[key]);
}

// V1 — Elite guide design example, retaining-wall mode, unity factors.
export function eliteExample() {
  const s = blankState();
  s.meta.presetName = 'Elite guide example (retaining wall mode)';
  s.meta.notes = 'Elite retaining wall guide design example: 6 courses on a 2.5 × 0.3 m concrete base, fill γ 18, φ′ 30°, q = 10 kPa, unity factors. Elite’s LimitState GEO analysis gives FoS 1.47 for toppling at C1/C2; the rigid-block hand method here gives 1.57 — the difference is method (LimitState models block interaction and the discretised fill wedge), not data.';
  s.project.mode = 'retaining-wall';
  setPreset(s, 'Legacy');
  s.basis.weightBasis = 'gross';
  s.basis.grossGamma = 23.0;
  s.basis.nearSlopeFactor = false;
  s.loads.surcharge = 10;
  s.loads.reactions = [];
  const e = newEnd(1);
  e.label = 'Wall';
  e.seatLevel = 100.3 + 4.8;
  e.frontGroundOverride = 100.5;
  e.fillSurfaceMode = 'z';
  e.fillSurfaceZ = 4.4;
  e.fill = { material: 'User', gamma: 18, gammaSat: 19, phi: 30, phiCv: 30 };
  e.formationMuOverride = 0.5;
  e.groundMode = 'manual';
  e.manualProfile = [{ topLevel: 100.5, baseLevel: 90, cls: 'Granular', desc: 'Founding soil (not given in the Elite example — assumed)', gamma: 18, gammaSat: 19, phi: 30, c: 0, cu: null, mv: null, E: 20, N60: 20, granType: 'Sand', PI: null, rockRd: null }];
  e.arrangement.L_mm = 1000;
  e.arrangement.courses = [
    newCourse({ u_front: 0, u_rear: 2400, role: 'base' }),
    ...[1, 2, 3, 4].map(() => newCourse({ u_front: 0, u_rear: 1600, role: 'base' })),
    newCourse({ u_front: 0, u_rear: 800, role: 'base' }),
  ];
  e.arrangement.pad = { mode: 'fixed', thk: 300, min: 150, max: 500, overhangFront: 0, overhangRear: 100, material: 'Mass concrete', gamma: 23, phi: 40, phiCv: 35 };
  e.arrangement.groutBed = 0;
  e.arrangement.bearingGrout = 0;
  s.ends = [e, newEnd(2)];
  return s;
}

// V2 — synthetic BB standard 4-course bank seat, EN 1990 A1 / EC7 Annex A.
export function v2Synthetic() {
  const s = blankState();
  s.meta.presetName = 'V2 synthetic 4-course bank seat (validation)';
  setPreset(s, 'A1');
  s.basis.weightBasis = 'stated';
  s.basis.nearSlopeFactor = false;
  s.project.bearingHeight = 0;
  s.project.span = 11.2;
  s.project.overallLength = 11.5;
  s.loads.trafficModels = [{ name: 'LM1', excludeSurchargeWind: false }];
  s.loads.reactions = [
    newReaction({ name: 'Bridge permanent (abutment total)', group: 'G', Z: 120 }),
    newReaction({ name: 'Traffic vertical (abutment total)', group: 'Qv', model: 'LM1', Z: 300, psi0: 0.75, psi1: 0.75, psi2: 0 }),
    newReaction({ name: 'Braking towards channel', group: 'Qb', model: 'LM1', X: 40, reversible: true, xFixedOnly: true, psi0: 0, psi1: 0, psi2: 0 }),
  ];
  s.loads.surcharge = 10;
  s.crossing.profile = [{ ch: -20, level: 100.8 }, { ch: 4, level: 100.8 }, { ch: 5, level: 98.0 }, { ch: 8, level: 98.0 }, { ch: 9, level: 100.8 }, { ch: 30, level: 100.8 }];
  s.crossing.bedLevel = 98.0; s.crossing.NWL = 98.5; s.crossing.DFL = 99.0;
  const e = newEnd(1);
  e.frontChainage = 0;
  e.seatLevel = 102.4;
  e.FRL = 103.2;
  e.frontGroundOverride = 100.8;
  e.fill = { material: 'Class 6F2 (SHW 600)', gamma: 20, gammaSat: 21, phi: 42, phiCv: 35 };
  e.groundMode = 'manual';
  e.manualProfile = [{ topLevel: 100.8, baseLevel: 90, cls: 'Granular', desc: 'Founding soil (synthetic)', gamma: 19, gammaSat: 20, phi: 32, c: 0, cu: null, mv: null, E: 20, N60: 20, granType: 'Sand', PI: null, rockRd: null }];
  e.arrangement.courses = [
    newCourse({ u_front: 0, u_rear: 2400, role: 'base' }),
    newCourse({ u_front: 0, u_rear: 2400, role: 'base', typeRule: 'male' }),
    newCourse({ u_front: 800, u_rear: 2400, role: 'seat' }),
    newCourse({ u_front: 1600, u_rear: 2400, role: 'ballast' }),
  ];
  e.arrangement.pad = { mode: 'fixed', thk: 0, min: 150, max: 500, overhangFront: 0, overhangRear: 0, material: 'Type 1 (SHW 803)', gamma: 21, phi: 40, phiCv: 35 };
  e.arrangement.groutBed = 0;
  e.arrangement.bearingGrout = 0;
  const e2 = clone(e);
  e2.label = 'End 2';
  e2.frontChainage = 13.6;
  s.ends = [e, e2];
  return s;
}

// BB standard 4-course bank seat — a full synthetic crossing for the UI.
// Channel: 3 m bed at 97.5, 1:2 banks to 100.5; abutments set back from
// the crests. Courses were sized with the auto-sizer and then fixed here.
export function bbStandard(o = {}) {
  const P0 = { setback1: 3.892, setback2: 3.492, B1: 3200, B2: 3200, s1: 800, s2: 400, n1: 2, n2: 1, ballast: 1200, seat: 2000, DFL: 99.2, mu: 0.1, ...o };
  const s = bbStandardBase();
  const crest1 = 2.0, toe1 = crest1 + 6, toe2 = toe1 + 3, crest2 = toe2 + 6;
  s.crossing.profile = [
    { ch: crest1 - 22, level: 100.6 }, { ch: crest1 - 8, level: 100.55 }, { ch: crest1, level: 100.5 }, { ch: toe1, level: 97.5 },
    { ch: toe2, level: 97.5 }, { ch: crest2, level: 100.5 }, { ch: crest2 + 8, level: 100.55 }, { ch: crest2 + 22, level: 100.6 },
  ];
  s.crossing.bedLevel = 97.5;
  const [e1, e2] = s.ends;
  e1.bankCrest = { ch: crest1, level: 100.5 }; e1.bankToe = { ch: toe1, level: 97.5 };
  e2.bankCrest = { ch: crest2, level: 100.5 }; e2.bankToe = { ch: toe2, level: 97.5 };
  e1.frontChainage = crest1 - P0.setback1;
  e2.frontChainage = crest2 + P0.setback2;
  const fam = (B, st, n) => {
    const up = B - st;
    const c = [];
    for (let i = 0; i < n; i++) c.push(newCourse({ u_front: 0, u_rear: i === 0 ? B : up }));
    c.push(newCourse({ u_front: up - P0.seat, u_rear: up, role: 'seat' }));
    c.push(newCourse({ u_front: up - P0.ballast, u_rear: up, role: 'ballast' }));
    return c;
  };
  e1.arrangement.courses = fam(P0.B1, P0.s1, P0.n1);
  e2.arrangement.courses = fam(P0.B2, P0.s2, P0.n2);
  e2.arrangement.courses[P0.n2].orient = 'T'; // keeps End 2 baseplates clear of block joints
  const bOff = (P0.seat + P0.ballast) / 2;
  const bu1 = (P0.B1 - P0.s1 - bOff) / 1000, bu2 = (P0.B2 - P0.s2 - bOff) / 1000;
  s.crossing.DFL = P0.DFL;
  s.project.slidingMu = P0.mu;
  s.project.bearingCentres = 2.4;
  s.project.span = +((e2.frontChainage + bu2) - (e1.frontChainage - bu1)).toFixed(3);
  s.project.overallLength = +(s.project.span + 0.5).toFixed(3);
  // Synthetic effective-stress parameters for the End 2 clays (as if from
  // triaxial testing): c′ = 5 kPa, φ′ = 26°.
  s.boreholes.filter((b) => b.end === 'End 2').forEach((b) => b.strata.forEach((st) => { if (st.cls === 'Cohesive') st.lab = { c: 5, phi: 26 }; }));
  s.boreholes.forEach((b) => { b.chainage = +(b.end === 'End 1' ? e1.frontChainage + (b.id === 'BH01' ? -5.0 : 1.2) : e2.frontChainage + (b.id === 'BH03' ? 5.0 : -1.2)).toFixed(2); });
  return s;
}

function bbStandardBase() {
  const s = blankState();
  s.meta.presetName = 'BB standard bank seat (synthetic)';
  s.meta.notes = 'Synthetic example only — not a real site. Two synthetic boreholes per end.';
  setPreset(s, 'A2');
  s.basis.weightBasis = 'computed';
  Object.assign(s.project, { bridgeDescription: 'Modular panel footbridge/vehicle bridge (synthetic)', span: 12.192, overallLength: 12.692, deckWidth: 4.2, clearWidth: 3.7, deckDepth: 0.9, bearingCentres: 3.0, bearingsPerEnd: 2, bearingPlateL: 300, bearingPlateB: 400, bearingHeight: 50, fixedEnd: 1, slidingMu: 0.2, skew: 0, modularIncrement: 3.048 });
  s.loads.trafficModels = [{ name: 'LM1', excludeSurchargeWind: false }, { name: 'SV80', excludeSurchargeWind: true }];
  s.loads.reactions = [
    newReaction({ name: 'Deck self-weight', group: 'G', Z: 110 }),
    newReaction({ name: 'Surfacing & parapets', group: 'G2', Z: 25 }),
    newReaction({ name: 'LM1 vertical', group: 'Qv', model: 'LM1', Z: 280, psi0: 0.75, psi1: 0.75, psi2: 0 }),
    newReaction({ name: 'LM1 braking', group: 'Qb', model: 'LM1', X: 45, reversible: true, xFixedOnly: true, psi0: 0, psi1: 0, psi2: 0 }),
    newReaction({ name: 'SV80 vertical', group: 'Qv', model: 'SV80', Z: 380, psi0: 0, psi1: 0, psi2: 0 }),
    newReaction({ name: 'SV80 braking', group: 'Qb', model: 'SV80', X: 60, reversible: true, xFixedOnly: true, psi0: 0, psi1: 0, psi2: 0 }),
    newReaction({ name: 'Wind on deck (transverse)', group: 'Qw', Y: 15, Z: 0, reversible: true, xFixedOnly: false, psi0: 0.6, psi1: 0.2, psi2: 0 }),
  ];
  s.loads.surcharge = 20;
  s.loads.hydraulic = { vm: 1.5, k: 1.44, debrisF: 0, debrisSource: '', flowDir: 'v', includeTraffic: false };
  s.crossing = {
    ...s.crossing,
    profile: [
      { ch: -18, level: 100.6 }, { ch: -4, level: 100.55 }, { ch: 0, level: 100.5 }, { ch: 2.0, level: 100.45 }, { ch: 3.6, level: 98.6 },
      { ch: 4.4, level: 97.6 }, { ch: 8.4, level: 97.5 }, { ch: 9.2, level: 98.6 }, { ch: 10.8, level: 100.4 }, { ch: 12.8, level: 100.45 },
      { ch: 16.8, level: 100.5 }, { ch: 30, level: 100.6 },
    ],
    bedLevel: 97.5, NWL: 98.3, DFL: 99.5, DFLlabel: '1:100 + 40% climate change allowance (synthetic)', DFLsource: 'Synthetic example', EFL: null,
  };
  const e1 = newEnd(1);
  Object.assign(e1, { frontChainage: -1.2, seatLevel: 101.25, FRL: 102.05, phreaticAbut: 98.8, phreaticEdge: 98.3 });
  e1.bankCrest = { ch: 2.0, level: 100.45 };
  e1.bankToe = { ch: 4.4, level: 97.6 };
  e1.scour = { assessed: true, ds: 0.5, source: 'Synthetic scour assessment' };
  e1.fill = { material: 'Class 6N/6P (SHW 600)', gamma: 20, gammaSat: 21, phi: 35, phiCv: 32 };
  e1.arrangement.courses = [
    newCourse({ u_front: 0, u_rear: 2800 }),
    newCourse({ u_front: 0, u_rear: 2800 }),
    newCourse({ u_front: 800, u_rear: 2800, role: 'seat' }),
    newCourse({ u_front: 2000, u_rear: 2800, role: 'ballast' }),
  ];
  e1.arrangement.courses[1].typeRule = 'auto';
  e1.arrangement.L_mm = 4800;
  const e2 = clone(e1);
  Object.assign(e2, { label: 'End 2', frontChainage: 13.8, seatLevel: 101.25, FRL: 102.05 });
  e2.bankCrest = { ch: 10.8, level: 100.4 };
  e2.bankToe = { ch: 8.4, level: 97.5 };
  s.ends = [e1, e2];
  s.boreholes = [
    newBorehole({ id: 'BH01', end: 'End 1', chainage: -3.0, offset: 1.5, GL: 100.55, finalDepth: 8, standing: 1.9, roseTo: 1.8, strike: 2.4, Er: 64,
      strata: [
        { top: 0, base: 0.3, desc: 'Topsoil', cls: 'Topsoil', PI: null, granType: 'Sand', lab: {} },
        { top: 0.3, base: 1.1, desc: 'Soft brown sandy CLAY', cls: 'Cohesive', PI: 18, granType: 'Sand', lab: {} },
        { top: 1.1, base: 5.5, desc: 'Medium dense to dense brown sandy GRAVEL', cls: 'Granular', PI: null, granType: 'Gravel', lab: {} },
        { top: 5.5, base: 8.0, desc: 'Stiff grey CLAY', cls: 'Cohesive', PI: 28, granType: 'Sand', lab: {} },
      ],
      spt: [
        { depth: 0.8, type: 'S', result: 'N=5' }, { depth: 1.5, type: 'C', result: '18' }, { depth: 2.5, type: 'C', result: 'N=24' },
        { depth: 3.5, type: 'C', result: '31' }, { depth: 4.5, type: 'C', result: '50 (24 for 37mm/50 for 113mm)' }, { depth: 6.0, type: 'S', result: '22' }, { depth: 7.5, type: 'S', result: '26' },
      ] }),
    newBorehole({ id: 'BH02', end: 'End 1', chainage: 0.5, offset: -1.5, GL: 100.5, finalDepth: 8, standing: 1.8, Er: 64,
      strata: [
        { top: 0, base: 0.25, desc: 'Topsoil', cls: 'Topsoil', PI: null, granType: 'Sand', lab: {} },
        { top: 0.25, base: 1.0, desc: 'Soft brown sandy CLAY', cls: 'Cohesive', PI: 18, granType: 'Sand', lab: {} },
        { top: 1.0, base: 6.0, desc: 'Medium dense brown sandy GRAVEL', cls: 'Granular', PI: null, granType: 'Gravel', lab: {} },
        { top: 6.0, base: 8.0, desc: 'Stiff grey CLAY', cls: 'Cohesive', PI: 28, granType: 'Sand', lab: {} },
      ],
      spt: [
        { depth: 1.2, type: 'C', result: '16' }, { depth: 2.0, type: 'C', result: '21' }, { depth: 3.0, type: 'C', result: '27' },
        { depth: 4.0, type: 'C', result: '50/150' }, { depth: 5.0, type: 'C', result: '35' }, { depth: 6.5, type: 'S', result: '24' },
      ] }),
    newBorehole({ id: 'BH03', end: 'End 2', chainage: 15.0, offset: 1.5, GL: 100.5, finalDepth: 10, standing: 1.6, Er: 64,
      strata: [
        { top: 0, base: 0.3, desc: 'Topsoil', cls: 'Topsoil', PI: null, granType: 'Sand', lab: {} },
        { top: 0.3, base: 3.2, desc: 'Firm becoming stiff brown slightly sandy CLAY', cls: 'Cohesive', PI: 24, granType: 'Sand', lab: {} },
        { top: 3.2, base: 10.0, desc: 'Stiff to very stiff grey CLAY', cls: 'Cohesive', PI: 30, granType: 'Sand', lab: {} },
      ],
      spt: [
        { depth: 1.0, type: 'S', result: '12' }, { depth: 1.8, type: 'S', result: '15' }, { depth: 2.6, type: 'S', result: '17' },
        { depth: 3.5, type: 'S', result: '22' }, { depth: 5.0, type: 'S', result: '27' }, { depth: 6.5, type: 'S', result: '31' }, { depth: 8.0, type: 'S', result: '36' },
      ] }),
    newBorehole({ id: 'BH04', end: 'End 2', chainage: 12.0, offset: -1.5, GL: 100.45, finalDepth: 8, standing: 1.5, Er: 64,
      strata: [
        { top: 0, base: 0.3, desc: 'Topsoil', cls: 'Topsoil', PI: null, granType: 'Sand', lab: {} },
        { top: 0.3, base: 3.0, desc: 'Firm brown slightly sandy CLAY', cls: 'Cohesive', PI: 24, granType: 'Sand', lab: {} },
        { top: 3.0, base: 8.0, desc: 'Stiff grey CLAY', cls: 'Cohesive', PI: 30, granType: 'Sand', lab: {} },
      ],
      spt: [
        { depth: 1.0, type: 'S', result: '11' }, { depth: 2.0, type: 'S', result: '14' }, { depth: 3.0, type: 'S', result: '18' },
        { depth: 4.5, type: 'S', result: '23' }, { depth: 6.0, type: 'S', result: '28' },
      ] }),
  ];
  s.loads.launch = [];
  return s;
}

export function blankPreset() {
  const s = blankState();
  s.meta.presetName = 'Blank';
  return s;
}

export const PRESETS = [
  { key: 'bb', label: 'BB standard bank seat (synthetic)', build: bbStandard },
  { key: 'elite', label: 'Elite guide example (retaining wall mode)', build: eliteExample },
  { key: 'v2', label: 'V2 validation bank seat (synthetic)', build: v2Synthetic },
  { key: 'blank', label: 'Blank', build: blankPreset },
];

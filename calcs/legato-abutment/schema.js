// schema.js — design-state shape, defaults, field definitions (units,
// limits, tooltips with sources) and small state helpers. Units: levels in
// mAOD, chainages/spans in m, block/course geometry in mm, forces in kN.

import { FACTOR_PRESETS } from '../../js/shared-data.js';

export const SCHEMA_VERSION = 1;

export const clone = (o) => JSON.parse(JSON.stringify(o));

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] === undefined || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export const REACTION_GROUPS = [
  { value: 'G', label: 'G — self-weight' },
  { value: 'G2', label: 'G2 — superimposed' },
  { value: 'Qv', label: 'Q — traffic vertical (model)' },
  { value: 'Qb', label: 'Q — braking (model)' },
  { value: 'Qw', label: 'Q — wind' },
  { value: 'Qt', label: 'Q — thermal' },
  { value: 'Con', label: 'Construction / launch' },
  { value: 'A', label: 'Accidental' },
];

export const STRATUM_CLASSES = ['Topsoil', 'Peat', 'Made ground', 'Cohesive', 'Granular', 'Weathered rock', 'Rock'];
export const UNSUITABLE = new Set(['Topsoil', 'Peat', 'Made ground']);
export const GRANULAR_TYPES = ['Sand', 'Fine/silty sand', 'Gravel'];
export const ALL_BLOCK_TYPES = ['LG1', 'LG2', 'LG3', 'LG4', 'LG5', 'LG6', 'LG7', 'LG8'];

export function newCourse(o = {}) {
  return {
    u_front: 0, u_rear: 2400, v_start: null, v_end: null, orient: 'Mixed', height: 800,
    role: 'auto', typeRule: 'auto', special: false, temporary: false, ...o,
  };
}

export function newEnd(n) {
  return {
    label: `End ${n}`,
    frontChainage: n === 1 ? 0 : 14,
    seatLevel: 101.6,
    FRL: 102.4,
    soffitOverride: null,
    bankCrest: { ch: null, level: null },
    bankToe: { ch: null, level: null },
    scour: { assessed: false, ds: 0, source: '' },
    phreaticAbut: null,
    phreaticEdge: null,
    gwUser: null,
    frontGroundOverride: null,
    minFrontFill: null,
    excavAllowance: null,
    groundMode: 'boreholes',
    designBorehole: 'auto',
    manualProfile: [
      { topLevel: 100.0, baseLevel: 90.0, cls: 'Granular', desc: 'Medium dense sand and gravel', gamma: 19, gammaSat: 20, phi: 32, c: 0, cu: null, mv: null, E: 20, N60: 20, granType: 'Sand', PI: null, rockRd: null },
    ],
    groundOptions: { phiMethod: 'PHT', charMethod: 'auto', Ncap: 50, phiMax: 40, f2: 0.45, overconsolidated: false, overrides: [] },
    fill: { material: 'Class 6N/6P (SHW 600)', gamma: 20, gammaSat: 21, phi: 35, phiCv: 32 },
    fillSurfaceMode: 'FRL',
    fillSurfaceZ: 3.2,
    formationMuOverride: null,
    arrangement: {
      mode: 'check',
      L_mm: 4800,
      allowedTypes: [...ALL_BLOCK_TYPES],
      Bmax_mm: 6400,
      rearStep: true,
      frontStepAtShelf: true,
      shelf_mm: 1600,
      maxSetback: 0,
      wings: { on: false, length_mm: 1600, courses: 2 },
      courses: [
        newCourse({ u_front: 0, u_rear: 2400 }),
        newCourse({ u_front: 0, u_rear: 2400 }),
        newCourse({ u_front: 800, u_rear: 2400, role: 'seat' }),
        newCourse({ u_front: 1600, u_rear: 2400, role: 'ballast' }),
      ],
      pad: { mode: 'auto', thk: 250, min: 150, max: 500, overhangFront: 300, overhangRear: 300, material: 'Type 1 (SHW 803)', gamma: 21, phi: 40, phiCv: 35 },
      groutBed: 20,
      bearingGrout: 10,
      bearingU_mm: null,
      anchors: { perPlate: 6, plateEdge: 50, minEdge: 150 },
      passive: false,
      kpMob: 0.5,
      frontFillOnToe: false,
    },
    settlementLimit: 25,
  };
}

export function newBorehole(o = {}) {
  return {
    id: 'BH1', end: 'End 1', chainage: 0, offset: 0, GL: 100.0, finalDepth: 10,
    strike: null, roseTo: null, standing: null, Er: null,
    strata: [
      { top: 0, base: 0.3, desc: 'Topsoil', cls: 'Topsoil', PI: null, granType: 'Sand', lab: {} },
      { top: 0.3, base: 10, desc: 'Medium dense sand and gravel', cls: 'Granular', PI: null, granType: 'Sand', lab: {} },
    ],
    spt: [],
    ...o,
  };
}

export function newReaction(o = {}) {
  return { name: 'Deck self-weight', group: 'G', model: '', basis: 'total', X: 0, Y: 0, Z: 0, reversible: false, xFixedOnly: true, psi0: 1, psi1: 1, psi2: 1, end: 'Both', ...o };
}

export function blankState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { presetName: 'Blank', notes: '' },
    project: {
      mode: 'bridge',
      bridgeDescription: 'Modular panel bridge',
      span: 12.0,
      overallLength: 12.6,
      deckWidth: 4.2,
      clearWidth: 3.7,
      deckDepth: 0.9,
      bearingCentres: 3.0,
      bearingsPerEnd: 2,
      bearingPlateL: 300,
      bearingPlateB: 400,
      bearingHeight: 50,
      fixedEnd: 1,
      slidingMu: 0.20,
      skew: 0,
      status: 'Permanent',
      designLife: 50,
      modularIncrement: 3.048,
      freeboardRequired: 0.6,
      dMin: 0.45,
      deckClearance: 50,
    },
    basis: {
      preset: 'A2',
      factors: clone(FACTOR_PRESETS.A2),
      weightBasis: 'computed',
      grossGamma: 23.0,
      nibShear: false,
      etaEng: 0.5,
      gammaMuOn: false,
      muBlock: 0.5,
      muConcrete: 0.5,
      epMethod: 'Rankine',
      coulombDeltaRatio: 2 / 3,
      backfillSlope: 0,
      spread: 2,
      settlementDiffLimit: 20,
      legacyBearing: false,
      nearSlopeFactor: true,
      baseInclination: 0,
    },
    loads: {
      trafficModels: [{ name: 'LM1', excludeSurchargeWind: false }],
      reactions: [
        newReaction({ name: 'Deck self-weight', group: 'G', Z: 100, psi0: 1, psi1: 1, psi2: 1 }),
        newReaction({ name: 'Surfacing & parapets', group: 'G2', Z: 20, psi0: 1, psi1: 1, psi2: 1 }),
        newReaction({ name: 'Traffic vertical', group: 'Qv', model: 'LM1', Z: 250, psi0: 0.75, psi1: 0.75, psi2: 0 }),
        newReaction({ name: 'Braking', group: 'Qb', model: 'LM1', X: 40, reversible: true, xFixedOnly: true, psi0: 0, psi1: 0, psi2: 0 }),
      ],
      surcharge: 20,
      surchargePsi0: 0.75,
      surchargeSetback: 0,
      compaction: { on: false, sigma: 12, zc: 1.0 },
      waterHead: 0,
      launch: [],
      plant: { on: false, pressure: 50, width: 3.0, offset: 1.0 },
      hydraulic: { vm: 1.5, k: 1.44, debrisF: 0, debrisSource: '', flowDir: 'v', includeTraffic: false },
      impact: { on: false, F: 0, height: 1.0, dir: 'u' },
    },
    crossing: {
      profile: [
        { ch: -15, level: 100.0 }, { ch: 0, level: 100.0 }, { ch: 2, level: 100.0 }, { ch: 4, level: 97.5 },
        { ch: 10, level: 97.5 }, { ch: 12, level: 100.0 }, { ch: 14, level: 100.0 }, { ch: 29, level: 100.0 },
      ],
      bedLevel: 97.5,
      NWL: 98.2,
      DFL: 99.4,
      DFLlabel: '1:100 + climate change allowance',
      DFLsource: '',
      EFL: null,
      thetaInfMode: 'phi',
      thetaInf: 30,
      regulatoryBuffer: 8,
      scourMargin: 0.3,
      minSetback: 1.0,
    },
    ends: [newEnd(1), newEnd(2)],
    boreholes: [],
    spec: { overrides: {} },
    dra: null,
    ui: { activeEnd: 0, activeTab: 'project' },
    cache: { slope: null, autosize: [null, null] },
  };
}

// Upgrades older design files. Version 1 is the first release, so this
// only back-fills keys that a hand-edited file might have dropped.
export function migrate(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Design file is empty');
  const base = blankState();
  const merged = deepMerge(base, obj);
  merged.schemaVersion = SCHEMA_VERSION;
  merged.ends = (obj.ends || base.ends).map((e, i) => deepMerge(newEnd(i + 1), e));
  return merged;
}

function deepMerge(base, over) {
  if (Array.isArray(over)) return clone(over);
  if (over === null || typeof over !== 'object') return over === undefined ? base : over;
  const out = Array.isArray(base) ? [] : { ...(base || {}) };
  Object.keys(over).forEach((k) => {
    out[k] = base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])
      ? deepMerge(base[k], over[k]) : clone(over[k] === undefined ? base[k] : over[k]);
  });
  return out;
}

// Stable hash of the design inputs (cache and ui excluded) — used to mark
// cached slope/auto-size results stale when inputs change.
export function inputHash(state) {
  const { cache, ui, ...rest } = state;
  const s = JSON.stringify(rest);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// Field definitions for the flat parts of the UI. `help` cites the source
// of each default.
export const FIELDS = {
  project: [
    { path: 'project.mode', label: 'Design mode', type: 'select', rebuild: true, options: [['bridge', 'Bridge bank seat'], ['retaining-wall', 'Retaining wall (Elite guide mode)']], help: 'Retaining-wall mode: no bridge or crossing checks; single section per metre run.' },
    { path: 'project.bridgeDescription', label: 'Bridge description', type: 'text', bridgeOnly: true },
    { path: 'project.span', label: 'Span (bearing to bearing)', unit: 'm', min: 1, step: 0.001, bridgeOnly: true },
    { path: 'project.overallLength', label: 'Deck overall length', unit: 'm', min: 1, step: 0.001, bridgeOnly: true },
    { path: 'project.deckWidth', label: 'Deck overall width', unit: 'm', min: 0.5, step: 0.01, bridgeOnly: true },
    { path: 'project.clearWidth', label: 'Clear width', unit: 'm', min: 0.5, step: 0.01, bridgeOnly: true },
    { path: 'project.deckDepth', label: 'Deck construction depth (drawing/ballast check)', unit: 'm', min: 0.1, step: 0.01, bridgeOnly: true },
    { path: 'project.bearingCentres', label: 'Transverse bearing centres', unit: 'm', min: 0.3, step: 0.01, bridgeOnly: true },
    { path: 'project.bearingsPerEnd', label: 'Bearings per end', min: 1, step: 1, bridgeOnly: true },
    { path: 'project.bearingPlateL', label: 'Bearing plate length (longitudinal)', unit: 'mm', min: 50, step: 5, bridgeOnly: true },
    { path: 'project.bearingPlateB', label: 'Bearing plate width (transverse)', unit: 'mm', min: 50, step: 5, bridgeOnly: true },
    { path: 'project.bearingHeight', label: 'Bearing assembly height', unit: 'mm', min: 0, step: 5, bridgeOnly: true },
    { path: 'project.fixedEnd', label: 'Fixed end', type: 'select', options: [[1, 'End 1'], [2, 'End 2']], numeric: true, bridgeOnly: true },
    { path: 'project.slidingMu', label: 'Free-end sliding bearing μ', min: 0, max: 1, step: 0.01, bridgeOnly: true, help: 'Default 0.20 for steel/steel sliding plates (BB default — verify). PTFE values per BS EN 1337-2 Table 11.' },
    { path: 'project.skew', label: 'Skew angle θ', unit: '°', min: 0, max: 45, step: 0.5, bridgeOnly: true, help: 'Plan drawing and load resolution only.' },
    { path: 'project.status', label: 'Status', type: 'select', options: [['Permanent', 'Permanent works'], ['Temporary', 'Temporary works']] },
    { path: 'project.designLife', label: 'Design life', unit: 'years', min: 1, step: 1, help: 'Blocks rated > 100 years by Elite (EPC-LEG drawings).' },
    { path: 'project.modularIncrement', label: 'Modular span increment (optional)', unit: 'm', min: 0, step: 0.001, bridgeOnly: true, help: 'e.g. 3.048 m panel increment — used for span feedback (X5). 0 = none.' },
    { path: 'project.freeboardRequired', label: 'Required freeboard', unit: 'm', min: 0, step: 0.05, bridgeOnly: true, help: 'Default 600 mm — confirm with the regulator.' },
    { path: 'project.dMin', label: 'Min founding depth below final ground', unit: 'm', min: 0, step: 0.05, help: 'Default 0.45 m (frost).' },
    { path: 'project.deckClearance', label: 'Deck end to ballast wall clearance (min)', unit: 'mm', min: 0, step: 5, bridgeOnly: true, help: 'Default 50 mm construction tolerance.' },
  ],
  basis: [
    { path: 'basis.weightBasis', label: 'Block self-weight basis', type: 'select', options: [['computed', 'Computed volume × 2350 kg/m³ (default)'], ['stated', 'Elite stated masses'], ['gross', 'Gross L×W×H × γ (Elite guide examples)']], help: 'Spec §5.2: computed volume × density for stability. Handling always uses the greater of stated and computed mass.' },
    { path: 'basis.grossGamma', label: 'γ for gross basis', unit: 'kN/m³', min: 15, max: 30, step: 0.01, showIf: (s) => s.basis.weightBasis === 'gross', help: 'Elite guide examples use 23.0.' },
    { path: 'basis.muBlock', label: 'Block–block friction μk', min: 0.1, max: 1, step: 0.01, help: 'BS EN 1992-1-1 6.2.5(2) "very smooth" = 0.5; matches Elite/CPL.' },
    { path: 'basis.muConcrete', label: 'Block–grout / mass concrete μk', min: 0.1, max: 1, step: 0.01, help: 'BS EN 1992-1-1 6.2.5(2).' },
    { path: 'basis.gammaMuOn', label: 'Apply γμ = 1.25 to block interface friction at ULS', type: 'checkbox', help: 'Optional, conservative.' },
    { path: 'basis.nibShear', label: 'Include nib shear at ULS (BB judgement)', type: 'checkbox', help: 'VRd,nib = fctd,pl × A_nib / 1.5 (BS EN 1992-1-1 12.6.3) × η_eng. Not manufacturer data.' },
    { path: 'basis.etaEng', label: 'Nib engagement factor η_eng', min: 0, max: 1, step: 0.05, showIf: (s) => s.basis.nibShear },
    { path: 'basis.epMethod', label: 'Active pressure method', type: 'select', options: [['Rankine', 'Rankine Ka, δ = 0 (default)'], ['Coulomb', 'Coulomb Ka with δ and β'], ['K0', 'At rest K0 = 1 − sin φ′']] },
    { path: 'basis.coulombDeltaRatio', label: 'Coulomb δ/φ′', min: 0, max: 0.667, step: 0.01, showIf: (s) => s.basis.epMethod === 'Coulomb', help: 'δ ≤ (2/3)φ′ (BS EN 1997-1 9.5.1(6)).' },
    { path: 'basis.backfillSlope', label: 'Backfill slope β', unit: '°', min: 0, max: 30, step: 0.5, showIf: (s) => s.basis.epMethod === 'Coulomb' },
    { path: 'basis.spread', label: 'Load spread through pad (V:1H)', min: 1, max: 4, step: 0.5, help: '2V:1H default (editable).' },
    { path: 'basis.nearSlopeFactor', label: 'Apply Vesic ground-inclination factor when setback b < 2B', type: 'checkbox', help: 'gq = gγ = (1 − tan β)². Conservative; E5 must also pass.' },
    { path: 'basis.baseInclination', label: 'Base inclination α (back-batter option)', unit: '°', min: 0, max: 5, step: 0.1, help: 'BS 8002 1:50 back-batter = 1.15°. 0 = level base.' },
    { path: 'basis.legacyBearing', label: 'Report legacy bearing FoS ≥ 3.0', type: 'checkbox' },
    { path: 'basis.settlementDiffLimit', label: 'Differential settlement limit', unit: 'mm', min: 1, step: 1, bridgeOnly: true, help: 'Default 20 mm — replace with bridge supplier limits.' },
  ],
  loads: [
    { path: 'loads.surcharge', label: 'Approach surcharge q', unit: 'kPa', min: 0, step: 0.5, help: '20 kPa vehicular / 10 kPa pedestrian (BS 8002:2015; PD 6694-1). Editable.' },
    { path: 'loads.surchargePsi0', label: 'Surcharge ψ0 (when accompanying)', min: 0, max: 1, step: 0.05 },
    { path: 'loads.surchargeSetback', label: 'Surcharge setback from ballast wall', unit: 'm', min: 0, step: 0.1 },
    { path: 'loads.compaction.on', label: 'Include compaction pressure', type: 'checkbox', help: 'PD 6694-1 / BS 8002 (Ingold) approach.' },
    { path: 'loads.compaction.sigma', label: 'σ′h,comp', unit: 'kPa', min: 0, step: 0.5, showIf: (s) => s.loads.compaction.on },
    { path: 'loads.compaction.zc', label: 'Critical depth zc', unit: 'm', min: 0.05, step: 0.05, showIf: (s) => s.loads.compaction.on },
    { path: 'loads.waterHead', label: 'Differential water head behind abutment', unit: 'm', min: 0, step: 0.05 },
  ],
  hydraulic: [
    { path: 'loads.hydraulic.vm', label: 'Mean flow velocity v_m', unit: 'm/s', min: 0, step: 0.1 },
    { path: 'loads.hydraulic.k', label: 'Shape factor k', min: 0, step: 0.01, help: 'BS EN 1991-1-6 4.9: k = 1.44 rectangular (verify).' },
    { path: 'loads.hydraulic.flowDir', label: 'Flow direction', type: 'select', options: [['v', 'Along the abutment face (v)'], ['u', 'Towards the bank (u)']] },
    { path: 'loads.hydraulic.debrisF', label: 'Debris force', unit: 'kN', min: 0, step: 1, help: 'User value with source, e.g. CIRIA C742.' },
    { path: 'loads.hydraulic.debrisSource', label: 'Debris force source', type: 'text' },
    { path: 'loads.hydraulic.includeTraffic', label: 'Include traffic in flood case', type: 'checkbox' },
  ],
  plant: [
    { path: 'loads.plant.on', label: 'Plant surcharge on bank (slope construction case)', type: 'checkbox' },
    { path: 'loads.plant.pressure', label: 'Track pressure', unit: 'kPa', min: 0, step: 1, showIf: (s) => s.loads.plant.on },
    { path: 'loads.plant.width', label: 'Track loaded width', unit: 'm', min: 0.1, step: 0.1, showIf: (s) => s.loads.plant.on },
    { path: 'loads.plant.offset', label: 'Offset from bank crest (landward)', unit: 'm', min: 0, step: 0.1, showIf: (s) => s.loads.plant.on },
  ],
  impact: [
    { path: 'loads.impact.on', label: 'Include vehicle impact (accidental)', type: 'checkbox', help: 'BS EN 1991-1-7 user value. Protection blocks recommended.' },
    { path: 'loads.impact.F', label: 'Impact force', unit: 'kN', min: 0, step: 5, showIf: (s) => s.loads.impact.on },
    { path: 'loads.impact.height', label: 'Height above front ground', unit: 'm', min: 0, step: 0.05, showIf: (s) => s.loads.impact.on },
    { path: 'loads.impact.dir', label: 'Direction', type: 'select', options: [['u', 'Normal to face'], ['v', 'Along face']], showIf: (s) => s.loads.impact.on },
  ],
  crossing: [
    { path: 'crossing.bedLevel', label: 'Channel bed level', unit: 'mAOD', step: 0.001 },
    { path: 'crossing.NWL', label: 'Normal water level (NWL)', unit: 'mAOD', step: 0.001 },
    { path: 'crossing.DFL', label: 'Design flood level (DFL)', unit: 'mAOD', step: 0.001 },
    { path: 'crossing.DFLlabel', label: 'DFL label', type: 'text' },
    { path: 'crossing.DFLsource', label: 'DFL source', type: 'text' },
    { path: 'crossing.EFL', label: 'Extreme flood level (optional)', unit: 'mAOD', step: 0.001, nullable: true },
    { path: 'crossing.thetaInfMode', label: 'Influence line angle θinf', type: 'select', options: [['phi', 'φ′k of bank soil (default)'], ['45', '45°'], ['user', 'User value']] },
    { path: 'crossing.thetaInf', label: 'θinf (user)', unit: '°', min: 10, max: 60, step: 0.5, showIf: (s) => s.crossing.thetaInfMode === 'user' },
    { path: 'crossing.regulatoryBuffer', label: 'Regulatory buffer', unit: 'm', min: 0, step: 0.5, help: '8 m non-tidal main river, 16 m tidal (England); user value for SEPA/NRW/DfI. Information only.' },
    { path: 'crossing.scourMargin', label: 'Formation margin below scour level', unit: 'm', min: 0, step: 0.05 },
    { path: 'crossing.minSetback', label: 'Minimum setback from bank crest (span feedback)', unit: 'm', min: 0, step: 0.1 },
  ],
  end: [
    { path: 'frontChainage', label: 'Chainage of abutment front face (bottom course)', unit: 'm', step: 0.001, bridgeOnly: true },
    { path: 'seatLevel', label: 'Target bearing seat level (top of seat course)', unit: 'mAOD', step: 0.001 },
    { path: 'FRL', label: 'Approach finished road level (FRL)', unit: 'mAOD', step: 0.001, bridgeOnly: true },
    { path: 'soffitOverride', label: 'Deck soffit level override', unit: 'mAOD', step: 0.001, nullable: true, bridgeOnly: true, help: 'Blank = seat + bearing grout + bearing height.' },
    { path: 'fillSurfaceMode', label: 'Retained fill surface', type: 'select', options: [['FRL', 'At FRL'], ['z', 'Height above underside of bottom course']] },
    { path: 'fillSurfaceZ', label: 'Retained fill surface z', unit: 'm', step: 0.01, showIf: (s, e) => e.fillSurfaceMode === 'z' },
    { path: 'bankCrest.ch', label: 'Bank crest chainage', unit: 'm', step: 0.01, nullable: true, bridgeOnly: true },
    { path: 'bankCrest.level', label: 'Bank crest level', unit: 'mAOD', step: 0.001, nullable: true, bridgeOnly: true },
    { path: 'bankToe.ch', label: 'Bank toe chainage', unit: 'm', step: 0.01, nullable: true, bridgeOnly: true },
    { path: 'bankToe.level', label: 'Bank toe level', unit: 'mAOD', step: 0.001, nullable: true, bridgeOnly: true },
    { path: 'scour.assessed', label: 'Scour assessed at this toe', type: 'checkbox', bridgeOnly: true },
    { path: 'scour.ds', label: 'Design scour depth d_s', unit: 'm', min: 0, step: 0.05, showIf: (s, e) => e.scour.assessed, bridgeOnly: true },
    { path: 'scour.source', label: 'Scour source', type: 'text', showIf: (s, e) => e.scour.assessed, bridgeOnly: true },
    { path: 'phreaticAbut', label: 'Phreatic level in bank at abutment', unit: 'mAOD', step: 0.001, nullable: true, bridgeOnly: true },
    { path: 'phreaticEdge', label: 'Phreatic level at water’s edge', unit: 'mAOD', step: 0.001, nullable: true, bridgeOnly: true },
    { path: 'gwUser', label: 'Design groundwater (user)', unit: 'mAOD', step: 0.001, nullable: true, help: 'Design level = highest of standing, rose-to and this value.' },
    { path: 'frontGroundOverride', label: 'Front ground level override', unit: 'mAOD', step: 0.001, nullable: true, help: 'Blank = long section level at the front face.' },
    { path: 'minFrontFill', label: 'Minimum retained front fill level', unit: 'mAOD', step: 0.001, nullable: true, help: 'Required only if passive or embedment is relied upon.' },
    { path: 'excavAllowance', label: 'Unplanned excavation Δa', unit: 'm', min: 0, step: 0.05, nullable: true, help: 'Blank = 10% of retained height ≤ 0.5 m (by analogy with BS EN 1997-1 9.3.2.2).' },
    { path: 'formationMuOverride', label: 'Formation interface tan δk override', min: 0, max: 1, step: 0.01, nullable: true, help: 'Blank = BS EN 1997-1 6.5.3 rules. Factored by γφ′ in M2.' },
    { path: 'settlementLimit', label: 'Total settlement limit', unit: 'mm', min: 1, step: 1, help: 'Default 25 mm — replace with bridge supplier limits.' },
  ],
  fill: [
    { path: 'fill.gamma', label: 'Backfill γ (bulk)', unit: 'kN/m³', min: 10, step: 0.1 },
    { path: 'fill.gammaSat', label: 'Backfill γsat', unit: 'kN/m³', min: 10, step: 0.1 },
    { path: 'fill.phi', label: 'Backfill φ′k', unit: '°', min: 20, max: 45, step: 0.5, help: 'Justify values above 40°.' },
  ],
  arrangement: [
    { path: 'arrangement.mode', label: 'Mode', type: 'select', options: [['check', 'Check (designer defines courses)'], ['auto', 'Auto-size (tool proposes courses)']] },
    { path: 'arrangement.L_mm', label: 'Transverse length L', unit: 'mm', min: 400, step: 400, help: 'Default = roundUp400(bearing c/c + plate width + 2 × 350 mm).' },
    { path: 'arrangement.Bmax_mm', label: 'Max base width (auto-size)', unit: 'mm', min: 1600, step: 400, showIf: (s, e) => e.arrangement.mode === 'auto' },
    { path: 'arrangement.shelf_mm', label: 'Seat course depth (auto-size)', unit: 'mm', min: 1200, step: 400, showIf: (s, e) => e.arrangement.mode === 'auto' },
    { path: 'arrangement.rearStep', label: 'Allow rear steps (fill on heel)', type: 'checkbox', showIf: (s, e) => e.arrangement.mode === 'auto' },
    { path: 'arrangement.frontStepAtShelf', label: 'Front step at shelf (BB standard)', type: 'checkbox', showIf: (s, e) => e.arrangement.mode === 'auto' },
    { path: 'arrangement.maxSetback', label: 'Max extra setback to try', unit: 'm', min: 0, step: 0.25, showIf: (s, e) => e.arrangement.mode === 'auto' },
    { path: 'arrangement.pad.mode', label: 'Pad thickness', type: 'select', options: [['auto', 'Auto (levels solver)'], ['fixed', 'Fixed']] },
    { path: 'arrangement.pad.thk', label: 'Pad thickness (0 = none)', unit: 'mm', min: 0, max: 500, step: 25, help: 'Allowed range 150–500 mm.' },
    { path: 'arrangement.pad.overhangFront', label: 'Pad overhang — front', unit: 'mm', min: 0, step: 50 },
    { path: 'arrangement.pad.overhangRear', label: 'Pad overhang — rear', unit: 'mm', min: 0, step: 50 },
    { path: 'arrangement.pad.material', label: 'Pad material', type: 'select', options: [['Type 1 (SHW 803)', 'Type 1 sub-base (SHW 803)'], ['Mass concrete', 'Mass concrete']] },
    { path: 'arrangement.pad.gamma', label: 'Pad γ', unit: 'kN/m³', min: 15, step: 0.5 },
    { path: 'arrangement.groutBed', label: 'Bedding grout under ballast wall', unit: 'mm', min: 0, max: 200, step: 5 },
    { path: 'arrangement.bearingGrout', label: 'Bearing grout pad', unit: 'mm', min: 0, max: 50, step: 1 },
    { path: 'arrangement.bearingU_mm', label: 'Bearing centre u (from front face)', unit: 'mm', min: 0, step: 50, nullable: true, bridgeOnly: true, help: 'Blank = centre of the exposed seat.' },
    { path: 'arrangement.anchors.perPlate', label: 'Anchors per baseplate', min: 2, step: 2, bridgeOnly: true },
    { path: 'arrangement.anchors.minEdge', label: 'Anchor min edge distance', unit: 'mm', min: 50, step: 5, bridgeOnly: true },
    { path: 'arrangement.passive', label: 'Rely on passive resistance', type: 'checkbox' },
    { path: 'arrangement.kpMob', label: 'Passive mobilisation factor', min: 0, max: 1, step: 0.05, showIf: (s, e) => e.arrangement.passive },
    { path: 'arrangement.frontFillOnToe', label: 'Count front fill on toe as favourable weight', type: 'checkbox' },
  ],
};

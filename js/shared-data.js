// shared-data.js — central engineering data module. Tables and constants
// that recur across Beaver Bridges' calc masters live here once; any calc
// that needs them imports from here rather than duplicating the numbers.
// If a value a new calc needs isn't here yet, add it here — don't hardcode
// it in the calc file.

// BS EN 338 characteristic strength/stiffness values, N/mm² (=MPa) for
// stresses, N/mm² for E. As used across BB's timber design DATA SHEET tabs.
export const TIMBER_STRENGTH_CLASSES = {
  C16: { fmk: 5.3, ftk: 3.2, fc0k: 6.8, fc90k: 1.7, fvk: 0.67, E0mean: 8800, E0min: 5800 },
  C24: { fmk: 7.5, ftk: 4.5, fc0k: 7.9, fc90k: 1.9, fvk: 0.71, E0mean: 10800, E0min: 7200 },
  C27: { fmk: 9.5, ftk: 6.0, fc0k: 8.2, fc90k: 2.0, fvk: 1.10, E0mean: 11500, E0min: 8200 },
  D30: { fmk: 9.0, ftk: 5.4, fc0k: 8.1, fc90k: 2.2, fvk: 1.40, E0mean: 9500, E0min: 6000 },
  D40: { fmk: 12.5, ftk: 7.5, fc0k: 12.6, fc90k: 3.0, fvk: 2.00, E0mean: 10800, E0min: 7500 },
  D50: { fmk: 16.0, ftk: 9.6, fc0k: 15.2, fc90k: 3.5, fvk: 2.20, E0mean: 15000, E0min: 12600 },
  D60: { fmk: 18.0, ftk: 10.8, fc0k: 18.0, fc90k: 4.0, fvk: 2.40, E0mean: 18500, E0min: 15600 },
  D70: { fmk: 23.0, ftk: 13.8, fc0k: 23.0, fc90k: 4.6, fvk: 2.60, E0mean: 21000, E0min: 18000 },
};

export const K3_LOAD_DURATION = { long: 1.0, medium: 1.25, short: 1.5, veryShort: 1.75 };

// k7 depth factor, selected by the *lesser* dimension of the section (mm).
export const K7_DEPTH_FACTOR = [
  { depthMax: 10, factor: 1.74 }, { depthMax: 15, factor: 1.67 },
  { depthMax: 25, factor: 1.53 }, { depthMax: 40, factor: 1.33 },
  { depthMax: 50, factor: 1.20 }, { depthMax: 75, factor: 1.14 },
  { depthMax: 100, factor: 1.10 }, { depthMax: Infinity, factor: 1.00 },
];

export function k7DepthFactor(depth_mm) {
  return K7_DEPTH_FACTOR.find((row) => depth_mm <= row.depthMax).factor;
}

// Standard sawn softwood sizes (mm), per BB's DATA SHEET section list.
// NOTE: the exact stock list wasn't available to cross-check — this reads
// the "38x100..225" style ranges in the build brief literally as every
// 25 mm step, except where specific sizes were called out on their own
// (150x150, 150x300, 300x300). Verify against BB's actual timber
// supplier availability before relying on this list.
function timberSection(B_mm, D_mm) {
  return {
    name: `${B_mm}x${D_mm}`,
    B_mm,
    D_mm,
    Iy_mm4: (B_mm * D_mm ** 3) / 12,
    Wy_mm3: (B_mm * D_mm ** 2) / 6,
    shearArea_mm2: B_mm * D_mm,
  };
}

function rangeStep(from, to, step) {
  const out = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

export const TIMBER_SECTIONS = [
  ...rangeStep(100, 100, 25).map((d) => timberSection(22, d)),
  ...rangeStep(100, 225, 25).map((d) => timberSection(38, d)),
  ...rangeStep(75, 300, 25).map((d) => timberSection(47, d)),
  ...rangeStep(150, 225, 25).map((d) => timberSection(63, d)),
  ...rangeStep(100, 300, 25).map((d) => timberSection(75, d)),
  ...rangeStep(100, 300, 25).map((d) => timberSection(100, d)),
  timberSection(150, 150),
  timberSection(150, 300),
  timberSection(300, 300),
];

// BS EN 1997-1:2004 Tables A.3/A.4 — geotechnical partial factors for the
// two UK design approach 1 combinations.
export const EC7_PARTIAL_FACTORS = {
  DA1_C1: { gammaG: 1.35, gammaQ: 1.5, gammaPhi: 1.0, gammaC: 1.0, gammaCu: 1.0, gammaGamma: 1.0, gammaRv: 1.0 },
  DA1_C2: { gammaG: 1.0, gammaQ: 1.3, gammaPhi: 1.25, gammaC: 1.25, gammaCu: 1.4, gammaGamma: 1.0, gammaRv: 1.0 },
};

// Bearing capacity factors (Vesic form, EC7 Annex D compatible) — the same
// formula bearing-capacity.js uses directly; shared here so every calc
// that needs Nq/Nc/Nγ gets it from one place.
export function bearingCapacityFactors(phi_deg) {
  const phi = (phi_deg * Math.PI) / 180;
  if (phi_deg <= 0.001) return { Nq: 1, Nc: Math.PI + 2, Ngamma: 0 };
  const tanPhi = Math.tan(phi);
  const Nq = Math.exp(Math.PI * tanPhi) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
  const Nc = (Nq - 1) / tanPhi;
  const Ngamma = 2 * (Nq - 1) * tanPhi;
  return { Nq, Nc, Ngamma };
}

// BRE 470 (2004) Table A1 — Nγp for granular platform material vs φ'p (°).
export const BRE470_NGAMMA_P = { 25: 10.9, 30: 22.4, 35: 48, 40: 109, 45: 272, 50: 763 };

// BRE 470 Table A2 — punching shear coefficient Kp·tanδ vs φ'p (°).
export const BRE470_KPTAN_DELTA = { 35: 3.1, 40: 5.5, 45: 10.0 };

// ---------------------------------------------------------------------------
// Elite Precast Legato interlocking blocks (legato-abutment calc). Each item
// carries `source` and `verify` — confirm against the current Elite drawings
// before relying on any value.
// ---------------------------------------------------------------------------

export const LEGATO_DENSITY_KG_M3 = 2350;
export const LEGATO_GAMMA = (LEGATO_DENSITY_KG_M3 * 9.81) / 1000; // 23.05 kN/m³

const LEGATO_SRC = 'Elite Precast Concrete Ltd, Legato block drawings EPC-LEG-001 to 008';

// L = length (mm), W = width (mm), H = height (mm). `male` = top face has
// male nibs (LG2/4/6/8); female recesses are on every block's underside.
export const LEGATO_BLOCKS = {
  LG1: { code: 'LG1', L: 400, W: 800, H: 800, male: false, nibs: 2, volStated: 0.250, massStated: 590, lifting: '2.5 t note / 5.0 t class', liftFlag: true, drawing: 'EPC-LEG-001 D' },
  LG2: { code: 'LG2', L: 400, W: 800, H: 800, male: true, nibs: 2, volStated: 0.253, massStated: 600, lifting: '2.5 t note / 5.0 t class', liftFlag: true, drawing: 'EPC-LEG-002 D' },
  LG3: { code: 'LG3', L: 800, W: 800, H: 800, male: false, nibs: 4, volStated: 0.502, massStated: 1185, lifting: '2.5 t note / 5.0 t class', liftFlag: true, drawing: 'EPC-LEG-003 D' },
  LG4: { code: 'LG4', L: 800, W: 800, H: 800, male: true, nibs: 4, volStated: 0.507, massStated: 1200, lifting: '5.0 t', liftFlag: false, drawing: 'EPC-LEG-004 D' },
  LG5: { code: 'LG5', L: 1200, W: 800, H: 800, male: false, nibs: 6, volStated: 0.754, massStated: 1775, lifting: '5.0 t', liftFlag: false, drawing: 'EPC-LEG-005 D' },
  LG6: { code: 'LG6', L: 1200, W: 800, H: 800, male: true, nibs: 6, volStated: 0.761, massStated: 1800, lifting: '5.0 t', liftFlag: false, drawing: 'EPC-LEG-006 D' },
  LG7: { code: 'LG7', L: 1600, W: 800, H: 800, male: false, nibs: 8, volStated: 1.006, massStated: 2365, lifting: '5.0 t', liftFlag: false, drawing: 'EPC-LEG-007 C' },
  LG8: { code: 'LG8', L: 1600, W: 800, H: 800, male: true, nibs: 8, volStated: 1.105, massStated: 2400, lifting: '5.0 t', liftFlag: false, drawing: 'EPC-LEG-008 C' },
};
export const LEGATO_BLOCKS_META = { source: LEGATO_SRC, verify: true };

// Block code for a given length (mm) and top interlock.
export function legatoCode(length_mm, male) {
  const map = { 400: ['LG1', 'LG2'], 800: ['LG3', 'LG4'], 1200: ['LG5', 'LG6'], 1600: ['LG7', 'LG8'] };
  const pair = map[length_mm];
  return pair ? pair[male ? 1 : 0] : null;
}

// Interlock geometry (mm) and the volumes derived from it (m³). Nib and
// recess are square frustums: V = h/3 × (A1 + A2 + √(A1·A2)).
export const LEGATO_INTERLOCK = {
  nib: { base: 195, top: 70, height: 60 },
  recess: { base: 210, top: 90, depth: 80 },
  gridEdge: 200,
  gridPitch: 400,
  liftRecessDia: 94,
  liftAnchor: 'T-050-0180 spherical pin anchor (180 mm long, Ø20, foot Ø50) in Ø94 recess at block centre',
  Vrecess: 0.001896,
  Vnib: 0.001132,
  Vlift: (2 / 3) * Math.PI * 0.047 ** 3,
  chamferArea: 0.0002, // 20 × 20 chamfer, triangular section, m²
  tolerance_mm: 5,
  source: LEGATO_SRC,
  verify: true,
};

// Computed block volume (spec §5.2). H may be overridden for special-height
// blocks. Reproduces the Elite stated volumes to within 0.2% for LG1–LG7.
export function legatoVolume(block, H_mm = block.H) {
  const L = block.L / 1000, W = block.W / 1000, H = H_mm / 1000;
  const I = LEGATO_INTERLOCK;
  const edge = 4 * H + 2 * (2 * L + 2 * W);
  return L * W * H - edge * I.chamferArea - block.nibs * I.Vrecess - I.Vlift + (block.male ? block.nibs * I.Vnib : 0);
}

// Plain concrete, BS EN 1992-1-1 Section 12 (UK NA values to be verified).
export const LEGATO_CONCRETE = {
  fcu: 50, fck: 40, fctm: 3.5, fctk005: 2.5,
  alphaCcPl: 0.6, alphaCtPl: 0.6, gammaC: 1.5,
  fcdPl: 16.0, fctdPl: 1.0,
  source: 'BS EN 1992-1-1:2004 §12.3.1 + UK NA (αcc,pl = αct,pl = 0.6)',
  verify: true,
};

// Interface friction defaults (spec §5.5).
export const INTERFACE_FRICTION = {
  blockBlock: { mu: 0.5, source: 'BS EN 1992-1-1 6.2.5(2) "very smooth" (cast against steel moulds); matches Elite/CPL friction factor 0.5', verify: true },
  blockConcrete: { mu: 0.5, source: 'BS EN 1992-1-1 6.2.5(2)', verify: true },
  blockGranular: { deltaRatio: 2 / 3, basis: 'phiCv', source: 'BS EN 1997-1 6.5.3(10) — smooth precast: δ = (2/3)φ′cv', verify: true },
  granularFormation: { basis: 'phi of weaker material', source: 'BS EN 1997-1 6.5.3(10)', verify: true },
  undrainedCap: { ratio: 0.4, source: 'BS EN 1997-1 6.5.3(12)P', verify: true },
};

// Granular and fill materials (spec §5.6). φ in degrees, γ in kN/m³.
export const FILL_MATERIALS = {
  'Type 1 (SHW 803)': { gamma: 21, phi: 40, phiCv: 35, note: 'Pad under blocks', source: 'SHW Series 800 Cl. 803; φ′ BB default', verify: true },
  'Class 6F2 (SHW 600)': { gamma: 20, phi: 40, phiCv: 35, note: 'Approach ramp/backfill — justify φ′ > 40°', source: 'SHW Series 600 Table 6/1', verify: true },
  'Class 6N/6P (SHW 600)': { gamma: 20, phi: 35, phiCv: 32, note: 'Selected granular structural backfill', source: 'SHW Series 600 Table 6/1', verify: true },
  'Mass concrete': { gamma: 24, phi: null, phiCv: null, note: 'Rigid base', source: 'BS EN 1991-1-1 Table A.1', verify: true },
  'Bedding grout': { gamma: 22, phi: null, phiCv: null, note: 'Level adjustment under ballast wall', source: 'Manufacturer data', verify: true },
};

// Default unit weights by soil class and density/consistency band (spec
// §5.6). Granular: [bulk, saturated]. Bands on N60 (Terzaghi & Peck) and cu.
export const UNIT_WEIGHT_DEFAULTS = {
  granular: { loose: [17, 19], medium: [18, 20], dense: [19, 21], veryDense: [20, 21] },
  cohesive: { soft: 17, firm: 18, stiff: 19, veryStiff: 20 },
  peat: 11,
  madeGround: 18,
  source: 'BB default table (BS 8002:2015 Table 1 style values) — verify against site data',
  verify: true,
};

// Partial factor presets (spec §5.7). gQt = traffic, gQo = other variable.
// M sets act on tan φ′, c′ and cu. Every value is editable in the calc.
const M1 = { gPhi: 1.0, gC: 1.0, gCu: 1.0, gGamma: 1.0 };
const M2 = { gPhi: 1.25, gC: 1.25, gCu: 1.4, gGamma: 1.0 };
export const FACTOR_PRESETS = {
  A2: {
    label: 'EN 1990 Annex A2 (bridges) — recommended values, UK NA to be confirmed',
    source: 'BS EN 1990:2002+A1:2005 Annex A2 Tables A2.4(A)–(C); UK NA Tables NA.A2.4(A)–(C) to be confirmed',
    verify: true,
    EQU: { gGsup: 1.05, gGinf: 0.95, gQt: 1.35, gQo: 1.50, M: 'M2' },
    C1: { gGsup: 1.35, gGinf: 1.00, gQt: 1.35, gQo: 1.50, M: 'M1' },
    C2: { gGsup: 1.00, gGinf: 1.00, gQt: 1.15, gQo: 1.30, M: 'M2' },
    M1: { ...M1 }, M2: { ...M2 }, R1: { gRv: 1.0, gRh: 1.0 },
    legacy: { sliding: 1.5, toppling: 1.5, bearing: 3.0 },
    gWater: 1.0, legacyOnly: false,
  },
  A1: {
    label: 'EN 1990 Annex A1 / EC7 Annex A (general)',
    source: 'BS EN 1997-1:2004+A1:2013 Annex A Tables A.1–A.4, A.13; UK NA',
    verify: true,
    EQU: { gGsup: 1.10, gGinf: 0.90, gQt: 1.50, gQo: 1.50, M: 'M2' },
    C1: { gGsup: 1.35, gGinf: 1.00, gQt: 1.50, gQo: 1.50, M: 'M1' },
    C2: { gGsup: 1.00, gGinf: 1.00, gQt: 1.30, gQo: 1.30, M: 'M2' },
    M1: { ...M1 }, M2: { ...M2 }, R1: { gRv: 1.0, gRh: 1.0 },
    legacy: { sliding: 1.5, toppling: 1.5, bearing: 3.0 },
    gWater: 1.0, legacyOnly: false,
  },
  Legacy: {
    label: 'Legacy (Elite/CPL) — unity factors, global FoS',
    source: 'Elite Precast retaining wall guide EPCL-2017-RWRG-01 design examples',
    verify: true,
    EQU: { gGsup: 1.0, gGinf: 1.0, gQt: 1.0, gQo: 1.0, M: 'M1' },
    C1: { gGsup: 1.0, gGinf: 1.0, gQt: 1.0, gQo: 1.0, M: 'M1' },
    C2: { gGsup: 1.0, gGinf: 1.0, gQt: 1.0, gQo: 1.0, M: 'M1' },
    M1: { ...M1 }, M2: { ...M1 }, R1: { gRv: 1.0, gRh: 1.0 },
    legacy: { sliding: 1.5, toppling: 1.5, bearing: 3.0 },
    gWater: 1.0, legacyOnly: true,
  },
  User: {
    label: 'User-defined (e.g. supplier-provided assessment factors)',
    source: 'User-defined — do not mix assessment load factors with EC7 GEO factors without CEng agreement',
    verify: true,
    EQU: { gGsup: 1.05, gGinf: 0.95, gQt: 1.35, gQo: 1.50, M: 'M2' },
    C1: { gGsup: 1.35, gGinf: 1.00, gQt: 1.35, gQo: 1.50, M: 'M1' },
    C2: { gGsup: 1.00, gGinf: 1.00, gQt: 1.15, gQo: 1.30, M: 'M2' },
    M1: { ...M1 }, M2: { ...M2 }, R1: { gRv: 1.0, gRh: 1.0 },
    legacy: { sliding: 1.5, toppling: 1.5, bearing: 3.0 },
    gWater: 1.0, legacyOnly: false,
  },
};

// Data flags surfaced in every Legato abutment report (spec §5.3).
export const LEGATO_DATA_FLAGS = [
  'LG8 stated volume (1.105 m³) is inconsistent with its geometry and stated mass (2400 kg). The computed value 1.015 m³ is used for self-weight. Confirm with Elite.',
  'LG1–LG3 drawings state a 2.5 t anchor/clutch in the handling notes but a 5.0 t load-class anchor in the lifting pin characteristics. Confirm the lifting accessory rating with Elite before specifying.',
  'Elite publish no interlock shear capacity. Any nib shear contribution is BB engineering judgement and must be confirmed with Elite or justified by test.',
  'The Elite guide design examples use γ = 23 kN/m³; the Elite drawings use 2350 kg/m³ (23.05 kN/m³). The drawing value is used unless the weight basis is set otherwise.',
];

// Linear interpolation over a { key: value } lookup table keyed by
// numeric degrees (used for the two BRE 470 tables above).
export function interpLookup(table, x) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (x <= keys[0]) return table[keys[0]];
  if (x >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (x >= a && x <= b) {
      const t = (x - a) / (b - a);
      return table[a] + t * (table[b] - table[a]);
    }
  }
  return table[keys[keys.length - 1]];
}

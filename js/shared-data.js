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

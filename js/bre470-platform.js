// bre470-platform.js — shared BRE 470 (2004) working-platform punching-
// shear computation. Used by both piling-mat-bre470.js and
// crane-pad-bre470.js, which are the same underlying method applied to
// two different pieces of plant — kept as one shared function so the
// maths can't drift between the two calc files (see CONTRIBUTING.md's
// shared-data.js pattern; this lives alongside it rather than in
// shared-data.js itself because it's a full calculation, not a constant
// or a one-line formula).

import { bearingCapacityFactors, BRE470_NGAMMA_P, BRE470_KPTAN_DELTA, interpLookup } from './shared-data.js';

const NC_UNDRAINED = Math.PI + 2; // 5.14

function shapeFactors(W, L) {
  return {
    sc: 1 + 0.2 * (W / L),
    sgamma: 1 - 0.3 * (W / L),
    sp: 1 + (W / L),
  };
}

export const BRE470_REFERENCES = [
  'BRE 470 (2004) — Working platforms for tracked plant, 2nd ed., Annex A',
];

export const BRE470_ASSUMPTIONS = [
  'Punching shear failure mode through the platform into the subgrade (BRE 470 Annex A) — not a global slip-circle check.',
  'Two independent load cases are checked (bearing and travelling); the reported thickness is the greater of the two.',
  "Granular-subgrade punching resistance term derived from this tool's own Rd,subgrade (back-calculated to an equivalent cohesion via Rd/(Nc·sc)) — the brief's instruction to \"substitute the granular subgrade Rd term\" doesn't specify the exact substitution; verify against BRE 470 Annex A directly for a granular subgrade before relying on this.",
  "Nγp and Kp·tanδ are read from BRE 470's tabulated points (φ'p = 25–50°) with linear interpolation between them.",
];

// Standard BRE 470 platform/subgrade inputs, shared by both calcs. Each
// calc's own `inputs` array spreads this in alongside its plant-specific
// fields.
export const BRE470_INPUTS = [
  { name: 'subgradeType', label: 'Subgrade type', type: 'select', options: ['Cohesive', 'Granular'], default: 'Cohesive' },
  { name: 'cu_subgrade', label: 'Subgrade undrained shear strength cu', type: 'number', unit: 'kPa', default: 25, min: 1, step: 1,
    showIf: (v) => v.subgradeType === 'Cohesive' },
  { name: 'phi_subgrade', label: "Subgrade friction angle φ'", type: 'number', unit: '°', default: 25, min: 15, max: 45, step: 0.5,
    showIf: (v) => v.subgradeType === 'Granular' },
  { name: 'gamma_subgrade', label: 'Subgrade unit weight', type: 'number', unit: 'kN/m³', default: 18, min: 10, max: 22, step: 0.5,
    showIf: (v) => v.subgradeType === 'Granular' },
  { name: 'phi_platform', label: "Platform material friction angle φ'p", type: 'number', unit: '°', default: 40, min: 25, max: 50, step: 1 },
  { name: 'gamma_platform', label: 'Platform material unit weight', type: 'number', unit: 'kN/m³', default: 20, min: 16, max: 24, step: 0.5 },
  { name: 'q_case1', label: 'Track pressure — Case 1 (bearing)', type: 'number', unit: 'kPa', default: 185, min: 10, step: 5 },
  { name: 'q_case2', label: 'Track pressure — Case 2 (travelling)', type: 'number', unit: 'kPa', default: 185, min: 10, step: 5 },
  { name: 'W_track', label: 'Track width', type: 'number', unit: 'm', default: 2.8, min: 0.3, step: 0.1 },
  { name: 'L_case1', label: 'Effective track length — Case 1', type: 'number', unit: 'm', default: 3.8, min: 0.5, step: 0.1 },
  { name: 'L_case2', label: 'Effective track length — Case 2', type: 'number', unit: 'm', default: 5.0, min: 0.5, step: 0.1 },
  { name: 'kptan_delta', label: 'Punching coefficient Kp·tanδ (optional)', type: 'number', default: undefined, min: 0, step: 0.1,
    help: "Leave blank to look this up from φ'p (BRE 470 Table A2)." },
];

export function computeBre470Platform(v) {
  const results = [];
  const steps = [];
  const warnings = [];

  const { subgradeType, phi_platform, gamma_platform, W_track } = v;
  const cases = [
    { key: 'case1', label: 'Case 1 (bearing)', q: v.q_case1, L: v.L_case1, gammaQnoPlatform: 2.0, gammaQwithPlatform: 1.6 },
    { key: 'case2', label: 'Case 2 (travelling)', q: v.q_case2, L: v.L_case2, gammaQnoPlatform: 1.5, gammaQwithPlatform: 1.2 },
  ];

  if (![25, 30, 35, 40, 45, 50].includes(phi_platform)) {
    warnings.push(`φ'p = ${phi_platform}° is not one of BRE 470's tabulated points (25/30/35/40/45/50°) — Nγp and Kp·tanδ have been linearly interpolated.`);
  }
  if (subgradeType === 'Cohesive' && v.cu_subgrade < 20) {
    warnings.push(`cu = ${v.cu_subgrade} kPa is very soft — consider ground treatment ahead of platform design.`);
  }

  const Ngammap = interpLookup(BRE470_NGAMMA_P, phi_platform);
  const kptanDelta = v.kptan_delta !== undefined && v.kptan_delta !== null ? v.kptan_delta : interpLookup(BRE470_KPTAN_DELTA, phi_platform);
  steps.push({
    title: 'Platform material factors',
    formula: "Nγp and Kp·tanδ from BRE 470 Tables A1/A2 vs φ'p",
    substitution: `φ'p = ${phi_platform}°`,
    result: `Nγp = ${Ngammap.toFixed(1)}, Kp·tanδ = ${kptanDelta.toFixed(2)}`,
  });

  let subgradeFactors = null;
  if (subgradeType === 'Granular') {
    subgradeFactors = bearingCapacityFactors(v.phi_subgrade);
  }

  const perCase = [];
  let anyPlatformRequired = false;

  cases.forEach((c) => {
    const { sc, sgamma, sp } = shapeFactors(W_track, c.L);

    let RdSubgrade;
    let cuEquivalent = null;
    if (subgradeType === 'Cohesive') {
      RdSubgrade = v.cu_subgrade * NC_UNDRAINED * sc;
    } else {
      RdSubgrade = 0.5 * v.gamma_subgrade * W_track * subgradeFactors.Ngamma * sgamma;
      cuEquivalent = RdSubgrade / (NC_UNDRAINED * sc);
    }
    steps.push({
      title: `${c.label} — subgrade resistance alone`,
      formula: subgradeType === 'Cohesive' ? 'Rd,subgrade = cu·Nc·sc' : "Rd,subgrade = 0.5·γ'·W·Nγ·sγ",
      substitution: subgradeType === 'Cohesive'
        ? `Rd = ${v.cu_subgrade}×${NC_UNDRAINED.toFixed(2)}×${sc.toFixed(3)}`
        : `Rd = 0.5×${v.gamma_subgrade}×${W_track}×${subgradeFactors.Ngamma.toFixed(2)}×${sgamma.toFixed(3)}`,
      result: `Rd,subgrade = ${RdSubgrade.toFixed(1)} kPa`,
    });

    const qDesignNoPlatform = c.q * c.gammaQnoPlatform;
    const platformRequired = RdSubgrade < qDesignNoPlatform;
    if (platformRequired) anyPlatformRequired = true;

    const RdPlatform = 0.5 * gamma_platform * W_track * Ngammap * sgamma;
    const qDesignWithPlatform = c.q * c.gammaQwithPlatform;

    steps.push({
      title: `${c.label} — design load and platform check`,
      formula: 'q,design(no platform) = q·γQ(no platform);  platform required if Rd,subgrade < q,design',
      substitution: `q,design = ${c.q}×${c.gammaQnoPlatform} = ${qDesignNoPlatform.toFixed(1)}`,
      result: platformRequired
        ? `${qDesignNoPlatform.toFixed(1)} > ${RdSubgrade.toFixed(1)} kPa — platform required`
        : `${qDesignNoPlatform.toFixed(1)} ≤ ${RdSubgrade.toFixed(1)} kPa — subgrade alone is adequate`,
    });

    let T = 0;
    if (platformRequired) {
      const cuTerm = subgradeType === 'Cohesive' ? v.cu_subgrade : cuEquivalent;
      const denominator = 2 * (kptanDelta * gamma_platform * W_track + cuTerm * sp);
      T = ((qDesignWithPlatform - RdSubgrade) * W_track) / denominator;
      steps.push({
        title: `${c.label} — required platform thickness`,
        formula: 'T = (q,design − Rd,subgrade)·W / [2·(Kp·tanδ·γp·W + cu·sp)]',
        substitution: `T = (${qDesignWithPlatform.toFixed(1)} − ${RdSubgrade.toFixed(1)})×${W_track} / [2×(${kptanDelta.toFixed(2)}×${gamma_platform}×${W_track} + ${cuTerm.toFixed(1)}×${sp.toFixed(3)})]`,
        result: `T = ${(T * 1000).toFixed(0)} mm`,
      });
    }

    perCase.push({ ...c, RdSubgrade, RdPlatform, qDesignWithPlatform, platformRequired, T_mm: T * 1000 });
  });

  const governing = perCase.reduce((a, b) => (b.T_mm > a.T_mm ? b : a));
  const T_required = Math.ceil(governing.T_mm / 50) * 50;

  perCase.forEach((c) => {
    results.push(
      { symbol: `Rd_subgrade_${c.key}`, label: `Rd,subgrade — ${c.label}`, value: c.RdSubgrade, unit: 'kPa', precision: 1 },
      { symbol: `Rd_platform_${c.key}`, label: `Rd,platform — ${c.label}`, value: c.RdPlatform, unit: 'kPa', precision: 1 },
    );
  });
  results.push({ symbol: 'T_required', label: 'Required platform thickness', value: T_required, unit: 'mm', precision: 0, highlight: true });

  if (T_required > 1000) {
    warnings.push(`Required thickness T = ${T_required} mm exceeds 1.0 m — a very deep platform. Reconsider platform material, ground improvement, or a different plant/mat solution.`);
  }

  const verdict = {
    pass: true,
    message: anyPlatformRequired
      ? `A working platform is required — ${governing.label} governs at T = ${T_required} mm.`
      : 'The subgrade alone is adequate for both load cases — no platform thickness is required by this check (a nominal working surface may still be needed for trafficability).',
  };

  return { results, steps, warnings, verdict, T_required, anyPlatformRequired };
}

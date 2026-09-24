// retaining-wall.js — Cantilever retaining wall stability (overturning,
// sliding, bearing pressure, middle-third rule). BS EN 1997-1 / PD 6694-1.
// Simplified preliminary method: active thrust and surcharge thrust are
// treated as horizontal forces (β only affects Ka via the sloping-backfill
// Rankine formula) — see 'assumptions' below.

import { toRad } from '../js/formatters.js';

function rankineKaSloping(phiDeg, betaDeg) {
  const phi = toRad(phiDeg);
  const beta = toRad(betaDeg);
  const cosBeta = Math.cos(beta);
  const cosPhi = Math.cos(phi);
  const inner = cosBeta * cosBeta - cosPhi * cosPhi;
  const root = Math.sqrt(Math.max(inner, 0));
  return (cosBeta * (cosBeta - root)) / (cosBeta + root);
}

// Horizontal centroid (measured from the toe) of a stem with a vertical
// toe-side face and a tapered heel-side face — closed-form trapezoid
// centroid: xbar = (tb^2 + tb.tt + tt^2) / (3(tb+tt)), offset from the
// stem's front (toe-side) face.
function stemCentroidOffset(tt, tb) {
  return (tb * tb + tb * tt + tt * tt) / (3 * (tb + tt));
}

export default {
  id: 'retaining-wall',
  title: 'Cantilever Retaining Wall Stability',
  category: 'Geotechnical — Retaining structures',
  version: '1.0.0',
  references: [
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) — Geotechnical design',
    'PD 6694-1:2011 — Recommendations for the design of structures subject to traffic loading (retaining structures for highway works)',
    'UK National Annex to BS EN 1997-1',
  ],
  description: 'Overturning, sliding, bearing pressure and middle-third checks for a cantilever retaining wall on a spread footing, per EC7 / PD 6694-1 preliminary methods.',
  assumptions: [
    'Wall stem has a vertical toe-side face; the heel-side face tapers linearly from tb at the base to tt at the top.',
    'Active thrust and surcharge thrust are treated as horizontal forces at this preliminary stage — backfill inclination β affects the active pressure coefficient (Rankine sloping-backfill formula) but not the direction of the resultant thrust.',
    'Soil over the heel is taken as a rectangular block of height H (ground level at top of stem); the additional wedge weight from a sloping backfill surface is not separately included — for significant slopes, verify with a full wedge or slip-surface analysis.',
    'Passive resistance Pp is a direct input (kN/m run); this tool does not derive it from a passive pressure coefficient, and by default assumes it may not be reliably present (e.g. future excavation in front of the wall) unless the engineer confirms otherwise.',
    'No seismic, no dynamic/traffic surcharge amplification, no wall friction on the virtual back face.',
  ],
  inputs: [
    { name: 'H', label: 'Stem height (footing top to top of wall)', type: 'number', unit: 'm', default: 3.8, min: 0.5, step: 0.1 },
    { name: 'tf', label: 'Footing thickness', type: 'number', unit: 'm', default: 0.5, min: 0.2, step: 0.05 },
    { name: 'Lt', label: 'Toe extension', type: 'number', unit: 'm', default: 0.8, min: 0, step: 0.1 },
    { name: 'Lh', label: 'Heel extension', type: 'number', unit: 'm', default: 2.3, min: 0.1, step: 0.1 },
    { name: 'tt', label: 'Stem thickness at top', type: 'number', unit: 'm', default: 0.3, min: 0.15, step: 0.05 },
    { name: 'tb', label: 'Stem thickness at bottom', type: 'number', unit: 'm', default: 0.5, min: 0.15, step: 0.05 },
    { name: 'beta', label: 'Backfill inclination β', type: 'number', unit: '°', default: 0, min: 0, max: 45, step: 1 },
    { name: 'Ka', label: 'Active pressure coefficient Ka (optional)', type: 'number', default: undefined, min: 0, step: 0.01,
      help: "Leave blank to compute via Rankine from φ' and β." },
    { name: 'phi', label: "Backfill friction angle φ'", type: 'number', unit: '°', default: 32, min: 0, max: 45, step: 0.5,
      showIf: (v) => v.Ka === undefined || v.Ka === null },
    { name: 'gamma', label: 'Backfill unit weight γ', type: 'number', unit: 'kN/m³', default: 19.2, min: 10, max: 24, step: 0.1 },
    { name: 'q', label: 'Surcharge', type: 'number', unit: 'kPa', default: 10, min: 0, step: 1 },
    { name: 'qa', label: 'Allowable bearing pressure', type: 'number', unit: 'kPa', default: 200, min: 10, step: 5 },
    { name: 'mu', label: 'Base friction coefficient μ', type: 'number', default: 0.45, min: 0.1, max: 0.9, step: 0.01 },
    { name: 'Pp', label: 'Passive resistance Pp', type: 'number', unit: 'kN/m', default: 0, min: 0, step: 1,
      help: 'Enter 0 to ignore passive resistance (common for a conservative preliminary check).' },
    { name: 'gammac', label: 'Concrete unit weight γc', type: 'number', unit: 'kN/m³', default: 24, min: 20, max: 26, step: 0.5 },
  ],
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    const { H, tf, Lt, Lh, tt, tb, beta, gamma, q, qa, mu, Pp, gammac } = v;
    const phi = v.phi ?? 0;

    if (beta > phi) {
      warnings.push(`Backfill inclination β = ${beta}° exceeds the friction angle φ' = ${phi}° — the slope is not stable at this angle; Ka has been capped at its φ'=β limit.`);
    }
    if (H > 8) {
      warnings.push(`Wall height H = ${H} m is beyond the typical economic range for a simple cantilever wall — consider an anchored or tied alternative.`);
    }

    const betaForKa = Math.min(beta, phi);
    const Ka = v.Ka !== undefined && v.Ka !== null ? v.Ka : rankineKaSloping(phi, betaForKa);
    steps.push({
      title: 'Active pressure coefficient',
      formula: v.Ka !== undefined && v.Ka !== null
        ? 'Ka supplied directly by the engineer'
        : "Ka = cosβ(cosβ − √(cos²β − cos²φ′)) / (cosβ + √(cos²β − cos²φ′))  [Rankine, sloping backfill]",
      substitution: v.Ka !== undefined && v.Ka !== null ? `Ka = ${v.Ka}` : `φ′ = ${phi}°, β = ${beta}°`,
      result: `Ka = ${Ka.toFixed(3)}`,
    });

    const B = Lt + tb + Lh;
    steps.push({
      title: 'Base width',
      formula: 'B = Lt + tb + Lh',
      substitution: `B = ${Lt} + ${tb} + ${Lh}`,
      result: `B = ${B.toFixed(2)} m`,
    });

    const stemArea = (H * (tt + tb)) / 2;
    const Wstem = stemArea * gammac;
    const xStem = Lt + stemCentroidOffset(tt, tb);
    steps.push({
      title: 'Stem weight and lever arm',
      formula: 'Wstem = [H(tt+tb)/2]·γc;  x̄stem = Lt + (tb²+tb·tt+tt²)/[3(tb+tt)]',
      substitution: `Wstem = [${H}×(${tt}+${tb})/2]×${gammac}`,
      result: `Wstem = ${Wstem.toFixed(1)} kN/m at x̄ = ${xStem.toFixed(2)} m from toe`,
    });

    const Wfooting = B * tf * gammac;
    const xFooting = B / 2;
    steps.push({
      title: 'Footing weight and lever arm',
      formula: 'Wfooting = B·tf·γc;  x̄footing = B/2',
      substitution: `Wfooting = ${B.toFixed(2)}×${tf}×${gammac}`,
      result: `Wfooting = ${Wfooting.toFixed(1)} kN/m at x̄ = ${xFooting.toFixed(2)} m from toe`,
    });

    const Wheel = Lh * H * gamma;
    const xHeel = B - Lh / 2;
    steps.push({
      title: 'Soil weight over heel and lever arm',
      formula: 'Wheel = Lh·H·γ;  x̄heel = B − Lh/2',
      substitution: `Wheel = ${Lh}×${H}×${gamma}`,
      result: `Wheel = ${Wheel.toFixed(1)} kN/m at x̄ = ${xHeel.toFixed(2)} m from toe`,
    });

    const sumV = Wstem + Wfooting + Wheel;
    const MR = Wstem * xStem + Wfooting * xFooting + Wheel * xHeel;
    steps.push({
      title: 'Total vertical load and restoring moment',
      formula: 'ΣV = Wstem + Wfooting + Wheel;  MR = Σ(Wi·x̄i)',
      substitution: `ΣV = ${Wstem.toFixed(1)} + ${Wfooting.toFixed(1)} + ${Wheel.toFixed(1)}`,
      result: `ΣV = ${sumV.toFixed(1)} kN/m, MR = ${MR.toFixed(1)} kNm/m`,
    });

    const Pa = 0.5 * Ka * gamma * H * H;
    const Psur = Ka * q * H;
    const sumH = Pa + Psur;
    const armPa = tf + H / 3;
    const armSur = tf + H / 2;
    const MO = Pa * armPa + Psur * armSur;
    steps.push({
      title: 'Active thrust, surcharge thrust and overturning moment',
      formula: 'Pa = 0.5·Ka·γ·H²  (acts at tf + H/3 above base);  Psur = Ka·q·H  (acts at tf + H/2 above base);  MO = Pa·armPa + Psur·armSur',
      substitution: `Pa = 0.5×${Ka.toFixed(3)}×${gamma}×${H}²; Psur = ${Ka.toFixed(3)}×${q}×${H}`,
      result: `Pa = ${Pa.toFixed(1)} kN/m, Psur = ${Psur.toFixed(1)} kN/m, ΣH = ${sumH.toFixed(1)} kN/m, MO = ${MO.toFixed(1)} kNm/m`,
    });

    const FoS_OT = MR / MO;
    const FoS_S = (mu * sumV + Pp) / sumH;
    steps.push({
      title: 'Factors of safety',
      formula: 'FoS(overturning) = MR/MO ≥ 2.0;  FoS(sliding) = (μ·ΣV + Pp)/ΣH ≥ 1.5',
      substitution: `FoS_OT = ${MR.toFixed(1)}/${MO.toFixed(1)}; FoS_S = (${mu}×${sumV.toFixed(1)} + ${Pp})/${sumH.toFixed(1)}`,
      result: `FoS_OT = ${FoS_OT.toFixed(2)}, FoS_S = ${FoS_S.toFixed(2)}`,
    });

    const e = B / 2 - (MR - MO) / sumV;
    const middleThirdLimit = B / 6;
    const withinMiddleThird = Math.abs(e) <= middleThirdLimit;
    const qmax = (sumV / B) * (1 + (6 * e) / B);
    const qmin = (sumV / B) * (1 - (6 * e) / B);
    steps.push({
      title: 'Resultant eccentricity and bearing pressure',
      formula: 'e = B/2 − (MR−MO)/ΣV;  qmax,min = (ΣV/B)(1 ± 6e/B)',
      substitution: `e = ${(B / 2).toFixed(2)} − (${MR.toFixed(1)}−${MO.toFixed(1)})/${sumV.toFixed(1)}`,
      result: `e = ${e.toFixed(3)} m (limit B/6 = ${middleThirdLimit.toFixed(3)} m), qmax = ${qmax.toFixed(1)} kPa, qmin = ${qmin.toFixed(1)} kPa`,
    });

    if (qmin < 0) {
      warnings.push('Bearing pressure qmin is negative — the resultant falls outside the base and tension would develop under the heel. The stated qmax/qmin from the linear-elastic formula is not valid; a reduced effective base width should be used.');
    }

    results.push(
      { symbol: 'FoS_OT', label: 'Factor of safety — overturning', value: FoS_OT, unit: '', precision: 2 },
      { symbol: 'FoS_S', label: 'Factor of safety — sliding', value: FoS_S, unit: '', precision: 2 },
      { symbol: 'e', label: 'Resultant eccentricity', value: e, unit: 'm', precision: 3 },
      { symbol: 'qmax', label: 'Maximum bearing pressure', value: qmax, unit: 'kPa', precision: 1, highlight: true },
      { symbol: 'qmin', label: 'Minimum bearing pressure', value: qmin, unit: 'kPa', precision: 1 },
    );

    const checks = [
      { ok: FoS_OT >= 2.0, label: `FoS overturning ≥ 2.0 (${FoS_OT.toFixed(2)})` },
      { ok: FoS_S >= 1.5, label: `FoS sliding ≥ 1.5 (${FoS_S.toFixed(2)})` },
      { ok: withinMiddleThird, label: `Resultant within middle third (e = ${e.toFixed(3)} m ≤ ${middleThirdLimit.toFixed(3)} m)` },
      { ok: qmax <= qa, label: `qmax ≤ qa (${qmax.toFixed(1)} ≤ ${qa} kPa)` },
    ];
    const failing = checks.filter((c) => !c.ok);
    const verdict = {
      pass: failing.length === 0,
      message: failing.length === 0
        ? 'All four stability checks pass.'
        : `Failing checks: ${failing.map((c) => c.label).join('; ')}.`,
    };

    return { results, steps, warnings, verdict };
  },
  validation: {
    samples: [
      {
        name: 'Self-consistency baseline — not sourced from Retwall.xls (verify independently before relying on this tool)',
        inputs: {
          H: 3.8, tf: 0.5, Lt: 0.8, Lh: 2.3, tt: 0.3, tb: 0.5, beta: 0,
          phi: 32, gamma: 19.2, q: 10, qa: 200, mu: 0.45, Pp: 0, gammac: 24,
        },
        expect: {
          FoS_OT: { value: 5.09, tol: 0.3, unit: '' },
          FoS_S: { value: 2.05, tol: 0.2, unit: '' },
        },
      },
    ],
  },
};

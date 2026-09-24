// schmertmann-settlement.js — Schmertmann strain-influence settlement method
// for shallow foundations on granular soil (Schmertmann et al. 1978).
// Layer depths are measured from founding level (not from ground level).

const GAMMA_W = 9.81; // kN/m3

function izAt(z, profile) {
  const { Iz0, zp, Izp, zInfluence } = profile;
  if (z < 0 || z > zInfluence) return 0;
  if (z <= zp) return Iz0 + ((Izp - Iz0) * z) / zp;
  return Izp * (1 - (z - zp) / (zInfluence - zp));
}

// Exact average of the piecewise-linear Iz profile over [z1, z2], clipped to
// [0, zInfluence], via trapezoidal integration split at the zp breakpoint.
function averageIz(z1, z2, profile) {
  const lo = Math.max(0, z1);
  const hi = Math.min(profile.zInfluence, z2);
  if (hi <= lo) return 0;
  const breakpoints = [lo, hi];
  if (profile.zp > lo && profile.zp < hi) breakpoints.splice(1, 0, profile.zp);
  let area = 0;
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i];
    const b = breakpoints[i + 1];
    area += ((izAt(a, profile) + izAt(b, profile)) / 2) * (b - a);
  }
  return area / (hi - lo);
}

export default {
  id: 'schmertmann-settlement',
  title: 'Schmertmann Settlement — Shallow Foundations on Granular Soil',
  category: 'Geotechnical — Foundations',
  version: '1.0.0',
  references: [
    'Schmertmann, J.H., Hartman, J.P. and Brown, P.R. (1978) — Improved strain influence factor diagrams, ASCE J. Geotech. Eng. Div.',
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7), Section 6.6 — Settlement of spread foundations',
  ],
  description: 'Elastic settlement of a shallow foundation on granular soil using the Schmertmann (1978) strain-influence factor method, with embedment (C1) and creep (C2) corrections.',
  assumptions: [
    'Applies to granular (predominantly drained, non-cohesive) soils; not appropriate for consolidation settlement of clays.',
    'Layer depths are measured from founding level, not from ground level.',
    'A single representative bulk unit weight applies both above and below founding level for the effective-stress profile (reduced for buoyancy below the water table); this is a simplification for preliminary use — refine with per-layer unit weights for detailed design.',
    'Depth of influence and peak-influence depth follow the axisymmetric (square/circular) profile when L/B ≤ 2, and the plane-strain (strip) profile otherwise.',
  ],
  inputs: [
    { name: 'shape', label: 'Footing shape', type: 'select', options: ['Square', 'Rectangular'], default: 'Square' },
    { name: 'B', label: 'Footing width', type: 'number', unit: 'm', default: 2.0, min: 0.1, step: 0.1 },
    { name: 'L', label: 'Footing length', type: 'number', unit: 'm', default: 4.0, min: 0.1, step: 0.1,
      showIf: (v) => v.shape === 'Rectangular' },
    { name: 'D', label: 'Depth of embedment', type: 'number', unit: 'm', default: 1.5, min: 0, step: 0.1 },
    { name: 'q', label: 'Applied gross pressure', type: 'number', unit: 'kPa', default: 200, min: 0, step: 5 },
    { name: 'gamma', label: 'Unit weight (above and below founding level)', type: 'number', unit: 'kN/m³', default: 19, min: 10, max: 24, step: 0.1 },
    { name: 'Dw', label: 'Depth to water table below GL', type: 'number', unit: 'm', default: 10, min: 0, step: 0.1 },
    { name: 't', label: 'Time for creep correction', type: 'number', unit: 'years', default: 50, min: 0.1, step: 1 },
    { name: 'layers', label: 'Soil layers below founding level', type: 'layers',
      help: 'Depths measured from founding level (0 = underside of footing).',
      default: [
        { top: 0, bottom: 1, Es: 8 },
        { top: 1, bottom: 3, Es: 15 },
        { top: 3, bottom: 6, Es: 25 },
      ] },
  ],
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    const B = v.B;
    const L = v.shape === 'Rectangular' ? v.L : B;
    const D = v.D;
    const q = v.q;
    const gamma = v.gamma;
    const Dw = v.Dw;
    const t = v.t;
    const layers = v.layers || [];

    function effStressAtDepthBelowFounding(z) {
      const absDepth = D + z;
      const submergedDepth = Math.max(0, absDepth - Math.max(Dw, 0));
      return gamma * absDepth - GAMMA_W * submergedDepth;
    }

    const sigmaV0 = effStressAtDepthBelowFounding(0);
    const deltaQ = q - sigmaV0;

    steps.push({
      title: 'Effective overburden at founding level',
      formula: "σ′v0 = γ·D − u  (u = γw·(D − Dw) where the water table is above founding level)",
      substitution: `σ′v0 = ${gamma}×${D} − ${GAMMA_W}×${Math.max(0, D - Math.max(Dw, 0)).toFixed(2)}`,
      result: `σ′v0 = ${sigmaV0.toFixed(1)} kPa`,
    });
    steps.push({
      title: 'Net applied pressure',
      formula: 'Δq = q − σ′v0',
      substitution: `Δq = ${q} − ${sigmaV0.toFixed(1)}`,
      result: `Δq = ${deltaQ.toFixed(1)} kPa`,
    });

    if (deltaQ <= 0) {
      warnings.push('Net applied pressure Δq ≤ 0 — there is no net loading to cause settlement by this method.');
      return { results: [{ symbol: 'δ', label: 'Total settlement', value: 0, unit: 'mm', precision: 0, highlight: true }], steps, warnings };
    }

    const aspect = L / B;
    const axisymmetric = aspect <= 2;
    const Iz0 = axisymmetric ? 0.1 : 0.2;
    const zp = axisymmetric ? 0.5 * B : B;
    const zInfluence = axisymmetric ? 2 * B : 4 * B;

    const sigmaVp = effStressAtDepthBelowFounding(zp);
    const Izp = 0.5 + 0.1 * Math.sqrt(deltaQ / sigmaVp);
    const profile = { Iz0, zp, Izp, zInfluence };

    steps.push({
      title: 'Strain influence factor profile',
      formula: 'zp, zInfluence and Iz0 follow the axisymmetric or plane-strain case by L/B;  Izp = 0.5 + 0.1√(Δq/σ′vp)',
      substitution: `L/B = ${aspect.toFixed(2)} → ${axisymmetric ? 'axisymmetric (square/circular)' : 'plane-strain (strip)'} profile; σ′vp = ${sigmaVp.toFixed(1)} kPa`,
      result: `Iz0 = ${Iz0}, zp = ${zp.toFixed(2)} m, Izp = ${Izp.toFixed(3)}, zInfluence = ${zInfluence.toFixed(2)} m`,
    });

    let sumTerm = 0; // Σ (Iz·Δz/Es), Es in kPa
    layers.forEach((layer, i) => {
      const top = layer.top ?? 0;
      const bottom = layer.bottom ?? top;
      const EsMPa = layer.Es;
      const clippedTop = Math.max(0, top);
      const clippedBottom = Math.min(zInfluence, bottom);
      if (clippedBottom <= clippedTop) return;

      if (EsMPa === undefined || EsMPa === null || EsMPa <= 0) {
        warnings.push(`Layer ${i + 1} (${top}–${bottom} m) falls within the zone of influence but has no valid Es — it has been skipped.`);
        return;
      }
      if (EsMPa < 5) {
        warnings.push(`Layer ${i + 1} has Es = ${EsMPa} MPa (< 5 MPa) — very soft; consider a consolidation-settlement method instead.`);
      }

      const dz = clippedBottom - clippedTop;
      const izAvg = averageIz(clippedTop, clippedBottom, profile);
      const EsKPa = EsMPa * 1000;
      const term = (izAvg * dz) / EsKPa;
      sumTerm += term;

      steps.push({
        title: `Layer ${i + 1} contribution (${clippedTop.toFixed(2)}–${clippedBottom.toFixed(2)} m below founding level)`,
        formula: 'δi contribution = Iz,avg · Δz / Es',
        substitution: `= ${izAvg.toFixed(3)} × ${dz.toFixed(2)} / ${EsKPa.toFixed(0)}`,
        result: `${(term * 1000).toFixed(2)} mm per unit Δq·C1·C2`,
      });
    });

    if (layers.length === 0 || zInfluence > Math.max(0, ...layers.map((l) => l.bottom ?? 0))) {
      const deepest = layers.length ? Math.max(...layers.map((l) => l.bottom ?? 0)) : 0;
      if (deepest < zInfluence) {
        warnings.push(`Soil layers only extend to ${deepest.toFixed(2)} m but the zone of influence is ${zInfluence.toFixed(2)} m — add layers to cover the full influence depth or treat this settlement as a lower bound.`);
      }
    }

    const C1raw = 1 - 0.5 * (sigmaV0 / deltaQ);
    const C1 = Math.max(0.5, C1raw);
    const C2 = 1 + 0.2 * Math.log10(t / 0.1);

    steps.push({
      title: 'Embedment and creep correction factors',
      formula: 'C1 = 1 − 0.5(σ′v0/Δq), ≥ 0.5;  C2 = 1 + 0.2·log10(t/0.1)',
      substitution: `C1 = 1 − 0.5×(${sigmaV0.toFixed(1)}/${deltaQ.toFixed(1)}); C2 = 1 + 0.2×log10(${t}/0.1)`,
      result: `C1 = ${C1.toFixed(3)}, C2 = ${C2.toFixed(3)}`,
    });

    const settlementMm = C1 * C2 * deltaQ * sumTerm * 1000;

    steps.push({
      title: 'Total settlement',
      formula: 'δ = C1·C2·Δq·Σ(Iz,avg·Δz/Es)·1000',
      substitution: `δ = ${C1.toFixed(3)}×${C2.toFixed(3)}×${deltaQ.toFixed(1)}×${sumTerm.toExponential(3)}×1000`,
      result: `δ = ${settlementMm.toFixed(1)} mm`,
    });

    results.push(
      { symbol: 'Δq', label: 'Net applied pressure', value: deltaQ, unit: 'kPa', precision: 1 },
      { symbol: 'C1', label: 'Embedment correction', value: C1, unit: '', precision: 3 },
      { symbol: 'C2', label: 'Creep correction', value: C2, unit: '', precision: 3 },
      { symbol: 'δ', label: 'Total settlement', value: settlementMm, unit: 'mm', precision: 1, highlight: true },
    );

    return { results, steps, warnings };
  },
  validation: {
    samples: [
      {
        name: 'Self-consistency baseline — not sourced from Schmertmann.xls (verify independently before relying on this tool)',
        inputs: {
          shape: 'Square', B: 2.0, D: 1.5, q: 200, gamma: 19, Dw: 10, t: 50,
          layers: [
            { top: 0, bottom: 1, Es: 8 },
            { top: 1, bottom: 3, Es: 15 },
            { top: 3, bottom: 6, Es: 25 },
          ],
        },
        expect: { δ: { value: 27.9, tol: 1.5, unit: 'mm' } },
      },
    ],
  },
};

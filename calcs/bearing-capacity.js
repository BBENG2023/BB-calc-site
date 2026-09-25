// bearing-capacity.js — Shallow foundation bearing capacity.
// EC7 Annex D analytical method (drained), with the φ=0 undrained limit
// as a special case. See CONTRIBUTING.md for the module contract.

import { toRad } from '../js/formatters.js';
import { svg, soilHatchDef, line, rect, text, arrowHead, hDimension, vDimension, clamp } from '../js/diagrams.js';

const GAMMA_W = 9.81; // kN/m3

// Schematic section through the footing: ground line, soil (hatched),
// stem/column stub, footing, applied load arrow, bearing pressure arrows,
// and B / D dimension lines. See js/diagrams.js for the drawing helpers.
function diagram(v, output) {
  const B = v.B || 2.5;
  const D = v.D || 0;
  const headline = (output?.results || []).find((r) => r.highlight) || {};
  const qLabel = headline.value !== undefined ? `q = ${headline.value.toFixed(0)} kPa` : '';

  const groundY = 90;
  const cx = 200;
  const footW = clamp(B * 26, 60, 230);
  const footL = cx - footW / 2;
  const footR = cx + footW / 2;
  const depthPx = clamp(D * 40, 10, 130);
  const footTopY = groundY + depthPx;
  const footTh = 18;
  const footBotY = footTopY + footTh;
  const stemW = 26;
  const stemTopY = groundY - 40;

  let inner = '';
  inner += `<rect x="20" y="${groundY}" width="360" height="${300 - groundY}" style="fill:var(--bb-primary-100)" />`;
  inner += `<rect x="20" y="${groundY}" width="360" height="${300 - groundY}" fill="url(#bc-hatch)" />`;
  inner += line(20, groundY, 380, groundY, { color: 'var(--bb-primary)', width: 2 });
  inner += text(26, groundY - 8, 'GROUND LEVEL', { size: 9, weight: 700, color: 'var(--bb-primary-500)', anchor: 'start', ls: '0.06em' });

  // Column stub + footing
  inner += rect(cx - stemW / 2, stemTopY, stemW, footTopY - stemTopY, { fill: 'var(--bb-primary-300)', stroke: 'var(--bb-primary-700)' });
  inner += rect(footL, footTopY, footW, footTh, { fill: 'var(--bb-primary)', stroke: 'var(--bb-primary-800)' });

  // Applied load arrow
  inner += line(cx, stemTopY - 34, cx, stemTopY - 6, { color: 'var(--bb-accent)', width: 3 });
  inner += arrowHead(cx, stemTopY, 'down', { color: 'var(--bb-accent)' });
  inner += text(cx, stemTopY - 40, 'APPLIED LOAD', { size: 9, weight: 800, color: 'var(--bb-accent-700)', ls: '0.05em' });

  // Bearing pressure arrows, pointing up into the footing
  const n = Math.max(3, Math.round(footW / 44));
  for (let i = 0; i < n; i++) {
    const px = footL + (footW * (i + 0.5)) / n;
    const tailY = footBotY + 34;
    const headY = footBotY + 8;
    inner += line(px, tailY, px, headY, { color: 'var(--bb-accent)', width: 2 });
    inner += arrowHead(px, headY, 'up', { color: 'var(--bb-accent)' });
  }
  if (qLabel) inner += text(cx, footBotY + 52, qLabel, { size: 11, weight: 800, color: 'var(--bb-accent-700)' });

  // Dimensions
  inner += vDimension(48, groundY, footBotY, `D = ${D} m`, { extendToX: footL, color: 'var(--bb-ink)' });
  inner += hDimension(footL, footR, footBotY + 78, `B = ${B} m`, { extendFromY: footBotY });

  return svg('0 0 400 300', inner, soilHatchDef('bc-hatch'));
}

function bearingFactors(phiDeg) {
  const phi = toRad(phiDeg);
  if (phiDeg <= 0.001) {
    // Undrained limit (Prandtl/Skempton): Nq -> 1, Nc -> pi + 2, Ngamma -> 0.
    return { Nq: 1, Nc: Math.PI + 2, Ngamma: 0 };
  }
  const tanPhi = Math.tan(phi);
  const Nq = Math.exp(Math.PI * tanPhi) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2);
  const Nc = (Nq - 1) / tanPhi;
  const Ngamma = 2 * (Nq - 1) * tanPhi;
  return { Nq, Nc, Ngamma };
}

// Effective B'/L' for shape factors. Strip -> 0 (L infinite); square/circular -> 1.
function widthToLengthRatio(shape, B, L) {
  if (shape === 'Strip') return 0;
  if (shape === 'Rectangular') return Math.min(B, L) / Math.max(B, L);
  return 1; // Square, Circular
}

function shapeFactors(shape, B, L, phiDeg, Nq, Nc) {
  const ratio = widthToLengthRatio(shape, B, L);
  const phi = toRad(phiDeg);
  const sq = 1 + ratio * Math.sin(phi);
  const sgamma = 1 - 0.3 * ratio;
  const sc = phiDeg <= 0.001 ? 1 + 0.2 * ratio : (sq * Nq - 1) / (Nq - 1);
  return { sq, sc, sgamma };
}

// Hansen-style depth factors, applied only for D/B < 1 (per EC7 Annex D
// commentary — beyond D/B = 1 the additional gain is not relied upon here).
function depthFactors(phiDeg, D, B) {
  const ratio = D / B;
  if (ratio >= 1) return { dq: 1, dc: 1 };
  const phi = toRad(phiDeg);
  const dq = 1 + 2 * Math.tan(phi) * Math.pow(1 - Math.sin(phi), 2) * ratio;
  const dc = 1 + 0.4 * ratio;
  return { dq, dc };
}

function effectiveOverburdenAndGamma(D, B, gamma, gammaSat, Dw) {
  const gammaSub = gammaSat - GAMMA_W;
  if (Dw >= D + B) {
    return { q0: gamma * D, gammaN: gamma, waterCase: 'Water table at/below the zone of influence (Dw ≥ D + B) — no reduction applied.' };
  }
  if (Dw <= D) {
    const q0 = gamma * Dw + gammaSub * (D - Dw);
    return { q0, gammaN: gammaSub, waterCase: 'Water table at/above founding level (Dw ≤ D) — submerged unit weight used below Dw and throughout the Nγ term.' };
  }
  const q0 = gamma * D;
  const gammaN = gammaSub + ((Dw - D) / B) * (gamma - gammaSub);
  return { q0, gammaN, waterCase: 'Water table within the zone of influence below founding level (D < Dw < D + B) — weighted-average unit weight used in the Nγ term.' };
}

export default {
  id: 'bearing-capacity',
  title: 'Shallow Foundation Bearing Capacity',
  category: 'Geotechnical — Foundations',
  tag: 'EC7 Annex D',
  version: '1.0.0',
  references: [
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) — Geotechnical design',
    'UK National Annex to BS EN 1997-1',
    "Frank R. et al., Designers' Guide to EN 1997-1, Thomas Telford",
    'Craig, R.F., Craig\'s Soil Mechanics, 8th ed. — depth factors and water table adjustment',
  ],
  description: 'Ultimate and allowable bearing capacity of shallow strip, square, rectangular and circular footings on c’-φ’ soils, using the EC7 Annex D analytical (drained) method with the φ=0 undrained limit as a special case.',
  assumptions: [
    'Homogeneous soil beneath footing to depth ≥ 1.5B.',
    'Vertical concentric loading only (no eccentricity or load inclination in this version).',
    'Static loading conditions (no seismic, no dynamic/cyclic effects).',
    'Groundwater effect handled via effective/submerged unit weight below the water table.',
    'Depth factors (dq, dc) applied only for D/B < 1; ignored (set to 1.0) beyond that.',
  ],
  inputs: [
    { name: 'shape', label: 'Footing shape', type: 'select',
      options: ['Strip', 'Square', 'Rectangular', 'Circular'], default: 'Square' },
    { name: 'B', label: 'Footing width', type: 'number', unit: 'm', default: 2.5, min: 0.1, step: 0.1 },
    { name: 'L', label: 'Footing length', type: 'number', unit: 'm', default: 2.5, min: 0.1, step: 0.1,
      showIf: (v) => v.shape === 'Rectangular' },
    { name: 'D', label: 'Depth of embedment', type: 'number', unit: 'm', default: 1.0, min: 0, step: 0.1 },
    { name: 'c', label: "Cohesion (effective) c'", type: 'number', unit: 'kPa', default: 0, min: 0, step: 1 },
    { name: 'phi', label: "Friction angle φ'", type: 'number', unit: '°', default: 32, min: 0, max: 50, step: 0.5 },
    { name: 'gamma', label: 'Bulk unit weight γ', type: 'number', unit: 'kN/m³', default: 19, min: 10, max: 24, step: 0.1 },
    { name: 'gammaSat', label: 'Saturated unit weight γsat', type: 'number', unit: 'kN/m³', default: 20, min: 10, max: 24, step: 0.1 },
    { name: 'Dw', label: 'Depth to water table below GL', type: 'number', unit: 'm', default: 10, min: 0, step: 0.1 },
    { name: 'gammaR', label: 'Partial factor γR;v (EC7 DA1-C2)', type: 'number', default: 1.4, min: 1, step: 0.05 },
    { name: 'qEd', label: 'Applied bearing pressure (optional)', type: 'number', unit: 'kPa', default: undefined, min: 0, step: 1,
      help: 'Leave blank to report qRd only, with no pass/fail verdict.' },
  ],
  diagram,
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    const B = v.B;
    const L = v.shape === 'Rectangular' ? v.L : B;
    const D = v.D;
    const c = v.c;
    const phiDeg = v.phi;
    const gamma = v.gamma;
    const gammaSat = v.gammaSat;
    const Dw = v.Dw;
    const gammaR = v.gammaR;

    if (Dw < D) {
      warnings.push(`Water table (Dw = ${Dw} m) is above founding level (D = ${D} m). Effective stress calculations use submerged unit weight below Dw. Verify assumption.`);
    }
    if (phiDeg > 45) {
      warnings.push(`Friction angle φ' = ${phiDeg}° is unusually high — check this is a genuine peak/critical-state value and not entered in error.`);
    }
    if (c <= 0 && phiDeg <= 0) {
      warnings.push("Both c' and φ' are zero — this describes a soil with no shear strength. Check inputs.");
    }
    if (B > 20) {
      warnings.push(`Footing width B = ${B} m is outside the typical scope of this method — treat results with caution.`);
    }

    const { Nq, Nc, Ngamma } = bearingFactors(phiDeg);
    steps.push({
      title: 'Bearing capacity factors',
      formula: "Nq = e^(π tanφ′)·tan²(45° + φ′/2);  Nc = (Nq − 1)·cotφ′ (π+2 for φ′=0);  Nγ = 2(Nq − 1)·tanφ′",
      substitution: `φ′ = ${phiDeg}°`,
      result: `Nq = ${Nq.toFixed(2)}, Nc = ${Nc.toFixed(2)}, Nγ = ${Ngamma.toFixed(2)}`,
    });

    const { sq, sc, sgamma } = shapeFactors(v.shape, B, L, phiDeg, Nq, Nc);
    steps.push({
      title: 'Shape factors',
      formula: "sq = 1 + (B′/L′)sinφ′;  sγ = 1 − 0.3(B′/L′);  sc = (sq·Nq − 1)/(Nq − 1)",
      substitution: `Shape = ${v.shape}, B/L = ${(widthToLengthRatio(v.shape, B, L)).toFixed(2)}`,
      result: `sq = ${sq.toFixed(3)}, sc = ${sc.toFixed(3)}, sγ = ${sgamma.toFixed(3)}`,
    });

    const { dq, dc } = depthFactors(phiDeg, D, B);
    steps.push({
      title: 'Depth factors',
      formula: "dq = 1 + 2tanφ′(1 − sinφ′)²(D/B), applied for D/B < 1;  dc = 1 + 0.4(D/B), applied for D/B < 1",
      substitution: `D/B = ${(D / B).toFixed(2)}`,
      result: `dq = ${dq.toFixed(3)}, dc = ${dc.toFixed(3)}`,
    });

    const { q0, gammaN, waterCase } = effectiveOverburdenAndGamma(D, B, gamma, gammaSat, Dw);
    steps.push({
      title: 'Effective overburden and water table adjustment',
      formula: "q′ = effective vertical stress at founding level; Nγ term uses a water-table-adjusted unit weight",
      substitution: waterCase,
      result: `q′ = ${q0.toFixed(2)} kPa, γ (Nγ term) = ${gammaN.toFixed(2)} kN/m³`,
    });

    const termC = c * Nc * sc * dc;
    const termQ = q0 * Nq * sq * dq;
    const termGamma = 0.5 * gammaN * B * Ngamma * sgamma;
    const qult = termC + termQ + termGamma;

    steps.push({
      title: 'Ultimate bearing resistance',
      formula: "qult = c′·Nc·sc·dc + q′·Nq·sq·dq + 0.5·γ·B·Nγ·sγ",
      substitution: `qult = ${termC.toFixed(1)} + ${termQ.toFixed(1)} + ${termGamma.toFixed(1)}`,
      result: `qult = ${qult.toFixed(1)} kPa`,
    });

    const qRd = qult / gammaR;
    steps.push({
      title: 'Design bearing resistance',
      formula: 'qRd = qult / γR;v',
      substitution: `qRd = ${qult.toFixed(1)} / ${gammaR}`,
      result: `qRd = ${qRd.toFixed(1)} kPa`,
    });

    results.push(
      { symbol: 'qult', label: 'Ultimate bearing resistance', value: qult, unit: 'kPa', precision: 1 },
      { symbol: 'qRd', label: 'Design bearing resistance', value: qRd, unit: 'kPa', precision: 1, highlight: true },
    );

    let verdict;
    if (v.qEd !== undefined && v.qEd !== null) {
      const utilisation = v.qEd / qRd;
      results.push({ symbol: 'qEd/qRd', label: 'Utilisation ratio', value: utilisation, unit: '', precision: 2 });
      verdict = {
        pass: v.qEd <= qRd,
        message: v.qEd <= qRd
          ? `Applied pressure ${v.qEd} kPa ≤ qRd (utilisation ${utilisation.toFixed(2)}).`
          : `Applied pressure ${v.qEd} kPa exceeds qRd (utilisation ${utilisation.toFixed(2)}).`,
      };
    }

    return { results, steps, warnings, verdict };
  },
  validation: {
    samples: [
      {
        name: 'Self-consistency baseline — square footing, no water influence (not sourced from an external worked example; verify independently before relying on this tool)',
        inputs: { shape: 'Square', B: 2.0, D: 1.5, c: 0, phi: 35, gamma: 20, gammaSat: 20, Dw: 5, gammaR: 1.4 },
        expect: { qRd: { value: 1790, tol: 90, unit: 'kPa' } },
      },
    ],
  },
};

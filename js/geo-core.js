// geo-core.js — shared pure geotechnical functions (no DOM). Earth pressure
// coefficients, EC7 Annex D bearing resistance, SPT parsing, corrections and
// correlations, characteristic values. Written for the Legato abutment calc
// and exported for reuse by any other calc.

import { bearingCapacityFactors, UNIT_WEIGHT_DEFAULTS } from './shared-data.js';

export const GAMMA_W = 9.81;
const R = Math.PI / 180;
export const rad = (d) => d * R;
export const deg = (r) => r / R;

// --- Earth pressure coefficients ---------------------------------------------

export function KaRankine(phiDeg) {
  const s = Math.sin(rad(phiDeg));
  return (1 - s) / (1 + s);
}

export function KpRankine(phiDeg) {
  const s = Math.sin(rad(phiDeg));
  return (1 + s) / (1 - s);
}

export function K0Jaky(phiDeg) {
  return 1 - Math.sin(rad(phiDeg));
}

// Coulomb active coefficient on a vertical back, wall friction δ, backfill
// slope β (all degrees). Horizontal component = Ka·cos δ.
export function KaCoulomb(phiDeg, deltaDeg = 0, betaDeg = 0) {
  const p = rad(phiDeg), d = rad(deltaDeg), b = rad(betaDeg);
  const num = Math.cos(p) ** 2;
  const root = Math.sqrt(Math.max(0, (Math.sin(p + d) * Math.sin(p - b)) / (Math.cos(d) * Math.cos(b))));
  return num / (Math.cos(d) * (1 + root) ** 2);
}

// Design angle of shearing resistance: tan φ′d = tan φ′k / γφ′.
export function designPhi(phiKDeg, gammaPhi = 1) {
  return deg(Math.atan(Math.tan(rad(phiKDeg)) / gammaPhi));
}

// --- EC7 Annex D bearing resistance ------------------------------------------

// Effective foundation dimensions (D.1). Returns B′ ≤ L′.
export function effectiveArea(B, L, eB, eL) {
  let Bp = B - 2 * Math.abs(eB);
  let Lp = L - 2 * Math.abs(eL);
  let swapped = false;
  if (Lp < Bp) { [Bp, Lp] = [Lp, Bp]; swapped = true; }
  return { Bp: Math.max(Bp, 0), Lp: Math.max(Lp, 0), A: Math.max(Bp, 0) * Math.max(Lp, 0), swapped };
}

// Inclination exponent m (D.4): m = mB·cos²θ + mL·sin²θ, θ = angle of H to L′.
export function inclinationExponent(Bp, Lp, thetaDeg = 90) {
  const r = Bp / Lp;
  const mB = (2 + r) / (1 + r);
  const mL = (2 + 1 / r) / (1 + 1 / r);
  const t = rad(thetaDeg);
  return { mB, mL, m: mL * Math.cos(t) ** 2 + mB * Math.sin(t) ** 2 };
}

// Drained bearing resistance R/A′ (D.4). Inputs are design values.
// thetaDeg: angle of H to the long (L′) direction (90° = H parallel to B′).
// alphaDeg: base inclination; groundFactor: Vesic g (1 − tan β)² if near a slope.
export function drainedBearing({ phi, c = 0, gammaEff, q, Bp, Lp, V, H = 0, thetaDeg = 90, alphaDeg = 0, groundFactor = 1 }) {
  const { Nq, Nc, Ngamma } = bearingCapacityFactors(phi);
  const t = Math.tan(rad(phi));
  const r = Bp / Lp;
  const sq = 1 + r * Math.sin(rad(phi));
  const sg = 1 - 0.3 * r;
  const sc = phi > 0.001 ? (sq * Nq - 1) / (Nq - 1) : 1 + 0.2 * r;
  const { m, mB, mL } = inclinationExponent(Bp, Lp, thetaDeg);
  const A = Bp * Lp;
  const denom = V + (phi > 0.001 ? A * c / t : 0);
  const ratio = denom > 0 ? Math.max(0, 1 - H / denom) : 0;
  const iq = ratio ** m;
  const ig = ratio ** (m + 1);
  const ic = phi > 0.001 && Nc * t > 0 ? iq - (1 - iq) / (Nc * t) : iq;
  const a = rad(alphaDeg);
  const bq = (1 - a * t) ** 2;
  const bg = bq;
  const bc = phi > 0.001 ? bq - (1 - bq) / (Nc * t) : 1;
  const gq = groundFactor, gg = groundFactor;
  const termC = c * Nc * bc * sc * ic;
  const termQ = q * Nq * bq * sq * iq * gq;
  const termG = 0.5 * gammaEff * Bp * Ngamma * bg * sg * ig * gg;
  return { Nq, Nc, Ngamma, sq, sg, sc, m, mB, mL, iq, ig, ic, bq, bg, bc, gq, gg, termC, termQ, termG, RA: termC + termQ + termG, A };
}

// Undrained bearing resistance R/A′ (D.3).
export function undrainedBearing({ cu, q, Bp, Lp, H = 0, alphaDeg = 0 }) {
  const A = Bp * Lp;
  const sc = 1 + 0.2 * (Bp / Lp);
  const hr = A * cu > 0 ? Math.min(1, H / (A * cu)) : 1;
  const ic = 0.5 * (1 + Math.sqrt(1 - hr));
  const bc = 1 - (2 * rad(alphaDeg)) / (Math.PI + 2);
  const RA = (Math.PI + 2) * cu * bc * sc * ic + q;
  return { sc, ic, bc, RA, A, hOverR: hr };
}

// --- SPT ----------------------------------------------------------------------

// Parses SPT result strings: "N=15", "15", "50/113", "50 for 113mm",
// "50 (24 for 37mm/50 for 113mm)" — seating blows optional. Returns the
// test-drive blows and penetration; refusal if penetration < 300 mm.
export function parseSPT(raw) {
  const out = { raw, N: null, blows: null, pen: 300, seating: null, refusal: false, error: null };
  if (raw === null || raw === undefined) { out.error = 'Empty SPT result'; return out; }
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) { out.error = 'Empty SPT result'; return out; }
  const pairRe = /(\d+(?:\.\d+)?)\s*(?:\/|for)\s*(\d+(?:\.\d+)?)\s*(?:mm)?/g;

  const paren = s.match(/\(([^)]*)\)/);
  if (paren) {
    const pairs = [...paren[1].matchAll(pairRe)].map((m) => ({ blows: Number(m[1]), pen: Number(m[2]) }));
    const lead = s.slice(0, paren.index).match(/(\d+(?:\.\d+)?)/);
    if (pairs.length) {
      const drive = pairs[pairs.length - 1];
      if (pairs.length > 1) out.seating = pairs[0];
      out.blows = drive.blows;
      out.pen = drive.pen;
    } else if (lead) {
      out.blows = Number(lead[1]);
    }
    if (out.blows === null && lead) out.blows = Number(lead[1]);
  } else {
    const pair = [...s.matchAll(pairRe)];
    if (pair.length) {
      out.blows = Number(pair[pair.length - 1][1]);
      out.pen = Number(pair[pair.length - 1][2]);
    } else {
      const m = s.match(/^(?:n\s*=\s*)?(\d+(?:\.\d+)?)$/);
      if (m) out.blows = Number(m[1]);
    }
  }
  if (out.blows === null || !Number.isFinite(out.blows)) { out.error = `Could not parse SPT result "${raw}"`; return out; }
  if (!(out.pen > 0)) { out.error = `Invalid penetration in "${raw}"`; return out; }
  out.refusal = out.pen < 300;
  out.N = out.refusal ? (out.blows * 300) / out.pen : out.blows;
  return out;
}

export const nExtrapolated = (blows, pen_mm) => (blows * 300) / pen_mm;
export const n60 = (N, Er = 60) => (N * Er) / 60;
export const overburdenCN = (sigmaV) => Math.min(Math.sqrt(100 / Math.max(sigmaV, 1e-6)), 2.0);

// φ′ correlations on (N1)60.
export const phiPHT = (N160) => 27.1 + 0.3 * N160 - 0.00054 * N160 ** 2; // Peck, Hanson & Thornburn (1974) via Wolff (1989)
export const phiHatanaka = (N160) => Math.sqrt(20 * N160) + 20; // Hatanaka & Uchida (1996)

// Stroud (1974) f1 by plasticity index — indicative reading of Stroud's curve.
export function stroudF1(PI) {
  if (PI === null || PI === undefined || PI === '' || !Number.isFinite(Number(PI))) return 4.5;
  const p = Number(PI);
  if (p < 20) return 6.0;
  if (p < 30) return 5.0;
  if (p < 40) return 4.5;
  return 4.2;
}
export const cuStroud = (N60, PI) => stroudF1(PI) * N60;
export const mvStroud = (N60, f2 = 0.45) => 1 / (f2 * Math.max(N60, 1e-6)); // m²/MN
export const EStroud = (N60, overconsolidated = false) => (overconsolidated ? 2.0 : 1.0) * N60; // MPa

// BS 8002:1994 eqn: φ′crit = 42 − 12.5·log10(PI), 5 < PI < 100.
export function phiCritFromPI(PI) {
  if (!Number.isFinite(Number(PI)) || PI === null || PI === '') return 25;
  const p = Math.min(100, Math.max(5, Number(PI)));
  return 42 - 12.5 * Math.log10(p);
}

export function granularBand(N60) {
  if (N60 < 10) return 'loose';
  if (N60 < 30) return 'medium';
  if (N60 < 50) return 'dense';
  return 'veryDense';
}

export function cohesiveBand(cu) {
  if (cu < 40) return 'soft';
  if (cu < 75) return 'firm';
  if (cu < 150) return 'stiff';
  return 'veryStiff';
}

// Default [bulk, saturated] unit weight by class and strength indicator.
export function defaultUnitWeight(cls, { N60, cu } = {}) {
  const T = UNIT_WEIGHT_DEFAULTS;
  if (cls === 'Granular' || cls === 'Weathered rock') {
    const band = granularBand(Number.isFinite(N60) ? N60 : 20);
    return T.granular[band];
  }
  if (cls === 'Cohesive') {
    const g = T.cohesive[cohesiveBand(Number.isFinite(cu) ? cu : 60)];
    return [g, g];
  }
  if (cls === 'Peat') return [T.peat, T.peat];
  if (cls === 'Made ground' || cls === 'Topsoil') return [T.madeGround, T.madeGround + 1];
  if (cls === 'Rock') return [22, 22];
  return [18, 19];
}

// --- Characteristic values (BS EN 1997-1 2.4.5.2) ------------------------------

export function characteristicValue(values, method = 'auto', manual = null) {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  const mean = n ? v.reduce((a, b) => a + b, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const min = n ? Math.min(...v) : NaN;
  let m = method;
  if (m === 'auto') m = n >= 5 ? 'cautious' : 'minimum';
  let adopted;
  if (m === 'manual' && Number.isFinite(manual)) adopted = manual;
  else if (m === 'cautious') adopted = mean - 0.5 * sd;
  else if (m === 'lowerQuartile') {
    const s = [...v].sort((a, b) => a - b);
    const pos = (n - 1) * 0.25;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    adopted = n ? s[lo] + (s[hi] - s[lo]) * (pos - lo) : NaN;
  } else { m = m === 'manual' ? 'minimum' : m; adopted = min; }
  return { n, mean, sd, min, adopted, method: m };
}

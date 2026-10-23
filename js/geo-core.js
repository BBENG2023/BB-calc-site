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

// --- Burland & Burbidge (1985) settlement on sand -------------------------------

// q = gross bearing pressure (kPa), sigmaV0 = maximum previous effective
// overburden at founding level (kPa). Returns settlements in mm.
export function burlandBurbidge({ B, L, Nbar, q, sigmaV0 = 0, tYears = 3, Hs = null, R3 = 0.3, Rt = 0.2 }) {
  const Ic = 1.71 / Math.pow(Math.max(Nbar, 1e-6), 1.4);
  const zI = Math.pow(B, 0.763);
  const r = L / B;
  const fs = Math.pow((1.25 * r) / (r + 0.25), 2);
  const fl = Hs !== null && Hs < zI ? (Hs / zI) * (2 - Hs / zI) : 1;
  const ft = tYears > 3 ? 1 + R3 + Rt * Math.log10(tYears / 3) : 1;
  const qTerm = q > sigmaV0 ? q - (2 / 3) * sigmaV0 : q / 3;
  const si = fs * fl * qTerm * Math.pow(B, 0.7) * Ic;
  return { Ic, zI, fs, fl, ft, qTerm, si, st: si * ft };
}

// SPT corrections for B&B: fine/silty sand below water, gravel.
export function bbCorrectN(N, granType, belowWater) {
  let n = N;
  if (granType === 'Fine/silty sand' && belowWater && n > 15) n = 15 + 0.5 * (n - 15);
  if (granType === 'Gravel') n *= 1.25;
  return n;
}

// --- Stress distribution ----------------------------------------------------------

// Boussinesq influence factor under the corner of a uniformly loaded
// rectangle B × L at depth z (Fadum / Newmark). Δσz = q·I.
export function boussinesqCornerI(B, L, z) {
  if (z <= 0) return 0.25;
  const m = B / z, n = L / z;
  const m2 = m * m, n2 = n * n, s = m2 + n2 + 1;
  const root = Math.sqrt(s);
  const a = ((2 * m * n * root) / (s + m2 * n2)) * ((s + 1) / s);
  let b = Math.atan((2 * m * n * root) / (s - m2 * n2));
  if (s - m2 * n2 < 0) b += Math.PI;
  return (a + b) / (4 * Math.PI);
}

// Δσz under any point (x, y) for a rectangle centred on the origin, by
// corner superposition. x along B, y along L.
export function boussinesqRect(q, B, L, z, x = 0, y = 0) {
  const xs = [B / 2 - x, B / 2 + x];
  const ys = [L / 2 - y, L / 2 + y];
  let I = 0;
  for (const a of xs) for (const b of ys) I += Math.sign(a) * Math.sign(b) * boussinesqCornerI(Math.abs(a), Math.abs(b), z);
  return q * I;
}

// 2:1 (2V:1H) spread — mean Δσz under a B × L load at depth z.
export const spread21 = (q, B, L, z) => (q * B * L) / ((B + z) * (L + z));

// --- Terzaghi 1D consolidation ------------------------------------------------------

// Fourier solution for any initial excess pore pressure profile u0(Z),
// Z = z/H from the top of the layer. drainage: 'double' | 'top' (base
// impermeable). Tv is based on the drainage path: H/2 (double) or H (top).
export function terzaghiSolver(u0, drainage = 'double', terms = 200) {
  const single = drainage !== 'double';
  const nInt = 800;
  const lam = []; // eigenvalue × H (argument multiplier on Z)
  const coef = [];
  const simpson = (f) => {
    let s = f(0) + f(1);
    for (let i = 1; i < nInt; i++) s += (i % 2 ? 4 : 2) * f(i / nInt);
    return s / (3 * nInt);
  };
  for (let k = 0; k < terms; k++) {
    const a = single ? ((2 * k + 1) * Math.PI) / 2 : (k + 1) * Math.PI;
    const c = 2 * simpson((Z) => u0(Z) * Math.sin(a * Z));
    lam.push(a);
    coef.push(c);
  }
  const u0avg = simpson(u0);
  // exponent factor so that e^(−f·Tv) uses Tv on the drainage path
  const expf = lam.map((a) => (single ? a * a : (a * a) / 4));
  const u = (Z, Tv) => {
    let s = 0;
    for (let k = 0; k < terms; k++) {
      const e = expf[k] * Tv;
      if (e > 60) break;
      s += coef[k] * Math.sin(lam[k] * Z) * Math.exp(-e);
    }
    return s;
  };
  const U = (Tv) => {
    if (Tv <= 0) return 0;
    let s = 0; // ∫ u dZ term by term: ∫ sin(aZ) = (1 − cos a)/a
    for (let k = 0; k < terms; k++) {
      const e = expf[k] * Tv;
      if (e > 60) break;
      s += coef[k] * ((1 - Math.cos(lam[k])) / lam[k]) * Math.exp(-e);
    }
    return 1 - s / u0avg;
  };
  const TvFor = (target) => {
    let lo = 1e-8, hi = 20;
    for (let i = 0; i < 100; i++) {
      const mid = Math.sqrt(lo * hi);
      if (U(mid) < target) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
  };
  return { u, U, TvFor, u0avg };
}

// --- Pocket (hand) penetrometer ----------------------------------------------------

// Pocket penetrometer reading → undrained shear strength cu (kPa).
// unit: 'kPa-qu' (default, qu in kPa), 'kPa-cu' or 'kgcm2' (qu in kg/cm²).
// cu = qu/2 × factor. Readings at the top of the scale (e.g. "4.5+" or
// ">4.5") are lower bounds. Index test only (BS 5930:2015+A1:2020) — check
// against hand vane or triaxial results before relying on it.
export const PP_MAX_KGCM2 = 4.5;
export function parsePP(raw, unit = 'kPa-qu', factor = 1) {
  const s = String(raw ?? '').trim();
  if (!s) return { empty: true };
  const lowerBound = /^>|\+$/.test(s);
  const v = Number(s.replace(/^>\s*/, '').replace(/\+$/, '').replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return { error: `Not a readable pocket penetrometer value ("${s}")` };
  const qu = unit === 'kPa-qu' ? v : unit === 'kPa-cu' ? 2 * v : v * 98.0665;
  const atMax = qu >= PP_MAX_KGCM2 * 98.0665 - 0.5; // top of the instrument scale (≈ 441 kPa qu)
  const f = Number.isFinite(Number(factor)) && Number(factor) > 0 ? Number(factor) : 1;
  return { value: v, qu, cu: (qu / 2) * f, lowerBound: lowerBound || atMax, factor: f };
}

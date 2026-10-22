// consolidation-1d.js — Terzaghi one-dimensional consolidation: degree of
// consolidation, pore pressure isochrones, settlement against time and time
// to a target degree of consolidation. Fourier series solution for uniform
// or triangular initial excess pore pressure (js/geo-core.js terzaghiSolver).

import { svg, line, text } from '../js/diagrams.js';
import { terzaghiSolver, GAMMA_W } from '../js/geo-core.js';

const SEC_PER_YEAR = 365.25 * 24 * 3600;
const PROFILES = ['Uniform', 'Increasing with depth (triangular)', 'Decreasing with depth (triangular)'];
const DRAINAGE = ['Double (top and base)', 'Top only (base impermeable)'];

function profileFn(name) {
  if (name === PROFILES[1]) return (Z) => Z; // zero at top, full at base
  if (name === PROFILES[2]) return (Z) => 1 - Z;
  return () => 1;
}

function cvPerYear(v) {
  if (v.cvSource === 'From k and mv') {
    const mv = (v.mv || 0) / 1000; // m²/MN → m²/kN
    return mv > 0 ? ((v.k || 0) / (mv * GAMMA_W)) * SEC_PER_YEAR : NaN;
  }
  return v.cv;
}

function setup(v) {
  const double = v.drainage !== DRAINAGE[1];
  const H = v.H;
  const Hdr = double ? H / 2 : H;
  const cv = cvPerYear(v);
  const shape = profileFn(v.profile);
  const solver = terzaghiSolver(shape, double ? 'double' : 'top');
  return { double, H, Hdr, cv, shape, solver };
}

const yearsFor = (Tv, Hdr, cv) => (Tv * Hdr * Hdr) / cv;

function fmtTime(years) {
  if (!Number.isFinite(years)) return '—';
  if (years < 1 / 12) return `${(years * 365.25).toFixed(1)} days`;
  if (years < 2) return `${(years * 12).toFixed(1)} months`;
  return `${years.toFixed(2)} years`;
}

// Two panels: isochrones (u/Δσ against depth) and U against log time.
function diagram(v) {
  const { H, Hdr, cv, shape, solver } = setup(v);
  if (!(H > 0) || !(cv > 0)) return svg('0 0 400 290', text(200, 145, 'Enter H and cv', { size: 12 }));
  const TvNow = (cv * v.t) / (Hdr * Hdr);
  let inner = '';

  // Panel 1 — isochrones
  const x0 = 38, x1 = 180, y0 = 44, y1 = 250;
  inner += text((x0 + x1) / 2, 20, 'ISOCHRONES u/Δσ', { size: 9.5, weight: 800, color: 'var(--bb-primary)' });
  inner += line(x0, y0, x1, y0, { color: 'var(--bb-ink)' });
  inner += line(x0, y0, x0, y1, { color: 'var(--bb-ink)' });
  inner += line(x0, y1, x1, y1, { color: 'var(--bb-ink)', width: 0.5 });
  for (const f of [0, 0.5, 1]) inner += text(x0 + f * (x1 - x0), y0 - 5, f.toFixed(1), { size: 8 });
  inner += text(x0 - 6, y0 + 4, '0', { size: 8, anchor: 'end' });
  inner += text(x0 - 6, y1 + 4, `${H} m`, { size: 8, anchor: 'end' });
  const tvs = [0.05, 0.1, 0.2, 0.5, 1.0];
  const curve = (Tv, colour, w = 1, label) => {
    let d = '';
    for (let i = 0; i <= 40; i++) {
      const Z = i / 40;
      const u = Tv <= 0 ? shape(Z) : solver.u(Z, Tv);
      const px = x0 + Math.max(0, Math.min(1, u)) * (x1 - x0);
      const py = y0 + Z * (y1 - y0);
      d += `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    }
    let s = `<path d="${d}" fill="none" style="stroke:${colour}" stroke-width="${w}" />`;
    if (label) s += label;
    return s;
  };
  inner += curve(0, 'var(--bb-primary-300)', 1);
  tvs.forEach((Tv) => { inner += curve(Tv, 'var(--bb-primary-500)', 0.8); });
  inner += curve(TvNow, 'var(--bb-accent)', 2.2);
  inner += text((x0 + x1) / 2, y1 + 14, 'Tv 0.05, 0.1, 0.2, 0.5, 1.0', { size: 8 });
  inner += text((x0 + x1) / 2, y1 + 26, `bold = time t (Tv ${TvNow.toFixed(3)})`, { size: 8, color: 'var(--bb-accent-700)' });

  // Panel 2 — U against log time
  const a0 = 240, a1 = 385;
  inner += text((a0 + a1) / 2, 20, 'CONSOLIDATION U', { size: 9.5, weight: 800, color: 'var(--bb-primary)' });
  inner += line(a0, y0, a1, y0, { color: 'var(--bb-ink)' });
  inner += line(a0, y0, a0, y1, { color: 'var(--bb-ink)' });
  const logMin = -3, logMax = 1; // Tv 0.001 … 10
  let d = '';
  for (let i = 0; i <= 80; i++) {
    const lt = logMin + ((logMax - logMin) * i) / 80;
    const U = solver.U(10 ** lt);
    d += `${i ? 'L' : 'M'}${(a0 + ((lt - logMin) / (logMax - logMin)) * (a1 - a0)).toFixed(1)},${(y0 + U * (y1 - y0)).toFixed(1)}`;
  }
  inner += `<path d="${d}" fill="none" style="stroke:var(--bb-primary)" stroke-width="1.6" />`;
  for (let lt = logMin; lt <= logMax; lt++) {
    const px = a0 + ((lt - logMin) / (logMax - logMin)) * (a1 - a0);
    inner += line(px, y0, px, y0 + 4, { color: 'var(--bb-ink)' });
    if ((lt - logMin) % 2 === 0) inner += text(px, y0 - 5, fmtTime(yearsFor(10 ** lt, Hdr, cv)), { size: 7.5, anchor: lt === logMax ? 'end' : lt === logMin ? 'start' : 'middle' });
  }
  for (const U of [0, 0.5, 1]) inner += text(a0 - 5, y0 + U * (y1 - y0) + 3, `${U * 100}%`, { size: 8, anchor: 'end' });
  if (TvNow > 10 ** logMin && TvNow < 10 ** logMax) {
    const px = a0 + ((Math.log10(TvNow) - logMin) / (logMax - logMin)) * (a1 - a0);
    const py = y0 + solver.U(TvNow) * (y1 - y0);
    inner += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" style="fill:var(--bb-accent)" />`;
  }
  inner += text((a0 + a1) / 2, y1 + 14, 'time (log scale)', { size: 8 });
  return svg('0 0 400 290', inner);
}

export default {
  id: 'consolidation-1d',
  title: '1D Consolidation — Rate and Settlement',
  category: 'Geotechnical — Settlement',
  tag: 'Terzaghi 1D',
  version: '1.0.0',
  references: [
    'Terzaghi, K. (1943) Theoretical Soil Mechanics, Wiley — one-dimensional consolidation theory',
    "Craig, R.F., Craig's Soil Mechanics, 8th ed., Ch. 7 — Fourier series solution, Tv–U relationship",
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) cl. 6.6.2 — settlement of spread foundations',
    'BS EN 1997-2:2007 Annex K — oedometer parameters mv and cv',
  ],
  description: 'Rate of primary consolidation of one clay layer: Tv, degree of consolidation, excess pore pressure isochrones, settlement against time and time to a target U. Double or single drainage; uniform or triangular initial excess pore pressure.',
  assumptions: [
    'Terzaghi 1D theory: saturated soil, small strain, constant cv and mv, load applied at once, flow vertical only.',
    'Single homogeneous layer. For layered ground, use an equivalent cv or treat layers separately.',
    'Final settlement ρ∞ = mv·Δσ′·H (oedometer method) unless overridden. Secondary compression (creep) not included.',
    'Triangular profiles are zero at one boundary and Δσ at the other. Mean Δσ′ = Δσ/2 for settlement.',
    'Field cv is often 2–10× laboratory cv where fabric (silt partings, sand lenses) controls drainage. Choose cv with care.',
  ],
  inputs: [
    { name: 'H', label: 'Clay layer thickness H', type: 'number', unit: 'm', default: 6, min: 0.1, step: 0.1 },
    { name: 'drainage', label: 'Drainage', type: 'select', options: DRAINAGE, default: DRAINAGE[0] },
    { name: 'profile', label: 'Initial excess pore pressure profile', type: 'select', options: PROFILES, default: PROFILES[0] },
    { name: 'dSigma', label: 'Applied stress increase Δσ', type: 'number', unit: 'kPa', default: 80, min: 0, step: 1 },
    { name: 'cvSource', label: 'cv from', type: 'select', options: ['Enter cv', 'From k and mv'], default: 'Enter cv' },
    { name: 'cv', label: 'Coefficient of consolidation cv', type: 'number', unit: 'm²/yr', default: 2.0, min: 0, step: 0.1,
      showIf: (v) => v.cvSource !== 'From k and mv' },
    { name: 'k', label: 'Permeability k', type: 'number', unit: 'm/s', default: 1e-9, min: 0, step: 1e-10,
      showIf: (v) => v.cvSource === 'From k and mv' },
    { name: 'mv', label: 'Coefficient of volume compressibility mv', type: 'number', unit: 'm²/MN', default: 0.2, min: 0, step: 0.01 },
    { name: 't', label: 'Time since loading t', type: 'number', unit: 'years', default: 1, min: 0, step: 0.1 },
    { name: 'targetU', label: 'Target degree of consolidation', type: 'number', unit: '%', default: 90, min: 1, max: 99.9, step: 1 },
    { name: 'rhoInf', label: 'Final settlement ρ∞ (optional override)', type: 'number', unit: 'mm', default: undefined, min: 0, step: 1,
      help: 'Leave blank to use mv·Δσ′·H.' },
  ],
  diagram,
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];
    const { double, H, Hdr, cv, shape, solver } = setup(v);
    if (!(H > 0)) return { results, steps, warnings: ['Enter a layer thickness H > 0.'] };
    if (!(cv > 0)) return { results, steps, warnings: ['cv must be greater than zero. Check cv, or k and mv.'] };

    if (v.cvSource === 'From k and mv') {
      steps.push({
        title: 'Coefficient of consolidation',
        formula: 'cv = k / (mv·γw)',
        substitution: `cv = ${v.k} / (${(v.mv / 1000).toExponential(3)} × ${GAMMA_W}) m²/s`,
        result: `cv = ${(cv / SEC_PER_YEAR).toExponential(3)} m²/s = ${cv.toFixed(3)} m²/yr`,
      });
    }
    if (cv < 0.1 || cv > 100) warnings.push(`cv = ${cv.toFixed(3)} m²/yr is outside the usual range for UK clays (about 0.1–100 m²/yr). Check units.`);

    const Tv = (cv * v.t) / (Hdr * Hdr);
    steps.push({
      title: 'Drainage path and time factor',
      formula: 'Hdr = H/2 (double drainage) or H (single drainage);  Tv = cv·t / Hdr²',
      substitution: `Hdr = ${Hdr.toFixed(3)} m;  Tv = ${cv.toFixed(3)} × ${v.t} / ${Hdr.toFixed(3)}²`,
      result: `Tv = ${Tv.toFixed(4)}`,
    });

    const U = solver.U(Tv);
    steps.push({
      title: 'Average degree of consolidation',
      formula: 'u(z,t) = Σ Am·sin(Mz/Hdr)·e^(−M²Tv);  U = 1 − ∫u dz / ∫u0 dz  (Fourier series, 200 terms)',
      substitution: `${v.profile}, ${double ? 'double' : 'single'} drainage, Tv = ${Tv.toFixed(4)}`,
      result: `U = ${(U * 100).toFixed(1)}%`,
    });

    const meanFactor = solver.u0avg; // 1 for uniform, 0.5 for triangular
    const rhoOed = (v.mv || 0) * v.dSigma * meanFactor * H; // m²/MN × kPa × m = mm
    const rhoInf = Number.isFinite(v.rhoInf) ? v.rhoInf : rhoOed;
    steps.push({
      title: 'Final consolidation settlement',
      formula: Number.isFinite(v.rhoInf) ? 'ρ∞ = user value' : 'ρ∞ = mv·Δσ′mean·H',
      substitution: Number.isFinite(v.rhoInf) ? `ρ∞ = ${v.rhoInf} mm` : `ρ∞ = ${v.mv} × ${(v.dSigma * meanFactor).toFixed(1)} × ${H}`,
      result: `ρ∞ = ${rhoInf.toFixed(1)} mm`,
    });
    const rhoT = U * rhoInf;
    steps.push({
      title: 'Settlement at time t',
      formula: 'ρ(t) = U·ρ∞',
      substitution: `ρ(t) = ${U.toFixed(4)} × ${rhoInf.toFixed(1)}`,
      result: `ρ(${v.t} yr) = ${rhoT.toFixed(1)} mm; remaining ${(rhoInf - rhoT).toFixed(1)} mm`,
    });

    const tv50 = solver.TvFor(0.5), tv90 = solver.TvFor(0.9);
    const target = Math.min(Math.max(v.targetU, 1), 99.9) / 100;
    const tvT = solver.TvFor(target);
    const t50 = yearsFor(tv50, Hdr, cv), t90 = yearsFor(tv90, Hdr, cv), tT = yearsFor(tvT, Hdr, cv);
    steps.push({
      title: 'Time to reach a given degree of consolidation',
      formula: 't = Tv(U)·Hdr² / cv',
      substitution: `Tv(50%) = ${tv50.toFixed(3)}, Tv(90%) = ${tv90.toFixed(3)}, Tv(${(target * 100).toFixed(0)}%) = ${tvT.toFixed(3)}`,
      result: `t50 = ${fmtTime(t50)}; t90 = ${fmtTime(t90)}; t${(target * 100).toFixed(0)} = ${fmtTime(tT)}`,
    });

    const rows = [];
    for (let i = 0; i <= 10; i++) {
      const Z = i / 10;
      const u0 = shape(Z) * v.dSigma;
      const u = Tv > 0 ? solver.u(Z, Tv) * v.dSigma : u0;
      rows.push(`z ${(Z * H).toFixed(2)} m: u ${Math.max(u, 0).toFixed(1)} kPa (Uz ${u0 > 0 ? ((1 - u / u0) * 100).toFixed(0) : '—'}%)`);
    }
    steps.push({
      title: 'Excess pore pressure isochrone at time t (z from top of layer)',
      formula: 'u(z,t) from the series above; Uz = 1 − u/u0',
      result: rows.join(';  '),
    });

    results.push(
      { symbol: 'cv', label: 'Coefficient of consolidation', value: cv, unit: 'm²/yr', precision: 3 },
      { symbol: 'Tv', label: 'Time factor at t', value: Tv, unit: '', precision: 4 },
      { symbol: 'U', label: 'Degree of consolidation at t', value: U * 100, unit: '%', precision: 1, highlight: true },
      { symbol: 'ρ(t)', label: 'Settlement at t', value: rhoT, unit: 'mm', precision: 1, highlight: true },
      { symbol: 'ρ∞', label: 'Final consolidation settlement', value: rhoInf, unit: 'mm', precision: 1 },
      { symbol: 't50', label: 'Time to 50% consolidation', value: t50, unit: 'years', precision: 2 },
      { symbol: 't90', label: 'Time to 90% consolidation', value: t90, unit: 'years', precision: 2 },
      { symbol: 'tU', label: `Time to ${(target * 100).toFixed(0)}% consolidation`, value: tT, unit: 'years', precision: 2, highlight: true },
    );
    return { results, steps, warnings, values: { Tv, U, tv50, tv90 } };
  },
  validation: {
    samples: [
      {
        name: 'S1 — SoilVision Analytc worked example (textbook values): H 9.5 m double drained, cv 8.0×10⁻⁸ m²/s, t 157,784,629 s, u0 100 kPa',
        inputs: { H: 9.5, drainage: DRAINAGE[0], profile: PROFILES[0], dSigma: 100, cvSource: 'Enter cv', cv: 8.0e-8 * SEC_PER_YEAR, mv: 0.2, t: 157784629 / SEC_PER_YEAR, targetU: 90 },
        run: (i) => {
          const s = terzaghiSolver(() => 1, 'double');
          const Tv = (i.cv * i.t) / (i.H / 2) ** 2;
          return { values: { Tv, U: s.U(Tv), u_4_5: 100 * s.u(4.5 / 9.5, Tv), u_2_5: 100 * s.u(2.5 / 9.5, Tv), u_0_5: 100 * s.u(0.5 / 9.5, Tv) } };
        },
        expect: {
          Tv: { value: 0.55946, tol: 0.0056 },
          U: { value: 0.796, tol: 0.008 },
          u_4_5: { value: 31.91, tol: 0.32, unit: 'kPa' },
          u_2_5: { value: 23.56, tol: 0.24, unit: 'kPa' },
          u_0_5: { value: 5.27, tol: 0.053, unit: 'kPa' },
        },
      },
      {
        name: 'S2 — first principles: Tv for U = 50% and 90% (uniform u0, closed form 0.197 / 0.848)',
        inputs: { H: 10, drainage: DRAINAGE[0], profile: PROFILES[0], dSigma: 100, cvSource: 'Enter cv', cv: 1, mv: 0.2, t: 1, targetU: 90 },
        expect: { tv50: { value: 0.197, tol: 0.002 }, tv90: { value: 0.848, tol: 0.008 } },
      },
      {
        name: 'S2 — Terzcons cross-check: H 12 m double drained, cv from k 5×10⁻⁹ m/s and av 1×10⁻⁴ /kPa, e0 0.3 (mv 7.69×10⁻⁵ m²/kN), t 6.41×10⁶ s → Tv 1.18, U 95.6%; ρ∞ = 0.0769×100×12 = 92.3 mm',
        inputs: { H: 12, drainage: DRAINAGE[0], profile: PROFILES[0], dSigma: 100, cvSource: 'From k and mv', k: 5e-9, mv: 0.1e-3 / 1.3 * 1000, t: 6411212.3 / SEC_PER_YEAR, targetU: 90 },
        expect: { Tv: { value: 1.180, tol: 0.012 }, U: { value: 95.59, tol: 0.5, unit: '%' }, 'ρ∞': { value: 92.3, tol: 0.9, unit: 'mm' } },
      },
      {
        name: 'S2 — single drainage doubles Hdr: H 5 m top-drained = H 10 m double-drained (same Tv and U)',
        inputs: { H: 5, drainage: DRAINAGE[1], profile: PROFILES[0], dSigma: 100, cvSource: 'Enter cv', cv: 2, mv: 0.2, t: 2, targetU: 90 },
        expect: { Tv: { value: 0.16, tol: 0.0005 }, U: { value: 45.14, tol: 0.3, unit: '%' } },
      },
    ],
  },
};

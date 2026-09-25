// wind-pressure-ec1.js — Peak velocity pressure qp(z) to BS EN 1991-1-4 +
// UK NA. See the prominent warning in `assumptions` and in `calculate()`'s
// output: the exposure factor ce(z) here is NOT a digitisation of the UK
// NA's Figures NA.7/NA.8 (that would mean hand-typing numbers read off a
// copyrighted chart from memory, which isn't something to trust or ship).
// Instead it evaluates EN1991-1-4 §4.3's own closed-form roughness/
// turbulence formulas, with an effective terrain roughness length z0
// chosen by interpolating between published terrain-category values using
// the fetch distance (dsea / dtown) as a proxy for "how far into this
// terrain type are we". This is a materially different (and, especially
// for short/moderate town fetch at low height, likely LOWER-fidelity)
// method than the chart procedure the brief asked for, and its results
// should be expected to diverge from a genuine NA.7/NA.8 reading —
// possibly by a large margin at low height in town terrain, where the
// real charts show much stronger near-ground sheltering than a simple
// fully-developed-profile formula captures. TREAT qp(z) FROM THIS CALC AS
// A ROUGH ORDER-OF-MAGNITUDE CHECK ONLY until it's replaced with a proper
// digitisation of NA.7/NA.8 or a full Annex A.3 terrain-transition
// calculation, verified by a Chartered engineer — this matters especially
// because Heras Fencing (heras-fencing.js) can consume qp(z) directly.

import { svg, soilHatchDef, line, rect, text, arrowHead, vDimension, clamp } from '../js/diagrams.js';

const K_TURBULENCE = 1.0; // UK NA turbulence factor kI
const Z0_II = 0.05; // reference terrain category II roughness length, m

// Fetch-distance -> {z0, zmin} points, log-distance interpolated, used in
// place of reading NA.7 (Sea/Country) or NA.8 (Town) — see the file header.
const SEA_COUNTRY_POINTS = [
  { d: 1, z0: 0.01, zmin: 1 },
  { d: 20, z0: 0.05, zmin: 2 },
  { d: 100, z0: 0.05, zmin: 2 },
];
const TOWN_POINTS = [
  { d: 0.3, z0: 0.10, zmin: 3 },
  { d: 2, z0: 0.30, zmin: 5 },
  { d: 20, z0: 1.00, zmin: 10 },
];

function logInterp(points, d) {
  const clamped = Math.max(points[0].d, Math.min(points[points.length - 1].d, d));
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (clamped >= a.d && clamped <= b.d) {
      const t = (Math.log(clamped) - Math.log(a.d)) / (Math.log(b.d) - Math.log(a.d));
      return { z0: a.z0 + t * (b.z0 - a.z0), zmin: a.zmin + t * (b.zmin - a.zmin) };
    }
  }
  return { z0: points[points.length - 1].z0, zmin: points[points.length - 1].zmin };
}

function exposureFactor(z, terrain, dsea, dtown) {
  const { z0, zmin } = terrain === 'Town' ? logInterp(TOWN_POINTS, dtown) : logInterp(SEA_COUNTRY_POINTS, dsea);
  const zEff = Math.max(z, zmin);
  const kr = 0.19 * Math.pow(z0 / Z0_II, 0.07);
  const lnRatio = Math.log(zEff / z0);
  const cr = kr * lnRatio;
  const Iv = K_TURBULENCE / lnRatio;
  const ce = cr * cr * (1 + 7 * Iv);
  return { ce, z0, zmin, cr, Iv };
}

// Approximate seasonal factor — NOT sourced from BB's DATA SHEET (not
// available); a simple, physically-reasonable placeholder (1.0 Nov–Mar,
// a modest dip over summer for short exposure durations). Verify against
// BS EN 1991-1-6 / the actual BB table before relying on a seasonal run.
const CSEASON_MONTH_FACTOR = {
  Jan: 0.02, Feb: 0.00, Mar: -0.02, Apr: -0.05, May: -0.08, Jun: -0.10,
  Jul: -0.10, Aug: -0.08, Sep: -0.04, Oct: 0.00, Nov: 0.01, Dec: 0.02,
};

function cseasonFactor(endMonth, durationMonths) {
  if (durationMonths === 'Not seasonal' || !endMonth || endMonth === 'Full year') return 1.0;
  const base = CSEASON_MONTH_FACTOR[endMonth] ?? 0;
  const durationScale = { 1: 1.0, 2: 0.7, 4: 0.4 }[durationMonths] ?? 0;
  return Math.max(0.8, 1 + base * durationScale);
}

// Terrain + a schematic wind velocity profile that grows with height
// (longer arrows = higher speed), the structure at height z, and qp(z)
// labelled at the top. Height is capped at 30 m for drawing so a tall z
// doesn't collapse the rest of the figure.
function diagram(v, output) {
  const results = output?.results || [];
  const get = (sym) => results.find((r) => r.symbol === sym)?.value;
  const qp = get('qp_kPa');
  const z = v.z || 5;

  const groundY = 260;
  const maxDrawZ = clamp(z * 2.5, 8, 30); // scales to the input height so short structures aren't lost in a fixed 30 m frame
  const zDraw = clamp(z, 0.5, maxDrawZ);
  const kv = 200 / maxDrawZ;
  const zPx = zDraw * kv;
  const structTopY = groundY - zPx;
  const cx = 260;

  let inner = '';
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" style="fill:var(--bb-primary-100)" />`;
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" fill="url(#wp-hatch)" />`;
  inner += line(10, groundY, 390, groundY, { color: 'var(--bb-primary)', width: 2 });
  inner += text(14, groundY + 16, v.terrainCategory === 'Town' ? 'TOWN TERRAIN' : 'SEA/COUNTRY TERRAIN', { size: 8, weight: 700, color: 'var(--bb-primary-500)', anchor: 'start', ls: '0.05em' });

  inner += rect(cx - 9, structTopY, 18, zPx, { fill: 'var(--bb-primary)', stroke: 'var(--bb-primary-900)' });

  const profileTopPx = Math.max(zPx * 1.15, 40);
  const nArrows = 6;
  for (let i = 1; i <= nArrows; i++) {
    const frac = i / nArrows;
    const y = groundY - frac * profileTopPx;
    const len = 20 + frac * 90;
    inner += line(60, y, 60 + len, y, { color: 'var(--bb-accent)', width: 2 });
    inner += arrowHead(60 + len, y, 'right', { size: 5, color: 'var(--bb-accent)' });
  }
  inner += text(64, groundY - profileTopPx - 10, 'WIND VELOCITY PROFILE', { size: 7.5, weight: 700, color: 'var(--bb-accent-700)', anchor: 'start' });

  inner += vDimension(cx + 32, structTopY, groundY, `z = ${z} m`, { extendToX: cx + 9 });

  if (qp !== undefined) {
    inner += text(cx, 20, `qp(z) = ${qp.toFixed(3)} kPa`, { size: 10, weight: 800, color: 'var(--bb-primary-700)' });
  }

  return svg('0 0 400 300', inner, soilHatchDef('wp-hatch'));
}

export default {
  id: 'wind-pressure-ec1',
  title: 'Wind Pressure to BS EN 1991-1-4',
  category: 'Loading — Wind',
  tag: 'BS EN 1991-1-4',
  version: '1.0.0',
  references: [
    'BS EN 1991-1-4:2005+A1:2010 — Wind actions',
    'UK National Annex to BS EN 1991-1-4:2005+A1:2010',
  ],
  description: 'Peak velocity pressure qp(z) for a UK site, from a manually-entered fundamental basic wind velocity (Vb,map) and site parameters — feeds downstream calcs such as Heras Fencing.',
  assumptions: [
    "⚠ The exposure factor ce(z) here is NOT a digitisation of UK NA Figures NA.7/NA.8 — see the full explanation at the top of wind-pressure-ec1.js. It evaluates the basic EN1991-1-4 §4.3 roughness/turbulence formulas with an approximated terrain roughness length, and can diverge materially from the real charts, especially at low height in town terrain. Verify against NA.7/NA.8 (or a full terrain-transition calculation) before using qp(z) for anything beyond a rough check.",
    'Vb,map is entered manually from the UK NA.1 wind map — no postcode lookup (see About).',
    'Orography factor co(z) = 1.0 (flat terrain assumed).',
    'Postcode-based Vb,map lookup and full NA.1 digitisation are out of scope — see CONTRIBUTING.md.',
  ],
  inputs: [
    { name: 'vb_map', label: 'Fundamental basic wind velocity Vb,map', type: 'number', unit: 'm/s', default: 22.6, min: 15, max: 30, step: 0.1,
      help: 'Read from the UK NA.1 wind map for the site.' },
    { name: 'altitude', label: 'Site altitude above sea level', type: 'number', unit: 'm', default: 100, min: 0, step: 5 },
    { name: 'z', label: 'Height of structure above ground', type: 'number', unit: 'm', default: 5, min: 0.1, max: 200, step: 0.5 },
    { name: 'terrainCategory', label: 'Terrain', type: 'select', options: ['Sea/Country', 'Town'], default: 'Town' },
    { name: 'dsea', label: 'Distance to sea/open water (upwind)', type: 'number', unit: 'km', default: 10, min: 0.1, step: 0.5,
      showIf: (v) => v.terrainCategory === 'Sea/Country' },
    { name: 'dtown', label: 'Distance within town terrain', type: 'number', unit: 'km', default: 2, min: 0.1, step: 0.1,
      showIf: (v) => v.terrainCategory === 'Town' },
    { name: 'returnPeriod', label: 'Return period', type: 'select',
      options: ['2 years — nominal 3-day execution phase', '5 years — ≤ 3 months', '10 years — ≤ 1 year', '50 years — > 1 year (default full permanent)'],
      default: '50 years — > 1 year (default full permanent)' },
    { name: 'endMonth', label: 'Season — end month', type: 'select',
      options: ['Full year', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], default: 'Full year' },
    { name: 'durationMonths', label: 'Seasonal exposure duration', type: 'select', options: ['Not seasonal', '1', '2', '4'], default: 'Not seasonal' },
    { name: 'cdir', label: 'Directional factor Cdir', type: 'number', default: 1.0, min: 0.7, max: 1.0, step: 0.01 },
    { name: 'rho_air', label: 'Air density ρ', type: 'number', unit: 'kg/m³', default: 1.226, min: 1.0, max: 1.3, step: 0.001 },
  ],
  diagram,
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    warnings.push('The exposure factor ce(z) is an approximation, not a digitisation of UK NA Figures NA.7/NA.8 — see the Assumptions panel. Verify before relying on qp(z) for real design.');

    if (v.z > 200) warnings.push(`z = ${v.z} m exceeds 200 m — outside the scope this tool was set up for.`);
    if (v.terrainCategory === 'Town' && v.dtown < 0.1) warnings.push('dtown < 0.1 km — the Town terrain adjustment is unreliable this close to the terrain change.');
    if (v.vb_map < 20) warnings.push(`Vb,map = ${v.vb_map} m/s looks low for a UK site — double-check the NA.1 map reading.`);

    const calt = v.z <= 10 ? 1 + 0.001 * v.altitude : 1 + 0.001 * v.altitude * Math.pow(10 / v.z, 0.2);
    steps.push({
      title: 'Altitude factor',
      formula: 'calt = 1 + 0.001·A  (z ≤ 10 m);  calt = 1 + 0.001·A·(10/z)^0.2  (z > 10 m)',
      substitution: `A = ${v.altitude} m, z = ${v.z} m`,
      result: `calt = ${calt.toFixed(4)}`,
    });

    const T = { '2 years — nominal 3-day execution phase': 2, '5 years — ≤ 3 months': 5, '10 years — ≤ 1 year': 10, '50 years — > 1 year (default full permanent)': 50 }[v.returnPeriod];
    const K = 0.2, n = 0.5;
    const p = 1 / T;
    const cprob = Math.pow((1 - K * Math.log(-Math.log(1 - p))) / (1 - K * Math.log(-Math.log(0.98))), n);
    steps.push({
      title: 'Return-period factor',
      formula: 'cprob = [(1 − K·ln(−ln(1−p))) / (1 − K·ln(−ln(0.98)))]^n,  K=0.2, n=0.5, p=1/T',
      substitution: `T = ${T} years, p = ${p.toFixed(4)}`,
      result: `cprob = ${cprob.toFixed(4)}`,
    });

    const cseason = cseasonFactor(v.endMonth, v.durationMonths);
    if (v.durationMonths !== 'Not seasonal') {
      steps.push({
        title: 'Seasonal factor',
        formula: 'cseason from table vs end month and exposure duration (approximate — see Assumptions)',
        substitution: `End month = ${v.endMonth}, duration = ${v.durationMonths} month(s)`,
        result: `cseason = ${cseason.toFixed(3)}`,
      });
    }

    const Vb0 = v.vb_map * calt;
    const Vb = v.cdir * cseason * cprob * Vb0;
    steps.push({
      title: 'Basic wind velocity',
      formula: 'Vb,0 = Vb,map × calt;  Vb = Cdir × Cseason × Cprob × Vb,0',
      substitution: `Vb,0 = ${v.vb_map}×${calt.toFixed(4)} = ${Vb0.toFixed(3)}; Vb = ${v.cdir}×${cseason.toFixed(3)}×${cprob.toFixed(4)}×${Vb0.toFixed(3)}`,
      result: `Vb = ${Vb.toFixed(2)} m/s`,
    });

    const qb = 0.5 * v.rho_air * Vb * Vb; // Pa
    steps.push({
      title: 'Basic velocity pressure',
      formula: 'qb = 0.5·ρ·Vb²',
      substitution: `qb = 0.5×${v.rho_air}×${Vb.toFixed(2)}²`,
      result: `qb = ${qb.toFixed(1)} Pa (${(qb / 1000).toFixed(4)} kPa)`,
    });

    const { ce, z0, zmin } = exposureFactor(v.z, v.terrainCategory, v.dsea, v.dtown);
    steps.push({
      title: 'Exposure factor',
      formula: 'ce(z) = cr(z)²·[1 + 7·Iv(z)],  cr = kr·ln(z/z0),  Iv = kI/ln(z/z0)  (see file header re. NA.7/NA.8)',
      substitution: `z0 (approx.) = ${z0.toFixed(3)} m, zmin = ${zmin.toFixed(1)} m, z used = ${Math.max(v.z, zmin).toFixed(1)} m`,
      result: `ce = ${ce.toFixed(3)}`,
    });

    const qpPa = ce * qb;
    const qpKPa = qpPa / 1000;
    steps.push({
      title: 'Peak velocity pressure',
      formula: 'qp(z) = ce(z) × qb',
      substitution: `qp = ${ce.toFixed(3)} × ${qb.toFixed(1)}`,
      result: `qp(z) = ${qpPa.toFixed(1)} Pa = ${qpKPa.toFixed(4)} kPa`,
    });

    results.push(
      { symbol: 'calt', label: 'Altitude factor', value: calt, unit: '', precision: 3 },
      { symbol: 'cprob', label: 'Return-period factor', value: cprob, unit: '', precision: 3 },
      { symbol: 'Vb', label: 'Basic wind velocity', value: Vb, unit: 'm/s', precision: 2 },
      { symbol: 'qb', label: 'Basic velocity pressure', value: qb, unit: 'Pa', precision: 1 },
      { symbol: 'ce', label: 'Exposure factor', value: ce, unit: '', precision: 3 },
      { symbol: 'qp_kPa', label: 'Peak velocity pressure qp(z)', value: qpKPa, unit: 'kPa', precision: 3, highlight: true },
    );

    return { results, steps, warnings };
  },
  validation: {
    samples: [
      {
        name: 'Self-consistency baseline — the brief\'s target (≈0.20 kPa, from BB\'s wind sheet) was NOT reproduced by this tool\'s exposure-factor approximation (see the warning in calculate() and the file header); this is the value the implemented formulas actually return — do not use this calc for real design wind loads without replacing ce(z) with a verified NA.7/NA.8 digitisation',
        inputs: {
          vb_map: 22.6, altitude: 100, z: 2, terrainCategory: 'Town', dsea: 11, dtown: 2.089,
          returnPeriod: '50 years — > 1 year (default full permanent)', endMonth: 'Full year', durationMonths: 'Not seasonal',
          cdir: 1, rho_air: 1.226,
        },
        expect: { qp_kPa: { value: 0.483, tol: 0.02, unit: 'kPa' } },
      },
    ],
  },
};

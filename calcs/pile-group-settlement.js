// pile-group-settlement.js — Settlement of a pile group in granular soil by
// the equivalent raft method (Tomlinson) with Burland & Burbidge (1985)
// beneath the raft, plus elastic shortening of the piles.

import { svg, line, rect, text, clamp } from '../js/diagrams.js';
import { GAMMA_W, burlandBurbidge, bbCorrectN } from '../js/geo-core.js';

const ACTION = ['End bearing (into a bearing stratum)', 'Friction (uniform soil)'];
const GRAN = ['Sand', 'Fine/silty sand', 'Gravel'];

export function groupSettlement(v) {
  const warnings = [];
  const Bg = (v.cols - 1) * v.s + v.D;
  const Lg = (v.rows - 1) * v.s + v.D;
  const n = v.rows * v.cols;
  const endBearing = v.action !== ACTION[1];
  const z0 = endBearing ? v.zBear : v.head; // top of the load-spread zone
  if (endBearing && (v.zBear <= v.head || v.zBear >= v.toe)) warnings.push('Top of bearing stratum should lie between the pile head and toe.');
  const zr = z0 + (2 / 3) * (v.toe - z0);
  const spread = (zr - z0) / 4;
  let B = Bg + 2 * spread, L = Lg + 2 * spread;
  if (B > L) [B, L] = [L, B];
  const zw = Number.isFinite(v.zw) ? v.zw : 1e6;
  const sv0 = v.gamma * Math.min(zr, zw) + (v.gammaSat - GAMMA_W) * Math.max(0, zr - zw);
  const P = v.Gk + v.Qk;
  const q = P / (B * L);
  const belowWater = zw <= zr;
  const Nc = bbCorrectN(v.Nbar, v.granType, belowWater);
  const Hs = Number.isFinite(v.Hs) && v.Hs > 0 ? v.Hs : null;
  const bb = burlandBurbidge({ B, L, Nbar: Nc, q, sigmaV0: sv0, tYears: v.t, Hs, R3: v.R3, Rt: v.Rt });
  const area = (Math.PI * v.D ** 2) / 4;
  const shortFactor = endBearing ? 1.0 : 0.5;
  const shortening = v.Ep > 0 ? ((P / n) * (v.toe - v.head) / (area * v.Ep * 1000)) * shortFactor * 1000 : 0; // mm
  const total = bb.st + shortening;
  if (v.s < 2.5 * v.D) warnings.push(`Spacing ${v.s} m is less than 2.5D. Check constructability and group effects.`);
  if (q > sv0) warnings.push('Raft pressure exceeds σ′v0 at raft level. B&B uses (q′ − ⅔σ′v0); check this is appropriate for the stress history.');
  if (bb.zI > 0 && Hs === null) warnings.push(`B&B depth of influence zI = ${bb.zI.toFixed(2)} m below the raft. Confirm the granular stratum extends this far, or enter its thickness Hs.`);
  return { Bg, Lg, n, endBearing, z0, zr, spread, B, L, sv0, P, q, Nc, bb, shortening, shortFactor, total, warnings, belowWater };
}

function diagram(v, output) {
  const r = output?.values?.r || groupSettlement(v);
  const zMax = Math.max(v.toe + Math.max(r.B, 4), 10);
  const top = 30, bot = 290;
  const sc = (bot - top) / zMax;
  const W = Math.max(r.L + 4, 12);
  const sx = 360 / W;
  const cx = 200;
  const X = (x) => cx + x * sx, Y = (z) => top + z * sc;
  let inner = '';
  inner += rect(20, Y(0), 360, bot - Y(0), { fill: 'var(--bb-primary-100)', stroke: 'none' });
  if (r.endBearing) inner += rect(20, Y(v.zBear), 360, bot - Y(v.zBear), { fill: 'var(--bb-accent-100, #fdf0dc)', stroke: 'none' });
  inner += line(20, Y(0), 380, Y(0), { color: 'var(--bb-primary)', width: 2 });
  if (r.endBearing) inner += text(24, Y(v.zBear) + 11, 'BEARING STRATUM', { size: 8.5, anchor: 'start', weight: 700 });
  // cap and piles (section along the group width)
  inner += rect(X(-r.Bg / 2 - 0.3), Y(v.head) - 10, (r.Bg + 0.6) * sx, 10, { fill: 'var(--bb-primary-700)', stroke: 'none' });
  for (let i = 0; i < v.cols; i++) {
    const x = -r.Bg / 2 + v.D / 2 + i * v.s;
    inner += rect(X(x - v.D / 2), Y(v.head), clamp(v.D * sx, 3, 30), (v.toe - v.head) * sc, { fill: 'var(--bb-primary-500)', stroke: 'none' });
  }
  // spread lines and raft
  inner += line(X(-r.Bg / 2), Y(r.z0), X(-r.B / 2), Y(r.zr), { color: 'var(--bb-accent)', width: 1.4, dash: '4 3' });
  inner += line(X(r.Bg / 2), Y(r.z0), X(r.B / 2), Y(r.zr), { color: 'var(--bb-accent)', width: 1.4, dash: '4 3' });
  inner += rect(X(-r.B / 2), Y(r.zr) - 3, r.B * sx, 6, { fill: 'var(--bb-accent)', stroke: 'none' });
  inner += text(X(r.B / 2) + 6, Y(r.zr) + 3, `raft ${r.zr.toFixed(2)} m, B ${r.B.toFixed(2)} m`, { size: 8.5, anchor: 'start' });
  inner += line(X(-r.B / 2), Y(r.zr + r.bb.zI), X(r.B / 2), Y(r.zr + r.bb.zI), { color: 'var(--bb-ink)', width: 0.8, dash: '2 2' });
  inner += text(X(r.B / 2) + 6, Y(r.zr + r.bb.zI) + 3, `zI ${r.bb.zI.toFixed(2)} m`, { size: 8.5, anchor: 'start' });
  inner += text(cx, 20, '1H:4V spread to equivalent raft at ⅔ embedment', { size: 9, weight: 700 });
  return svg('0 0 400 300', inner);
}

export default {
  id: 'pile-group-settlement',
  title: 'Pile Group Settlement — Equivalent Raft',
  category: 'Geotechnical — Piles',
  tag: 'Tomlinson + B&B',
  version: '1.0.0',
  references: [
    'Tomlinson, M. & Woodward, J., Pile Design and Construction Practice, 6th ed. — equivalent raft method (⅔ depth, 1H:4V spread)',
    'Burland, J.B. & Burbidge, M.C. (1985) Settlement of foundations on sand and gravel, Proc. ICE 78(1) — Ic, zI, fs, fl, ft',
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) cl. 7.6.4 — pile settlement; cl. 2.4.8 and Annex H — serviceability limits',
  ],
  description: 'Settlement of a rectangular pile group in sand or gravel by the equivalent raft method, with Burland & Burbidge below the raft and elastic shortening of the piles. Characteristic (SLS) loads.',
  assumptions: [
    'Rectangular group of equal circular piles at uniform spacing.',
    'End-bearing piles: raft at ⅔ of the embedment into the bearing stratum, load spread 1H:4V from the group perimeter at the top of the stratum. Friction piles: raft at ⅔ of the pile length, spread from the pile head.',
    'Granular soil below the raft. Compressible clay below the raft or between the cap and the bearing stratum is not included — use consolidation-1d.',
    'Burland & Burbidge with the raft pressure as q′ and σ′v0 at raft level as the preconsolidation stress. Probable (mean Ic) settlement.',
    'Elastic shortening = (P/n)·L/(A·E) × 1.0 (end bearing) or 0.5 (friction).',
    'The settlement limit is the structure SLS limit. 10%D is an EC7 ULS failure criterion and is not a settlement limit.',
  ],
  inputs: [
    { name: 'rows', label: 'Pile rows', type: 'number', default: 3, min: 1, step: 1 },
    { name: 'cols', label: 'Pile columns', type: 'number', default: 3, min: 1, step: 1 },
    { name: 's', label: 'Pile spacing (centres)', type: 'number', unit: 'm', default: 1.8, min: 0.3, step: 0.05 },
    { name: 'D', label: 'Pile diameter D', type: 'number', unit: 'm', default: 0.6, min: 0.1, step: 0.05 },
    { name: 'head', label: 'Pile head depth', type: 'number', unit: 'm bgl', default: 1, min: 0, step: 0.1 },
    { name: 'toe', label: 'Pile toe depth', type: 'number', unit: 'm bgl', default: 16, min: 1, step: 0.1 },
    { name: 'action', label: 'Pile action', type: 'select', options: ACTION, default: ACTION[0] },
    { name: 'zBear', label: 'Top of bearing stratum', type: 'number', unit: 'm bgl', default: 10, min: 0, step: 0.1, showIf: (v) => v.action !== ACTION[1] },
    { name: 'gamma', label: 'Bulk unit weight γ (mean above raft)', type: 'number', unit: 'kN/m³', default: 19, min: 10, max: 24, step: 0.5 },
    { name: 'gammaSat', label: 'Saturated unit weight γsat', type: 'number', unit: 'kN/m³', default: 20, min: 10, max: 24, step: 0.5 },
    { name: 'zw', label: 'Groundwater depth', type: 'number', unit: 'm bgl', default: 50, min: 0, step: 0.1 },
    { name: 'Gk', label: 'Permanent load on group Gk (incl. cap)', type: 'number', unit: 'kN', default: 6000, min: 0, step: 10 },
    { name: 'Qk', label: 'Variable load on group Qk', type: 'number', unit: 'kN', default: 1500, min: 0, step: 10 },
    { name: 'Nbar', label: 'Mean SPT N over zI below raft', type: 'number', default: 25, min: 1, step: 1 },
    { name: 'granType', label: 'Granular soil type (N correction)', type: 'select', options: GRAN, default: 'Sand' },
    { name: 'Hs', label: 'Thickness of granular soil below raft Hs (optional)', type: 'number', unit: 'm', default: undefined, min: 0, step: 0.1,
      help: 'Blank = at least zI. Enter where a rigid stratum lies within zI.' },
    { name: 't', label: 'Time for long-term settlement', type: 'number', unit: 'years', default: 30, min: 3, step: 1 },
    { name: 'R3', label: 'B&B R3 (first 3 years)', type: 'number', default: 0.3, min: 0, step: 0.05 },
    { name: 'Rt', label: 'B&B Rt (per log cycle)', type: 'number', default: 0.2, min: 0, step: 0.05,
      help: 'B&B static loads: R3 0.3, Rt 0.2. Fluctuating loads: R3 0.7, Rt 0.8.' },
    { name: 'Ep', label: 'Pile modulus Ep', type: 'number', unit: 'MPa', default: 30000, min: 0, step: 1000 },
    { name: 'limit', label: 'Allowable settlement (structure SLS)', type: 'number', unit: 'mm', default: 25, min: 1, step: 1 },
  ],
  diagram,
  calculate: (v) => {
    const r = groupSettlement(v);
    const steps = [];
    steps.push({
      title: 'Group footprint',
      formula: 'Bg = (cols − 1)s + D;  Lg = (rows − 1)s + D',
      substitution: `Bg = (${v.cols} − 1) × ${v.s} + ${v.D};  Lg = (${v.rows} − 1) × ${v.s} + ${v.D}`,
      result: `Bg = ${r.Bg.toFixed(3)} m, Lg = ${r.Lg.toFixed(3)} m, n = ${r.n}`,
    });
    steps.push({
      title: 'Equivalent raft',
      formula: r.endBearing ? 'zr = zbear + ⅔(toe − zbear);  spread = (zr − zbear)/4 each side' : 'zr = head + ⅔(toe − head);  spread = (zr − head)/4 each side',
      substitution: `zr = ${r.z0} + ⅔ × (${v.toe} − ${r.z0}) = ${r.zr.toFixed(3)} m;  spread = ${r.spread.toFixed(3)} m`,
      result: `B = ${r.B.toFixed(3)} m, L = ${r.L.toFixed(3)} m, A = ${(r.B * r.L).toFixed(2)} m²`,
    });
    steps.push({
      title: 'Raft pressure and overburden',
      formula: 'q′ = (Gk + Qk)/(B·L);  σ′v0 = γ·min(zr, zw) + (γsat − γw)·max(0, zr − zw)',
      substitution: `q′ = ${r.P} / ${(r.B * r.L).toFixed(2)}`,
      result: `q′ = ${r.q.toFixed(1)} kPa, σ′v0 = ${r.sv0.toFixed(1)} kPa`,
    });
    steps.push({
      title: 'Burland & Burbidge parameters',
      formula: "N′ (fine/silty sand below water: 15 + 0.5(N − 15); gravel: 1.25N);  Ic = 1.71/N′^1.4;  zI = B^0.763;  fs = [1.25(L/B)/(L/B + 0.25)]²;  fl = (Hs/zI)(2 − Hs/zI);  ft = 1 + R3 + Rt·log(t/3)",
      substitution: `N = ${v.Nbar} → N′ = ${r.Nc.toFixed(1)} (${v.granType}${r.belowWater ? ', below water' : ''})`,
      result: `Ic = ${r.bb.Ic.toFixed(5)}, zI = ${r.bb.zI.toFixed(3)} m, fs = ${r.bb.fs.toFixed(3)}, fl = ${r.bb.fl.toFixed(3)}, ft = ${r.bb.ft.toFixed(3)}`,
    });
    steps.push({
      title: 'Settlement of the equivalent raft',
      formula: 'si = fs·fl·(q′ − ⅔σ′v0)·B^0.7·Ic  (q′/3 if q′ ≤ σ′v0);  st = ft·si',
      substitution: `si = ${r.bb.fs.toFixed(3)} × ${r.bb.fl.toFixed(3)} × ${r.bb.qTerm.toFixed(1)} × ${Math.pow(r.B, 0.7).toFixed(3)} × ${r.bb.Ic.toFixed(5)}`,
      result: `si = ${r.bb.si.toFixed(2)} mm; st (${v.t} yr) = ${r.bb.st.toFixed(2)} mm`,
    });
    steps.push({
      title: 'Elastic shortening of the piles',
      formula: 'Δ = (P/n)·L/(A·Ep) × factor',
      substitution: `Δ = (${r.P}/${r.n}) × ${(v.toe - v.head).toFixed(2)} / (${((Math.PI * v.D ** 2) / 4).toFixed(4)} × ${v.Ep} MPa) × ${r.shortFactor}`,
      result: `Δ = ${r.shortening.toFixed(2)} mm`,
    });
    const util = r.total / v.limit;
    const results = [
      { symbol: 'zr', label: 'Equivalent raft depth', value: r.zr, unit: 'm bgl', precision: 2 },
      { symbol: 'B', label: 'Raft width B', value: r.B, unit: 'm', precision: 3 },
      { symbol: 'q', label: 'Raft pressure q′', value: r.q, unit: 'kPa', precision: 1 },
      { symbol: 'si', label: 'Immediate settlement (raft)', value: r.bb.si, unit: 'mm', precision: 2 },
      { symbol: 'st', label: `Long-term settlement (raft, ${v.t} yr)`, value: r.bb.st, unit: 'mm', precision: 2 },
      { symbol: 'Δ', label: 'Pile elastic shortening', value: r.shortening, unit: 'mm', precision: 2 },
      { symbol: 's,total', label: 'Total settlement', value: r.total, unit: 'mm', precision: 1, highlight: true },
      { symbol: 'util', label: 'Settlement / allowable', value: util, unit: '', precision: 2, highlight: true },
    ];
    const verdict = { pass: util <= 1, message: util <= 1 ? `Total settlement ${r.total.toFixed(1)} mm ≤ ${v.limit} mm.` : `Total settlement ${r.total.toFixed(1)} mm exceeds ${v.limit} mm.` };
    return { results, steps, warnings: r.warnings, verdict, values: { r } };
  },
  validation: {
    samples: [
      {
        name: 'S2 — first principles (synthetic): 3×3 at 1.8 m, D 0.6 m, head 1 m, toe 16 m, bearing stratum 10 m, γ 19, dry. Hand: zr 14.0 m, B = 4.2 + 2 × 1.0 = 6.2 m, q = 7500/38.44 = 195.1 kPa < σ′v0 266 kPa → q/3 = 65.04; Ic = 1.71/25^1.4 = 0.018875; si = 65.04 × 6.2^0.7 × Ic = 4.40 mm; ft(30 yr) 1.5 → 6.60 mm; Δ = 833.3 × 15/(0.2827 × 30 GPa) = 1.47 mm; total 8.08 mm',
        inputs: { rows: 3, cols: 3, s: 1.8, D: 0.6, head: 1, toe: 16, action: ACTION[0], zBear: 10, gamma: 19, gammaSat: 20, zw: 50, Gk: 6000, Qk: 1500, Nbar: 25, granType: 'Sand', t: 30, R3: 0.3, Rt: 0.2, Ep: 30000, limit: 25 },
        expect: {
          zr: { value: 14.0, tol: 0.01, unit: 'm' },
          B: { value: 6.2, tol: 0.01, unit: 'm' },
          si: { value: 4.40, tol: 0.044, unit: 'mm' },
          st: { value: 6.60, tol: 0.066, unit: 'mm' },
          's,total': { value: 8.08, tol: 0.08, unit: 'mm' },
        },
      },
      {
        name: 'S2 — fine sand below water: N 30 → N′ = 15 + 0.5 × 15 = 22.5; friction piles 2×2, head 0, toe 12 → zr 8 m, B = 2.4 + 2 × 2 = 6.4 m',
        inputs: { rows: 2, cols: 2, s: 1.8, D: 0.6, head: 0, toe: 12, action: ACTION[1], zBear: 0, gamma: 19, gammaSat: 20, zw: 2, Gk: 3000, Qk: 500, Nbar: 30, granType: 'Fine/silty sand', t: 30, R3: 0.3, Rt: 0.2, Ep: 30000, limit: 25 },
        run: (i) => { const r = groupSettlement(i); return { values: { Nc: r.Nc, zr: r.zr, B: r.B } }; },
        expect: { Nc: { value: 22.5, tol: 0.01 }, zr: { value: 8, tol: 0.01, unit: 'm' }, B: { value: 6.4, tol: 0.01, unit: 'm' } },
      },
    ],
  },
};

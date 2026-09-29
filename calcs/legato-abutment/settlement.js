// settlement.js — Burland & Burbidge (1985) for granular soils, 1D
// consolidation for cohesive soils, differential settlement and tilt.

import { sigmaVAt } from './ground.js';

// Burland & Burbidge (1985). q = gross bearing pressure (kPa), sigmaV0 =
// maximum previous effective overburden at founding level (kPa).
export function burlandBurbidge({ B, L, Nbar, q, sigmaV0 = 0, tYears = 3, Hs = null, R3 = 0.3, Rt = 0.2 }) {
  const Ic = 1.71 / Math.pow(Math.max(Nbar, 1e-6), 1.4);
  const zI = Math.pow(B, 0.763);
  const r = L / B;
  const fs = Math.pow((1.25 * r) / (r + 0.25), 2);
  const fl = Hs !== null && Hs < zI ? (Hs / zI) * (2 - Hs / zI) : 1;
  const ft = tYears > 3 ? 1 + R3 + Rt * Math.log10(tYears / 3) : 1;
  const qTerm = q > sigmaV0 ? q - (2 / 3) * sigmaV0 : q / 3;
  const si = fs * fl * qTerm * Math.pow(B, 0.7) * Ic; // mm
  return { Ic, zI, fs, fl, ft, qTerm, si, st: si * ft };
}

// SPT corrections for B&B: fine/silty sand below water, gravel.
export function bbCorrectN(N, granType, belowWater) {
  let n = N;
  if (granType === 'Fine/silty sand' && belowWater && n > 15) n = 15 + 0.5 * (n - 15);
  if (granType === 'Gravel') n *= 1.25;
  return n;
}

// 1D consolidation beneath a B × L footing, 2:1 stress spread, to the depth
// where Δσ′ < 0.2 σ′v0. mv in m²/MN.
export function consolidation1D({ layers, formationLevel, surfaceLevel, wl, qNet, B, L, dz = 0.1, maxDepth = 30 }) {
  let s = 0, z = dz / 2;
  const contrib = [];
  while (z < maxDepth) {
    const lvl = formationLevel - z;
    const l = layers.find((x) => lvl <= x.topLevel + 1e-9 && lvl > x.baseLevel - 1e-9);
    if (!l) break;
    const ds = (qNet * B * L) / ((B + z) * (L + z));
    const sv0 = sigmaVAt(layers, surfaceLevel, lvl, wl);
    if (ds < 0.2 * sv0) break;
    if (l.cls === 'Cohesive' && Number.isFinite(l.mv)) {
      const d = (l.mv / 1000) * ds * dz * 1000; // mm
      s += d;
      contrib.push({ level: lvl, ds, mv: l.mv, d });
    }
    z += dz;
  }
  return { s, depth: z, contrib };
}

// Settlement of one end from its SLS characteristic formation pressure.
export function endSettlement(ctx, ground, govQ, designLife) {
  const { geom } = ctx;
  if (!govQ) return null;
  const q = govQ.formation;
  const B = q.B, L = q.L;
  const qMean = q.V / (B * L);
  const wl = geom.water.gwZ + geom.z0Level;
  const sv0 = sigmaVAt(geom.layers, geom.frontGroundLevel, geom.formationLevel, wl);
  const soil = geom.founding;
  const res = { qMean, qmax: q.qmax, qmin: q.qmin, sv0, B, L, method: [], total: 0, steps: [] };
  const t = Math.max(3, Number(designLife) || 50);

  if (soil.cls === 'Granular' || soil.cls === 'Weathered rock') {
    const zI = Math.pow(B, 0.763);
    const tests = [];
    (ground.processed.find((p) => p.id === ground.designId)?.tests || []).forEach((tt) => {
      if (tt.N60 === null || tt.N60 === undefined) return;
      if (tt.level <= geom.formationLevel + 1e-6 && tt.level >= geom.formationLevel - zI - 1e-6) {
        const layer = geom.layers.find((l) => tt.level <= l.topLevel && tt.level > l.baseLevel);
        tests.push(bbCorrectN(tt.N60c ?? tt.N60, layer?.granType, tt.level < wl));
      }
    });
    let Nbar;
    let nSrc;
    if (tests.length) { Nbar = tests.reduce((a, b) => a + b, 0) / tests.length; nSrc = `mean of ${tests.length} corrected N60 within zI`; }
    else { Nbar = bbCorrectN(soil.N60 ?? 15, soil.granType, geom.formationLevel < wl); nSrc = 'characteristic N60 of the founding layer'; }
    const bb = burlandBurbidge({ B, L, Nbar, q: qMean, sigmaV0: sv0, tYears: t });
    res.bb = { ...bb, Nbar, nSrc };
    res.total += bb.st;
    res.method.push('Burland & Burbidge (1985)');
    res.steps.push({ title: 'Granular settlement — Burland & Burbidge (1985)', formula: "s = fs·fl·ft·(q′ − ⅔σ′v0)·B^0.7·Ic;  Ic = 1.71/N̄^1.4;  zI = B^0.763;  fs = [1.25(L/B)/(L/B + 0.25)]²;  ft = 1 + R3 + Rt·log(t/3)", substitution: `B = ${B.toFixed(3)} m, L = ${L.toFixed(3)} m, N̄ = ${Nbar.toFixed(1)} (${nSrc}), q′ = ${qMean.toFixed(1)} kPa, σ′v0 = ${sv0.toFixed(1)} kPa, t = ${t} yr`, result: `Ic = ${bb.Ic.toFixed(5)}, zI = ${bb.zI.toFixed(3)} m, fs = ${bb.fs.toFixed(4)}, s_i = ${bb.si.toFixed(2)} mm, ft = ${bb.ft.toFixed(3)}, s_t = ${bb.st.toFixed(2)} mm` });
  }
  const cons = consolidation1D({ layers: geom.layers, formationLevel: geom.formationLevel, surfaceLevel: geom.frontGroundLevel, wl, qNet: Math.max(0, qMean - sv0), B, L });
  if (cons.s > 0) {
    res.total += cons.s;
    res.method.push('1D consolidation (2:1 spread)');
    res.cons = cons;
    res.steps.push({ title: 'Cohesive settlement — 1D consolidation', formula: 's = Σ mv·Δσ′·Δz;  Δσ′ = q_net·B·L / ((B + z)(L + z)) to depth where Δσ′ < 0.2σ′v0', substitution: `q_net = ${(qMean - sv0).toFixed(1)} kPa; ${cons.contrib.length} slices of 0.1 m in cohesive strata`, result: `s = ${cons.s.toFixed(2)} mm to ${cons.depth.toFixed(1)} m below formation` });
  }
  res.tilt = q.qmax > 0 && qMean > 0 ? (res.total * ((q.qmax - q.qmin) / qMean)) / (B * 1000) : 0;
  return res;
}

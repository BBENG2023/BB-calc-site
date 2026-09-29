// slope.js — overall stability (BS EN 1997-1 Section 11): Bishop simplified
// circular slip search on a 2D section, plus the section model builder for
// an abutment end and a geometry/material export for Slope/W or LimitState GEO.
//
// Model coordinates: x = chainage (m), y = level (mAOD).
// model = { surface: [[x,y],…], materialAt(x,y) → material, phreatic(x) → y|−∞,
//           pondLevel(x) → y|−∞, strips: [{x0,x1,q}], points: [{x,y,Fx,Fy}], bottom, xRange }
// material = { id, gamma, gammaSat, c, phi, cu, undrained }

import { GAMMA_W, rad } from '../../js/geo-core.js';

export function surfaceY(surface, x) {
  if (x <= surface[0][0]) return surface[0][1];
  for (let i = 0; i < surface.length - 1; i++) {
    const [x0, y0] = surface[i], [x1, y1] = surface[i + 1];
    if (x >= x0 && x <= x1) return x1 === x0 ? Math.max(y0, y1) : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return surface[surface.length - 1][1];
}

// Factored strength of a material.
function strength(mat, fac, drainage) {
  if (mat.undrained && drainage === 'undrained') return { c: (mat.cu ?? 0) / fac.gCu, tanPhi: 0, undrained: true };
  return { c: (mat.c ?? 0) / fac.gC, tanPhi: Math.tan(rad(mat.phi ?? 0)) / fac.gPhi, undrained: false };
}

// Slice geometry for one circle. Returns null if the circle doesn't cut the
// surface in a usable single arc.
function sliceCircle(model, xc, yc, R, nSlices) {
  const xs0 = Math.max(xc - R, model.xRange[0]);
  const xs1 = Math.min(xc + R, model.xRange[1]);
  if (xs1 <= xs0) return null;
  // Locate the arc segment below the surface containing the lowest point.
  const N = 90;
  let best = null, cur = null;
  for (let i = 0; i <= N; i++) {
    const x = xs0 + ((xs1 - xs0) * i) / N;
    const ya = yc - Math.sqrt(Math.max(0, R * R - (x - xc) ** 2));
    const below = ya < surfaceY(model.surface, x) - 1e-6;
    if (below) { if (!cur) cur = { a: x, b: x }; else cur.b = x; }
    if ((!below || i === N) && cur) { if (!best || cur.b - cur.a > best.b - best.a) best = cur; cur = null; }
  }
  if (!best || best.b - best.a < 0.5) return null;
  // Reject arcs clipped by the model boundary (no exit inside the model).
  const clipA = xc - R < model.xRange[0] && best.a <= xs0 + 1e-9;
  const clipB = xc + R > model.xRange[1] && best.b >= xs1 - 1e-9;
  if (clipA || clipB) return null;
  // Refine the ends by bisection.
  const f = (x) => yc - Math.sqrt(Math.max(0, R * R - (x - xc) ** 2)) - surfaceY(model.surface, x);
  const bis = (lo, hi) => { for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if ((f(lo) < 0) === (f(m) < 0)) lo = m; else hi = m; } return (lo + hi) / 2; };
  const dx = (xs1 - xs0) / N;
  const xa = best.a - dx > xs0 - 1e-9 && f(best.a - dx) >= 0 ? bis(best.a - dx, best.a) : best.a;
  const xb = best.b + dx < xs1 + 1e-9 && f(best.b + dx) >= 0 ? bis(best.b, best.b + dx) : best.b;
  const b = (xb - xa) / nSlices;
  const slices = [];
  for (let i = 0; i < nSlices; i++) {
    const x = xa + b * (i + 0.5);
    const yb = yc - Math.sqrt(Math.max(0, R * R - (x - xc) ** 2));
    if (yb < model.bottom - 1e-6) return null;
    const yt = surfaceY(model.surface, x);
    if (yt <= yb) continue;
    // Weight by vertical integration through materials.
    const nz = 8;
    let W = 0;
    const phr = model.phreatic(x);
    for (let j = 0; j < nz; j++) {
      const y = yb + ((yt - yb) * (j + 0.5)) / nz;
      const m = model.materialAt(x, y);
      W += (y < phr ? m.gammaSat ?? m.gamma : m.gamma) * ((yt - yb) / nz);
    }
    W *= b;
    const pond = model.pondLevel(x);
    const Wp = pond > yt ? GAMMA_W * (pond - yt) * b : 0;
    // Pore pressure: phreatic capped at the ground surface (seepage face)
    // unless water is standing above the slice.
    const head = pond > yt ? pond : Math.min(phr, yt);
    const u = Math.max(0, head - yb) * GAMMA_W;
    const base = model.materialAt(x, yb + 1e-3);
    const sinA = (x - xc) / R;
    const cosA = (yc - yb) / R;
    slices.push({ x, b, yb, yt, W, Wp, u, mat: base, sinA, cosA });
  }
  return { slices, xa, xb };
}

// Bishop simplified factor for a sliced circle.
function bishop(circ, model, xc, yc, R, fac, drainage, loadFac) {
  const sl = circ.slices;
  const P = sl.map(() => 0);
  model.strips.forEach((s) => sl.forEach((c, i) => {
    const ov = Math.max(0, Math.min(c.x + c.b / 2, s.x1) - Math.max(c.x - c.b / 2, s.x0));
    P[i] += s.q * ov * (s.variable ? loadFac.gQ : loadFac.gG);
  }));
  let Mh = 0;
  model.points.forEach((p) => {
    const g = p.variable ? loadFac.gQ : loadFac.gG;
    const i = sl.findIndex((c) => Math.abs(p.x - c.x) <= c.b / 2 + 1e-9);
    if (i >= 0) P[i] += (p.Fy || 0) * g;
    if (p.x >= circ.xa && p.x <= circ.xb) Mh += (p.Fx || 0) * g * (p.y - yc);
  });
  // Ponded water is carried as weight on the slices, so the hydrostatic
  // thrust on the free body's vertical water boundary at each arc end must
  // be added (acting into the body).
  [[circ.xa, 1], [circ.xb, -1]].forEach(([x, dir]) => {
    const yg = surfaceY(model.surface, x);
    const hw = model.pondLevel(x) - yg;
    if (hw > 1e-6) Mh += dir * 0.5 * GAMMA_W * hw * hw * (yg + hw / 3 - yc);
  });
  // Direction of movement: sign of the gravity moment about the centre.
  let Mg = 0;
  sl.forEach((c, i) => { Mg += (c.W + c.Wp + P[i]) * (c.x - xc); });
  const s = Mg >= 0 ? 1 : -1;
  const Md = s * (Mg + Mh);
  if (Md <= 1e-6) return { F: Infinity };
  let F = 1.2;
  let minMa = Infinity;
  for (let it = 0; it < 60; it++) {
    let Mr = 0;
    minMa = Infinity;
    sl.forEach((c, i) => {
      const st = strength(c.mat, fac, drainage);
      const sinA = s * c.sinA;
      const Wt = c.W + c.Wp + P[i];
      if (st.undrained) {
        const ma = c.cosA;
        minMa = Math.min(minMa, ma);
        Mr += (st.c * c.b) / ma;
      } else {
        const ma = c.cosA + (sinA * st.tanPhi) / F;
        minMa = Math.min(minMa, ma);
        Mr += (st.c * c.b + Math.max(0, Wt - c.u * c.b) * st.tanPhi) / ma;
      }
    });
    const Fn = (R * Mr) / Md;
    if (Math.abs(Fn - F) < 0.001) { F = Fn; break; }
    F = Fn;
  }
  return { F, minMa };
}

// Grid search with two refinement passes. Returns the critical circle and
// the minimum factors for each requested variant (evaluated on the same
// circles, e.g. factored ODF and unity FoS).
export function searchCircles(model, variants, { nx = 13, ny = 10, nr = 12, nSlices = 30, filter, onProgress } = {}) {
  const H = model.heightScale || 10;
  const [xa, xb] = model.searchX || model.xRange;
  const yTop = model.yTop ?? Math.max(...model.surface.map((p) => p[1]));
  const best = variants.map(() => ({ F: Infinity, circle: null }));
  let evaluated = 0, discarded = 0;
  const evalCircle = (xc, yc, R) => {
    const circ = sliceCircle(model, xc, yc, R, nSlices);
    if (!circ || circ.slices.length < 5) return;
    if (filter && !filter(circ, { xc, yc, R })) return;
    evaluated++;
    variants.forEach((v, i) => {
      const r = bishop(circ, model, xc, yc, R, v.fac, v.drainage, v.loadFac);
      if (!Number.isFinite(r.F)) return;
      if (r.minMa < 0.2) { discarded++; return; }
      if (r.F < best[i].F) best[i] = { F: r.F, circle: { xc, yc, R, xa: circ.xa, xb: circ.xb } };
    });
  };
  const grid = (x0, x1, y0, y1, gx, gy) => {
    for (let i = 0; i < gx; i++) {
      const xc = x0 + ((x1 - x0) * i) / Math.max(gx - 1, 1);
      for (let j = 0; j < gy; j++) {
        const yc = y0 + ((y1 - y0) * j) / Math.max(gy - 1, 1);
        const ys = surfaceY(model.surface, xc);
        const rMin = Math.max(0.5, yc - ys + 0.2);
        const rMax = yc - model.bottom;
        for (let k = 0; k < nr; k++) evalCircle(xc, yc, rMin + ((rMax - rMin) * (k + 0.5)) / nr);
      }
    }
  };
  grid(xa, xb, yTop + 0.2 * H, yTop + 2.5 * H, nx, ny);
  if (onProgress) onProgress(0.5);
  for (let pass = 0; pass < 2; pass++) {
    best.forEach((b) => {
      if (!b.circle) return;
      const { xc, yc } = b.circle;
      const sx = ((xb - xa) / nx) / (pass + 1), sy = ((2.3 * H) / ny) / (pass + 1);
      grid(xc - sx, xc + sx, Math.max(yTop + 0.05 * H, yc - sy), yc + sy, 7, 7);
    });
  }
  if (onProgress) onProgress(1);
  return { best, evaluated, discarded };
}

// --- Model builder for one abutment end -------------------------------------------

export function buildEndSlopeModel(state, geom, sitName) {
  const X = state.crossing;
  const endNo = geom.endIdx + 1;
  const sL = endNo === 1 ? -1 : 1; // landward direction in chainage
  const ch = (u) => geom.frontChainage + sL * u;
  const prof = [...(X.profile || [])].sort((a, b) => a.ch - b.ch).map((p) => [Number(p.ch), Number(p.level)]);
  const exist = (x) => surfaceY(prof, x);
  const z2l = (z) => z + geom.z0Level;
  const courses = geom.courses.filter((c) => !c.temporary);
  const rearU = Math.max(...courses.map((c) => c.u1), geom.pad.u1);
  const rearCh = ch(rearU);
  const FRL = z2l(geom.zFill);

  // Top surface: abutment top where present, approach fill landward of the rear.
  const surf = (x) => {
    const u = (x - geom.frontChainage) * sL;
    let y = exist(x);
    const c = courses.filter((k) => u >= k.u0 - 1e-9 && u <= k.u1 + 1e-9);
    if (c.length) y = Math.max(y, z2l(Math.max(...c.map((k) => k.z1))));
    if (u > rearU - 1e-9) y = Math.max(y, FRL);
    else if (u > (geom.courses[0]?.u0 ?? 0) && c.length) y = Math.max(y, Math.min(FRL, z2l(Math.max(...c.map((k) => k.z1)))));
    return y;
  };
  const xs = new Set(prof.map((p) => p[0]));
  courses.forEach((c) => { xs.add(ch(c.u0)); xs.add(ch(c.u1)); xs.add(ch(c.u0) + sL * 0.001); xs.add(ch(c.u1) - sL * 0.001); });
  xs.add(rearCh + sL * 0.001);
  const xsArr = [...xs].sort((a, b) => a - b);
  const surface = xsArr.map((x) => [x, surf(x)]);

  const mats = {};
  const layerMat = (l) => {
    const id = `L:${l.desc || l.cls}:${l.topLevel}`;
    if (!mats[id]) {
      const coh = l.cls === 'Cohesive';
      mats[id] = { id, name: l.desc || l.cls, gamma: Number(l.gamma), gammaSat: Number(l.gammaSat || l.gamma + 1), c: Number(l.c || 0), phi: Number(l.phi || (coh ? 25 : 30)), cu: coh ? Number(l.cu) : null, undrained: coh && Number.isFinite(Number(l.cu)) };
    }
    return mats[id];
  };
  const fillMat = mats.fill = { id: 'fill', name: 'Approach fill', gamma: geom.fill.gamma, gammaSat: geom.fill.gammaSat, c: 0, phi: geom.fill.phi };
  const blockMat = mats.block = { id: 'block', name: 'Legato blocks / pad (treated as rigid, strong)', gamma: 23.05, gammaSat: 23.05, c: 1000, phi: 45 };
  const materialAt = (x, y) => {
    const u = (x - geom.frontChainage) * sL;
    const z = y - geom.z0Level;
    if (z >= -geom.pad.t && z <= 0 && u >= geom.pad.u0 && u <= geom.pad.u1 && geom.pad.t > 0) return blockMat;
    if (courses.some((c) => u >= c.u0 && u <= c.u1 && z >= c.z0 && z <= c.z1)) return blockMat;
    if (y > exist(x) + 1e-6) return fillMat;
    const layers = geom.layers;
    if (!layers.length) return fillMat;
    const l = layers.find((k) => y <= k.topLevel + 1e-9 && y > k.baseLevel - 1e-9)
      || (y > layers[0].topLevel ? layers[0] : layers[layers.length - 1]);
    return layerMat(l);
  };

  // Water.
  const NWL = X.NWL, DFL = X.DFL;
  const crest = state.ends[geom.endIdx].bankCrest;
  const pa = geom.water.phreaticAbutLevel;
  const pe = geom.water.phreaticEdgeLevel;
  let channelLevel = NWL, bankAbut = pa, bankEdge = pe;
  if (sitName === 'flood') { channelLevel = DFL; bankAbut = Math.max(pa, DFL); bankEdge = DFL; }
  if (sitName === 'drawdown') { channelLevel = NWL; bankAbut = Math.max(pa, DFL); bankEdge = Math.max(pe, DFL); }
  const edgeCh = waterEdge(prof, channelLevel, geom.frontChainage, sL);
  const phreatic = (x) => {
    const d = (x - edgeCh) * sL; // + landward of the water's edge
    if (d <= 0) return channelLevel;
    const dA = (geom.frontChainage - edgeCh) * sL;
    if (dA <= 0) return bankAbut;
    return d >= dA ? bankAbut : bankEdge + ((bankAbut - bankEdge) * d) / dA;
  };
  const pondLevel = (x) => ((x - edgeCh) * sL <= 0 ? channelLevel : -Infinity);

  // Loads.
  const strips = [];
  const points = [];
  const q = state.loads.surcharge || 0;
  if (sitName !== 'construction' && q > 0) {
    const a = rearCh + sL * (state.loads.surchargeSetback || 0), b = rearCh + sL * 30;
    strips.push({ x0: Math.min(a, b), x1: Math.max(a, b), q, variable: true, label: 'Approach surcharge' });
  }
  if (sitName === 'construction' && state.loads.plant.on && crest?.ch !== null && crest?.ch !== undefined) {
    const a = Number(crest.ch) + sL * state.loads.plant.offset, b = a + sL * state.loads.plant.width;
    strips.push({ x0: Math.min(a, b), x1: Math.max(a, b), q: state.loads.plant.pressure, variable: true, label: 'Plant track' });
  }
  if (sitName !== 'construction') {
    const bx = ch(geom.bearing.u);
    let G = 0, Q = 0, Hx = 0;
    geom.bridgeItems.forEach((it) => {
      if (it.group === 'G' || it.group === 'G2') G += it.Fz;
      if (it.group === 'Qv' && it.model === (state.loads.trafficModels[0]?.name || '')) Q += it.Fz;
      if (it.group === 'Qb' && it.model === (state.loads.trafficModels[0]?.name || '')) Hx += Math.abs(it.Fu);
    });
    const Lm = geom.L;
    points.push({ x: bx, y: z2l(geom.bearing.zH), Fx: 0, Fy: G / Lm, variable: false, label: 'Bridge G (per m)' });
    if (Q) points.push({ x: bx, y: z2l(geom.bearing.zH), Fx: 0, Fy: Q / Lm, variable: true, label: 'Traffic (per m)' });
    if (Hx) points.push({ x: bx, y: z2l(geom.bearing.zH), Fx: (-sL * Hx) / Lm, Fy: 0, variable: true, label: 'Braking towards channel (per m)' });
  }

  const bottom = Math.min(...geom.layers.map((l) => l.baseLevel), geom.formationLevel - 6);
  const crestLevel = crest?.level ?? Math.max(...prof.map((p) => p[1]));
  const toe = state.ends[geom.endIdx].bankToe;
  const toeLevel = toe?.level ?? X.bedLevel;
  const heightScale = Math.max(2, FRL - Math.min(toeLevel, X.bedLevel));
  const xMin = Math.min(...prof.map((p) => p[0])), xMax = Math.max(...prof.map((p) => p[0]));
  // Search window: from the channel centre to 2H landward of the abutment rear.
  const other = state.ends[1 - geom.endIdx]?.bankToe?.ch;
  const channelMid = Number.isFinite(Number(toe?.ch)) && Number.isFinite(Number(other)) ? (Number(toe.ch) + Number(other)) / 2 : edgeCh - sL * 2;
  const land = geom.frontChainage + sL * (rearU + 2 * heightScale);
  const xr = [Math.max(xMin, Math.min(channelMid, land)), Math.min(xMax, Math.max(channelMid, land))];
  return {
    surface, materialAt, phreatic, pondLevel, strips, points, bottom, heightScale,
    xRange: [xMin, xMax], searchX: [Math.min(xr[0], xr[1]), Math.max(xr[0], xr[1])],
    yTop: Math.max(FRL, crestLevel), mats, exist, prof, sL, edgeCh, channelLevel, footprint: [ch(geom.pad.u0), ch(rearU)].sort((a, b) => a - b),
  };
}

function waterEdge(prof, level, from, sL) {
  // Walk from the abutment towards the channel until the profile drops below the level.
  const pts = sL < 0 ? [...prof] : [...prof].reverse();
  let prev = null;
  for (const p of pts) {
    if ((p[0] - from) * sL > 1e-9) { prev = p; continue; }
    if (prev && prev[1] >= level && p[1] < level) {
      const t = (prev[1] - level) / (prev[1] - p[1]);
      return prev[0] + (p[0] - prev[0]) * t;
    }
    if (p[1] < level && !prev) return p[0];
    prev = p;
  }
  return from - sL * 1;
}

export const SLOPE_CASES = [
  { key: 'normal', label: 'Normal water level' },
  { key: 'flood', label: 'Design flood' },
  { key: 'drawdown', label: 'Rapid drawdown (drained, phreatic at DFL in the bank; undrained drawdown not implemented)' },
  { key: 'construction', label: 'Construction — no deck, plant surcharge on bank' },
];

// One E5 case for one end: DA1-C2 ODF (M2 on soil, A2 on loads) and the
// legacy unity FoS on the same circles; undrained too if any stratum is cohesive.
export function runSlopeCase(state, geom, F, cs) {
  const C2 = F.C2, M2 = F[C2.M] || F.M2;
  const variants = [
    { key: 'ODF', fac: M2, loadFac: { gG: C2.gGsup, gQ: C2.gQo }, drainage: 'drained' },
    { key: 'FoS', fac: { gC: 1, gPhi: 1, gCu: 1 }, loadFac: { gG: 1, gQ: 1 }, drainage: 'drained' },
    { key: 'ODFu', fac: M2, loadFac: { gG: C2.gGsup, gQ: C2.gQo }, drainage: 'undrained' },
    { key: 'FoSu', fac: { gC: 1, gPhi: 1, gCu: 1 }, loadFac: { gG: 1, gQ: 1 }, drainage: 'undrained' },
  ];
  const cohesive = geom.layers.some((l) => l.cls === 'Cohesive' && Number.isFinite(Number(l.cu)));
  const model = buildEndSlopeModel(state, geom, cs.key);
  const vs = cohesive ? variants : variants.slice(0, 2);
  const all = searchCircles(model, vs);
  const involve = searchCircles(model, vs.slice(0, 1), { nx: 10, ny: 8, nr: 10, filter: (circ) => circ.xb >= model.footprint[0] && circ.xa <= model.footprint[1] });
  const r = { key: cs.key, label: cs.label, ODF: all.best[0].F, circle: all.best[0].circle, FoS: all.best[1].F, circleFoS: all.best[1].circle, evaluated: all.evaluated, discarded: all.discarded, ODFabut: involve.best[0].F, circleAbut: involve.best[0].circle };
  if (cohesive) { r.ODFu = all.best[2].F; r.FoSu = all.best[3].F; r.circleU = all.best[2].circle; }
  // Verdict on circles that pass through or under the abutment; the global
  // minimum (often a shallow bank-face slip) is reported as bankODF.
  r.bankODF = r.ODF;
  r.governingODF = Math.min(Number.isFinite(r.ODFabut) ? r.ODFabut : r.ODF, cohesive ? r.ODFu : Infinity);
  if (!Number.isFinite(r.governingODF)) r.governingODF = 99;
  return r;
}

export function runEndSlope(state, geom, F) {
  return SLOPE_CASES.map((cs) => runSlopeCase(state, geom, F, cs));
}

// Geometry/material export for Slope/W or LimitState GEO.
export function slopeExport(state, geom) {
  const model = buildEndSlopeModel(state, geom, 'normal');
  const courses = geom.courses.filter((c) => !c.temporary);
  const sL = model.sL;
  const ch = (u) => geom.frontChainage + sL * u;
  const polys = courses.map((c) => ({ name: `Course ${c.idx}`, material: 'block', points: [[ch(c.u0), c.z0 + geom.z0Level], [ch(c.u1), c.z0 + geom.z0Level], [ch(c.u1), c.z1 + geom.z0Level], [ch(c.u0), c.z1 + geom.z0Level]] }));
  if (geom.pad.t > 0) polys.push({ name: 'Pad', material: 'block', points: [[ch(geom.pad.u0), geom.formationLevel], [ch(geom.pad.u1), geom.formationLevel], [ch(geom.pad.u1), geom.z0Level], [ch(geom.pad.u0), geom.z0Level]] });
  const strata = geom.layers.map((l) => ({ name: l.desc || l.cls, topLevel: l.topLevel, baseLevel: l.baseLevel, gamma: l.gamma, gammaSat: l.gammaSat, c: l.c || 0, phi: l.phi, cu: l.cu }));
  const phreatic = model.surface.map(([x]) => [x, model.phreatic(x)]).filter((p) => Number.isFinite(p[1]));
  const json = { end: geom.endIdx + 1, units: { length: 'm', level: 'mAOD', stress: 'kPa', unitWeight: 'kN/m3' }, surface: model.surface, existingGround: model.prof, strata, abutment: polys, fill: { gamma: geom.fill.gamma, gammaSat: geom.fill.gammaSat, phi: geom.fill.phi, c: 0 }, phreatic, strips: model.strips, pointLoads: model.points, note: 'Point loads per metre run. Abutment modelled as a strong material. Verify all data before use.' };
  const csvRows = [];
  model.surface.forEach(([x, y]) => csvRows.push({ type: 'surface', x, y }));
  phreatic.forEach(([x, y]) => csvRows.push({ type: 'phreatic', x, y }));
  polys.forEach((p) => p.points.forEach(([x, y]) => csvRows.push({ type: p.name, x, y })));
  return { json, csvRows };
}

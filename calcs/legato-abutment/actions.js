// actions.js — axes, bridge reactions, earth/water/hydraulic actions,
// free bodies above a cut, design situations and partial-factor application.
//
// Abutment axes: u normal to the face, +landward, from the front face of the
// bottom course; v along the face; z up from the underside of the bottom
// course. Vertical forces Fz are positive DOWNWARD (weights, reactions).

import { KaRankine, KaCoulomb, K0Jaky, KpRankine, GAMMA_W, rad } from '../../js/geo-core.js';

// --- Axis rotation ---------------------------------------------------------
// Bridge axes: X longitudinal (+ End 1 → End 2), Y transverse. At End 2
// landward is +X; at End 1 landward is −X, so both components flip there
// (a 180° rotation — keeps the frame right-handed and +u landward).
export function rotateToAbutment(FX, FY, skewDeg, endNo) {
  const t = rad(skewDeg || 0);
  const Fu = FX * Math.cos(t) + FY * Math.sin(t);
  const Fv = -FX * Math.sin(t) + FY * Math.cos(t);
  const s = endNo === 1 ? -1 : 1;
  return { Fu: s * Fu, Fv: s * Fv };
}

// --- Bridge reactions resolved to one abutment -----------------------------

export function resolveBridgeLoads(state, endNo, geom) {
  const P = state.project;
  const items = [];
  // fixedEnd 0 = both abutments fixed (e.g. SSVB / BCB): no sliding end.
  const fixed = Number(P.fixedEnd) === 0 || Number(P.fixedEnd) === endNo;
  const nb = Math.max(1, Number(P.bearingsPerEnd) || 1);
  const rows = (state.loads.reactions || []).filter((r) => r.end === 'Both' || r.end === `End ${endNo}` || r.end === endNo);
  const bearing = geom.bearing;
  let GZ = 0;
  const QvByModel = {};
  rows.forEach((r) => {
    const m = r.basis === 'perBearing' ? nb : 1;
    const X = (Number(r.X) || 0) * m * (r.xFixedOnly && !fixed ? 0 : 1);
    const Y = (Number(r.Y) || 0) * m;
    const Z = (Number(r.Z) || 0) * m;
    const { Fu, Fv } = rotateToAbutment(X, Y, P.skew, endNo);
    const tag = r.group === 'G' || r.group === 'G2' ? 'G' : r.group === 'A' ? 'A' : 'Q';
    const base = { tag, group: r.group, model: r.model || '', src: 'bridge', label: r.name, reversible: !!r.reversible, psi0: num(r.psi0, 1), psi1: num(r.psi1, 1), psi2: num(r.psi2, 1), perBearingBasis: r.basis === 'perBearing' };
    if (Z) items.push({ ...base, Fz: Z, Fu: 0, Fv: 0, u: bearing.u, v: bearing.v, z: bearing.zSeat, component: 'Z' });
    if (Fu || Fv) items.push({ ...base, Fz: 0, Fu, Fv, u: bearing.u, v: bearing.v, z: bearing.zH, component: 'H' });
    if (r.group === 'G' || r.group === 'G2') GZ += Z;
    if (r.group === 'Qv') QvByModel[r.model || ''] = (QvByModel[r.model || ''] || 0) + Z;
  });
  // Free end: sliding bearing friction ±μ(G + concurrent vertical traffic).
  if (!fixed && Number(P.slidingMu) > 0) {
    const mu = Number(P.slidingMu);
    const { Fu, Fv } = rotateToAbutment(mu * GZ, 0, P.skew, endNo);
    if (GZ) items.push({ tag: 'G', group: 'Gf', model: '', src: 'bridge', label: `Free-bearing friction μ·G (μ = ${mu})`, reversible: true, psi0: 1, psi1: 1, psi2: 1, Fz: 0, Fu, Fv, u: bearing.u, v: bearing.v, z: bearing.zH, component: 'H' });
    Object.entries(QvByModel).forEach(([model, Z]) => {
      const r2 = rotateToAbutment(mu * Z, 0, P.skew, endNo);
      const src = rows.find((r) => r.group === 'Qv' && (r.model || '') === model);
      items.push({ tag: 'Q', group: 'Qf', model, src: 'bridge', label: `Free-bearing friction μ·Qv (${model || 'traffic'})`, reversible: true, psi0: num(src?.psi0, 0.75), psi1: num(src?.psi1, 0.75), psi2: num(src?.psi2, 0), Fz: 0, Fu: r2.Fu, Fv: r2.Fv, u: bearing.u, v: bearing.v, z: bearing.zH, component: 'H' });
    });
  }
  return items;
}

function num(v, d) { return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v); }

// --- Lateral pressure integration -----------------------------------------
// Integrates a pressure function p(z) (kPa) from z0 to z1 over length L.
// Returns resultant (kN) and its height.
function integrate(p, z0, z1, L, n = 160) {
  if (z1 <= z0) return { F: 0, z: z0 };
  const h = (z1 - z0) / n;
  let F = 0, M = 0;
  for (let i = 0; i <= n; i++) {
    const z = z0 + i * h;
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    const v = p(z);
    F += w * v;
    M += w * v * z;
  }
  F *= h / 3;
  M *= h / 3;
  return { F: F * L, z: F > 1e-12 ? M / F : (z0 + z1) / 2 };
}

export function earthCoefficient(method, phi, deltaRatio = 2 / 3, beta = 0) {
  if (method === 'K0') return { K: K0Jaky(phi), Kh: K0Jaky(phi), delta: 0, label: 'K0 = 1 − sin φ′' };
  if (method === 'Coulomb') {
    const delta = deltaRatio * phi;
    const K = KaCoulomb(phi, delta, beta);
    return { K, Kh: K * Math.cos(rad(delta)), delta, label: `Ka Coulomb (δ = ${delta.toFixed(1)}°, β = ${beta}°)` };
  }
  const K = KaRankine(phi);
  return { K, Kh: K, delta: 0, label: 'Ka Rankine (δ = 0)' };
}

// --- Free body above a cut --------------------------------------------------
// cut.kind: 'formation' (underside of pad), 'base' (underside of course 1),
// 'interface' (top of course k, body = courses k+1..n).
// opts: { phiFill (design φ′ of backfill), sit (situation), part: [ua, ub] }.
export function freeBody(geom, cut, opts) {
  const { sit, phiFill } = opts;
  const items = [];
  const part = opts.part || null;
  const inPart = (u) => !part || (u >= part[0] - 1e-9 && u <= part[1] + 1e-9);
  const L = geom.L;
  const courses = geom.courses.filter((c) => (sit.temporary || !c.temporary) && c.idx !== opts.excludeCourse);
  const bodyCourses = cut.kind === 'interface' ? courses.filter((c) => c.idx > cut.k) : courses;
  const zCut = cut.kind === 'formation' ? -geom.pad.t : cut.kind === 'base' ? 0 : geom.courses[cut.k - 1].z1;
  const top = bodyCourses[bodyCourses.length - 1];
  // earthTop: stop lateral pressure (and fill on steps) at this z while the
  // overburden above still counts in σ′v — used for sub-stack checks.
  const earthTop = opts.earthTop ?? Infinity;

  // Self-weight of blocks (per block when tiled, so parts can be split).
  bodyCourses.forEach((c) => {
    if (c.pieces && c.pieces.length && geom.basis !== 'gross') {
      c.pieces.forEach((p) => {
        if (!inPart(p.uc)) return;
        items.push({ tag: 'G', src: 'block', label: `Course ${c.idx} blocks`, course: c.idx, Fz: p.weight, Fu: 0, Fv: 0, u: p.uc, v: p.vc, z: (c.z0 + c.z1) / 2 });
      });
    } else {
      const a = part ? Math.max(part[0], c.u0) : c.u0;
      const b = part ? Math.min(part[1], c.u1) : c.u1;
      if (b <= a) return;
      const frac = (b - a) / (c.u1 - c.u0);
      items.push({ tag: 'G', src: 'block', label: `Course ${c.idx}`, course: c.idx, Fz: c.weight * frac, Fu: 0, Fv: 0, u: part ? (a + b) / 2 : c.uc, v: c.vc, z: (c.z0 + c.z1) / 2 });
    }
  });
  if (cut.kind === 'formation' && geom.pad.t > 0) {
    const pd = geom.pad;
    items.push({ tag: 'G', src: 'pad', label: `Pad (${pd.material})`, Fz: (pd.u1 - pd.u0) * (pd.v1 - pd.v0) * pd.t * pd.gamma, Fu: 0, Fv: 0, u: (pd.u0 + pd.u1) / 2, v: L / 2, z: -pd.t / 2 });
  }

  // Virtual back and fill on steps / heel.
  const structRear = Math.max(...bodyCourses.map((c) => c.u1), cut.kind === 'formation' && geom.pad.t > 0 ? geom.pad.u1 : -Infinity);
  const uBack = part ? Math.min(part[1], structRear) : structRear;
  const includesBack = !part || part[1] >= structRear - 1e-9;
  const zFill = geom.zFill;
  const wlB = sit.water?.back ?? -Infinity;
  const wlF = sit.water?.front ?? -Infinity;
  const fill = geom.fill;
  const bands = [];
  bodyCourses.forEach((c) => bands.push({ z0: Math.max(c.z0, zCut), z1: Math.min(c.z1, zFill, earthTop), uFrom: c.u1 }));
  if (top && Math.min(zFill, earthTop) > top.z1) bands.push({ z0: top.z1, z1: Math.min(zFill, earthTop), uFrom: top.u0, overTop: true });
  bands.forEach((b) => {
    if (b.z1 <= b.z0) return;
    const ua = part ? Math.max(part[0], b.uFrom) : b.uFrom;
    const w = uBack - ua;
    if (w <= 1e-9) return;
    const dry = Math.max(0, b.z1 - Math.max(b.z0, wlB));
    const wet = (b.z1 - b.z0) - dry;
    const W = w * L * (dry * fill.gamma + wet * fill.gammaSat);
    items.push({ tag: 'G', src: 'fill', label: b.overTop ? 'Fill over top course' : 'Fill on step / heel', Fz: W, Fu: 0, Fv: 0, u: ua + w / 2, v: L / 2, z: (b.z0 + b.z1) / 2 });
  });

  // Earth pressure on the virtual back.
  if (includesBack && zFill > zCut) {
    const { Kh, K, delta } = earthCoefficient(geom.epMethod, phiFill, geom.coulombDeltaRatio, geom.backfillSlope);
    const sv = (z) => {
      const d = zFill - z;
      const dry = Math.max(0, zFill - Math.max(z, wlB));
      const wet = d - dry;
      return dry * fill.gamma + wet * (fill.gammaSat - GAMMA_W);
    };
    const comp = geom.compaction;
    const soilP = (z) => Kh * sv(z);
    const zE = Math.min(zFill, earthTop);
    const s = integrate(soilP, zCut, zE, L);
    const tanD = Math.tan(rad(delta));
    items.push({ tag: 'G', src: 'earth', label: `Earth pressure (K = ${Kh.toFixed(4)})`, Fz: s.F * tanD, Fu: -s.F, Fv: 0, u: uBack, v: L / 2, z: s.z, K: Kh, Kfull: K, height: zFill - zCut });
    if (comp && comp.on) {
      const extra = (z) => Math.max(0, Math.max(soilP(z), comp.sigma * Math.min(1, (zFill - z) / comp.zc)) - soilP(z));
      const c = integrate(extra, zCut, zE, L);
      if (c.F > 1e-6) items.push({ tag: 'G', src: 'compaction', label: 'Compaction pressure (excess over active)', Fz: 0, Fu: -c.F, Fv: 0, u: uBack, v: L / 2, z: c.z });
    }
    const q = sit.q || 0;
    if (q > 0) {
      const zStart = zFill - (geom.surchargeSetback || 0) * Math.tan(rad(45 + phiFill / 2));
      const sp = integrate((z) => (z <= zStart ? Kh * q : 0), zCut, zE, L);
      if (sp.F > 1e-9) items.push({ tag: 'Q', src: 'surcharge', group: 'Qs', model: sit.qModel || '', label: `Surcharge q = ${q} kPa`, Fz: sp.F * tanD, Fu: -sp.F, Fv: 0, u: uBack, v: L / 2, z: sp.z });
    }
  }

  // Water: back face, front face, uplift at the cut.
  const zTopBody = top ? top.z1 : zCut;
  if (includesBack && wlB > zCut) {
    const w = Math.min(wlB, Math.max(zFill, zTopBody));
    const F = 0.5 * GAMMA_W * (w - zCut) ** 2 * L;
    items.push({ tag: 'W', src: 'water', label: 'Water pressure behind', Fz: 0, Fu: -F, Fv: 0, u: uBack, v: L / 2, z: zCut + (w - zCut) / 3 });
  }
  // Water standing on exposed (front) top surfaces of the body.
  if (wlF > zCut) {
    const strips = [];
    bodyCourses.forEach((c, i) => {
      const nx = bodyCourses[i + 1];
      strips.push({ u0: c.u0, u1: nx ? nx.u0 : c.u1, z: c.z1 });
    });
    if (cut.kind === 'formation' && geom.pad.t > 0) strips.push({ u0: geom.pad.u0, u1: geom.courses[0].u0, z: 0 });
    strips.forEach((st) => {
      const a = part ? Math.max(part[0], st.u0) : st.u0;
      const b = part ? Math.min(part[1], st.u1) : st.u1;
      if (b - a > 1e-9 && wlF > st.z) items.push({ tag: 'W', src: 'water', label: 'Water on exposed top surface', Fz: GAMMA_W * (wlF - st.z) * (b - a) * L, Fu: 0, Fv: 0, u: (a + b) / 2, v: L / 2, z: st.z });
    });
  }
  const frontU = part ? part[0] : (cut.kind === 'formation' && geom.pad.t > 0 ? geom.pad.u0 : (cut.kind === 'interface' ? bodyCourses[0]?.u0 : geom.courses[0].u0));
  const isFront = !part || part[0] <= (cut.kind === 'interface' ? bodyCourses[0]?.u0 ?? 0 : frontU) + 1e-9;
  if (isFront && wlF > zCut) {
    const F = 0.5 * GAMMA_W * (wlF - zCut) ** 2 * L;
    items.push({ tag: 'W', src: 'water', label: 'Water pressure in front', Fz: 0, Fu: F, Fv: 0, u: frontU, v: L / 2, z: zCut + (wlF - zCut) / 3 });
  }
  if (wlB > zCut || wlF > zCut) {
    // Uplift over the contact width of the cut, linear front→back.
    let a, b;
    if (cut.kind === 'interface') {
      const lower = geom.courses[cut.k - 1];
      const upper = geom.courses[cut.k];
      a = Math.max(lower.u0, upper.u0); b = Math.min(lower.u1, upper.u1);
    } else if (cut.kind === 'formation' && geom.pad.t > 0) { a = geom.pad.u0; b = geom.pad.u1; }
    else { a = geom.courses[0].u0; b = geom.courses[0].u1; }
    if (part) { a = Math.max(a, part[0]); b = Math.min(b, part[1]); }
    const pf = GAMMA_W * Math.max(0, wlF - zCut);
    const pb = GAMMA_W * Math.max(0, (includesBack ? wlB : Math.max(wlB, wlF)) - zCut);
    if (b > a) {
      const F = 0.5 * (pf + pb) * (b - a) * L;
      const uc = pf + pb > 0 ? a + ((b - a) * (pf + 2 * pb)) / (3 * (pf + pb)) : (a + b) / 2;
      if (F > 1e-9) items.push({ tag: 'W', src: 'uplift', label: 'Uplift (pore pressure at cut)', Fz: -F, Fu: 0, Fv: 0, u: uc, v: L / 2, z: zCut });
    }
  }

  // Passive resistance in front (only if enabled, only at the base cuts).
  if (geom.passive && geom.passive.on && cut.kind !== 'interface' && !part) {
    const zg = geom.passive.zGuaranteed;
    if (zg > zCut) {
      const Kp = KpRankine(opts.phiFront ?? geom.passive.phi) * geom.passive.mob;
      const gF = geom.passive.gamma;
      const p = (z) => {
        const dry = Math.max(0, zg - Math.max(z, wlF));
        const wet = (zg - z) - dry;
        return Kp * (dry * gF + wet * (gF + 1 - GAMMA_W));
      };
      const r = integrate(p, zCut, zg, L);
      items.push({ tag: 'G', src: 'passive', label: `Passive (Kp × ${geom.passive.mob})`, Fz: 0, Fu: r.F, Fv: 0, u: frontU, v: L / 2, z: r.z });
    }
  }

  // Bridge reactions: only on bodies that include the seat course.
  const seatIdx = geom.seatIdx;
  const bridgeOn = sit.deck && (cut.kind !== 'interface' || (seatIdx && seatIdx > cut.k));
  const seatBody = cut.kind !== 'interface' || (seatIdx && seatIdx > cut.k);
  if (bridgeOn) {
    geom.bridgeItems.forEach((it) => { if (inPart(it.u) && it.group !== 'Con') items.push({ ...it }); });
  } else if (sit.launch && seatBody) {
    geom.bridgeItems.forEach((it) => { if (inPart(it.u) && it.group === 'Con') items.push({ ...it }); });
  }
  // Launch / construction point loads.
  if (sit.launch) {
    geom.launchItems.forEach((it) => {
      const onBody = cut.kind !== 'interface' || it.z > zCut + 1e-9;
      if (onBody && inPart(it.u)) items.push({ ...it });
    });
  }
  // Hydraulic actions (flood) and accidental impact on the part above the cut.
  const addLateral = (list) => list.forEach((it) => {
    const z0 = Math.max(it.z0, zCut);
    if (it.z1 <= z0) return;
    const frac = (it.z1 - z0) / (it.z1 - it.z0);
    if (isFront || it.dir === 'v') items.push({ ...it, Fu: it.Fu * frac, Fv: it.Fv * frac, z: (z0 + it.z1) / 2 });
  });
  if (sit.flood) addLateral(geom.hydraulicItems);
  if (sit.impact) addLateral(geom.impactItems);

  return { items, zCut, uBack, structRear };
}

// --- Partial factors ----------------------------------------------------------

// Category → partial factor set. SLS, legacy and accidental are unity.
export function categoryFactors(F, cat) {
  if (cat === 'C1' || cat === 'C2' || cat === 'EQU') return F[cat];
  return { gGsup: 1, gGinf: 1, gQt: 1, gQo: 1, M: 'M1' };
}

export function materialSet(F, cat) {
  if (cat === 'C1' || cat === 'C2' || cat === 'EQU') return F[F[cat].M] || F.M1;
  return { gPhi: 1, gC: 1, gCu: 1, gGamma: 1 };
}

// Apply factors for one check. check: 'slide' | 'topple' | 'bearing' | 'sls'.
// dir: −1 channel / +1 landward (slide, topple). pivot: {u, z} (topple).
// gMode: 'sup' | 'inf' (bearing weights).
export function factorItems(items, { F, cat, sit, check, dir = -1, pivot, gMode = 'sup', sign = 1 }) {
  const f = categoryFactors(F, cat);
  const gW = ['C1', 'C2', 'EQU'].includes(cat) ? F.gWater ?? 1 : 1;
  return items.map((it0) => {
    const it = { ...it0 };
    if (it.reversible) { it.Fu *= sign; it.Fv *= sign; }
    const mult = it.tag === 'Q' || it.tag === 'A' || it.tag === 'C' ? sit.mult(it) : 1;
    let unfav;
    if (check === 'slide') {
      if (it.src === 'passive') unfav = false;
      else if (Math.abs(it.Fu) > 1e-9 || Math.abs(it.Fv) > 1e-9) unfav = it.Fu * dir > 1e-9 || (Math.abs(it.Fu) < 1e-9 && Math.abs(it.Fv) > 1e-9);
      else unfav = it.Fz < 0;
    } else if (check === 'topple') {
      const M = dir * (it.Fu * (it.z - pivot.z) + it.Fz * (it.u - pivot.u));
      unfav = M > 1e-9;
    } else if (check === 'bearing' || check === 'sls') {
      if (it.src === 'passive') unfav = false;
      else if (Math.abs(it.Fu) > 1e-9 || Math.abs(it.Fv) > 1e-9) unfav = true;
      else unfav = gMode === 'sup';
    }
    let g;
    if (it.tag === 'W') g = gW;
    else if (it.tag === 'G') g = unfav ? f.gGsup : f.gGinf;
    else if (it.tag === 'A') g = 1;
    else {
      const gq = sit.qType(it) === 'traffic' ? f.gQt : f.gQo;
      // Favourable variable actions are omitted, except in bearing/SLS
      // where vertical traffic always acts with its own braking.
      g = unfav || check === 'bearing' || check === 'sls' ? gq : 0;
    }
    if (check === 'sls') g = 1;
    const k = g * mult;
    return { ...it, gamma: g, mult, Fz: it.Fz * k, Fu: it.Fu * k, Fv: it.Fv * k, fav: !unfav };
  }).filter((it) => Math.abs(it.Fz) + Math.abs(it.Fu) + Math.abs(it.Fv) > 1e-12);
}

export function sums(items) {
  return items.reduce((s, it) => ({ V: s.V + it.Fz, Hu: s.Hu + it.Fu, Hv: s.Hv + it.Fv }), { V: 0, Hu: 0, Hv: 0 });
}

// Resultant position on a horizontal plane at z = zb (u measured in the
// abutment frame): u_R = [Σ u·Fz + Σ (z − zb)·Fu] / V.
export function resultantU(items, zb) {
  const V = items.reduce((s, it) => s + it.Fz, 0);
  const M = items.reduce((s, it) => s + it.u * it.Fz + (it.z - zb) * it.Fu, 0);
  return { V, uR: V > 1e-9 ? M / V : NaN, M };
}

export function resultantV(items, zb) {
  const V = items.reduce((s, it) => s + it.Fz, 0);
  const M = items.reduce((s, it) => s + it.v * it.Fz + (it.z - zb) * it.Fv, 0);
  return { V, vR: V > 1e-9 ? M / V : NaN };
}

// --- Design situations ---------------------------------------------------------

export function buildSituations(state, geom) {
  const L = state.loads;
  const bridge = state.project.mode === 'bridge';
  const models = (L.trafficModels || []).filter((m) => m && m.name);
  const hasGroup = (g) => geom.bridgeItems.some((it) => it.group === g);
  const normal = models.find((m) => !m.excludeSurchargeWind) || models[0];
  const persistentWater = { back: geom.water.gwZ + (L.waterHead || 0), front: geom.water.gwZ };
  const trafficType = (it) => (['Qv', 'Qb', 'Qf', 'Qs'].includes(it.group) ? 'traffic' : 'other');
  const out = [];

  if (!bridge) {
    out.push({
      id: 'RW', label: 'Persistent — retained fill with surcharge', kind: 'persistent', deck: false, q: L.surcharge, water: persistentWater,
      mult: (it) => (it.src === 'surcharge' ? 1 : 0), qType: () => 'other',
    });
    return out;
  }

  models.forEach((m) => {
    const ex = !!m.excludeSurchargeWind;
    out.push({
      id: `S1-${m.name}`, label: `Persistent — ${m.name} leading${ex ? ' (surcharge and wind excluded)' : ''}`, kind: 'persistent', deck: true,
      q: ex ? 0 : L.surcharge, qModel: m.name, water: persistentWater, leading: m.name,
      mult: (it) => {
        if (it.src === 'surcharge') return 1;
        if (['Qv', 'Qb', 'Qf'].includes(it.group)) return it.model === m.name ? 1 : 0;
        if (it.group === 'Qw') return ex ? 0 : it.psi0;
        if (it.group === 'Qt') return it.psi0;
        return 0;
      },
      qType: trafficType,
    });
  });
  if (hasGroup('Qw')) {
    out.push({
      id: 'S2-wind', label: `Persistent — wind leading${normal ? `, ${normal.name} accompanying` : ''}`, kind: 'persistent', deck: true,
      q: L.surcharge, water: persistentWater, leading: 'wind',
      mult: (it) => {
        if (it.src === 'surcharge') return L.surchargePsi0 ?? 0.75;
        if (it.group === 'Qw') return 1;
        if (['Qv', 'Qb', 'Qf'].includes(it.group)) return normal && it.model === normal.name ? it.psi0 : 0;
        if (it.group === 'Qt') return it.psi0;
        return 0;
      },
      qType: trafficType,
    });
  }
  if (hasGroup('Qt')) {
    out.push({
      id: 'S2-thermal', label: 'Persistent — thermal leading', kind: 'persistent', deck: true,
      q: L.surcharge, water: persistentWater, leading: 'thermal',
      mult: (it) => {
        if (it.src === 'surcharge') return L.surchargePsi0 ?? 0.75;
        if (it.group === 'Qt') return 1;
        if (['Qv', 'Qb', 'Qf'].includes(it.group)) return normal && it.model === normal.name ? it.psi0 : 0;
        if (it.group === 'Qw') return it.psi0;
        return 0;
      },
      qType: trafficType,
    });
  }
  out.push({
    id: 'S3-nodeck', label: 'Transient — abutment built and backfilled, no deck', kind: 'transient', deck: false,
    q: L.surcharge, water: persistentWater, mult: (it) => (it.src === 'surcharge' ? 1 : 0), qType: () => 'other',
  });
  if ((geom.launchItems || []).length || hasGroup('Con')) {
    out.push({
      id: 'S4-launch', label: 'Transient — launch / erection loads', kind: 'transient', deck: false, launch: true, temporary: true,
      q: 0, water: persistentWater, mult: (it) => (it.group === 'Con' || it.src === 'launch' ? 1 : 0), qType: () => 'other',
    });
  }
  const floodActive = geom.water.DFLz !== null && geom.water.DFLz > -geom.pad.t;
  if (floodActive) {
    const inc = !!L.hydraulic.includeTraffic;
    const w = Math.max(geom.water.DFLz, geom.water.gwZ);
    out.push({
      id: 'S5-flood', label: `Transient — design flood (${state.crossing.DFLlabel || 'DFL'})`, kind: 'transient', deck: true, flood: true,
      q: inc ? L.surcharge : 0, water: { back: w, front: w },
      mult: (it) => {
        if (it.src === 'hydraulic') return 1;
        if (!inc) return 0;
        if (it.src === 'surcharge') return L.surchargePsi0 ?? 0.75;
        if (['Qv', 'Qb', 'Qf'].includes(it.group)) return normal && it.model === normal.name ? it.psi0 : 0;
        return 0;
      },
      qType: (it) => (it.src === 'hydraulic' ? 'other' : trafficType(it)),
    });
    if (geom.water.NWLz !== null && geom.water.DFLz > geom.water.NWLz + 1e-6) {
      out.push({
        id: 'S6-drawdown', label: 'Transient — rapid drawdown (fill saturated to DFL, river at NWL)', kind: 'transient', deck: true,
        q: 0, water: { back: geom.water.DFLz, front: Math.max(geom.water.NWLz, geom.water.gwZ) }, mult: () => 0, qType: () => 'other',
      });
    }
  }
  if (state.loads.impact.on && state.loads.impact.F > 0) {
    out.push({
      id: 'S7-impact', label: 'Accidental — vehicle impact', kind: 'accidental', deck: true, impact: true,
      q: L.surcharge, water: persistentWater,
      mult: (it) => {
        if (it.src === 'impact') return 1;
        if (it.src === 'surcharge') return normal ? 0.75 : 0;
        if (['Qv', 'Qb', 'Qf'].includes(it.group)) return normal && it.model === normal.name ? it.psi1 : 0;
        return 0;
      },
      qType: trafficType,
    });
  }
  return out;
}

// Categories that apply to a situation.
export function categoriesFor(sit) {
  if (sit.kind === 'accidental') return ['ACC'];
  return ['EQU', 'C1', 'C2', 'SLSc', 'LEG'];
}

// SLS quasi-permanent multiplier: every variable action at ψ2.
export function qpSituation(sit) {
  return { ...sit, id: `${sit.id}-qp`, label: `${sit.label} (quasi-permanent)`, mult: (it) => (it.src === 'surcharge' ? 0 : it.psi2 ?? 0) };
}

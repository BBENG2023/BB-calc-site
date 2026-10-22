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

// --- Load schedule normalisation --------------------------------------------
// Converts the reaction schedule to kN (g = 9.81 m/s²), applies the "per
// truss" basis, and makes sure every traffic row belongs to a listed model —
// a vertical traffic or braking row is never dropped silently.
export const G_ACC = 9.81;

export function normaliseLoads(state) {
  const L = state.loads;
  const unit = L.unit || 'kN';
  const k = unit.startsWith('t') ? G_ACC : 1;
  const perTruss = unit.endsWith('/truss');
  const notes = [];
  let models = (L.trafficModels || []).filter((m) => m && String(m.name ?? '').trim())
    .map((m) => ({ ...m, name: String(m.name).trim() }));
  const needsModel = (r) => r.group === 'Qv' || r.group === 'Qb';
  const known = () => new Set(models.map((m) => m.name));
  const orphan = (L.reactions || []).filter((r) => needsModel(r) && !known().has(String(r.model ?? '').trim()));
  if (orphan.length && !models.length) models = [{ name: 'Traffic', standard: '', excludeSurchargeWind: false, implicit: true }];
  const names = known();
  const reactions = (L.reactions || []).map((r) => {
    const o = { ...r, X: num(r.X, 0) * k, Y: num(r.Y, 0) * k, Z: num(r.Z, 0) * k, basis: perTruss ? 'perBearing' : r.basis };
    const m = String(r.model ?? '').trim();
    if (needsModel(r)) {
      if (names.has(m)) o.model = m;
      else {
        o.model = models[0].name;
        notes.push(`"${r.name}" (${r.group}) ${m ? `names model "${m}", which is not in the traffic model list` : 'has no traffic model'} — assigned to "${models[0].name}". Check this is intended.`);
      }
    }
    return o;
  });
  return { models, reactions, notes, unit, k, perTruss };
}

// Bearings at one end: position along the face v (m) and fixity. Blank v =
// symmetric at the bearing centres; blank fixity = from the "fixed end" input.
// Minimum clearance from the edge of a bearing plate to the edge of the seat
// block it sits on (BB requirement: plate wholly on one block, ≥ 100 mm in).
export const PLATE_EDGE_MIN = 0.1;

// Clearance of one plate (centre u, v; Lp along u, Bp along v) on the seat
// course: the largest inset of the plate within a single block, or a
// negative value when no single block carries the whole plate.
export function plateClearance(seat, u, v, Lp, Bp) {
  let best = -Infinity, piece = null;
  (seat?.pieces || []).forEach((p) => {
    const c = Math.min(u - Lp / 2 - p.u0, p.u1 - (u + Lp / 2), v - Bp / 2 - p.v0, p.v1 - (v + Bp / 2));
    if (c > best) { best = c; piece = p; }
  });
  return { clearance: best, piece };
}

// Bearings at one end. Positions follow the bearing centres, symmetric about
// the group centre; fixity from the per-bearing setting or the fixed end.
// Group centre: 'centre' = abutment centre; 'user' = centre + offset; 'auto'
// (default) = slid along the face in 50 mm steps, nearest the centre, to the
// first position where every plate is ≥ 100 mm inside one seat block.
export function endBearings(state, endIdx, L, u, seat = null) {
  const P = state.project;
  const end = state.ends[endIdx];
  const nb = Math.max(1, Number(P.bearingsPerEnd) || 1);
  const c = Number(P.bearingCentres) || 0;
  const fe = Number(P.fixedEnd);
  const defFix = fe === 0 || fe === endIdx + 1 ? 'fixed' : 'free';
  const set = end.bearings || [];
  const Lp = (Number(P.bearingPlateL) || 300) / 1000;
  const Bp = (Number(P.bearingPlateB) || 400) / 1000;
  const mode = end.bearingPlacement || 'auto';
  const offs = (k) => (k - (nb - 1) / 2) * c;
  const minClear = (vc) => Math.min(...Array.from({ length: nb }, (_, k) => plateClearance(seat, u, vc + offs(k), Lp, Bp).clearance));
  let vc = L / 2, placement = 'centre';
  if (mode === 'user') { vc = L / 2 + (Number(end.bearingOffset_mm) || 0) / 1000; placement = 'user'; }
  else if (mode === 'auto' && seat?.pieces?.length) {
    const cands = [];
    for (let d = 0; d <= 1.6 + 1e-9; d += 0.05) { cands.push(L / 2 + d); if (d) cands.push(L / 2 - d); }
    const inside = (x) => x + offs(0) - Bp / 2 >= -1e-9 && x + offs(nb - 1) + Bp / 2 <= L + 1e-9;
    const ok = cands.filter(inside);
    const hit = ok.find((x) => minClear(x) >= PLATE_EDGE_MIN - 1e-9);
    if (hit !== undefined) { vc = hit; placement = 'auto'; }
    else {
      const bestX = ok.reduce((m, x) => (m === null || minClear(x) > minClear(m) ? x : m), null);
      vc = bestX ?? L / 2; placement = 'auto-failed';
    }
  }
  const out = [];
  for (let k = 0; k < nb; k++) {
    const s0 = set[k] || {};
    const v = vc + offs(k);
    const cl = seat ? plateClearance(seat, u, v, Lp, Bp).clearance : null;
    out.push({ k, u, v, fixity: ['fixed', 'guided', 'free'].includes(s0.fixity) ? s0.fixity : defFix, autoV: placement !== 'user', placement, groupOffset: vc - L / 2, clearance: cl });
  }
  return out;
}

// True when both abutments have at least one longitudinally fixed bearing.
export function bothEndsFixed(state) {
  if (state.project.mode !== 'bridge') return false;
  return [0, 1].every((i) => endBearings(state, i, 1, 0).some((b) => b.fixity === 'fixed'));
}

// --- Bridge reactions resolved to one abutment, bearing by bearing -------------
// Z is shared equally by all bearings. Longitudinal X marked "fixed end only"
// goes to the fixed bearings at this end (none = 0 here); other X to all
// bearings. Transverse Y goes to fixed and guided bearings. Free and guided
// bearings carry ±μ(G + concurrent vertical traffic) longitudinally.
export function resolveBridgeLoads(state, endNo, geom, NL = normaliseLoads(state)) {
  const P = state.project;
  const items = [];
  const bearings = geom.bearings;
  const nb = bearings.length;
  const fixedB = bearings.filter((b) => b.fixity === 'fixed');
  const yB = bearings.filter((b) => b.fixity !== 'free');
  const rows = NL.reactions.filter((r) => r.end === 'Both' || r.end === `End ${endNo}` || r.end === endNo);
  const z = geom.bearing;
  const GZ = bearings.map(() => 0);
  const QvByModel = {};
  rows.forEach((r) => {
    const m = r.basis === 'perBearing' ? nb : 1;
    const Xt = r.X * m, Yt = r.Y * m, Zt = r.Z * m;
    const xSet = r.xFixedOnly ? fixedB : bearings;
    const ySet = yB.length ? yB : bearings;
    const tag = r.group === 'G' || r.group === 'G2' ? 'G' : r.group === 'A' ? 'A' : 'Q';
    const base = { tag, group: r.group, model: r.model || '', src: 'bridge', label: r.name, reversible: !!r.reversible, psi0: num(r.psi0, 1), psi1: num(r.psi1, 1), psi2: num(r.psi2, 1), perBearingBasis: r.basis === 'perBearing' };
    bearings.forEach((b) => {
      const Z = Zt / nb;
      const X = xSet.includes(b) ? Xt / xSet.length : 0;
      const Y = ySet.includes(b) ? Yt / ySet.length : 0;
      const { Fu, Fv } = rotateToAbutment(X, Y, P.skew, endNo);
      const at = { bearing: b.k, u: b.u, v: b.v };
      if (Z) items.push({ ...base, ...at, Fz: Z, Fu: 0, Fv: 0, z: z.zSeat, component: 'Z' });
      if (Fu || Fv) items.push({ ...base, ...at, Fz: 0, Fu, Fv, z: z.zH, component: 'H' });
      if (r.group === 'G' || r.group === 'G2') GZ[b.k] += Z;
      if (r.group === 'Qv') {
        QvByModel[r.model] = QvByModel[r.model] || { Z: bearings.map(() => 0), row: r };
        QvByModel[r.model].Z[b.k] += Z;
      }
    });
  });
  // Both ends restrained longitudinally: thermal restraint force from the
  // designer (with justification) at the fixed bearings of each end.
  const TR = state.loads.thermalRestraint || {};
  if (bothEndsFixed(state) && fixedB.length && Number.isFinite(Number(TR.F)) && TR.F !== null && TR.F !== '' && String(TR.justification || '').trim()) {
    fixedB.forEach((b) => {
      const { Fu, Fv } = rotateToAbutment(Number(TR.F) / fixedB.length, 0, P.skew, endNo);
      if (Fu || Fv) items.push({ tag: 'Q', group: 'Qt', model: '', src: 'bridge', label: 'Thermal restraint (both ends fixed)', reversible: true, psi0: 0.6, psi1: 0.6, psi2: 0.5, bearing: b.k, u: b.u, v: b.v, Fz: 0, Fu, Fv, z: z.zH, component: 'H' });
    });
  }
  const mu = Number(P.slidingMu) || 0;
  if (mu > 0) {
    bearings.filter((b) => b.fixity !== 'fixed').forEach((b) => {
      const at = { bearing: b.k, u: b.u, v: b.v, z: z.zH, component: 'H', reversible: true, src: 'bridge' };
      if (GZ[b.k]) {
        const { Fu, Fv } = rotateToAbutment(mu * GZ[b.k], 0, P.skew, endNo);
        items.push({ ...at, tag: 'G', group: 'Gf', model: '', label: `Bearing ${b.k + 1} (${b.fixity}) friction μ·G (μ = ${mu})`, psi0: 1, psi1: 1, psi2: 1, Fz: 0, Fu, Fv });
      }
      Object.entries(QvByModel).forEach(([model, q]) => {
        if (!q.Z[b.k]) return;
        const r2 = rotateToAbutment(mu * q.Z[b.k], 0, P.skew, endNo);
        items.push({ ...at, tag: 'Q', group: 'Qf', model, label: `Bearing ${b.k + 1} (${b.fixity}) friction μ·Qv (${model})`, psi0: num(q.row.psi0, 0.75), psi1: num(q.row.psi1, 0.75), psi2: num(q.row.psi2, 0), Fz: 0, Fu: r2.Fu, Fv: r2.Fv });
      });
    });
  }
  return items;
}

// Characteristic deck reaction at one end: G plus the largest vertical
// traffic model (each model acts alone), with the governing braking.
export function deckCharacteristic(geom) {
  const sum = (f) => geom.bridgeItems.filter(f).reduce((a, it) => a + it.Fz, 0);
  const G = sum((it) => it.group === 'G' || it.group === 'G2');
  let Q = 0, model = '';
  (geom.models || []).forEach((m) => { const q = sum((it) => it.group === 'Qv' && it.model === m.name); if (q > Q) { Q = q; model = m.name; } });
  const H = Math.max(0, ...(geom.models || []).map((m) => geom.bridgeItems.filter((it) => it.group === 'Qb' && it.model === m.name).reduce((a, it) => a + Math.abs(it.Fu), 0)));
  return { G, Q, V: G + Q, model, H };
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
  const vMid = geom.vMid ?? L / 2; // zone prisms are offset along the face
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
    items.push({ tag: 'G', src: 'pad', label: `Pad (${pd.material})`, Fz: (pd.u1 - pd.u0) * (pd.v1 - pd.v0) * pd.t * pd.gamma, Fu: 0, Fv: 0, u: (pd.u0 + pd.u1) / 2, v: vMid, z: -pd.t / 2 });
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
    items.push({ tag: 'G', src: 'fill', label: b.overTop ? 'Fill over top course' : 'Fill on step / heel', Fz: W, Fu: 0, Fv: 0, u: ua + w / 2, v: vMid, z: (b.z0 + b.z1) / 2 });
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
    items.push({ tag: 'G', src: 'earth', label: `Earth pressure (K = ${Kh.toFixed(4)})`, Fz: s.F * tanD, Fu: -s.F, Fv: 0, u: uBack, v: vMid, z: s.z, K: Kh, Kfull: K, height: zFill - zCut });
    if (comp && comp.on) {
      const extra = (z) => Math.max(0, Math.max(soilP(z), comp.sigma * Math.min(1, (zFill - z) / comp.zc)) - soilP(z));
      const c = integrate(extra, zCut, zE, L);
      if (c.F > 1e-6) items.push({ tag: 'G', src: 'compaction', label: 'Compaction pressure (excess over active)', Fz: 0, Fu: -c.F, Fv: 0, u: uBack, v: vMid, z: c.z });
    }
    const q = sit.q || 0;
    if (q > 0) {
      const zStart = zFill - (geom.surchargeSetback || 0) * Math.tan(rad(45 + phiFill / 2));
      const sp = integrate((z) => (z <= zStart ? Kh * q : 0), zCut, zE, L);
      if (sp.F > 1e-9) items.push({ tag: 'Q', src: 'surcharge', group: 'Qs', model: sit.qModel || '', label: `Surcharge q = ${q} kPa`, Fz: sp.F * tanD, Fu: -sp.F, Fv: 0, u: uBack, v: vMid, z: sp.z });
    }
  }

  // Water: back face, front face, uplift at the cut.
  const zTopBody = top ? top.z1 : zCut;
  if (includesBack && wlB > zCut) {
    const w = Math.min(wlB, Math.max(zFill, zTopBody));
    const F = 0.5 * GAMMA_W * (w - zCut) ** 2 * L;
    items.push({ tag: 'W', src: 'water', label: 'Water pressure behind', Fz: 0, Fu: -F, Fv: 0, u: uBack, v: vMid, z: zCut + (w - zCut) / 3 });
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
      if (b - a > 1e-9 && wlF > st.z) items.push({ tag: 'W', src: 'water', label: 'Water on exposed top surface', Fz: GAMMA_W * (wlF - st.z) * (b - a) * L, Fu: 0, Fv: 0, u: (a + b) / 2, v: vMid, z: st.z });
    });
  }
  const frontU = part ? part[0] : (cut.kind === 'formation' && geom.pad.t > 0 ? geom.pad.u0 : (cut.kind === 'interface' ? bodyCourses[0]?.u0 : geom.courses[0].u0));
  const isFront = !part || part[0] <= (cut.kind === 'interface' ? bodyCourses[0]?.u0 ?? 0 : frontU) + 1e-9;
  if (isFront && wlF > zCut) {
    const F = 0.5 * GAMMA_W * (wlF - zCut) ** 2 * L;
    items.push({ tag: 'W', src: 'water', label: 'Water pressure in front', Fz: 0, Fu: F, Fv: 0, u: frontU, v: vMid, z: zCut + (wlF - zCut) / 3 });
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
      if (F > 1e-9) items.push({ tag: 'W', src: 'uplift', label: 'Uplift (pore pressure at cut)', Fz: -F, Fu: 0, Fv: 0, u: uc, v: vMid, z: zCut });
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
      items.push({ tag: 'G', src: 'passive', label: `Passive (Kp × ${geom.passive.mob})`, Fz: 0, Fu: r.F, Fv: 0, u: frontU, v: vMid, z: r.z });
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
    let mult = it.tag === 'Q' || it.tag === 'A' || it.tag === 'C' ? sit.mult(it) : 1;
    if (mult < 0) { it.Fz = -it.Fz; it.Fu = -it.Fu; it.Fv = -it.Fv; mult = -mult; } // e.g. vertical wind uplift
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
  const models = geom.models || (L.trafficModels || []).filter((m) => m && m.name);
  const hasGroup = (g) => geom.bridgeItems.some((it) => it.group === g);
  const normal = models.find((m) => !m.excludeSurchargeWind) || models[0];
  const persistentWater = { back: geom.water.gwZ + (L.waterHead || 0), front: geom.water.gwZ };
  const trafficType = (it) => (['Qv', 'Qb', 'Qf', 'Qs'].includes(it.group) ? 'traffic' : 'other');
  const sq0 = L.surchargePsi0 ?? 0.75;
  const isTraffic = (it) => ['Qv', 'Qb', 'Qf'].includes(it.group);
  // Accompanying normal traffic at ψ (vertical, its bearing friction and braking).
  const accTraffic = (it, psiKey) => (normal && it.model === normal.name ? it[psiKey] : 0);
  const out = [];

  if (!bridge) {
    out.push({
      id: 'RW', label: 'Persistent — retained fill with surcharge', kind: 'persistent', deck: false, q: L.surcharge, water: persistentWater,
      mult: (it) => (it.src === 'surcharge' ? 1 : 0), qType: () => 'other',
    });
    return out;
  }

  // Traffic leading (gr1a-type): vertical traffic of the model with the
  // approach surcharge; braking acts in its own situation below.
  models.forEach((m) => {
    const ex = !!m.excludeSurchargeWind;
    out.push({
      id: `S1-${m.name}`, label: `Persistent — ${m.name} vertical traffic leading (gr1a-type)${ex ? ', surcharge and wind excluded' : ''}`, kind: 'persistent', deck: true,
      q: ex ? 0 : L.surcharge, qModel: m.name, water: persistentWater, leading: m.name,
      mult: (it) => {
        if (it.src === 'surcharge') return 1;
        if (it.group === 'Qv' || it.group === 'Qf') return it.model === m.name ? 1 : 0;
        if (it.group === 'Qb') return 0;
        if (it.group === 'Qw') return ex ? 0 : it.psi0;
        if (it.group === 'Qwv') return ex ? 0 : it.psi0;
        if (it.group === 'Qt') return it.psi0;
        return 0;
      },
      qType: trafficType,
    });
  });
  // Braking leading: braking with its concurrent vertical traffic and the
  // approach surcharge. EN 1991-2 models: gr2 (vertical at frequent ψ1, EN
  // 1991-2 Table 4.4a). Abnormal vehicles, BD37 (combination 4 with the
  // associated primary live load), CS 454, supplier and bespoke: full vertical.
  models.forEach((m) => {
    if (!geom.bridgeItems.some((it) => it.group === 'Qb' && it.model === m.name)) return;
    const ex = !!m.excludeSurchargeWind;
    const freq = !ex && String(m.standard || '').startsWith('EN 1991-2');
    out.push({
      id: `S1b-${m.name}`, label: `Persistent — ${m.name} braking leading${freq ? ' (gr2: vertical traffic at ψ1)' : ex ? ' (with the vehicle)' : ' (with full concurrent vertical traffic)'}${ex ? ', surcharge and wind excluded' : ''}`, kind: 'persistent', deck: true,
      q: ex ? 0 : L.surcharge, qModel: m.name, water: persistentWater, leading: `${m.name} braking`,
      mult: (it) => {
        if (it.src === 'surcharge') return 1;
        if (it.group === 'Qb') return it.model === m.name ? 1 : 0;
        if (it.group === 'Qv' || it.group === 'Qf') return it.model === m.name ? (freq ? it.psi1 : 1) : 0;
        if (it.group === 'Qt') return it.psi0;
        return 0;
      },
      qType: trafficType,
    });
  });
  const windMult = (up) => (it) => {
    if (it.src === 'surcharge') return sq0;
    if (it.group === 'Qw') return 1;
    if (it.group === 'Qwv') return up ? -1 : 1;
    if (isTraffic(it)) return accTraffic(it, 'psi0');
    if (it.group === 'Qt') return it.psi0;
    return 0;
  };
  if (hasGroup('Qw') || hasGroup('Qwv')) {
    const acc = normal ? `, ${normal.name} accompanying` : '';
    out.push({ id: 'S2-wind', label: `Persistent — wind leading${hasGroup('Qwv') ? ' (vertical wind down)' : ''}${acc}`, kind: 'persistent', deck: true, q: L.surcharge, water: persistentWater, leading: 'wind', mult: windMult(false), qType: trafficType });
    if (hasGroup('Qwv')) out.push({ id: 'S2-wind-up', label: `Persistent — wind leading (vertical wind uplift)${acc}`, kind: 'persistent', deck: true, q: L.surcharge, water: persistentWater, leading: 'wind', mult: windMult(true), qType: trafficType });
  }
  if (hasGroup('Qt')) {
    out.push({
      id: 'S2-thermal', label: `Persistent — thermal leading${normal ? `, ${normal.name} accompanying` : ''}`, kind: 'persistent', deck: true,
      q: L.surcharge, water: persistentWater, leading: 'thermal',
      mult: (it) => {
        if (it.src === 'surcharge') return sq0;
        if (it.group === 'Qt') return 1;
        if (isTraffic(it)) return accTraffic(it, 'psi0');
        if (it.group === 'Qw' || it.group === 'Qwv') return it.psi0;
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
        if (it.src === 'surcharge') return sq0;
        if (isTraffic(it)) return accTraffic(it, 'psi0');
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
  // Accidental (EN 1990 6.4.3.3): Gk + Ad + ψ1 on the leading traffic + ψ2 on
  // the other variable actions.
  const accMult = (isAd) => (it) => {
    if (isAd(it)) return 1;
    if (it.src === 'surcharge') return normal ? sq0 : 0;
    if (isTraffic(it)) return accTraffic(it, 'psi1');
    if (['Qw', 'Qwv', 'Qt'].includes(it.group)) return it.psi2 ?? 0;
    return 0;
  };
  if (state.loads.impact.on && state.loads.impact.F > 0) {
    out.push({ id: 'S7-impact', label: 'Accidental — vehicle impact', kind: 'accidental', deck: true, impact: true, q: L.surcharge, water: persistentWater, mult: accMult((it) => it.src === 'impact'), qType: trafficType });
  }
  const accRows = [...new Set(geom.bridgeItems.filter((it) => it.group === 'A').map((it) => it.label))];
  accRows.forEach((name, i) => {
    out.push({ id: `S8-acc${i + 1}`, label: `Accidental — ${name} (EN 1990 6.4.3.3)`, kind: 'accidental', deck: true, q: L.surcharge, water: persistentWater, mult: accMult((it) => it.group === 'A' && it.label === name), qType: trafficType });
  });
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

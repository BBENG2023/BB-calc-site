// checks-external.js — whole-abutment checks (including the pad):
// E1 bearing, E2 sliding, E3 overturning (EQU), E4 eccentricity, E7 buoyancy.
// Clause references: BS EN 1997-1:2004+A1:2013 (EC7) and its UK NA.

import { freeBody, factorItems, sums, resultantU, resultantV, materialSet, categoryFactors } from './actions.js';
import { designPhi, effectiveArea, drainedBearing, undrainedBearing, rad, deg, GAMMA_W } from '../../js/geo-core.js';
import { sigmaVAt, layerAt } from './ground.js';

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');

export function signs(geom) {
  return geom.bridgeItems.some((i) => i.reversible) || geom.launchItems.some((i) => i.reversible) ? [1, -1] : [1];
}

export function phiFillFor(ctx, cat) {
  return designPhi(ctx.geom.fill.phi, materialSet(ctx.F, cat).gPhi);
}

// Iterate every (situation, category, reversible sign) combination.
export function eachCombo(ctx, cats, fn) {
  ctx.situations.forEach((sit) => {
    const useCats = sit.kind === 'accidental' ? (cats.includes('ACC') ? ['ACC'] : []) : cats.filter((c) => c !== 'ACC');
    useCats.forEach((cat) => signs(ctx.geom).forEach((sign) => fn(sit, cat, sign)));
  });
}

export function comboLabel(sit, cat, sign, dir) {
  const catName = { C1: 'DA1-C1', C2: 'DA1-C2', EQU: 'EQU', SLSc: 'SLS char.', SLSqp: 'SLS q-p', LEG: 'Legacy (unity)', ACC: 'Accidental' }[cat] || cat;
  const d = dir === undefined ? '' : dir < 0 ? ', towards channel' : ', towards approach';
  const s = sign < 0 ? ' (reversible actions reversed)' : '';
  return `${catName} — ${sit.label}${d}${s}`;
}

// Water level (mAOD → z) acting at the formation for a situation.
function wlFront(ctx, sit) { return Math.max(sit.water?.front ?? -Infinity, ctx.geom.water.gwZ); }

// --- E1 Bearing -------------------------------------------------------------

export function bearingAt(ctx, items, cat, sit) {
  const { geom, F } = ctx;
  const zf = -geom.pad.t;
  const ft = geom.footing;
  const { V, Hu, Hv } = sums(items);
  const uc = (ft.u0 + ft.u1) / 2, vc = (ft.v0 + ft.v1) / 2;
  const { uR } = resultantU(items, zf);
  const { vR } = resultantV(items, zf);
  const eB = uR - uc, eL = vR - vc;
  const eff = effectiveArea(ft.B, ft.L, eB, eL);
  const H = Math.hypot(Hu, Hv);
  const theta = eff.swapped ? deg(Math.atan2(Math.abs(Hv), Math.abs(Hu))) : deg(Math.atan2(Math.abs(Hu), Math.abs(Hv)));
  const M = materialSet(F, cat);
  const soil = geom.founding;
  const wlz = wlFront(ctx, sit);
  const wlLevel = wlz + geom.z0Level;
  const qEff = sigmaVAt(geom.layers, geom.frontGroundLevel, geom.formationLevel, wlLevel);
  const dw = geom.formationLevel - wlLevel; // depth of water below formation (m)
  const gSat = soil.gammaSat ?? soil.gamma + 1;
  const gP = gSat - GAMMA_W;
  const gammaEff = dw <= 0 ? gP : dw >= eff.Bp ? soil.gamma : gP + (soil.gamma - gP) * (dw / Math.max(eff.Bp, 1e-6));
  const out = { V, Hu, Hv, H, uR, vR, eB, eL, B: ft.B, L: ft.L, ...eff, theta, qEff, gammaEff, wlLevel, soil, M, zf };
  if (V <= 0 || eff.Bp <= 0) { out.util = Infinity; out.Rd = 0; out.note = 'Resultant outside the base — no effective area.'; return out; }
  const gRv = F.R1?.gRv ?? 1;
  if (soil.cls === 'Rock' || soil.cls === 'Weathered rock') {
    const rd = Number(soil.rockRd) || 0;
    out.mode = 'rock';
    out.Rd = (rd * eff.A) / gRv;
    out.RA = rd;
    out.util = out.Rd > 0 ? V / out.Rd : Infinity;
    return out;
  }
  const phid = designPhi(soil.phi || 0, M.gPhi);
  const cd = (soil.c || 0) / M.gC;
  const dr = drainedBearing({ phi: phid, c: cd, gammaEff, q: qEff, Bp: eff.Bp, Lp: eff.Lp, V, H, thetaDeg: theta, alphaDeg: geom.baseInclination || 0, groundFactor: geom.groundFactor });
  out.drained = { ...dr, phid, cd, Rd: (dr.RA * dr.A) / gRv };
  out.mode = 'drained';
  out.Rd = out.drained.Rd;
  out.RA = dr.RA;
  if (soil.cls === 'Cohesive' && Number.isFinite(soil.cu)) {
    const cud = soil.cu / M.gCu;
    const qTot = qEff + GAMMA_W * Math.max(0, Math.min(geom.frontGroundLevel, wlLevel) - geom.formationLevel);
    const un = undrainedBearing({ cu: cud, q: qTot, Bp: eff.Bp, Lp: eff.Lp, H });
    out.undrained = { ...un, cud, qTot, Rd: (un.RA * un.A) / gRv };
    if (out.undrained.Rd < out.Rd) { out.mode = 'undrained'; out.Rd = out.undrained.Rd; out.RA = un.RA; }
  }
  out.util = V / out.Rd;
  // Weaker layers within 2B below formation (2V:1H spread — simplified).
  out.layered = [];
  geom.layers.forEach((l) => {
    const dz = geom.formationLevel - l.topLevel;
    if (dz <= 0.05 || dz > 2 * ft.B || l === soil) return;
    const weaker = (l.cls === 'Cohesive' && soil.cls !== 'Cohesive') || (Number(l.phi) < Number(soil.phi) - 0.01) || (l.cls === 'Cohesive' && soil.cls === 'Cohesive' && l.cu < soil.cu);
    if (!weaker && !l.unsuitable) return;
    const Bp2 = eff.Bp + dz, Lp2 = eff.Lp + dz;
    const q2 = sigmaVAt(geom.layers, geom.frontGroundLevel, l.topLevel, wlLevel);
    let Rd2;
    let desc;
    if (l.cls === 'Cohesive' && Number.isFinite(l.cu)) {
      const un = undrainedBearing({ cu: l.cu / M.gCu, q: q2, Bp: Bp2, Lp: Lp2, H });
      Rd2 = (un.RA * un.A) / gRv;
      desc = `undrained cu,d = ${f1(l.cu / M.gCu)} kPa`;
    } else {
      const p2 = designPhi(l.phi || 25, M.gPhi);
      const d2 = drainedBearing({ phi: p2, c: (l.c || 0) / M.gC, gammaEff: (l.gammaSat || l.gamma + 1) - GAMMA_W, q: q2, Bp: Bp2, Lp: Lp2, V, H, thetaDeg: theta });
      Rd2 = (d2.RA * d2.A) / gRv;
      desc = `drained φ′d = ${f1(p2)}°`;
    }
    out.layered.push({ layer: l.desc || l.cls, topLevel: l.topLevel, dz, Bp: Bp2, Lp: Lp2, Rd: Rd2, util: V / Rd2, desc });
  });
  out.layered.forEach((r) => { if (r.util > out.util) { out.util = r.util; out.mode = `layer: ${r.layer}`; out.Rd = r.Rd; } });
  return out;
}

export function checkBearing(ctx) {
  const { geom } = ctx;
  const rows = [];
  let gov = null;
  const govByCat = {};
  eachCombo(ctx, ['C1', 'C2', 'ACC'], (sit, cat, sign) => {
    const phiFill = phiFillFor(ctx, cat);
    const fb = freeBody(geom, { kind: 'formation' }, { sit, phiFill });
    ['sup', 'inf'].forEach((gMode) => {
      const items = factorItems(fb.items, { F: ctx.F, cat, sit, check: 'bearing', gMode, sign });
      const r = bearingAt(ctx, items, cat, sit);
      r.label = comboLabel(sit, cat, sign) + (gMode === 'inf' ? ' — G inf' : '');
      r.cat = cat; r.sit = sit; r.items = items; r.phiFill = phiFill;
      rows.push(r);
      if (!gov || r.util > gov.util) gov = r;
      if (!govByCat[cat] || r.util > govByCat[cat].util) govByCat[cat] = r;
    });
  });
  // Legacy bearing FoS ≥ 3.0 (optional).
  let legacy = null;
  if (ctx.state.basis.legacyBearing) {
    eachCombo(ctx, ['LEG'], (sit, cat, sign) => {
      const fb = freeBody(geom, { kind: 'formation' }, { sit, phiFill: geom.fill.phi });
      const items = factorItems(fb.items, { F: ctx.F, cat: 'LEG', sit, check: 'bearing', gMode: 'sup', sign });
      const r = bearingAt(ctx, items, 'LEG', sit);
      const fos = r.Rd / r.V;
      const req = ctx.F.legacy?.bearing ?? 3;
      const util = req / fos;
      if (!legacy || util > legacy.util) legacy = { ...r, fos, req, util, label: comboLabel(sit, 'LEG', sign) };
    });
  }
  const steps = gov ? bearingSteps(gov, geom) : [];
  const verdictUtil = ctx.F.legacyOnly ? (legacy ? legacy.util : 0) : gov ? gov.util : 0;
  return {
    id: 'E1', title: 'Bearing resistance', clause: 'BS EN 1997-1 6.5.2, Annex D',
    util: verdictUtil, pass: verdictUtil <= 1 + 1e-9, governing: gov, govByCat, legacy, steps,
    rows: rows.map((r) => ({ label: r.label, V: r.V, H: r.H, e: r.eB, Bp: r.Bp, Rd: r.Rd, util: r.util })),
  };
}

function bearingSteps(r, geom) {
  const s = [];
  s.push({ title: `Governing combination: ${r.label}`, formula: 'Vd = Σ γ·Fz; Hd = √(ΣFu² + ΣFv²) (factored actions on the formation)', substitution: `Vd = ${f1(r.V)} kN; Hu = ${f1(r.Hu)} kN, Hv = ${f1(r.Hv)} kN`, result: `Vd = ${f1(r.V)} kN, Hd = ${f1(r.H)} kN` });
  s.push({ title: 'Eccentricity and effective foundation (Annex D.1)', formula: "e = u_R − B/2;  B′ = B − 2e_B;  L′ = L − 2e_L;  A′ = B′·L′", substitution: `B = ${f3(r.B)} m, L = ${f3(r.L)} m; e_B = ${f3(r.eB)} m, e_L = ${f3(r.eL)} m`, result: `B′ = ${f3(r.Bp)} m, L′ = ${f3(r.Lp)} m, A′ = ${f3(r.A)} m²` });
  if (r.mode === 'rock') {
    s.push({ title: 'Bearing on rock', formula: 'Rd = q_rock,d × A′', substitution: `Rd = ${f1(r.RA)} × ${f3(r.A)}`, result: `Rd = ${f1(r.Rd)} kN` });
  } else if (r.drained) {
    const d = r.drained;
    s.push({ title: 'Design strength and overburden', formula: "tan φ′d = tan φ′k / γφ′;  q′ = σ′v at formation from the front ground level", substitution: `φ′k = ${f1(r.soil.phi)}°, γφ′ = ${r.M.gPhi}; front ground ${f3(geom.frontGroundLevel)}, formation ${f3(geom.formationLevel)} mAOD`, result: `φ′d = ${f2(d.phid)}°, c′d = ${f1(d.cd)} kPa, q′ = ${f1(r.qEff)} kPa, γ′ (Nγ term) = ${f2(r.gammaEff)} kN/m³` });
    s.push({ title: 'Bearing factors (Annex D.4)', formula: 'Nq = e^(π tan φ′) tan²(45 + φ′/2);  Nγ = 2(Nq − 1) tan φ′;  Nc = (Nq − 1) cot φ′', substitution: `φ′d = ${f2(d.phid)}°`, result: `Nq = ${f2(d.Nq)}, Nγ = ${f2(d.Ngamma)}, Nc = ${f2(d.Nc)}` });
    s.push({ title: 'Shape and inclination factors (Annex D.4)', formula: "sq = 1 + (B′/L′) sin φ′;  sγ = 1 − 0.3 B′/L′;  m = mB cos²… per D.4;  iq = [1 − H/(V + A′c′ cot φ′)]^m;  iγ = [...]^(m+1)", substitution: `B′/L′ = ${f3(r.Bp / r.Lp)}, θ = ${f1(r.theta)}°, H/V = ${f3(r.H / r.V)}`, result: `sq = ${f3(d.sq)}, sγ = ${f3(d.sg)}, m = ${f3(d.m)}, iq = ${f3(d.iq)}, iγ = ${f3(d.ig)}${d.gq !== 1 ? `, gq = gγ = ${f3(d.gq)} (Vesic ground inclination)` : ''}${d.bq !== 1 ? `, bq = ${f3(d.bq)}` : ''}` });
    s.push({ title: 'Drained resistance', formula: "R/A′ = c′Nc·bc·sc·ic + q′Nq·bq·sq·iq + 0.5γ′B′Nγ·bγ·sγ·iγ", substitution: `R/A′ = ${f1(d.termC)} + ${f1(d.termQ)} + ${f1(d.termG)}`, result: `R/A′ = ${f1(d.RA)} kPa; Rd = ${f1(d.RA)} × ${f3(d.A)} = ${f1(d.Rd)} kN` });
    if (r.undrained) {
      const u = r.undrained;
      s.push({ title: 'Undrained resistance (Annex D.3)', formula: 'R/A′ = (π + 2) cu,d · bc · sc · ic + q', substitution: `cu,d = ${f1(u.cud)} kPa, sc = ${f3(u.sc)}, ic = ${f3(u.ic)}, q = ${f1(u.qTot)} kPa`, result: `R/A′ = ${f1(u.RA)} kPa; Rd = ${f1(u.Rd)} kN` });
    }
    (r.layered || []).forEach((l) => s.push({ title: `Weaker layer check — ${l.layer} (2V:1H spread, simplified)`, formula: "B″ = B′ + Δz;  L″ = L′ + Δz;  q″ = σ′v at layer top", substitution: `Δz = ${f2(l.dz)} m, B″ = ${f3(l.Bp)} m, L″ = ${f3(l.Lp)} m, ${l.desc}`, result: `Rd = ${f1(l.Rd)} kN, utilisation ${f3(l.util)}` }));
  }
  s.push({ title: 'Verification (EC7 6.5.2.1)', formula: 'Vd ≤ Rd', substitution: `${f1(r.V)} ≤ ${f1(r.Rd)}`, result: `Utilisation ${f3(r.util)} — ${r.util <= 1 ? 'OK' : 'FAIL'}${r.mode && r.mode !== 'drained' ? ` (${r.mode} governs)` : ''}` });
  return s;
}

// --- E2 Sliding ------------------------------------------------------------------

function interfaceFriction(ctx, cut, cat) {
  const { geom, state } = ctx;
  const M = materialSet(ctx.F, cat);
  const pad = geom.pad;
  const soil = geom.founding;
  const override = geom.formationMuOverride;
  const ulsMu = ['C1', 'C2', 'EQU'].includes(cat) && state.basis.gammaMuOn ? 1.25 : 1;
  if (cut === 'base' && pad.t > 0) {
    if (pad.rigid) return { tanD: state.basis.muConcrete / ulsMu, desc: `Block–mass concrete μ = ${state.basis.muConcrete}${ulsMu > 1 ? ' / 1.25' : ''} (BS EN 1992-1-1 6.2.5(2))` };
    const dk = (2 / 3) * pad.phiCv;
    return { tanD: Math.tan(rad(dk)) / M.gPhi, desc: `Block–Type 1: δk = (2/3)φ′cv = ${f2(dk)}° (EC7 6.5.3(10), smooth precast); tan δd = tan δk / ${M.gPhi}` };
  }
  // Formation interface (pad underside, or blocks directly on formation).
  const res = {};
  if (override !== null && override !== undefined && override !== '') {
    res.tanD = Number(override) / M.gPhi;
    res.desc = `Formation friction override tan δk = ${override}${M.gPhi !== 1 ? ` / ${M.gPhi}` : ''}`;
  } else if (pad.t > 0 && !pad.rigid) {
    const phiW = Math.min(pad.phi, soil.phi || pad.phi);
    res.tanD = Math.tan(rad(phiW)) / M.gPhi;
    res.desc = `Type 1 pad on formation: δk = φ′k of weaker material = ${f1(phiW)}° (EC7 6.5.3(10)); tan δd = tan δk / ${M.gPhi}`;
  } else if (pad.t > 0 && pad.rigid) {
    res.tanD = Math.tan(rad(soil.phi || 25)) / M.gPhi;
    res.desc = `Cast-in-place base on formation: δk = φ′k = ${f1(soil.phi)}° (EC7 6.5.3(10)); tan δd = tan δk / ${M.gPhi}`;
  } else {
    const dk = (2 / 3) * (soil.phi || 25);
    res.tanD = Math.tan(rad(dk)) / M.gPhi;
    res.desc = `Precast blocks on formation: δk = (2/3)φ′k = ${f2(dk)}° (EC7 6.5.3(10)); tan δd = tan δk / ${M.gPhi}`;
  }
  if (soil.cls === 'Cohesive' && Number.isFinite(soil.cu)) res.cud = soil.cu / M.gCu;
  return res;
}

export function slidingAt(ctx, items, cut, cat, dir) {
  const { V } = sums(items);
  const passive = items.filter((i) => i.src === 'passive');
  const driving = items.filter((i) => i.src !== 'passive');
  const HuNet = driving.reduce((s, i) => s + i.Fu, 0) * dir;
  const Hv = driving.reduce((s, i) => s + i.Fv, 0);
  const H = Math.hypot(Math.max(0, HuNet), Hv);
  const Rp = dir < 0 ? passive.reduce((s, i) => s + i.Fu, 0) : 0;
  const fr = interfaceFriction(ctx, cut, cat);
  let Rd = Math.max(0, V) * fr.tanD;
  let mode = 'drained';
  let RdU = null;
  if (fr.cud !== undefined) {
    const zb = cut === 'formation' ? -ctx.geom.pad.t : 0;
    const { uR } = resultantU(items, zb);
    const ft = cut === 'formation' ? ctx.geom.footing : ctx.geom.baseFoot;
    const Bp = Math.max(0, ft.B - 2 * Math.abs(uR - (ft.u0 + ft.u1) / 2));
    RdU = Math.min(Bp * ft.L * fr.cud, 0.4 * Math.max(0, V));
    if (RdU < Rd) { Rd = RdU; mode = 'undrained (≤ 0.4Vd, EC7 6.5.3(12)P)'; }
  }
  const util = H > 1e-9 ? H / (Rd + Rp) : 0;
  return { V, H, HuNet, Hv, Rp, Rd, RdTotal: Rd + Rp, util, tanD: fr.tanD, desc: fr.desc, mode, RdU };
}

export function checkSliding(ctx) {
  const { geom } = ctx;
  const cuts = geom.pad.t > 0 ? ['base', 'formation'] : ['formation'];
  const res = [];
  let gov = null;
  const govByCat = {};
  let legacy = null;
  cuts.forEach((cut) => {
    const cutSpec = cut === 'formation' ? { kind: 'formation' } : { kind: 'base' };
    eachCombo(ctx, ['C1', 'C2', 'LEG', 'ACC'], (sit, cat, sign) => {
      const phiFill = phiFillFor(ctx, cat);
      const fb = freeBody(geom, cutSpec, { sit, phiFill });
      [-1, 1].forEach((dir) => {
        const items = factorItems(fb.items, { F: ctx.F, cat, sit, check: 'slide', dir, sign });
        const r = slidingAt(ctx, items, cut, cat, dir);
        if (r.H <= 1e-9) return;
        r.label = `${cut === 'formation' ? (geom.pad.t > 0 ? 'Pad/formation' : 'Blocks/formation') : (geom.pad.rigid ? 'Blocks/base' : 'Blocks/pad')} — ${comboLabel(sit, cat, sign, dir)}`;
        r.cut = cut; r.cat = cat;
        if (cat === 'LEG') {
          r.fos = r.RdTotal / r.H;
          r.req = ctx.F.legacy?.sliding ?? 1.5;
          r.utilLeg = r.req / r.fos;
          if (!legacy || r.utilLeg > legacy.utilLeg) legacy = r;
          return;
        }
        res.push(r);
        if (!gov || r.util > gov.util) gov = r;
        if (!govByCat[cat] || r.util > govByCat[cat].util) govByCat[cat] = r;
      });
    });
  });
  const steps = [];
  const g = ctx.F.legacyOnly ? legacy : gov;
  if (g) {
    steps.push({ title: `Governing: ${g.label}`, formula: 'Hd = √(Σ Fu,drive² + Σ Fv²);  V favourable only (variable vertical traffic = 0)', substitution: `Vd,fav = ${f1(g.V)} kN; Hu = ${f1(g.HuNet)} kN, Hv = ${f1(g.Hv)} kN`, result: `Hd = ${f1(g.H)} kN` });
    steps.push({ title: 'Interface resistance (EC7 6.5.3)', formula: g.mode.startsWith('undrained') ? 'Rd = min(A′·cu,d, 0.4·Vd)' : 'Rd = Vd,fav · tan δd (+ Rp,d if passive relied on)', substitution: `${g.desc}; tan δd = ${f3(g.tanD)}${g.Rp ? `; Rp = ${f1(g.Rp)} kN` : ''}`, result: `Rd = ${f1(g.RdTotal)} kN` });
    if (ctx.F.legacyOnly) steps.push({ title: 'Legacy FoS', formula: 'FoS = Rd / H ≥ 1.5', substitution: `${f1(g.RdTotal)} / ${f1(g.H)}`, result: `FoS = ${f3(g.fos)} — ${g.fos >= g.req ? 'OK' : 'FAIL'}` });
    else steps.push({ title: 'Verification', formula: 'Hd ≤ Rd + Rp;d', substitution: `${f1(g.H)} ≤ ${f1(g.RdTotal)}`, result: `Utilisation ${f3(g.util)} — ${g.util <= 1 ? 'OK' : 'FAIL'}` });
  }
  const util = ctx.F.legacyOnly ? (legacy ? legacy.utilLeg : 0) : gov ? gov.util : 0;
  return { id: 'E2', title: 'Sliding', clause: 'BS EN 1997-1 6.5.3', util, pass: util <= 1 + 1e-9, governing: gov, govByCat, legacy, steps, rows: res.map((r) => ({ label: r.label, V: r.V, H: r.H, Rd: r.RdTotal, util: r.util })) };
}

// --- E3 Overturning (EQU) --------------------------------------------------------

export function toppleAt(items, pivot, dir) {
  let Mdst = 0, Mstb = 0;
  items.forEach((it) => {
    const M = dir * (it.Fu * (it.z - pivot.z) + it.Fz * (it.u - pivot.u));
    if (M > 0) Mdst += M; else Mstb -= M;
  });
  return { Mdst, Mstb, util: Mstb > 0 ? Mdst / Mstb : Infinity, fos: Mdst > 0 ? Mstb / Mdst : Infinity };
}

export function checkOverturning(ctx) {
  const { geom } = ctx;
  const rigid = geom.pad.t > 0 && geom.pad.rigid;
  const cutSpec = rigid ? { kind: 'formation' } : { kind: 'base' };
  const z = rigid ? -geom.pad.t : 0;
  const front = rigid ? geom.pad.u0 : geom.courses[0].u0;
  const rear = rigid ? geom.pad.u1 : geom.courses[0].u1;
  let gov = null, legacy = null;
  const rows = [];
  eachCombo(ctx, ['EQU', 'LEG', 'ACC'], (sit, cat, sign) => {
    const phiFill = phiFillFor(ctx, cat === 'ACC' ? 'LEG' : cat);
    const fb = freeBody(geom, cutSpec, { sit, phiFill });
    [[-1, front], [1, rear]].forEach(([dir, u]) => {
      const pivot = { u, z };
      const items = factorItems(fb.items, { F: ctx.F, cat, sit, check: 'topple', dir, pivot, sign });
      const r = { ...toppleAt(items, pivot, dir), label: comboLabel(sit, cat, sign, dir), cat, pivot, dir };
      if (r.Mdst <= 1e-9) return;
      if (cat === 'LEG') { r.req = ctx.F.legacy?.toppling ?? 1.5; r.utilLeg = r.req / r.fos; if (!legacy || r.utilLeg > legacy.utilLeg) legacy = r; return; }
      rows.push(r);
      if (!gov || r.util > gov.util) gov = r;
    });
  });
  const g = ctx.F.legacyOnly ? legacy : gov;
  const steps = g ? [
    { title: `Governing: ${g.label}`, formula: `Moments about the ${g.dir < 0 ? 'front toe' : 'rear edge'} of the ${rigid ? 'rigid base' : 'bottom course'} (u = ${f3(g.pivot.u)} m, z = ${f3(g.pivot.z)} m)`, substitution: 'Destabilising: γG,dst / γQ on actions that overturn; stabilising: γG,stb on weights; variable favourable = 0', result: `Mdst = ${f1(g.Mdst)} kNm, Mstb = ${f1(g.Mstb)} kNm` },
    ctx.F.legacyOnly
      ? { title: 'Legacy FoS', formula: 'FoS = Mstb / Mdst ≥ 1.5', substitution: `${f1(g.Mstb)} / ${f1(g.Mdst)}`, result: `FoS = ${f3(g.fos)} — ${g.fos >= g.req ? 'OK' : 'FAIL'}` }
      : { title: 'Verification (EN 1990 6.4.3.1, EQU)', formula: 'Mdst,d ≤ Mstb,d', substitution: `${f1(g.Mdst)} ≤ ${f1(g.Mstb)}`, result: `Utilisation ${f3(g.util)} — ${g.util <= 1 ? 'OK' : 'FAIL'}` },
  ] : [];
  const util = ctx.F.legacyOnly ? (legacy ? legacy.utilLeg : 0) : gov ? gov.util : 0;
  return { id: 'E3', title: 'Overturning (EQU)', clause: 'BS EN 1990 6.4.3.1; BS EN 1997-1 2.4.7.2', util, pass: util <= 1 + 1e-9, governing: gov, legacy, steps, rows: rows.map((r) => ({ label: r.label, Mdst: r.Mdst, Mstb: r.Mstb, util: r.util })) };
}

// --- E4 Eccentricity and base pressure ------------------------------------------

export function pressureDistribution(V, e, B, L) {
  const ae = Math.abs(e);
  if (ae <= B / 6) {
    const q = V / (B * L);
    return { qmax: q * (1 + (6 * ae) / B), qmin: q * (1 - (6 * ae) / B), shape: 'trapezoidal', xR: B / 2 - ae };
  }
  const xR = B / 2 - ae;
  return { qmax: xR > 0 ? (2 * V) / (3 * xR * L) : Infinity, qmin: 0, shape: 'triangular', xR };
}

export function checkEccentricity(ctx, bearing) {
  const { geom } = ctx;
  const rigid = geom.pad.t > 0 && geom.pad.rigid;
  const cutSpec = rigid ? { kind: 'formation' } : { kind: 'base' };
  const zb = rigid ? -geom.pad.t : 0;
  const bf = geom.baseFoot;
  let gov = null;
  let govQ = null;
  const rows = [];
  ctx.situations.forEach((sit) => {
    if (sit.kind === 'accidental') return;
    signs(geom).forEach((sign) => {
      const phiFill = geom.fill.phi;
      const items = factorItems(freeBody(geom, cutSpec, { sit, phiFill }).items, { F: ctx.F, cat: 'SLSc', sit, check: 'sls', sign });
      const { V, Hu, Hv } = sums(items);
      const { uR } = resultantU(items, zb);
      const { vR } = resultantV(items, zb);
      const eB = uR - (bf.u0 + bf.u1) / 2, eL = vR - (bf.v0 + bf.v1) / 2;
      const kern = Math.abs(eB) / bf.B + Math.abs(eL) / bf.L;
      const util = Math.max(Math.abs(eB) / (bf.B / 6), Math.abs(eL) / (bf.L / 6), kern / (1 / 6));
      const r = { label: comboLabel(sit, 'SLSc', sign), V, H: Math.hypot(Hu, Hv), Hu, Hv, uR, xRtoe: uR - bf.u0, eB, eL, kern, util, B: bf.B, L: bf.L, sit };
      // Formation pressure (effective footing for a granular pad).
      const fItems = rigid ? items : factorItems(freeBody(geom, { kind: 'formation' }, { sit, phiFill }).items, { F: ctx.F, cat: 'SLSc', sit, check: 'sls', sign });
      const ft = geom.footing;
      const fr = resultantU(fItems, -geom.pad.t);
      const eF = fr.uR - (ft.u0 + ft.u1) / 2;
      const pd = pressureDistribution(fr.V, eF, ft.B, ft.L);
      const eff = effectiveArea(ft.B, ft.L, eF, 0);
      r.formation = { V: fr.V, e: eF, ...pd, B: ft.B, L: ft.L, qMeanEff: fr.V / Math.max(eff.A, 1e-9), qMean: fr.V / (ft.B * ft.L), Bp: eff.Bp };
      rows.push(r);
      if (!gov || r.util > gov.util) gov = r;
      if (!govQ || r.formation.qmax > govQ.formation.qmax) govQ = r;
    });
  });
  // ULS: e ≤ B/3 at the formation (EC7 6.5.4 note).
  let uls = null;
  (bearing.rows ? [bearing.governing] : []).forEach(() => {});
  if (bearing.governing) {
    const all = bearing.governing;
    uls = { e: all.eB, B: all.B, util: Math.abs(all.eB) / (all.B / 3), label: all.label };
  }
  const steps = [];
  if (gov) {
    steps.push({ title: `SLS characteristic resultant — ${gov.label}`, formula: 'u_R = [Σ u·Fz + Σ z·Fu] / V (moments about the front toe);  e = u_R − B/2', substitution: `V = ${f1(gov.V)} kN, H = ${f1(gov.H)} kN, x_R from toe = ${f3(gov.xRtoe)} m, B = ${f3(gov.B)} m`, result: `e_B = ${f3(gov.eB)} m (B/6 = ${f3(gov.B / 6)} m); e_L = ${f3(gov.eL)} m` });
    steps.push({ title: 'Middle-third (kern) check at SLS', formula: '|e_B| ≤ B/6; |e_L| ≤ L/6; |e_B|/B + |e_L|/L ≤ 1/6', substitution: `${f3(Math.abs(gov.eB))} vs ${f3(gov.B / 6)}; kern ratio ${f3(gov.kern)} vs 0.167`, result: `Utilisation ${f3(gov.util)} — ${gov.util <= 1 ? 'resultant within middle third' : 'OUTSIDE middle third'}` });
  }
  if (govQ) {
    const q = govQ.formation;
    steps.push({ title: `Formation pressure (SLS characteristic, ${q.shape})`, formula: q.shape === 'trapezoidal' ? 'q = V/(B·L)·(1 ± 6e/B)' : 'q_max = 2V / (3·x_R·L)', substitution: `V = ${f1(q.V)} kN, B = ${f3(q.B)} m, L = ${f3(q.L)} m, e = ${f3(q.e)} m${q.shape === 'triangular' ? `, x_R = ${f3(q.xR)} m` : ''}`, result: `q_max = ${f1(q.qmax)} kPa, q_min = ${f1(q.qmin)} kPa` });
  }
  if (uls) steps.push({ title: 'ULS eccentricity (EC7 6.5.4 note)', formula: '|e| ≤ B/3', substitution: `${f3(Math.abs(uls.e))} vs ${f3(uls.B / 3)} (${uls.label})`, result: `Utilisation ${f3(uls.util)}` });
  const util = Math.max(gov ? gov.util : 0, uls ? uls.util : 0);
  return { id: 'E4', title: 'Eccentricity and base pressure', clause: 'BS EN 1997-1 6.5.4, 6.6', util, pass: util <= 1 + 1e-9, governing: gov, govQ, uls, steps, rows: rows.map((r) => ({ label: r.label, V: r.V, eB: r.eB, util: r.util, qmax: r.formation.qmax, qmin: r.formation.qmin })) };
}

// --- E7 Buoyancy / uplift ---------------------------------------------------------

export function checkBuoyancy(ctx) {
  const { geom } = ctx;
  const flood = ctx.situations.filter((s) => s.flood || s.id.startsWith('S6'));
  const dry = ctx.situations.find((s) => s.id.startsWith('S1')) || ctx.situations[0];
  if (!flood.length) return { id: 'E7', title: 'Buoyancy / uplift', clause: 'BS EN 1997-1 2.4.7.4', util: 0, pass: true, na: true, steps: [{ title: 'Flood cases', formula: 'Activated when any part of the abutment or pad lies below DFL', substitution: `DFL ${geom.water.DFLlevel ?? '—'} mAOD vs formation ${f3(geom.formationLevel)} mAOD`, result: 'Not applicable — formation above DFL' }] };
  const vOf = (sit) => sums(factorItems(freeBody(geom, { kind: 'formation' }, { sit, phiFill: geom.fill.phi }).items, { F: ctx.F, cat: 'SLSc', sit: { ...sit, mult: () => 0 }, check: 'sls' })).V;
  const Vdry = vOf({ ...dry, water: { back: geom.water.gwZ, front: geom.water.gwZ } });
  let worst = null;
  flood.forEach((s) => {
    const V = vOf(s);
    const ratio = V / Vdry;
    if (!worst || ratio < worst.ratio) worst = { sit: s, V, ratio };
  });
  const util = worst.ratio > 0 ? 0.5 / worst.ratio : Infinity;
  return {
    id: 'E7', title: 'Buoyancy / uplift', clause: 'BS EN 1997-1 2.4.7.4 (UPL)', util, pass: worst.ratio >= 0.5, governing: worst,
    steps: [{ title: `Net vertical load — ${worst.sit.label}`, formula: 'V_flood = Σ weights − uplift (equivalent to buoyant block weight 23.05 − 9.81 = 13.24 kN/m³); flag if < 50% of dry', substitution: `V_flood = ${f1(worst.V)} kN, V_dry = ${f1(Vdry)} kN (permanent actions only)`, result: `Ratio ${f3(worst.ratio)} — ${worst.ratio >= 0.5 ? 'OK' : 'FLAG: net vertical load below 50% of dry value'}` }],
  };
}

export { f1, f2, f3, layerAt, categoryFactors };

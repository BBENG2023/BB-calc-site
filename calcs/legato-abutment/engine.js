// engine.js — evaluates one abutment end end-to-end (ground → layout →
// levels → actions → checks) and assembles the whole design output.

import { processGround, layerAt, foundingStratumTop } from './ground.js';
import { buildLayout, solveLevels } from './layout.js';
import { resolveBridgeLoads, buildSituations, normaliseLoads, endBearings, deckCharacteristic, bothEndsFixed } from './actions.js';
import { checkBearing, checkSliding, checkOverturning, checkEccentricity, checkBuoyancy, f1, f2, f3 } from './checks-external.js';
import { checkInterfaces, checkSubStacks, interfaceSteps } from './checks-internal.js';
import { checkLocal } from './checks-local.js';
import { endSettlement } from './settlement.js';
import { crossingChecks, profileLevel, detectBank } from './crossing.js';
import { pltRequirement } from './spec.js';
import { abutmentZones, zoneGeom, capBeamCheck } from './dispersion.js';
import { resolveOverrides } from './overrides.js';
import { inputHash, LOAD_STANDARDS } from './schema.js';
export { LOAD_STANDARDS };
import { LEGATO_DATA_FLAGS } from '../../js/shared-data.js';

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export function buildGeom(state, endIdx, ground, layout) {
  const end = state.ends[endIdx];
  const P = state.project;
  const A = end.arrangement;
  const bridge = P.mode === 'bridge';
  const X = state.crossing;
  const courses = layout.courses;
  const c1 = courses[0];
  const n = courses.length;
  const seatIdx = bridge ? (layout.seat?.idx ?? null) : null;
  const ballastIdx = bridge ? (layout.ballast?.idx ?? null) : null;
  const topIdx = bridge && seatIdx ? seatIdx : n;

  // Front ground and highest acceptable formation.
  const frontGround = isNum(end.frontGroundOverride) ? Number(end.frontGroundOverride)
    : bridge && (X.profile || []).length ? profileLevel(state, end.frontChainage) : (ground.layers[0]?.topLevel ?? end.seatLevel);
  const fst = foundingStratumTop(ground.layers);
  const cands = [{ level: fst.level, why: `top of founding stratum (${fst.layer?.desc || fst.layer?.cls || '—'})` }, { level: frontGround - (P.dMin ?? 0.45), why: `final ground at front ${frontGround.toFixed(3)} − d_min ${P.dMin}` }];
  const bank = bridge ? (end.bankCrest?.ch !== null && end.bankCrest?.ch !== undefined && end.bankCrest?.ch !== '' ? { crest: end.bankCrest, toe: end.bankToe } : detectBank(state, endIdx)) : null;
  const sL = endIdx === 0 ? -1 : 1;
  const padOvF = (A.pad.overhangFront || 0) / 1000;
  if (bridge && end.scour?.assessed && bank?.crest && bank?.toe) {
    const padFrontCh = end.frontChainage - sL * padOvF;
    const onBankSlope = (padFrontCh - Number(bank.crest.ch)) * sL < 0;
    if (onBankSlope) cands.push({ level: Number(bank.toe.level) - Number(end.scour.ds || 0) - (X.scourMargin || 0), why: 'scour level at toe − margin (abutment on the bank slope)' });
  }
  const maxF = cands.reduce((m, c) => (c.level < m.level ? c : m), cands[0]);
  const levels = solveLevels({ targetLevel: Number(end.seatLevel), courses, topIdx, pad: A.pad, maxFormation: maxF.level });
  levels.maxFormation = maxF;
  levels.candidates = cands;

  const t = levels.padThk;
  const rigid = A.pad.material === 'Mass concrete';
  const ovR = (A.pad.overhangRear || 0) / 1000;
  const ovV = Math.min(padOvF, ovR);
  const pad = t > 0
    ? { t, u0: c1.u0 - padOvF, u1: c1.u1 + ovR, v0: c1.v0 - ovV, v1: c1.v1 + ovV, gamma: Number(A.pad.gamma) || 21, material: A.pad.material, rigid, phi: Number(A.pad.phi) || 40, phiCv: Number(A.pad.phiCv) || 35 }
    : { t: 0, u0: c1.u0, u1: c1.u1, v0: c1.v0, v1: c1.v1, gamma: 0, material: 'none', rigid: false, phi: 40, phiCv: 35 };
  const sp = Number(state.basis.spread) || 2;
  const footing = t > 0 && !rigid
    ? { u0: Math.max(pad.u0, c1.u0 - t / sp), u1: Math.min(pad.u1, c1.u1 + t / sp), v0: Math.max(pad.v0, c1.v0 - t / sp), v1: Math.min(pad.v1, c1.v1 + t / sp) }
    : { u0: pad.u0, u1: pad.u1, v0: pad.v0, v1: pad.v1 };
  footing.B = footing.u1 - footing.u0; footing.L = footing.v1 - footing.v0;
  const baseFoot = rigid && t > 0 ? { u0: pad.u0, u1: pad.u1, v0: pad.v0, v1: pad.v1 } : { u0: c1.u0, u1: c1.u1, v0: c1.v0, v1: c1.v1 };
  baseFoot.B = baseFoot.u1 - baseFoot.u0; baseFoot.L = baseFoot.v1 - baseFoot.v0;

  const z0Level = levels.z0Level;
  const zFill = end.fillSurfaceMode === 'z' || !bridge ? Number(end.fillSurfaceZ) : Number(end.FRL) - z0Level;
  const seat = layout.seat;
  const L = layout.L;
  let bearing = { u: 0, v: L / 2, zSeat: 0, zH: 0 };
  let bearingPositions = [];
  if (bridge && seat) {
    const exposedRear = layout.ballast ? layout.ballast.u0 : seat.u1;
    const u = isNum(A.bearingU_mm) ? Number(A.bearingU_mm) / 1000 : (seat.u0 + exposedRear) / 2;
    const zH = seat.z1 + ((A.bearingGrout || 0) + (P.bearingHeight || 0)) / 1000;
    bearing = { u, v: L / 2, zSeat: seat.z1, zH };
    bearingPositions = endBearings(state, endIdx, L, u, seat);
  }

  const gw = ground.gw.level;
  const phrAbut = isNum(end.phreaticAbut) ? Number(end.phreaticAbut) : null;
  const gwLevel = Math.max(Number.isFinite(gw) ? gw : -Infinity, phrAbut ?? -Infinity);
  const founding = layerAt(ground.layers, levels.formation - 0.001) || { cls: 'Granular', phi: 30, gamma: 18, gammaSat: 19, c: 0 };
  const frontLayer = layerAt(ground.layers, frontGround - 0.05) || founding;

  // Passive (optional).
  const retained = zFill - (frontGround - z0Level);
  const da = isNum(end.excavAllowance) ? Number(end.excavAllowance) : Math.min(0.1 * Math.max(retained, 0), 0.5);
  let zg = frontGround - da;
  if (end.scour?.assessed && bank?.toe) zg = Math.min(zg, Number(bank.toe.level) - Number(end.scour.ds || 0));
  if (isNum(end.minFrontFill)) zg = Math.min(zg, Number(end.minFrontFill));
  const passive = { on: !!A.passive, mob: Number(A.kpMob) || 0.5, zGuaranteed: zg - z0Level, levelGuaranteed: zg, phi: Number(frontLayer.phi) || 30, gamma: Number(frontLayer.gamma) || 18, da };

  // Near-slope ground factor.
  let groundFactor = 1, setback = null, beta = 0;
  if (bridge && bank?.crest && bank?.toe && isNum(bank.crest.ch) && isNum(bank.toe.ch)) {
    setback = (end.frontChainage - Number(bank.crest.ch)) * sL;
    const H = Number(bank.crest.level) - Number(bank.toe.level);
    beta = Math.atan2(Math.max(H, 0), Math.max(Math.abs(Number(bank.crest.ch) - Number(bank.toe.ch)), 1e-6));
    if (state.basis.nearSlopeFactor && setback < 2 * footing.B && H > 0) groundFactor = Math.max(0, 1 - Math.tan(beta)) ** 2;
  }

  const geom = {
    endIdx, L, courses, pad, footing, baseFoot, z0Level, formationLevel: levels.formation, zFill, seatIdx, ballastIdx,
    seatLevel: Number(end.seatLevel), frontChainage: Number(end.frontChainage), frontGroundLevel: frontGround,
    fill: { gamma: Number(end.fill.gamma), gammaSat: Number(end.fill.gammaSat || end.fill.gamma + 1), phi: Number(end.fill.phi) },
    epMethod: state.basis.epMethod, coulombDeltaRatio: state.basis.coulombDeltaRatio, backfillSlope: state.basis.backfillSlope || 0,
    compaction: state.loads.compaction, surchargeSetback: state.loads.surchargeSetback || 0,
    bearing, bearingPositions, bearings: bearingPositions, basis: layout.basis, layers: ground.layers, founding, passive, groundFactor, setback, beta,
    baseInclination: Number(state.basis.baseInclination) || 0, formationMuOverride: resolveOverrides(state).ends[endIdx]?.formationMu ?? null,
    bankPhi: Number(founding.phi) || 30,
    water: {
      gwZ: gwLevel - z0Level, gwLevel,
      DFLz: bridge && isNum(X.DFL) ? Number(X.DFL) - z0Level : null, DFLlevel: bridge ? X.DFL : null,
      NWLz: bridge && isNum(X.NWL) ? Number(X.NWL) - z0Level : null,
      phreaticAbutLevel: phrAbut ?? (Number.isFinite(gw) ? gw : Number(X.NWL)),
      phreaticEdgeLevel: isNum(end.phreaticEdge) ? Number(end.phreaticEdge) : Number(X.NWL),
    },
    launchItems: [], hydraulicItems: [], impactItems: [], bridgeItems: [],
  };
  const NL = normaliseLoads(state);
  geom.models = bridge ? NL.models : [];
  geom.loadNotes = bridge ? NL.notes : [];
  geom.bridgeItems = bridge ? resolveBridgeLoads(state, endIdx + 1, geom, NL) : [];
  geom.launchItems = bridge ? (state.loads.launch || []).map((r) => ({
    tag: 'Q', src: 'launch', group: 'Con', label: r.name || 'Launch load', reversible: false, psi0: 1, psi1: 1, psi2: 0,
    Fz: Number(r.Fz) || 0, Fu: Number(r.Fu) || 0, Fv: Number(r.Fv) || 0, u: Number(r.u) || bearing.u, v: isNum(r.v) ? Number(r.v) : L / 2, z: isNum(r.z) ? Number(r.z) : bearing.zSeat,
  })) : [];
  if (bridge && geom.water.DFLz !== null && Number(X.DFL) > levels.formation) {
    const H = state.loads.hydraulic;
    const zb = Math.max(frontGround, levels.formation) - z0Level;
    const zt = Number(X.DFL) - z0Level;
    const h = zt - zb;
    if (h > 0) {
      const b = H.flowDir === 'u' ? L : baseFoot.B;
      const Fw = (0.5 * (Number(H.k) || 1.44) * 1000 * (Number(H.vm) || 0) ** 2 * h * b) / 1000;
      const dirV = H.flowDir !== 'u';
      if (Fw > 0) geom.hydraulicItems.push({ tag: 'Q', src: 'hydraulic', group: 'Qh', label: `Flowing water F = ½kρv²hb = ${Fw.toFixed(1)} kN (BS EN 1991-1-6 4.9)`, Fz: 0, Fu: dirV ? 0 : Fw, Fv: dirV ? Fw : 0, u: baseFoot.B / 2, v: L / 2, z0: zb, z1: zt, dir: dirV ? 'v' : 'u', psi0: 1, psi1: 1, psi2: 0 });
      const Fd = Number(H.debrisF) || 0;
      if (Fd > 0) geom.hydraulicItems.push({ tag: 'Q', src: 'hydraulic', group: 'Qh', label: `Debris ${Fd} kN${H.debrisSource ? ` (${H.debrisSource})` : ''}`, Fz: 0, Fu: dirV ? 0 : Fd, Fv: dirV ? Fd : 0, u: baseFoot.B / 2, v: L / 2, z0: Math.max(zb, zt - 0.5), z1: zt, dir: dirV ? 'v' : 'u', psi0: 1, psi1: 1, psi2: 0 });
    }
  }
  if (bridge && state.loads.impact.on && Number(state.loads.impact.F) > 0) {
    const I = state.loads.impact;
    const z = frontGround - z0Level + Number(I.height || 0);
    geom.impactItems.push({ tag: 'A', src: 'impact', group: 'A', label: `Vehicle impact ${I.F} kN`, Fz: 0, Fu: I.dir === 'u' ? Number(I.F) : 0, Fv: I.dir === 'v' ? Number(I.F) : 0, u: 0, v: L / 2, z0: z - 0.05, z1: z + 0.05, dir: I.dir, psi0: 1, psi1: 1, psi2: 1 });
  }
  return { geom, levels };
}

// External checks E1–E4 on one geometry (whole abutment or one zone).
function externalChecks(state, F, geom, situations) {
  const ctx = { state, F, geom, situations };
  const E1 = checkBearing(ctx);
  const E2 = checkSliding(ctx);
  const E3 = checkOverturning(ctx);
  const E4 = checkEccentricity(ctx, E1);
  return { ctx, E1, E2, E3, E4 };
}

const zoneName = (z, i) => `${z.kind === 'loaded' ? `Loaded zone (bearing${z.bearings.length > 1 ? 's' : ''} ${z.bearings.map((k) => k + 1).join(' + ')})` : `Unloaded zone ${i + 1}`}, v ${z.v0.toFixed(2)}–${z.v1.toFixed(2)} m`;

export function evaluateEnd(state, endIdx, opts = {}) {
  const end = state.ends[endIdx];
  const F = state.basis.factors;
  const warnings = [];
  const ground = processGround(state, endIdx);
  const layout = buildLayout(state, endIdx);
  if (state.project.mode !== 'bridge' && end.arrangement.L_mm % 400) {
    layout.errors = layout.errors.filter((e) => !e.includes('multiples of 400'));
    layout.warnings.unshift(`Per-metre-run analysis (L = ${end.arrangement.L_mm} mm) — block tiling and schedule not checked.`);
  }
  const { geom, levels } = buildGeom(state, endIdx, ground, layout);
  const situations = buildSituations(state, geom);
  const ctx = { state, F, geom, situations };

  // Load path through the blocks: E1–E4 per zone (loaded / unloaded).
  const Z = abutmentZones(state, geom, layout);
  const zoneRuns = Z.zones.map((z, i) => {
    const zg = z.full ? geom : zoneGeom(geom, z);
    const r = externalChecks(state, F, zg, situations);
    return { ...z, i, name: z.full ? 'Full length' : zoneName(z, Z.zones.filter((q) => q.kind === z.kind).indexOf(z)), L: z.v1 - z.v0, geom: zg, ...r };
  });
  const gov = (id) => zoneRuns.reduce((m, r) => (!m || r[id].util > m[id].util ? r : m), null);
  const pickCheck = (id) => {
    const r = gov(id);
    const c = { ...r[id], zone: r.name, zoneKind: r.kind };
    if (zoneRuns.length > 1 && c.steps?.length) c.steps = [{ title: `Governing zone: ${r.name}`, formula: 'Bearing loads reach only the blocks they bear on (no friction or tension on vertical joints); each zone is checked as its own prism', substitution: `L_zone = ${(r.L).toFixed(3)} m of ${geom.footing.L.toFixed(3)} m; dispersion: ${Z.mode}`, result: `Utilisation ${r[id].util.toFixed(3)}` }, ...c.steps];
    return c;
  };
  const E1 = pickCheck('E1');
  const E2 = pickCheck('E2');
  const E3 = pickCheck('E3');
  const E4 = pickCheck('E4');
  const ctxGov = gov('E4').ctx;
  // Whole-length results for comparison (validation page), not used in the verdict.
  const fullLength = opts.compare && zoneRuns.length > 1 ? (() => { const r = externalChecks(state, F, geom, situations); return { E1: r.E1.util, E2: r.E2.util, E3: r.E3.util, E4: r.E4.util }; })() : null;
  const E7 = checkBuoyancy(ctx);
  const I = checkInterfaces(ctx);
  const I4 = checkSubStacks(ctx, layout.planes);
  const local = checkLocal(ctx, layout);
  // Settlement under each zone; total = the largest. Along-face differential
  // = loaded vs unloaded; transverse = between separate bearing zones.
  const zSettle = zoneRuns.map((r) => ({ name: r.name, kind: r.kind, bearings: r.bearings, s: endSettlement(r.ctx, ground, r.E4.govQ, state.project.designLife) }));
  const govS = zSettle.reduce((m, x) => (x.s && (!m || x.s.total > m.s.total) ? x : m), null);
  const settle = govS ? { ...govS.s, zone: govS.name } : null;
  if (settle) {
    const ld = zSettle.filter((x) => x.kind === 'loaded' && x.s).map((x) => x.s.total);
    const ul = zSettle.filter((x) => x.kind === 'unloaded' && x.s).map((x) => x.s.total);
    settle.zones = zSettle.filter((x) => x.s).map((x) => ({ name: x.name, kind: x.kind, total: x.s.total }));
    settle.alongDiff = ld.length && ul.length ? Math.max(...ld) - Math.min(...ul) : 0;
    settle.transDiff = ld.length > 1 ? Math.max(...ld) - Math.min(...ld) : 0;
  }
  const plt = pltRequirement(E4.govQ, end.label);
  // Capping beam (full-length dispersion only).
  let capBeam = null;
  if (Z.mode === 'full' && state.project.mode === 'bridge' && (end.arrangement.dispersion || {}).capBeam?.on) {
    const C1 = F.C1;
    const per = (geom.bearings || []).map((b) => {
      const its = geom.bridgeItems.filter((it) => it.bearing === b.k);
      const G = its.filter((it) => it.group === 'G' || it.group === 'G2').reduce((a, it) => a + it.Fz, 0);
      const Q = Math.max(0, ...(geom.models || []).map((m) => its.filter((it) => it.group === 'Qv' && it.model === m.name).reduce((a, it) => a + it.Fz, 0)));
      return { v: b.v, P: C1.gGsup * G + C1.gQt * Q };
    });
    capBeam = capBeamCheck(state, geom, per);
  }

  // Construction (no-deck) summary for X6.
  const nd = (rows) => Math.max(0, ...rows.filter((r) => /no deck/.test(r.label)).map((r) => r.util));
  const construction = `sliding ${f3(nd(E2.rows))}, overturning ${f3(nd(E3.rows))}`;

  warnings.push(...ground.warnings, ...layout.warnings, ...levels.messages, ...Z.notes);
  if (levels.options.length) warnings.push(`Levels options: ${levels.options.join(' ')}`);
  if (ground.layers.some((l) => l.unsuitable && l.topLevel > levels.formation && l.baseLevel < levels.z0Level + 0.01)) {
    warnings.push('Unsuitable strata (topsoil, peat or made ground) within the pad depth — remove within the pad footprint and replace with compacted Type 1.');
  }
  if (geom.founding.unsuitable) warnings.push(`Founding stratum "${geom.founding.desc || geom.founding.cls}" is unsuitable — override with justification or found deeper.`);
  if (geom.groundFactor < 1) warnings.push(`Setback b = ${f2(geom.setback)} m < 2B — Vesic ground-inclination factor ${f3(geom.groundFactor)} applied to bearing (conservative); overall stability E5 must also pass.`);
  if (E2.legacy && E2.legacy.utilLeg > 1 && F.legacyOnly) warnings.push('Legacy sliding FoS below 1.5.');
  I4.forEach((s) => { if (s.util > 1) warnings.push(`${s.title}: ${s.what} utilisation ${f3(s.util)} > 1.`); });
  local.forEach((l) => (l.warnings || []).forEach((w) => warnings.push(w)));
  const OV = resolveOverrides(state);
  const sLim = OV.ends[endIdx]?.settlementLimit ?? 25;
  if (settle && settle.total > sLim) warnings.push(`${end.label}: settlement ${f1(settle.total)} mm exceeds the ${sLim} mm limit.`);
  if (E1.governing && E1.governing.soil && !Number.isFinite(E1.governing.util)) warnings.push('Bearing: resultant outside the base under a ULS combination.');

  const legacyNote = [];
  const intLegFail = I.rows.filter((r) => r.slideLeg && r.slideLeg.utilLeg > 1);
  if (intLegFail.length && F.legacyOnly) legacyNote.push(`Legacy internal sliding FoS < 1.5 at ${intLegFail.map((r) => r.label).join(', ')} with friction only (μ = ${state.basis.muBlock}). The Elite/CPL examples rely on interlock resistance not quantified in the Elite guide.`);
  warnings.push(...legacyNote);

  // Utilisation list.
  const u = [];
  const add = (id, title, util, extra = {}) => u.push({ id, title, util: Number.isFinite(util) ? util : 99, pass: Number.isFinite(util) && util <= 1 + 1e-9, ...extra });
  add('E1', 'Bearing', E1.util, { gov: F.legacyOnly ? E1.legacy?.label : E1.governing?.label, na: F.legacyOnly && !E1.legacy });
  add('E2', 'Sliding', E2.util, { gov: F.legacyOnly ? E2.legacy?.label : E2.governing?.label });
  add('E3', 'Overturning (EQU)', E3.util, { gov: F.legacyOnly ? E3.legacy?.label : E3.governing?.label });
  add('E4', 'Eccentricity', E4.util, { gov: E4.governing?.label });
  if (!E7.na) add('E7', 'Buoyancy', E7.util, { gov: E7.governing?.sit?.label });
  add('I1', 'Interface sliding', I.I1);
  add('I2', 'Interface toppling', I.I2);
  add('I3', 'Interface contact', I.I3);
  I4.forEach((s) => add(s.id, s.title, s.util, { gov: s.label }));
  local.filter((l) => !l.info || l.id === 'L2').forEach((l) => add(l.id, l.title, l.info ? Math.min(l.util, 1.5) : l.util, { info: l.info, flag: l.info && !l.pass }));
  if (settle) {
    settle.limit = sLim;
    add('E6', 'Settlement', settle.total / sLim, { gov: settle.zone });
    // E6t tilt of the base (rotation from the SLS pressure distribution) and
    // E6x transverse differential between bearings at this end.
    settle.tiltLimit = OV.crit.tilt;
    settle.transLimit = OV.crit.trans;
    add('E6t', `Tilt (limit 1 in ${OV.crit.tilt})`, (settle.tilt || 0) * OV.crit.tilt, { gov: settle.tilt > 0 ? `1 in ${Math.round(1 / settle.tilt)}` : 'level' });
    if (state.project.mode === 'bridge') add('E6x', `Transverse differential between bearings (limit ${OV.crit.trans} mm)`, (settle.transDiff || 0) / OV.crit.trans, { gov: `${f1(settle.transDiff || 0)} mm` });
  }
  if (capBeam) add('L5', 'Capping beam (verify)', capBeam.util);
  u.forEach((x) => { const c = { E1, E2, E3, E4 }[x.id]; if (c?.zone && zoneRuns.length > 1) x.zone = c.zone; });
  const na = new Set(u.filter((x) => x.na).map((x) => x.id));
  const util = u.filter((x) => !na.has(x.id));

  return {
    endIdx, label: end.label, geom, ground, layout, levels, situations, deckChar: deckCharacteristic(geom),
    dispersion: { mode: Z.mode, paths: Z.paths, zones: zoneRuns.map((r) => ({ name: r.name, kind: r.kind, v0: r.v0, v1: r.v1, L: r.L, bearings: r.bearings, E1: r.E1.util, E2: r.E2.util, E3: r.E3.util, E4: r.E4.util, s: zSettle[r.i]?.s?.total ?? null })), fullLength }, capBeam,
    checks: { E1, E2, E3, E4, E7 }, interfaces: I, I4, local, settle, plt, construction,
    intSteps: interfaceSteps(ctx, I.rows), util, warnings, errors: [...layout.errors, ...(levels.status === 'fail' ? levels.messages : [])],
    maxUtil: Math.max(0, ...util.filter((x) => !x.info).map((x) => x.util)),
  };
}

export function evaluate(state) {
  const bridge = state.project.mode === 'bridge';
  const endIdxs = bridge ? [0, 1] : [0];
  const ends = endIdxs.map((i) => evaluateEnd(state, i, { compare: true }));
  const crossing = bridge ? crossingChecks(state, ends) : null;
  const warnings = [];
  const errors = [];
  ends.forEach((e) => { e.warnings.forEach((w) => warnings.push(`${bridge ? `${e.label}: ` : ''}${w}`)); errors.push(...e.errors.map((x) => `${bridge ? `${e.label}: ` : ''}${x}`)); });

  let diff = null;
  const OV = resolveOverrides(state);
  OV.warnings.forEach((w) => warnings.push(w));
  if (bridge && ends[0].settle && ends[1].settle) {
    const d = Math.abs(ends[0].settle.total - ends[1].settle.total);
    diff = { d, limit: OV.crit.diff, util: d / OV.crit.diff, tilt: Number(state.project.span) > 0 ? d / 1000 / Number(state.project.span) : 0 };
    if (diff.util > 1) warnings.push(`Differential settlement ${f1(d)} mm exceeds ${diff.limit} mm.`);
  }
  const xFails = [];
  if (crossing) {
    crossing.ends.forEach((ce) => ce.items.forEach((it) => { if (it.status === 'fail') xFails.push(`End ${ce.end} ${it.id}: ${it.text}`); if (it.status === 'flag') warnings.push(`End ${ce.end} ${it.id}: ${it.text}`); }));
    if (crossing.x5 && crossing.x5.status === 'flag') warnings.push(`X5: ${crossing.x5.text}`);
  }

  if (bridge) loadWarnings(state, ends).forEach((w) => warnings.push(w));

  const hash = inputHash(state);
  const slope = state.cache?.slope && state.cache.slope.hash === hash ? state.cache.slope : null;
  const slopeStale = !!state.cache?.slope && !slope;
  if (bridge && !slope) warnings.push(slopeStale ? 'Overall stability (E5) results are stale — inputs changed since the last run. Re-run global stability.' : 'Overall stability (E5) not yet run — use "Run global stability".');
  if (slope) {
    slope.ends.forEach((se) => se.cases.forEach((c) => {
      if (c.governingODF < 1) warnings.push(`End ${se.end} E5 ${c.label}: ODF ${f3(c.governingODF)} < 1.0 for slips through or under the abutment.`);
      else if (c.bankODF < 1) warnings.push(`End ${se.end} E5 ${c.label}: bank-face slip ODF ${f3(c.bankODF)} < 1.0 (circle does not reach the abutment) — bank protection or regrading needed; check that regression cannot reach the abutment.`);
    }));
  }

  const maxUtil = Math.max(0, ...ends.map((e) => e.maxUtil), diff ? diff.util : 0);
  const slopeFail = slope ? slope.ends.some((se) => se.cases.some((c) => c.governingODF < 1)) : false;
  // Blocking states: the sheet is not valid and printing is disabled.
  const blocked = [];
  if (bridge) {
    if (state.crossing.watercourse !== false && !(Number(state.crossing.DFL) > 0)) blocked.push('Design flood level (DFL) is not set for a watercourse crossing — X3 freeboard is INCOMPLETE.');
    if (crossing?.span?.mismatch) blocked.push(`Span mismatch (X5): bearing-to-bearing span from the chainages ${f3(crossing.span.req)} m vs input span ${f3(Number(state.project.span))} m — update the span or the front-face chainages.`);
    if (!(state.loads.reactions || []).length) blocked.push('No bridge reactions entered.');
    (ends[0]?.geom.models || []).forEach((m) => { if (!m.standard) blocked.push(`Load model not chosen for traffic model "${m.name}".`); });
    if (bothEndsFixed(state)) {
      const TR = state.loads.thermalRestraint || {};
      if (!(TR.F !== null && TR.F !== '' && Number.isFinite(Number(TR.F)) && String(TR.justification || '').trim())) blocked.push('Both ends fixed: thermal restraint force and its justification are required.');
    }
  }
  ends.forEach((e) => {
    const A = state.ends[e.endIdx].arrangement;
    if (A.mode === 'auto') {
      const as = state.cache?.autosize?.[e.endIdx];
      if (!as) blocked.push(`${e.label}: auto-size mode selected but auto-size has not been run.`);
      else if (as.hash !== hash) blocked.push(`${e.label}: auto-size is stale — inputs changed since it ran. Re-run auto-size.`);
    }
    if (!Number.isFinite(Number(state.ends[e.endIdx].seatLevel))) blocked.push(`${e.label}: seat level missing.`);
  });
  const pass = maxUtil <= 1 + 1e-9 && !errors.length && !xFails.length && !slopeFail && !blocked.length;
  const dataFlags = [...LEGATO_DATA_FLAGS];
  return { ends, crossing, diff, slope, slopeStale, hash, warnings: [...new Set(warnings)], errors, xFails, maxUtil, pass, dataFlags, bridge, blocked, overrides: OV.list };
}

// Plausibility of the reaction schedule (amber, non-blocking) and the load
// basis note. Thresholds are screening values only — they catch a schedule
// entered in tonnes, not a design limit.

// Braking screening range per bridge (kN): BD37 6.10.1 (HA: 8 kN/m + 250 kN,
// ≤ 750 kN); EN 1991-2 4.4.1(2) (LM1: 180αQ1 ≤ Qlk ≤ 900 kN, UK NA αQ1 = 1).
function brakingRange(std, span) {
  if (std === 'BD37 HA') return [250 + 8 * Math.max(0, span), 750];
  if (std === 'EN 1991-2 LM1') return [180, 900];
  return null;
}

export function loadWarnings(state, ends) {
  const out = [];
  const msg = 'Check units — value looks like tonnes';
  const e0 = ends[0];
  const g = e0?.geom;
  if (!g) return out;
  (g.loadNotes || []).forEach((n) => out.push(`Traffic model: ${n}`));
  const nb = Math.max(1, g.bearings?.length || 1);
  const vehicular = !g.models.length || g.models.some((m) => m.standard !== 'Footbridge');
  const sumZ = (groups, model) => g.bridgeItems.filter((it) => groups.includes(it.group) && (!model || it.model === model)).reduce((a, it) => a + it.Fz, 0);
  const Gpb = sumZ(['G', 'G2']) / nb;
  if (vehicular && Gpb > 0 && Gpb < 20) out.push(`${msg}: permanent load ${Gpb.toFixed(1)} kN per bearing is below 20 kN for a vehicular bridge.`);
  g.models.forEach((m) => {
    const Qpb = sumZ(['Qv'], m.name) / nb;
    if (Qpb > 0 && Gpb > 0 && Qpb < Gpb && vehicular && m.standard !== 'Footbridge') out.push(`${msg}: ${m.name} vertical traffic ${Qpb.toFixed(1)} kN per bearing is less than the permanent load ${Gpb.toFixed(1)} kN.`);
    const rg = brakingRange(m.standard, Number(state.project.span) || 0);
    if (rg) {
      const brk = Math.max(0, ...ends.map((e) => Math.abs(e.geom.bridgeItems.filter((it) => it.group === 'Qb' && it.model === m.name).reduce((a, it) => a + Math.hypot(it.Fu, it.Fv), 0))));
      if (brk > 0 && (brk < 0.5 * rg[0] || brk > 1.5 * rg[1])) out.push(`${msg}: ${m.name} braking ${brk.toFixed(1)} kN per end is outside the range implied by ${m.standard} (${rg[0].toFixed(0)}–${rg[1].toFixed(0)} kN per bridge).`);
    }
    if (!m.standard) out.push(`Traffic model "${m.name}": load model standard not chosen — select it on the Loads step.`);
  });
  if (bothEndsFixed(state)) {
    const TR = state.loads.thermalRestraint || {};
    const ok = TR.F !== null && TR.F !== '' && Number.isFinite(Number(TR.F)) && String(TR.justification || '').trim();
    out.push(`Both ends have fixed bearings: braking and longitudinal wind act in full at each end, and the deck restrains thermal movement. ${ok ? `Thermal restraint force ${Number(TR.F).toFixed(1)} kN applied at the fixed bearings (${TR.justification}).` : 'Enter the thermal restraint force with its justification (Loads step) — a sliding-bearing friction value is not a substitute.'} Check against the supplier's bearing schedule.`);
  }
  if (g.models.some((m) => String(m.standard || '').startsWith('BD37')) && ['A2', 'A2-UKNA'].includes(state.basis.preset)) {
    out.push('BD37 nominal loads combined with EN 1990 A2 factors — basis to be justified (verify).');
  }
  return out;
}

export { f1, f2, f3 };

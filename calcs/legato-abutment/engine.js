// engine.js — evaluates one abutment end end-to-end (ground → layout →
// levels → actions → checks) and assembles the whole design output.

import { processGround, layerAt, foundingStratumTop } from './ground.js';
import { buildLayout, solveLevels } from './layout.js';
import { resolveBridgeLoads, buildSituations } from './actions.js';
import { checkBearing, checkSliding, checkOverturning, checkEccentricity, checkBuoyancy, f1, f2, f3 } from './checks-external.js';
import { checkInterfaces, checkSubStacks, interfaceSteps } from './checks-internal.js';
import { checkLocal } from './checks-local.js';
import { endSettlement } from './settlement.js';
import { crossingChecks, profileLevel, detectBank } from './crossing.js';
import { pltRequirement } from './spec.js';
import { inputHash } from './schema.js';
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
    const nb = Math.max(1, Number(P.bearingsPerEnd) || 1);
    const c = Number(P.bearingCentres) || 0;
    for (let k = 0; k < nb; k++) bearingPositions.push({ u, v: L / 2 + (k - (nb - 1) / 2) * c });
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
    bearing, bearingPositions, basis: layout.basis, layers: ground.layers, founding, passive, groundFactor, setback, beta,
    baseInclination: Number(state.basis.baseInclination) || 0, formationMuOverride: end.formationMuOverride,
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
  geom.bridgeItems = bridge ? resolveBridgeLoads(state, endIdx + 1, geom) : [];
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

export function evaluateEnd(state, endIdx) {
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

  const E1 = checkBearing(ctx);
  const E2 = checkSliding(ctx);
  const E3 = checkOverturning(ctx);
  const E4 = checkEccentricity(ctx, E1);
  const E7 = checkBuoyancy(ctx);
  const I = checkInterfaces(ctx);
  const I4 = checkSubStacks(ctx, layout.planes);
  const local = checkLocal(ctx, layout);
  const settle = endSettlement(ctx, ground, E4.govQ, state.project.designLife);
  const plt = pltRequirement(E4.govQ, end.label);

  // Construction (no-deck) summary for X6.
  const nd = (rows) => Math.max(0, ...rows.filter((r) => /no deck/.test(r.label)).map((r) => r.util));
  const construction = `sliding ${f3(nd(E2.rows))}, overturning ${f3(nd(E3.rows))}`;

  warnings.push(...ground.warnings, ...layout.warnings, ...levels.messages);
  if (levels.options.length) warnings.push(`Levels options: ${levels.options.join(' ')}`);
  if (ground.layers.some((l) => l.unsuitable && l.topLevel > levels.formation && l.baseLevel < levels.z0Level + 0.01)) {
    warnings.push('Unsuitable strata (topsoil, peat or made ground) within the pad depth — remove within the pad footprint and replace with compacted Type 1.');
  }
  if (geom.founding.unsuitable) warnings.push(`Founding stratum "${geom.founding.desc || geom.founding.cls}" is unsuitable — override with justification or found deeper.`);
  if (geom.groundFactor < 1) warnings.push(`Setback b = ${f2(geom.setback)} m < 2B — Vesic ground-inclination factor ${f3(geom.groundFactor)} applied to bearing (conservative); overall stability E5 must also pass.`);
  if (E2.legacy && E2.legacy.utilLeg > 1 && F.legacyOnly) warnings.push('Legacy sliding FoS below 1.5.');
  I4.forEach((s) => { if (s.util > 1) warnings.push(`${s.title}: ${s.what} utilisation ${f3(s.util)} > 1.`); });
  local.forEach((l) => (l.warnings || []).forEach((w) => warnings.push(w)));
  if (settle && settle.total > (end.settlementLimit || 25)) warnings.push(`${end.label}: settlement ${f1(settle.total)} mm exceeds the ${end.settlementLimit} mm limit.`);
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
  if (settle) add('E6', 'Settlement', settle.total / (end.settlementLimit || 25));
  const na = new Set(u.filter((x) => x.na).map((x) => x.id));
  const util = u.filter((x) => !na.has(x.id));

  return {
    endIdx, label: end.label, geom, ground, layout, levels, situations,
    checks: { E1, E2, E3, E4, E7 }, interfaces: I, I4, local, settle, plt, construction,
    intSteps: interfaceSteps(ctx, I.rows), util, warnings, errors: [...layout.errors, ...(levels.status === 'fail' ? levels.messages : [])],
    maxUtil: Math.max(0, ...util.filter((x) => !x.info).map((x) => x.util)),
  };
}

export function evaluate(state) {
  const bridge = state.project.mode === 'bridge';
  const endIdxs = bridge ? [0, 1] : [0];
  const ends = endIdxs.map((i) => evaluateEnd(state, i));
  const crossing = bridge ? crossingChecks(state, ends) : null;
  const warnings = [];
  const errors = [];
  ends.forEach((e) => { e.warnings.forEach((w) => warnings.push(`${bridge ? `${e.label}: ` : ''}${w}`)); errors.push(...e.errors.map((x) => `${bridge ? `${e.label}: ` : ''}${x}`)); });

  let diff = null;
  if (bridge && ends[0].settle && ends[1].settle) {
    const d = Math.abs(ends[0].settle.total - ends[1].settle.total);
    diff = { d, limit: state.basis.settlementDiffLimit || 20, util: d / (state.basis.settlementDiffLimit || 20) };
    if (diff.util > 1) warnings.push(`Differential settlement ${f1(d)} mm exceeds ${diff.limit} mm.`);
  }
  const xFails = [];
  if (crossing) {
    crossing.ends.forEach((ce) => ce.items.forEach((it) => { if (it.status === 'fail') xFails.push(`End ${ce.end} ${it.id}: ${it.text}`); if (it.status === 'flag') warnings.push(`End ${ce.end} ${it.id}: ${it.text}`); }));
    if (crossing.x5 && crossing.x5.status === 'flag') warnings.push(`X5: ${crossing.x5.text}`);
  }

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
  const pass = maxUtil <= 1 + 1e-9 && !errors.length && !xFails.length && !slopeFail;
  const dataFlags = [...LEGATO_DATA_FLAGS];
  return { ends, crossing, diff, slope, slopeStale, hash, warnings: [...new Set(warnings)], errors, xFails, maxUtil, pass, dataFlags, bridge };
}

export { f1, f2, f3 };

// checks-internal.js — every horizontal block interface (stack above):
// I1 sliding, I2 toppling (EQU), I3 contact (resultant and stress),
// I4 sub-stacks (ballast wall, seat course, separately standing parts, wings).

import { freeBody, factorItems, sums, resultantU, qpSituation } from './actions.js';
import { eachCombo, comboLabel, phiFillFor, toppleAt, signs, f1, f2, f3 } from './checks-external.js';
import { LEGATO_CONCRETE, LEGATO_INTERLOCK, LEGATO_GAMMA, NIB_BASES } from '../../js/shared-data.js';
import { designPhi, rad, KaRankine } from '../../js/geo-core.js';

const NIB_AREA_MM2 = 195 * 195;
// Design shear per counted nib from the selected basis: V × η / γ.
export function nibDesign(basis) {
  const key = basis.nibBasis || 'none';
  const b = key === 'user' ? { ...NIB_BASES.user, V: Number(basis.nibV) || 0, eta: Number(basis.nibEta) || 0, gamma: Number(basis.nibGamma) || 1 } : (NIB_BASES[key] || NIB_BASES.none);
  return { key, ...b, perNib: (b.V * b.eta) / (b.gamma || 1), on: key !== 'none' && b.V > 0 && b.eta > 0 };
}
const NET_FRACTION = 1 - (1 / 0.16) * (LEGATO_INTERLOCK.recess.base / 1000) ** 2; // one recess per 400×400 grid cell

function contactOf(geom, k) {
  const lo = geom.courses[k - 1], up = geom.courses[k];
  return { cf: Math.max(lo.u0, up.u0), cr: Math.min(lo.u1, up.u1), v0: Math.max(lo.v0, up.v0), v1: Math.min(lo.v1, up.v1), z: lo.z1 };
}

// Male nibs of course k engaged under blocks of course k+1.
export function engagedNibs(geom, k, part = null) {
  const lo = geom.courses[k - 1], up = geom.courses[k];
  if (!lo || !up || !lo.pieces?.length || !up.pieces?.length) return 0;
  let n = 0;
  lo.pieces.forEach((p) => {
    if (!p.male) return;
    for (let u = p.u0 + 0.2; u < p.u1 - 1e-6; u += 0.4) {
      if (part && (u < part[0] || u > part[1])) continue;
      for (let v = p.v0 + 0.2; v < p.v1 - 1e-6; v += 0.4) {
        if (up.pieces.some((q) => u > q.u0 && u < q.u1 && v > q.v0 && v < q.v1)) n++;
      }
    }
  });
  return n;
}

function slideInterface(ctx, items, dir, cat, k, part = null) {
  const { V } = sums(items);
  const Hu = items.reduce((s, i) => s + i.Fu, 0) * dir;
  const Hv = items.reduce((s, i) => s + i.Fv, 0);
  const H = Math.hypot(Math.max(0, Hu), Hv);
  const mu = ctx.state.basis.muBlock ?? 0.5;
  const uls = ['C1', 'C2', 'EQU', 'ACC'].includes(cat);
  const gmu = uls && ctx.state.basis.gammaMuOn ? 1.25 : 1;
  const Rf = (Math.max(0, V) * mu) / gmu;
  let Rn = 0, nNib = 0;
  const nd = nibDesign(ctx.state.basis);
  if (nd.on && k) {
    nNib = engagedNibs(ctx.geom, k, part);
    Rn = nNib * nd.perNib;
  }
  return { V, H, Hu, Hv, Rf, Rn, nNib, Rd: Rf + Rn, util: H > 1e-9 ? H / (Rf + Rn) : 0, mu, gmu };
}

function contactCheck(items, c, L) {
  const { V, uR } = resultantU(items, c.z);
  const b = c.cr - c.cf;
  const e = uR - (c.cf + c.cr) / 2;
  const Ln = c.v1 - c.v0;
  const Anet = b * Ln * NET_FRACTION;
  let sigma;
  if (Math.abs(e) <= b / 6) sigma = (V / Anet) * (1 + (6 * Math.abs(e)) / b);
  else { const x = b / 2 - Math.abs(e); sigma = x > 0 ? (2 * V) / (3 * x * Ln * NET_FRACTION) : Infinity; }
  return { V, uR, e, b, Anet, sigma: sigma / 1000 }; // N/mm²
}

export function checkInterfaces(ctx) {
  const { geom } = ctx;
  const n = geom.courses.length;
  const rows = [];
  for (let k = 1; k < n; k++) {
    const c = contactOf(geom, k);
    const cut = { kind: 'interface', k };
    const row = { k, z: c.z, label: `C${k}/C${k + 1}`, b: c.cr - c.cf, slide: null, slideSLS: null, slideLeg: null, topple: null, toppleLeg: null, contactSLS: null, contactULS: null };
    eachCombo(ctx, ['C1', 'C2', 'SLSc', 'LEG', 'EQU', 'ACC'], (sit, cat, sign) => {
      const phiFill = phiFillFor(ctx, cat === 'ACC' ? 'LEG' : cat);
      const fb = freeBody(geom, cut, { sit, phiFill });
      if (cat !== 'EQU') {
        [-1, 1].forEach((dir) => {
          const items = factorItems(fb.items, { F: ctx.F, cat, sit, check: 'slide', dir, sign });
          const r = slideInterface(ctx, items, dir, cat, k);
          if (r.H <= 1e-9) return;
          r.label = comboLabel(sit, cat, sign, dir);
          r.cat = cat;
          if (cat === 'SLSc') { if (!row.slideSLS || r.util > row.slideSLS.util) row.slideSLS = r; }
          else if (cat === 'LEG') { r.fos = r.Rd / r.H; r.req = ctx.F.legacy?.sliding ?? 1.5; r.utilLeg = r.req / r.fos; if (!row.slideLeg || r.utilLeg > row.slideLeg.utilLeg) row.slideLeg = r; }
          else if (!row.slide || r.util > row.slide.util) row.slide = r;
        });
      }
      if (cat === 'EQU' || cat === 'LEG' || cat === 'ACC') {
        [[-1, c.cf], [1, c.cr]].forEach(([dir, u]) => {
          const pivot = { u, z: c.z };
          const items = factorItems(fb.items, { F: ctx.F, cat, sit, check: 'topple', dir, pivot, sign });
          const r = { ...toppleAt(items, pivot, dir), label: comboLabel(sit, cat, sign, dir), cat, pivot, dir };
          if (r.Mdst <= 1e-9) return;
          if (cat === 'LEG') { r.req = ctx.F.legacy?.toppling ?? 1.5; r.utilLeg = r.req / r.fos; if (!row.toppleLeg || r.utilLeg > row.toppleLeg.utilLeg) row.toppleLeg = r; }
          else if (!row.topple || r.util > row.topple.util) row.topple = r;
        });
      }
      if (cat === 'SLSc') {
        // Kern (no-gap) criterion under quasi-permanent loading; the
        // characteristic eccentricity is reported for information.
        const qp = qpSituation(sit);
        const r = contactCheck(factorItems(fb.items, { F: ctx.F, cat, sit: qp, check: 'sls', sign }), c, geom.L);
        r.util = Math.abs(r.e) / (r.b / 6);
        r.label = comboLabel(qp, 'SLSqp', sign);
        if (!row.contactSLS || r.util > row.contactSLS.util) row.contactSLS = r;
        const rc = contactCheck(factorItems(fb.items, { F: ctx.F, cat, sit, check: 'sls', sign }), c, geom.L);
        rc.ratio = Math.abs(rc.e) / (rc.b / 6);
        rc.label = comboLabel(sit, cat, sign);
        if (!row.contactChar || rc.ratio > row.contactChar.ratio) row.contactChar = rc;
      }
      if (cat === 'C1' || cat === 'C2') {
        const items = factorItems(fb.items, { F: ctx.F, cat, sit, check: 'bearing', gMode: 'sup', sign });
        const r = contactCheck(items, c, geom.L);
        r.utilE = Math.abs(r.e) / (r.b / 3);
        r.utilS = r.sigma / LEGATO_CONCRETE.fcdPl;
        r.util = Math.max(r.utilE, r.utilS);
        r.label = comboLabel(sit, cat, sign);
        if (!row.contactULS || r.util > row.contactULS.util) row.contactULS = r;
      }
    });
    row.nNib = engagedNibs(geom, k);
    row.role = geom.courses[k].role;
    rows.push(row);
  }
  const legacyOnly = ctx.F.legacyOnly;
  const pick = (r, a, b) => (legacyOnly ? (r[b]?.utilLeg ?? 0) : (r[a]?.util ?? 0));
  const I1 = Math.max(0, ...rows.map((r) => Math.max(pick(r, 'slide', 'slideLeg'), r.slideSLS?.util ?? 0)));
  const I2 = Math.max(0, ...rows.map((r) => pick(r, 'topple', 'toppleLeg')));
  const I3 = Math.max(0, ...rows.map((r) => Math.max(r.contactSLS?.util ?? 0, r.contactULS?.util ?? 0)));
  return { rows, I1, I2, I3 };
}

export function interfaceSteps(ctx, rows) {
  const steps = [];
  const gov = rows.reduce((m, r) => ((r.slide?.util ?? 0) > (m?.slide?.util ?? -1) ? r : m), null);
  if (gov && gov.slide) {
    const s = gov.slide;
    const nd = nibDesign(ctx.state.basis);
    steps.push({ title: `I1 governing interface ${gov.label} (z = ${f2(gov.z)} m) — ${s.label}`, formula: `Hd ≤ μ·Vd,fav / γμ${nd.on ? ' + n_nib × V × η / γ (nib interlock)' : ' (friction only)'}`, substitution: `Vd,fav = ${f1(s.V)} kN, μ = ${s.mu}${s.gmu > 1 ? ' / 1.25' : ''}${nd.on ? `; nibs n = ${s.nNib} × ${f1(nd.V)} × ${nd.eta} / ${nd.gamma} = ${f1(s.Rn)} kN` : ''}; Hd = ${f1(s.H)} kN`, result: `Rd = ${f1(s.Rd)} kN; utilisation ${f3(s.util)}` });
  }
  const govT = rows.reduce((m, r) => ((r.topple?.util ?? 0) > (m?.topple?.util ?? -1) ? r : m), null);
  if (govT && govT.topple) {
    const t = govT.topple;
    steps.push({ title: `I2 governing interface ${govT.label} — ${t.label}`, formula: `Moments about the ${t.dir < 0 ? 'front' : 'rear'} edge of contact (u = ${f3(t.pivot.u)} m)`, substitution: `Mdst = ${f1(t.Mdst)} kNm, Mstb = ${f1(t.Mstb)} kNm`, result: `Utilisation ${f3(t.util)}` });
  }
  const govC = rows.reduce((m, r) => ((r.contactULS?.util ?? 0) > (m?.contactULS?.util ?? -1) ? r : m), null);
  if (govC && govC.contactULS) {
    const c = govC.contactULS;
    steps.push({ title: `I3 contact at ${govC.label} — ${c.label}`, formula: 'e ≤ b/3 (ULS), b/6 (SLS); σ_max on net area (gross − recesses) ≤ fcd,pl = 16.0 N/mm²', substitution: `b = ${f3(c.b)} m, e = ${f3(c.e)} m, A_net = ${f3(c.Anet)} m²`, result: `σ_max = ${f2(c.sigma)} N/mm²; utilisation ${f3(c.util)}` });
  }
  return steps;
}

// --- I4 sub-stacks -------------------------------------------------------------

export function checkSubStacks(ctx, layoutPlanes) {
  const { geom } = ctx;
  const out = [];
  const seatIdx = geom.seatIdx;
  const ballastIdx = geom.ballastIdx;

  // (a) Ballast wall alone — its own base interface.
  if (ballastIdx && ballastIdx > 1) {
    const k = ballastIdx - 1;
    let worst = null;
    eachCombo(ctx, ['C1', 'C2', 'EQU', 'LEG'], (sit, cat, sign) => {
      const fb = freeBody(geom, { kind: 'interface', k }, { sit, phiFill: phiFillFor(ctx, cat) });
      if (cat !== 'EQU') {
        const r = slideInterface(ctx, factorItems(fb.items, { F: ctx.F, cat, sit, check: 'slide', dir: -1, sign }), -1, cat, k);
        const util = cat === 'LEG' ? (ctx.F.legacy.sliding) / (r.Rd / Math.max(r.H, 1e-9)) : r.util;
        if (!ctx.F.legacyOnly && cat === 'LEG') return;
        if (!worst || util > worst.util) worst = { util, what: 'sliding', label: comboLabel(sit, cat, sign, -1), H: r.H, R: r.Rd };
      }
      if (cat === 'EQU' || cat === 'LEG') {
        const c = contactOf(geom, k);
        const t = toppleAt(factorItems(fb.items, { F: ctx.F, cat, sit, check: 'topple', dir: -1, pivot: { u: c.cf, z: c.z }, sign }), { u: c.cf, z: c.z }, -1);
        const util = cat === 'LEG' ? ctx.F.legacy.toppling / t.fos : t.util;
        if ((cat === 'LEG') !== !!ctx.F.legacyOnly) return;
        if (!worst || util > worst.util) worst = { util, what: 'toppling', label: comboLabel(sit, cat, sign, -1), H: t.Mdst, R: t.Mstb };
      }
    });
    if (worst) out.push({ id: 'I4a', title: 'Ballast wall alone (earth + surcharge + compaction)', ...worst });
  }

  // (b) Seat course alone under braking — ballast wall weight ignored for
  // channel-direction loads (it assists only for landward loads).
  if (seatIdx && seatIdx > 1) {
    const k = seatIdx - 1;
    let worst = null;
    eachCombo(ctx, ['C1', 'C2', 'EQU'], (sit, cat, sign) => {
      if (!sit.deck) return;
      // Seat + deck under braking and the earth on the seat's own height;
      // the ballast wall (weight and its own thrust) is a separate body (I4a).
      const fb = freeBody(geom, { kind: 'interface', k }, { sit, phiFill: phiFillFor(ctx, cat), excludeCourse: ballastIdx, earthTop: geom.courses[seatIdx - 1].z1 });
      const items0 = fb.items;
      if (cat !== 'EQU') {
        const r = slideInterface(ctx, factorItems(items0, { F: ctx.F, cat, sit, check: 'slide', dir: -1, sign }), -1, cat, k);
        if (!worst || r.util > worst.util) worst = { util: r.util, what: 'sliding', label: comboLabel(sit, cat, sign, -1), H: r.H, R: r.Rd };
      } else {
        const c = contactOf(geom, k);
        const t = toppleAt(factorItems(items0, { F: ctx.F, cat, sit, check: 'topple', dir: -1, pivot: { u: c.cf, z: c.z }, sign }), { u: c.cf, z: c.z }, -1);
        if (!worst || t.util > worst.util) worst = { util: t.util, what: 'toppling', label: comboLabel(sit, cat, sign, -1), H: t.Mdst, R: t.Mstb };
      }
    });
    if (worst && !ctx.F.legacyOnly) out.push({ id: 'I4b', title: 'Seat course alone under braking (ballast wall not assisting, channel direction)', ...worst });
  }

  // (c) Parts separated by continuous vertical joint planes (sliding).
  (layoutPlanes || []).forEach((pl) => {
    const k = pl.from - 1;
    const cut = k === 0 ? { kind: 'base' } : { kind: 'interface', k };
    let worst = null;
    eachCombo(ctx, ctx.F.legacyOnly ? ['LEG'] : ['C1', 'C2'], (sit, cat, sign) => {
      const phiFill = phiFillFor(ctx, cat);
      const front = factorItems(freeBody(geom, cut, { sit, phiFill, part: [-1e6, pl.u] }).items, { F: ctx.F, cat, sit, check: 'slide', dir: -1, sign });
      const rear = factorItems(freeBody(geom, cut, { sit, phiFill, part: [pl.u, 1e6] }).items, { F: ctx.F, cat, sit, check: 'slide', dir: -1, sign });
      const rf = slideInterface(ctx, front, -1, cat, k || null, [-1e6, pl.u]);
      const rr = slideInterface(ctx, rear, -1, cat, k || null, [pl.u, 1e6]);
      const excess = Math.max(0, rr.H - rr.Rd);
      const util = (rf.H + excess) / Math.max(rf.Rd, 1e-9) * (cat === 'LEG' ? ctx.F.legacy.sliding : 1);
      if (!worst || util > worst.util) worst = { util, what: 'sliding', label: comboLabel(sit, cat, sign, -1), H: rf.H + excess, R: rf.Rd };
    });
    if (worst) out.push({ id: 'I4c', title: `Front part at u < ${pl.u.toFixed(1)} m (continuous joint through C${pl.from}–C${pl.to})`, ...worst });
  });

  // (d) Wing returns as free-standing gravity sections (per metre run).
  const W = ctx.state.ends[geom.endIdx].arrangement.wings;
  if (W && W.on && ctx.state.project.mode === 'bridge') {
    const h = Math.min(W.courses * 0.8, Math.max(0, geom.zFill));
    const b = 0.8;
    const gEq = LEGATO_GAMMA * 0.99;
    const q = ctx.state.loads.surcharge;
    let worst = null;
    ['C1', 'C2', 'EQU'].forEach((cat) => {
      const f = ctx.F[cat];
      const phi = designPhi(geom.fill.phi, ctx.F[f.M].gPhi);
      const Ka = KaRankine(phi);
      const Wt = b * W.courses * 0.8 * gEq;
      const Pe = 0.5 * Ka * geom.fill.gamma * h * h;
      const Pq = Ka * q * h;
      if (cat === 'EQU') {
        const util = (f.gGsup * Pe * h / 3 + f.gQt * Pq * h / 2) / (f.gGinf * Wt * b / 2);
        if (!worst || util > worst.util) worst = { util, what: 'toppling', label: 'EQU — wing return', H: f.gGsup * Pe + f.gQt * Pq, R: f.gGinf * Wt };
      } else {
        const tanD = Math.tan(rad((2 / 3) * (geom.founding.phi || 30))) / ctx.F[f.M].gPhi;
        const util = (f.gGsup * Pe + f.gQt * Pq) / (f.gGinf * Wt * tanD);
        if (!worst || util > worst.util) worst = { util, what: 'sliding', label: `${cat === 'C1' ? 'DA1-C1' : 'DA1-C2'} — wing return`, H: f.gGsup * Pe + f.gQt * Pq, R: f.gGinf * Wt * tanD };
      }
    });
    out.push({ id: 'I4d', title: `Wing return (${W.courses} course(s), 800 wide, retaining ${f2(h)} m)`, ...worst });
  }
  return out;
}

export { NET_FRACTION };

// crossing.js — X1 setback and influence zone, X2 scour, X3 flood and
// freeboard, X4 regulatory proximity, X5 span feedback, X6 construction.

import { surfaceY } from './slope.js';
import { rad, deg } from '../../js/geo-core.js';
import { f1, f2, f3 } from './checks-external.js';

export function profileLevel(state, ch) {
  const prof = [...(state.crossing.profile || [])].sort((a, b) => a.ch - b.ch).map((p) => [Number(p.ch), Number(p.level)]);
  return prof.length ? surfaceY(prof, ch) : NaN;
}

// Bank crest and toe detection for one end (simple heuristic): crest =
// highest point between the abutment and the channel bed; toe = first point
// within 10% of the bank height above the bed, walking landward from the bed.
export function detectBank(state, endIdx) {
  const prof = [...(state.crossing.profile || [])].sort((a, b) => a.ch - b.ch);
  if (prof.length < 3) return null;
  const bedIdx = prof.reduce((m, p, i) => (p.level < prof[m].level ? i : m), 0);
  const side = endIdx === 0 ? prof.slice(0, bedIdx + 1) : prof.slice(bedIdx).reverse();
  const crest = side.reduce((m, p) => (p.level > m.level ? p : m), side[0]);
  const bed = prof[bedIdx].level;
  const h = crest.level - bed;
  const walk = [...side].reverse();
  const toe = walk.find((p) => p.level >= bed + 0.1 * h && p.level < crest.level) || prof[bedIdx];
  // Toe = last point near bed level walking landward.
  let toePt = prof[bedIdx];
  for (const p of walk) { if (p.level <= bed + 0.1 * h) toePt = p; else break; }
  return { crest: { ch: crest.ch, level: crest.level }, toe: { ch: (toePt || toe).ch, level: (toePt || toe).level } };
}

export function crossingChecks(state, endRes) {
  const X = state.crossing;
  const P = state.project;
  const out = { ends: [], warnings: [] };
  endRes.forEach((er, i) => {
    const g = er.geom;
    const end = state.ends[i];
    const sL = i === 0 ? -1 : 1;
    const ch = (u) => g.frontChainage + sL * u;
    const bank = detectBank(state, i) || {};
    const crest = end.bankCrest?.ch !== null && end.bankCrest?.ch !== undefined && end.bankCrest?.ch !== '' ? { ch: Number(end.bankCrest.ch), level: Number(end.bankCrest.level ?? profileLevel(state, end.bankCrest.ch)) } : bank.crest;
    const toe = end.bankToe?.ch !== null && end.bankToe?.ch !== undefined && end.bankToe?.ch !== '' ? { ch: Number(end.bankToe.ch), level: Number(end.bankToe.level ?? profileLevel(state, end.bankToe.ch)) } : bank.toe;
    const r = { end: i + 1, crest, toe, items: [] };
    if (!crest || !toe) { r.items.push({ id: 'X1', title: 'Setback', status: 'info', text: 'Bank crest/toe not defined — enter them or a long section.' }); out.ends.push(r); return; }
    const B = g.baseFoot.B;
    const padFrontCh = ch(g.pad.t > 0 ? g.pad.u0 : g.courses[0].u0);
    const b = (g.frontChainage - crest.ch) * sL;
    const bPad = (padFrontCh - crest.ch) * sL;
    const H = crest.level - toe.level;
    const beta = deg(Math.atan2(Math.max(H, 0), Math.max(Math.abs(crest.ch - toe.ch), 1e-6)));
    r.b = b; r.bPad = bPad; r.beta = beta; r.B = B;

    // X1 influence line from the toe (or scour level at the toe).
    const theta = X.thetaInfMode === '45' ? 45 : X.thetaInfMode === 'user' ? Number(X.thetaInf) : (g.bankPhi || 30);
    const scourDs = end.scour?.assessed ? Number(end.scour.ds) || 0 : 0;
    const startLevel = toe.level - scourDs;
    const lineAt = (c) => startLevel + Math.tan(rad(theta)) * (c - toe.ch) * sL;
    const padRearCh = ch(g.pad.t > 0 ? g.pad.u1 : g.courses[0].u1);
    const inWedge = g.formationLevel > lineAt(padFrontCh) + 1e-6 || g.formationLevel > lineAt(padRearCh) + 1e-6;
    r.theta = theta; r.lineAt = lineAt; r.inWedge = inWedge; r.startLevel = startLevel;
    r.items.push({
      id: 'X1', title: 'Setback and influence zone', status: inWedge ? 'flag' : 'ok',
      text: `Setback from bank crest to base front toe b = ${f2(b)} m (to pad edge ${f2(bPad)} m); b/B = ${f2(b / B)}${b >= 2 * B ? ' (≥ 2B)' : ' (< 2B)'}. Influence line from ${scourDs ? 'scour level' : 'bank toe'} ${f3(startLevel)} mAOD at θinf = ${f1(theta)}°: level ${f3(lineAt(padFrontCh))} at the pad front.${inWedge ? ' Foundation loads the potential bank failure wedge — E5 governs; consider increased setback or deeper founding.' : ' Formation below the influence line.'}`,
    });

    // X2 scour.
    const frontLevel = g.frontGroundLevel;
    const inFlood = Number.isFinite(X.DFL) && (frontLevel < X.DFL || g.formationLevel < X.DFL);
    let x2;
    if (inFlood && !end.scour?.assessed) x2 = { status: 'fail', text: 'FAIL — abutment within the flood extent and scour not assessed: scour assessment required (CIRIA C742 / DMRB CD 356).' };
    else if (end.scour?.assessed && inWedge) x2 = { status: 'flag', text: `Influence line from the scour level (d_s = ${f2(scourDs)} m${end.scour.source ? `, ${end.scour.source}` : ''}) intersects the formation — provide scour protection or found deeper.` };
    else if (end.scour?.assessed) x2 = { status: 'ok', text: `Scour assessed (d_s = ${f2(scourDs)} m${end.scour.source ? `, ${end.scour.source}` : ''}); formation below the scour influence line.` };
    else x2 = { status: 'info', text: 'Abutment outside the design flood extent; scour not assessed.' };
    r.items.push({ id: 'X2', title: 'Scour', ...x2 });

    // X3 flood and freeboard.
    const soffit = end.soffitOverride !== null && end.soffitOverride !== undefined && end.soffitOverride !== '' ? Number(end.soffitOverride) : g.seatLevel + ((state.ends[i].arrangement.bearingGrout || 0) + P.bearingHeight) / 1000;
    const fb = soffit - X.DFL;
    r.soffit = soffit; r.freeboard = fb;
    const conv = padFrontCh * sL < crest.ch * sL + 1e-9 && g.formationLevel < X.DFL;
    r.items.push({ id: 'X3', title: 'Flood and freeboard', status: fb + 1e-9 >= P.freeboardRequired ? 'ok' : 'fail', util: P.freeboardRequired > 0 ? P.freeboardRequired / Math.max(fb, 1e-6) : 0, text: `Freeboard = soffit ${f3(soffit)} − DFL ${f3(X.DFL)} = ${f3(fb)} m vs ${f2(P.freeboardRequired)} m required${X.DFLlabel ? ` (${X.DFLlabel})` : ''}.${g.formationLevel < X.DFL ? ' Flood and buoyancy cases activated.' : ''}${conv ? ' Abutment/pad encroaches below DFL within the channel — conveyance/obstruction to be agreed with the regulator.' : ''}` });

    // X4 regulatory proximity.
    const buf = Number(X.regulatoryBuffer) || 0;
    r.items.push({ id: 'X4', title: 'Regulatory proximity', status: 'info', text: `Nearest works (pad front) ${f2(bPad)} m from the bank top vs ${buf} m buffer — ${bPad < buf ? 'within buffer: flood risk activity permit / consent likely required — confirm with regulator.' : 'outside buffer (information only).'}` });

    // X6 construction information.
    const exc = frontLevel - g.formationLevel;
    const s3 = er.construction;
    r.items.push({ id: 'X6', title: 'Construction', status: 'info', text: `No-deck case (S3): ${s3}. Formation excavation ${f2(exc)} m deep, ${f2(bPad)} m from the bank crest${exc > 1.2 ? ' — batter or support needed (excavation deeper than 1.2 m); check against the E5 construction case.' : '.'}` });
    out.ends.push(r);
  });

  // X5 span feedback (both ends).
  if (endRes.length === 2 && out.ends.every((e) => e.crest)) {
    const g1 = endRes[0].geom, g2 = endRes[1].geom;
    const b1 = g1.frontChainage - g1.bearing.u, b2 = g2.frontChainage + g2.bearing.u;
    const req = b2 - b1;
    const inc = Number(P.modularIncrement) || 0;
    const sepFront = g2.frontChainage - g1.frontChainage;
    const topWidth = out.ends[1].crest.ch - out.ends[0].crest.ch;
    const minSep = topWidth + 2 * (Number(X.minSetback) || 0);
    let text = `Bearing-to-bearing span from chainages = ${f3(req)} m (input span ${f3(P.span)} m${Math.abs(req - P.span) > 0.025 ? ' — MISMATCH, update the span or the front-face chainages' : ''}).`;
    if (inc > 0) {
      const n = Math.ceil(req / inc - 1e-9);
      const up = n * inc, dn = (n - 1) * inc;
      text += ` Nearest modular spans ${f3(dn)} / ${f3(up)} m; ${f3(up)} m gives a setback margin of ${f3((up - req) / 2)} m per end.`;
    }
    if (sepFront < minSep) text += ` Abutment separation ${f2(sepFront)} m is less than channel top width ${f2(topWidth)} m + minimum setbacks — increase span.`;
    out.span = { req, sepFront, topWidth, text, mismatch: Math.abs(req - P.span) > 0.025 };
    out.x5 = { id: 'X5', title: 'Span feedback', status: out.span.mismatch || sepFront < minSep ? 'flag' : 'ok', text };
  }
  return out;
}

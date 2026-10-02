// drawings.js — SVG drawing generators (print-safe, scaled, each with a
// title strip, scale bar and legend). D1 crossing long section, D2 abutment
// section, D3 layer plans, D4 transverse section, D5 SPT plot, D6
// utilisation chart. All take (state, design) where design = evaluate().

import { makeView, svgDoc, line, polyline, polygon, rect, circle, path, text, arrow, dimH, dimV, levelTag, legend, scaleBar, titleStrip, HATCH } from '../../js/svg-kit.js';
import { LEGATO_BLOCKS } from '../../js/shared-data.js';
import { earthCoefficient, factorItems, freeBody } from './actions.js';
import { expandSimpleBorehole } from './ground.js';

const INK = '#1A1E28', NAVY = '#1C2B55', ORANGE = '#E27A00', BLUE = '#2f6fa3', GREY = '#8a8f9c';

// BB drawing convention: LG4 red, LG8 green, LG7 orange, special LG8
// yellow, special LG7 cyan. Other codes chosen to be distinct.
export const BLOCK_COLOURS = { LG1: '#c9b8ea', LG2: '#a1887f', LG3: '#b0bec5', LG4: '#e53935', LG5: '#f48fb1', LG6: '#26a69a', LG7: '#fb8c00', LG8: '#43a047' };
const SPECIAL = { LG8: '#fdd835', LG7: '#00bcd4' };
export function blockColour(code, special) {
  if (special) return SPECIAL[code] || '#fff59d';
  return BLOCK_COLOURS[code] || '#ddd';
}
const hatchFor = (cls) => ({ Granular: HATCH.granular, Cohesive: HATCH.cohesive, 'Made ground': HATCH.madeGround, Peat: HATCH.peat, Topsoil: HATCH.topsoil, Rock: HATCH.rock, 'Weathered rock': HATCH.rock }[cls] || HATCH.granular);
const url = (id) => `url(#${id})`;
const fx = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : '—');

function blockLegendItems(layout) {
  const seen = new Map();
  (layout?.courses || []).forEach((c) => (c.pieces || []).forEach((p) => { const k = `${p.code}${p.special ? '*' : ''}`; if (!seen.has(k)) seen.set(k, { code: p.code, special: p.special }); }));
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code)).map((b) => ({ label: `${b.code}${b.special ? ' special' : ''}${LEGATO_BLOCKS[b.code]?.male ? ' (male + female)' : ' (female only)'}`, fill: blockColour(b.code, b.special) }));
}

// Pieces cut by a section at v = vCut (for elevations/sections).
function sectionPieces(course, vCut) {
  if (!course.pieces || !course.pieces.length) return [{ u0: course.u0, u1: course.u1, code: `C${course.idx}`, untiled: true }];
  return course.pieces.filter((p) => vCut >= p.v0 - 1e-9 && vCut < p.v1 - 1e-9);
}

function nibBumps(view, p, zTop) {
  if (!LEGATO_BLOCKS[p.code]?.male) return '';
  let out = '';
  for (let u = p.u0 + 0.2; u < p.u1 - 1e-6; u += 0.4) {
    const x = view.X(u), y = view.Y(zTop);
    const hb = view.L(0.0975), ht = view.L(0.035), h = Math.max(view.LY(0.06), 1.2);
    out += polygon([[x - hb, y], [x - ht, y - h], [x + ht, y - h], [x + hb, y]], { fill: '#555', stroke: '#333', width: 0.3 });
  }
  return out;
}

// --- D2 Abutment section ------------------------------------------------------

export function diagramD2(state, design, endIdx = 0, opts = {}) {
  const er = design.ends[Math.min(endIdx, design.ends.length - 1)];
  if (!er) return '';
  const g = er.geom, lay = er.layout, P = state.project;
  const bridge = state.project.mode === 'bridge';
  const compact = !!opts.compact;
  const W = compact ? 480 : 900, H = compact ? 360 : 620;
  const z0 = g.z0Level;
  const rear = Math.max(g.pad.u1, ...g.courses.map((c) => c.u1));
  const uL = Math.min(g.pad.u0, 0) - (compact ? 1.0 : 1.8);
  const uR = rear + (compact ? 1.4 : 2.4);
  const zTop = Math.max(g.zFill, ...g.courses.map((c) => c.z1)) + (bridge ? (P.deckDepth || 0.9) + 0.6 : 0.6);
  const zBot = -g.pad.t - (compact ? 0.9 : 1.6);
  const view = makeView({ x0: uL, x1: uR, y0: zBot, y1: zTop }, { width: W, height: H, pad: compact ? 18 : 46, padBottom: compact ? 22 : 70, padTop: compact ? 18 : 40 });
  const X = view.X, Y = (z) => view.Y(z);
  let o = '';

  // Ground: natural below formation, front ground, fill behind.
  const fz = g.frontGroundLevel - z0;
  const fLayer = g.founding;
  o += rect(X(uL), Y(-g.pad.t), X(uR) - X(uL), Y(zBot) - Y(-g.pad.t), { fill: url(hatchFor(fLayer.cls)), stroke: 'none' });
  o += polygon([[X(uL), Y(fz)], [X(g.pad.t > 0 ? g.pad.u0 : 0), Y(fz)], [X(g.pad.t > 0 ? g.pad.u0 : 0), Y(-g.pad.t)], [X(uL), Y(-g.pad.t)]], { fill: url(hatchFor(fLayer.cls)), stroke: 'none' });
  o += line(X(uL), Y(fz), X(g.courses[0].u0), Y(fz), { stroke: INK, width: 1.2 });
  // Fill behind the structure (bands behind each course, beside the pad).
  g.courses.forEach((c) => {
    const zt = Math.min(c.z1, g.zFill);
    if (zt > c.z0) o += rect(X(c.u1), Y(zt), X(uR) - X(c.u1), Y(c.z0) - Y(zt), { fill: url(HATCH.fill), stroke: 'none' });
  });
  const topC = g.courses[g.courses.length - 1];
  if (g.zFill > topC.z1) o += rect(X(topC.u0), Y(g.zFill), X(uR) - X(topC.u0), Y(topC.z1) - Y(g.zFill), { fill: url(HATCH.fill), stroke: 'none' });
  if (g.pad.t > 0) o += rect(X(g.pad.u1), Y(0), X(uR) - X(g.pad.u1), Y(-g.pad.t) - Y(0), { fill: url(HATCH.fill), stroke: 'none' });
  o += line(X(Math.min(topC.u1, ...g.courses.filter((c) => c.z1 >= g.zFill - 1e-6).map((c) => c.u1))), Y(g.zFill), X(uR), Y(g.zFill), { stroke: INK, width: 1.2 });

  // Pad.
  if (g.pad.t > 0) o += rect(X(g.pad.u0), Y(0), X(g.pad.u1) - X(g.pad.u0), Y(-g.pad.t) - Y(0), { fill: url(g.pad.rigid ? HATCH.concrete : HATCH.type1), stroke: INK, width: 0.9 });
  o += line(X(uL), Y(-g.pad.t), X(uR), Y(-g.pad.t), { stroke: INK, width: 0.6, dash: '4 2' });

  // Blocks (section at mid-length).
  const vCut = g.L / 2 - 1e-3;
  g.courses.forEach((c) => {
    sectionPieces(c, vCut).forEach((p) => {
      o += rect(X(p.u0), Y(c.z1), X(p.u1) - X(p.u0), Y(c.z0) - Y(c.z1), { fill: p.untiled ? '#d9dce3' : blockColour(p.code, p.special), stroke: INK, width: 0.9, opacity: c.temporary ? 0.45 : undefined, title: `Course ${c.idx} ${p.code}` });
      if (!compact || X(p.u1) - X(p.u0) > 22) o += text((X(p.u0) + X(p.u1)) / 2, (Y(c.z0) + Y(c.z1)) / 2 + 3.5, p.code, { size: compact ? 8 : 9.5, weight: 700, anchor: 'middle', fill: p.code === 'LG4' || p.code === 'LG8' || p.code === 'LG6' ? '#fff' : INK });
      if (!compact && !p.untiled) o += nibBumps(view, p, c.z1);
    });
    if (!compact) o += text(X(c.u0) - 4, (Y(c.z0) + Y(c.z1)) / 2 + 3, `C${c.idx}`, { size: 8.5, anchor: 'end', fill: GREY });
  });

  // Deck, bearing.
  if (bridge && lay.seat) {
    const b = g.bearing;
    const pl = (P.bearingPlateL || 300) / 1000;
    const zb0 = b.zSeat, zb1 = b.zH;
    o += rect(X(b.u - pl / 2), Y(zb1), X(b.u + pl / 2) - X(b.u - pl / 2), Math.max(Y(zb0) - Y(zb1), 2), { fill: '#444', stroke: INK, width: 0.8 });
    const deckEnd = b.u + ((P.overallLength || P.span) - P.span) / 2;
    const dd = P.deckDepth || 0.9;
    o += rect(X(uL), Y(zb1 + dd), X(deckEnd) - X(uL), Y(zb1) - Y(zb1 + dd), { fill: '#e8ebf2', stroke: NAVY, width: 1.1 });
    if (!compact) o += text((X(uL) + X(deckEnd)) / 2, Y(zb1 + dd / 2) + 3, 'DECK', { size: 9, weight: 800, anchor: 'middle', fill: NAVY });
  }

  // Water.
  if (bridge && g.water.DFLz !== null && g.water.DFLz > zBot && g.water.DFLz < zTop) {
    o += line(X(uL), Y(g.water.DFLz), X(g.courses[0].u0), Y(g.water.DFLz), { stroke: BLUE, width: 1, dash: '6 3' });
    o += text(X(uL) + 3, Y(g.water.DFLz) - 3, `DFL ${fx(g.water.DFLlevel)}`, { size: 8, fill: BLUE });
  }
  if (Number.isFinite(g.water.gwZ) && g.water.gwZ > zBot && g.water.gwZ < zTop) {
    o += line(X(uL), Y(g.water.gwZ), X(uR), Y(g.water.gwZ), { stroke: BLUE, width: 0.8, dash: '2 3' });
    if (!compact) o += text(X(uR) - 3, Y(g.water.gwZ) - 3, `GW ${fx(g.water.gwLevel)}`, { size: 8, fill: BLUE, anchor: 'end' });
  }

  // Loads (characteristic) and earth pressure diagram.
  const sls = er.checks.E4.govQ;
  if (!compact || true) {
    const Ka = earthCoefficient(g.epMethod, g.fill.phi).Kh;
    const hE = g.zFill + g.pad.t;
    const pBase = Ka * g.fill.gamma * hE;
    const pq = Ka * (state.loads.surcharge || 0);
    const sc = Math.min(view.L(1.6) / Math.max(pBase + pq, 1), 3);
    const xb = X(uR) - view.L(0.15);
    o += polygon([[xb, Y(g.zFill)], [xb, Y(-g.pad.t)], [xb - pBase * sc - pq * sc, Y(-g.pad.t)], [xb - pq * sc, Y(g.zFill)]], { fill: ORANGE, stroke: ORANGE, width: 0.8, opacity: 0.25 });
    if (!compact) {
      o += text(xb - (pBase + pq) * sc - 2, Y(-g.pad.t) - 3, `${fx(pBase + pq, 1)} kPa`, { size: 8, anchor: 'end', fill: ORANGE });
      o += text(xb - 2, Y(g.zFill) + 10, `Ka·q = ${fx(pq, 1)}`, { size: 8, anchor: 'end', fill: ORANGE });
    }
    // Surcharge arrows.
    if ((state.loads.surcharge || 0) > 0) {
      for (let u = rear + 0.3; u < uR - 0.3; u += compact ? 0.45 : 0.4) o += arrow(X(u), Y(g.zFill) - (compact ? 12 : 18), X(u), Y(g.zFill) - 1, { stroke: ORANGE, width: 1, head: 4 });
      if (!compact) o += text(X(rear + 0.3), Y(g.zFill) - 22, `q = ${state.loads.surcharge} kPa`, { size: 8.5, fill: ORANGE });
    }
    if (bridge && lay.seat) {
      const b = g.bearing;
      let Vk = 0, Hk = 0;
      g.bridgeItems.forEach((it) => { if (it.group === 'G' || it.group === 'G2' || (it.group === 'Qv' && it.model === state.loads.trafficModels[0]?.name)) Vk += it.Fz; if (it.group === 'Qb' && it.model === state.loads.trafficModels[0]?.name) Hk += Math.abs(it.Fu); });
      const ya = Y(b.zH + (P.deckDepth || 0.9) + 0.35);
      o += arrow(X(b.u), ya - (compact ? 10 : 16), X(b.u), Y(b.zH) - 2, { stroke: '#b3261e', width: 1.6, head: 5 });
      if (!compact) o += text(X(b.u) + 4, ya - 8, `V = ${fx(Vk, 0)} kN (G + Q char.)`, { size: 8.5, fill: '#b3261e' });
      if (Hk) {
        o += arrow(X(b.u) + 1, Y(b.zH), X(b.u) - view.L(0.9), Y(b.zH), { stroke: '#b3261e', width: 1.6, head: 5 });
        if (!compact) o += text(X(b.u) - view.L(0.95), Y(b.zH) - 4, `H = ${fx(Hk, 0)} kN`, { size: 8.5, fill: '#b3261e', anchor: 'end' });
      }
    }
  }

  // Resultant, kern and base pressure (SLS characteristic, governing).
  if (sls) {
    const q = sls.formation;
    const ft = g.footing;
    const zf = -g.pad.t;
    const xR = (ft.u0 + ft.u1) / 2 + q.e;
    o += line(X(ft.u0 + ft.B / 3), Y(zf) - 3, X(ft.u0 + ft.B / 3), Y(zf) + 3, { stroke: NAVY, width: 1.2 });
    o += line(X(ft.u0 + (2 * ft.B) / 3), Y(zf) - 3, X(ft.u0 + (2 * ft.B) / 3), Y(zf) + 3, { stroke: NAVY, width: 1.2 });
    const sc = Math.min(view.LY(0.9) / Math.max(q.qmax, 1), 1.2);
    const pts = q.shape === 'triangular'
      ? (q.e < 0 ? [[X(ft.u0), Y(zf)], [X(ft.u0), Y(zf) + q.qmax * sc], [X(ft.u0 + 3 * q.xR), Y(zf)]] : [[X(ft.u1), Y(zf)], [X(ft.u1), Y(zf) + q.qmax * sc], [X(ft.u1 - 3 * q.xR), Y(zf)]])
      : [[X(ft.u0), Y(zf)], [X(ft.u0), Y(zf) + (q.e < 0 ? q.qmax : q.qmin) * sc], [X(ft.u1), Y(zf) + (q.e < 0 ? q.qmin : q.qmax) * sc], [X(ft.u1), Y(zf)]];
    o += polygon(pts, { fill: '#9fb3d9', stroke: NAVY, width: 0.8, opacity: 0.7 });
    o += arrow(X(xR), Y(g.courses[g.courses.length - 1].z1 * 0.55), X(xR), Y(zf), { stroke: NAVY, width: 1.2, head: 5 });
    if (!compact) {
      o += text(X(ft.u0) - 2, Y(zf) + q.qmax * sc * 0.5 + 12, `q = ${fx(q.e < 0 ? q.qmax : q.qmin, 0)}`, { size: 8, anchor: 'end', fill: NAVY });
      o += text(X(ft.u1) + 2, Y(zf) + 12, `${fx(q.e < 0 ? q.qmin : q.qmax, 0)} kPa`, { size: 8, fill: NAVY });
      o += text(X(xR) + 4, Y(zf) - 6, `Resultant (SLS char.) e = ${fx(Math.abs(q.e), 3)} m`, { size: 8, fill: NAVY });
    }
  }

  // Minimum front fill level.
  if (!compact && (g.passive.on || state.ends[endIdx].minFrontFill !== null && state.ends[endIdx].minFrontFill !== undefined && state.ends[endIdx].minFrontFill !== '')) {
    const zm = g.passive.zGuaranteed;
    o += line(X(uL), Y(zm), X(g.courses[0].u0), Y(zm), { stroke: '#b3261e', width: 0.9, dash: '5 2' });
    o += text(X(uL) + 3, Y(zm) + 10, `Min front fill ${fx(g.passive.levelGuaranteed)} mAOD — to be maintained`, { size: 8, fill: '#b3261e' });
  }

  if (!compact) {
    // Dimensions and levels.
    const yDim = Y(zBot) + 14;
    o += dimH(X(g.courses[0].u0), X(g.courses[0].u1), yDim, `B = ${fx(g.courses[0].u1 - g.courses[0].u0, 2)} m`, { above: false, ext: Y(-g.pad.t) });
    if (g.pad.t > 0) o += dimH(X(g.pad.u0), X(g.pad.u1), yDim + 22, `Pad ${fx(g.pad.u1 - g.pad.u0, 2)} m × ${Math.round(g.pad.t * 1000)} mm`, { above: false });
    const xl = X(uR) - 8;
    o += levelTag(X(g.courses[0].u0) - 30, Y(-g.pad.t), g.formationLevel, { label: 'Formation', side: 'left' });
    o += levelTag(X(g.courses[g.courses.length - 1].u1) + 8, Y(g.courses[g.courses.length - 1].z1), g.courses[g.courses.length - 1].z1 + z0, { label: bridge ? 'Ballast top' : 'Top', side: 'right' });
    if (lay.seat) o += levelTag(X(lay.seat.u0) + 6, Y(lay.seat.z1), g.seatLevel, { label: 'Seat', side: 'right' });
    if (bridge) o += levelTag(xl - 60, Y(g.zFill), g.zFill + z0, { label: 'FRL', side: 'right' });
    o += levelTag(X(uL) + 40, Y(fz), g.frontGroundLevel, { label: 'Ground', side: 'right' });
    o += legend(10, 10, [...blockLegendItems(lay), { label: g.pad.rigid ? 'Mass concrete base' : 'Type 1 pad', fill: url(g.pad.rigid ? HATCH.concrete : HATCH.type1) }, { label: 'Backfill', fill: url(HATCH.fill) }, { label: `Founding: ${fLayer.desc || fLayer.cls}`.slice(0, 34), fill: url(hatchFor(fLayer.cls)) }, { label: 'Earth pressure (char.)', fill: ORANGE }, { label: 'Base pressure (SLS char.)', fill: '#9fb3d9' }], { cols: 2, colWidth: 175, size: 8 });
    o += scaleBar(W - 170, H - 44, view);
    o += titleStrip(W, H, { title: `D2 — Abutment section, ${er.label}${bridge ? '' : ' (per metre run)'}`, drawingNo: `D2-${endIdx + 1}`, scaleText: 'Scale bar — not to scale when printed' });
  }
  return svgDoc(W, H, o, { title: `Abutment section ${er.label}` });
}

// --- D1 Crossing long section ------------------------------------------------------

export function drawingD1(state, design, { slopeCase } = {}) {
  const X0 = state.crossing;
  if (!design.bridge) return '';
  const prof = [...(X0.profile || [])].sort((a, b) => a.ch - b.ch);
  if (prof.length < 2) return '';
  const W = 1120, H = 560;
  const ends = design.ends;
  const chs = [...prof.map((p) => p.ch), ...ends.map((e) => e.geom.frontChainage)];
  const x0 = Math.min(...chs), x1 = Math.max(...chs);
  const levels = [...prof.map((p) => p.level), ...ends.map((e) => e.geom.formationLevel - 1.5), ...ends.map((e) => e.geom.zFill + e.geom.z0Level + (state.project.deckDepth || 0.9) + 0.8)];
  (state.boreholes || []).forEach((b) => levels.push(b.GL - Math.min(b.finalDepth || 6, 8)));
  const y0 = Math.min(...levels), y1 = Math.max(...levels);
  const ex = Math.max(1, Math.min(4, ((x1 - x0) / (y1 - y0)) * 0.35));
  const view = makeView({ x0, x1, y0, y1 }, { width: W, height: H, pad: 44, padBottom: 72, padTop: 34, exaggeration: ex });
  const X = view.X, Y = view.Y;
  let o = '';
  // Ground.
  const gp = prof.map((p) => [X(p.ch), Y(p.level)]);
  o += polygon([...gp, [X(x1), Y(y0)], [X(x0), Y(y0)]], { fill: url(HATCH.cohesive), stroke: 'none', opacity: 0.9 });
  // Channel water.
  const bed = Math.min(...prof.map((p) => p.level));
  if (X0.NWL > bed) {
    const wet = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i], b = prof[i + 1];
      if (a.level < X0.NWL || b.level < X0.NWL) {
        const xa = a.level >= X0.NWL ? a.ch + ((b.ch - a.ch) * (a.level - X0.NWL)) / (a.level - b.level) : a.ch;
        const xb = b.level >= X0.NWL ? a.ch + ((b.ch - a.ch) * (a.level - X0.NWL)) / (a.level - b.level) : b.ch;
        wet.push([xa, xb, a, b]);
      }
    }
    if (wet.length) {
      const xa = wet[0][0], xb = wet[wet.length - 1][1];
      const pts = [[X(xa), Y(X0.NWL)], [X(xb), Y(X0.NWL)]];
      [...prof].reverse().forEach((p) => { if (p.ch > xa && p.ch < xb) pts.push([X(p.ch), Y(p.level)]); });
      o += polygon(pts, { fill: url(HATCH.water), stroke: 'none' });
      o += line(X(xa), Y(X0.NWL), X(xb), Y(X0.NWL), { stroke: BLUE, width: 1 });
      o += text((X(xa) + X(xb)) / 2, Y(X0.NWL) - 3, `NWL ${fx(X0.NWL)}`, { size: 8.5, anchor: 'middle', fill: BLUE });
    }
  }
  o += polyline(gp, { stroke: INK, width: 1.4 });
  if (Number.isFinite(X0.DFL)) {
    o += line(X(x0), Y(X0.DFL), X(x1), Y(X0.DFL), { stroke: BLUE, width: 1, dash: '8 4' });
    o += text(X(x0) + 4, Y(X0.DFL) - 3, `DFL ${fx(X0.DFL)} (${X0.DFLlabel || 'design flood'})`, { size: 8.5, fill: BLUE });
  }

  // Abutments.
  const cr = design.crossing;
  ends.forEach((er, i) => {
    const g = er.geom;
    const sL = i === 0 ? -1 : 1;
    const ch = (u) => g.frontChainage + sL * u;
    const lv = (z) => z + g.z0Level;
    const vCut = g.L / 2 - 1e-3;
    if (g.pad.t > 0) o += polygon([[X(ch(g.pad.u0)), Y(lv(0))], [X(ch(g.pad.u1)), Y(lv(0))], [X(ch(g.pad.u1)), Y(lv(-g.pad.t))], [X(ch(g.pad.u0)), Y(lv(-g.pad.t))]], { fill: url(g.pad.rigid ? HATCH.concrete : HATCH.type1), stroke: INK, width: 0.7 });
    g.courses.forEach((c) => sectionPieces(c, vCut).forEach((p) => {
      o += polygon([[X(ch(p.u0)), Y(lv(c.z0))], [X(ch(p.u1)), Y(lv(c.z0))], [X(ch(p.u1)), Y(lv(c.z1))], [X(ch(p.u0)), Y(lv(c.z1))]], { fill: p.untiled ? '#ccc' : blockColour(p.code, p.special), stroke: INK, width: 0.6 });
    }));
    // Approach fill.
    const rearU = Math.max(g.pad.u1, ...g.courses.map((c) => c.u1));
    const farCh = i === 0 ? x0 : x1;
    const frl = lv(g.zFill);
    const pts = [[X(ch(rearU)), Y(frl)], [X(farCh), Y(frl)]];
    const land = prof.filter((p) => (p.ch - ch(rearU)) * sL >= 0).sort((a, b) => (b.ch - a.ch) * sL);
    land.forEach((p) => pts.push([X(p.ch), Y(Math.min(p.level, frl))]));
    pts.push([X(ch(rearU)), Y(lv(-g.pad.t))]);
    o += polygon(pts, { fill: url(HATCH.fill), stroke: 'none' });
    o += line(X(ch(rearU)), Y(frl), X(farCh), Y(frl), { stroke: INK, width: 1.1 });
    for (let k = 1; k <= 5; k++) { const xx = ch(rearU + k * 0.9); if ((xx - farCh) * sL < 0) o += arrow(X(xx), Y(frl) - 12, X(xx), Y(frl) - 1, { stroke: ORANGE, width: 0.9, head: 3.5 }); }
    // Formation tag, crest marker, scour line.
    o += levelTag(X(ch(g.pad.u0)) - sL * 6, Y(g.formationLevel), g.formationLevel, { label: 'Fmn', side: i === 0 ? 'left' : 'right', size: 8 });
    const ce = cr?.ends[i];
    if (ce?.crest) {
      o += polygon([[X(ce.crest.ch), Y(ce.crest.level)], [X(ce.crest.ch) - 4, Y(ce.crest.level) - 7], [X(ce.crest.ch) + 4, Y(ce.crest.level) - 7]], { fill: ORANGE, stroke: ORANGE });
      o += dimH(X(ce.crest.ch), X(g.frontChainage), Y(ce.crest.level) - 26, `b = ${fx(Math.abs(ce.b), 2)} m`, { size: 8.5 });
    }
    if (ce?.toe && state.ends[i].scour?.assessed) {
      const sl = ce.toe.level - (Number(state.ends[i].scour.ds) || 0);
      o += line(X(ce.toe.ch) - 18, Y(sl), X(ce.toe.ch) + 18, Y(sl), { stroke: '#b3261e', width: 1, dash: '3 2' });
      o += text(X(ce.toe.ch), Y(sl) + 10, `scour ${fx(sl, 2)}`, { size: 7.5, anchor: 'middle', fill: '#b3261e' });
    }
    if (ce?.lineAt) {
      // Influence line from the toe (or scour level), stopped at the top of the frame.
      const a = ce.toe.ch;
      const t = Math.tan((ce.theta * Math.PI) / 180);
      const bMax = a + sL * ((y1 - ce.startLevel) / Math.max(t, 1e-6));
      const b = Math.abs(bMax - a) < Math.abs(ch(rearU + 1.5) - a) ? bMax : ch(rearU + 1.5);
      o += line(X(a), Y(ce.startLevel), X(b), Y(Math.min(ce.lineAt(b), y1)), { stroke: '#7b1fa2', width: 0.9, dash: '6 3' });
    }
    // Bearing and deck.
    if (er.layout.seat) {
      const bx = ch(g.bearing.u);
      o += rect(X(bx) - 3, Y(lv(g.bearing.zH)), 6, Math.max(Y(lv(g.bearing.zSeat)) - Y(lv(g.bearing.zH)), 2), { fill: '#333', stroke: '#333' });
    }
  });
  if (ends.length === 2 && ends[0].layout.seat && ends[1].layout.seat) {
    const g1 = ends[0].geom, g2 = ends[1].geom;
    const P = state.project;
    const ov = ((P.overallLength || P.span) - P.span) / 2;
    const b1 = g1.frontChainage - g1.bearing.u, b2 = g2.frontChainage + g2.bearing.u;
    const soff = (g) => g.bearing.zH + g.z0Level;
    const dd = P.deckDepth || 0.9;
    o += polygon([[X(b1 - ov), Y(soff(g1))], [X(b2 + ov), Y(soff(g2))], [X(b2 + ov), Y(soff(g2) + dd)], [X(b1 - ov), Y(soff(g1) + dd)]], { fill: '#e8ebf2', stroke: NAVY, width: 1.2 });
    o += text((X(b1) + X(b2)) / 2, Y((soff(g1) + soff(g2)) / 2 + dd / 2) + 3, `DECK — span ${fx(b2 - b1, 3)} m (bearing to bearing)`, { size: 9, weight: 800, anchor: 'middle', fill: NAVY });
    const xm = (X(b1) + X(b2)) / 2 + 60;
    if (Number.isFinite(X0.DFL)) o += dimV(xm, Y(soff(g1)), Y(X0.DFL), `freeboard ${fx(soff(g1) - X0.DFL, 2)} m`, { size: 8, left: false });
  }

  // Boreholes.
  (state.boreholes || []).map(expandSimpleBorehole).forEach((bh) => {
    const xb = X(bh.chainage);
    const w = 9;
    (bh.strata || []).forEach((s) => {
      o += rect(xb - w / 2, Y(bh.GL - s.top), w, Y(bh.GL - s.base) - Y(bh.GL - s.top), { fill: url(hatchFor(s.cls)), stroke: INK, width: 0.6 });
    });
    o += text(xb, Y(bh.GL) - 4, bh.id, { size: 8, weight: 700, anchor: 'middle' });
    (bh.spt || []).forEach((t) => {
      const er = design.ends.find((e) => e.ground.processed.some((p) => p.id === bh.id));
      const pt = er?.ground.processed.find((p) => p.id === bh.id)?.tests.find((x) => Math.abs(x.depth - t.depth) < 1e-6);
      const N = pt?.N60;
      if (Number.isFinite(N)) o += text(xb + w / 2 + 2, Y(bh.GL - t.depth) + 3, `${Math.round(Math.min(N, 100))}${pt.parsed?.refusal ? '*' : ''}`, { size: 7, fill: '#444' });
    });
  });

  // Critical slip circles.
  if (design.slope) {
    design.slope.ends.forEach((se) => {
      const c = slopeCase ? se.cases.find((k) => k.key === slopeCase) : se.cases.reduce((m, k) => (k.governingODF < (m?.governingODF ?? Infinity) ? k : m), null);
      const circ = c?.circleAbut || c?.circle;
      if (!circ) return;
      const pts = [];
      for (let k = 0; k <= 40; k++) {
        const xx = circ.xa + ((circ.xb - circ.xa) * k) / 40;
        pts.push([X(xx), Y(circ.yc - Math.sqrt(Math.max(0, circ.R * circ.R - (xx - circ.xc) ** 2)))]);
      }
      o += polyline(pts, { stroke: '#b3261e', width: 1.4, dash: '7 3' });
      o += text(pts[20][0], pts[20][1] + 12, `ODF ${fx(c.governingODF, 2)} (${c.key})`, { size: 8, anchor: 'middle', fill: '#b3261e' });
    });
  }

  o += legend(10, H - 172, [
    { label: 'Existing ground', fill: url(HATCH.cohesive) }, { label: 'Approach fill', fill: url(HATCH.fill) }, { label: 'Water (NWL)', fill: url(HATCH.water) },
    { label: 'DFL', kind: 'line', stroke: BLUE, dash: '8 4' }, { label: 'Influence line', kind: 'line', stroke: '#7b1fa2', dash: '6 3' }, { label: 'Critical slip circle', kind: 'line', stroke: '#b3261e', dash: '7 3' },
    { label: 'Scour level', kind: 'line', stroke: '#b3261e', dash: '3 2' }, { label: 'Bank crest', fill: ORANGE }, { label: 'SPT N60 (* extrapolated)', fill: '#fff' },
  ], { cols: 3, colWidth: 150, size: 8 });
  o += text(W - 12, 24, `Vertical exaggeration × ${ex.toFixed(1)}`, { size: 8.5, anchor: 'end', fill: GREY });
  o += scaleBar(W - 190, H - 46, view, { label: 'horizontal' });
  o += titleStrip(W, H, { title: 'D1 — Crossing long section (bridge centreline, End 1 → End 2)', drawingNo: 'D1', scaleText: 'A3 landscape' });
  return svgDoc(W, H, o, { title: 'Crossing long section' });
}

// --- D3 Layer plans ---------------------------------------------------------------------

export function drawingD3(state, design, endIdx = 0) {
  const er = design.ends[endIdx];
  if (!er) return '';
  const g = er.geom, lay = er.layout, P = state.project;
  const n = g.courses.length;
  const cols = 2;
  const pw = 440, ph = 250;
  const rows = Math.ceil(n / cols);
  const W = cols * pw + 20, H = rows * ph + 90;
  const uMax = Math.max(...g.courses.map((c) => c.u1), g.pad.u1);
  let o = '';
  g.courses.forEach((c, k) => {
    const ox = 10 + (k % cols) * pw, oy = 14 + Math.floor(k / cols) * ph;
    const view = makeView({ x0: -0.3, x1: uMax + 0.3, y0: -0.3, y1: g.L + 0.3 }, { width: pw, height: ph - 30, pad: 22 });
    const X = (u) => ox + view.X(u), Y = (v) => oy + 16 + view.Y(v);
    o += text(ox + 4, oy + 10, `Course ${c.idx} — ${c.role}${c.temporary ? ' (temporary)' : ''} · z ${fx(c.z0 + g.z0Level)}–${fx(c.z1 + g.z0Level)} mAOD`, { size: 9.5, weight: 800, fill: NAVY });
    if (!c.pieces.length) o += rect(X(c.u0), Y(c.v1), X(c.u1) - X(c.u0), Y(c.v0) - Y(c.v1), { fill: '#ddd', stroke: INK });
    c.pieces.forEach((p) => {
      o += rect(X(p.u0), Y(p.v1), X(p.u1) - X(p.u0), Y(p.v0) - Y(p.v1), { fill: blockColour(p.code, p.special), stroke: INK, width: 0.8, title: `${p.code} ${Math.round(p.handlingKg)} kg` });
      if (LEGATO_BLOCKS[p.code]?.male) {
        for (let u = p.u0 + 0.2; u < p.u1 - 1e-6; u += 0.4) for (let v = p.v0 + 0.2; v < p.v1 - 1e-6; v += 0.4) o += circle(X(u), Y(v), 1.6, { fill: '#333', stroke: 'none' });
      }
      o += circle(X(p.uc), Y(p.vc), Math.max(view.L(0.047), 1.2), { fill: 'none', stroke: '#555', width: 0.5, dash: '1 1' });
      if (X(p.u1) - X(p.u0) > 18 && Y(p.v0) - Y(p.v1) > 10) o += text((X(p.u0) + X(p.u1)) / 2, (Y(p.v0) + Y(p.v1)) / 2 + 3, p.code, { size: 7.5, weight: 700, anchor: 'middle', fill: ['LG4', 'LG8', 'LG6'].includes(p.code) && !p.special ? '#fff' : INK });
    });
    if (c.role === 'seat' && P.mode === 'bridge') {
      const Lp = P.bearingPlateL / 1000, Bp = P.bearingPlateB / 1000;
      g.bearingPositions.forEach((b) => { o += rect(X(b.u - Lp / 2), Y(b.v + Bp / 2), X(b.u + Lp / 2) - X(b.u - Lp / 2), Y(b.v - Bp / 2) - Y(b.v + Bp / 2), { fill: '#555', stroke: INK, width: 0.8, opacity: 0.75 }); });
      (er.local.find((l) => l.id === 'L2')?.anchors || []).forEach((a) => { o += circle(X(a.u), Y(a.v), 2.2, { fill: '#fff', stroke: '#b3261e', width: 1 }); });
      if (P.skew) {
        const t = (P.skew * Math.PI) / 180;
        const bu = g.bearing.u;
        o += line(X(bu - Math.tan(t) * g.L / 2), Y(0), X(bu + Math.tan(t) * g.L / 2), Y(g.L), { stroke: '#7b1fa2', width: 1, dash: '5 3' });
      }
    }
    o += dimH(X(c.u0), X(c.u1), Y(-0.05) + 12, `${Math.round((c.u1 - c.u0) * 1000)}`, { size: 8, above: false });
    o += dimV(X(-0.15), Y(c.v1), Y(c.v0), `${Math.round((c.v1 - c.v0) * 1000)}`, { size: 8 });
    o += text(X(uMax + 0.2), Y(g.L / 2), '→ landward (u)', { size: 7.5, anchor: 'end', fill: GREY, rotate: -90 });
  });
  o += legend(10, H - 76, [...blockLegendItems(lay), { label: 'Nib (male top)', fill: '#333' }, { label: 'Baseplate', fill: '#555' }, { label: 'Anchor', fill: '#fff', stroke: '#b3261e' }, { label: 'Lifting recess Ø94', fill: '#fff' }], { cols: 4, colWidth: 200, size: 8, title: `Legend — ${er.label}` });
  o += titleStrip(W, H, { title: `D3 — Layer plans, ${er.label}`, drawingNo: `D3-${endIdx + 1}`, scaleText: 'dimensions in mm' });
  return svgDoc(W, H, o, { title: `Layer plans ${er.label}` });
}

// --- D4 Transverse section -----------------------------------------------------------------

export function drawingD4(state, design, endIdx = 0) {
  const er = design.ends[endIdx];
  if (!er || state.project.mode !== 'bridge') return '';
  const g = er.geom, P = state.project;
  const W = 820, H = 420;
  const zTop = g.bearing.zH + (P.deckDepth || 0.9) + 0.6;
  const dw = P.deckWidth || g.L;
  const v0 = Math.min(0, g.L / 2 - dw / 2) - 0.6, v1 = Math.max(g.L, g.L / 2 + dw / 2) + 0.6;
  const view = makeView({ x0: v0, x1: v1, y0: -g.pad.t - 0.5, y1: zTop }, { width: W, height: H, pad: 40, padBottom: 70 });
  const X = view.X, Y = view.Y;
  let o = '';
  const uCut = g.bearing.u;
  g.courses.forEach((c) => {
    const ps = (c.pieces || []).filter((p) => uCut >= p.u0 && uCut < p.u1);
    if (!ps.length && uCut >= c.u0 && uCut < c.u1) o += rect(X(c.v0), Y(c.z1), X(c.v1) - X(c.v0), Y(c.z0) - Y(c.z1), { fill: '#ddd', stroke: INK });
    ps.forEach((p) => {
      o += rect(X(p.v0), Y(c.z1), X(p.v1) - X(p.v0), Y(c.z0) - Y(c.z1), { fill: blockColour(p.code, p.special), stroke: INK, width: 0.8 });
      o += text((X(p.v0) + X(p.v1)) / 2, (Y(c.z0) + Y(c.z1)) / 2 + 3, p.code, { size: 8, weight: 700, anchor: 'middle', fill: ['LG4', 'LG8', 'LG6'].includes(p.code) ? '#fff' : INK });
    });
  });
  if (g.pad.t > 0) o += rect(X(g.pad.v0), Y(0), X(g.pad.v1) - X(g.pad.v0), Y(-g.pad.t) - Y(0), { fill: url(g.pad.rigid ? HATCH.concrete : HATCH.type1), stroke: INK, width: 0.8 });
  const Bp = P.bearingPlateB / 1000;
  g.bearingPositions.forEach((b) => { o += rect(X(b.v - Bp / 2), Y(g.bearing.zH), X(b.v + Bp / 2) - X(b.v - Bp / 2), Math.max(Y(g.bearing.zSeat) - Y(g.bearing.zH), 2), { fill: '#333', stroke: INK }); });
  const dd = P.deckDepth || 0.9;
  o += rect(X(g.L / 2 - dw / 2), Y(g.bearing.zH + dd), X(g.L / 2 + dw / 2) - X(g.L / 2 - dw / 2), Y(g.bearing.zH) - Y(g.bearing.zH + dd), { fill: '#e8ebf2', stroke: NAVY, width: 1.1 });
  o += text(X(g.L / 2), Y(g.bearing.zH + dd / 2) + 3, `DECK ${fx(dw, 2)} m wide (clear ${fx(P.clearWidth, 2)} m)`, { size: 9, weight: 800, anchor: 'middle', fill: NAVY });
  const yd = Y(-g.pad.t) + 16;
  o += dimH(X(0), X(g.L), yd, `L = ${Math.round(g.L * 1000)} mm`, { above: false });
  if (g.bearingPositions.length > 1) {
    const a = g.bearingPositions[0], b = g.bearingPositions[g.bearingPositions.length - 1];
    o += dimH(X(a.v), X(b.v), Y(g.bearing.zH + dd) - 14, `bearing c/c ${Math.round((b.v - a.v) * 1000)}`, {});
    o += dimH(X(0), X(a.v - Bp / 2), yd + 24, `edge ${Math.round((a.v - Bp / 2) * 1000)}`, { above: false, size: 8 });
    o += dimH(X(b.v + Bp / 2), X(g.L), yd + 24, `edge ${Math.round((g.L - b.v - Bp / 2) * 1000)}`, { above: false, size: 8 });
  }
  o += scaleBar(W - 170, H - 44, view);
  o += titleStrip(W, H, { title: `D4 — Transverse section at the bearings, ${er.label} (u = ${fx(uCut, 2)} m)`, drawingNo: `D4-${endIdx + 1}` });
  return svgDoc(W, H, o, { title: `Transverse section ${er.label}` });
}

// --- D5 SPT N60 and derived parameters vs level ----------------------------------------------

export function drawingD5(state, design, endIdx = 0) {
  const er = design.ends[endIdx];
  if (!er) return '';
  const gr = er.ground;
  const W = 860, H = 520;
  const lvls = [...gr.layers.map((l) => l.topLevel), ...gr.layers.map((l) => l.baseLevel), er.geom.formationLevel];
  const tests = gr.processed.flatMap((p) => p.tests.map((t) => ({ ...t, bh: p.id })));
  tests.forEach((t) => lvls.push(t.level));
  const y1 = Math.max(...lvls) + 0.3, y0 = Math.max(Math.min(...lvls) - 0.3, Math.max(...lvls) - 16);
  const panel = (ox, pwid, xmax, label, valueFn, charFn) => {
    const view = makeView({ x0: 0, x1: xmax, y0, y1 }, { width: pwid, height: H - 70, pad: 40 });
    const X = (x) => ox + view.X(x), Y = view.Y;
    let s = rect(X(0), Y(y1), X(xmax) - X(0), Y(y0) - Y(y1), { fill: '#fff', stroke: INK, width: 0.8 });
    for (let k = 0; k <= 5; k++) { const x = (xmax * k) / 5; s += line(X(x), Y(y1), X(x), Y(y0), { stroke: '#e1e3ea', width: 0.6 }) + text(X(x), Y(y0) + 12, fx(x, 0), { size: 8, anchor: 'middle' }); }
    for (let lv = Math.ceil(y0); lv <= y1; lv += 1) s += line(X(0), Y(lv), X(xmax), Y(lv), { stroke: '#eef0f4', width: 0.5 }) + text(X(0) - 4, Y(lv) + 3, lv.toFixed(0), { size: 8, anchor: 'end' });
    gr.layers.forEach((l) => {
      s += rect(X(0), Y(Math.min(l.topLevel, y1)), 10, Y(Math.max(l.baseLevel, y0)) - Y(Math.min(l.topLevel, y1)), { fill: url(hatchFor(l.cls)), stroke: INK, width: 0.4 });
      s += line(X(0), Y(l.baseLevel), X(xmax), Y(l.baseLevel), { stroke: GREY, width: 0.6, dash: '3 2' });
      const cv = charFn(l);
      if (Number.isFinite(cv)) s += line(X(Math.min(cv, xmax)), Y(Math.min(l.topLevel, y1)), X(Math.min(cv, xmax)), Y(Math.max(l.baseLevel, y0)), { stroke: ORANGE, width: 2 });
    });
    const marks = ['circle', 'square', 'diamond', 'triangle'];
    gr.processed.forEach((p, i) => p.tests.forEach((t) => {
      const v = valueFn(t);
      if (!Number.isFinite(v)) return;
      const x = X(Math.min(v, xmax)), y = Y(t.level);
      const m = marks[i % marks.length];
      if (m === 'circle') s += circle(x, y, 3, { fill: p.id === gr.designId ? NAVY : '#fff', stroke: NAVY });
      else if (m === 'square') s += rect(x - 3, y - 3, 6, 6, { fill: p.id === gr.designId ? NAVY : '#fff', stroke: NAVY });
      else s += polygon([[x, y - 4], [x + 4, y], [x, y + 4], [x - 4, y]], { fill: p.id === gr.designId ? NAVY : '#fff', stroke: NAVY });
    }));
    s += line(X(0), Y(er.geom.formationLevel), X(xmax), Y(er.geom.formationLevel), { stroke: '#b3261e', width: 1, dash: '6 3' });
    s += text(X(xmax) - 3, Y(er.geom.formationLevel) - 3, `Formation ${fx(er.geom.formationLevel)}`, { size: 8, anchor: 'end', fill: '#b3261e' });
    s += text((X(0) + X(xmax)) / 2, 22, label, { size: 10, weight: 800, anchor: 'middle', fill: NAVY });
    return s;
  };
  let o = '';
  o += panel(0, W / 2, 60, 'SPT N60 vs level (mAOD) — capped display', (t) => t.N60, (l) => l.N60);
  const coh = gr.layers.some((l) => l.cls === 'Cohesive');
  o += panel(W / 2, W / 2, coh ? 200 : 45, coh ? 'cu (kPa, Stroud) and φ′ (°) vs level' : 'φ′ (°) vs level', (t) => (t.cls === 'Cohesive' ? (coh ? t.cu : NaN) : t.phi), (l) => (l.cls === 'Cohesive' ? l.cu : l.phi));
  o += legend(W - 330, H - 100, [
    ...gr.processed.map((p) => ({ label: `${p.id}${p.id === gr.designId ? ' (design borehole)' : ''}`, fill: p.id === gr.designId ? NAVY : '#fff', stroke: NAVY })),
    { label: 'Characteristic value', kind: 'line', stroke: ORANGE, width: 2 },
  ], { cols: 2, colWidth: 160, size: 8 });
  if (!gr.processed.length) o += text(W / 2, H / 2, 'Manual design profile — no borehole SPT data for this end', { size: 11, anchor: 'middle', fill: GREY });
  o += titleStrip(W, H, { title: `D5 — SPT N60 and derived parameters, ${er.label}`, drawingNo: `D5-${endIdx + 1}` });
  return svgDoc(W, H, o, { title: `SPT plot ${er.label}` });
}

// --- D6 Utilisation chart --------------------------------------------------------------------

export function drawingD6(state, design) {
  const rows = [];
  design.ends.forEach((e) => e.util.forEach((u) => rows.push({ ...u, end: design.bridge ? e.label : '' })));
  if (design.diff) rows.push({ id: 'E6d', title: 'Differential settlement', util: design.diff.util, end: 'Both' });
  if (design.slope) design.slope.ends.forEach((se) => rows.push({ id: 'E5', title: 'Overall stability 1/ODF', util: 1 / Math.max(Math.min(...se.cases.map((c) => c.governingODF)), 1e-6), end: `End ${se.end}` }));
  const W = 860, rowH = 17, H = rows.length * rowH + 90;
  const x0 = 290, x1 = W - 70;
  const umax = Math.max(1.2, Math.min(3, Math.max(...rows.map((r) => r.util))));
  const X = (u) => x0 + ((x1 - x0) * Math.min(u, umax)) / umax;
  let o = text(10, 20, 'Utilisation Ed/Rd (≤ 0.90 green, 0.90–1.00 amber, > 1.00 red)', { size: 10, weight: 800, fill: NAVY });
  rows.forEach((r, i) => {
    const y = 34 + i * rowH;
    const col = r.util > 1 ? '#c62828' : r.util > 0.9 ? '#f9a825' : '#2e7d32';
    o += text(10, y + 11, `${r.end ? `${r.end} · ` : ''}${r.id} ${r.title}`.slice(0, 52), { size: 8.5 });
    o += rect(x0, y + 2, X(r.util) - x0, rowH - 5, { fill: col, stroke: 'none' });
    o += text(X(r.util) + 4, y + 11, `${r.util.toFixed(3)} ${r.util > 1 ? 'FAIL' : r.util > 0.9 ? 'NEAR' : 'OK'}`, { size: 8.5, weight: 700 });
  });
  const yb = 34 + rows.length * rowH;
  [0.9, 1.0].forEach((t) => { o += line(X(t), 30, X(t), yb, { stroke: t === 1 ? '#c62828' : '#f9a825', width: 1, dash: '4 2' }); o += text(X(t), yb + 12, t.toFixed(2), { size: 8, anchor: 'middle' }); });
  o += line(x0, 30, x0, yb, { stroke: INK, width: 0.8 });
  o += titleStrip(W, H, { title: 'D6 — Utilisation summary', drawingNo: 'D6' });
  return svgDoc(W, H, o, { title: 'Utilisation chart' });
}

export function allDrawings(state, design) {
  const out = [];
  if (design.bridge) out.push({ key: 'D1', title: 'D1 Crossing long section', svg: drawingD1(state, design), a3: true });
  design.ends.forEach((e, i) => {
    out.push({ key: `D2-${i + 1}`, title: `D2 Abutment section — ${e.label}`, svg: diagramD2(state, design, i) });
    out.push({ key: `D3-${i + 1}`, title: `D3 Layer plans — ${e.label}`, svg: drawingD3(state, design, i) });
    if (design.bridge) out.push({ key: `D4-${i + 1}`, title: `D4 Transverse section — ${e.label}`, svg: drawingD4(state, design, i) });
    out.push({ key: `D5-${i + 1}`, title: `D5 SPT and parameters — ${e.label}`, svg: drawingD5(state, design, i) });
  });
  out.push({ key: 'D6', title: 'D6 Utilisation chart', svg: drawingD6(state, design) });
  return out;
}

export { factorItems, freeBody };

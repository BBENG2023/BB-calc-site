// checks-local.js — L1 bearing seat compression, L2 anchor demand per
// baseplate, L3 handling, L4 grout thickness limits.

import { LEGATO_CONCRETE, LEGATO_BLOCKS } from '../../js/shared-data.js';
import { f1, f2, f3 } from './checks-external.js';

export function checkLocal(ctx, layout) {
  const { geom, state } = ctx;
  const P = state.project;
  const A = state.ends[geom.endIdx].arrangement;
  const out = [];
  const bridge = P.mode === 'bridge';
  const nb = Math.max(1, Number(P.bearingsPerEnd) || 1);
  const F = ctx.F.C1;

  // Governing ULS (STR, set A1 = DA1-C1 factors) reactions per bearing.
  let fz = 0, fu = 0, fv = 0, govLabel = '';
  if (bridge) {
    ctx.situations.filter((s) => s.deck && s.kind !== 'accidental').forEach((sit) => {
      let z = 0, u = 0, v = 0;
      geom.bridgeItems.forEach((it) => {
        const m = it.tag === 'Q' ? sit.mult(it) : 1;
        const g = it.tag === 'G' ? F.gGsup : ['Qv', 'Qb', 'Qf'].includes(it.group) ? F.gQt : F.gQo;
        z += it.Fz * g * m;
        u += Math.abs(it.Fu) * g * m;
        v += Math.abs(it.Fv) * g * m;
      });
      if (z / nb > fz) { fz = z / nb; fu = u / nb; fv = v / nb; govLabel = sit.label; }
    });
  }

  // L1 bearing seat compression.
  if (bridge) {
    const Ap = (P.bearingPlateL * P.bearingPlateB) / 1e6;
    const sigma = fz / Ap / 1000;
    const util = sigma / LEGATO_CONCRETE.fcdPl;
    out.push({
      id: 'L1', title: 'Bearing seat compression', clause: 'BS EN 1992-1-1 12.6.1 (plain concrete)', util, pass: util <= 1,
      steps: [{ title: `Bearing seat compression — ${govLabel || 'no deck loads'}`, formula: 'σ = Fz,d / (L_p × B_p) ≤ fcd,pl (EC2 6.7 concentrated-load enhancement not used — unreinforced, splitting risk)', substitution: `Fz,d = ${f1(fz)} kN per bearing (DA1-C1 / STR factors); plate ${P.bearingPlateL} × ${P.bearingPlateB} mm`, result: `σ = ${f2(sigma)} N/mm² vs ${LEGATO_CONCRETE.fcdPl} N/mm²; utilisation ${f3(util)}` }],
    });
  }

  // L2 anchor demand and positions.
  if (bridge && layout.seat) {
    const n = Math.max(2, Number(A.anchors.perPlate) || 6);
    const perEnd = n / 2;
    const Lp = P.bearingPlateL / 1000, Bp = P.bearingPlateB / 1000;
    const edge = (A.anchors.plateEdge ?? 50) / 1000;
    const hb = (P.bearingHeight + (A.bearingGrout || 0)) / 1000;
    const H = Math.hypot(fu, fv);
    const VEd = H / n;
    const z = Math.max(Lp - 2 * edge, 0.05);
    const NEd = (H * hb) / z / perEnd;
    const anchors = [];
    geom.bearingPositions.forEach((b, bi) => {
      [-1, 1].forEach((su) => {
        for (let j = 0; j < perEnd; j++) {
          const fv2 = perEnd === 1 ? 0 : -1 + (2 * j) / (perEnd - 1);
          anchors.push({ bearing: bi + 1, u: b.u + su * (Lp / 2 - edge), v: b.v + fv2 * (Bp / 2 - edge) });
        }
      });
    });
    const minEdge = (A.anchors.minEdge ?? 150) / 1000;
    const warnings = [];
    let minE = Infinity;
    const plates = new Map();
    anchors.forEach((an) => {
      const blk = layout.seat.pieces.find((p) => an.u >= p.u0 && an.u <= p.u1 && an.v >= p.v0 && an.v <= p.v1);
      if (!blk) { warnings.push(`Bearing ${an.bearing}: an anchor at u = ${f3(an.u)}, v = ${f3(an.v)} m is off the seat course.`); return; }
      const e = Math.min(an.u - blk.u0, blk.u1 - an.u, an.v - blk.v0, blk.v1 - an.v);
      minE = Math.min(minE, e);
      const dc = Math.hypot(an.u - blk.uc, an.v - blk.vc);
      if (dc < 0.047 + 0.05) warnings.push(`Bearing ${an.bearing}: an anchor is within ${Math.round(dc * 1000)} mm of the Ø94 lifting recess at a block centre — relocate.`);
      if (!plates.has(an.bearing)) plates.set(an.bearing, new Map());
      const m = plates.get(an.bearing);
      m.set(blk, (m.get(blk) || 0) + 1);
    });
    plates.forEach((m, bi) => {
      if (m.size > 1) {
        const few = [...m.values()].some((c) => c < 2);
        warnings.push(`Bearing ${bi}: baseplate spans a block joint${few ? ' with fewer than two anchors in one block — rearrange anchors or move the bearing' : ' (anchors in each block)'}.`);
      }
    });
    if (minE < minEdge) warnings.push(`Minimum anchor edge distance ${Math.round(minE * 1000)} mm is below the ${Math.round(minEdge * 1000)} mm minimum.`);
    out.push({
      id: 'L2', title: 'Anchor demand per baseplate', clause: 'BS EN 1992-4 (design by manufacturer software)', util: minE < minEdge ? minEdge / Math.max(minE, 1e-3) : 0, pass: minE >= minEdge,
      info: true, warnings, anchors, VEd, NEd,
      steps: [
        { title: 'Anchor shear demand', formula: 'V_Ed = √(Fu,d² + Fv,d²) / n', substitution: `H per bearing = ${f1(H)} kN, n = ${n}`, result: `V_Ed = ${f2(VEd)} kN per anchor` },
        { title: 'Anchor tension from overturning of the bearing', formula: 'N_Ed = H × h_b / z / (n/2)', substitution: `h_b = ${f3(hb)} m (bearing + grout), z = ${f3(z)} m between anchor rows`, result: `N_Ed = ${f2(NEd)} kN per anchor` },
        { title: 'Edge distances and recess avoidance', formula: `c ≥ c_min = ${Math.round(minEdge * 1000)} mm; anchors clear of the Ø94 lifting recess`, substitution: `${anchors.length} anchors checked against the seat course tiling`, result: `min c = ${Number.isFinite(minE) ? Math.round(minE * 1000) : '—'} mm${warnings.length ? ` — ${warnings.length} issue(s)` : ' — OK'}` },
        { title: 'Anchor design', formula: 'Anchor design by manufacturer software to BS EN 1992-4 in unreinforced C40/50', substitution: 'Cracked/uncracked assumption to be justified; avoid the lifting recess; grout pad ≤ 20 mm', result: 'Demand only — resistance not verified by this tool' },
      ],
    });
  }

  // L3 handling.
  const heavy = layout.heaviest;
  const flagged = layout.schedule.filter((r) => LEGATO_BLOCKS[r.code]?.liftFlag);
  out.push({
    id: 'L3', title: 'Handling and lifting', clause: 'LOLER 1998; Elite lifting details', util: 0, pass: true, info: true,
    steps: [
      { title: 'Heaviest lift', formula: 'Mass = max(stated, computed volume × 2350 kg/m³)', substitution: heavy ? `${heavy.code}${heavy.special ? ' (special)' : ''}` : '—', result: heavy ? `${Math.round(heavy.massEach)} kg (${f2(heavy.massEach / 1000)} t)` : '—' },
      { title: 'Lifting accessory', formula: 'T-050-0180 spherical pin anchor, Ø94 recess; ring clutch or combination ring clutch per LOLER 1998', substitution: flagged.length ? `LG1–LG3 present (${flagged.map((r) => r.code).join(', ')}) — 2.5 t handling note vs 5.0 t load class on drawings` : 'LG4–LG8 only: 5.0 t load class', result: flagged.length ? 'Confirm the lifting accessory rating with Elite (data flag 2)' : 'Confirm accessory rating with Elite' },
      { title: 'Pre-used blocks', formula: 'Inspect lifting pins for wear and corrosion, and blocks for cracks or damage, before reuse', substitution: 'Exclusion zones and a lift plan by the appointed person', result: 'See construction notes and DRA' },
    ],
  });

  // L4 grout thickness limits.
  const bed = A.groutBed || 0, bg = A.bearingGrout || 0;
  const u4 = Math.max(bed / 110, bg / 20);
  out.push({
    id: 'L4', title: 'Grout thickness limits', clause: 'BB default limits; manufacturer data', util: u4, pass: u4 <= 1,
    steps: [{ title: 'Grout limits', formula: 'Bedding grout ≤ 110 mm; bearing grout pad ≤ 20 mm', substitution: `Bedding ${bed} mm; bearing pad ${bg} mm`, result: `Utilisation ${f3(u4)} — ${u4 <= 1 ? 'OK' : 'EXCEEDS LIMIT'}` }],
  });
  return out;
}

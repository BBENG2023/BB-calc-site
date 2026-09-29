// layout.js — course geometry, block tiling on the 400 mm grid, block-type
// rule, self-weights, block schedule, tiling validation and the coursing /
// levels solver.

import { LEGATO_BLOCKS, legatoCode, legatoVolume, LEGATO_GAMMA } from '../../js/shared-data.js';

const G = 9.81 / 1000; // kg → kN

export function defaultL_mm(project) {
  const raw = project.bearingCentres * 1000 * Math.max(0, (project.bearingsPerEnd || 2) - 1) + project.bearingPlateB + 2 * 350;
  return Math.ceil(raw / 400) * 400;
}

// Courses in metres with resolved roles and z (from underside of course 1).
export function resolveCourses(end, mode = 'bridge') {
  const A = end.arrangement;
  const L = A.L_mm / 1000;
  const n = A.courses.length;
  let z = 0;
  return A.courses.map((c, i) => {
    let role = c.role && c.role !== 'auto' ? c.role : 'base';
    if ((!c.role || c.role === 'auto') && mode === 'bridge') {
      if (n >= 3 && i === n - 1) role = 'ballast';
      else if (n >= 3 && i === n - 2) role = 'seat';
      else if (n < 3 && i === n - 1) role = 'seat';
    }
    const h = (c.height || 800) / 1000;
    const out = {
      idx: i + 1, u0: c.u_front / 1000, u1: c.u_rear / 1000,
      v0: (c.v_start ?? 0) / 1000, v1: (c.v_end ?? A.L_mm) / 1000,
      z0: z, z1: z + h, h, h_mm: c.height || 800, orient: c.orient || 'T', role,
      typeRule: c.typeRule || 'auto', special: !!c.special, temporary: !!c.temporary, raw: c,
    };
    if (out.v1 > L + 1e-9) out.v1 = L;
    z += h;
    return out;
  });
}

// Split `total` (mm) into block lengths with an optional leading offset
// piece; lengths are 400/800/1200/1600.
function splitLengths(total, offset) {
  const segs = [];
  let p = 0;
  if (offset && total > offset) { segs.push(offset); p = offset; }
  while (total - p >= 1600) { segs.push(1600); p += 1600; }
  if (total - p > 0) segs.push(total - p);
  return segs;
}

// Bands across the course depth (u). T = 800-deep row of blocks laid with
// their long axis along v; L = band of blocks with long axis along u;
// 'Mixed' alternates a 1600 L band and an 800 T row, swapping order on
// alternate courses so the rows bond across each other.
function depthBands(depth, orient, k) {
  const bands = [];
  if (orient === 'L') return [{ a0: 0, d: depth, kind: 'L' }];
  let a = 0;
  if (orient === 'Mixed') {
    // Even courses: L, T, L, T… from the front; odd courses: the same
    // sequence reversed, so rows never line up with the course below.
    let pickL = true;
    const seq = [];
    while (depth - a > 0) {
      const rem = depth - a;
      if (pickL && rem >= 800) { const d = Math.min(1600, rem); seq.push({ d, kind: 'L' }); a += d; }
      else if (rem >= 800) { seq.push({ d: 800, kind: 'T' }); a += 800; }
      else { seq.push({ d: 400, kind: 'T400' }); a += 400; }
      pickL = !pickL;
    }
    if (k % 2 === 1) seq.reverse();
    let p = 0;
    seq.forEach((s) => { bands.push({ a0: p, d: s.d, kind: s.kind }); p += s.d; });
    return bands;
  }
  while (depth - a >= 800) { bands.push({ a0: a, d: 800, kind: 'T' }); a += 800; }
  if (depth - a === 400) bands.push({ a0: a, d: 400, kind: 'T400' });
  return bands;
}

// Tile one course rectangle on the 400 grid. Pieces carry plan extents (m),
// the block length L (mm) and the direction of the block's long axis.
export function tileCourse(c, k) {
  const pieces = [];
  const errors = [];
  const U0 = Math.round(c.u0 * 1000), U1 = Math.round(c.u1 * 1000);
  const V0 = Math.round(c.v0 * 1000), V1 = Math.round(c.v1 * 1000);
  const depth = U1 - U0, len = V1 - V0;
  if (depth <= 0 || len <= 0) return { pieces, errors: [`Course ${c.idx}: zero or negative extent.`], grid: false };
  if (depth % 400 || len % 400 || U0 % 400 || V0 % 400) {
    errors.push(`Course ${c.idx}: dimensions must be multiples of 400 mm (u ${U0}–${U1}, v ${V0}–${V1}).`);
    return { pieces, errors, grid: false };
  }
  const add = (u0, u1, v0, v1, blockLen, axis, row) => pieces.push({
    u0: (U0 + u0) / 1000, u1: (U0 + u1) / 1000, v0: (V0 + v0) / 1000, v1: (V0 + v1) / 1000,
    len: blockLen, axis, row, course: c.idx,
  });

  depthBands(depth, c.orient || 'Mixed', k).forEach((band, r) => {
    if (band.kind === 'T') {
      const off = c.orient === 'T' && (k + r) % 2 ? 800 : 0;
      let p = 0;
      splitLengths(len, off).forEach((s) => { add(band.a0, band.a0 + 800, p, p + s, s, 'v', r); p += s; });
    } else if (band.kind === 'T400') {
      let p = 0;
      while (len - p >= 800) { add(band.a0, band.a0 + 400, p, p + 800, 400, 'v', r); p += 800; }
      if (len - p === 400) errors.push(`Course ${c.idx}: a 400 × 400 piece is needed at the end of a 400 mm row — not in the Legato range. Adjust the course extent.`);
    } else {
      // L band: 800-wide strips along v, each tiled along u.
      let q = 0;
      let strip = 0;
      while (len - q > 0) {
        const w = len - q >= 800 ? 800 : 400;
        if (w === 800) {
          const off = band.d > 1600 && (k + strip) % 2 ? 800 : 0;
          let p = 0;
          splitLengths(band.d, off).forEach((s) => { add(band.a0 + p, band.a0 + p + s, q, q + 800, s, 'u', r); p += s; });
        } else {
          let p = 0;
          while (band.d - p >= 800) { add(band.a0 + p, band.a0 + p + 800, q, q + 400, 400, 'u', r); p += 800; }
          if (band.d - p === 400) errors.push(`Course ${c.idx}: a 400 × 400 piece is needed — not in the Legato range. Adjust the course extent.`);
        }
        q += w;
        strip++;
      }
    }
  });
  return { pieces, errors, grid: true };
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const rectOverlap = (p, q) => overlap(p.u0, p.u1, q.u0, q.u1) * overlap(p.v0, p.v1, q.v0, q.v1);

function blockWeightKN(block, basis, grossGamma, H_mm) {
  const vol = legatoVolume(block, H_mm);
  const computed = vol * LEGATO_GAMMA;
  const stated = block.massStated * G * (H_mm / 800);
  const gross = (block.L / 1000) * (block.W / 1000) * (H_mm / 1000) * grossGamma;
  const weight = basis === 'stated' ? stated : basis === 'gross' ? gross : computed;
  const handlingKg = Math.max(block.massStated * (H_mm / 800), vol * 2350);
  return { weight, computed, stated, gross, vol, handlingKg };
}

// Full layout for one end: tiled blocks with types and weights, course
// weights/centroids, schedule, validation messages.
export function buildLayout(state, endIdx) {
  const end = state.ends[endIdx];
  const mode = state.project.mode;
  const basis = state.basis.weightBasis || 'computed';
  const grossGamma = state.basis.grossGamma || 23.0;
  const allowed = new Set(end.arrangement.allowedTypes || []);
  const courses = resolveCourses(end, mode);
  const errors = [];
  const warnings = [];
  const n = courses.length;

  const tiles = courses.map((c, k) => {
    const t = tileCourse(c, k);
    errors.push(...t.errors);
    return t;
  });
  const gridOK = tiles.every((t) => t.grid !== false && !t.errors.length);

  courses.forEach((c, k) => {
    const above = courses[k + 1];
    const pieces = tiles[k].pieces;
    pieces.forEach((p) => {
      const area = (p.u1 - p.u0) * (p.v1 - p.v0);
      const cov = above ? tiles[k + 1].pieces.reduce((s, q) => s + rectOverlap(p, q), 0) / area : 0;
      let male;
      if (c.typeRule === 'female') male = false;
      else if (c.typeRule === 'male') male = true;
      else if (c.role === 'seat' || c.role === 'ballast' || k === n - 1) male = false;
      else if (cov >= 0.999) male = true;
      else male = cov >= 0.5;
      let code = legatoCode(p.len, male);
      if (code && !allowed.has(code)) {
        const alt = legatoCode(p.len, !male);
        if (alt && allowed.has(alt)) { warnings.push(`Course ${c.idx}: ${code} not in the allowed types — ${alt} used.`); code = alt; male = !male; }
        else warnings.push(`Course ${c.idx}: ${code} is not in the allowed block types.`);
      }
      p.code = code;
      p.male = male;
      p.coverage = cov;
      p.special = c.special || c.h_mm !== 800;
      p.temporary = c.temporary;
      const blk = LEGATO_BLOCKS[code];
      const w = blk ? blockWeightKN(blk, basis, grossGamma, c.h_mm) : { weight: 0, computed: 0, stated: 0, gross: 0, vol: 0, handlingKg: 0 };
      Object.assign(p, w);
      p.uc = (p.u0 + p.u1) / 2;
      p.vc = (p.v0 + p.v1) / 2;
    });
  });

  // Course weights: from tiled blocks, or rectangle × γ if the basis is
  // gross or the course could not be tiled.
  const gEq = LEGATO_BLOCKS.LG8 ? blockWeightKN(LEGATO_BLOCKS.LG8, basis, grossGamma, 800).weight / (1.6 * 0.8 * 0.8) : LEGATO_GAMMA;
  courses.forEach((c, k) => {
    const pieces = tiles[k].pieces;
    const rectW = (c.u1 - c.u0) * (c.v1 - c.v0) * c.h;
    if (basis === 'gross' || !tiles[k].grid || !pieces.length) {
      const gam = basis === 'gross' ? grossGamma : gEq;
      c.weight = rectW * gam;
      c.uc = (c.u0 + c.u1) / 2;
      c.vc = (c.v0 + c.v1) / 2;
      c.weightNote = basis === 'gross' ? `gross ${rectW.toFixed(3)} m³ × ${gam.toFixed(2)}` : `untiled — ${rectW.toFixed(3)} m³ × equivalent ${gam.toFixed(2)} kN/m³`;
      if (basis !== 'gross' && !tiles[k].grid) warnings.push(`Course ${c.idx} could not be tiled on the 400 grid — weight taken as volume × equivalent density ${gam.toFixed(2)} kN/m³.`);
    } else {
      c.weight = pieces.reduce((s, p) => s + p.weight, 0);
      c.uc = pieces.reduce((s, p) => s + p.weight * p.uc, 0) / c.weight;
      c.vc = pieces.reduce((s, p) => s + p.weight * p.vc, 0) / c.weight;
      c.weightNote = `${pieces.length} blocks (${basis})`;
    }
    c.pieces = pieces;
  });

  // Validation: overhang, joint stagger, continuous planes, heights.
  courses.forEach((c, k) => {
    if (c.h_mm !== 800) warnings.push(`Course ${c.idx}: special height ${c.h_mm} mm — special order, confirm with Elite.`);
    if (c.special) warnings.push(`Course ${c.idx}: special blocks (e.g. nibs ground off) — confirm with Elite.`);
    if (k > 0) {
      const b = courses[k - 1];
      if (c.u0 < b.u0 - 1e-9 || c.u1 > b.u1 + 1e-9 || c.v0 < b.v0 - 1e-9 || c.v1 > b.v1 + 1e-9) {
        errors.push(`Course ${c.idx} overhangs course ${b.idx} — not permitted.`);
      }
    }
  });
  const stagger = jointStagger(courses);
  warnings.push(...stagger.warnings);
  const planes = continuousPlanes(courses);
  planes.forEach((pl) => warnings.push(`Continuous vertical joint plane at u = ${pl.u.toFixed(1)} m through courses ${pl.from}–${pl.to} above the ${pl.interfaceLabel} — nibs do not tie across it (Elite: no tension or friction on vertical joints). Checked as independent parts in sliding (I4); consider alternating course orientation to bond across rows.`));

  // Schedule.
  const schedule = {};
  courses.forEach((c) => c.pieces.forEach((p) => {
    const key = `${p.code}${p.special ? ' (special)' : ''}${p.temporary ? ' (temporary)' : ''}`;
    if (!schedule[key]) schedule[key] = { key, code: p.code, count: 0, massEach: p.handlingKg, weightEach: p.weight, special: p.special, temporary: p.temporary, drawing: LEGATO_BLOCKS[p.code]?.drawing || '' };
    schedule[key].count += 1;
  }));
  const schedRows = Object.values(schedule).sort((a, b) => a.key.localeCompare(b.key));
  const totalBlocks = schedRows.reduce((s, r) => s + r.count, 0);
  const totalMassT = schedRows.reduce((s, r) => s + (r.count * r.massEach) / 1000, 0);
  const heaviest = schedRows.reduce((m, r) => (r.massEach > (m?.massEach || 0) ? r : m), null);
  const blockVolume = courses.reduce((s, c) => s + (c.pieces.length ? c.pieces.reduce((a, p) => a + p.vol, 0) : (c.u1 - c.u0) * (c.v1 - c.v0) * c.h), 0);

  return {
    courses, L: end.arrangement.L_mm / 1000, n, gridOK, errors, warnings, planes, stagger,
    schedule: schedRows, totalBlocks, totalMassT, heaviest, blockVolume,
    totalWeight: courses.filter((c) => !c.temporary).reduce((s, c) => s + c.weight, 0),
    seat: courses.find((c) => c.role === 'seat') || null,
    ballast: courses.find((c) => c.role === 'ballast') || null,
    basis,
  };
}

// Joints (vertical) in each course: segments along the stagger direction.
function courseJoints(c) {
  const segs = [];
  c.pieces?.forEach((p) => {
    // Block-end joints — the joints that must stagger course to course.
    if (p.axis === 'v') segs.push({ axis: 'v', pos: +p.v1.toFixed(3), a0: p.u0, a1: p.u1 });
    else segs.push({ axis: 'u', pos: +p.u1.toFixed(3), a0: p.v0, a1: p.v1 });
  });
  return segs.filter((s) => (s.axis === 'v' ? s.pos < c.v1 - 1e-6 : s.pos < c.u1 - 1e-6));
}

// u positions inside a course that no block crosses (full-length joints).
function courseBoundaries(c) {
  if (!c.pieces || !c.pieces.length) return [];
  const out = [];
  for (let u = c.u0 + 0.4; u < c.u1 - 1e-6; u += 0.4) {
    const p = +u.toFixed(3);
    if (!c.pieces.some((q) => q.u0 < p - 1e-6 && q.u1 > p + 1e-6)) out.push(p);
  }
  return out;
}

function jointStagger(courses) {
  const warnings = [];
  const joints = courses.map(courseJoints);
  let coincident = 0, triple = 0;
  for (let k = 1; k < courses.length; k++) {
    joints[k].forEach((s) => {
      const hit = joints[k - 1].some((t) => t.axis === s.axis && Math.abs(t.pos - s.pos) < 0.2 && overlap(t.a0, t.a1, s.a0, s.a1) > 1e-6);
      if (hit) {
        coincident++;
        if (k >= 2 && joints[k - 2].some((t) => t.axis === s.axis && Math.abs(t.pos - s.pos) < 1e-6 && overlap(t.a0, t.a1, s.a0, s.a1) > 1e-6)) triple++;
      }
    });
  }
  if (coincident) warnings.push(`${coincident} vertical joint(s) stagger less than 400 mm from the joint in the course below (target 800 mm).`);
  if (triple) warnings.push(`${triple} vertical joint(s) continue at the same position through two consecutive interfaces.`);
  return { coincident, triple, warnings };
}

// Planes along v (full length) at u = p through every course above an
// interface: every course above either has a full-length row boundary at p
// or does not span p.
export function continuousPlanes(courses) {
  const out = [];
  const seen = new Set();
  const bounds = courses.map(courseBoundaries);
  for (let k = 0; k < courses.length; k++) {
    const above = courses.slice(k);
    const cands = new Set();
    bounds.slice(k).forEach((b) => b.forEach((p) => cands.add(p)));
    cands.forEach((p) => {
      const spanning = above.filter((c) => c.u0 < p - 1e-6 && c.u1 > p + 1e-6);
      if (spanning.length < 2) return;
      const ok = spanning.every((c) => bounds[c.idx - 1].some((b) => Math.abs(b - p) < 1e-6));
      const hasFront = above.some((c) => c.u0 < p - 1e-6);
      const hasRear = above.some((c) => c.u1 > p + 1e-6);
      if (ok && hasFront && hasRear) {
        const key = `${p}|${spanning[spanning.length - 1].idx}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ u: p, from: above[0].idx, to: spanning[spanning.length - 1].idx, zInterface: courses[k].z0, interfaceLabel: k === 0 ? 'base' : `course ${k}/${k + 1} interface` });
      }
    });
  }
  return out;
}

// Coursing / levels solver. Returns formation, pad and course levels.
export function solveLevels({ targetLevel, courses, topIdx, pad, maxFormation, allowAddCourses = false }) {
  const messages = [];
  const options = [];
  const sumH = courses.slice(0, topIdx).reduce((s, c) => s + c.h, 0);
  const z0Level = targetLevel - sumH;
  const pMin = (pad.min ?? 150) / 1000, pMax = (pad.max ?? 500) / 1000;
  let padThk = (pad.thk ?? 0) / 1000;
  let status = 'ok';

  if (pad.mode === 'auto' && padThk > 0) {
    const needed = z0Level - maxFormation;
    if (!Number.isFinite(maxFormation)) padThk = pMin;
    else if (needed <= pMin) padThk = pMin;
    else if (needed <= pMax) padThk = needed;
    else {
      padThk = pMax;
      status = 'fail';
      const short = needed - pMax;
      messages.push(`No exact fit: the formation would sit ${(short * 1000).toFixed(0)} mm above the highest acceptable level with a 500 mm pad.`);
      options.push(`(a) Add a course and deepen the formation (pad then ${(Math.max(pMin, needed - 0.8) * 1000).toFixed(0)} mm).`);
      options.push(`(b) A special-height block course of ${(short * 1000 + 800).toFixed(0)} mm (special order — confirm with Elite).`);
      options.push('(c) Packing under the bearing within the 20 mm grout-pad limit, if the shortfall is small.');
    }
  }
  const formation = z0Level - padThk;
  if (Number.isFinite(maxFormation) && formation > maxFormation + 1e-6) {
    status = 'fail';
    if (!messages.length) messages.push(`Formation ${formation.toFixed(3)} is above the highest acceptable level ${maxFormation.toFixed(3)} mAOD.`);
  }
  const tops = [];
  let lvl = z0Level;
  courses.forEach((c) => { lvl += c.h; tops.push(lvl); });
  return {
    z0Level, formation, padThk, tops, status, messages, options,
    excavationBelowMax: Number.isFinite(maxFormation) ? maxFormation - formation : 0,
    allowAddCourses,
  };
}

// dispersion.js — load path from each bearing down through the dry-laid
// courses to the formation, and the loaded / unloaded zones along the
// abutment that the external checks (E1–E4) and settlement then run on.
//
// The blocks are dry-laid with no friction or tension relied on across
// vertical joints, so a bearing load only reaches the blocks it bears on.
// Modes (arrangement.dispersion.mode):
//   none   — plumb stack: the seat block(s) under the plate, straight down
//            (conservative lower bound);
//   bond   — default: each course spreads the load to the full length of
//            the blocks it overlaps in the course below (bond overlap);
//   angle  — spread at a user angle per course (default 2V:1H), capped by
//            the bond result; needs a justification;
//   full   — whole abutment length; only with an RC capping beam /
//            distribution slab (checked below — verify).
// Below the bottom course the pad spreads at basis.spread V:1H.

const EPS = 1e-6;
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

export const DISPERSION_MODES = [
  ['bond', 'Bond-based (default)'],
  ['none', 'None — plumb stack under the bearing'],
  ['angle', 'Angle (user value, capped by bond)'],
  ['full', 'Full length (RC capping beam only)'],
];

// Effective mode after the guards (angle needs a justification; full needs
// a capping beam with a section).
export function dispersionMode(state, end) {
  const d = end.arrangement.dispersion || {};
  const notes = [];
  let mode = d.mode || 'bond';
  if (state.project.mode !== 'bridge') return { mode: 'full', notes: ['Retaining-wall mode: analysis over the full length.'] };
  if (mode === 'angle' && !String(d.justification || '').trim()) {
    notes.push('Dispersion angle has no justification — bond-based dispersion used instead.');
    mode = 'bond';
  }
  if (mode === 'full' && !capBeamOn(d)) {
    notes.push('Full-length dispersion needs an RC capping beam / distribution slab with its section entered — bond-based dispersion used instead.');
    mode = 'bond';
  }
  return { mode, notes };
}

export function capBeamOn(d) {
  const c = d?.capBeam || {};
  return !!c.on && Number(c.b) > 0 && Number(c.h) > 0 && Number(c.As) > 0;
}

// Pieces of a course that the bearing plate rests on (u and v overlap).
function seatPieces(seat, uC, Lp, v0, v1) {
  return (seat.pieces || []).filter((p) => overlap(p.u0, p.u1, uC - Lp / 2, uC + Lp / 2) > EPS && overlap(p.v0, p.v1, v0, v1) > EPS);
}

// Path of one bearing: v-range at each course from the seat down, then at
// the formation after the pad.
export function bearingPath(state, geom, layout, b, mode) {
  const P = state.project;
  const Lp = (Number(P.bearingPlateL) || 300) / 1000;
  const Bp = (Number(P.bearingPlateB) || 400) / 1000;
  const seat = layout.seat;
  const plate = [b.v - Bp / 2, b.v + Bp / 2];
  const out = { k: b.k, v: b.v, plate, courses: [], straddle: false, notes: [] };
  if (!seat) { out.formation = [geom.footing.v0, geom.footing.v1]; return out; }
  const sp = seatPieces(seat, b.u, Lp, plate[0], plate[1]);
  let a, z;
  if (sp.length) {
    a = Math.min(...sp.map((p) => p.v0));
    z = Math.max(...sp.map((p) => p.v1));
    // A joint under the plate within one bond row (same u band).
    const rows = new Map();
    sp.forEach((p) => { const key = `${p.u0.toFixed(3)}|${p.u1.toFixed(3)}`; rows.set(key, (rows.get(key) || 0) + 1); });
    if ([...rows.values()].some((n) => n > 1)) {
      out.straddle = true;
      out.notes.push(`Bearing ${b.k + 1} plate straddles a vertical joint in the seat course — move it onto one block or check each block for its share.`);
    }
  } else { a = plate[0]; z = plate[1]; }
  out.courses.push({ idx: seat.idx, a, b: z });
  const below = geom.courses.filter((c) => c.idx < seat.idx).sort((x, y) => y.idx - x.idx);
  const d = state.ends[geom.endIdx].arrangement.dispersion || {};
  const ratio = Math.max(0.5, Number(d.angleRatio) || 2); // V per 1 H
  let ab = a, zb = z; // bond envelope (cap for the angle mode)
  below.forEach((c) => {
    if (mode !== 'none' && c.pieces && c.pieces.length) {
      const hit = c.pieces.filter((p) => overlap(p.v0, p.v1, ab, zb) > EPS);
      if (hit.length) { ab = Math.min(ab, ...hit.map((p) => p.v0)); zb = Math.max(zb, ...hit.map((p) => p.v1)); }
    }
    if (mode === 'bond') { a = ab; z = zb; }
    else if (mode === 'angle') { const g = c.h / ratio; a = Math.max(a - g, ab); z = Math.min(z + g, zb); }
    out.courses.push({ idx: c.idx, a, b: z });
  });
  // Pad: spread at basis.spread V:1H through the thickness.
  const t = geom.pad.t || 0;
  const sp2 = Number(state.basis.spread) || 2;
  const ft = geom.footing;
  out.formation = [Math.max(ft.v0, a - t / sp2), Math.min(ft.v1, z + t / sp2)];
  return out;
}

// Zones along the abutment at formation level: merged loaded zones and the
// unloaded remainder.
export function abutmentZones(state, geom, layout) {
  const end = state.ends[geom.endIdx];
  const { mode, notes } = dispersionMode(state, end);
  const ft = geom.footing;
  if (mode === 'full' || !geom.bearings?.length) {
    return { mode, notes, paths: [], zones: [{ kind: 'loaded', v0: ft.v0, v1: ft.v1, bearings: (geom.bearings || []).map((b) => b.k), full: true }] };
  }
  const paths = geom.bearings.map((b) => bearingPath(state, geom, layout, b, mode));
  paths.forEach((p) => notes.push(...p.notes));
  const sorted = [...paths].sort((x, y) => x.formation[0] - y.formation[0]);
  const loaded = [];
  sorted.forEach((p) => {
    const last = loaded[loaded.length - 1];
    if (last && p.formation[0] <= last.v1 + EPS) { last.v1 = Math.max(last.v1, p.formation[1]); last.bearings.push(p.k); }
    else loaded.push({ kind: 'loaded', v0: p.formation[0], v1: p.formation[1], bearings: [p.k] });
  });
  const zones = [];
  let cur = ft.v0;
  loaded.forEach((z) => {
    if (z.v0 - cur > 0.05) zones.push({ kind: 'unloaded', v0: cur, v1: z.v0, bearings: [] });
    zones.push(z);
    cur = z.v1;
  });
  if (ft.v1 - cur > 0.05) zones.push({ kind: 'unloaded', v0: cur, v1: ft.v1, bearings: [] });
  else if (zones.length) zones[zones.length - 1].v1 = Math.max(zones[zones.length - 1].v1, ft.v1);
  if (zones.length && zones[0].v0 > ft.v0) zones[0].v0 = ft.v0;
  return { mode, notes, paths, zones };
}

// Geometry of one zone (a vertical prism v0..v1 through the whole section):
// courses and blocks clipped to the prism (block weight by overlap length),
// fill, earth and water over the zone length, and only the bridge items of
// the bearings in the zone. The external checks run on it unchanged.
export function zoneGeom(geom, zone) {
  const { v0, v1 } = zone;
  const Lz = v1 - v0;
  const clipCourse = (c) => {
    const cv0 = Math.max(c.v0, v0), cv1 = Math.min(c.v1, v1);
    const frac = c.v1 > c.v0 ? Math.max(0, cv1 - cv0) / (c.v1 - c.v0) : 0;
    const pieces = (c.pieces || []).map((p) => {
      const o = overlap(p.v0, p.v1, v0, v1);
      if (o <= EPS) return null;
      const f = o / (p.v1 - p.v0);
      const a = Math.max(p.v0, v0), b = Math.min(p.v1, v1);
      return { ...p, v0: a, v1: b, vc: (a + b) / 2, weight: p.weight * f };
    }).filter(Boolean);
    return { ...c, v0: cv0, v1: cv1, vc: (cv0 + cv1) / 2, weight: (c.weight || 0) * frac, pieces };
  };
  const courses = geom.courses.map(clipCourse);
  const pad = { ...geom.pad, v0: Math.max(geom.pad.v0, v0), v1: Math.min(geom.pad.v1, v1) };
  const footing = { ...geom.footing, v0, v1, L: Lz };
  const bf0 = geom.baseFoot;
  const baseFoot = { ...bf0, v0: Math.max(bf0.v0, v0), v1: Math.min(bf0.v1, v1) };
  baseFoot.L = Math.max(0, baseFoot.v1 - baseFoot.v0);
  const inZone = new Set(zone.bearings || []);
  const bridgeItems = zone.full ? geom.bridgeItems : geom.bridgeItems.filter((it) => Number.isInteger(it.bearing) && inZone.has(it.bearing));
  const scale = geom.L > 0 ? Lz / geom.L : 1;
  const hydraulicItems = geom.hydraulicItems.map((it) => (it.dir === 'u' ? { ...it, Fu: it.Fu * scale, Fv: it.Fv * scale } : it));
  return { ...geom, L: Lz, vMid: (v0 + v1) / 2, courses, pad, footing, baseFoot, bridgeItems, hydraulicItems, zone };
}

// RC capping beam / distribution slab, rigid-beam approximation: bearing
// loads (ULS, C1) on a beam of length L with a uniform ground reaction.
// Bending (BS EN 1992-1-1 6.1, simplified z = 0.9d) and shear without links
// (6.2.2). Flagged "verify" — a beam-on-elastic-foundation analysis may be
// needed for long or flexible beams.
export function capBeamCheck(state, geom, loads) {
  const c = (state.ends[geom.endIdx].arrangement.dispersion || {}).capBeam || {};
  const b = Number(c.b) / 1000, h = Number(c.h) / 1000, As = Number(c.As);
  const fck = Number(c.fck) || 32, fyk = Number(c.fyk) || 500, cover = (Number(c.cover) || 50) / 1000;
  const d = h - cover - 0.016;
  const L = geom.footing.L;
  const v0 = geom.footing.v0;
  const P = loads; // [{ v, P }]
  const W = P.reduce((a, x) => a + x.P, 0);
  const w = W / L;
  let Mmax = 0, Vmax = 0;
  for (let i = 0; i <= 400; i++) {
    const v = v0 + (L * i) / 400;
    let M = (w * (v - v0) ** 2) / 2, V = w * (v - v0);
    P.forEach((x) => { if (x.v <= v) { M -= x.P * (v - x.v); V -= x.P; } });
    Mmax = Math.max(Mmax, Math.abs(M));
    Vmax = Math.max(Vmax, Math.abs(V));
  }
  const MRd = (As / 1e6) * (fyk / 1.15) * 1000 * 0.9 * d; // kNm
  const k = Math.min(2, 1 + Math.sqrt(0.2 / d));
  const rho = Math.min(0.02, As / 1e6 / (b * d));
  const vmin = 0.035 * k ** 1.5 * Math.sqrt(fck);
  const vRdc = Math.max((0.18 / 1.5) * k * (100 * rho * fck) ** (1 / 3), vmin); // MPa
  const VRd = vRdc * b * d * 1000; // kN
  return { b, h, d, As, fck, fyk, L, W, w, Mmax, Vmax, MRd, VRd, uM: Mmax / MRd, uV: Vmax / VRd, util: Math.max(Mmax / MRd, Vmax / VRd) };
}

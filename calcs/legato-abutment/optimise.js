// optimise.js — auto-size search. Varies base width, rear step, courses
// below the shelf and (optionally) setback; picks the minimum block volume,
// then the minimum excavation, that passes every ULS and SLS check.

import { clone, newCourse } from './schema.js';
import { evaluateEnd } from './engine.js';

// Arrangement family (BB standard): full-width courses below the shelf, a
// seat course of depth `shelf` at the rear (front step at the shelf), and
// an 800 mm ballast wall at the rear of the seat.
export function familyCourses({ B, s, nBelow, shelf, frontStep, ballast = 800, orient = 'Mixed' }) {
  const upperRear = B - s;
  const courses = [];
  for (let i = 0; i < nBelow; i++) courses.push(newCourse({ u_front: 0, u_rear: i === 0 ? B : upperRear, orient, role: 'base' }));
  const seatFront = frontStep ? Math.max(0, upperRear - shelf) : 0;
  courses.push(newCourse({ u_front: seatFront, u_rear: upperRear, orient, role: 'seat' }));
  courses.push(newCourse({ u_front: upperRear - ballast, u_rear: upperRear, orient, role: 'ballast' }));
  return courses;
}

const CRITICAL = (u) => !u.info && u.id !== 'L2';

function candidateResult(state, endIdx) {
  const r = evaluateEnd(state, endIdx);
  const crit = r.util.filter(CRITICAL);
  const worst = crit.reduce((m, u) => (u.util > (m?.util ?? -1) ? u : m), null);
  const ok = !r.errors.length && r.levels.status !== 'fail' && crit.every((u) => u.pass);
  const excavation = r.geom.frontGroundLevel - r.levels.formation;
  return { ok, worst, volume: r.layout.blockVolume, excavation, levels: r.levels, errors: r.errors, blocks: r.layout.totalBlocks, massT: r.layout.totalMassT };
}

export function* autoSizeSteps(state0, endIdx) {
  const end0 = state0.ends[endIdx];
  const A = end0.arrangement;
  const Bmax = Math.max(1600, Math.floor((A.Bmax_mm || 6400) / 400) * 400);
  const shelf = Math.max(1200, A.shelf_mm || 1600);
  const steps = A.rearStep ? [0, 400, 800] : [0];
  const setbacks = [0];
  for (let sb = 0.25; sb <= (A.maxSetback || 0) + 1e-9; sb += 0.25) setbacks.push(+sb.toFixed(2));
  const sL = endIdx === 0 ? -1 : 1;

  // Minimum courses below the seat from the levels (pad ≤ max).
  const seat = Number(end0.seatLevel);
  const probe = clone(state0);
  probe.ends[endIdx].arrangement.courses = familyCourses({ B: Math.max(2400, shelf), s: 0, nBelow: 1, shelf, frontStep: A.frontStepAtShelf });
  probe.ends[endIdx].arrangement.pad.mode = 'auto';
  const pr = evaluateEnd(probe, endIdx);
  const maxF = pr.levels.maxFormation.level;
  const padMax = (A.pad.max ?? 500) / 1000;
  let nMin = 1;
  while (seat - (nMin + 1) * 0.8 - padMax > maxF + 1e-9 && nMin < 12) nMin++;

  // Ballast wall 800 (one row) or 1200 (heavier, for larger surcharge); the
  // seat is then at least ballast + 800 deep to leave a bearing shelf.
  const cands = [];
  [800, 1200].forEach((ballast) => {
    const sh = Math.max(shelf, ballast + 800);
    for (let B = Math.max(1600, sh); B <= Bmax; B += 400) {
      steps.forEach((s) => {
        if (B - s < sh) return;
        [0, 1, 2].forEach((extra) => setbacks.forEach((sb) => cands.push({ B, s, nBelow: nMin + extra, setback: sb, ballast, shelf: sh })));
      });
    }
  });
  const tried = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const st = clone(state0);
    const e = st.ends[endIdx];
    e.arrangement.courses = familyCourses({ B: c.B, s: c.s, nBelow: c.nBelow, shelf: c.shelf, frontStep: A.frontStepAtShelf, ballast: c.ballast });
    e.arrangement.pad.mode = 'auto';
    if (e.arrangement.pad.thk <= 0) e.arrangement.pad.thk = 250;
    e.frontChainage = Number(end0.frontChainage) + sL * c.setback;
    const r = candidateResult(st, endIdx);
    tried.push({ ...c, ...r, courses: e.arrangement.courses });
    yield { progress: (i + 1) / cands.length };
  }
  const passing = tried.filter((t) => t.ok).sort((a, b) => a.volume - b.volume || a.excavation - b.excavation);
  const chosen = passing[0] || null;
  let why = '';
  const remedies = [];
  if (chosen) {
    const smaller = tried.filter((t) => t.s === chosen.s && t.nBelow === chosen.nBelow && t.setback === chosen.setback && t.ballast === chosen.ballast && t.B === chosen.B - 400)[0]
      || tried.filter((t) => t.volume < chosen.volume).sort((a, b) => b.volume - a.volume)[0];
    why = smaller
      ? `B = ${chosen.B} mm chosen: the next smaller base (B = ${smaller.B} mm) fails ${smaller.worst ? `${smaller.worst.id} ${smaller.worst.title} (utilisation ${smaller.worst.util.toFixed(3)})` : smaller.errors[0] || 'the levels solver'}.`
      : `B = ${chosen.B} mm is the smallest base width in the search range; governing check ${chosen.worst?.id} ${chosen.worst?.title} at ${chosen.worst?.util.toFixed(3)}.`;
    why += ` ${chosen.nBelow} course(s) below the seat; ballast wall ${chosen.ballast} mm; seat ${chosen.shelf} mm deep.`;
    if (chosen.s) why += ` Rear step ${chosen.s} mm (fill on the heel).`;
    if (chosen.setback) why += ` Extra setback ${chosen.setback} m.`;
  } else {
    const best = tried.filter((t) => t.worst).sort((a, b) => a.worst.util - b.worst.util)[0];
    why = best ? `No arrangement up to B = ${Bmax} mm passes. Best candidate B = ${best.B} mm, rear step ${best.s} mm, ${best.nBelow} course(s) below the seat: governing ${best.worst.id} ${best.worst.title} at ${best.worst.util.toFixed(3)}.` : 'No arrangement passes.';
    remedies.push('Increase setback from the bank crest.', 'Deepen the founding level.', 'Ground improvement or replacement of weak strata.', 'Rely on passive resistance with a stated minimum front fill level.', 'Remove the approach surcharge during abnormal loads (traffic management).', 'Share braking between both ends (bridge supplier confirmation).', 'Use a mass concrete base.');
  }
  return { chosen, why, remedies, tried: tried.map(({ courses, ...t }) => t), passingCount: passing.length, count: tried.length, chosenCourses: chosen ? chosen.courses : null };
}

// Synchronous run (tests / Node).
export function autoSize(state, endIdx) {
  const it = autoSizeSteps(state, endIdx);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

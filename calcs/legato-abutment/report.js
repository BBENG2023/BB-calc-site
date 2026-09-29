// report.js — the printed design sheet: 18 sections in BB house style, each
// on its own sheet(s) with "Sheet x of y", a disclaimer strip and the CEng
// statement on every sheet, and the full sign-off block at the end.

import { buildSheetHeader, buildSignoff, buildFooter, el } from '../../js/report.js';
import { escapeHtml } from '../../js/formatters.js';
import { FACTOR_PRESETS, LEGATO_BLOCKS } from '../../js/shared-data.js';
import { drawingD1, diagramD2, drawingD3, drawingD4, drawingD5, drawingD6 } from './drawings.js';
import { defaultClauses, defaultDRA } from './spec.js';
import { REACTION_GROUPS } from './schema.js';

const e = escapeHtml;
const fx = (n, d = 3) => (Number.isFinite(n) ? Number(n).toFixed(d) : '—');
const ut = (u) => `<span class="lg-util ${u > 1 ? 'fail' : u > 0.9 ? 'near' : 'ok'}">${fx(u, 3)}</span>`;
const odf = (v) => `<span class="lg-util ${v < 1 ? 'fail' : v < 1.1 ? 'near' : 'ok'}">${fx(v, 3)}</span>`;

function tableHTML(headers, rows, cls = '') {
  return `<table class="rs-input-table lg-table ${cls}"><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td${typeof c === 'number' ? ' class="num"' : ''}>${typeof c === 'number' ? (Number.isInteger(c) ? String(c) : fx(c, 2)) : c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function stepsHTML(steps, anchor) {
  return `<div${anchor ? ` id="${anchor}"` : ''}>${(steps || []).map((s, i) => `
    <div class="rs-step">
      <div class="rs-step-title">${i + 1}. ${e(s.title)}</div>
      ${s.formula ? `<div class="rs-step-line"><span class="rs-step-key">Formula:</span><span>${e(s.formula)}</span></div>` : ''}
      ${s.substitution ? `<div class="rs-step-line"><span class="rs-step-key">Substitution:</span><span>${e(s.substitution)}</span></div>` : ''}
      ${s.result ? `<div class="rs-step-line"><span class="rs-step-key">Result:</span><span>${e(s.result)}</span></div>` : ''}
    </div>`).join('')}</div>`;
}

const h4 = (n, t) => `<h4 class="rs-section-title"><span class="rs-section-num">${n}</span><span>${e(t)}</span></h4>`;
const h5 = (t, id) => `<h5 class="lg-h5"${id ? ` id="${id}"` : ''}>${e(t)}</h5>`;

export function buildReport(state, output, headerDetails = {}, calc) {
  const D = output.design;
  const bridge = D.bridge;
  const P = state.project;
  const sheets = [];
  const add = (num, title, html, opts = {}) => sheets.push({ num, title, html, ...opts });
  const endsL = D.ends;

  // 1 Brief and scope.
  add(1, 'Brief and scope', `
    <p><strong>${e(state.meta.presetName || '')}</strong>${state.meta.notes ? ` — ${e(state.meta.notes)}` : ''}</p>
    <p>${bridge ? `Design of dry-laid Legato interlocking block bank seats for a single-span bridge (${e(P.bridgeDescription || '')}): span ${fx(P.span, 3)} m bearing to bearing, deck ${fx(P.deckWidth, 2)} m wide, ${P.bearingsPerEnd} bearings per end, fixed end ${P.fixedEnd}, skew ${P.skew}°.` : 'Retaining-wall mode (Elite guide method): single section per metre run, no bridge or crossing checks.'}</p>
    <p>Status: ${e(P.status)} works; design life ${P.designLife} years (Legato blocks rated &gt; 100 years by Elite). Mode: ${endsL.map((x) => `${e(x.label)} ${state.ends[x.endIdx].arrangement.mode === 'auto' ? 'auto-sized' : 'checked'}`).join(', ')}.</p>
    <p>Scope: ground model from SPT boreholes; bridge reactions, approach earth pressures and hydraulic actions; block arrangement and coursing to levels; external, internal and local stability; overall stability; settlement; crossing checks; construction stages; drawings, schedules, specification, designer’s risk assessment and PLT requirement.</p>
    <p class="lg-note">Out of scope: BS EN 1992-4 anchor resistance; non-circular slips and undrained drawdown; scour depth calculation; Vee/Duo blocks; DXF; 3D skew/wing interaction; multi-span piers; EN 1997:2024.</p>`);

  // 2 Design basis.
  const F = state.basis.factors;
  const base = FACTOR_PRESETS[state.basis.preset] || FACTOR_PRESETS.A2;
  const edits = [];
  ['EQU', 'C1', 'C2'].forEach((c) => ['gGsup', 'gGinf', 'gQt', 'gQo'].forEach((k) => { if (base[c] && F[c][k] !== base[c][k]) edits.push(`${c}.${k} ${base[c][k]} → ${F[c][k]}`); }));
  ['M2'].forEach((m) => ['gPhi', 'gC', 'gCu'].forEach((k) => { if (F[m][k] !== base[m][k]) edits.push(`${m}.${k} ${base[m][k]} → ${F[m][k]}`); }));
  add(2, 'Design basis', `
    <p>Verification: BS EN 1997-1 Design Approach 1 (Combinations 1 and 2) plus EQU; legacy unity-factor FoS (target ${F.legacy.sliding} sliding and toppling) reported alongside for comparison with Elite/CPL designs.${F.legacyOnly ? ' <strong>Legacy preset selected — verdict on legacy FoS only.</strong>' : ''}</p>
    <p>Factor preset: <strong>${e(base.label)}</strong>. Source: ${e(base.source)} <em>(verify)</em>.${edits.length ? ` Edited values: ${e(edits.join('; '))}.` : ' No edits to the preset.'}</p>
    ${tableHTML(['Set', 'γG,sup', 'γG,inf', 'γQ traffic', 'γQ other', 'Materials'], ['EQU', 'C1', 'C2'].map((c) => [c === 'C1' ? 'DA1-C1 (A1+M1+R1)' : c === 'C2' ? 'DA1-C2 (A2+M2+R1)' : 'EQU', F[c].gGsup, F[c].gGinf, F[c].gQt, F[c].gQo, F[c].M]))}
    <p>M2: γφ′ ${F.M2.gPhi} (on tan φ′), γc′ ${F.M2.gC}, γcu ${F.M2.gCu}; R1: γR = ${F.R1.gRv}. SLS characteristic and quasi-permanent: γ = 1.0 with ψ applied. Water actions γ = ${F.gWater}.</p>
    <p>Materials: Legato blocks C40/50 plain concrete (fcu 50 N/mm²), fcd,pl = 16.0 N/mm², fctd,pl = 1.0 N/mm² (BS EN 1992-1-1 §12, αcc,pl = αct,pl = 0.6, UK NA — verify). Self-weight basis: ${e(state.basis.weightBasis)}. Block–block friction μk = ${state.basis.muBlock}${state.basis.nibShear ? `; nib shear included at ULS (η_eng = ${state.basis.etaEng}) — BB judgement, not manufacturer data` : '; nib shear not relied on'}.</p>
    <p>Earth pressure: ${e(state.basis.epMethod)}. Design check category (header): ${e(headerDetails.checkedCategory || 'to be confirmed')}.</p>`);

  // 3 Bridge data and loads.
  if (bridge) {
    const rows = (state.loads.reactions || []).map((r) => [e(r.name), e(REACTION_GROUPS.find((g) => g.value === r.group)?.label || r.group), e(r.model || ''), r.basis === 'perBearing' ? 'per bearing' : 'total', Number(r.X) || 0, Number(r.Y) || 0, Number(r.Z) || 0, r.reversible ? '±' : '', r.xFixedOnly ? 'fixed end' : 'both', `${r.psi0}/${r.psi1}/${r.psi2}`, e(r.end)]);
    const sits = endsL[0].situations.map((s) => [e(s.id), e(s.label), s.kind]);
    add(3, 'Bridge data and loads', `
      <p>Bearing plate ${P.bearingPlateL} × ${P.bearingPlateB} mm, assembly height ${P.bearingHeight} mm; free-end sliding μ = ${P.slidingMu} (free-end X = ±μ(G + concurrent vertical traffic)). Horizontal loads applied at seat level + grout + bearing height.</p>
      ${tableHTML(['Case', 'Group', 'Model', 'Basis', 'X kN', 'Y kN', 'Z kN', '±', 'X resisted', 'ψ0/ψ1/ψ2', 'End'], rows)}
      <p>Traffic models: ${state.loads.trafficModels.map((m) => `${e(m.name)}${m.excludeSurchargeWind ? ' (approach surcharge and wind excluded when this model acts)' : ''}`).join('; ')}. Models are non-coexistent — each forms its own combinations. Where per-corner maxima are summed for an abutment total, this is conservative for bearing and irrelevant for sliding/overturning (vertical traffic favourable, set to zero).</p>
      <p>Approach surcharge q = ${state.loads.surcharge} kPa (acts with the leading traffic model; ψ0 = ${state.loads.surchargePsi0} when accompanying), setback ${state.loads.surchargeSetback} m. Compaction pressure: ${state.loads.compaction.on ? `σ′h = ${state.loads.compaction.sigma} kPa, zc = ${state.loads.compaction.zc} m` : 'not included'}. Differential water head ${state.loads.waterHead} m.</p>
      ${state.loads.launch.length ? tableHTML(['Launch load', 'u m', 'v m', 'Fz kN', 'Fu kN', 'Fv kN', 'Source'], state.loads.launch.map((r) => [e(r.name), r.u, r.v, r.Fz, r.Fu, r.Fv, e(r.source || '')])) : '<p>No launch/erection point loads entered.</p>'}
      ${h5('Design situations (both ends)')}${tableHTML(['Id', 'Situation', 'Kind'], sits)}
      <p>Each situation is combined with EQU, DA1-C1, DA1-C2, SLS characteristic, SLS quasi-permanent and legacy factor sets, for both directions of reversible actions.</p>`);
  } else {
    add(3, 'Loads', `<p>Retained fill surface ${fx(state.ends[0].fillSurfaceZ, 2)} m above the underside of the bottom course; fill γ ${state.ends[0].fill.gamma} kN/m³, φ′ ${state.ends[0].fill.phi}°; surcharge q = ${state.loads.surcharge} kPa behind the wall (never counted as stabilising).</p>`);
  }

  // 4 Crossing and levels.
  const levelRows = [];
  endsL.forEach((x) => {
    const g = x.geom, lv = x.levels;
    const cr = D.crossing?.ends[x.endIdx];
    levelRows.push([`<strong>${e(x.label)}</strong>`, '', '']);
    levelRows.push(['Formation', fx(lv.formation), `max acceptable ${fx(lv.maxFormation.level)} (${e(lv.maxFormation.why)})`]);
    levelRows.push(['Pad top / underside of course 1', fx(lv.z0Level), `pad ${Math.round(lv.padThk * 1000)} mm`]);
    x.layout.courses.forEach((c, i) => levelRows.push([`Course ${c.idx} top (${c.role})`, fx(lv.tops[i]), `${c.h_mm} mm`]));
    if (bridge) {
      levelRows.push(['Bearing seat (target)', fx(g.seatLevel), '']);
      levelRows.push(['FRL', fx(state.ends[x.endIdx].FRL), x.layout.ballast ? `ballast top − FRL = ${fx(lv.tops[x.layout.ballast.idx - 1] - state.ends[x.endIdx].FRL)} m` : '']);
      if (cr) {
        levelRows.push(['Deck soffit', fx(cr.soffit), '']);
        levelRows.push(['DFL / freeboard', fx(state.crossing.DFL), `${fx(cr.freeboard)} m`]);
      }
    }
    levelRows.push(['Front ground', fx(g.frontGroundLevel), '']);
  });
  add(4, bridge ? 'Crossing and levels' : 'Levels', `
    ${bridge ? `<p>Channel: bed ${fx(state.crossing.bedLevel)}, NWL ${fx(state.crossing.NWL)}, DFL ${fx(state.crossing.DFL)} mAOD (${e(state.crossing.DFLlabel || '')}${state.crossing.DFLsource ? `; ${e(state.crossing.DFLsource)}` : ''}).</p>` : ''}
    ${h5('Coursing and levels table (mAOD)')}${tableHTML(['Item', 'Level', 'Note'], levelRows)}
    ${endsL.map((x) => (x.levels.options.length ? `<p class="lg-note">${e(x.label)}: ${e(x.levels.messages.join(' '))} ${e(x.levels.options.join(' '))}</p>` : '')).join('')}`);
  if (bridge) add(4, 'Crossing long section (D1)', `<div class="lg-drawing">${drawingD1(state, D)}</div>`, { a3: true });

  // 5 Ground model.
  endsL.forEach((x) => {
    const gr = x.ground;
    const bhRows = gr.processed.map((p) => [e(p.id), fx(p.bh.GL), fx(p.bh.finalDepth, 1), p.Er, `${p.bh.standing ?? '—'} / ${p.bh.roseTo ?? '—'}`, p.tests.length]);
    const layerRows = gr.layers.map((l) => [e(l.desc || l.cls), e(l.cls), `${fx(l.topLevel)} to ${fx(l.baseLevel)}`, fx(l.gamma, 1), l.cls === 'Cohesive' ? `cu ${fx(l.cu, 0)} kPa; φ′ ${fx(l.phi, 1)}°` : `φ′ ${fx(l.phi, 1)}°`, l.char?.phi ? `${l.char.phi.method}: n ${l.char.phi.n}, mean ${fx(l.char.phi.mean, 1)}, SD ${fx(l.char.phi.sd, 1)}` : l.char?.cu ? `${l.char.cu.method}: n ${l.char.cu.n}, mean ${fx(l.char.cu.mean, 0)}, SD ${fx(l.char.cu.sd, 0)}` : e(l.source || ''), l.unsuitable ? 'Unsuitable' : e(l.overrideNote || '')]);
    const testRows = gr.processed.flatMap((p) => p.tests.map((t) => [e(p.id), fx(t.depth, 2), e(t.raw), fx(t.N, 1), fx(t.N60, 1), fx(t.sigmaV, 1), fx(t.CN, 3), fx(t.N160, 1), t.phi ? fx(t.phi, 1) : t.cu ? `cu ${fx(t.cu, 0)}` : '—']));
    add(5, `Ground model — ${x.label}`, `
      <p>Design groundwater ${Number.isFinite(gr.gw.level) ? fx(gr.gw.level) : 'deep'} mAOD (${e(gr.gw.source)}). Design borehole: ${e(gr.designId || 'manual profile')}.</p>
      ${bhRows.length ? tableHTML(['Borehole', 'GL mAOD', 'Depth m', 'Er %', 'Standing / rose to (m bgl)', 'SPTs'], bhRows) : ''}
      ${h5('Design profile and characteristic values (BS EN 1997-1 2.4.5.2)')}${tableHTML(['Stratum', 'Class', 'Levels mAOD', 'γ kN/m³', 'Parameters', 'Derivation', 'Note'], layerRows)}
      ${testRows.length ? `${h5('SPT processing (N60 = N·Er/60; C_N = min(√(100/σ′v), 2.0), Liao & Whitman 1986; φ′ PHT/Wolff or Hatanaka & Uchida; cu = f1·N60, Stroud 1974)')}${tableHTML(['BH', 'Depth', 'Result', 'N', 'N60', 'σ′v kPa', 'C_N', '(N1)60', 'φ′ / cu'], testRows, 'lg-small')}` : ''}
      <div class="lg-drawing">${drawingD5(state, D, x.endIdx)}</div>`);
  });

  // 6 Arrangement.
  endsL.forEach((x) => {
    const lay = x.layout;
    const sched = lay.schedule.map((r) => [e(r.key), r.count, Math.round(r.massEach), fx((r.count * r.massEach) / 1000, 2), e(r.drawing), r.special ? 'Special — confirm with Elite' : r.temporary ? 'Temporary' : '']);
    const courseRows = lay.courses.map((c) => [c.idx, e(c.role), `${Math.round(c.u0 * 1000)}–${Math.round(c.u1 * 1000)}`, `${Math.round(c.v0 * 1000)}–${Math.round(c.v1 * 1000)}`, e(c.orient), c.h_mm, fx(c.weight, 1), e(c.weightNote)]);
    const as = state.cache?.autosize?.[x.endIdx];
    add(6, `Abutment arrangement — ${x.label}`, `
      ${as && as.hash === D.hash ? `<p class="lg-note"><strong>Auto-size:</strong> ${e(as.why)}</p>` : as ? '<p class="lg-note">Auto-size result is stale — inputs changed since it was run.</p>' : ''}
      <div class="lg-drawing">${diagramD2(state, D, x.endIdx)}</div>
      ${h5('Course table')}${tableHTML(['Course', 'Role', 'u mm', 'v mm', 'Bond', 'H mm', 'Weight kN', 'Basis'], courseRows)}
      ${h5('Block schedule')}${tableHTML(['Type', 'Count', 'Mass each kg', 'Total t', 'Elite drawing', 'Flag'], [...sched, ['<strong>Total</strong>', lay.totalBlocks, '', fx(lay.totalMassT, 2), '', '']])}
      <p>Heaviest lift ${lay.heaviest ? `${e(lay.heaviest.code)} ${Math.round(lay.heaviest.massEach)} kg` : '—'} (greater of stated and computed mass).</p>`);
    add(6, `Layer plans and transverse section — ${x.label}`, `<div class="lg-drawing">${drawingD3(state, D, x.endIdx)}</div>${bridge ? `<div class="lg-drawing">${drawingD4(state, D, x.endIdx)}</div>` : ''}`);
  });

  // 7 External stability.
  endsL.forEach((x) => {
    const C = x.checks;
    const n = x.endIdx + 1;
    const sum = [C.E1, C.E2, C.E3, C.E4, C.E7].filter(Boolean).map((c) => [c.id, e(c.title), e(c.clause || ''), c.na ? 'n/a' : ut(c.util), e((D.ends[x.endIdx].util.find((u) => u.id === c.id)?.gov) || '')]);
    const legacy = [
      ['Sliding', C.E2.legacy ? fx(C.E2.legacy.fos, 3) : '—', F.legacy.sliding],
      ['Overturning', C.E3.legacy ? fx(C.E3.legacy.fos, 3) : '—', F.legacy.toppling],
      ...(C.E1.legacy ? [['Bearing', fx(C.E1.legacy.fos, 2), F.legacy.bearing]] : []),
    ];
    add(7, `External stability — ${x.label}`, `
      ${tableHTML(['Check', 'Title', 'Clause', 'Utilisation', 'Governing combination'], sum)}
      ${h5('Legacy unity-factor FoS (for comparison)')}${tableHTML(['Check', 'FoS', 'Target'], legacy)}
      ${h5('E1 Bearing — governing combination', `rep-e${n}-E1`)}${stepsHTML(C.E1.steps)}
      ${h5('E2 Sliding — governing combination', `rep-e${n}-E2`)}${stepsHTML(C.E2.steps)}
      ${h5('E3 Overturning (EQU)', `rep-e${n}-E3`)}${stepsHTML(C.E3.steps)}
      ${h5('E4 Eccentricity and base pressure', `rep-e${n}-E4`)}${stepsHTML(C.E4.steps)}
      ${h5('E7 Buoyancy / uplift', `rep-e${n}-E7`)}${stepsHTML(C.E7.steps)}
      ${h5('All bearing combinations')}${tableHTML(['Combination', 'Vd kN', 'Hd kN', 'e m', 'B′ m', 'Rd kN', 'Util'], C.E1.rows.slice().sort((a, b) => b.util - a.util).slice(0, 14).map((r) => [e(r.label), r.V, r.H, r.e, r.Bp, r.Rd, ut(r.util)]), 'lg-small')}
      ${h5('All sliding combinations')}${tableHTML(['Combination', 'V kN', 'H kN', 'Rd kN', 'Util'], C.E2.rows.slice().sort((a, b) => b.util - a.util).slice(0, 14).map((r) => [e(r.label), r.V, r.H, r.Rd, ut(r.util)]), 'lg-small')}`);
  });

  // 8 Internal stability.
  endsL.forEach((x) => {
    const n = x.endIdx + 1;
    const rows = x.interfaces.rows.map((r) => [e(r.label), fx(r.z, 2), fx(r.b, 2), r.slide ? ut(r.slide.util) : '—', r.slideSLS ? ut(r.slideSLS.util) : '—', r.slideLeg ? fx(r.slideLeg.fos, 3) : '—', r.topple ? ut(r.topple.util) : '—', r.toppleLeg ? fx(r.toppleLeg.fos, 3) : '—', r.contactSLS ? ut(r.contactSLS.util) : '—', r.contactChar ? fx(r.contactChar.ratio, 3) : '—', r.contactULS ? `${ut(r.contactULS.util)} (${fx(r.contactULS.sigma, 2)} N/mm²)` : '—', r.nNib]);
    const sub = x.I4.map((s) => [e(s.id), e(s.title), e(s.what), ut(s.util), e(s.label)]);
    add(8, `Internal stability — ${x.label}`, `
      ${tableHTML(['Interface', 'z m', 'b m', 'I1 ULS', 'I1 SLS no-slip', 'I1 legacy FoS', 'I2 EQU', 'I2 legacy FoS', 'I3 kern (q-p)', 'e/(b/6) char.', 'I3 ULS', 'Nibs'], rows, 'lg-small')}
      <p class="lg-note">I1: μk = ${state.basis.muBlock} friction${state.basis.gammaMuOn ? ' / 1.25' : ''}${state.basis.nibShear ? ` + η_eng·n·VRd,nib (VRd,nib ≈ 25.4 kN; BB judgement)` : ' only'}; SLS: friction alone resists the characteristic force. I2 about the front (or rear) edge of contact. I3: resultant within the contact width (q-p kern; characteristic e/(b/6) for information) and peak stress on the net area (gross − recesses) ≤ fcd,pl = 16 N/mm².</p>
      <div id="rep-e${n}-I1"></div><div id="rep-e${n}-I2"></div><div id="rep-e${n}-I3"></div>
      ${stepsHTML(x.intSteps)}
      ${h5('I4 Sub-stacks', `rep-e${n}-I4`)}${sub.length ? tableHTML(['Id', 'Sub-stack', 'Mode', 'Util', 'Governing'], sub) : '<p>None applicable.</p>'}`);
  });

  // 9 Local checks.
  endsL.forEach((x) => {
    const n = x.endIdx + 1;
    add(9, `Local checks — ${x.label}`, x.local.map((l) => `${h5(`${l.id} ${l.title} (${l.clause})${l.info ? '' : ` — utilisation ${fx(l.util, 3)}`}`, `rep-e${n}-${l.id}`)}${stepsHTML(l.steps)}${(l.warnings || []).length ? `<ul class="rs-bullets">${l.warnings.map((w) => `<li>${e(w)}</li>`).join('')}</ul>` : ''}`).join(''));
  });

  // 10 Overall stability.
  if (bridge) {
    const S = D.slope;
    add(10, 'Overall stability (E5)', S ? `
      <p>Bishop simplified circular search (auto-bounded grid of centres, radius sweep, ≥ 30 slices, convergence 0.001, slices with mα &lt; 0.2 discarded). DA1-C2: M2 on soil strengths, A2 factors on loads (permanent ${F.C2.gGsup}, variable ${F.C2.gQo}); abutment modelled as a strong material. ODF = resisting/driving ≥ 1.0.</p>
      ${tableHTML(['End', 'Case', 'ODF through/under abutment (verdict)', 'ODF undrained', 'Bank-face min ODF (all circles)', 'Legacy FoS', 'Circles'], S.ends.flatMap((se) => se.cases.map((c) => [se.end, e(c.label), odf(c.ODFabut), c.ODFu ? odf(c.ODFu) : '—', odf(c.ODF), fx(c.FoS, 3), c.evaluated])))}
      <p class="lg-note">The verdict uses circles that pass through or under the abutment footprint. Bank-face slips that do not reach the abutment are reported for bank protection/regrading and must not be allowed to regress towards the abutment.</p>
      <div class="lg-drawing">${drawingD1(state, D)}</div>` : '<p><strong>Not yet run</strong> — use “Run global stability” on the calc page. The X1 screening rule has been applied (section 12).</p>');
  }

  // 11 Settlement.
  add(11, 'Settlement', `${endsL.map((x) => `${h5(`${x.label} — total ${x.settle ? fx(x.settle.total, 1) : '—'} mm (limit ${state.ends[x.endIdx].settlementLimit} mm)${x.settle ? `, tilt 1 in ${x.settle.tilt > 0 ? Math.round(1 / x.settle.tilt) : '∞'}` : ''}`, `rep-e${x.endIdx + 1}-E6`)}${x.settle ? stepsHTML(x.settle.steps) : ''}`).join('')}
    ${D.diff ? `<p>Differential settlement between ends: ${fx(D.diff.d, 1)} mm vs ${D.diff.limit} mm limit — ${D.diff.util <= 1 ? 'OK' : 'EXCEEDS'} (replace limits with the bridge supplier’s).</p>` : ''}`);

  // 12 Crossing checks.
  if (bridge && D.crossing) {
    const items = D.crossing.ends.flatMap((ce) => ce.items.map((it) => [`End ${ce.end}`, it.id, e(it.title), `<span class="lg-status ${it.status}">${it.status.toUpperCase()}</span>`, e(it.text)]));
    if (D.crossing.x5) items.push(['Both', 'X5', 'Span feedback', `<span class="lg-status ${D.crossing.x5.status}">${D.crossing.x5.status.toUpperCase()}</span>`, e(D.crossing.x5.text)]);
    add(12, 'Crossing checks', tableHTML(['End', 'Id', 'Check', 'Status', 'Result'], items));
  }

  // 13 Utilisation summary and verdict.
  add(13, 'Utilisation summary and verdict', `
    <div class="lg-drawing">${drawingD6(state, D)}</div>
    <div class="rs-verdict">${output.verdict.pass ? 'PASS' : 'FAIL / INCOMPLETE'} — ${e(output.verdict.message)}</div>
    ${D.errors.length || D.xFails.length ? `<ul class="rs-bullets">${[...D.errors, ...D.xFails].map((w) => `<li>${e(w)}</li>`).join('')}</ul>` : ''}`);

  // 14 Specification and construction notes (+ PLT).
  const clauses = defaultClauses({ padText: state.ends[0].arrangement.pad.material, fillText: state.ends[0].fill.material });
  const ov = state.spec?.overrides || {};
  add(14, 'Specification and construction notes', `
    ${clauses.map((c) => `<p><strong>${e(c.title)}.</strong> ${e(ov[c.key] ?? c.text)}</p>`).join('')}
    ${h5('Plate load test requirement (piped as `plt`)')}
    ${tableHTML(['End', 'Target pressure', 'Plate', 'Acceptance', 'Tests'], endsL.filter((x) => x.plt).map((x) => [e(x.label), `<strong>${x.plt.targetPressure_kPa} kPa</strong>`, e(x.plt.plate), e(x.plt.acceptance), e(x.plt.count)]))}
    <p class="lg-note">${e(endsL[0].plt?.note || '')} Basis: ${endsL.filter((x) => x.plt).map((x) => `${e(x.label)} — ${e(x.plt.basis)}`).join('; ')}.</p>`);

  // 15 DRA.
  const dra = state.dra && state.dra.length ? state.dra : defaultDRA();
  add(15, 'Designer’s risk assessment (CDM 2015)', `${tableHTML(['Hazard', 'L', 'S', 'R', 'Design-stage action', 'Residual risk'], dra.map((r) => [e(r.hazard), r.L, r.S, r.L * r.S, e(r.action), e(r.residual)]))}<p class="lg-note">L = likelihood, S = severity (1–5), R = L × S. Residual risks to be communicated to the principal designer and contractor.</p>`);

  // 16 Assumptions, limitations, data flags.
  const allWarn = [...new Set(output.warnings)];
  add(16, 'Assumptions, limitations and data flags', `
    <ul class="rs-bullets">${calc.assumptions.map((a) => `<li>${e(a)}</li>`).join('')}</ul>
    ${h5('Data flags (Elite data — confirm before relying on them)')}<ol class="rs-bullets">${D.dataFlags.map((f) => `<li>${e(f)}</li>`).join('')}</ol>
    ${h5('Warnings from this run')}${allWarn.length ? `<ul class="rs-bullets">${allWarn.map((w) => `<li>${e(w)}</li>`).join('')}</ul>` : '<p>None.</p>'}`);

  // 17 References.
  add(17, 'References', `<ul class="rs-bullets">${calc.references.map((r) => `<li>${e(r)}</li>`).join('')}</ul>`);

  // 18 Verification and sign-off.
  add(18, 'Verification and sign-off', `<p>This design sheet has been produced with the Beaver Bridges Engineering Toolkit calc “${e(calc.title)}” v${e(calc.version)}. Every value is advisory until independently verified.</p><p>The checker shall confirm: factor set and UK NA values; ground parameters and groundwater; bridge supplier reactions and limits; Elite block data (see data flags); anchor design by the supplier to BS EN 1992-4; scour assessment; overall stability by independent analysis where E5 is close to 1.0.</p>`, { signoff: true });

  // Assemble sheets with "Sheet x of y".
  const start = Number.isFinite(Number(headerDetails.sheetNo)) && String(headerDetails.sheetNo).trim() !== '' ? Number(headerDetails.sheetNo) : 1;
  const total = sheets.length;
  const ofText = headerDetails.sheetOf && Number(headerDetails.sheetOf) >= start + total - 1 ? headerDetails.sheetOf : String(start + total - 1);
  const wrap = el('div', 'lg-report');
  sheets.forEach((s, i) => {
    const sheet = el('div', `report-sheet rs-border lg-sheet${s.a3 ? ' lg-a3' : ''}`);
    const label = `${start + i} of ${ofText}`;
    const [head, titleBar] = buildSheetHeader(calc, headerDetails, label, `${calc.title} — ${s.num}. ${s.title}`);
    const body = el('div', 'rs-body');
    body.innerHTML = `${h4(s.num, s.title)}${s.html}`;
    const disc = el('div', 'lg-disclaimer', 'DESIGN OUTPUT — REQUIRES CEng REVIEW BEFORE ACCEPTANCE. Advisory until independently verified and signed off by a Chartered Engineer (CEng MICE / MIStructE). Eurocodes with UK NAs, DMRB and client standards apply; CDM 2015 design duties remain with the designer.');
    const sign = s.signoff ? buildSignoff() : compactSignoff();
    sheet.append(head, titleBar, body, disc, sign, buildFooter(`Sheet ${label}`));
    wrap.append(sheet);
  });
  return wrap;
}

function compactSignoff() {
  const d = el('div', 'rs-signoff lg-compact-signoff');
  d.innerHTML = `<div class="rs-signoff-statement"><strong>REQUIRES INDEPENDENT VERIFICATION AND SIGN-OFF</strong> BY A CHARTERED ENGINEER PRIOR TO ACCEPTANCE FOR FABRICATION, CONSTRUCTION OR TENDER.</div>
    <div class="rs-signoff-rows"><div class="rs-signoff-row"><span>Prepared</span><span class="line"></span><span>Checked</span><span class="line"></span><span>Approved</span><span class="line"></span></div></div>`;
  return d;
}

export { LEGATO_BLOCKS };

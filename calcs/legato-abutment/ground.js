// ground.js — borehole parsing, SPT corrections and correlations,
// characteristic values and the design ground profile for each end.

import {
  parseSPT, n60, overburdenCN, phiPHT, phiHatanaka, cuStroud, stroudF1, mvStroud, EStroud,
  defaultUnitWeight, characteristicValue, phiCritFromPI, GAMMA_W,
} from '../../js/geo-core.js';
import { UNSUITABLE } from './schema.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export function boreholesForEnd(state, endIdx) {
  const label = `End ${endIdx + 1}`;
  return (state.boreholes || []).filter((b) => b.end === label || b.end === 'Both');
}

// Groundwater level (mAOD) from a borehole header: highest of standing and
// rose-to levels (strike is reported only).
function boreholeWaterLevel(bh) {
  const levels = [];
  if (isNum(bh.standing)) levels.push(bh.GL - Number(bh.standing));
  if (isNum(bh.roseTo)) levels.push(bh.GL - Number(bh.roseTo));
  return levels.length ? Math.max(...levels) : null;
}

export function designGroundwater(state, endIdx) {
  const end = state.ends[endIdx];
  const cands = [];
  const src = [];
  if (end.groundMode === 'boreholes') {
    boreholesForEnd(state, endIdx).forEach((bh) => {
      const w = boreholeWaterLevel(bh);
      if (w !== null) { cands.push(w); src.push(`${bh.id} ${w.toFixed(2)}`); }
    });
  }
  if (isNum(end.gwUser)) { cands.push(Number(end.gwUser)); src.push(`user ${Number(end.gwUser).toFixed(2)}`); }
  return cands.length ? { level: Math.max(...cands), source: src.join(', ') } : { level: -Infinity, source: 'none recorded — groundwater taken as deep' };
}

// Process one borehole: parse and correct every SPT, derive per-test
// parameters. σ′v uses stratum unit weights and the design water level.
export function processBorehole(bh, opts, gwLevel) {
  const warnings = [];
  const Er = isNum(bh.Er) ? Number(bh.Er) : 60;
  if (!isNum(bh.Er)) warnings.push(`${bh.id}: SPT hammer energy ratio not given — 60% assumed. Obtain Er from the hammer calibration certificate.`);
  const Ncap = opts.Ncap || 50;
  const strata = (bh.strata || []).map((s) => ({ ...s, top: Number(s.top), base: Number(s.base) })).sort((a, b) => a.top - b.top);

  const stratumAt = (d) => strata.findIndex((s) => d >= s.top && d < s.base + 1e-9);

  // First pass: parse tests and assign strata.
  const tests = (bh.spt || []).map((t) => {
    const p = parseSPT(t.result);
    const depth = Number(t.depth);
    const si = stratumAt(depth);
    if (p.error) warnings.push(`${bh.id} @ ${depth} m: ${p.error}.`);
    const N60 = p.N !== null ? n60(p.N, Er) : null;
    return { depth, level: bh.GL - depth, type: t.type || 'S', raw: t.result, parsed: p, N: p.N, N60, stratumIdx: si, cls: si >= 0 ? strata[si].cls : null };
  });

  // Stratum unit weights from median N60 (granular) or cu (cohesive).
  strata.forEach((s, i) => {
    const Ns = tests.filter((t) => t.stratumIdx === i && t.N60 !== null).map((t) => Math.min(t.N60, Ncap));
    const med = Ns.length ? Ns.sort((a, b) => a - b)[Math.floor(Ns.length / 2)] : null;
    const cu = med !== null ? cuStroud(med, s.PI) : null;
    const [g, gs] = defaultUnitWeight(s.cls, { N60: med ?? undefined, cu: cu ?? undefined });
    s.gamma = isNum(s.lab?.gamma) ? Number(s.lab.gamma) : g;
    s.gammaSat = isNum(s.lab?.gammaSat) ? Number(s.lab.gammaSat) : Math.max(gs, s.gamma);
  });

  const sigmaV = (depth) => {
    let sv = 0;
    const wDepth = Number.isFinite(gwLevel) ? bh.GL - gwLevel : Infinity;
    strata.forEach((s) => {
      const a = s.top, b = Math.min(s.base, depth);
      if (b <= a) return;
      const dry = Math.max(0, Math.min(b, wDepth) - a);
      const wet = Math.max(0, b - Math.max(a, wDepth));
      sv += dry * s.gamma + wet * (s.gammaSat - GAMMA_W);
    });
    return sv;
  };

  tests.forEach((t) => {
    if (t.N60 === null) return;
    t.sigmaV = sigmaV(t.depth);
    t.N60c = Math.min(t.N60, Ncap);
    t.capped = t.N60 > Ncap;
    t.display = Math.min(t.N, 100);
    if (t.cls === 'Granular') {
      t.CN = overburdenCN(t.sigmaV);
      t.N160 = Math.min(t.CN * t.N60c, Ncap);
      t.phiPHT = phiPHT(t.N160);
      t.phiHU = phiHatanaka(t.N160);
      const raw = opts.phiMethod === 'HU' ? t.phiHU : t.phiPHT;
      t.phi = Math.min(raw, opts.phiMax ?? 40);
      t.E = EStroud(t.N60c, opts.overconsolidated);
    } else if (t.cls === 'Cohesive') {
      const s = strata[t.stratumIdx];
      t.f1 = stroudF1(s.PI);
      t.cu = cuStroud(t.N60c, s.PI);
      t.mv = mvStroud(t.N60c, opts.f2 || 0.45);
    }
  });

  return { id: bh.id, bh, Er, strata, tests, warnings, sigmaV };
}

// Characteristic values per stratum of the design borehole, with
// justified overrides applied. Returns a design profile in levels.
function profileFromBorehole(pb, end, opts) {
  const warnings = [];
  const layers = pb.strata.map((s, i) => {
    const ts = pb.tests.filter((t) => t.stratumIdx === i && t.N60 !== null);
    const layer = {
      topLevel: pb.bh.GL - s.top, baseLevel: pb.bh.GL - s.base, cls: s.cls, desc: s.desc,
      gamma: s.gamma, gammaSat: s.gammaSat, phi: null, c: 0, cu: null, mv: null, E: null, N60: null,
      granType: s.granType || 'Sand', PI: s.PI, rockRd: isNum(s.lab?.rockRd) ? Number(s.lab.rockRd) : null,
      unsuitable: UNSUITABLE.has(s.cls), char: {}, source: pb.id,
    };
    const method = opts.charMethod || 'auto';
    const Nchar = characteristicValue(ts.map((t) => t.N60c), method);
    layer.char.N60 = Nchar;
    layer.N60 = Number.isFinite(Nchar.adopted) ? Nchar.adopted : null;
    if (s.cls === 'Granular') {
      const ch = characteristicValue(ts.map((t) => t.phi), method);
      layer.char.phi = ch;
      layer.phi = Number.isFinite(ch.adopted) ? ch.adopted : 30;
      if (!ts.length) warnings.push(`${pb.id} stratum "${s.desc}" has no SPT results — φ′ = 30° assumed. Provide test data or an override.`);
      layer.E = layer.N60 !== null ? EStroud(layer.N60, opts.overconsolidated) : 10;
    } else if (s.cls === 'Cohesive') {
      const ch = characteristicValue(ts.map((t) => t.cu), method);
      layer.char.cu = ch;
      layer.cu = Number.isFinite(ch.adopted) ? ch.adopted : 40;
      if (!ts.length) warnings.push(`${pb.id} stratum "${s.desc}" has no SPT results — cu = 40 kPa assumed. Provide test data or an override.`);
      layer.mv = layer.N60 !== null ? mvStroud(layer.N60, opts.f2 || 0.45) : 0.3;
      layer.phi = phiCritFromPI(s.PI);
      layer.c = 0;
    } else if (s.cls === 'Weathered rock' || s.cls === 'Rock') {
      layer.phi = 35;
      if (layer.rockRd === null) warnings.push(`${pb.id} stratum "${s.desc}" is ${s.cls.toLowerCase()} — enter a design bearing resistance with its source (lab override "rockRd"). SPT is not correlated in rock.`);
    } else {
      layer.phi = 25;
    }
    // Lab overrides entered on the stratum row.
    ['phi', 'c', 'cu', 'mv', 'E'].forEach((k) => { if (isNum(s.lab?.[k])) layer[k] = Number(s.lab[k]); });
    return layer;
  });
  return { layers, warnings };
}

function applyOverrides(layers, overrides, warnings) {
  (overrides || []).forEach((o) => {
    const L = layers[o.stratumIndex];
    if (!L || !o.param) return;
    if (!o.justification || !String(o.justification).trim()) {
      warnings.push(`Override of ${o.param} on stratum ${o.stratumIndex + 1} ignored — a justification is mandatory.`);
      return;
    }
    if (o.param === 'founding') { L.unsuitable = false; L.overrideNote = o.justification; return; }
    if (isNum(o.value)) { L[o.param] = Number(o.value); L.overrideNote = `${o.param} = ${o.value}: ${o.justification}`; }
  });
}

// Main entry: design profile for one end.
export function processGround(state, endIdx) {
  const end = state.ends[endIdx];
  const opts = end.groundOptions || {};
  const warnings = [];
  const gw = designGroundwater(state, endIdx);
  let layers;
  let processed = [];
  let designId = null;

  if (end.groundMode === 'manual' || !boreholesForEnd(state, endIdx).length) {
    if (end.groundMode !== 'manual') warnings.push(`${end.label}: no boreholes assigned — using the manual design profile.`);
    layers = (end.manualProfile || []).map((l) => ({
      ...l, topLevel: Number(l.topLevel), baseLevel: Number(l.baseLevel), unsuitable: UNSUITABLE.has(l.cls), char: {}, source: 'manual',
      gammaSat: isNum(l.gammaSat) ? Number(l.gammaSat) : Number(l.gamma) + 1,
      c: isNum(l.c) ? Number(l.c) : 0,
    }));
  } else {
    processed = boreholesForEnd(state, endIdx).map((bh) => processBorehole(bh, opts, gw.level));
    processed.forEach((p) => warnings.push(...p.warnings));
    designId = end.designBorehole && end.designBorehole !== 'auto' && processed.some((p) => p.id === end.designBorehole)
      ? end.designBorehole : null;
    const profiles = processed.map((p) => ({ id: p.id, ...profileFromBorehole(p, end, opts) }));
    if (!designId) {
      // Lowest cautious parameter at the candidate founding level (top of
      // the first suitable stratum across boreholes).
      const cand = Math.max(...profiles.map((pr) => (pr.layers.find((l) => !l.unsuitable) || pr.layers[0] || { topLevel: -Infinity }).topLevel));
      let best = null;
      profiles.forEach((pr) => {
        const L = pr.layers.find((l) => cand <= l.topLevel + 1e-9 && cand > l.baseLevel) || pr.layers.find((l) => !l.unsuitable);
        if (!L) return;
        const score = L.cls === 'Cohesive' ? (L.cu || 0) / 5 : (L.phi || 0);
        if (!best || score < best.score) best = { id: pr.id, score };
      });
      designId = best ? best.id : profiles[0].id;
    }
    const chosen = profiles.find((p) => p.id === designId);
    layers = chosen.layers;
    warnings.push(...chosen.warnings);
  }
  applyOverrides(layers, opts.overrides, warnings);
  layers.sort((a, b) => b.topLevel - a.topLevel);

  return { layers, gw, processed, designId, warnings, mode: end.groundMode };
}

export function layerAt(layers, level) {
  const L = layers.find((l) => level <= l.topLevel + 1e-9 && level > l.baseLevel - 1e-9);
  if (L) return L;
  return level > (layers[0]?.topLevel ?? 0) ? layers[0] : layers[layers.length - 1];
}

// Effective vertical stress (kPa) at `level` in the design profile, with
// ground surface `surfaceLevel` and water level `wl`.
export function sigmaVAt(layers, surfaceLevel, level, wl) {
  let sv = 0;
  layers.forEach((l) => {
    const top = Math.min(l.topLevel, surfaceLevel);
    const bot = Math.max(l.baseLevel, level);
    if (top <= bot) return;
    const wlv = Number.isFinite(wl) ? wl : -Infinity;
    const dry = Math.max(0, top - Math.max(bot, wlv));
    const wet = (top - bot) - dry;
    sv += dry * Number(l.gamma) + wet * (Number(l.gammaSat || l.gamma + 1) - GAMMA_W);
  });
  return sv;
}

// Highest acceptable formation level: top of the highest suitable stratum
// below all unsuitable ones.
export function foundingStratumTop(layers) {
  let lastUnsuitableBase = null;
  layers.forEach((l) => { if (l.unsuitable) lastUnsuitableBase = lastUnsuitableBase === null ? l.baseLevel : Math.min(lastUnsuitableBase, l.baseLevel); });
  const suitable = layers.filter((l) => !l.unsuitable && (lastUnsuitableBase === null || l.topLevel <= lastUnsuitableBase + 1e-9));
  if (!suitable.length) return { level: layers.length ? layers[layers.length - 1].baseLevel : 0, layer: null };
  return { level: suitable[0].topLevel, layer: suitable[0] };
}

export { num, isNum };

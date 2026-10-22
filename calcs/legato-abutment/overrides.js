// overrides.js — parameter overrides and their justifications. An override
// takes effect only with a written justification; it is then listed in the
// red "Overrides" table on the summary sheet. Without one, the default is
// used and a warning says so.

export const SETTLEMENT_DEFAULTS = { total: 25, diff: 20, tilt: 500, trans: 10 };
const filled = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const just = (t) => String(t || '').trim();

export function resolveOverrides(state) {
  const list = [];
  const warnings = [];
  const bridge = state.project.mode === 'bridge';
  const B = state.basis;
  const nEnds = bridge ? 2 : 1;
  const ends = [];
  for (let i = 0; i < nEnds; i++) {
    const end = state.ends[i];
    const label = bridge ? end.label : 'Wall';
    const out = { formationMu: null, settlementLimit: SETTLEMENT_DEFAULTS.total };
    // Formation friction tan δk.
    if (filled(end.formationMuOverride)) {
      const v = Number(end.formationMuOverride);
      if (v <= 0) {
        list.push({ item: `${label}: formation friction tan δk`, value: v, default: 'EC7 6.5.3 rules', justification: just(end.formationMuJust), status: 'rejected' });
        warnings.push(`${label}: formation friction override tan δk = ${v} rejected — it must be greater than 0. Drained and undrained sliding are both checked (BS EN 1997-1 6.5.3).`);
      } else if (!just(end.formationMuJust)) {
        list.push({ item: `${label}: formation friction tan δk`, value: v, default: 'EC7 6.5.3 rules', justification: '', status: 'ignored' });
        warnings.push(`${label}: formation friction override ignored — enter a justification for it to take effect.`);
      } else {
        out.formationMu = v;
        list.push({ item: `${label}: formation friction tan δk`, value: v, default: 'EC7 6.5.3 rules', justification: just(end.formationMuJust), status: 'applied' });
      }
    }
    // Total settlement limit.
    const sl = Number(end.settlementLimit);
    if (filled(end.settlementLimit) && sl !== SETTLEMENT_DEFAULTS.total) {
      if (just(end.settlementLimitJust)) {
        out.settlementLimit = sl;
        list.push({ item: `${label}: total settlement limit (mm)`, value: sl, default: SETTLEMENT_DEFAULTS.total, justification: just(end.settlementLimitJust), status: 'applied' });
      } else {
        list.push({ item: `${label}: total settlement limit (mm)`, value: sl, default: SETTLEMENT_DEFAULTS.total, justification: '', status: 'ignored' });
        warnings.push(`${label}: settlement limit ${sl} mm ignored (no justification) — ${SETTLEMENT_DEFAULTS.total} mm used. Use the bridge supplier's limits.`);
      }
    }
    ends.push(out);
  }
  if (bridge && ends[0].settlementLimit !== ends[1].settlementLimit) warnings.push(`Different total settlement limits at each end (${ends[0].settlementLimit} / ${ends[1].settlementLimit} mm) — confirm against the bridge supplier's limits.`);
  // Bridge-level settlement criteria.
  const crit = {};
  [['diff', 'settlementDiffLimit', 'Differential settlement end to end (mm)'], ['tilt', 'tiltLimit', 'Tilt limit (1 in …)'], ['trans', 'transDiffLimit', 'Transverse differential between bearings (mm)']].forEach(([k, path, label]) => {
    const v = Number(B[path]);
    crit[k] = SETTLEMENT_DEFAULTS[k];
    if (filled(B[path]) && v !== SETTLEMENT_DEFAULTS[k]) {
      if (just(B.settlementJust)) { crit[k] = v; list.push({ item: label, value: v, default: SETTLEMENT_DEFAULTS[k], justification: just(B.settlementJust), status: 'applied' }); }
      else { list.push({ item: label, value: v, default: SETTLEMENT_DEFAULTS[k], justification: '', status: 'ignored' }); warnings.push(`${label}: ${v} ignored (no justification) — default ${SETTLEMENT_DEFAULTS[k]} used.`); }
    }
  });
  // Dispersion angle and thermal restraint (enforced where they are used).
  (bridge ? [0, 1] : []).forEach((i) => {
    const d = state.ends[i].arrangement.dispersion || {};
    if (d.mode === 'angle') list.push({ item: `${state.ends[i].label}: dispersion angle (V:1H)`, value: d.angleRatio ?? 2, default: 'bond-based', justification: just(d.justification), status: just(d.justification) ? 'applied' : 'ignored' });
  });
  const TR = state.loads.thermalRestraint || {};
  if (filled(TR.F)) list.push({ item: 'Thermal restraint force (both ends fixed)', value: Number(TR.F), default: '—', justification: just(TR.justification), status: just(TR.justification) ? 'applied' : 'ignored' });
  // Ground parameter overrides (justification enforced in ground.js).
  (state.ends || []).slice(0, nEnds).forEach((end) => (end.groundOptions?.overrides || []).forEach((o) => {
    list.push({ item: `${bridge ? end.label : 'Wall'}: stratum ${o.stratumIndex} ${o.param}`, value: o.value, default: 'correlation', justification: just(o.justification), status: just(o.justification) ? 'applied' : 'ignored' });
  }));
  return { list, warnings, ends, crit };
}

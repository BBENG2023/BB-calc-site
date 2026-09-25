// phase-relations.js — classical soil phase-diagram calculator. The
// engineer picks any two independent quantities (plus Gs, always given
// separately) and every other quantity is derived.
//
// Derivation: with Gs and γw fixed, the phase diagram has exactly two
// degrees of freedom (e and w). Quantities split into two groups:
//   "e-domain"  — e, n, γd, γsat, γ′ — each a bijective function of e alone.
//   "w-domain"  — w, S, γ — each needs e (or another w-domain quantity) too.
// Any valid pick supplies one e-domain quantity (or an equivalent pairing,
// see solveEW) plus one w-domain quantity; solveEW() inverts algebraically
// — no iteration is needed anywhere in this method.

import { svg, rect, line, text, clamp } from '../js/diagrams.js';

const GAMMA_W_DEFAULT = 9.81;

// Classic two-column phase diagram: Volume (air / water / solids, stacked
// proportionally, Vs = 1 as the reference) alongside Mass (water / solids
// only — air is treated as massless). Dashed lines tie the two columns'
// phase boundaries together.
function diagram(v, output) {
  const res = output?.results || [];
  const get = (sym) => res.find((r) => r.symbol === sym)?.value;
  const e = get('e');
  if (e === undefined || !Number.isFinite(e)) return '';

  const Gs = v.Gs || 2.65;
  const gw = v.gammaw || GAMMA_W_DEFAULT;
  const wPct = get('w');
  const SPct = get('S');
  const w = wPct !== undefined ? wPct / 100 : 0;
  const S = SPct !== undefined ? clamp(SPct / 100, 0, 1) : 0;

  const Vs = 1;
  const Vv = e;
  const Vw = clamp(S * e, 0, Vv);
  const Va = Math.max(0, Vv - Vw);
  const totalV = Vs + Vv;

  const Ws = Gs * gw * Vs;
  const Ww = w * Ws;

  const pxPerVol = clamp(150 / totalV, 28, 130);
  const topY = 26;
  const vaH = Va * pxPerVol;
  const vwH = Vw * pxPerVol;
  const vsH = Vs * pxPerVol;

  const volX = 60, volW = 90;
  const massX = 240, massW = 90;
  const massTotalH = vwH + vsH; // air is massless — mass column omits it
  const massWH = massTotalH * (Ws + Ww > 0 ? Ww / (Ws + Ww) : 0);
  const massSH = massTotalH - massWH;
  const massTopY = topY + vaH;

  function block(x, y, w2, h, fill, label, sub) {
    if (h < 1) return '';
    let out = rect(x, y, w2, h, { fill, stroke: 'var(--bb-ink)', width: 1 });
    if (h > 16) {
      out += text(x + w2 / 2, y + h / 2 + 3, label, { size: 10, weight: 800, color: 'var(--bb-ink)' });
      if (sub && h > 30) out += text(x + w2 / 2, y + h / 2 + 16, sub, { size: 8, weight: 600, color: 'var(--bb-muted)' });
    }
    return out;
  }

  let inner = '';
  inner += text(volX + volW / 2, topY - 10, 'VOLUME', { size: 8, weight: 800, color: 'var(--bb-primary-500)', ls: '0.08em' });
  inner += text(massX + massW / 2, topY - 10, 'MASS', { size: 8, weight: 800, color: 'var(--bb-primary-500)', ls: '0.08em' });

  inner += block(volX, topY, volW, vaH, 'var(--bb-surface)', 'Air', `Va=${Va.toFixed(2)}`);
  inner += block(volX, topY + vaH, volW, vwH, 'var(--bb-primary-200)', 'Water', `Vw=${Vw.toFixed(2)}`);
  inner += block(volX, topY + vaH + vwH, volW, vsH, 'var(--bb-primary-400)', 'Solids', `Vs=${Vs.toFixed(2)}`);

  if (Ws + Ww > 0) {
    inner += block(massX, massTopY, massW, massWH, 'var(--bb-primary-200)', 'Water', `Ww=${Ww.toFixed(2)}`);
    inner += block(massX, massTopY + massWH, massW, massSH, 'var(--bb-primary-400)', 'Solids', `Ws=${Ws.toFixed(2)}`);
    // Only annotate "air is massless" when there's an air block above to
    // annotate — with no air block (S = 100%) the mass column already
    // starts flush at the top, so the note has nothing to point at.
    if (vaH > 4) inner += text(massX + massW / 2, massTopY - 8, 'Ma ≈ 0', { size: 7.5, weight: 700, color: 'var(--bb-muted)' });
  }

  // Boundary tie-lines between the two columns
  inner += line(volX + volW, massTopY, massX, massTopY, { color: 'var(--bb-muted)', width: 0.75, dash: '2 3' });
  inner += line(volX + volW, massTopY + vwH, massX, massTopY + massWH, { color: 'var(--bb-muted)', width: 0.75, dash: '2 3' });
  inner += line(volX + volW, topY + vaH + vwH + vsH, massX, massTopY + massTotalH, { color: 'var(--bb-muted)', width: 0.75, dash: '2 3' });

  // e / n / S annotations to the right of the volume column
  const bracketX = volX + volW + 14;
  inner += line(bracketX, topY, bracketX, topY + vaH + vwH, { color: 'var(--bb-accent)', width: 1.2 });
  inner += text(bracketX + 6, topY + (vaH + vwH) / 2 + 3, `Vv (e = ${e.toFixed(2)})`, { size: 8, weight: 700, color: 'var(--bb-accent-700)', anchor: 'start' });

  return svg('0 0 400 260', inner);
}

function eFromEDomain(key, val, Gs, gw) {
  switch (key) {
    case 'e': return val;
    case 'n': return val / (1 - val);
    case 'gammad': return (Gs * gw) / val - 1;
    case 'gammasat': return (gw * Gs - val) / (val - gw);
    case 'gammasub': { const gammasat = val + gw; return (gw * Gs - gammasat) / (gammasat - gw); }
    default: return null;
  }
}

const E_DOMAIN = new Set(['e', 'n', 'gammad', 'gammasat', 'gammasub']);
const W_DOMAIN = new Set(['w', 'S', 'gamma']);

function wFromKnownE(key, val, e, Gs, gw) {
  switch (key) {
    case 'w': return val;
    case 'S': return (val * e) / Gs; // val is fraction 0-1
    case 'gamma': { const gammad = (Gs * gw) / (1 + e); return val / gammad - 1; }
    default: return null;
  }
}

// Returns { e, w } or { error } — val1/val2 already normalised to fractions
// for w and S (percentage inputs divided by 100 before calling).
function solveEW(pick1, val1, pick2, val2, Gs, gw) {
  const p1isE = E_DOMAIN.has(pick1);
  const p2isE = E_DOMAIN.has(pick2);

  if (p1isE && p2isE) {
    return { error: 'Both selected quantities depend on void ratio alone — they do not determine water content. Choose one quantity from {w, S, γ}.' };
  }
  if (p1isE || p2isE) {
    const [eKey, eVal, otherKey, otherVal] = p1isE ? [pick1, val1, pick2, val2] : [pick2, val2, pick1, val1];
    const e = eFromEDomain(eKey, eVal, Gs, gw);
    const w = wFromKnownE(otherKey, otherVal, e, Gs, gw);
    return { e, w };
  }

  // Neither pick is in the e-domain: both are from {w, S, gamma}.
  const has = (k) => pick1 === k || pick2 === k;
  const valOf = (k) => (pick1 === k ? val1 : val2);

  if (has('w') && has('S')) {
    const w = valOf('w');
    const S = valOf('S');
    const e = (w * Gs) / S;
    return { e, w };
  }
  if (has('w') && has('gamma')) {
    const w = valOf('w');
    const gamma = valOf('gamma');
    const e = (Gs * gw * (1 + w)) / gamma - 1;
    return { e, w };
  }
  if (has('S') && has('gamma')) {
    const S = valOf('S');
    const gamma = valOf('gamma');
    const e = (gw * Gs - gamma) / (gamma - gw * S);
    const w = (S * e) / Gs;
    return { e, w };
  }
  return { error: 'Unsupported combination of known quantities.' };
}

const FIELD_META = [
  { key: 'e', label: 'Void ratio (e)', unit: '' },
  { key: 'n', label: 'Porosity (n)', unit: '' },
  { key: 'w', label: 'Water content (w)', unit: '%' },
  { key: 'S', label: 'Degree of saturation (S)', unit: '%' },
  { key: 'gammad', label: 'Dry unit weight (γd)', unit: 'kN/m³' },
  { key: 'gamma', label: 'Bulk unit weight (γ)', unit: 'kN/m³' },
  { key: 'gammasat', label: 'Saturated unit weight (γsat)', unit: 'kN/m³' },
  { key: 'gammasub', label: "Submerged unit weight (γ′)", unit: 'kN/m³' },
];

function toFractionIfPercent(key, val) {
  return (key === 'w' || key === 'S') ? val / 100 : val;
}

export default {
  id: 'phase-relations',
  title: 'Soil Phase Relations Calculator',
  category: 'Geotechnical — Soil mechanics',
  tag: 'Phase diagram',
  version: '1.0.0',
  references: [
    'Craig, R.F., Craig\'s Soil Mechanics, 8th ed. — phase relationships',
    'Terzaghi, K., Peck, R.B. and Mesri, G., Soil Mechanics in Engineering Practice',
  ],
  description: 'Derives the full set of classical soil phase-diagram quantities (void ratio, porosity, water content, degree of saturation, and unit weights) from any two known independent quantities.',
  assumptions: [
    'Two-phase (solids + water, no separate consideration of entrapped air beyond what S < 100% implies) classical phase diagram.',
    'γw = 9.81 kN/m³ (editable).',
    'The two chosen "known" quantities must be independent (see warnings if an unsupported/degenerate pair is chosen).',
  ],
  inputs: [
    { name: 'Gs', label: 'Specific gravity of solids', type: 'number', default: 2.65, min: 2.0, max: 3.0, step: 0.01 },
    { name: 'gammaw', label: 'Unit weight of water γw', type: 'number', unit: 'kN/m³', default: GAMMA_W_DEFAULT, min: 9, max: 10.5, step: 0.01 },
    { name: 'phase', label: 'Known quantities (pick any two)', type: 'phase-picker',
      fields: FIELD_META,
      default: { pick1: 'e', value1: 0.9, pick2: 'S', value2: 100 } },
  ],
  diagram,
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    const Gs = v.Gs;
    const gw = v.gammaw;
    const { pick1, value1, pick2, value2 } = v.phase || {};

    if (pick1 === pick2) {
      warnings.push('The same quantity has been selected twice — choose two different quantities.');
      return { results, steps, warnings };
    }
    if (value1 === undefined || value2 === undefined) {
      warnings.push('Enter values for both selected quantities.');
      return { results, steps, warnings };
    }

    const val1 = toFractionIfPercent(pick1, value1);
    const val2 = toFractionIfPercent(pick2, value2);

    const solved = solveEW(pick1, val1, pick2, val2, Gs, gw);
    if (solved.error) {
      warnings.push(solved.error);
      return { results, steps, warnings };
    }

    const { e, w } = solved;

    if (e < 0.1 || e > 3) {
      warnings.push(`Derived void ratio e = ${e.toFixed(3)} is outside the typical range for natural soils (0.1–3) — check the inputs.`);
    }

    const n = e / (1 + e);
    const S = (w * Gs) / e;
    const gammad = (Gs * gw) / (1 + e);
    const gamma = gammad * (1 + w);
    const gammasat = ((Gs + e) * gw) / (1 + e);
    const gammasub = gammasat - gw;

    if (S < 0 || S > 1.0001) {
      warnings.push(`Derived degree of saturation S = ${(S * 100).toFixed(1)}% is outside 0–100% — the two chosen inputs are inconsistent.`);
    }

    steps.push({
      title: 'Solve for the two fundamental unknowns (e, w)',
      formula: 'n = e/(1+e);  Se = wGs;  γd = Gsγw/(1+e);  γ = γd(1+w);  γsat = (Gs+e)γw/(1+e);  γ′ = γsat − γw',
      substitution: `Known: ${pick1} = ${value1}${pick1 === 'w' || pick1 === 'S' ? '%' : ''}, ${pick2} = ${value2}${pick2 === 'w' || pick2 === 'S' ? '%' : ''}; Gs = ${Gs}, γw = ${gw}`,
      result: `e = ${e.toFixed(3)}, w = ${(w * 100).toFixed(2)}%`,
    });

    const rows = [
      { symbol: 'e', label: 'Void ratio', value: e, unit: '', precision: 3 },
      { symbol: 'n', label: 'Porosity', value: n, unit: '', precision: 3 },
      { symbol: 'w', label: 'Water content', value: w * 100, unit: '%', precision: 2 },
      { symbol: 'S', label: 'Degree of saturation', value: S * 100, unit: '%', precision: 1 },
      { symbol: 'gammad', label: 'Dry unit weight γd', value: gammad, unit: 'kN/m³', precision: 2 },
      { symbol: 'gamma', label: 'Bulk unit weight γ', value: gamma, unit: 'kN/m³', precision: 2 },
      { symbol: 'gammasat', label: 'Saturated unit weight γsat', value: gammasat, unit: 'kN/m³', precision: 2 },
      { symbol: 'gammasub', label: "Submerged unit weight γ′", value: gammasub, unit: 'kN/m³', precision: 2 },
    ];
    rows.forEach((r) => {
      results.push({ ...r, highlight: r.symbol === pick1 || r.symbol === pick2 });
    });

    steps.push({
      title: 'Full derived phase-property table',
      formula: 'Every row above follows from (e, w, Gs, γw); the two given quantities are highlighted in the results panel.',
      substitution: '—',
      result: 'See results summary.',
    });

    return { results, steps, warnings };
  },
  validation: {
    samples: [
      {
        name: 'e = 0.9, Gs = 2.82, S = 100% (worked in the build brief for this tool)',
        inputs: { Gs: 2.82, gammaw: 9.81, phase: { pick1: 'e', value1: 0.9, pick2: 'S', value2: 100 } },
        expect: {
          gammad: { value: 14.55, tol: 0.3, unit: 'kN/m³' },
          gammasat: { value: 19.20, tol: 0.3, unit: 'kN/m³' },
        },
      },
    ],
  },
};

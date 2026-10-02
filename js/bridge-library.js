// bridge-library.js — characteristic abutment loads for the Beaver Bridges
// standard bridge ranges, so a substructure calc can pull them in by
// selecting a range and configuration. All values are CHARACTERISTIC
// (γf = 1.0) and transcribed from the documents cited in each range's
// `source`. Check the transcription against the current revision of the
// source before relying on it — every range carries `verify: true`.
//
// Each range provides rows plus `toDesign(row)`, which returns the bridge
// geometry patch, traffic models and per-abutment reaction rows in the
// format the Legato abutment calc uses:
//   reaction rows: { name, group, model, basis, X, Y, Z, reversible, xFixedOnly, psi0, psi1, psi2, end }
//   (X longitudinal, Y transverse, Z vertical downward, kN per abutment)

const r = (name, group, o) => ({ name, group, model: '', basis: 'total', X: 0, Y: 0, Z: 0, reversible: false, xFixedOnly: false, psi0: 1, psi1: 1, psi2: 1, end: 'Both', ...o });
const NORMAL = { psi0: 0.75, psi1: 0.75, psi2: 0 }; // gr1a-type normal traffic (EN 1990 Table A2.1)
const ABNORMAL = { psi0: 0, psi1: 0, psi2: 0 }; // abnormal vehicles: no accompanying role
const WIND = { psi0: 0.6, psi1: 0.2, psi2: 0 }; // EN 1990 Table A2.1 Fwk

// --- SSVB — Short Span Vehicle Bridge (cassette deck), 4.5 m clear ---------
// BB200-01-RP-200-001 rev P03 §7 Abutment Loads.
// Columns: span L (m) = deck length; DL total bridge (kN); live R per
// abutment (kN): CS 454, SV-80, SV-80 (DAF+OF), A35G (DAF+OF), A40G (DAF+OF);
// braking total (kN, split equally — both abutments fixed); transverse per
// abutment (kN); wind across / along total bridge (kN); ΔL exp / con (mm).
const SSVB_ROWS = [
  [4.0, 47, 156, 240, 362, 273, 291, 120, 30, 10, 6, 2, 1],
  [5.0, 57, 175, 282, 425, 305, 324, 141, 35, 10, 6, 2, 2],
  [6.0, 67, 195, 325, 488, 340, 359, 163, 41, 10, 6, 2, 2],
  [7.0, 77, 247, 371, 556, 425, 471, 186, 46, 10, 6, 3, 2],
  [8.0, 87, 273, 405, 607, 460, 521, 203, 51, 10, 6, 3, 2],
  [9.0, 97, 309, 431, 646, 486, 566, 216, 54, 10, 6, 4, 2],
  [10.0, 122, 341, 458, 678, 517, 605, 229, 57, 10, 6, 4, 3],
  [11.0, 135, 367, 479, 703, 542, 636, 240, 60, 10, 6, 4, 3],
  [12.0, 147, 393, 497, 725, 563, 661, 249, 62, 10, 6, 5, 4],
].map(([L, DL, CS454, SV80p, SV80, A35G, A40G, brk, trans, wAcross, wAlong, dExp, dCon]) => ({
  key: `SSVB-${L.toFixed(1)}`, label: `SSVB ${L.toFixed(1)} m span × 4.5 m clear`, L, B: 4.5, DL, CS454, SV80p, SV80, A35G, A40G, brk, trans, wAcross, wAlong, dExp, dCon,
}));

// --- BCB — Beaver Culvert Bridge ---------------------------------------------
// BB200-CALC-700-001 rev P01 (07/26) sheet 1, "15.0 Characteristic Load Table".
// Columns: span L, width B, beams, DL total (kN), CS 454 R, SV-80, SV-100,
// SV-150, SV-196 R at one abutment (kN), 2-lane R envelope (6.0 m width only),
// braking total Opt A / Opt B (kN), wind across / along total (kN), ΔL exp / con (mm).
const BCB_DATA = [
  // L, CS454, SV80, SV100, SV150, SV196, brkA, brkB, wAcross, wAlong, dExp, dCon, [DL by width 1.5/3.0/4.5/6.0], 2-lane (6.0)
  [1.5, 113, 172, 218, 193, 238, 180, 66, 1.55, 0.39, 0.36, 0.63, [5, 10, 16, 21], 351],
  [2.0, 126, 209, 265, 235, 290, 180, 72, 2.06, 0.52, 0.48, 0.84, [7, 14, 20, 27], 416],
  [2.5, 141, 238, 302, 267, 330, 270, 99, 2.58, 0.64, 0.60, 1.05, [8, 17, 25, 34], 470],
  [3.0, 150, 266, 338, 299, 369, 270, 99, 3.09, 0.77, 0.72, 1.26, [10, 20, 30, 40], 519],
  [3.5, 156, 302, 383, 339, 418, 270, 99, 3.61, 0.90, 0.84, 1.47, [12, 23, 35, 46], 574],
  [4.0, 160, 328, 416, 368, 454, 360, 132, 4.12, 1.03, 0.96, 1.68, [13, 26, 40, 53], 614],
];
const BCB_ROWS = [];
BCB_DATA.forEach(([L, CS454, SV80, SV100, SV150, SV196, brkA, brkB, wAcross, wAlong, dExp, dCon, DLs, twoLane]) => {
  [1.5, 3.0, 4.5, 6.0].forEach((B, i) => BCB_ROWS.push({
    key: `BCB-${L.toFixed(1)}x${B.toFixed(1)}`, label: `BCB ${L.toFixed(1)} m span × ${B.toFixed(1)} m wide (${5 * (i + 1)} beams)`,
    L, B, beams: 5 * (i + 1), DL: DLs[i], CS454, SV80, SV100, SV150, SV196, twoLane: B === 6.0 ? twoLane : null, brkA, brkB, wAcross, wAlong, dExp, dCon,
  }));
});

// --- Waagner-Biro panel bridge ----------------------------------------------------
// Waagner-Biro Bridge Systems drawing T18-41-548-02-201 rev 00 (15.12.2025),
// "Abutment detail & reaction forces". Dead load is TOTAL bridge (÷ 4 per
// corner); vehicle reactions are the MAXIMUM PER BRIDGE CORNER (incl.
// eccentricity); braking and wind are WHOLE BRIDGE. Fixed bearing at one
// end, sliding at the other.
// Columns: configuration, bays, length (m), DL total (kg), All Model 2 worst
// case (kN/corner), SV-80 (kN/corner), A35G (kN/corner), braking (kN),
// wind across / along (kN), ΔL exp / con (mm).
// ⚠ Transcribed from a reduced image of the drawing — verify every row.
const WB_ROWS = [
  ['SS', 4, 12.192, 10216, 178, 363, 328, 390, 60, 30, 4, 4],
  ['SSRL', 5, 15.24, 14852, 189, 386, 346, 390, 75, 38, 5, 5],
  ['SSRL', 6, 18.288, 17822, 198, 402, 357, 390, 90, 45, 7, 7],
  ['DS', 7, 21.336, 23380, 210, 413, 358, 390, 105, 53, 8, 8],
  ['DS', 8, 24.384, 26720, 221, 421, 365, 390, 120, 60, 9, 9],
  ['DSR1L', 9, 27.432, 33808, 249, 427, 369, 390, 135, 68, 10, 10],
  ['DSR1L', 10, 30.48, 37564, 271, 433, 373, 390, 150, 75, 11, 11],
  ['DSR2L', 11, 33.528, 45866, 295, 437, 376, 390, 165, 83, 12, 12],
  ['DSR2L', 12, 36.576, 50036, 322, 441, 379, 390, 180, 90, 13, 13],
  ['DSR2M', 13, 39.624, 58042, 351, 441, 381, 390, 195, 98, 14, 14],
  ['DSR2H', 14, 42.672, 65030, 362, 446, 383, 390, 210, 105, 15, 15],
  ['TSR2M', 15, 45.72, 77272, 369, 448, 384, 390, 225, 113, 16, 16],
  ['TSR3H', 16, 48.768, 85307, 375, 450, 386, 390, 240, 120, 18, 18],
  ['TSR3H', 17, 51.816, 101730, 457, 452, 387, 390, 255, 128, 19, 19],
  ['DDR2M', 18, 54.864, 106205, 478, 453, 388, 390, 487, 244, 20, 20],
  ['DDR2M', 19, 57.912, 112305, 498, 455, 389, 390, 514, 257, 21, 21],
  ['DDR2H', 20, 60.96, 121609, 518, 456, 390, 390, 541, 271, 22, 22],
].map(([cfg, bays, L, kg, M2, SV80, A35G, brk, wAcross, wAlong, dExp, dCon]) => ({
  key: `WB-${bays}`, label: `${cfg} — ${bays} bays, ${L.toFixed(3)} m`, cfg, bays, L, DL: Math.round((kg * 9.81) / 100) / 10, kg, M2, SV80, A35G, brk, wAcross, wAlong, dExp, dCon,
  trussLines: cfg.startsWith('T') ? 3 : cfg.startsWith('S') ? 1 : 2,
}));

// Braking for a normal-traffic-only requirement, per the SSVB method
// (BB200-01-RP-200-001 §6.2.5 / §7 note 3): braking total = 0.5 × R, with R
// the maximum per-abutment reaction of that loading; transverse per abutment
// = 0.125 × R (§7 note 4).
const halfR = (R) => ({ total: 0.5 * R, transPerAbut: 0.125 * R });

export const BRIDGE_RANGES = {
  SSVB: {
    label: 'SSVB — Short Span Vehicle Bridge (4–12 m)',
    source: 'BB200-01-RP-200-001 rev P03 §7 (characteristic abutment loads); BB200-01-DR-1800-201 standard details',
    verify: true,
    rows: SSVB_ROWS,
    loadings: [
      { key: 'CS454', label: 'CS 454 only' },
      { key: 'CS454+SV80', label: 'CS 454 + SV-80' },
      { key: 'CS454+SV80DOF', label: 'CS 454 + SV-80 (DAF + OF)' },
    ],
    defaultLoading: 'CS454+SV80DOF',
    notes: [
      'Both abutments fixed: braking total split equally between ends.',
      'CS 454: braking total = 0.5 × CS 454 R and transverse = 0.125 × R per abutment (SSVB method, §7 notes 3–4). SV-80: braking and transverse from the §7 table (0.5 × SV-80 R; 0.125 × SV-80 R) — the same values are used with the DAF + OF reaction.',
      'Vehicle models are checked one at a time; SV-80 has no accompanying traffic (approach surcharge and wind excluded).',
      'Wind envelope 10 kN across / 6 kN along (total), split equally between abutments; wind and thermal not combined (NA.2.3.3.4).',
      'Thermal given as displacements only (elastomeric strip bearings) — no thermal force included.',
      'Bearing-to-bearing span taken as deck length − 0.3 m (300 mm elastomeric strip at each end) — confirm against the GA.',
    ],
    toDesign(row, loading = 'CS454+SV80DOF') {
      const cs = halfR(row.CS454);
      const models = [{ name: 'CS 454', excludeSurchargeWind: false }];
      const reactions = [
        r('Dead load (total ÷ 2)', 'G', { Z: row.DL / 2 }),
        r('CS 454 normal traffic', 'Qv', { model: 'CS 454', Z: row.CS454, ...NORMAL }),
        r('CS 454 braking (0.5 R total ÷ 2) + transverse (0.125 R)', 'Qb', { model: 'CS 454', X: cs.total / 2, Y: cs.transPerAbut, reversible: true, ...NORMAL, psi0: 0 }),
      ];
      if (loading !== 'CS454') {
        const dof = loading === 'CS454+SV80DOF';
        const name = dof ? 'SV-80 (DAF + OF)' : 'SV-80';
        models.push({ name, excludeSurchargeWind: true });
        reactions.push(r(name, 'Qv', { model: name, Z: dof ? row.SV80 : row.SV80p, ...ABNORMAL }));
        reactions.push(r(`SV-80 braking (table, total ÷ 2) + transverse — ${name}`, 'Qb', { model: name, X: row.brk / 2, Y: row.trans, reversible: true, ...ABNORMAL }));
      }
      reactions.push(r('Wind (total ÷ 2)', 'Qw', { X: row.wAlong / 2, Y: row.wAcross / 2, reversible: true, ...WIND }));
      return {
        project: { bridgeDescription: `Beaver Bridges SSVB cassette deck, ${row.L.toFixed(1)} m (standard product)`, span: +(row.L - 0.3).toFixed(3), overallLength: row.L, deckWidth: 4.572, clearWidth: 4.5, deckDepth: 0.336, bearingsPerEnd: 2, bearingCentres: 2.286, bearingPlateL: 300, bearingPlateB: 1000, bearingHeight: 30, fixedEnd: 0, slidingMu: 0, modularIncrement: 0 },
        trafficModels: models,
        reactions,
        info: `Thermal ΔL +${row.dExp} / −${row.dCon} mm at each end.`,
      };
    },
  },
  BCB: {
    label: 'BCB — Beaver Culvert Bridge (1.5–4 m)',
    source: 'BB200-CALC-700-001 rev P01 (07/26): 15.0 Characteristic Load Table; 3.0 Geometry (bearing layout); drawing BB100-01-DR-1800-701',
    verify: true,
    rows: BCB_ROWS,
    loadings: [
      { key: 'CS454', label: 'CS 454 only' },
      { key: 'CS454+SV80', label: 'CS 454 + SV-80' },
      { key: 'CS454+SVall', label: 'CS 454 + SV-80 to SV-196 (envelope)' },
    ],
    defaultLoading: 'CS454+SVall',
    notes: [
      'Live reactions are the worst case at one abutment. For 6.0 m width the two-lane envelope (SV + CS 454) is added as its own model when SV vehicles are included.',
      'CS 454: braking total = 0.5 × CS 454 R (SSVB method), split 50/50 between abutments (both fixed). SV vehicles: table braking Option A (the larger) — confirm which option applies.',
      'The table gives no separate DAF + OF reactions; SV-100 to SV-196 are included in the envelope option.',
      'Wind total bridge, split equally between abutments.',
      '⚠ The information drawing BB200-01-DR-0100-001 P01 (Sep 26) loading matrix shows higher live reactions than this table (e.g. 4.0 m SV-196: 499 v 454 kN). Confirm which is current before relying on these values.',
      'Bearing layout from BB200-CALC-700-001 §3.1: bearings 177.5 mm in from each deck end (deck 3.577 m, bearing centres 3.222 m), so bearing-to-bearing span = L − 0.355 m; one bearing per 1.5 m deck unit (5 beams at 341 mm, 68 mm edge offset). Bearing pad size not given — 300 × 1000 strip assumed, confirm.',
      '6.0 m width: two 3.0 m notional lanes (BS EN 1991-2 4.2.3) — hence the 2-lane envelope.',
    ],
    toDesign(row, loading = 'CS454+SVall') {
      const n = Math.max(1, Math.round(row.B / 1.5));
      const sv = loading === 'CS454' ? [] : loading === 'CS454+SV80' ? ['SV-80'] : ['SV-80', 'SV-100', 'SV-150', 'SV-196'];
      const models = [{ name: 'CS 454', excludeSurchargeWind: false }, ...sv.map((m) => ({ name: m, excludeSurchargeWind: true }))];
      if (row.twoLane && sv.length) models.push({ name: '2-lane SV + CS 454', excludeSurchargeWind: false });
      const val = { 'CS 454': row.CS454, 'SV-80': row.SV80, 'SV-100': row.SV100, 'SV-150': row.SV150, 'SV-196': row.SV196, '2-lane SV + CS 454': row.twoLane };
      const brkX = (m) => (m === 'CS 454' ? halfR(row.CS454).total / 2 : row.brkA / 2);
      return {
        project: { bridgeDescription: `Beaver Culvert Bridge ${row.L.toFixed(1)} × ${row.B.toFixed(1)} m (standard product, ${row.beams} beams)`, span: +(row.L - 0.355).toFixed(3), overallLength: row.L, deckWidth: row.B, clearWidth: row.B, deckDepth: 0.4, bearingsPerEnd: n, bearingCentres: 1.5, bearingPlateL: 300, bearingPlateB: 1000, bearingHeight: 30, fixedEnd: 0, slidingMu: 0, modularIncrement: 0 },
        trafficModels: models,
        reactions: [
          r('Dead load (total ÷ 2)', 'G', { Z: row.DL / 2 }),
          ...models.map((m) => r(`${m.name}`, 'Qv', { model: m.name, Z: val[m.name], ...(m.excludeSurchargeWind ? ABNORMAL : NORMAL) })),
          ...models.map((m) => r(`Braking (${m.name === 'CS 454' ? '0.5 R' : 'Opt A'} total ÷ 2) — ${m.name}`, 'Qb', { model: m.name, X: brkX(m.name), reversible: true, ...(m.excludeSurchargeWind ? ABNORMAL : NORMAL), psi0: 0 })),
          r('Wind (total ÷ 2)', 'Qw', { X: row.wAlong / 2, Y: row.wAcross / 2, reversible: true, ...WIND }),
        ],
        info: `Thermal ΔL +${row.dExp} / −${row.dCon} mm.`,
      };
    },
  },
  WB: {
    label: 'Waagner-Biro panel bridge (12–61 m)',
    source: 'Waagner-Biro Bridge Systems drawing T18-41-548-02-201 rev 00, Abutment detail & reaction forces',
    verify: true,
    rows: WB_ROWS,
    loadings: [
      { key: 'M2', label: 'Model 2 traffic only (no CS 454 column on this drawing)' },
      { key: 'M2+SV80', label: 'Model 2 + SV-80' },
      { key: 'M2+SV80+A35G', label: 'Model 2 + SV-80 + A35G dumper' },
    ],
    defaultLoading: 'M2+SV80',
    notes: [
      '⚠ Values transcribed from a reduced image of the drawing — check every figure against the drawing before use.',
      'Dead load from the tabulated mass (the 12.192 m row shows 300 kN against 10 216 kg — the mass-consistent 100 kN is used; confirm with Waagner-Biro).',
      'Vehicle reactions are the maximum per bridge corner; the abutment total is taken as 2 × corner value (conservative for bearing, irrelevant for sliding and overturning).',
      'Model 2 only: braking total = 0.5 × R (SSVB method, R = per-abutment reaction). With SV-80: the drawing braking (390 kN, 50% of SV-80 weight). Braking and wind along deck are resisted at the fixed bearing end; the sliding end carries bearing friction only.',
      'Multiple truss lines are modelled as one bearing group per side (2 bearings per end) — conservative for seat compression. Bearing assembly height 350 mm and pocket sizes from Sections A/B — confirm.',
      'Minimum bearing CL to ballast wall: 500 mm (crane installation) or 1250 mm (launching) — set the seat geometry to suit.',
    ],
    toDesign(row, loading = 'M2+SV80') {
      const models = [{ name: 'Model 2 (all)', excludeSurchargeWind: false }];
      const reactions = [
        r('Dead load (total ÷ 2)', 'G', { Z: row.DL / 2 }),
        r('All Model 2 worst case (2 × corner)', 'Qv', { model: 'Model 2 (all)', Z: 2 * row.M2, ...NORMAL }),
        r('Model 2 braking (0.5 R, fixed end)', 'Qb', { model: 'Model 2 (all)', X: halfR(2 * row.M2).total, reversible: true, xFixedOnly: true, ...NORMAL, psi0: 0 }),
      ];
      const add = (name, Z) => {
        models.push({ name, excludeSurchargeWind: true });
        reactions.push(r(`${name} (2 × corner)`, 'Qv', { model: name, Z, ...ABNORMAL }));
        reactions.push(r(`Braking (whole bridge, fixed end) — ${name}`, 'Qb', { model: name, X: row.brk, reversible: true, xFixedOnly: true, ...ABNORMAL }));
      };
      if (loading !== 'M2') add('SV-80', 2 * row.SV80);
      if (loading === 'M2+SV80+A35G') add('A35G', 2 * row.A35G);
      reactions.push(r('Wind across (total ÷ 2)', 'Qw', { Y: row.wAcross / 2, reversible: true, ...WIND }));
      reactions.push(r('Wind along (whole bridge, fixed end)', 'Qw', { X: row.wAlong, reversible: true, xFixedOnly: true, ...WIND }));
      return {
        project: { bridgeDescription: `Waagner-Biro panel bridge ${row.cfg}, ${row.bays} bays, ${row.L.toFixed(3)} m`, span: row.L, overallLength: +(row.L + 0.4).toFixed(3), deckWidth: 5.4, clearWidth: 4.2, deckDepth: 0.9, bearingsPerEnd: 2, bearingCentres: 4.953, bearingPlateL: 400, bearingPlateB: 250, bearingHeight: 350, fixedEnd: 1, slidingMu: 0.2, modularIncrement: 3.048 },
        trafficModels: models,
        reactions,
        info: `Thermal ΔL +${row.dExp} / −${row.dCon} mm at the sliding end.`,
      };
    },
  },
};

export function libraryDesign(rangeKey, rowKey, loading) {
  const range = BRIDGE_RANGES[rangeKey];
  const row = range?.rows.find((x) => x.key === rowKey);
  if (!range || !row) return null;
  const ld = range.loadings.some((l) => l.key === loading) ? loading : range.defaultLoading;
  return { range, row, loading: ld, loadingLabel: range.loadings.find((l) => l.key === ld).label, ...range.toDesign(row, ld) };
}

// spec.js — specification clauses (editable), designer's risk assessment
// rows (CDM 2015) and the plate load test requirement object.

export function defaultClauses(ctx) {
  const pad = ctx?.padText || 'Type 1 sub-base';
  const fill = ctx?.fillText || 'Class 6N/6P selected granular fill';
  return [
    { key: 'formation', title: 'Formation', text: 'Formation to be inspected and approved by a competent person before any pad or block is placed. Remove all topsoil, peat, made ground and soft or loosened material within the pad footprint and replace with compacted Type 1. Proof roll the formation; any soft spots to be excavated and replaced.' },
    { key: 'plt', title: 'Plate load testing', text: 'Plate load tests to BS 1377-9 on the approved formation before the pad or blocks are placed, at the test pressure and acceptance criteria stated in the PLT requirement. Results to be reviewed by the designer before placing blocks.' },
    { key: 'pad', title: 'Pad', text: `${pad} to SHW Series 800, compacted in layers not exceeding 150 mm to the SHW Series 600 method requirements. Finished pad level tolerance ±10 mm; surface to be screeded level to receive the bottom course.` },
    { key: 'blocks', title: 'Legato blocks', text: 'Inspect every block on delivery; reject blocks with cracks, spalling or damaged nibs/recesses. Place blocks on the 400 mm grid with full nib engagement, in the bond shown on the layer plans. Line and level tolerance ±5 mm per course, cumulative ±10 mm. Pre-used blocks to be inspected for lifting-pin wear and corrosion, cracks and damage before reuse.' },
    { key: 'grout', title: 'Grout', text: 'Bedding grout under the ballast wall to the thickness shown (max 110 mm). Bearing grout pad: proprietary non-shrink cementitious grout, max 20 mm, placed and cured to the manufacturer’s instructions before loading.' },
    { key: 'anchors', title: 'Anchors', text: 'Baseplate anchors to the supplier’s design to BS EN 1992-4 for unreinforced C40/50 concrete. Maintain the minimum edge distances shown; keep clear of the Ø94 lifting recess at each block centre.' },
    { key: 'backfill', title: 'Backfill', text: `${fill} compacted in layers not exceeding 150 mm. No heavy compaction plant within 2 m of the rear of the abutment (SHW Series 600 limits); use hand-guided plant in this zone.` },
    { key: 'drainage', title: 'Drainage', text: 'Free-draining backfill behind the ballast wall with a positive drainage path (weep or perforated pipe) to prevent water build-up behind the abutment.' },
    { key: 'frontfill', title: 'Front fill', text: 'Where front fill is relied upon, the minimum front fill level stated on the drawings shall be maintained for the design life. Do not excavate in front of the abutment without the designer’s approval.' },
    { key: 'scour', title: 'Scour protection', text: 'Scour protection to the extent and details shown, where required by the scour assessment.' },
    { key: 'holdpoints', title: 'Hold points', text: 'Hold points: (1) formation approval; (2) PLT results accepted; (3) pad level survey; (4) level survey of each course; (5) pre-deck survey of seat levels and bearing positions.' },
    { key: 'monitoring', title: 'Monitoring', text: 'Level and tilt survey of each abutment after deck placement and after the first significant flood. Report movements to the designer.' },
  ];
}

export function defaultDRA() {
  const row = (hazard, L, S, action, residual) => ({ hazard, L, S, R: L * S, action, residual });
  return [
    row('Global instability of the bank under abutment loads', 3, 5, 'Bishop search (E5) in all cases; setback and founding depth set by X1/E5.', 'Low — verify with site-specific GI and checker’s analysis'),
    row('Bearing failure of the formation', 2, 5, 'EC7 DA1 checks; PLT at formation before blocks placed.', 'Low'),
    row('Scour undermining the abutment', 3, 5, 'Scour assessment required where in flood extent; scour protection or deeper founding.', 'Medium until scour assessed'),
    row('River channel migration', 2, 4, 'Setback from bank crest; monitoring after floods.', 'Low'),
    row('Excessive longitudinal loading (abnormal vehicles)', 2, 4, 'Abnormal load cases checked; approach surcharge excluded only with traffic management controls.', 'Low with controls'),
    row('Bridge launch loads', 3, 4, 'Launch loads table checked (S4); temporary blocks excluded from permanent works.', 'Low'),
    row('Construction tolerance — blocks out of line/level', 3, 3, 'Tolerances specified; course level hold points.', 'Low'),
    row('Lifting operations (blocks up to ~2.4 t)', 3, 5, 'Block masses scheduled; accessory rating to be confirmed (data flag 2); lift plan, exclusion zones, LOLER.', 'Medium — lifting by appointed person'),
    row('Working near water', 3, 5, 'Rescue plan, buoyancy aids, edge protection; avoid works in flood season where possible.', 'Medium'),
    row('Plant near the bank crest', 3, 4, 'Plant surcharge case in E5; exclusion zone from crest.', 'Low'),
    row('Buried services', 2, 5, 'Service searches and CAT scan before excavation.', 'Low'),
    row('Excavation stability', 3, 4, 'Batter or support excavations deeper than 1.2 m; check near the bank crest.', 'Low'),
    row('Flood during construction', 2, 5, 'Flood warning monitoring; stage works; secure plant and materials.', 'Medium'),
    row('Vehicle impact on the abutment/wings', 2, 4, 'Protection blocks or barrier where vehicle access is possible.', 'Low'),
  ];
}

// PLT requirement: SLS characteristic mean formation pressure V/(B′L′)
// rounded up to the next 10 kPa.
export function pltRequirement(govQ, end) {
  if (!govQ) return null;
  const q = govQ.formation;
  const qMean = q.qMeanEff;
  return {
    end,
    targetPressure_kPa: Math.ceil(qMean / 10) * 10,
    basis: `Governing SLS characteristic mean formation pressure V/(B′L′) = ${qMean.toFixed(1)} kPa (${govQ.label})`,
    plate: 'Ø600 mm plate (Ø450 mm minimum alternative)',
    acceptance: 'Total settlement ≤ 1.5% of plate diameter (9.0 mm for Ø600; 6.8 mm for Ø450) at the target pressure, with no abrupt yielding',
    count: 'Minimum 3 tests per abutment formation (BB to confirm frequency)',
    standard: 'BS 1377-9:1990',
    note: 'PLT is an SLS verification, not a ULS test; results to be reviewed by the TWC/designer before blocks are placed.',
  };
}

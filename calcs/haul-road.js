// haul-road.js — Haul road / ramped HGV access design: unbound granular
// sub-base thickness from equivalent standard-axle traffic loading.

import { svg, soilHatchDef, line, rect, text, vDimension, clamp } from '../js/diagrams.js';

// Cross-section: subgrade, sub-base of thickness h_required, an optional
// asphalt cap, an optional geogrid line, and a schematic wheel load on top.
function diagram(v, output) {
  const results = output?.results || [];
  const get = (sym) => results.find((r) => r.symbol === sym)?.value;
  const hReq = get('h_required') ?? 300;

  const groundY = 210;
  const hPx = clamp((hReq / 1000) * 320, 20, 130);
  const subbaseTopY = groundY - hPx;
  const cx = 200;

  let inner = '';
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" style="fill:var(--bb-primary-100)" />`;
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" fill="url(#hr-hatch)" />`;
  inner += line(10, groundY, 390, groundY, { color: 'var(--bb-primary)', width: 1.5 });
  inner += text(14, groundY + 16, 'SUBGRADE', { size: 8, weight: 700, color: 'var(--bb-primary-500)', anchor: 'start', ls: '0.05em' });

  inner += rect(30, subbaseTopY, 340, hPx, { fill: 'var(--bb-primary-200)', stroke: 'var(--bb-primary-700)' });
  inner += text(cx, subbaseTopY + 16, 'GRANULAR SUB-BASE', { size: 8, weight: 700, color: 'var(--bb-primary-700)', ls: '0.05em' });

  let topY = subbaseTopY;
  if (v.includeAsphaltCap === 'Yes') {
    const capPx = clamp(((v.dcap || 30) / 1000) * 320, 5, 18);
    const capTopY = subbaseTopY - capPx;
    inner += rect(30, capTopY, 340, capPx, { fill: 'var(--bb-ink)', stroke: 'var(--bb-primary-900)' });
    topY = capTopY;
  }

  if (v.includeGeogrid === 'Yes') {
    const geogridY = groundY - Math.min((350 / 1000) * 320, hPx);
    inner += line(30, geogridY, 370, geogridY, { color: 'var(--bb-accent)', width: 2, dash: '5 3' });
    inner += text(cx, geogridY - 5, 'GEOGRID', { size: 7.5, weight: 700, color: 'var(--bb-accent-700)' });
  }

  // Wheel-pair load schematic
  [cx - 45, cx + 45].forEach((wx) => {
    inner += `<circle cx="${wx}" cy="${topY - 15}" r="15" style="fill:var(--bb-ink);stroke:var(--bb-primary-900)" />`;
    inner += `<circle cx="${wx}" cy="${topY - 15}" r="5" style="fill:var(--bb-primary-200)" />`;
  });
  inner += rect(cx - 60, topY - 46, 120, 20, { fill: 'var(--bb-accent)', stroke: 'var(--bb-accent-700)' });
  inner += text(cx, topY - 52, 'HGV WHEEL LOAD', { size: 7.5, weight: 700, color: 'var(--bb-accent-700)' });

  inner += vDimension(50, subbaseTopY, groundY, `h = ${hReq.toFixed(0)} mm`, { extendToX: 30 });

  return svg('0 0 400 300', inner, soilHatchDef('hr-hatch'));
}

// sa (standard axles per pass) per vehicle type — ICE Temporary Works
// (2012) Table 5.1. 'custom' rows use the engineer's own value instead.
export const HAUL_ROAD_VEHICLES = {
  'artic-6axle': { label: '6-axle articulated lorry (50 t, 6 axles, sa=5.15)', sa: 5.15 },
  'artic-5axle': { label: '5-axle articulated lorry (38 t, 5 axles, sa=4.7)', sa: 4.7 },
  'artic-4axle': { label: '4-axle articulated lorry (35 t, 4 axles, sa=7.35)', sa: 7.35 },
  'artic-3axle': { label: '3-axle articulated lorry (26 t, 3 axles, sa=5.65)', sa: 5.65 },
  'db-4axle': { label: '4-axle DB lorry/trailer (35 t, sa=5.4)', sa: 5.4 },
  'rigid-4axle': { label: '4-axle rigid lorry (32 t, sa=5.35)', sa: 5.35 },
  'rigid-3axle': { label: '3-axle rigid lorry (26 t, sa=4.8)', sa: 4.8 },
  'rigid-2axle': { label: '2-axle rigid lorry (17 t, sa=3.15)', sa: 3.15 },
  van: { label: 'Van (5 t, sa=0.02)', sa: 0.02 },
  car: { label: 'Car (2 t, sa=0.0005)', sa: 0.0005 },
  'forklift-5t': { label: '5-tonne forklift (11 t, sa=0.4)', sa: 0.4 },
  'forklift-3t': { label: '3-tonne forklift (7 t, sa=0.07)', sa: 0.07 },
  'dumptruck-3axle': { label: '3-axle dump truck (34 t, sa=11.26)', sa: 11.26 },
  'dumper-6t': { label: '6-tonne dumper (10 t, sa=0.39)', sa: 0.39 },
  custom: { label: 'Custom (enter sa manually)', sa: null },
};

function minH(cbr) {
  if (cbr <= 15) return 225;
  if (cbr <= 30) return 150;
  return 150; // per ICE 2012: "may not be necessary" above CBR 30 — designer judgement
}

export default {
  id: 'haul-road',
  title: 'Haul Road / Ramped HGV Access Design',
  category: 'Temporary Works — Site Access',
  tag: 'ICE Temporary Works 2012',
  version: '1.0.0',
  references: [
    'ICE, Temporary Works: Principles of Design and Construction (2012), Table 5.1 and Equation 5.5',
    'BS 5975:2019 — Code of practice for temporary works procedures and the permissible stress design of falsework',
  ],
  description: 'Unbound granular sub-base thickness for a temporary haul road or ramped HGV access, from equivalent standard-axle traffic loading and subgrade CBR, with optional asphalt capping and geogrid reduction.',
  assumptions: [
    '5 working days per week assumed when converting passes/day and duration to total passes.',
    'Dynamic factor of 2.0 applied to total standard axles per ICE 2012 §5.4.2.',
    'Equation 5.5 (h = 190·log10(sa,design)·CBR⁻⁰·⁶³) is valid up to sa,design = 10,000 — inputs producing more are out of the method\'s scope.',
    'Cohesive subgrade CBR estimated from undrained shear strength as CBR = cu/23; granular subgrades need a CBR entered directly (from a site test).',
    'Geogrid benefit is a simplified 30% reduction applied to the lesser of the net sub-base thickness or 350 mm (the depth a single geogrid layer is taken to reinforce).',
  ],
  inputs: [
    { name: 'roadType', label: 'Road type', type: 'select', options: ['Temporary', 'Permanent foundation'], default: 'Temporary' },
    { name: 'durationWeeks', label: 'Overall duration', type: 'number', unit: 'weeks', default: 8, min: 1, step: 1 },
    { name: 'vehicles', label: 'Vehicle movements', type: 'vehicle-rows',
      help: 'One row per vehicle type. sa,row = passes/day × working weeks × 5 × sa (per Table 5.1).',
      vehicleOptions: Object.entries(HAUL_ROAD_VEHICLES).map(([value, meta]) => ({ value, label: meta.label })),
      default: [
        { vehicleType: 'artic-6axle', passesPerDay: 6, workingWeeks: 8, customSa: undefined },
      ] },
    { name: 'soilType', label: 'Subgrade type', type: 'select', options: ['Cohesive', 'Granular'], default: 'Cohesive' },
    { name: 'cu', label: 'Undrained shear strength cu', type: 'number', unit: 'kPa', default: 40, min: 1, step: 1,
      showIf: (v) => v.soilType === 'Cohesive' },
    { name: 'cbrOverride', label: 'CBR override (optional)', type: 'number', unit: '%', default: undefined, min: 0.1, step: 0.1,
      help: 'Leave blank to derive CBR from cu. Required for a granular subgrade.' },
    { name: 'includeAsphaltCap', label: 'Include asphalt capping', type: 'select', options: ['No', 'Yes'], default: 'No' },
    { name: 'dcap', label: 'Asphalt capping thickness', type: 'number', unit: 'mm', default: 30, min: 10, step: 5,
      showIf: (v) => v.includeAsphaltCap === 'Yes' },
    { name: 'includeGeogrid', label: 'Include geogrid', type: 'select', options: ['No', 'Yes'], default: 'No' },
    { name: 'geogridLayers', label: 'Geogrid layers', type: 'number', default: 1, min: 1, step: 1,
      showIf: (v) => v.includeGeogrid === 'Yes' },
    { name: 'rutDepth_mm', label: 'Design rut depth', type: 'select', options: ['75', '40'], default: '75',
      help: '75 mm = temporary road, 40 mm = permanent foundation.' },
  ],
  diagram,
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    const vehicles = v.vehicles || [];
    let saTotal = 0;
    const rowLines = [];
    vehicles.forEach((row, i) => {
      const veh = HAUL_ROAD_VEHICLES[row.vehicleType];
      const sa = row.vehicleType === 'custom' ? row.customSa : veh?.sa;
      if (sa === undefined || sa === null || !Number.isFinite(sa)) {
        warnings.push(`Vehicle row ${i + 1} has no valid sa value — it has been excluded from the total.`);
        return;
      }
      const passes = row.passesPerDay ?? 0;
      const weeks = row.workingWeeks ?? 0;
      const saRow = passes * weeks * 5 * sa;
      saTotal += saRow;
      rowLines.push(`Row ${i + 1} (${veh?.label || 'custom'}): ${passes}/day × ${weeks} wks × 5 × sa=${sa} = ${saRow.toFixed(1)}`);
    });

    steps.push({
      title: 'Total standard axles from vehicle movements',
      formula: 'sa,row = passesPerDay × workingWeeks × 5 × sa (Table 5.1);  sa,total = Σ sa,row',
      substitution: rowLines.join('; ') || '(no valid vehicle rows)',
      result: `sa,total = ${saTotal.toFixed(1)}`,
    });

    const saDesign = 2 * saTotal;
    steps.push({
      title: 'Design standard axles',
      formula: 'sa,design = 2 × sa,total  (dynamic factor, ICE 2012 §5.4.2)',
      substitution: `sa,design = 2 × ${saTotal.toFixed(1)}`,
      result: `sa,design = ${saDesign.toFixed(1)}`,
    });

    if (saDesign > 10000) {
      warnings.push(`sa,design = ${saDesign.toFixed(0)} exceeds 10,000 — outside the range Equation 5.5 was derived for. Reduce traffic or split the programme, or seek a bespoke pavement design.`);
    }

    let cbr;
    if (v.cbrOverride !== undefined && v.cbrOverride !== null) {
      cbr = v.cbrOverride;
      steps.push({ title: 'Subgrade CBR', formula: 'CBR entered directly', substitution: `CBR = ${cbr}`, result: `CBR = ${cbr.toFixed(2)}%` });
    } else if (v.soilType === 'Cohesive') {
      cbr = v.cu / 23;
      steps.push({
        title: 'Subgrade CBR from undrained shear strength',
        formula: 'CBR = cu / 23',
        substitution: `CBR = ${v.cu} / 23`,
        result: `CBR = ${cbr.toFixed(2)}%`,
      });
    } else {
      warnings.push('Granular subgrade selected with no CBR override — enter a CBR from a site test (DCP or plate test) to proceed.');
      cbr = undefined;
    }

    if (cbr === undefined) {
      return { results: [{ symbol: 'h_required', label: 'Required sub-base thickness', value: 0, unit: 'mm', precision: 0, highlight: true }], steps, warnings };
    }

    if (cbr < 2.5) {
      warnings.push(`CBR = ${cbr.toFixed(2)}% is very low — a capping layer or ground improvement is strongly recommended ahead of the granular sub-base.`);
    }

    const hMin = minH(cbr);
    const hUnreinforced = Math.max(hMin, 190 * Math.log10(saDesign) * Math.pow(cbr, -0.63));
    steps.push({
      title: 'Unreinforced sub-base thickness',
      formula: 'h = max(hmin, 190·log10(sa,design)·CBR⁻⁰·⁶³)',
      substitution: `h = max(${hMin}, 190×log10(${saDesign.toFixed(1)})×${cbr.toFixed(2)}⁻⁰·⁶³)`,
      result: `h,unreinforced = ${hUnreinforced.toFixed(0)} mm`,
    });

    let hNet = hUnreinforced;
    if (v.includeAsphaltCap === 'Yes') {
      const hEquiv = v.dcap * (100 / 30);
      hNet = hUnreinforced - hEquiv;
      steps.push({
        title: 'Asphalt capping reduction',
        formula: 'h_equiv = dcap × 100/30;  h_net = h,unreinforced − h_equiv',
        substitution: `h_equiv = ${v.dcap} × 100/30 = ${hEquiv.toFixed(0)}; h_net = ${hUnreinforced.toFixed(0)} − ${hEquiv.toFixed(0)}`,
        result: `h_net = ${hNet.toFixed(0)} mm`,
      });
    }

    let hRequired = hNet;
    if (v.includeGeogrid === 'Yes') {
      const hrEff = Math.min(350, hNet);
      hRequired = hrEff * 0.70 + (hNet - hrEff);
      steps.push({
        title: 'Geogrid reduction',
        formula: 'hr,eff = min(350, h_net);  hr,sb = hr,eff × 0.70 + (h_net − hr,eff)',
        substitution: `hr,eff = min(350, ${hNet.toFixed(0)}) = ${hrEff.toFixed(0)}`,
        result: `hr,sb = ${hRequired.toFixed(0)} mm`,
      });
    }

    hRequired = Math.max(0, hRequired);

    results.push(
      { symbol: 'sa_design', label: 'Design standard axles', value: saDesign, unit: '', precision: 0 },
      { symbol: 'CBR', label: 'Subgrade CBR', value: cbr, unit: '%', precision: 2 },
      { symbol: 'h_unreinforced', label: 'Unreinforced thickness', value: hUnreinforced, unit: 'mm', precision: 0 },
      { symbol: 'h_required', label: 'Required sub-base thickness', value: hRequired, unit: 'mm', precision: 0, highlight: true },
    );

    return { results, steps, warnings };
  },
  validation: {
    samples: [
      {
        name: 'Self-consistency baseline — brief\'s worked figures (≈575 mm) could not be exactly reproduced from the stated inputs and Eq. 5.5; this is the value the implemented formula actually returns — verify independently before relying on this tool',
        inputs: {
          roadType: 'Temporary', durationWeeks: 8,
          vehicles: [
            { vehicleType: 'artic-6axle', passesPerDay: 6, workingWeeks: 8 },
            { vehicleType: 'custom', passesPerDay: 1, workingWeeks: 2, customSa: 111.27 },
          ],
          soilType: 'Cohesive', cu: 35, rutDepth_mm: '75',
        },
        expect: { CBR: { value: 1.52, tol: 0.05, unit: '%' }, h_unreinforced: { value: 535, tol: 20, unit: 'mm' } },
      },
    ],
  },
};

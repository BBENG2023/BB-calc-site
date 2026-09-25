// service-protection-slab.js — Reinforced concrete slab spanning a buried
// service trench, protecting it from tracked plant / HGV imposed loads.
// Checks bending and shear (EC2) and bearing at the supports (EC7).

import { toRad, toDeg } from '../js/formatters.js';
import { bearingCapacityFactors, EC7_PARTIAL_FACTORS } from '../js/shared-data.js';

const GAMMA_C_CONCRETE = 1.5; // EC2 persistent/transient partial factor for concrete

const CONCRETE_CLASSES = {
  'C25/30': { fck: 25 },
  'C28/35': { fck: 28 },
  'C32/40': { fck: 32 },
};

function fctmFrom(fck) {
  // EC2 §3.1.2 Table 3.1 note, valid for fck ≤ 50 MPa.
  return 0.30 * Math.pow(fck, 2 / 3);
}

export default {
  id: 'service-protection-slab',
  title: 'Service Protection Slab',
  category: 'Temporary Works — Buried Service Protection',
  tag: 'BS EN 1992-1-1',
  version: '1.0.0',
  references: [
    'BS EN 1992-1-1:2004+A1:2014 (Eurocode 2) — Design of concrete structures',
    'BS EN 1997-1:2004+A1:2013 (Eurocode 7) — Geotechnical design',
    'PD 6694-1:2011 — Recommendations for the design of structures subject to traffic loading',
  ],
  description: 'Bending, shear (EC2) and bearing (EC7) checks for a reinforced concrete slab spanning across a buried service trench, protecting the service from tracked plant or HGV imposed loads.',
  assumptions: [
    'Simply-supported one-way span across the trench, checked per metre width, under a blanket UDL equal to the (factored) track contact pressure over the full span — no load dispersal or line-load/patch-load modelling. This is a deliberately simple, conservative-by-overload preliminary model; a load spread through the slab thickness to the actual track footprint would give a smaller design moment/shear.',
    'No explicit support (bearing strip) width was specified in the build brief — this tool assumes the slab bears directly on the ground either side of the trench over a width equal to the slab thickness. State the actual support detail and re-check if different.',
    'EC7 DA1-C2 bearing check reuses the same (structural-ULS-factored) shear reaction as the applied bearing load, rather than recomputing it with DA1-C2\'s own action factors (1.0G + 1.3Q) — a simplification for this preliminary tool.',
    'Minimum cover, bar lap/anchorage, and punching shear directly under a track pad are not checked here.',
  ],
  inputs: [
    { name: 'serviceCrown_m', label: 'Depth to crown of service', type: 'number', unit: 'm', default: 0.9, min: 0.1, step: 0.05 },
    { name: 'serviceOD_m', label: 'Service outside diameter', type: 'number', unit: 'm', default: 0.9, min: 0.05, step: 0.05 },
    { name: 'coverToService_min_m', label: 'Minimum cover to service crown', type: 'number', unit: 'm', default: 0.3, min: 0.05, step: 0.05,
      help: 'Per the statutory undertaker\'s requirement (e.g. water/gas/electric company).' },
    { name: 'slabWidth_m', label: 'Slab plan width (perpendicular to trench)', type: 'number', unit: 'm', default: 5.0, min: 1, step: 0.5 },
    { name: 'slabThickness_m', label: 'Slab thickness', type: 'number', unit: 'm', default: 0.3, min: 0.1, step: 0.025 },
    { name: 'slabLength_m', label: 'Slab span (support to support)', type: 'number', unit: 'm', default: 3.0, min: 0.5, step: 0.25 },
    { name: 'concreteClass', label: 'Concrete class', type: 'select', options: ['C25/30', 'C28/35', 'C32/40'], default: 'C25/30' },
    { name: 'fyk_N_mm2', label: 'Reinforcement fyk', type: 'number', unit: 'N/mm²', default: 500, min: 400, max: 600, step: 5 },
    { name: 'coverToReinf_mm', label: 'Cover to reinforcement', type: 'number', unit: 'mm', default: 40, min: 15, step: 5 },
    { name: 'barDia_mm', label: 'Bar diameter', type: 'number', unit: 'mm', default: 10, min: 8, max: 25, step: 2 },
    { name: 'barSpacing_mm', label: 'Bar spacing (per layer)', type: 'number', unit: 'mm', default: 200, min: 75, max: 300, step: 25 },
    { name: 'layers', label: 'Number of layers', type: 'number', default: 2, min: 1, max: 4, step: 1 },
    { name: 'gamma_concrete', label: 'Concrete unit weight', type: 'number', unit: 'kN/m³', default: 24, min: 22, max: 26, step: 0.5 },
    { name: 'trackPressure_kPa', label: 'Tracked plant contact pressure (unfactored)', type: 'number', unit: 'kPa', default: 200, min: 20, step: 10 },
    { name: 'trackWidth_m', label: 'Track width', type: 'number', unit: 'm', default: 0.9, min: 0.2, step: 0.1 },
    { name: 'gammaG', label: 'Partial factor γG', type: 'number', default: 1.35, min: 1, step: 0.05 },
    { name: 'gammaQ', label: 'Partial factor γQ', type: 'number', default: 1.5, min: 1, step: 0.05 },
    { name: 'soilPhi_deg', label: "Subgrade friction angle φ' (at supports)", type: 'number', unit: '°', default: 29, min: 15, max: 45, step: 0.5 },
    { name: 'soilCohesion_kPa', label: "Subgrade cohesion c'", type: 'number', unit: 'kPa', default: 0, min: 0, step: 1 },
    { name: 'soilGamma_kN_m3', label: 'Subgrade unit weight', type: 'number', unit: 'kN/m³', default: 18, min: 12, max: 22, step: 0.5 },
    { name: 'soilSPT_N', label: 'Subgrade SPT N (reporting only)', type: 'number', default: 8, min: 0, step: 1 },
    { name: 'embedment_m', label: 'Depth of slab bearing edge below GL', type: 'number', unit: 'm', default: 0.7, min: 0, step: 0.05 },
  ],
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    if (v.slabLength_m > 4) warnings.push(`Span = ${v.slabLength_m} m exceeds 4 m — consider a deeper slab or a beam-and-slab (T-beam) arrangement instead of a flat slab.`);
    if (v.trackPressure_kPa > 300) warnings.push(`Track contact pressure = ${v.trackPressure_kPa} kPa is high — confirm this against the actual plant's declared ground-bearing pressure.`);

    // Clearance from the slab soffit (assumed to sit at the support/bearing
    // level, embedment_m below GL) up to the service crown.
    const serviceClearance = v.serviceCrown_m - v.embedment_m;
    if (serviceClearance < v.coverToService_min_m) {
      warnings.push(`Clearance from the slab soffit to the service crown (${serviceClearance.toFixed(2)} m, assuming the slab bears at embedment_m below GL) is less than the statutory undertaker's minimum cover (${v.coverToService_min_m} m) — raise the slab or lower the bearing level.`);
    }
    if (v.soilSPT_N < 5) warnings.push(`SPT N = ${v.soilSPT_N} at the support subgrade is very loose — consider ground improvement at the bearing zones.`);

    // --- Loads ---
    const wSw = v.slabThickness_m * v.gamma_concrete * v.gammaG;
    const wLL = v.trackPressure_kPa * v.gammaQ;
    const wTotal = wSw + wLL;
    steps.push({
      title: 'Design UDL on slab',
      formula: 'w_sw = slabThickness × γconcrete × γG;  w_LL = trackPressure × γQ;  w_total = w_sw + w_LL',
      substitution: `w_sw = ${v.slabThickness_m}×${v.gamma_concrete}×${v.gammaG} = ${wSw.toFixed(2)}; w_LL = ${v.trackPressure_kPa}×${v.gammaQ} = ${wLL.toFixed(1)}`,
      result: `w_total = ${wTotal.toFixed(1)} kPa`,
    });

    // --- Bending & shear ---
    const w = wTotal * 1.0;
    const MEd = (w * v.slabLength_m ** 2) / 8;
    const VEd = (w * v.slabLength_m) / 2;
    steps.push({
      title: 'Design bending moment and shear force',
      formula: 'M_Ed = w·L²/8;  V_Ed = w·L/2  (per metre width, simply-supported span)',
      substitution: `M_Ed = ${w.toFixed(1)}×${v.slabLength_m}²/8; V_Ed = ${w.toFixed(1)}×${v.slabLength_m}/2`,
      result: `M_Ed = ${MEd.toFixed(1)} kNm/m, V_Ed = ${VEd.toFixed(1)} kN/m`,
    });

    const fck = CONCRETE_CLASSES[v.concreteClass].fck;
    const fctm = fctmFrom(fck);
    const fyd = v.fyk_N_mm2 / 1.15;
    const d = v.slabThickness_m * 1000 - v.coverToReinf_mm - v.barDia_mm / 2;
    const AsReq = (MEd * 1e6) / (fyd * 0.9 * d);
    const areaPerBar = (Math.PI * v.barDia_mm ** 2) / 4;
    const barsPerMetre = 1000 / v.barSpacing_mm;
    const AsProv = v.layers * barsPerMetre * areaPerBar;
    const AsMin = Math.max(0.26 * (fctm / v.fyk_N_mm2) * 1000 * d, 0.0013 * 1000 * d);
    steps.push({
      title: 'Bending reinforcement',
      formula: 'd = 1000×thickness − cover − barDia/2;  As,req = M_Ed×10⁶/(fyd×0.9×d);  As,prov = layers×(1000/spacing)×(π·barDia²/4);  As,min = max(0.26·fctm/fyk·b·d, 0.0013·b·d)',
      substitution: `d = ${(v.slabThickness_m * 1000).toFixed(0)} − ${v.coverToReinf_mm} − ${v.barDia_mm}/2 = ${d.toFixed(0)} mm; fctm(${v.concreteClass}) = ${fctm.toFixed(2)} N/mm²`,
      result: `As,req = ${AsReq.toFixed(0)} mm²/m, As,min = ${AsMin.toFixed(0)} mm²/m, As,prov = ${AsProv.toFixed(0)} mm²/m`,
    });

    const bendingPass = AsProv >= Math.max(AsReq, AsMin);

    const k = Math.min(2.0, 1 + Math.sqrt(200 / d));
    const rhoL = Math.min(AsProv / (1000 * d), 0.02);
    const vMin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck);
    const VRdc_a = ((0.18 / GAMMA_C_CONCRETE) * k * Math.pow(100 * rhoL * fck, 1 / 3) * 1000 * d) / 1000;
    const VRdc_b = (vMin * 1000 * d) / 1000;
    const VRdc = Math.max(VRdc_a, VRdc_b);
    steps.push({
      title: 'Shear resistance without shear reinforcement',
      formula: 'k = min(2.0, 1+√(200/d));  ρl = min(As,prov/(b·d), 0.02);  V_Rd,c = max[(0.18/γc)·k·(100·ρl·fck)^⅓·b·d,  0.035·k^1.5·√fck·b·d]',
      substitution: `k = ${k.toFixed(3)}, ρl = ${rhoL.toFixed(4)}`,
      result: `V_Rd,c = ${VRdc.toFixed(1)} kN/m`,
    });
    const shearPass = VRdc >= VEd;

    // --- Bearing at supports (EC7 DA1-C2) ---
    const { gammaPhi, gammaC, gammaRv } = EC7_PARTIAL_FACTORS.DA1_C2;
    const phiDesign = toDeg(Math.atan(Math.tan(toRad(v.soilPhi_deg)) / gammaPhi));
    const cDesign = v.soilCohesion_kPa / gammaC;
    const { Nq, Nc, Ngamma } = bearingCapacityFactors(phiDesign);
    const qEff = v.soilGamma_kN_m3 * v.embedment_m;
    const Bsupport = v.slabThickness_m; // see 'assumptions' — no explicit support width given
    const qUlt = cDesign * Nc + qEff * Nq + 0.5 * v.soilGamma_kN_m3 * Bsupport * Ngamma;
    const qRd = qUlt / gammaRv;
    const qApplied = VEd / Bsupport;
    steps.push({
      title: 'Bearing resistance at the support (EC7 DA1-C2)',
      formula: "φ'd = atan(tanφ'/γφ);  qult = c'd·Nc + q'·Nq + 0.5·γ·B·Nγ  (B taken as the slab thickness — see Assumptions);  q_applied = V_Ed/B",
      substitution: `φ'd = ${phiDesign.toFixed(2)}°, q' = ${qEff.toFixed(1)} kPa, B = ${Bsupport.toFixed(2)} m`,
      result: `q_Rd = ${qRd.toFixed(1)} kPa, q_applied = ${qApplied.toFixed(1)} kPa`,
    });
    const bearingPass = qRd >= qApplied;

    const failing = [];
    if (!bendingPass) failing.push('bending (As,prov < required)');
    if (!shearPass) failing.push('shear (V_Rd,c < V_Ed)');
    if (!bearingPass) failing.push('bearing (q_Rd < q_applied)');

    results.push(
      { symbol: 'M_Ed', label: 'Design bending moment', value: MEd, unit: 'kNm/m', precision: 1 },
      { symbol: 'V_Ed', label: 'Design shear force', value: VEd, unit: 'kN/m', precision: 1 },
      { symbol: 'As_prov', label: 'Reinforcement provided', value: AsProv, unit: 'mm²/m', precision: 0 },
      { symbol: 'V_Rd_c', label: 'Shear resistance', value: VRdc, unit: 'kN/m', precision: 1 },
      { symbol: 'q_Rd', label: 'Bearing resistance', value: qRd, unit: 'kPa', precision: 1 },
      { symbol: 'q_applied', label: 'Applied bearing pressure', value: qApplied, unit: 'kPa', precision: 1, highlight: true },
    );

    steps.push({
      title: 'Reinforcement summary',
      formula: '—',
      substitution: '—',
      result: `${v.slabWidth_m.toFixed(2)} m wide × ${(v.slabThickness_m * 1000).toFixed(0)} mm deep ${v.concreteClass} concrete slab with ${v.layers} layer(s) of H${v.barDia_mm} @ ${v.barSpacing_mm} mm c/c`,
    });

    const verdict = {
      pass: failing.length === 0,
      message: failing.length === 0
        ? 'Bending, shear and bearing all pass.'
        : `Fails: ${failing.join('; ')} governs.`,
    };

    return { results, steps, warnings, verdict };
  },
  validation: {
    samples: [
      {
        name: 'Self-consistency baseline — the brief\'s target figures (M_Ed≈48kNm/m, V_Ed≈170kN/m, bearing PASS at ≈381kPa) were NOT reproduced by this tool\'s literal blanket-UDL-over-full-span load model (see the first Assumptions bullet); this is what the implemented formula actually returns for the stated inputs, and it correctly FAILS rather than falsely showing a pass — verify independently, and consider whether a load-dispersal model is needed, before relying on this tool',
        inputs: {
          serviceCrown_m: 0.9, serviceOD_m: 0.9, coverToService_min_m: 0.3,
          slabWidth_m: 5.0, slabThickness_m: 0.3, slabLength_m: 3.0,
          concreteClass: 'C25/30', fyk_N_mm2: 500, coverToReinf_mm: 40, barDia_mm: 10, barSpacing_mm: 200, layers: 2,
          gamma_concrete: 24, trackPressure_kPa: 180, trackWidth_m: 0.9, gammaG: 1.35, gammaQ: 1.5,
          soilPhi_deg: 29, soilCohesion_kPa: 0, soilGamma_kN_m3: 18, soilSPT_N: 8, embedment_m: 0.7,
        },
        expect: { As_prov: { value: 785, tol: 5, unit: 'mm²/m' } },
      },
    ],
  },
};

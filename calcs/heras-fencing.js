// heras-fencing.js — Heras (lightweight open-mesh) temporary fencing:
// wind force per panel and overturning/sliding stability of the rubber-
// footed base. `qp_kPa` can be typed in directly or piped in from the
// Wind Pressure calc (js/pipe.js) via the "Use output from..." link.

export default {
  id: 'heras-fencing',
  title: 'Heras Fencing — Wind Load & Stability',
  category: 'Temporary Works — Site Fencing',
  tag: 'TWf2024:01',
  version: '1.0.0',
  references: [
    'BS EN 1991-1-4:2005+A1:2010 — Wind actions',
    'TWf2024:01 — Lightweight temporary open mesh fencing: design considerations',
    'BS 5975:2019 §6.4 — Temporary works procedures',
  ],
  description: 'Wind force on a run of Heras (open mesh) fence panels from qp(z), and the overturning and sliding stability of the standard rubber-footed base, with required additional ballast where the base alone doesn\'t pass.',
  assumptions: [
    'Checked per panel, on its own pair of feet — a coupled run (see the couplers input) should additionally be assessed as a system per BS 5975 §6.4; this calc does not model panel-to-panel load sharing.',
    'Overturning is checked about the downwind foot edge; sliding uses a single feet-to-ground friction coefficient.',
    'The end-effect factor (eta) is applied multiplicatively alongside cf and cscd on the wind force — a standard aspect-ratio-type correction, defaulting to 1.0 (no reduction).',
    'Ballast mass is assumed to act at the same lever arm as the feet self-weight (feetLength/2) — kerbs/blocks placed centrally on the feet.',
  ],
  inputs: [
    { name: 'qp_kPa', label: 'Peak velocity pressure qp(z)', type: 'number', unit: 'kPa', default: 0.2, min: 0, step: 0.01,
      pipeFrom: 'wind-pressure-ec1',
      help: 'Enter directly, or use the link below to pull qp(z) from the Wind Pressure calc.' },
    { name: 'fenceLength', label: 'Panel length', type: 'number', unit: 'm', default: 3.45, min: 0.5, step: 0.05 },
    { name: 'fenceHeight', label: 'Panel height', type: 'number', unit: 'm', default: 2.0, min: 0.5, step: 0.1 },
    { name: 'fenceMass_kg', label: 'Panel mass', type: 'number', unit: 'kg', default: 17, min: 1, step: 0.5 },
    { name: 'feetLength', label: 'Foot length', type: 'number', unit: 'm', default: 0.75, min: 0.2, step: 0.05 },
    { name: 'feetHeight', label: 'Foot height', type: 'number', unit: 'm', default: 0.135, min: 0.02, step: 0.005 },
    { name: 'feetMass_kg', label: 'Mass per foot', type: 'number', unit: 'kg', default: 18, min: 1, step: 0.5 },
    { name: 'feetPerPanel', label: 'Feet per panel', type: 'number', default: 2, min: 1, step: 1 },
    { name: 'solidityRatio_phi', label: 'Solidity ratio φ', type: 'number', default: 0.20, min: 0.05, max: 1, step: 0.01,
      help: 'Proportion of the panel that blocks wind (1.0 = solid hoarding basis).' },
    { name: 'cf', label: 'Force coefficient cf', type: 'number', default: 1.2, min: 0.5, step: 0.05 },
    { name: 'cscd', label: 'Structural factor CsCd', type: 'number', default: 0.96, min: 0.5, max: 1.2, step: 0.01 },
    { name: 'eta', label: 'End-effect factor η', type: 'number', default: 1.0, min: 0.5, max: 1.0, step: 0.01 },
    { name: 'couplers', label: 'Panels coupled together', type: 'select', options: ['No', 'Yes'], default: 'No' },
    { name: 'ballastKerbs', label: 'Ballast kerbs/blocks on feet', type: 'select', options: ['No', 'Yes'], default: 'No' },
    { name: 'ballastMass_kg_per_panel', label: 'Ballast mass', type: 'number', unit: 'kg', default: 0, min: 0, step: 1,
      showIf: (v) => v.ballastKerbs === 'Yes' },
    { name: 'frictionCoeff_mu', label: 'Feet-to-ground friction μ', type: 'number', default: 0.5, min: 0.1, max: 1, step: 0.05 },
  ],
  calculate: (v) => {
    const results = [];
    const steps = [];
    const warnings = [];

    if (v.solidityRatio_phi > 0.4) {
      warnings.push(`Solidity ratio φ = ${v.solidityRatio_phi} is above 0.4 — this is closer to a solid hoarding than open mesh fencing; use a hoarding-specific cf, not the open-mesh value.`);
    }
    if (v.couplers === 'Yes') {
      warnings.push('Panels are coupled into a run — this calc checks one panel in isolation; the coupled run must additionally be assessed as a system per BS 5975 §6.4.');
    }

    const Aref = v.fenceLength * v.fenceHeight * v.solidityRatio_phi;
    steps.push({
      title: 'Reference area',
      formula: 'Aref = fenceLength × fenceHeight × φ',
      substitution: `Aref = ${v.fenceLength}×${v.fenceHeight}×${v.solidityRatio_phi}`,
      result: `Aref = ${Aref.toFixed(3)} m²`,
    });

    const Fw = v.cscd * v.cf * v.eta * v.qp_kPa * Aref;
    steps.push({
      title: 'Wind force per panel',
      formula: 'Fw = CsCd × cf × η × qp × Aref',
      substitution: `Fw = ${v.cscd}×${v.cf}×${v.eta}×${v.qp_kPa}×${Aref.toFixed(3)}`,
      result: `Fw = ${Fw.toFixed(3)} kN`,
    });

    const MOT = Fw * (v.fenceHeight / 2 + v.feetHeight);
    steps.push({
      title: 'Overturning moment',
      formula: 'M_OT = Fw × (fenceHeight/2 + feetHeight)',
      substitution: `M_OT = ${Fw.toFixed(3)}×(${v.fenceHeight}/2 + ${v.feetHeight})`,
      result: `M_OT = ${MOT.toFixed(3)} kNm`,
    });

    const ballast = v.ballastKerbs === 'Yes' ? (v.ballastMass_kg_per_panel || 0) : 0;
    const Wtotal = ((v.fenceMass_kg + v.feetPerPanel * v.feetMass_kg + ballast) * 9.81) / 1000;
    const MR = Wtotal * (v.feetLength / 2);
    steps.push({
      title: 'Restoring weight and moment',
      formula: 'W = (fenceMass + feetPerPanel×feetMass + ballast)×9.81/1000;  M_R = W × feetLength/2',
      substitution: `W = (${v.fenceMass_kg} + ${v.feetPerPanel}×${v.feetMass_kg} + ${ballast})×9.81/1000`,
      result: `W = ${Wtotal.toFixed(3)} kN, M_R = ${MR.toFixed(3)} kNm`,
    });

    const FoS_OT = MR / MOT;
    const FoS_S = (v.frictionCoeff_mu * Wtotal) / Fw;
    steps.push({
      title: 'Stability factors of safety',
      formula: 'FoS_OT = M_R/M_OT ≥ 1.5;  FoS_S = μ·W/Fw ≥ 1.5',
      substitution: `FoS_OT = ${MR.toFixed(3)}/${MOT.toFixed(3)}; FoS_S = ${v.frictionCoeff_mu}×${Wtotal.toFixed(3)}/${Fw.toFixed(3)}`,
      result: `FoS_OT = ${FoS_OT.toFixed(2)}, FoS_S = ${FoS_S.toFixed(2)}`,
    });

    const pass = FoS_OT >= 1.5 && FoS_S >= 1.5;
    let extraBallast = 0;
    if (!pass) {
      const WreqOT = (1.5 * MOT) / (v.feetLength / 2);
      const WreqS = (1.5 * Fw) / v.frictionCoeff_mu;
      const Wreq = Math.max(WreqOT, WreqS);
      const deltaW = Math.max(0, Wreq - Wtotal);
      extraBallast = (deltaW * 1000) / 9.81;
      steps.push({
        title: 'Additional ballast required',
        formula: 'W_req = max(1.5·M_OT/(feetLength/2), 1.5·Fw/μ);  Δmass = (W_req − W)×1000/9.81',
        substitution: `W_req = max(${WreqOT.toFixed(3)}, ${WreqS.toFixed(3)}) = ${Wreq.toFixed(3)}`,
        result: `Additional ballast = ${extraBallast.toFixed(0)} kg per panel`,
      });
      if (extraBallast > 200) {
        warnings.push(`Required additional ballast (${extraBallast.toFixed(0)} kg per panel) is impractically high — consider ground anchoring, shorter free-standing runs, or a heavier-duty barrier system instead.`);
      }
    }

    results.push(
      { symbol: 'Fw', label: 'Wind force per panel', value: Fw, unit: 'kN', precision: 3 },
      { symbol: 'FoS_OT', label: 'Factor of safety — overturning', value: FoS_OT, unit: '', precision: 2, highlight: true },
      { symbol: 'FoS_S', label: 'Factor of safety — sliding', value: FoS_S, unit: '', precision: 2 },
    );
    if (!pass) {
      results.push({ symbol: 'extraBallast', label: 'Additional ballast required', value: extraBallast, unit: 'kg/panel', precision: 0 });
    }

    const verdict = {
      pass,
      message: pass
        ? `Both stability checks pass (FoS_OT = ${FoS_OT.toFixed(2)}, FoS_S = ${FoS_S.toFixed(2)}).`
        : `Fails without additional ballast (FoS_OT = ${FoS_OT.toFixed(2)}, FoS_S = ${FoS_S.toFixed(2)}, both need ≥ 1.5) — add ≈ ${extraBallast.toFixed(0)} kg of ballast per panel.`,
    };

    return { results, steps, warnings, verdict };
  },
  validation: {
    samples: [
      {
        name: 'BB Heras spreadsheet defaults, φ = 1.0 "as configured" per the build brief (gross panel area basis, not the 0.20 open-mesh default) — Fw reproduced to 3 s.f.; FoS not independently cross-checked against BB\'s own output — verify independently before relying on this tool',
        inputs: {
          qp_kPa: 0.197, fenceLength: 3.45, fenceHeight: 2, fenceMass_kg: 17,
          feetLength: 0.75, feetHeight: 0.135, feetMass_kg: 18, feetPerPanel: 2,
          solidityRatio_phi: 1.0, cf: 1.2, cscd: 0.96, eta: 1.0,
          couplers: 'No', ballastKerbs: 'No', ballastMass_kg_per_panel: 0, frictionCoeff_mu: 0.5,
        },
        expect: { Fw: { value: 1.57, tol: 0.05, unit: 'kN' } },
      },
    ],
  },
};

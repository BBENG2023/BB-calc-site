// piling-mat-bre470.js — Piling mat design to BRE 470 (2004), Working
// platforms for tracked plant. Punching-shear-through-platform failure
// onto the subgrade, checked for both the bearing (case 1) and
// travelling (case 2) track loading conditions of the piling rig.
// See crane-pad-bre470.js for the same method applied to a crane —
// js/bre470-platform.js holds the shared computation for both.

import { svg, soilHatchDef, line, rect, text, hDimension, vDimension, clamp, pilingRigSilhouette } from '../js/diagrams.js';
import { computeBre470Platform, BRE470_REFERENCES, BRE470_ASSUMPTIONS, BRE470_INPUTS } from '../js/bre470-platform.js';

function diagram(v, output) {
  const T = output?.T_required ?? 300;
  const W = v.W_track || 2.8;
  const groundY = 190;
  const k = clamp(140 / W, 20, 70);
  const trackWidthPx = clamp(W * k, 70, 230);
  const Tpx = clamp((T / 1000) * 220, 12, 70);
  const platformTopY = groundY - Tpx;
  const cx = 200;

  let inner = '';
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" style="fill:var(--bb-primary-100)" />`;
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" fill="url(#pm-hatch)" />`;
  inner += line(10, groundY, 390, groundY, { color: 'var(--bb-primary)', width: 1.5 });
  inner += text(14, groundY + 16, 'SUBGRADE', { size: 8, weight: 700, color: 'var(--bb-primary-500)', anchor: 'start', ls: '0.05em' });

  inner += rect(cx - 140, platformTopY, 280, Tpx, { fill: 'var(--bb-primary-300)', stroke: 'var(--bb-primary-700)' });
  inner += text(cx, platformTopY - 6, 'PLATFORM', { size: 8, weight: 700, color: 'var(--bb-primary-700)', ls: '0.05em' });

  const mastHeightPx = clamp((v.rigMastHeight_m || 15) * 8, 70, 180);
  inner += pilingRigSilhouette(cx, platformTopY, { trackWidthPx, mastHeightPx });

  inner += hDimension(cx - trackWidthPx / 2, cx + trackWidthPx / 2, platformTopY + Tpx + 42, `W = ${W} m`, { extendFromY: platformTopY + Tpx });
  inner += vDimension(cx - 150, platformTopY, groundY, `T = ${T} mm`, { extendToX: cx - 140 });

  if (v.rigDescription) {
    inner += text(cx, 18, v.rigDescription, { size: 10, weight: 800, color: 'var(--bb-primary-700)' });
  }

  return svg('0 0 400 300', inner, soilHatchDef('pm-hatch'));
}

export default {
  id: 'piling-mat-bre470',
  title: 'Piling Mat Design to BRE 470',
  category: 'Temporary Works — Working Platforms',
  tag: 'BRE 470',
  version: '1.1.0',
  references: [...BRE470_REFERENCES],
  description: 'Punching-shear check of a granular piling mat over a cohesive or granular subgrade under a tracked piling rig, for both the bearing (case 1) and travelling (case 2) load conditions, with required mat thickness where one is needed.',
  assumptions: [
    ...BRE470_ASSUMPTIONS,
    'Rig mast height and description are for identification and the diagram only — the actual load applied to the mat is set entirely by the track pressure and track geometry inputs below, so enter those from the specific rig\'s data sheet.',
  ],
  inputs: [
    { name: 'rigDescription', label: 'Piling rig make/model', type: 'text', default: '', placeholder: 'e.g. CZ85 rotary piling rig',
      help: 'Shown on the diagram and the printed calc sheet — identifies which rig this check was run against.' },
    { name: 'rigMass_t', label: 'Rig operating mass', type: 'number', unit: 't', default: 85, min: 1, step: 1,
      help: 'For reporting/reference only — not used directly in the punching-shear calculation.' },
    { name: 'rigMastHeight_m', label: 'Mast/leader height (diagram only)', type: 'number', unit: 'm', default: 15, min: 3, max: 40, step: 0.5 },
    ...BRE470_INPUTS,
  ],
  diagram,
  calculate: (v) => computeBre470Platform(v),
  validation: {
    samples: [
      {
        name: 'Brief\'s worked figures — Rd,subgrade case 1 and q,design(no platform) case 1 confirmed by hand; T not independently cross-checked against "the Geotech Bible" (not available) — verify independently before relying on this tool',
        inputs: {
          rigDescription: 'CZ85 rotary piling rig', rigMass_t: 85, rigMastHeight_m: 15,
          subgradeType: 'Cohesive', cu_subgrade: 25, phi_platform: 40, gamma_platform: 20,
          q_case1: 185, q_case2: 185, W_track: 2.8, L_case1: 3.8, L_case2: 5.0,
        },
        expect: {
          Rd_subgrade_case1: { value: 147.4, tol: 1, unit: 'kPa' },
          T_required: { value: 600, tol: 100, unit: 'mm' },
        },
      },
    ],
  },
};

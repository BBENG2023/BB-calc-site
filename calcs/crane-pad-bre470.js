// crane-pad-bre470.js — Crane pad design to BRE 470 (2004), Working
// platforms for tracked plant. Punching-shear-through-platform failure
// onto the subgrade, checked for both the bearing (case 1, crane set up
// and lifting) and travelling (case 2) track loading conditions.
// See piling-mat-bre470.js for the same method applied to a piling rig —
// js/bre470-platform.js holds the shared computation for both.

import { svg, soilHatchDef, line, rect, text, hDimension, vDimension, clamp, craneSilhouette } from '../js/diagrams.js';
import { computeBre470Platform, BRE470_REFERENCES, BRE470_ASSUMPTIONS, BRE470_INPUTS } from '../js/bre470-platform.js';

function diagram(v, output) {
  const T = output?.T_required ?? 300;
  const W = v.W_track || 3.0;
  const groundY = 190;
  const k = clamp(120 / W, 20, 65);
  const trackWidthPx = clamp(W * k, 70, 220);
  const Tpx = clamp((T / 1000) * 220, 12, 70);
  const platformTopY = groundY - Tpx;
  const cx = 170;

  let inner = '';
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" style="fill:var(--bb-primary-100)" />`;
  inner += `<rect x="10" y="${groundY}" width="380" height="${300 - groundY}" fill="url(#cp-hatch)" />`;
  inner += line(10, groundY, 390, groundY, { color: 'var(--bb-primary)', width: 1.5 });
  inner += text(14, groundY + 16, 'SUBGRADE', { size: 8, weight: 700, color: 'var(--bb-primary-500)', anchor: 'start', ls: '0.05em' });

  inner += rect(cx - 130, platformTopY, 260, Tpx, { fill: 'var(--bb-primary-300)', stroke: 'var(--bb-primary-700)' });
  inner += text(cx, platformTopY - 6, 'PLATFORM', { size: 8, weight: 700, color: 'var(--bb-primary-700)', ls: '0.05em' });

  const boomLengthPx = clamp((v.boomLength_m || 30) * 2.2, 40, 90);
  inner += craneSilhouette(cx, platformTopY, { trackWidthPx, boomAngleDeg: v.boomAngle_deg || 60, boomLengthPx });

  inner += hDimension(cx - trackWidthPx / 2, cx + trackWidthPx / 2, platformTopY + Tpx + 42, `W = ${W} m`, { extendFromY: platformTopY + Tpx });
  inner += vDimension(cx - 140, platformTopY, groundY, `T = ${T} mm`, { extendToX: cx - 130 });

  if (v.craneDescription) {
    inner += text(cx, 18, v.craneDescription, { size: 10, weight: 800, color: 'var(--bb-primary-700)' });
  }

  return svg('0 0 400 300', inner, soilHatchDef('cp-hatch'));
}

export default {
  id: 'crane-pad-bre470',
  title: 'Crane Pad Design to BRE 470',
  category: 'Temporary Works — Working Platforms',
  tag: 'BRE 470',
  version: '1.0.0',
  references: [...BRE470_REFERENCES],
  description: 'Punching-shear check of a granular crane pad over a cohesive or granular subgrade under a tracked mobile crane, for both the bearing (case 1, set up and lifting) and travelling (case 2) load conditions, with required pad thickness where one is needed.',
  assumptions: [
    ...BRE470_ASSUMPTIONS,
    'Crane capacity, boom length and boom angle are for identification and the diagram only — the actual load applied to the pad is set entirely by the track pressure and track geometry inputs below, which should come from the specific crane\'s outrigger/track load chart for the lift in question, not from its rated capacity directly.',
  ],
  inputs: [
    { name: 'craneDescription', label: 'Crane make/model', type: 'text', default: '', placeholder: 'e.g. Liebherr LTM 1200-5.1',
      help: 'Shown on the diagram and the printed calc sheet — identifies which crane this check was run against.' },
    { name: 'craneCapacity_t', label: 'Rated capacity (SWL)', type: 'number', unit: 't', default: 200, min: 1, step: 5,
      help: 'For reporting/reference only — confirm the actual track pressure for the lift from the crane\'s load chart.' },
    { name: 'boomLength_m', label: 'Boom length (diagram only)', type: 'number', unit: 'm', default: 30, min: 5, max: 80, step: 1 },
    { name: 'boomAngle_deg', label: 'Boom angle from horizontal (diagram only)', type: 'number', unit: '°', default: 60, min: 20, max: 85, step: 1 },
    ...BRE470_INPUTS,
  ],
  diagram,
  calculate: (v) => computeBre470Platform(v),
  validation: {
    samples: [
      {
        name: 'Same BRE 470 method and figures as piling-mat-bre470.js\'s validation sample (shared computation) — verify independently before relying on this tool',
        inputs: {
          craneDescription: 'Liebherr LTM 1200-5.1', craneCapacity_t: 200, boomLength_m: 30, boomAngle_deg: 60,
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

// diagrams.js — small SVG-building helpers shared by a calc's optional
// `diagram(values, output)` renderer (see CONTRIBUTING.md). A diagram
// function returns a plain SVG markup string; it is injected via
// innerHTML into both the live "Definition diagram" panel (main.js) and
// the printed report's Method & Assumptions section (report.js), so it
// only has to be built once per calc.
//
// Diagrams reference the site's CSS custom properties via inline style
// (e.g. style="fill:var(--bb-primary)") rather than hard-coded hex, so
// they stay on-brand for free if the tokens in base.css ever change, and
// print in the same navy/orange/ink as the rest of the sheet.
//
// These are schematic, proportionally-clamped diagrams — a visual aid for
// checking the geometry makes sense at a glance, not a scaled drawing.
// That scope note is deliberate: a true to-scale CAD-quality figure is
// beyond what this toolkit's schematic diagrams are meant to provide, and every diagram
// carries a caption saying so.

export function svg(viewBox, inner, extraDefs = '') {
  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style="display:block">
    ${extraDefs ? `<defs>${extraDefs}</defs>` : ''}
    ${inner}
  </svg>`;
}

export function soilHatchDef(id, color = 'var(--bb-primary-300)') {
  return `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="9" style="stroke:${color};stroke-width:1" />
  </pattern>`;
}

export function line(x1, y1, x2, y2, opts = {}) {
  const { color = 'var(--bb-ink)', width = 1.2, dash } = opts;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${color};stroke-width:${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
}

export function rect(x, y, w, h, opts = {}) {
  const { fill = 'none', stroke = 'var(--bb-ink)', width = 1.2 } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:${fill};stroke:${stroke};stroke-width:${width}" />`;
}

export function text(x, y, str, opts = {}) {
  const { size = 11, weight = 700, color = 'var(--bb-ink)', anchor = 'middle', rotate, ls } = opts;
  const t = rotate !== undefined ? ` transform="rotate(${rotate} ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" font-family="Archivo, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ''} style="fill:${color}"${t}>${str}</text>`;
}

// Arrowhead triangle whose tip sits at (x, y); dir picks which way it
// points ('up' | 'down' | 'left' | 'right').
export function arrowHead(x, y, dir = 'up', opts = {}) {
  const { size = 6, color = 'var(--bb-accent)' } = opts;
  let pts;
  if (dir === 'up') pts = `${x - size},${y + size * 1.6} ${x + size},${y + size * 1.6} ${x},${y}`;
  else if (dir === 'down') pts = `${x - size},${y - size * 1.6} ${x + size},${y - size * 1.6} ${x},${y}`;
  else if (dir === 'left') pts = `${x + size * 1.6},${y - size} ${x + size * 1.6},${y + size} ${x},${y}`;
  else pts = `${x - size * 1.6},${y - size} ${x - size * 1.6},${y + size} ${x},${y}`;
  return `<polygon points="${pts}" style="fill:${color}" />`;
}

// Horizontal dimension line (ticks at each end, optional dashed
// extension lines up to the referenced geometry, label centred below).
export function hDimension(xLeft, xRight, y, label, opts = {}) {
  const { tick = 5, color = 'var(--bb-ink)', extendFromY, labelBelow = true } = opts;
  let out = line(xLeft, y, xRight, y, { color, width: 1.2 })
    + line(xLeft, y - tick, xLeft, y + tick, { color, width: 1.2 })
    + line(xRight, y - tick, xRight, y + tick, { color, width: 1.2 });
  if (extendFromY !== undefined) {
    out += line(xLeft, extendFromY, xLeft, y, { color, width: 0.8, dash: '3 3' });
    out += line(xRight, extendFromY, xRight, y, { color, width: 0.8, dash: '3 3' });
  }
  out += text((xLeft + xRight) / 2, labelBelow ? y + 16 : y - 8, label, { size: 11, weight: 700, color });
  return out;
}

// Vertical dimension line (ticks at each end, optional dashed extension
// lines out to the referenced geometry, label rotated alongside).
export function vDimension(x, yTop, yBottom, label, opts = {}) {
  const { tick = 5, color = 'var(--bb-ink)', extendToX, labelLeft = true } = opts;
  let out = line(x, yTop, x, yBottom, { color, width: 1.2 })
    + line(x - tick, yTop, x + tick, yTop, { color, width: 1.2 })
    + line(x - tick, yBottom, x + tick, yBottom, { color, width: 1.2 });
  if (extendToX !== undefined) {
    out += line(extendToX, yTop, x, yTop, { color, width: 0.8, dash: '3 3' });
    out += line(extendToX, yBottom, x, yBottom, { color, width: 0.8, dash: '3 3' });
  }
  const lx = labelLeft ? x - 10 : x + 10;
  out += text(lx, (yTop + yBottom) / 2, label, { size: 11, weight: 700, color, rotate: -90 });
  return out;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- Plant silhouettes (schematic, not to scale) -----------------------
// Shared by piling-mat-bre470.js and crane-pad-bre470.js so the two
// calcs' diagrams read as clearly different pieces of plant sitting on
// the same platform build-up. `baseX` is the plant's centreline, `baseY`
// the level it stands on (top of platform / ground line).

// Schematic crawler crane: tracks, carrier, counterweight/cab, and a
// boom at `boomAngleDeg` from horizontal, `boomLengthPx` long, with a
// hook at the tip.
export function craneSilhouette(baseX, baseY, opts = {}) {
  const {
    trackWidthPx = 90, carrierHeightPx = 26, cabWidthPx = 34, cabHeightPx = 30,
    boomAngleDeg = 60, boomLengthPx = 140,
    color = 'var(--bb-primary)', accent = 'var(--bb-primary-700)',
  } = opts;
  const left = baseX - trackWidthPx / 2;
  const carrierTopY = baseY - carrierHeightPx;

  let out = '';
  out += rect(left, baseY - 10, trackWidthPx, 10, { fill: color, stroke: 'var(--bb-primary-900)' });
  out += rect(left + 6, carrierTopY, trackWidthPx - 12, carrierHeightPx - 10, { fill: color, stroke: 'var(--bb-primary-900)' });
  out += rect(left + trackWidthPx - cabWidthPx - 4, carrierTopY - cabHeightPx + 10, cabWidthPx, cabHeightPx, { fill: accent, stroke: 'var(--bb-primary-900)' });

  const pivotX = left + 14;
  const pivotY = carrierTopY + 4;
  const rad = (boomAngleDeg * Math.PI) / 180;
  const tipX = pivotX + boomLengthPx * Math.cos(rad);
  const tipY = pivotY - boomLengthPx * Math.sin(rad);
  out += line(pivotX, pivotY, tipX, tipY, { color: accent, width: 3 });
  out += line(tipX, tipY, tipX, tipY + 14, { color: accent, width: 1.5 });
  out += `<circle cx="${tipX}" cy="${tipY + 18}" r="3" style="fill:none;stroke:${accent};stroke-width:1.5" />`;
  return out;
}

// Schematic piling rig: tracks, carrier, a vertical mast/leader with a
// rig head partway up, and a kelly-bar/auger stub running to ground.
export function pilingRigSilhouette(baseX, baseY, opts = {}) {
  const {
    trackWidthPx = 90, carrierHeightPx = 26, mastHeightPx = 160, mastWidthPx = 10,
    color = 'var(--bb-primary)', accent = 'var(--bb-primary-700)',
  } = opts;
  const left = baseX - trackWidthPx / 2;
  const carrierTopY = baseY - carrierHeightPx;

  let out = '';
  out += rect(left, baseY - 10, trackWidthPx, 10, { fill: color, stroke: 'var(--bb-primary-900)' });
  out += rect(left + 6, carrierTopY, trackWidthPx - 12, carrierHeightPx - 10, { fill: color, stroke: 'var(--bb-primary-900)' });

  const mastX = baseX - mastWidthPx / 2 + trackWidthPx * 0.12;
  const mastTopY = carrierTopY - mastHeightPx;
  out += rect(mastX, mastTopY, mastWidthPx, mastHeightPx, { fill: accent, stroke: 'var(--bb-primary-900)' });
  const headY = carrierTopY - mastHeightPx * 0.72;
  out += rect(mastX - 7, headY, mastWidthPx + 14, 14, { fill: 'var(--bb-accent)', stroke: 'var(--bb-primary-900)' });
  out += line(mastX + mastWidthPx / 2, headY + 14, mastX + mastWidthPx / 2, baseY, { color: accent, width: 2, dash: '2 2' });
  return out;
}

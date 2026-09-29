// svg-kit.js — SVG helpers for scaled engineering drawings (print-safe:
// materials are distinguished by hatch pattern and label, never by colour
// alone). Complements js/diagrams.js, which is for small schematic figures.

import { escapeHtml } from './formatters.js';

const f = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

// World-to-screen mapping. World y is up (levels); screen y is down.
export function makeView(bounds, { width = 800, height = 500, pad = 40, padTop, padBottom, exaggeration = 1 } = {}) {
  const pt = padTop ?? pad, pb = padBottom ?? pad;
  const wx = Math.max(bounds.x1 - bounds.x0, 1e-6);
  const wy = Math.max((bounds.y1 - bounds.y0) * exaggeration, 1e-6);
  const s = Math.min((width - 2 * pad) / wx, (height - pt - pb) / wy);
  const ox = pad + ((width - 2 * pad) - wx * s) / 2;
  const oy = pt + ((height - pt - pb) - wy * s) / 2;
  return {
    width, height, scale: s, exaggeration,
    X: (x) => ox + (x - bounds.x0) * s,
    Y: (y) => oy + (bounds.y1 - y) * exaggeration * s,
    L: (d) => d * s,
    LY: (d) => d * s * exaggeration,
  };
}

// Each document gets its own pattern ids: inline SVGs share one id space,
// and a pattern defined inside a hidden SVG (e.g. a panel hidden in print)
// would otherwise render blank everywhere else.
let docSeq = 0;
export function svgDoc(width, height, inner, { defs = '', title = '', className = '' } = {}) {
  const uid = `d${(docSeq++).toString(36)}`;
  const body = `${title ? `<title>${escapeHtml(title)}</title>` : ''}<defs>${hatchDefs()}${defs}</defs>${inner}`.replace(/hk-/g, `hk${uid}-`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" class="${className}" role="img" style="display:block;background:#fff">${body}</svg>`;
}

// Hatch patterns keyed by material. Each is visually distinct in monochrome.
export const HATCH = {
  granular: 'hk-granular', cohesive: 'hk-cohesive', madeGround: 'hk-made', peat: 'hk-peat', topsoil: 'hk-topsoil',
  rock: 'hk-rock', type1: 'hk-type1', concrete: 'hk-concrete', fill: 'hk-fill', water: 'hk-water',
};

export function hatchDefs() {
  const P = (id, w, h, body, rot = 0) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${rot ? ` patternTransform="rotate(${rot})"` : ''}>${body}</pattern>`;
  return [
    P(HATCH.granular, 8, 8, '<rect width="8" height="8" fill="#f6efd9"/><circle cx="2" cy="2" r="0.9" fill="#7a6a3a"/><circle cx="6" cy="6" r="0.9" fill="#7a6a3a"/>'),
    P(HATCH.cohesive, 8, 8, '<rect width="8" height="8" fill="#e9e2d6"/><line x1="0" y1="4" x2="8" y2="4" stroke="#6b5a45" stroke-width="0.8"/>'),
    P(HATCH.madeGround, 10, 10, '<rect width="10" height="10" fill="#ece8e4"/><path d="M0 10 L10 0 M-2 2 L2 -2 M8 12 L12 8" stroke="#6b6b6b" stroke-width="0.8"/><rect x="5" y="6" width="2" height="2" fill="#6b6b6b"/>'),
    P(HATCH.peat, 10, 6, '<rect width="10" height="6" fill="#d9d0c3"/><path d="M0 3 q2.5 -3 5 0 t5 0" fill="none" stroke="#4a3b2a" stroke-width="0.8"/>'),
    P(HATCH.topsoil, 10, 8, '<rect width="10" height="8" fill="#dfe6d2"/><path d="M1 7 l2 -4 l2 4 M6 7 l2 -4 l2 4" fill="none" stroke="#51613a" stroke-width="0.7"/>'),
    P(HATCH.rock, 12, 8, '<rect width="12" height="8" fill="#e3e3e8"/><path d="M0 0 H12 M0 8 H12 M6 0 V4 M0 4 H12 M3 4 V8 M9 4 V8" stroke="#555" stroke-width="0.7" fill="none"/>'),
    P(HATCH.type1, 6, 6, '<rect width="6" height="6" fill="#efe9dc"/><circle cx="1.5" cy="1.5" r="0.7" fill="#5e5e5e"/><circle cx="4.5" cy="4.5" r="1.1" fill="none" stroke="#5e5e5e" stroke-width="0.5"/>'),
    P(HATCH.concrete, 10, 10, '<rect width="10" height="10" fill="#ededed"/><path d="M1 2 l2 1 l-1.5 1 z M6 6 l2 1 l-1.5 1 z" fill="#8a8a8a"/><circle cx="7" cy="2" r="0.7" fill="#8a8a8a"/>'),
    P(HATCH.fill, 8, 8, '<rect width="8" height="8" fill="#f3eee4"/><line x1="0" y1="8" x2="8" y2="0" stroke="#9a8c70" stroke-width="0.6"/>', 0),
    P(HATCH.water, 12, 6, '<rect width="12" height="6" fill="#dcecf7"/><path d="M0 3 q3 -2 6 0 t6 0" fill="none" stroke="#3a78a8" stroke-width="0.6"/>'),
  ].join('');
}

export function line(x1, y1, x2, y2, { stroke = '#1A1E28', width = 1, dash, opacity } = {}) {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity ? ` opacity="${opacity}"` : ''}/>`;
}

export function polyline(pts, { stroke = '#1A1E28', width = 1, dash, fill = 'none' } = {}) {
  return `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function polygon(pts, { fill = 'none', stroke = '#1A1E28', width = 1, opacity, dash } = {}) {
  return `<polygon points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${opacity ? ` fill-opacity="${opacity}"` : ''}${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function rect(x, y, w, h, { fill = 'none', stroke = '#1A1E28', width = 1, opacity, title } = {}) {
  const x0 = Math.min(x, x + w), y0 = Math.min(y, y + h);
  const body = `<rect x="${f(x0)}" y="${f(y0)}" width="${f(Math.abs(w))}" height="${f(Math.abs(h))}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${opacity ? ` fill-opacity="${opacity}"` : ''}`;
  return title ? `${body}><title>${escapeHtml(title)}</title></rect>` : `${body}/>`;
}

export function circle(cx, cy, r, { fill = 'none', stroke = '#1A1E28', width = 1, dash } = {}) {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function path(d, { fill = 'none', stroke = '#1A1E28', width = 1, dash } = {}) {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function text(x, y, str, { size = 10, weight = 400, fill = '#1A1E28', anchor = 'start', rotate, baseline, italic } = {}) {
  const t = rotate !== undefined ? ` transform="rotate(${rotate} ${f(x)} ${f(y)})"` : '';
  return `<text x="${f(x)}" y="${f(y)}" font-family="Archivo, Calibri, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${baseline ? ` dominant-baseline="${baseline}"` : ''}${italic ? ' font-style="italic"' : ''}${t}>${escapeHtml(str)}</text>`;
}

// Arrow from (x1,y1) to (x2,y2) with a head at the end.
export function arrow(x1, y1, x2, y2, { stroke = '#E27A00', width = 1.5, head = 6 } = {}) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx1 = x2 - head * Math.cos(a - 0.4), hy1 = y2 - head * Math.sin(a - 0.4);
  const hx2 = x2 - head * Math.cos(a + 0.4), hy2 = y2 - head * Math.sin(a + 0.4);
  return line(x1, y1, x2, y2, { stroke, width }) + polygon([[x2, y2], [hx1, hy1], [hx2, hy2]], { fill: stroke, stroke, width: 0.5 });
}

export function dimH(x1, x2, y, label, { stroke = '#1A1E28', size = 9, above = true, ext } = {}) {
  let out = line(x1, y, x2, y, { stroke, width: 0.7 })
    + line(x1 - 3, y + 3, x1 + 3, y - 3, { stroke, width: 0.9 })
    + line(x2 - 3, y + 3, x2 + 3, y - 3, { stroke, width: 0.9 });
  if (ext !== undefined) out += line(x1, ext, x1, y, { stroke, width: 0.5, dash: '2 2' }) + line(x2, ext, x2, y, { stroke, width: 0.5, dash: '2 2' });
  out += text((x1 + x2) / 2, above ? y - 3 : y + size + 2, label, { size, anchor: 'middle', fill: stroke });
  return out;
}

export function dimV(x, y1, y2, label, { stroke = '#1A1E28', size = 9, left = true, ext } = {}) {
  let out = line(x, y1, x, y2, { stroke, width: 0.7 })
    + line(x - 3, y1 + 3, x + 3, y1 - 3, { stroke, width: 0.9 })
    + line(x - 3, y2 + 3, x + 3, y2 - 3, { stroke, width: 0.9 });
  if (ext !== undefined) out += line(ext, y1, x, y1, { stroke, width: 0.5, dash: '2 2' }) + line(ext, y2, x, y2, { stroke, width: 0.5, dash: '2 2' });
  const tx = left ? x - 4 : x + 4;
  out += text(tx, (y1 + y2) / 2, label, { size, anchor: 'middle', fill: stroke, rotate: -90 });
  return out;
}

// Level tag: small triangle on a line with "+101.600" text.
export function levelTag(x, y, level, { label = '', side = 'right', stroke = '#1A1E28', size = 8.5 } = {}) {
  const tri = polygon([[x, y], [x - 4, y - 6], [x + 4, y - 6]], { fill: 'none', stroke, width: 0.8 });
  const t = `${label ? `${label} ` : ''}${Number(level).toFixed(3)}`;
  const tx = side === 'right' ? x + 6 : x - 6;
  return tri + line(x - 6, y, x + 6, y, { stroke, width: 0.8 }) + text(tx, y - 2, t, { size, anchor: side === 'right' ? 'start' : 'end', fill: stroke });
}

// Legend box: items = [{ label, fill, stroke, kind: 'box'|'line', dash }].
export function legend(x, y, items, { cols = 1, colWidth = 150, rowH = 13, size = 8.5, title = 'Legend' } = {}) {
  const rows = Math.ceil(items.length / cols);
  const w = cols * colWidth + 8, h = rows * rowH + 18;
  let out = rect(x, y, w, h, { fill: '#fff', stroke: '#1A1E28', width: 0.6 }) + text(x + 4, y + 11, title, { size: size + 0.5, weight: 700 });
  items.forEach((it, i) => {
    const c = Math.floor(i / rows), r = i % rows;
    const ix = x + 4 + c * colWidth, iy = y + 16 + r * rowH;
    if (it.kind === 'line') out += line(ix, iy + 5, ix + 16, iy + 5, { stroke: it.stroke || '#1A1E28', width: it.width || 1.4, dash: it.dash });
    else out += rect(ix, iy, 16, 9, { fill: it.fill || '#fff', stroke: it.stroke || '#1A1E28', width: 0.6 });
    out += text(ix + 20, iy + 8, it.label, { size });
  });
  return out;
}

// Scale bar in world metres. `view.L` converts metres to px.
export function scaleBar(x, y, view, { metres, label } = {}) {
  const m = metres || niceScaleLength(120 / Math.max(view.scale, 1e-6));
  const w = view.L(m);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += rect(x + (w / 4) * i, y, w / 4, 4, { fill: i % 2 ? '#fff' : '#1A1E28', stroke: '#1A1E28', width: 0.5 });
  }
  out += text(x, y + 13, '0', { size: 8 }) + text(x + w, y + 13, `${m} m`, { size: 8, anchor: 'end' });
  if (label) out += text(x + w + 6, y + 6, label, { size: 8 });
  return out;
}

function niceScaleLength(approx) {
  const steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];
  return steps.reduce((best, s) => (Math.abs(s - approx) < Math.abs(best - approx) ? s : best), 1);
}

// Title strip along the bottom of a drawing.
export function titleStrip(width, height, { title, drawingNo, scaleText, note = 'Schematic — not for construction. Requires CEng review before acceptance.' }) {
  const h = 22, y = height - h;
  return rect(0.5, y, width - 1, h - 0.5, { fill: '#1C2B55', stroke: '#1C2B55' })
    + text(8, y + 14.5, title, { size: 10, weight: 800, fill: '#fff' })
    + text(width / 2, y + 14.5, note, { size: 7.5, fill: '#ccd4e4', anchor: 'middle' })
    + text(width - 8, y + 14.5, `${drawingNo}${scaleText ? ` · ${scaleText}` : ''}`, { size: 8.5, weight: 700, fill: '#f4c179', anchor: 'end' });
}

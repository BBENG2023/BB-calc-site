// formatters.js — number formatting, units, rounding helpers shared by
// the form generator, results panel and printable report.

/**
 * Format a number to a fixed number of decimal places, using tabular
 * digits and a UK-style thousands separator. Returns '—' for
 * null/undefined/NaN so incomplete calcs render cleanly instead of "NaN".
 */
export function fmt(value, precision = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/** Format a value with its unit suffix, e.g. fmtUnit(615.4, 'kPa', 0) -> '615 kPa'. */
export function fmtUnit(value, unit, precision = 2) {
  const s = fmt(value, precision);
  if (s === '—' || !unit) return s;
  return `${s} ${unit}`;
}

/** Round to a fixed number of significant decimal places (plain number, not string). */
export function round(value, precision = 2) {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** precision;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Degrees -> radians. */
export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Radians -> degrees. */
export function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/** Today's date formatted as DD/MM/YYYY (UK convention) for report headers. */
export function todayUK() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Escape a string for safe insertion into innerHTML contexts. */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

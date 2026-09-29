// file-io.js — browser file helpers: JSON design files (with schema version
// and a migration hook), CSV and SVG export via Blob downloads.

export function downloadBlob(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveJSON(filename, obj) {
  downloadBlob(filename, JSON.stringify(obj, null, 2), 'application/json');
}

// Opens a file picker and resolves with the parsed JSON. `migrate(obj)`
// upgrades older schema versions before the caller sees the object.
export function loadJSON({ migrate } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) { reject(new Error('No file chosen')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(String(reader.result));
          resolve(migrate ? migrate(obj) : obj);
        } catch (err) {
          reject(new Error(`Not a valid design file: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
    input.click();
  });
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }));
  const head = cols.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

export function saveCSV(filename, rows, columns) {
  downloadBlob(filename, toCSV(rows, columns), 'text/csv');
}

export function saveSVG(filename, svgMarkup) {
  const markup = svgMarkup.includes('xmlns=') ? svgMarkup : svgMarkup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  downloadBlob(filename, `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`, 'image/svg+xml');
}

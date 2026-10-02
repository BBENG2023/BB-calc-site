// table-input.js — generic editable table: column schema, add / remove /
// duplicate rows, and paste from a spreadsheet (tab-separated). Used by the
// runner's `table` input type and by calcs with a custom UI.
//
// columns: [{ key, label, type: 'number'|'text'|'select'|'checkbox', options: [[value, label]] | [value],
//             step, min, width, nullable, unit }]

function coerce(col, raw) {
  if (col.type === 'checkbox') return raw === true || /^(1|y|yes|true|x)$/i.test(String(raw).trim());
  if (col.type === 'number') {
    const s = String(raw).trim().replace(/,/g, '');
    if (s === '') return col.nullable ? null : 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : (col.nullable ? null : 0);
  }
  if (col.type === 'select') {
    const opts = (col.options || []).map((o) => (Array.isArray(o) ? o : [o, o]));
    const s = String(raw).trim();
    const hit = opts.find(([v, l]) => String(v).toLowerCase() === s.toLowerCase() || String(l).toLowerCase() === s.toLowerCase());
    return hit ? hit[0] : s;
  }
  return String(raw);
}

export function parseTSV(text) {
  return String(text).replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'));
}

export function createTable({ columns, rows, onChange, newRow, caption, compact = false, allowDuplicate = true, minRows = 0, rowLabel }) {
  const wrap = document.createElement('div');
  wrap.className = `tbl-wrap${compact ? ' tbl-compact' : ''}`;
  const scroller = document.createElement('div');
  scroller.className = 'tbl-scroll';
  const table = document.createElement('table');
  table.className = 'tbl-input';
  if (caption) {
    const cap = document.createElement('caption');
    cap.textContent = caption;
    table.append(cap);
  }
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${rowLabel ? '<th>#</th>' : ''}${columns.map((c) => `<th${c.width ? ` style="min-width:${c.width}"` : ''}>${c.label}${c.unit ? ` <span class="field-unit">(${c.unit})</span>` : ''}</th>`).join('')}<th class="tbl-actions-h"><span class="visually-hidden">Row actions</span></th></tr>`;
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  scroller.append(table);
  wrap.append(scroller);

  const changed = (structural) => onChange && onChange({ structural });

  function cellInput(col, row, ri) {
    let input;
    if (col.type === 'select') {
      input = document.createElement('select');
      (col.options || []).forEach((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = l;
        input.append(opt);
      });
      input.value = row[col.key] ?? '';
      input.addEventListener('change', () => { row[col.key] = coerce(col, input.value); changed(!!col.structural); });
    } else if (col.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!row[col.key];
      input.addEventListener('change', () => { row[col.key] = input.checked; changed(!!col.structural); });
    } else {
      input = document.createElement('input');
      input.type = col.type === 'number' ? 'number' : 'text';
      if (col.type === 'number') { input.step = col.step ?? 'any'; if (col.min !== undefined) input.min = col.min; }
      const v = row[col.key];
      input.value = v === null || v === undefined ? '' : String(v);
      // Optional per-column check: validate(value) → message ('' = OK).
      const check = () => {
        if (!col.validate) return;
        const msg = col.validate(input.value);
        input.classList.toggle('tbl-bad', !!msg);
        input.title = msg || '';
      };
      check();
      input.addEventListener('input', () => { row[col.key] = coerce(col, input.value); check(); changed(false); });
    }
    input.setAttribute('aria-label', `${col.label} row ${ri + 1}`);
    input.dataset.row = ri;
    input.dataset.col = col.key;
    return input;
  }

  function render() {
    tbody.innerHTML = '';
    rows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      if (rowLabel) {
        const td = document.createElement('td');
        td.className = 'tbl-rowlabel';
        td.textContent = typeof rowLabel === 'function' ? rowLabel(row, ri) : ri + 1;
        tr.append(td);
      }
      columns.forEach((col) => {
        const td = document.createElement('td');
        if (col.render) td.append(col.render(row, ri));
        else td.append(cellInput(col, row, ri));
        tr.append(td);
      });
      const tdA = document.createElement('td');
      tdA.className = 'tbl-actions';
      if (allowDuplicate) {
        const dup = document.createElement('button');
        dup.type = 'button';
        dup.className = 'btn secondary btn-xs';
        dup.textContent = '⧉';
        dup.title = 'Duplicate row';
        dup.setAttribute('aria-label', `Duplicate row ${ri + 1}`);
        dup.addEventListener('click', () => { rows.splice(ri + 1, 0, JSON.parse(JSON.stringify(row))); render(); changed(true); });
        tdA.append(dup);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn secondary btn-xs';
      del.textContent = '×';
      del.title = 'Remove row';
      del.setAttribute('aria-label', `Remove row ${ri + 1}`);
      del.disabled = rows.length <= minRows;
      del.addEventListener('click', () => { rows.splice(ri, 1); render(); changed(true); });
      tdA.append(del);
      tr.append(tdA);
      tbody.append(tr);
    });
  }

  // Paste tab-separated cells starting at the focused cell.
  table.addEventListener('paste', (evt) => {
    const t = evt.target;
    const text = evt.clipboardData?.getData('text/plain') || '';
    if (!t.dataset || t.dataset.row === undefined || !/[\t\n]/.test(text.trim())) return;
    evt.preventDefault();
    const grid = parseTSV(text);
    const r0 = Number(t.dataset.row);
    const c0 = columns.findIndex((c) => c.key === t.dataset.col);
    grid.forEach((cells, i) => {
      const ri = r0 + i;
      while (rows.length <= ri) rows.push(newRow ? newRow() : {});
      cells.forEach((cell, j) => { const col = columns[c0 + j]; if (col && !col.render) rows[ri][col.key] = coerce(col, cell); });
    });
    render();
    changed(true);
  });

  const bar = document.createElement('div');
  bar.className = 'tbl-bar';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn secondary btn-sm';
  add.textContent = '+ Add row';
  add.addEventListener('click', () => { rows.push(newRow ? newRow() : {}); render(); changed(true); });
  const paste = document.createElement('button');
  paste.type = 'button';
  paste.className = 'btn secondary btn-sm';
  paste.textContent = 'Paste from spreadsheet';
  paste.addEventListener('click', () => {
    const box = wrap.querySelector('.tbl-paste') || document.createElement('div');
    box.className = 'tbl-paste';
    box.innerHTML = `<label>Paste rows (tab-separated, columns in table order: ${columns.filter((c) => !c.render).map((c) => c.label).join(', ')})<textarea rows="5"></textarea></label>
      <div class="tbl-bar"><button type="button" class="btn btn-sm" data-m="append">Append</button><button type="button" class="btn secondary btn-sm" data-m="replace">Replace all</button><button type="button" class="btn secondary btn-sm" data-m="cancel">Cancel</button></div>`;
    wrap.append(box);
    box.querySelector('textarea').focus();
    box.addEventListener('click', (e) => {
      const m = e.target.dataset?.m;
      if (!m) return;
      if (m !== 'cancel') {
        const cols = columns.filter((c) => !c.render);
        const grid = parseTSV(box.querySelector('textarea').value);
        const newRows = grid.map((cells) => {
          const r = newRow ? newRow() : {};
          cells.forEach((cell, j) => { if (cols[j]) r[cols[j].key] = coerce(cols[j], cell); });
          return r;
        });
        if (m === 'replace') rows.splice(0, rows.length, ...newRows);
        else rows.push(...newRows);
        render();
        changed(true);
      }
      box.remove();
    });
  });
  bar.append(add, paste);
  wrap.append(bar);
  render();
  wrap.refresh = render;
  return wrap;
}

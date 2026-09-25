// header-details.js — the editable calc-sheet header block (project no.,
// title, sheet no., date, engineer initials, checked category). Persisted
// to localStorage so an engineer doesn't retype their initials on every
// calc sheet — shared across all calcs, since it's normally the same job.

const STORAGE_KEY = 'bb-header-details';

export const HEADER_FIELDS = [
  { key: 'projectNo', label: 'Project No', type: 'text' },
  { key: 'projectTitle', label: 'Project Title', type: 'text' },
  { key: 'sheetNo', label: 'Sheet No', type: 'text' },
  { key: 'sheetOf', label: 'of', type: 'text' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'engineerInitials', label: 'Engineer (initials)', type: 'text' },
  { key: 'checkedCategory', label: 'Checked category', type: 'text',
    datalist: ['CAT I/II', 'CAT II/III', 'CAT III'],
    help: 'BS EN 1997-1 / CDM 2015 design check category — pick a suggestion or type your own.' },
];

function defaults() {
  const d = {};
  HEADER_FIELDS.forEach((f) => { d[f.key] = ''; });
  return d;
}

export function loadHeaderDetails() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}

export function saveHeaderDetails(details) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    // localStorage unavailable (private browsing etc.) — header just
    // won't persist between visits; the page still works.
  }
}

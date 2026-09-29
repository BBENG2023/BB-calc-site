// tabs.js — accessible tab bar + panels (sticky, horizontally scrollable on
// phones). tabs: [{ key, label, render: (panelEl) => void }].

export function createTabs(tabs, { active, onSwitch } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'tabs';
  const bar = document.createElement('div');
  bar.className = 'tab-bar';
  bar.setAttribute('role', 'tablist');
  const panel = document.createElement('div');
  panel.className = 'tab-panel';
  panel.setAttribute('role', 'tabpanel');
  let current = tabs.find((t) => t.key === active) ? active : tabs[0]?.key;

  function show(key, focus) {
    current = key;
    [...bar.children].forEach((b) => {
      const on = b.dataset.key === key;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    panel.innerHTML = '';
    const t = tabs.find((x) => x.key === key);
    if (t) t.render(panel);
    if (onSwitch) onSwitch(key);
  }

  tabs.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab-btn';
    b.setAttribute('role', 'tab');
    b.dataset.key = t.key;
    b.textContent = t.label;
    b.addEventListener('click', () => show(t.key));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      show(tabs[j].key, true);
    });
    bar.append(b);
  });
  wrap.append(bar, panel);
  show(current);
  wrap.show = show;
  wrap.rerender = () => show(current);
  wrap.current = () => current;
  return wrap;
}

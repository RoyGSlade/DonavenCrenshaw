// The lane plotter on screen: a grid of sectors with their costs, your route, the warning halo, two
// budget bars and a Back up button. Tap the sector next to the ship to extend the route; keys: arrows
// extend, Backspace backs up. DOM only, no art. Resolves with the rules' result.
import { enter, backUp, head, costOf, spare, isRevealed, manhattan, TERRAIN, HAZARD_COST } from './nav.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const f2 = (n) => (Math.round(n * 100) / 100).toString();
const whole = (n) => Math.max(0, Math.ceil(n - 1e-9)); // bars: whole numbers, never 0 while you can still move
const WORDS = { port: 'Port reached.', 'out-of-time': 'Out of time: the lane run is lost.', 'out-of-fuel': 'Out of fuel: stranded.' };

export function playNav(root, { state, title = 'Lane run', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state, n = s.size;
  const bar = (cls, label) => h('div', { class: `nv-bar ${cls}` }, h('span', { text: label }), h('i', {}, h('u')), h('b', { text: '' }));
  const timeBar = bar('is-time', 'Time'), fuelBar = bar('is-fuel', 'Fuel');
  const grid = h('div', { class: 'nv-grid', role: 'grid', 'aria-label': 'Sector map', style: `--n:${n}` });
  const cells = Array.from({ length: n * n }, (_, i) => {
    const t = TERRAIN[s.cells[i]];
    const b = h('button', { type: 'button', class: `nv-cell nv-${t.id}`, 'data-i': i, role: 'gridcell' },
      h('em', { text: i === s.start ? 'S' : i === s.port ? 'P' : '' }), h('small', { text: i === s.start || i === s.port ? '' : `T${t.time} F${t.fuel}` }));
    b.addEventListener('click', () => go(i));
    grid.append(b); return b;
  });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: 'Tap the sector next to your ship to plot the route to the port (P).' });
  const backBtn = h('button', { type: 'button', class: 'nv-back ui-btn', text: 'Back up' });
  backBtn.addEventListener('click', undo);
  const sw = (cls, text) => h('li', {}, h('i', { class: `nv-sw ${cls}` }), h('span', { text }));
  const key = h('ul', { class: 'nv-key', 'aria-label': 'Key' },
    sw('nv-lane', 'Open lane: T1 F1'), sw('nv-nebula', 'Nebula: T2 F1'), sw('nv-rubble', 'Rubble: T1 F2'),
    h('li', {}, h('b', { text: '▲' }), h('span', { text: 'your ship' })), h('li', {}, h('b', { class: 'nv-x', text: '✕' }), h('span', { text: `hazard, +T${HAZARD_COST.time} F${HAZARD_COST.fuel}` })));
  const legend = h('p', { class: 'rp-par', text: `T = travel time, F = fuel. You can see hazards ${s.reveal} sector${s.reveal === 1 ? '' : 's'} ahead.` });
  const panel = h('section', { class: 'rp-panel nv-panel mg-skin ui-panel', role: 'group', 'aria-label': `Navigation: ${title}` },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `NAVIGATE · ${title.toUpperCase()} · ${n} x ${n}` }), timeBar, fuelBar, grid, key, status,
    h('div', { class: 'rp-foot' }, backBtn, legend),
    h('p', { class: 'rp-help', text: 'Backing up re-crosses the sector you leave, so it costs too. Keys: arrows extend the route, Backspace backs up.' }));
  panel.__state = s;
  root.append(panel);
  let finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function paint() {
    const hd = head(s), route = new Set(s.path), sp = spare(s);
    cells.forEach((b, i) => {
      const hazard = isRevealed(s, i);
      b.classList.toggle('is-route', route.has(i)); b.classList.toggle('is-head', i === hd);
      b.classList.toggle('is-hazard', hazard); b.classList.toggle('is-hit', s.hitSet.has(i));
      b.classList.toggle('is-scan', !hazard && manhattan(n, hd, i) <= s.reveal && i !== hd);
      b.classList.toggle('is-next', !s.done && manhattan(n, hd, i) === 1);
      const em = b.querySelector('em');
      em.textContent = i === hd ? '▲' : hazard ? '✕' : i === s.start ? 'S' : i === s.port ? 'P' : '';
      const c = costOf(s, i);
      b.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}: ${TERRAIN[s.cells[i]].name}, ${f2(c.time)} time ${f2(c.fuel)} fuel${hazard ? ', hazard' : ''}${i === hd ? ', your ship' : ''}`);
      b.disabled = s.done;
    });
    const fill = (el, used, budget, low) => { el.querySelector('u').style.width = `${Math.max(0, Math.min(100, (100 * (budget - used)) / budget))}%`; el.querySelector('b').textContent = `${whole(budget - used)} left of ${budget}`; el.classList.toggle('is-low', (budget - used) / budget < 0.15); };
    fill(timeBar, s.time, s.budgetTime); fill(fuelBar, s.fuel, s.budgetFuel);
    backBtn.disabled = s.done || s.path.length < 2;
  }
  function go(i) {
    if (s.done) return;
    const r = enter(s, i);
    if (!r) { sound('hurt'); return; }
    sound(r === 'hit' ? 'jam' : 'power');
    if (r === 'hit') status.textContent = `Hazard! +${HAZARD_COST.time} time, +${HAZARD_COST.fuel} fuel.`;
    else if (r === 'moved') status.textContent = `On route: ${s.path.length - 1} sector${s.path.length === 2 ? '' : 's'}.`;
    paint(); if (s.done) end();
  }
  function undo() {
    if (s.done) return; const r = backUp(s); if (!r) return;
    status.textContent = 'Backed up. The sector you left was crossed again.'; sound('hurt'); paint(); if (s.done) end();
  }
  const kd = (e) => {
    if (s.done) return;
    const hd = head(s), d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: n, ArrowUp: -n }[e.key];
    if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
    if (!d) return;
    const j = hd + d;
    if (j < 0 || j >= n * n || (Math.abs(d) === 1 && Math.floor(j / n) !== Math.floor(hd / n))) return;
    e.preventDefault(); go(j);
  };
  addEventListener('keydown', kd);
  function end() {
    removeEventListener('keydown', kd); paint();
    const r = s.result;
    status.textContent = WORDS[r.how];
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const go2 = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'arrived' : 'stranded' },
      h('b', { class: 'rp-stars', text: r.success ? stars : r.how === 'out-of-fuel' ? 'NO FUEL' : 'NO TIME' }),
      h('span', { text: r.success ? `${r.steps} sectors · time ${whole(r.time)} of ${r.budgetTime} · fuel ${whole(r.fuel)} of ${r.budgetFuel} · ${r.hits} hazard${r.hits === 1 ? '' : 's'} hit · +${r.xp} Navigation XP` : `${r.steps} sectors, ${r.backups} backed up. No XP.` }), go2);
    go2.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go2.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  return promise;
}

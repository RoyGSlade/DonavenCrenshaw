// Shadow slip on screen: the map, the guards, the cones for your next beat (strong) and the beat
// after (faint), a heat bar, a beats bar, a Wait button and a colour key under the map.
// Tap a neighbouring cell to step, Wait (or Space) to stay; arrows step. DOM only, no art.
import { act, guardAt, watched, neighbours, gainAt, CELL } from './stealth.js';
import { STEALTH_BASE } from './setup.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const ARROW = { '1,0': '▶', '-1,0': '◀', '0,1': '▼', '0,-1': '▲' };
const WORDS = { exit: 'Out. Nobody saw you.', caught: 'Caught: the alarm is up.', late: 'Shift change: the guards doubled up and the way out is shut.' };

export function playStealth(root, { state, title = 'Cargo hold', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state, n = s.size;
  const bar = (cls, label) => h('div', { class: `nv-bar ${cls}` }, h('span', { text: label }), h('i', {}, h('u')), h('b', { text: '' }));
  const heatBar = bar('is-fuel st-heat', 'Heat'), beatBar = bar('is-time', 'Beats');
  const grid = h('div', { class: 'nv-grid st-grid', role: 'grid', 'aria-label': 'Map', style: `--n:${n}` });
  const cells = Array.from({ length: n * n }, (_, i) => {
    const b = h('button', { type: 'button', class: `nv-cell st-cell st-${s.cells[i]}`, 'data-i': i, role: 'gridcell' }, h('em', { text: '' }), h('small', { text: '' }));
    b.addEventListener('click', () => doAct(i));
    grid.append(b); return b;
  });
  const sw = (cls, text) => h('li', {}, h('i', { class: `nv-sw ${cls}` }), h('span', { text }));
  const key = h('ul', { class: 'nv-key', 'aria-label': 'Key' }, sw('st-now', 'watched if you end this beat there'), sw('st-later', 'dashed: watched the beat after'), sw('st-cover', 'cover: hides you'), sw('st-wall', 'wall'),
    h('li', {}, h('i', { class: 'nv-sw st-guard' }), h('span', { text: 'guard (arrow = way it walks)' })), h('li', {}, h('b', { text: '▲' }), h('span', { text: 'you' })), h('li', {}, h('b', { text: 'E' }), h('span', { text: 'exit' })));
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: 'Each tap spends a beat: step to a neighbouring cell, or wait. Stay out of the lit cones.' });
  const waitBtn = h('button', { type: 'button', class: 'nv-back', text: 'Wait a beat' });
  waitBtn.addEventListener('click', () => doAct(s.pos));
  const facts = h('p', { class: 'rp-par', text: `${s.guards.length} guard${s.guards.length === 1 ? '' : 's'} · cones reach about ${Math.round(STEALTH_BASE.cone * s.rangeFactor)} cells · a heard step costs +${Math.round(STEALTH_BASE.heard * s.quiet)} heat · cools ${s.decay} a quiet beat` });
  const panel = h('section', { class: 'rp-panel nv-panel st-panel', role: 'group', 'aria-label': `Stealth: ${title}` },
    h('p', { class: 'rp-eyebrow', text: `SLIP PAST · ${title.toUpperCase()} · ${s.guards.length} GUARD${s.guards.length === 1 ? '' : 'S'}` }), heatBar, beatBar, grid, key, status,
    h('div', { class: 'rp-foot' }, waitBtn, facts),
    h('p', { class: 'rp-help', text: 'Arrows step, Space waits. A step makes noise if a guard is within 2 cells.' }));
  panel.__state = s;
  root.append(panel);
  let finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function paint() {
    const t = s.beat, now = watched(s, t + 1), later = watched(s, t + 2), guards = s.guards.map((g) => guardAt(s, g, t));
    const near = new Set(neighbours(s, s.pos));
    cells.forEach((b, i) => {
      const gd = guards.find((g) => g.cell === i);
      const vis = Math.min(1, now.get(i) || 0), vis2 = Math.min(1, later.get(i) || 0);
      const lit = s.cells[i] !== CELL.wall && s.cells[i] !== CELL.cover; // cover hides you: never shown as watched
      b.classList.toggle('is-now', vis > 0 && lit); b.classList.toggle('is-later', vis2 > 0 && !vis && lit);
      b.style.setProperty('--vis', String(vis || vis2 * 0.6));
      b.classList.toggle('is-head', i === s.pos); b.classList.toggle('is-next', !s.done && near.has(i));
      const em = b.querySelector('em');
      b.classList.toggle('is-guard', !!gd);
      em.textContent = gd ? (ARROW[`${gd.dir[0]},${gd.dir[1]}`] || '●') : i === s.pos ? '▲' : i === s.exit ? 'E' : s.cells[i] === CELL.cover ? '▣' : s.cells[i] === CELL.wall ? '' : '';
      b.querySelector('small').textContent = '';
      b.disabled = s.done || s.cells[i] === CELL.wall || !(near.has(i) || i === s.pos);
      b.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}: ${s.cells[i]}${gd ? ', guard' : ''}${vis > 0 ? `, watched next beat (${Math.round(vis * 100)}%)` : ''}${i === s.pos ? ', you' : ''}${i === s.exit ? ', exit' : ''}`);
    });
    const hl = Math.max(0, Math.round(STEALTH_BASE.caught - s.heat));
    heatBar.querySelector('u').style.width = `${Math.min(100, s.heat)}%`; heatBar.querySelector('b').textContent = `${Math.round(s.heat)} of ${STEALTH_BASE.caught}`;
    heatBar.classList.toggle('is-low', s.heat >= 60);
    beatBar.querySelector('u').style.width = `${(100 * (s.beats - s.beat)) / s.beats}%`; beatBar.querySelector('b').textContent = `${s.beats - s.beat} left of ${s.beats}`;
    beatBar.classList.toggle('is-low', s.beats - s.beat < s.beats * 0.15);
    waitBtn.disabled = s.done;
  }
  function doAct(cell) {
    if (s.done) return;
    const r = act(s, cell);
    if (!r) { sound('hurt'); return; }
    const g = s.events[0]?.gain || 0;
    status.textContent = r === 'seen' ? `Seen! +${Math.round(g)} heat.` : r === 'heard' ? `Heard a step. +${Math.round(g)} heat.` : r === 'waited' ? 'You wait. Heat cools if nobody saw you.' : r === 'moved' ? 'Quiet step.' : status.textContent;
    sound(r === 'seen' || r === 'heard' ? 'hurt' : 'power');
    paint(); if (s.done) end();
  }
  const kd = (e) => {
    if (s.done) return;
    if (e.code === 'Space') { e.preventDefault(); doAct(s.pos); return; }
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: n, ArrowUp: -n }[e.key];
    if (!d) return;
    const j = s.pos + d;
    if (j < 0 || j >= n * n || (Math.abs(d) === 1 && Math.floor(j / n) !== Math.floor(s.pos / n))) return;
    e.preventDefault(); doAct(j);
  };
  addEventListener('keydown', kd);
  function end() {
    removeEventListener('keydown', kd); paint();
    const r = s.result;
    status.textContent = WORDS[r.how];
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const go = h('button', { type: 'button', class: 'primary', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'slipped' : r.how },
      h('b', { class: 'rp-stars', text: r.success ? stars : r.how === 'caught' ? 'CAUGHT' : 'TOO LATE' }),
      h('span', { text: r.success ? `${r.beats} beats · hottest ${r.maxHeat} heat · seen ${r.seenBeats}, heard ${r.heardBeats} · +${r.xp} Stealth XP` : `${r.beats} beats, hottest ${r.maxHeat}. No XP.` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  return promise;
}

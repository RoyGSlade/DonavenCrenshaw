// The forge on screen: a gauge with a sweeping needle, the lit strike zone, a row of strike pips
// and a big Strike button (Space, Enter, click or tap). DOM only, no art.
// Resolves with the rules' result { success, good, spoils, strikes, quality, stars, materials, buildSeconds, xp }.
import { strike, stepCraft, needleAt, zoneOf } from './craft.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };

export function playCraft(root, { state, what = 'fitting', unit = 'scrap', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  const zoneEl = h('s', { class: 'cf-zone', 'aria-hidden': 'true' });
  const needle = h('i', { class: 'hg-needle', 'aria-hidden': 'true' });
  const track = h('div', { class: 'hg-track cf-track' }, zoneEl, needle);
  const pips = h('div', { class: 'cf-pips', 'aria-label': 'Strikes' });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Strike the ${what} when the needle is in the lit zone.` });
  const btn = h('button', { type: 'button', class: 'hk-btn primary', text: 'Strike' });
  const facts = h('p', { class: 'rp-par', text: `${s.strikes} strikes · needs ${Math.ceil(s.strikes * 0.5)} good · ${s.recipe.materials} ${unit} for the recipe` });
  const panel = h('section', { class: 'rp-panel cf-panel', role: 'group', 'aria-label': `Craft: ${what}` },
    h('p', { class: 'rp-eyebrow', text: `CRAFT · ${what.toUpperCase()} · ${s.strikes} STRIKES` }), pips, track, btn, status, facts,
    h('p', { class: 'rp-help', text: 'Space, Enter or tap. A bad strike spoils material. Fewer than half good and the part is ruined.' }));
  panel.__state = s;
  root.append(panel);
  let raf = 0, last = 0, finish, flash = 0;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;
  function paint() {
    const [a, b] = zoneOf(s, Math.min(s.index, s.strikes - 1));
    zoneEl.style.left = `${100 * a}%`; zoneEl.style.width = `${100 * (b - a)}%`;
    needle.style.left = `${100 * needleAt(s)}%`;
    pips.replaceChildren(...Array.from({ length: s.strikes }, (_, i) => h('span', { class: s.marks[i] || (i === s.index ? 'now' : '') })));
    track.classList.toggle('is-flash-good', flash > 0 && s.marks[s.marks.length - 1] === 'good');
    track.classList.toggle('is-flash-bad', flash > 0 && s.marks[s.marks.length - 1] === 'bad');
  }
  function doStrike() {
    if (s.done) return;
    const r = strike(s);
    flash = 0.25;
    sound(r === 'good' ? 'power' : 'hurt');
    status.textContent = r === 'good' ? `Good strike. ${s.index} of ${s.strikes}.` : `Missed: material spoiled. ${s.index} of ${s.strikes}.`;
    paint();
    if (s.done) end();
  }
  const kd = (e) => { if (['Space', 'Enter', 'KeyE'].includes(e.code) && !panel.querySelector('.rp-result')) { e.preventDefault(); if (!e.repeat) doStrike(); } };
  addEventListener('keydown', kd);
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); doStrike(); });
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    stepCraft(s, dt); flash = Math.max(0, flash - dt); paint();
  }
  function end() {
    cancelAnimationFrame(raf); flash = 0; paint(); removeEventListener('keydown', kd);
    const r = s.result;
    btn.hidden = true;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    status.textContent = r.success ? `The ${what} is made.` : `The ${what} is ruined.`;
    const go = h('button', { type: 'button', class: 'primary', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'made' : 'ruined' },
      h('b', { class: 'rp-stars', text: r.success ? stars : 'RUINED' }),
      h('span', { text: r.success ? `Quality ${r.quality} · ${r.good} of ${r.strikes} good · ${r.materials} ${unit} used · ${r.buildSeconds}s build · +${r.xp} Crafting XP` : `${r.good} of ${r.strikes} good. ${r.materials} ${unit} lost. No part, no XP.` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

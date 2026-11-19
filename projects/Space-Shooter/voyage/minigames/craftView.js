// The forge on screen, v2 (heat and shape). Phase 1: hold the big button (or Space) to heat the stock;
// let go inside the lit band. Phase 2: tap the shaping tools in order, rough to fine, before the stock cools.
// DOM only, no art. Resolves with the rules' result.
import { heatStart, release, shape, stepCraft, bandOf, TOOLS } from './craft.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const NAME = Object.fromEntries(TOOLS.map((t) => [t.id, t.name]));
const HEAT_WORDS = { ok: 'A clean heat.', cold: 'Too cold: it will not take the shape, half the work time.', hot: 'Too hot: it spoils some material, a little more work time.' };

export function playCraft(root, { state, what = 'fitting', unit = 'scrap', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  const [lo, hi] = bandOf(s);
  const glow = h('i', { class: 'cf-glow', 'aria-hidden': 'true' });
  const band = h('s', { class: 'cf-band', 'aria-hidden': 'true', style: `left:${100 * lo}%;width:${100 * (hi - lo)}%` });
  const heatTrack = h('div', { class: 'hg-track cf-heat', role: 'img', 'aria-label': 'Temperature' }, band, glow);
  const heatLabels = h('div', { class: 'hg-scale' }, h('span', { text: 'cold' }), h('span', { text: 'hot' }));
  const heatBtn = h('button', { type: 'button', class: 'hk-btn primary cf-hold ui-btn', text: 'Hold to heat' });
  const workBar = h('div', { class: 'rp-clock cf-work', role: 'timer', 'aria-label': 'Time before the stock cools' }, h('i'));
  const order = h('p', { class: 'cf-order', text: `Rough to fine: ${TOOLS.map((t) => t.name).join(' → ')}` });
  const tiles = h('div', { class: 'cf-tiles', role: 'group', 'aria-label': 'Shaping tools' });
  const tileEls = new Map();
  for (const id of s.tiles) {
    const b = h('button', { type: 'button', class: 'cf-tile ui-btn', 'data-tool': id, text: NAME[id] });
    b.addEventListener('click', () => doShape(id));
    tileEls.set(id, b); tiles.append(b);
  }
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Hold to heat the stock. Let go inside the lit band.` });
  const facts = h('p', { class: 'rp-par', text: `${s.strikes} shaping steps · needs ${Math.ceil(s.strikes * 0.5)} clean · ${s.recipe.materials} ${unit} for the recipe` });
  const shapeBox = h('div', { class: 'cf-shape', hidden: '' }, workBar, order, tiles);
  const heatBox = h('div', { class: 'cf-heatbox' }, heatTrack, heatLabels, heatBtn);
  const panel = h('section', { class: 'rp-panel cf-panel mg-skin ui-panel', role: 'group', 'aria-label': `Craft: ${what}`, 'data-phase': 'heat' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `CRAFT · ${what.toUpperCase()} · HEAT AND SHAPE` }), heatBox, shapeBox, status, facts,
    h('p', { class: 'rp-help', text: 'Hold the button or Space to heat. Then tap the tools in order: a wrong tap spoils material.' }));
  panel.__state = s;
  root.append(panel);
  let raf = 0, last = 0, finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function paint() {
    glow.style.width = `${100 * s.temp}%`;
    glow.style.background = `hsl(${Math.round(20 + 30 * s.temp)} 100% ${Math.round(25 + 40 * s.temp)}%)`;
    heatTrack.classList.toggle('is-heating', s.heating);
    if (s.phase === 'shape') workBar.firstChild.style.width = `${(100 * s.work) / s.workMax}%`, workBar.classList.toggle('is-low', s.work < s.workMax * 0.25);
    s.order.forEach((id, i) => { const el = tileEls.get(id); el.classList.toggle('is-done', i < s.index); el.disabled = i < s.index || s.done; });
  }
  function startHeat() { if (s.phase !== 'heat' || s.done) return; heatStart(s); heatBtn.classList.add('is-held'); sound('power'); }
  function stopHeat() {
    if (s.phase !== 'heat' || s.done || !s.heating) return;
    heatBtn.classList.remove('is-held');
    toShape(release(s));
  }
  function toShape(verdict) {
    if (!verdict) return;
    panel.dataset.phase = 'shape'; heatBox.hidden = true; shapeBox.hidden = false;
    status.textContent = `${HEAT_WORDS[verdict]} Tap the tools in order.`;
    sound(verdict === 'ok' ? 'power' : 'hurt'); paint();
  }
  function doShape(id) {
    if (s.done || s.phase !== 'shape') return;
    const r = shape(s, id);
    if (r === 'wrong') { status.textContent = `${NAME[id]} is not next: material spoiled.`; sound('hurt'); const el = tileEls.get(id); el.classList.add('is-bad'); setTimeout(() => el.classList.remove('is-bad'), 300); }
    else if (r) { status.textContent = `${NAME[id]}: ${r === 'good' ? 'clean' : 'fixed'}. ${s.index} of ${s.strikes}.`; sound('power'); }
    paint();
    if (s.done) end();
  }
  heatBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); heatBtn.setPointerCapture?.(e.pointerId); startHeat(); });
  heatBtn.addEventListener('pointerup', (e) => { e.preventDefault(); stopHeat(); });
  heatBtn.addEventListener('pointercancel', stopHeat);
  const kd = (e) => { if (e.code === 'Space' && s.phase === 'heat') { e.preventDefault(); if (!e.repeat) startHeat(); } };
  const ku = (e) => { if (e.code === 'Space' && s.phase === 'heat') { e.preventDefault(); stopHeat(); } };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    const was = s.phase;
    stepCraft(s, dt);
    if (was === 'heat' && s.phase === 'shape') { heatBtn.classList.remove('is-held'); toShape(s.heat); }
    paint();
    if (s.done) end();
  }
  function end() {
    if (panel.querySelector('.rp-result')) return;
    cancelAnimationFrame(raf); paint(); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    const r = s.result;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    status.textContent = r.success ? `The ${what} is made.` : r.how === 'cooled' ? 'The stock went cold before you finished.' : `The ${what} is ruined.`;
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const bankLine = `${unit}: ${r.materials} used (${Math.round(r.materialsExact * 100) / 100} exact), ${Math.round(r.bank * 100) / 100} banked for the next craft`;
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'made' : 'ruined' },
      h('b', { class: 'rp-stars', text: r.success ? stars : r.how === 'cooled' ? 'WENT COLD' : 'RUINED' }),
      h('span', { text: r.success ? `Quality ${r.quality} · ${r.good} of ${r.strikes} clean · ${r.buildSeconds}s build · +${r.xp} Crafting XP` : `${r.good} of ${r.strikes} clean. No part, no XP.` }),
      h('span', { class: 'cf-mat', text: bankLine }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

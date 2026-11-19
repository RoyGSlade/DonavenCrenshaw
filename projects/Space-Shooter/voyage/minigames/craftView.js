// The forge on screen, v2 (heat and shape). Phase 1: hold the big button (or Space) to heat the stock;
// let go inside the lit band. Phase 2: tap the shaping tools in order, rough to fine, before the stock cools.
// The stock itself is drawn: a bar of metal on an anvil that glows dull red, orange, yellow and white as it heats and cools again while you
// shape it. The lit band is a glow window on the gauge. Step pips replace the numbers. DOM only, no art. Resolves with the rules' result.
import { heatStart, release, shape, stepCraft, bandOf, TOOLS } from './craft.js';
import { heatColor, heatGlow, heatWord, stepPips, qualityWord } from './craftWords.js';

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
  const heatRead = h('p', { class: 'cf-read', 'aria-live': 'off', text: 'cold' });
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
  // The stock: a billet on an anvil, in a forge-lit box that fills the free height. Colour and glow come from the heat (see craftWords.js).
  const billet = h('div', { class: 'cf-billet' }, h('i', { class: 'cf-sheen' }));
  const sparks = Array.from({ length: 7 }, (_, i) => h('i', { class: 'cf-spark', style: `left:${22 + i * 9}%;animation-delay:${(i * 137) % 700}ms` }));
  const forge = h('div', { class: 'cf-forge', role: 'img', 'aria-label': 'The stock on the anvil' }, h('div', { class: 'cf-haze' }), h('div', { class: 'cf-coals' }), billet, h('div', { class: 'cf-anvil' }), ...sparks);
  const gauge = h('div', { class: 'cf-gaugebox' }, heatTrack, heatLabels, heatRead);
  const stage = h('div', { class: 'cf-stage' }, forge, gauge);
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Hold to heat the stock. Let go inside the lit band.` });
  const pipEls = Array.from({ length: s.strikes }, () => h('i', { class: 'cf-pip' }));
  const foot = h('div', { class: 'rp-par cf-foot' }, h('span', { class: 'cf-pips', role: 'img', 'aria-label': 'Shaping steps' }, ...pipEls), h('span', { class: 'cf-footline', text: 'At least half the steps must come out clean.' }));
  const shapeBox = h('div', { class: 'cf-shape', hidden: '' }, workBar, order, tiles);
  const heatBox = h('div', { class: 'cf-heatbox' }, heatBtn);
  const panel = h('section', { class: 'rp-panel cf-panel mg-skin ui-panel', role: 'group', 'aria-label': `Craft: ${what}`, 'data-phase': 'heat' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `CRAFT · ${what.toUpperCase()} · HEAT AND SHAPE` }), stage, foot, heatBox, shapeBox, status,
    h('p', { class: 'rp-help', text: 'Hold the button or Space to heat. Then tap the tools in order: a wrong tap spoils material.' }));
  panel.__state = s;
  root.append(panel);
  let raf = 0, last = 0, finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function paint() {
    glow.style.width = `${100 * s.temp}%`;
    glow.style.background = heatColor(s.temp);
    heatTrack.classList.toggle('is-heating', s.heating);
    const inBand = s.phase === 'heat' && s.temp >= lo && s.temp <= hi;
    band.classList.toggle('is-in', inBand);
    // The stock glows with the temperature; while shaping it cools as the work clock runs down.
    const t = s.phase === 'heat' ? s.temp : s.workMax ? s.temp * (0.25 + 0.75 * (s.work / s.workMax)) : s.temp;
    stage.style.setProperty('--cf-col', heatColor(t)); stage.style.setProperty('--cf-glow', heatGlow(t)); stage.style.setProperty('--cf-heat', t.toFixed(3));
    stage.classList.toggle('is-heating', s.heating); stage.classList.toggle('is-inband', inBand); stage.dataset.phase = s.phase;
    heatRead.textContent = heatWord(s.temp, [lo, hi]); heatRead.dataset.state = s.temp > hi ? 'hot' : inBand ? 'ok' : 'cold';
    if (s.phase === 'shape') workBar.firstChild.style.width = `${(100 * s.work) / s.workMax}%`, workBar.classList.toggle('is-low', s.work < s.workMax * 0.25);
    s.order.forEach((id, i) => { const el = tileEls.get(id); el.classList.toggle('is-done', i < s.index); el.disabled = i < s.index || s.done; });
    stepPips(s).forEach((st, i) => { if (pipEls[i].dataset.s !== st) pipEls[i].dataset.s = st; });
  }
  function startHeat() { if (s.phase !== 'heat' || s.done) return; heatStart(s); heatBtn.classList.add('is-held'); sound('power'); }
  function stopHeat() {
    if (s.phase !== 'heat' || s.done || !s.heating) return;
    heatBtn.classList.remove('is-held');
    toShape(release(s));
  }
  function toShape(verdict) {
    if (!verdict) return;
    panel.dataset.phase = 'shape'; heatBox.hidden = true; gauge.hidden = true; shapeBox.hidden = false; foot.querySelector('.cf-footline').textContent = 'Tap the tools in order. A wrong tap spoils the step.';
    status.textContent = `${HEAT_WORDS[verdict]} Tap the tools in order.`;
    sound(verdict === 'ok' ? 'power' : 'hurt'); paint();
  }
  function doShape(id) {
    if (s.done || s.phase !== 'shape') return;
    const r = shape(s, id);
    if (r === 'wrong') { status.textContent = `${NAME[id]} is not next: material spoiled.`; sound('hurt'); const el = tileEls.get(id); el.classList.add('is-bad'); setTimeout(() => el.classList.remove('is-bad'), 300); }
    else if (r) { status.textContent = `${NAME[id]}: ${r === 'good' ? 'clean' : 'fixed'}.`; sound('power'); }
    paint();
    if (s.done) end();
  }
  heatBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); heatBtn.setPointerCapture?.(e.pointerId); startHeat(); });
  heatBtn.addEventListener('pointerup', (e) => { e.preventDefault(); stopHeat(); });
  heatBtn.addEventListener('pointercancel', stopHeat);
  const kd = (e) => { if (e.code === 'Space' && s.phase === 'heat') { e.preventDefault(); if (!e.repeat) startHeat(); } };
  const ku = (e) => { if (e.code === 'Space' && s.phase === 'heat') { e.preventDefault(); stopHeat(); } };
  let viaKey = false; const noteKey = () => { viaKey = true; }; panel.addEventListener('pointerdown', () => { viaKey = false; }, true);
  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('keydown', noteKey);
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
    cancelAnimationFrame(raf); paint(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('keydown', noteKey);
    const r = s.result;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    foot.querySelector('.cf-footline').textContent = '';
    status.textContent = r.success ? `The ${what} is made.` : r.how === 'cooled' ? 'The stock went cold before you finished.' : `The ${what} is ruined.`;
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const rd = (x) => Math.round(x * 100) / 100, NB = '\u00A0';
    const exactNote = rd(r.materialsExact) === r.materials ? '' : ` (${rd(r.materialsExact)}${NB}exact)`;
    const bankNote = rd(r.bank) === 0 ? 'none banked for the next craft' : `${rd(r.bank)}${NB}banked for the next craft`;
    const bankLine = `${unit}: ${r.materials}${NB}used${exactNote}, ${bankNote}${r.success ? `. Builds in ${r.buildSeconds}${NB}s.` : '.'}`;
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'made' : 'ruined' },
      h('b', { class: 'rp-stars', text: r.success ? stars : r.how === 'cooled' ? 'WENT COLD' : 'RUINED' }),
      h('span', { text: r.success ? `${qualityWord(r.quality)} work · ${r.good >= r.strikes ? 'every step clean' : 'most steps clean'} · +${r.xp} Crafting XP` : 'Too few steps came out clean. No part, no XP.' }),
      h('span', { class: 'cf-mat', text: bankLine }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    if (!viaKey) go.classList.add('no-ring'); go.addEventListener('keydown', () => go.classList.remove('no-ring'));
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

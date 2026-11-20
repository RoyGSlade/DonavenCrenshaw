// Order and timing on screen: a pan on a stove with a thermometer beside it. The heat rises on its own (a scripted curve until Tend the heat
// exists), the pan glows, sizzles and smokes more as it heats. Tap the four ingredient tiles (butter, steak, salt, turn) into the pan in the
// recipe's order, each inside its heat band (the green zone on the thermometer) and its time window (the timing gauge). The butter foams, the
// steak browns, the salt sparkles. Words only, no numbers: Next (too early / now / late / burning), the pan in words, the timing in words, pips.
// Resolves with the pure result. The pure rules (and the clock: a time in seconds since the pan went on) are order.js.
import { orderAdd, orderTick, orderGiveUp, orderWord, windowOf, heatAt, burnAt } from './order.js';
import { h, ensureStyle, loop, lcg } from './craftChainView.js';

const TAU = Math.PI * 2;
const nowS = () => performance.now() / 1000;
const SWATCH = { butter: '#ffd95a', steak: '#c4574f', salt: '#f4f7fa', turn: '#9fb3c2' };
const TIMER_SPAN = 14; // seconds the timing gauge spans after the reference ingredient

export function playOrder(root, { state, what = 'steak', reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state, t0 = nowS(), T = () => nowS() - t0;
  const canvas = h('canvas', { class: 'cc-canvas cc-ordcanvas', 'aria-label': `A pan on a stove with a thermometer. Tap the ingredients into the pan in order, each in its heat band and time window, to sear the ${what}.` });
  const ctx = canvas.getContext('2d');

  const nextWord = h('em', { class: 'cc-nextword', text: 'too early' }), nextLabel = h('span', { text: 'Next: Butter' });
  const heatFill = h('i'), heatZone = h('s', { class: 'cc-zone' }), heatWord = h('em', { text: 'warming' });
  const timeFill = h('i'), timeZone = h('s', { class: 'cc-zone' }), timeWord = h('em', { text: 'no timer' });
  const pips = h('div', { class: 'cc-pips cc-ordpips', role: 'img', 'aria-label': 'Ingredients added so far' });
  const recipeLine = h('em', { class: 'cc-recipeline', text: s.steps.map((x) => x.name).join(' · ') });
  const hud = h('div', { class: 'cc-hud cc-hud4 cc-ordhud' },
    h('div', { class: 'cc-stat cc-nextstat' }, nextLabel, nextWord),
    h('div', { class: 'cc-stat cc-panstat' }, h('span', { text: 'Pan' }), h('div', { class: 'cc-meter cc-panmeter', role: 'img', 'aria-label': 'How hot the pan is. The green zone is the next ingredient\'s heat band.' }, heatZone, heatFill), heatWord),
    h('div', { class: 'cc-stat cc-timestat' }, h('span', { text: 'Timing' }), h('div', { class: 'cc-meter cc-timemeter', role: 'img', 'aria-label': 'Time since the ingredient this one waits for. The green zone is its time window.' }, timeZone, timeFill), timeWord),
    h('div', { class: 'cc-stat cc-stepstat' }, h('span', { text: 'Steps' }), pips, recipeLine));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: 'The pan heats by itself. Add butter when the pan is medium, then the steak when it is hot and the butter has foamed, then salt, then turn it. Tap the tiles, or press 1 to 4.' });
  const giveUp = h('button', { type: 'button', class: 'ui-btn cc-done cc-giveup', text: `Give up this ${what}` });
  const tiles = s.layout.map((id, i) => {
    const st = s.steps.find((x) => x.id === id);
    const b = h('button', { type: 'button', class: 'primary ui-btn cc-pad cc-tile', 'data-id': id, 'aria-label': `${st.name}. Tap to put it in the pan. Key ${i + 1}.` }, h('i', { class: 'cc-swatch', style: `background:${SWATCH[id]}` }), h('b', { text: st.name.toUpperCase() }), h('span', { text: 'tap to add' }));
    return b;
  });
  const wrap = h('div', { class: 'cc-boardwrap cc-ordwrap' }, canvas);
  const panel = h('section', { class: 'rp-panel cc-panel cc-ordpanel mg-skin ui-panel', role: 'group', 'aria-label': `Sear the ${what}`, 'data-game': 'order' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `ORDER · ${what.toUpperCase()}` }),
    h('div', { class: 'cc-play' }, hud, wrap, status, h('div', { class: 'cc-row cc-giverow' }, giveUp)),
    h('div', { class: 'cc-row cc-ordrow' }, ...tiles),
    h('p', { class: 'rp-help', text: 'Tap the tiles (or keys 1 to 4) in the recipe order. Each ingredient has a heat band on the thermometer and a time window. The wrong tile spoils it, too early or late costs, and a pan left too long burns.' }));
  panel.__state = s; panel.__time = T;
  root.append(panel);

  // ---- the board -----------------------------------------------------------------------------------------------------------------
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  let W = 0, H = 0;
  const fit = () => { const w = wrap.clientWidth, hh = wrap.clientHeight; if (!w || !hh || (w === W && hh === H)) return; W = w; H = hh; canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);
  requestAnimationFrame(fit);

  // ---- input ----------------------------------------------------------------------------------------------------------------------
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  let endAt = 0, ended = false;
  const add = (id) => { if (s.done) return; const r = orderAdd(s, T(), id); if (r) { /* events are drawn by step */ } };
  for (const b of tiles) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('is-down'); setTimeout(() => b.classList.remove('is-down'), 140); add(b.dataset.id); });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
  }
  giveUp.addEventListener('click', () => { if (!s.done) orderGiveUp(s); });
  const onKey = (e) => { if (s.done || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return; const i = '1234'.indexOf(e.key); if (i < 0 || !tiles[i]) return; e.preventDefault(); tiles[i].classList.add('is-down'); setTimeout(() => tiles[i].classList.remove('is-down'), 140); add(tiles[i].dataset.id); };
  document.addEventListener('keydown', onKey, true);
  const unhook = () => document.removeEventListener('keydown', onKey, true);

  // ---- the picture -----------------------------------------------------------------------------------------------------------------
  const rnd = lcg(53);
  let sparks = [], smoke = [], bubbles = [], falls = [], puffs = [], flash = 0, flashHue = '#9fe870', shake = 0, shownNext = -1, shownTaps = -1, shownZone = '', salted = [], turnedAt = null;
  const say = (m) => { status.textContent = m; };
  const COST = { heat: 'the pan was not in its heat band', time: 'it was outside its window' };
  const geo = () => {
    const tubeW = Math.min(30, W * 0.06), tx = Math.max(18, W * 0.07), ty = H * 0.1, th = H * 0.7;
    const rx = Math.min(W * 0.27, H * 0.5), ry = rx * 0.4, cx = W * 0.58, cy = H * 0.52;
    return { tubeW, tx, ty, th, rx, ry, cx, cy };
  };
  function handle(ev) {
    const g = geo(), st = s.steps.find((x) => x.id === ev.id);
    if (ev.type === 'added') {
      falls.push({ id: ev.id, y: 0, life: 0.45, x: g.cx + (ev.id === 'butter' ? -g.rx * 0.2 : ev.id === 'steak' ? 0 : ev.id === 'salt' ? g.rx * 0.05 : 0) });
      const tap = s.taps[s.taps.length - 1], bad = [!ev.heatOK && COST.heat, !ev.timeOK && COST.time].filter(Boolean);
      if (ev.id === 'butter') bubbles.length = 0;
      if (ev.id === 'salt') for (let i = 0; i < 26; i++) salted.push({ x: (rnd() - 0.5) * g.rx * 1.1, y: (rnd() - 0.5) * g.ry * 0.9, life: 0.6 + rnd() * 0.9, ph: rnd() * TAU });
      if (ev.id === 'turn') turnedAt = ev.t;
      if (bad.length) { flash = 0.55; flashHue = '#ffc857'; shake = 3; say(`${st.name} in, but ${tap.word === 'burning' ? 'the pan was burning' : tap.word}: ${bad.join(' and ')}. It costs points.`); }
      else { flash = 0.3; flashHue = '#9fe870'; say(`${st.name} in, right on time.${s.next < s.steps.length ? ` Next: ${s.steps[s.next].name}.` : ''}`); }
    } else if (ev.type === 'wrong') {
      puffs.push({ x: g.cx, y: g.cy - g.ry, life: 0.9, id: ev.id }); flash = 0.8; flashHue = '#ff6b5a'; shake = 8;
      const wanted = s.steps.find((x) => x.id === ev.wanted);
      say(`${st.name} is out of order: it is spoiled and it costs points.${wanted ? ` The recipe wants ${wanted.name} next.` : ''}`);
      const b = tiles.find((x) => x.dataset.id === ev.id); if (b) { b.classList.add('is-spoil'); setTimeout(() => b.classList.remove('is-spoil'), 700); }
    } else if (ev.type === 'done') { say(ev.how === 'gave-up' ? 'Given up.' : ev.how === 'burnt' ? 'The pan burnt.' : ev.success ? 'Seared.' : 'Too many mistakes.'); endAt = performance.now(); }
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  const mix = (c1, c2, k) => `rgb(${Math.round(lerp(c1[0], c2[0], k))},${Math.round(lerp(c1[1], c2[1], k))},${Math.round(lerp(c1[2], c2[2], k))})`;
  function draw(dt, t) {
    if (!W || !H) return;
    const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const calm = reducedMotion(), g = geo(), u = Math.min(W, H) / 400, heat = heatAt(s, t), hk = Math.max(0, Math.min(1, (heat - 30) / 70));
    const burnK = s.done && s.result?.how === 'burnt' ? 1 : Math.max(0, Math.min(1, (t - (burnAt(s) - 6)) / 6));
    const sx = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0;
    c.save(); c.translate(sx, 0);
    // the kitchen: back wall, the stove top
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a1f27'); bg.addColorStop(0.55, '#222a33'); bg.addColorStop(1, '#10151b'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 7; i++) c.fillRect(W * (0.05 + i * 0.15), 0, 2, H * 0.55);
    const sy = g.cy - g.ry * 0.2; const top = c.createLinearGradient(0, sy, 0, H); top.addColorStop(0, '#59636d'); top.addColorStop(1, '#2c333a'); c.fillStyle = top; c.fillRect(0, sy + g.ry * 0.7, W, H); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, sy + g.ry * 0.7, W, 2);
    // the heat glow under the pan, brighter as it heats
    const gl = c.createRadialGradient(g.cx, g.cy + g.ry * 0.5, g.rx * 0.3, g.cx, g.cy + g.ry * 0.5, g.rx * 1.7);
    gl.addColorStop(0, `rgba(255,${Math.round(150 - 90 * hk)},40,${0.08 + 0.7 * hk})`); gl.addColorStop(1, 'rgba(255,80,20,0)'); c.fillStyle = gl; c.fillRect(0, 0, W, H);
    // the burner ring
    c.strokeStyle = `rgba(255,${Math.round(190 - 120 * hk)},60,${0.15 + 0.85 * hk})`; c.lineWidth = 5 * u; c.beginPath(); c.ellipse(g.cx, g.cy + g.ry * 0.55, g.rx * 1.08, g.ry * 1.12, 0, 0, TAU); c.stroke();
    // the pan: handle, outer wall, the iron inside (it reddens a little as it heats)
    c.fillStyle = '#2a2f35'; c.strokeStyle = '#11151a'; c.lineWidth = 2; c.beginPath(); c.roundRect(g.cx + g.rx * 0.9, g.cy - 7 * u, g.rx * 0.95, 14 * u, 7 * u); c.fill(); c.stroke();
    c.fillStyle = '#3d444c'; c.beginPath(); c.ellipse(g.cx, g.cy + 12 * u, g.rx * 1.02, g.ry * 1.05, 0, 0, TAU); c.fill();
    c.fillStyle = mix([64, 70, 78], [112, 56, 44], hk * 0.8); c.beginPath(); c.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, TAU); c.fill(); c.strokeStyle = '#8c98a3'; c.lineWidth = 3 * u; c.stroke();
    c.fillStyle = mix([30, 34, 40], [66, 32, 26], hk * 0.8); c.beginPath(); c.ellipse(g.cx, g.cy + 2 * u, g.rx * 0.88, g.ry * 0.82, 0, 0, TAU); c.fill();
    // what is in the pan
    const bt = s.taps.find((x) => x.id === 'butter'), st = s.taps.find((x) => x.id === 'steak'), sl = s.taps.find((x) => x.id === 'salt'), tn = s.taps.find((x) => x.id === 'turn');
    if (bt) { const k = Math.max(0, Math.min(1, (t - bt.t) / 1.2)); c.fillStyle = `rgba(255,${Math.round(236 - 28 * k)},${Math.round(150 - 40 * k)},${0.95 - 0.3 * k})`; c.beginPath(); c.ellipse(g.cx - g.rx * 0.1, g.cy + 2 * u, g.rx * (0.18 + 0.5 * k), g.ry * (0.15 + 0.5 * k), 0, 0, TAU); c.fill(); }
    if (bt && t - bt.t > 0.9 && (!st || t - bt.t < 14)) { // the foam: pale bubbles that grow and pop
      if (!calm && rnd() < 0.55) bubbles.push({ x: g.cx - g.rx * 0.1 + (rnd() - 0.5) * g.rx * 0.9, y: g.cy + (rnd() - 0.4) * g.ry * 0.7, r: 2 + rnd() * 3.5, life: 0.5 + rnd() * 0.5 });
    }
    for (const b of bubbles) { b.life -= dt; const k = Math.max(0, b.life); c.fillStyle = `rgba(255,252,230,${Math.min(0.9, k * 1.6)})`; c.beginPath(); c.arc(b.x, b.y, b.r * u * (1.2 - k * 0.6), 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.stroke(); } bubbles = bubbles.filter((b) => b.life > 0);
    if (st) { // the steak: raw pink to seared brown over about 10 s; the turned side is browner; grill marks
      const age = t - st.t, k = Math.max(0, Math.min(1, age / 10)), flipped = tn ? Math.max(0, Math.min(1, (t - tn.t) / 0.5)) : 0, burn = Math.max(burnK, age > 16 ? 0.7 : 0);
      const base = flipped > 0.5 ? [96, 60, 40] : [200, 88, 82], done = flipped > 0.5 ? [58, 34, 22] : [124, 72, 46];
      const body = mix(base, done, k * 0.9); c.save(); c.translate(g.cx + g.rx * 0.08, g.cy + g.ry * 0.05); c.scale(1, 1 - 0.3 * Math.sin(flipped * Math.PI));
      c.fillStyle = mix([0, 0, 0], [0, 0, 0], 0); c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, g.rx * 0.5, g.ry * 0.58, -0.12, 0, TAU); c.fill(); c.strokeStyle = 'rgba(40,20,10,.6)'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = `rgba(30,14,8,${0.2 + 0.5 * k})`; c.lineWidth = 3 * u; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * g.rx * 0.16 - 12 * u, -g.ry * 0.4); c.lineTo(i * g.rx * 0.16 + 12 * u, g.ry * 0.4); c.stroke(); }
      if (burn > 0) { c.fillStyle = `rgba(10,8,6,${0.6 * burn})`; c.beginPath(); c.ellipse(0, 0, g.rx * 0.5, g.ry * 0.58, -0.12, 0, TAU); c.fill(); }
      c.restore();
    }
    if (sl) { for (const q of salted) { q.life += dt * 0; const tw = 0.5 + 0.5 * Math.sin(t * 8 + q.ph), age = t - sl.t; if (age > 0 && age < 6) { c.fillStyle = `rgba(255,255,255,${(0.35 + 0.65 * tw) * Math.max(0, 1 - age / 6)})`; c.fillRect(g.cx + q.x - 1.5 * u, g.cy + q.y - 1.5 * u, 3 * u, 3 * u); if (tw > 0.92) { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.beginPath(); c.moveTo(g.cx + q.x - 5 * u, g.cy + q.y); c.lineTo(g.cx + q.x + 5 * u, g.cy + q.y); c.moveTo(g.cx + q.x, g.cy + q.y - 5 * u); c.lineTo(g.cx + q.x, g.cy + q.y + 5 * u); c.stroke(); } } } }
    // an ingredient dropping in
    for (const f of falls) { f.life -= dt; const k = 1 - Math.max(0, f.life) / 0.45, y = lerp(g.cy - g.ry * 2.6, g.cy, k * k); c.globalAlpha = Math.max(0, Math.min(1, f.life * 4 + 0.2)); c.fillStyle = SWATCH[f.id]; c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 2; c.beginPath(); if (f.id === 'butter') c.roundRect(f.x - 16 * u, y - 10 * u, 32 * u, 20 * u, 4); else if (f.id === 'steak') c.ellipse(f.x, y, 34 * u, 20 * u, -0.12, 0, TAU); else if (f.id === 'turn') c.arc(f.x, y, 12 * u, 0, TAU); else for (let i = 0; i < 5; i++) c.rect(f.x - 14 * u + i * 6 * u, y - 3 * u + (i % 2) * 6 * u, 3 * u, 3 * u); c.fill(); c.stroke(); c.globalAlpha = 1; } falls = falls.filter((f) => f.life > 0);
    // sizzle: bright specks hopping above the pan, more with heat and with something in it; smoke past hot
    const filled = (bt ? 1 : 0) + (st ? 2 : 0);
    if (!calm) {
      const n = (hk * hk * (1 + filled) * 6) * dt * 60; for (let i = 0; i < n; i++) if (rnd() < Math.min(1, n)) sparks.push({ x: g.cx + (rnd() - 0.5) * g.rx * 1.5, y: g.cy + (rnd() - 0.3) * g.ry, vx: (rnd() - 0.5) * 60, vy: -70 - rnd() * 120 * (0.4 + hk), life: 0.25 + rnd() * 0.3 });
      const sm = Math.max(0, (heat - 62) / 38) * (0.4 + 0.6 * Math.min(1, filled)) + burnK; if (rnd() < sm * 0.5 * dt * 60 / 2) smoke.push({ x: g.cx + (rnd() - 0.5) * g.rx, y: g.cy - g.ry * 0.3, vx: (rnd() - 0.4) * 14, vy: -30 - rnd() * 30, r: 8 + rnd() * 12, life: 1.6 + rnd(), burn: burnK });
    }
    for (const p of sparks) { p.life -= dt; p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt; c.globalAlpha = Math.max(0, Math.min(1, p.life * 3)); c.fillStyle = '#fff3b0'; c.fillRect(p.x - 1.5, p.y - 1.5, 3 * (u > 1 ? 1 : 1), 3); } c.globalAlpha = 1; sparks = sparks.filter((p) => p.life > 0 && p.y < g.cy + g.ry);
    for (const p of smoke) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += 14 * dt; const a = Math.max(0, Math.min(0.5, p.life * 0.25)); c.fillStyle = p.burn > 0.3 ? `rgba(18,16,16,${a * 1.4})` : `rgba(190,196,202,${a})`; c.beginPath(); c.arc(p.x, p.y, p.r * u * 0.8, 0, TAU); c.fill(); } smoke = smoke.filter((p) => p.life > 0);
    for (const p of puffs) { p.life -= dt; const k = 1 - p.life / 0.9; c.globalAlpha = Math.max(0, 1 - k); c.fillStyle = '#6b6f72'; c.beginPath(); c.arc(p.x, p.y - k * 60 * u, 16 * u + k * 30 * u, 0, TAU); c.fill(); c.fillStyle = '#ff6b5a'; c.font = `800 ${28 * u}px Inter,sans-serif`; c.textAlign = 'center'; c.fillText('✕', p.x, p.y - k * 20 * u + 8 * u); c.globalAlpha = 1; } puffs = puffs.filter((p) => p.life > 0);
    // the thermometer: a tube with the green heat band of the next ingredient and the mercury
    const { tx, ty, th, tubeW } = g, yOf = (v) => ty + th - (v / 100) * th, w = s.next < s.steps.length ? windowOf(s, s.next) : null;
    c.fillStyle = '#0e1319'; c.strokeStyle = '#9db3c2'; c.lineWidth = 2; c.beginPath(); c.roundRect(tx - tubeW / 2, ty, tubeW, th, tubeW / 2); c.fill(); c.stroke();
    if (w) { c.fillStyle = 'rgba(123,227,106,.55)'; c.fillRect(tx - tubeW / 2 + 2, yOf(w.heat[1]), tubeW - 4, yOf(w.heat[0]) - yOf(w.heat[1])); c.strokeStyle = '#d8ffd0'; c.lineWidth = 2; c.beginPath(); c.moveTo(tx - tubeW / 2 - 6, yOf(w.heat[1])); c.lineTo(tx + tubeW / 2 + 6, yOf(w.heat[1])); c.moveTo(tx - tubeW / 2 - 6, yOf(w.heat[0])); c.lineTo(tx + tubeW / 2 + 6, yOf(w.heat[0])); c.stroke(); }
    const hg = c.createLinearGradient(0, ty + th, 0, ty); hg.addColorStop(0, '#4fc3f7'); hg.addColorStop(0.5, '#ffb347'); hg.addColorStop(1, '#ff4a2e'); c.fillStyle = hg; c.beginPath(); c.roundRect(tx - tubeW * 0.22, yOf(heat), tubeW * 0.44, ty + th - yOf(heat) + 4, 3); c.fill();
    c.beginPath(); c.arc(tx, ty + th + tubeW * 0.5, tubeW * 0.85, 0, TAU); c.fillStyle = mix([79, 195, 247], [255, 74, 46], hk); c.fill(); c.strokeStyle = '#9db3c2'; c.lineWidth = 2; c.stroke();
    for (let v = 20; v <= 80; v += 20) { c.strokeStyle = 'rgba(200,220,232,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(tx + tubeW / 2 + 2, yOf(v)); c.lineTo(tx + tubeW / 2 + 9, yOf(v)); c.stroke(); }
    if (flash > 0) { c.globalAlpha = flash * 0.2; c.fillStyle = flashHue; c.fillRect(-10, -10, W + 20, H + 20); c.globalAlpha = 1; }
    c.restore();
  }

  function step(dt) {
    const t = T();
    orderTick(s, t);
    for (const ev of s.events.splice(0)) handle(ev);
    shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 2.2);
    const heat = heatAt(s, t), cur = s.next < s.steps.length ? s.steps[s.next] : null, w = cur && !s.done ? windowOf(s, s.next) : null, word = s.done ? 'done' : orderWord(s, t);
    nextLabel.textContent = cur && !s.done ? `Next: ${cur.name}` : 'Next: nothing'; nextWord.textContent = word;
    nextWord.parentElement.dataset.state = word === 'now' ? 'now' : word === 'too early' ? 'early' : word === 'late' ? 'late' : word === 'burning' ? 'burn' : 'idle';
    heatFill.style.width = `${heat}%`; heatFill.style.background = heat > 85 ? '#ff5a45' : heat > 60 ? '#ffb347' : '#81e6df';
    heatWord.textContent = heat < 40 ? 'warming' : heat < 70 ? 'medium' : heat < 90 ? 'hot' : 'very hot';
    const zoneKey = w ? `${s.next}:${w.heat}` : '';
    if (zoneKey !== shownZone) {
      shownZone = zoneKey;
      if (w) { heatZone.style.display = ''; heatZone.style.left = `${w.heat[0]}%`; heatZone.style.width = `${w.heat[1] - w.heat[0]}%`; } else heatZone.style.display = 'none';
      if (w && w.time) { timeZone.style.display = ''; timeZone.style.left = `${(100 * (w.time[0] - w.ref)) / TIMER_SPAN}%`; timeZone.style.width = `${(100 * (w.time[1] - w.time[0])) / TIMER_SPAN}%`; } else timeZone.style.display = 'none';
    }
    if (w && w.time) {
      const el = t - w.ref; timeFill.style.width = `${Math.max(0, Math.min(100, (100 * el) / TIMER_SPAN))}%`;
      timeWord.textContent = el < w.time[0] ? 'wait for it' : el <= w.time[1] ? 'in the window' : 'window closed';
    } else { timeFill.style.width = '0%'; timeWord.textContent = cur && !s.done ? 'no timer yet' : 'done'; }
    if (shownNext !== s.next || shownTaps !== s.taps.length) {
      shownNext = s.next; shownTaps = s.taps.length;
      pips.replaceChildren(...s.steps.map((x, i) => h('i', { class: i < s.taps.length ? 'on' : i === s.next ? 'now' : '', style: i < s.taps.length ? `background:${SWATCH[x.id]}` : null, title: x.name })));
      recipeLine.textContent = s.steps.map((x, i) => (i < s.taps.length ? `✓ ${x.name}` : x.name)).join(' · ');
    }
    for (const b of tiles) {
      const idx = s.steps.findIndex((x) => x.id === b.dataset.id), isIn = idx < s.taps.length, isNext = idx === s.next && !s.done;
      b.classList.toggle('is-in', isIn); b.classList.toggle('is-next', isNext && word === 'now'); b.style.setProperty('--glow', isNext && word === 'now' ? '1' : '0');
      b.querySelector('span').textContent = isIn ? 'in the pan' : 'tap to add'; b.disabled = s.done;
    }
    giveUp.disabled = s.done;
    draw(dt, t);
  }
  const stop = loop((dt) => { step(dt); if (s.done && !ended && endAt && performance.now() - endAt > 1100) { ended = true; stop(); unhook(); finish(s.result); } });
  return promise;
}

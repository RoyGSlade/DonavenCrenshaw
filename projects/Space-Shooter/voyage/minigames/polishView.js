// Polish on screen: a dull steel plate of 40 tiles and a wire wheel. Each tile goes from dull to mirror-bright as it gains shine; a tile that
// is close to dimpling glows hot (the warning), and a dimple stays as a dark dent. The wheel is dragged left all the time (chevrons and a
// stream of sparks show how hard); steer it with W A S D, or by dragging a thumb (or the mouse) on the plate: the drag is a floating stick,
// the farther you pull from where you touched, the faster the wheel goes. The Done pad (Space) finishes the plate.
// No number is shown: a shine bar with a word, a heat gauge with a word, the pull with a word, and pips for the dimples.
// Resolves with the pure result. The pure rules are polish.js (polishStep takes a time step and the hand's input).
import { polishStep, polishFinish, polishGiveUp, pullAt, coveredBy, hotCell, plateWord, heatWord, pullWord, motionWord, CELL, REACH, SPEED, AUTO_AT, RUIN_AT, POLISHED } from './polish.js';
import { h, ensureStyle, loop, lcg } from './craftChainView.js';

const TAU = Math.PI * 2, STEP = 1 / 60, STICK = 56;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function playPolish(root, { state, what = 'plate', reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state;
  const canvas = h('canvas', { class: 'cc-canvas cc-polcanvas', 'aria-label': `A dull steel ${what} of forty tiles and a wire wheel. Drag to steer the wheel over the dull tiles; the pull drags it to the left.` });
  const ctx = canvas.getContext('2d');

  const plateFill = h('i'), plateTick = h('b', { class: 'cc-tick', style: `left:${(100 * 28) / AUTO_AT}%` }), plateWord_ = h('em', { text: 'keep going' });
  const heatFill = h('i'), heatWord_ = h('em', { text: 'cool' });
  const pullFill = h('i'), pullWord_ = h('em', { text: 'steady pull' });
  const pips = h('div', { class: 'cc-pips', role: 'img', 'aria-label': 'Dimples so far. Three ruin the plate.' });
  const hud = h('div', { class: 'cc-hud cc-hud4 cc-polhud' },
    h('div', { class: 'cc-stat cc-platestat' }, h('span', { text: 'Plate' }), h('div', { class: 'cc-meter cc-shine', role: 'img', 'aria-label': 'How much of the plate is polished' }, plateFill, plateTick), plateWord_),
    h('div', { class: 'cc-stat cc-heatstat' }, h('span', { text: 'Heat' }), h('div', { class: 'cc-meter cc-heat', role: 'img', 'aria-label': 'How close the hottest tile under the wheel is to dimpling' }, heatFill), heatWord_),
    h('div', { class: 'cc-stat cc-pullstat' }, h('span', { text: 'Pull' }), h('div', { class: 'cc-meter cc-pull', role: 'img', 'aria-label': 'How hard the wheel is dragged to the left' }, pullFill), pullWord_),
    h('div', { class: 'cc-stat cc-pipstat' }, h('span', { text: 'Dimples' }), pips));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: 'Drag on the plate to steer the wheel (W A S D on a keyboard). The pull drags it left: fight it. Grind a dull tile until it shines, then move on before it gets hot.' });
  const giveUp = h('button', { type: 'button', class: 'ui-btn cc-done cc-giveup', text: `Give up this ${what}` });
  const donePad = h('button', { type: 'button', class: 'primary ui-btn cc-pad cc-donepad', 'aria-label': 'Done pad. Finishes the plate (Space does the same).' }, h('b', { text: 'DONE' }), h('span', { text: 'finish the plate' }));
  const wrap = h('div', { class: 'cc-boardwrap cc-polwrap' }, canvas);
  const panel = h('section', { class: 'rp-panel cc-panel cc-polpanel mg-skin ui-panel', role: 'group', 'aria-label': `Polish the ${what}`, 'data-game': 'polish' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `POLISH · ${what.toUpperCase()}` }),
    h('div', { class: 'cc-play' }, hud, wrap, status, h('div', { class: 'cc-row cc-giverow' }, giveUp)),
    h('div', { class: 'cc-row cc-polrow' }, donePad),
    h('p', { class: 'rp-help', text: 'W A S D or a drag steers the wire wheel. Cells under it gain shine; at full shine a cell is polished, grind on and it dimples. The wheel is dragged left all the time. It finishes by itself when most of the plate shines, or press Done (Space). Three dimples ruin the plate.' }));
  panel.__state = s;
  root.append(panel);

  // ---- the board: the plate fits the canvas box, the same on a phone and a desktop -------------------------------------------------
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  let W = 0, H = 0, sc = 1, ox = 0, oy = 0;
  const fit = () => {
    const w = wrap.clientWidth, hh = wrap.clientHeight; if (!w || !hh) return;
    const M = 14; sc = Math.min((w - 2 * M) / s.W, (hh - 2 * M) / s.H);
    ox = (w - s.W * sc) / 2; oy = (hh - s.H * sc) / 2;
    if (w !== W || hh !== H) { W = w; H = hh; canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);
  requestAnimationFrame(fit);
  const P = (x, y) => ({ x: ox + x * sc, y: oy + y * sc });
  panel.__view = () => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, w: W, h: H, scale: sc, at: (x, y) => ({ x: r.left + ox + x * sc, y: r.top + oy + y * sc }), stick: STICK }; };

  // ---- input: W A S D, a floating stick under a thumb or the mouse, Space or the Done pad ---------------------------------------------
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  const keys = new Set(); let drag = null, endAt = 0, ended = false, acc = 0;
  const hand = () => {
    let x = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), y = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
    if (drag) { x += drag.dx; y += drag.dy; }
    const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : { x, y };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (s.done) return; e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    const r = canvas.getBoundingClientRect(); drag = { id: e.pointerId, x0: e.clientX - r.left, y0: e.clientY - r.top, x: e.clientX - r.left, y: e.clientY - r.top, dx: 0, dy: 0 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return; e.preventDefault();
    const r = canvas.getBoundingClientRect(); drag.x = e.clientX - r.left; drag.y = e.clientY - r.top;
    const dx = drag.x - drag.x0, dy = drag.y - drag.y0, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / STICK) / l; drag.dx = dx * k; drag.dy = dy * k;
  });
  const dragEnd = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', dragEnd); canvas.addEventListener('pointercancel', dragEnd); canvas.addEventListener('lostpointercapture', dragEnd);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const done = () => { if (!s.done) polishFinish(s); };
  donePad.addEventListener('pointerdown', () => { donePad.classList.add('is-down'); setTimeout(() => donePad.classList.remove('is-down'), 140); });
  donePad.addEventListener('click', done); donePad.addEventListener('keydown', (e) => { if (e.key === ' ') e.preventDefault(); });
  giveUp.addEventListener('click', () => { if (!s.done) polishGiveUp(s); });
  const onKey = (e) => {
    if (s.done || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ('wasd'.includes(k) && k.length === 1) { e.preventDefault(); keys.add(k); } else if (k === ' ') { e.preventDefault(); if (!e.repeat) done(); }
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
  const unhook = () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); };

  // ---- the picture --------------------------------------------------------------------------------------------------------------------
  const rnd = lcg(53);
  const scratch = s.cells.map((c) => Array.from({ length: 9 }, () => ({ x: rnd(), y: rnd(), a: (rnd() - 0.5) * 1.2, l: 0.25 + 0.55 * rnd() })));
  let sparks = [], pops = [], spin = 0, shake = 0, flash = 0, pulse = 0, lastDimples = 0, prevX = null, netV = 0, holdMsg = 0, clock = 0;
  const say = (t) => { status.textContent = t; };

  function tile(g, c, i, t) {
    const p = P(c.x - CELL / 2, c.y - CELL / 2), sz = CELL * sc, gap = Math.max(2, sz * 0.03), r = Math.max(3, sz * 0.07);
    const k = clamp01(c.shine / POLISHED), heatK = c.state === 'dimpled' ? 0 : clamp01((c.shine - (s.limit - 30)) / 30);
    g.save(); g.beginPath(); g.roundRect(p.x + gap, p.y + gap, sz - 2 * gap, sz - 2 * gap, r); g.clip();
    // dull brown-grey steel to mirror bright: the base lifts, then a bright reflection sweeps in
    const base = Math.round(62 + 150 * k), gr = g.createLinearGradient(p.x, p.y, p.x + sz, p.y + sz);
    gr.addColorStop(0, `rgb(${base + 12},${base + 14},${base + 20})`); gr.addColorStop(0.5, `rgb(${Math.min(255, base + 40 * k)},${Math.min(255, base + 44 * k)},${Math.min(255, base + 52 * k)})`); gr.addColorStop(1, `rgb(${base - 8},${base - 6},${base})`);
    g.fillStyle = gr; g.fillRect(p.x, p.y, sz, sz);
    g.globalAlpha = 1 - k; g.lineWidth = 1; g.strokeStyle = 'rgba(20,16,12,.55)';
    for (const sx of scratch[i]) { g.beginPath(); g.moveTo(p.x + sx.x * sz, p.y + sx.y * sz); g.lineTo(p.x + sx.x * sz + Math.cos(sx.a) * sx.l * sz, p.y + sx.y * sz + Math.sin(sx.a) * sx.l * sz); g.stroke(); }
    g.globalAlpha = 1;
    if (k > 0.35) { const a = (k - 0.35) / 0.65; g.fillStyle = `rgba(255,255,255,${0.55 * a})`; g.beginPath(); g.moveTo(p.x + sz * 0.1, p.y + sz * 0.8); g.lineTo(p.x + sz * 0.55, p.y + sz * 0.1); g.lineTo(p.x + sz * 0.72, p.y + sz * 0.1); g.lineTo(p.x + sz * 0.27, p.y + sz * 0.8); g.closePath(); g.fill(); }
    if (c.state === 'dimpled') {
      const dg = g.createRadialGradient(p.x + sz * 0.55, p.y + sz * 0.6, 2, p.x + sz / 2, p.y + sz / 2, sz * 0.5); dg.addColorStop(0, 'rgba(8,10,14,.85)'); dg.addColorStop(0.7, 'rgba(30,36,44,.55)'); dg.addColorStop(1, 'rgba(30,36,44,0)');
      g.fillStyle = dg; g.fillRect(p.x, p.y, sz, sz); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(p.x + sz / 2, p.y + sz / 2, sz * 0.36, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
    if (heatK > 0 && !reducedMotion()) { const pu = 0.65 + 0.35 * Math.sin(t * 14), hg = g.createRadialGradient(p.x + sz / 2, p.y + sz / 2, sz * 0.1, p.x + sz / 2, p.y + sz / 2, sz * 0.7); hg.addColorStop(0, `rgba(255,${Math.round(190 - 110 * heatK)},60,${0.55 * heatK * pu})`); hg.addColorStop(1, `rgba(255,70,30,${0.25 * heatK * pu})`); g.fillStyle = hg; g.fillRect(p.x, p.y, sz, sz); }
    else if (heatK > 0) { g.fillStyle = `rgba(255,120,40,${0.4 * heatK})`; g.fillRect(p.x, p.y, sz, sz); }
    g.restore();
    g.strokeStyle = heatK > 0 ? `rgba(255,${Math.round(150 - 90 * heatK)},50,${0.5 + 0.5 * heatK})` : c.state === 'polished' ? 'rgba(150,245,235,.45)' : 'rgba(10,16,24,.6)'; g.lineWidth = heatK > 0 ? 2.5 : 1.5;
    g.beginPath(); g.roundRect(p.x + gap, p.y + gap, sz - 2 * gap, sz - 2 * gap, r); g.stroke();
  }

  function draw(dt, t) {
    if (!W || !H) return;
    const g = ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const calm = reducedMotion(), sx = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0, sy = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0;
    g.save(); g.translate(sx, sy);
    g.fillStyle = '#0d1620'; g.fillRect(-10, -10, W + 20, H + 20);
    const tl = P(0, 0), pw = s.W * sc, ph = s.H * sc;
    g.fillStyle = '#1b2631'; g.beginPath(); g.roundRect(tl.x - 8, tl.y - 8, pw + 16, ph + 16, 12); g.fill();
    s.cells.forEach((c, i) => tile(g, c, i, t));
    for (const p of pops) { const k = 1 - p.life / 0.5; g.globalAlpha = Math.max(0, 1 - k); g.strokeStyle = p.hue; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, 10 + k * 40, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    // the wheel: wire bristles that spin, a hot ring over a hot tile, chevrons that show the pull
    const wp = P(s.wheel.x, s.wheel.y), R = REACH * sc, hot = hotCell(s), pull = pullAt(s, s.t), pk = pull / s.pullMax;
    g.save(); g.translate(wp.x, wp.y);
    if (hot) { g.shadowColor = '#ff7a33'; g.shadowBlur = 22; }
    g.fillStyle = 'rgba(8,14,22,.25)'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.rotate(spin); g.strokeStyle = hot ? '#ffb070' : '#d6dee5'; g.lineWidth = Math.max(1.2, sc * 1.4);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38); g.lineTo(Math.cos(a + 0.12) * R, Math.sin(a + 0.12) * R); g.stroke(); }
    g.rotate(-spin); g.shadowBlur = 0;
    g.fillStyle = '#39434d'; g.beginPath(); g.arc(0, 0, R * 0.36, 0, TAU); g.fill(); g.strokeStyle = '#0b1218'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#8c98a3'; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill();
    g.strokeStyle = hot ? '#ff6b3a' : `rgba(255,${Math.round(220 - 90 * pk)},120,.9)`; g.lineWidth = 3.5; g.lineCap = 'round'; g.lineJoin = 'round';
    const n = 1 + Math.round(2 * pk), cx0 = -R - 12; // chevrons to the LEFT of the wheel: the way it is being dragged
    for (let i = 0; i < n; i++) { const x = cx0 - i * 13 - (calm ? 0 : (t * 60 + i * 5) % 8); g.beginPath(); g.moveTo(x + 7, -9); g.lineTo(x - 2, 0); g.lineTo(x + 7, 9); g.stroke(); }
    g.restore();
    if (drag) { g.globalAlpha = 0.55; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(drag.x0, drag.y0, STICK, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(drag.x0 + drag.dx * STICK, drag.y0 + drag.dy * STICK, 16, 0, TAU); g.fill(); g.globalAlpha = 1; }
    for (const p of sparks) { g.globalAlpha = Math.max(0, Math.min(1, p.life * 3)); g.fillStyle = p.life > 0.25 ? '#fff3b0' : '#ff9a3c'; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); } g.globalAlpha = 1;
    if (flash > 0) { g.globalAlpha = flash * 0.25; g.fillStyle = '#ff5a45'; g.fillRect(-10, -10, W + 20, H + 20); g.globalAlpha = 1; }
    g.restore(); void dt;
  }

  function step(dt, t) {
    acc = Math.min(acc + dt, 0.1);
    while (acc >= STEP && !s.done) { polishStep(s, STEP, hand()); acc -= STEP; }
    for (const ev of s.events.splice(0)) {
      if (ev.type === 'polished') { const c = s.cells[ev.cell], p = P(c.x, c.y); pops.push({ x: p.x, y: p.y, life: 0.5, hue: '#9fe870' }); }
      else if (ev.type === 'dimple') { const c = s.cells[ev.cell], p = P(c.x, c.y); pops.push({ x: p.x, y: p.y, life: 0.5, hue: '#ff6b5a' }); shake = 9; flash = 0.6; for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, v = 80 + 220 * Math.random(); sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + 0.35 * Math.random() }); } say('A tile dimpled and it stays (-10). Ease off the hot tiles; three dimples ruin the plate.'); holdMsg = clock + 3; }
      else if (ev.type === 'done') { say(ev.how === 'ruined' ? 'Three dimples: the plate is ruined.' : ev.how === 'gave-up' ? 'Given up.' : ev.how === 'auto' ? 'The plate shines.' : ev.success ? 'Done.' : 'Too rough.'); endAt = performance.now(); }
    }
    shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 2.2); pulse += dt; clock += dt;
    if (prevX != null && dt > 0) netV += (((s.wheel.x - prevX) / dt) - netV) * Math.min(1, dt * 8); prevX = s.wheel.x;
    for (const p of pops) p.life -= dt; pops = pops.filter((p) => p.life > 0);
    // spin follows the wheel's speed; sparks stream off the BACK of the wheel (to the right), more of them and faster the harder the pull
    const pull = pullAt(s, s.t), pk = pull / s.pullMax, wp = P(s.wheel.x, s.wheel.y), cov = coveredBy(s).length;
    spin += dt * (6 + 10 * pk); 
    // the sparks teach it: going against the pull (right) is slow and grinds hard (a thick stream), with the pull (left) is fast and light (a few), on the spot a thick stream;
    // either way they fly off the back of the wheel, farther the harder the pull
    const slow = clamp01(1 - Math.abs(netV) / 200) ** 1.5, heavy = 0.12 + 0.88 * slow * (0.5 + 0.5 * pk) + (netV > 15 ? 0.25 : 0);
    if (!s.done && cov && !reducedMotion()) { const n = Math.round(heavy * 7 * dt * 60 * 0.5 + Math.random() * heavy); for (let i = 0; i < n; i++) sparks.push({ x: wp.x + REACH * sc * 0.4, y: wp.y + (Math.random() - 0.5) * REACH * sc, vx: 50 + (80 + 240 * pk) * Math.random() * (0.4 + 0.6 * heavy), vy: (Math.random() - 0.5) * 120, life: 0.15 + 0.35 * heavy * Math.random() }); }
    if (!s.done && clock > holdMsg && cov) { const w = motionWord(netV); if (status.textContent !== w) status.textContent = w; }
    for (const p of sparks) { p.life -= dt; p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } sparks = sparks.filter((p) => p.life > 0).slice(-220);
    // the HUD
    plateFill.style.width = `${100 * clamp01(s.polished / AUTO_AT)}%`; plateWord_.textContent = plateWord(s);
    const top = Math.max(0, ...coveredBy(s).filter((c) => c.state !== 'dimpled').map((c) => c.shine));
    heatFill.style.width = `${100 * clamp01(top / s.limit)}%`; const hw = s.done ? 'done' : heatWord(s); heatWord_.textContent = hw; heatFill.parentElement.dataset.state = hw === 'too hot!' ? 'hot' : top >= POLISHED ? 'ok' : 'cool';
    pullFill.style.width = `${100 * clamp01(pull / 170)}%`; pullWord_.textContent = pullWord(s);
    if (lastDimples !== s.dimples || !pips.firstChild) { lastDimples = s.dimples; pips.replaceChildren(...Array.from({ length: RUIN_AT }, (_, i) => h('i', { class: i < s.dimples ? 'dent' : '' }))); }
    // the Done pad wakes (a pulse) once a pass is possible
    const can = !s.done && s.polished >= 28, glow = can ? 0.55 + 0.45 * Math.sin(pulse * 5) ** 2 : 0;
    donePad.classList.toggle('is-next', can); donePad.style.setProperty('--glow', glow.toFixed(3));
    giveUp.disabled = s.done; donePad.disabled = s.done;
    draw(dt, t);
  }
  const stop = loop((dt, now) => { step(dt, now / 1000); if (s.done && !ended && endAt && performance.now() - endAt > 900) { ended = true; stop(); unhook(); finish(s.result); } });
  return promise;
}

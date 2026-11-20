// Pour on screen: a measuring flask on a steel bench with a fill line per ingredient and a jug above it. Hold the big Pour pad (or Space)
// and the jug tips and a stream falls; the liquid rises with a wobbling surface; let go with the surface on the line. The green band
// around the line is clean, the amber band passes, over the amber is a spill (the liquid surges over the rim, that ingredient is spoiled
// and the glass goes back to where the pour began), and under the amber you press again to top it up. No number is shown: a glass gauge
// with the line and its bands drawn on it and a word (keep pouring / nearly / on the line: stop / spilled), pips for the pours.
// Resolves with the pure result. The pure rules (and the clock: a time in seconds for every call) are pour.js.
import { pourDown, pourUp, pourTick, pourGiveUp, pourWord, lineOf, liquidOf, rateAt, SPILL_COST } from './pour.js';
import { h, ensureStyle, loop, lcg } from './craftChainView.js';

const TAU = Math.PI * 2;
const now = () => performance.now() / 1000;
const SETTLE = 0.65; // seconds the pad rests after a pour is settled or spilled: the liquid calms, the next ingredient is named

export function playPour(root, { state, what = 'flask', reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state;
  const canvas = h('canvas', { class: 'cc-canvas cc-pourcanvas', 'aria-label': `A measuring ${what} with a fill line for each ingredient. Hold Pour to tip the jug and let go with the liquid on the line.` });
  const ctx = canvas.getContext('2d');

  const glassFill = h('i'), passZone = h('s', { class: 'cc-zone cc-passzone' }), cleanZone = h('s', { class: 'cc-zone cc-cleanzone' }), lineTick = h('b', { class: 'cc-tick' }), glassWord = h('em', { text: 'hold to pour' });
  const pips = h('div', { class: 'cc-pips', role: 'img', 'aria-label': 'Ingredients poured so far, and the ones spilled' });
  const liquidName = h('em', { class: 'cc-liquidname', text: '' });
  const hud = h('div', { class: 'cc-hud cc-hud2 cc-pourhud' },
    h('div', { class: 'cc-stat cc-glassstat' }, h('span', { text: 'Glass' }), h('div', { class: 'cc-meter cc-glass', role: 'img', 'aria-label': 'How full the glass is. The green band is clean, the amber band passes, past it spills.' }, passZone, cleanZone, glassFill, lineTick), glassWord),
    h('div', { class: 'cc-stat cc-pourstat' }, h('span', { text: 'Pours' }), pips, liquidName));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: 'Hold Pour and let go with the liquid on the line. Over the amber band it spills; short of it, pour a little more.' });
  const giveUp = h('button', { type: 'button', class: 'ui-btn cc-done cc-giveup', text: `Give up this ${what}` });
  const pourPad = h('button', { type: 'button', class: 'primary ui-btn cc-pad cc-pourpad', 'aria-label': 'Pour pad. Hold to pour, let go on the line. Space does the same.' }, h('b', { text: 'POUR' }), h('span', { text: 'hold to pour' }));
  const wrap = h('div', { class: 'cc-boardwrap cc-pourwrap' }, canvas);
  const panel = h('section', { class: 'rp-panel cc-panel cc-pourpanel mg-skin ui-panel', role: 'group', 'aria-label': `Pour the ${what}`, 'data-game': 'pour' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `POUR · ${what.toUpperCase()}` }),
    h('div', { class: 'cc-play' }, hud, wrap, status, h('div', { class: 'cc-row cc-giverow' }, giveUp)),
    h('div', { class: 'cc-row cc-pourrow' }, pourPad),
    h('p', { class: 'rp-help', text: 'Hold Pour (or Space) and let go with the liquid on the line. The jug is quicker while the glass is far from the line and always slows down near it. Over the amber band it spills and that ingredient is spoiled; short of it you can top it up, a little costing each time.' }));
  panel.__state = s;
  root.append(panel);

  // ---- the board ----------------------------------------------------------------------------------------------------------------
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  let W = 0, H = 0;
  const fit = () => { const w = wrap.clientWidth, hh = wrap.clientHeight; if (!w || !hh || (w === W && hh === H)) return; W = w; H = hh; canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);
  requestAnimationFrame(fit);
  const geo = (dx = 0) => {
    const bottom = H * 0.9, gh = Math.min(H * 0.7, W * 1.15), gw = Math.min(W * 0.44, gh * 0.62), cx = W * 0.5 + dx, top = bottom - gh;
    return { bottom, gh, gw, cx, top, inner: 7, yOf: (L) => bottom - 8 - (Math.max(0, Math.min(100, L)) / 100) * (gh - 8), halfAt: (y) => { const k = (y - top) / gh; return (gw / 2) * (1 - 0.14 * Math.max(0, Math.min(1, k))); } };
  };
  panel.__view = () => { const r = canvas.getBoundingClientRect(), g = geo(); return { left: r.left, top: r.top, w: W, h: H, lineAt: (L) => ({ x: r.left + g.cx, y: r.top + g.yOf(L) }) }; };

  // ---- input -----------------------------------------------------------------------------------------------------------------------
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  let padHold = false, padId = null, spaceHold = false, endAt = 0, ended = false, lockUntil = 0, nudge = 0;
  const begin = () => {
    if (s.done) return false;
    if (now() < lockUntil) { nudge = 1; return false; }
    return pourDown(s, now());
  };
  const letGo = () => { const r = pourUp(s, now()); if (r && r.outcome !== 'none') lockUntil = now() + SETTLE; return r; };
  pourPad.addEventListener('pointerdown', (e) => {
    e.preventDefault(); if (padHold) return;
    pourPad.classList.add('is-down'); setTimeout(() => pourPad.classList.remove('is-down'), 140);
    padHold = true; padId = e.pointerId; try { pourPad.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    begin(); // a resting pad still tracks the finger, so the lift is not mistaken for a new press
  });
  const padUp = (e) => { if (!padHold || e.pointerId !== padId) return; padHold = false; padId = null; letGo(); };
  pourPad.addEventListener('pointerup', padUp); pourPad.addEventListener('pointercancel', padUp); pourPad.addEventListener('lostpointercapture', padUp);
  pourPad.addEventListener('contextmenu', (e) => e.preventDefault());
  pourPad.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
  giveUp.addEventListener('click', () => { if (!s.done) pourGiveUp(s); });
  const onKey = (e) => { if (s.done || e.ctrlKey || e.metaKey || e.altKey || e.key !== ' ') return; e.preventDefault(); if (e.repeat || spaceHold) return; spaceHold = true; begin(); };
  const onKeyUp = (e) => { if (e.key !== ' ' || !spaceHold) return; spaceHold = false; letGo(); };
  document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
  const unhook = () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); };

  // ---- the picture --------------------------------------------------------------------------------------------------------------------
  const rnd = lcg(91);
  let shown = 0, drops = [], rings = [], tilt = 0.12, streamK = 0, slosh = 0, spillAnim = null, puddle = 0, puddleHue = '#4fd8e8', flash = 0, flashHue = '#9fe870', slide = null, shownIdx = -1, shownPour = '', shownSpills = -1, shownDone = -1, shake = 0, t0 = now();
  const say = (t) => { status.textContent = t; };
  const splash = (x, y, color, n, power) => { for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2, v = (60 + 170 * rnd()) * power; drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + 0.5 * rnd(), color }); } };

  function handle(ev) {
    const g = geo(), liq = s.plan[Math.min(ev.idx ?? s.idx, s.N - 1)];
    if (ev.type === 'start') { say(`Pouring ${liq.name}. Let go with it on the line.`); }
    else if (ev.type === 'clean' || ev.type === 'passes') {
      const y = g.yOf(ev.level); rings.push({ x: g.cx, y, life: 0.6, hue: ev.type === 'clean' ? '#9fe870' : '#ffc857' }); slosh = Math.max(slosh, 0.5); flash = ev.type === 'clean' ? 0.35 : 0.2; flashHue = ev.type === 'clean' ? '#9fe870' : '#ffc857';
      say(ev.type === 'clean' ? `${liq.name[0].toUpperCase()}${liq.name.slice(1)}: right on the line.` : `${liq.name[0].toUpperCase()}${liq.name.slice(1)}: a little off the line, but it passes.`);
    } else if (ev.type === 'under') { say('Short of the line. Hold Pour again to top it up (each press after the first costs a little).'); slosh = Math.max(slosh, 0.3); }
    else if (ev.type === 'next') { const nx = s.plan[ev.idx]; slide = { t: 0, left: ev.left }; shown = 0; say(`Next: ${nx.name}, in a fresh glass. Hold Pour and stop at its line.`); }
    else if (ev.type === 'spill') {
      spillAnim = { t: 0, color: liq.color, base: ev.base }; puddleHue = liq.color; puddle = Math.min(1, puddle + 0.5); shake = 7; flash = 0.8; flashHue = '#ff6b5a';
      say(`Spilled! That ${liq.name} is spoiled (-${SPILL_COST}). The glass is back where it was: pour it again.`);
    } else if (ev.type === 'done') { say(ev.how === 'gave-up' ? 'Given up.' : ev.success ? 'Poured.' : 'Too much spoiled.'); endAt = performance.now(); }
  }

  function bench(g) {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#16222d'); bg.addColorStop(0.7, '#1d2c39'); bg.addColorStop(1, '#101922'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const u = Math.min(W, H) / 400;
    ctx.fillStyle = 'rgba(129,230,223,.05)'; for (let i = 0; i < 6; i++) ctx.fillRect(W * (0.08 + i * 0.17), H * 0.06, 2 * u, H * 0.5); // faint wall strips
    const by = g.bottom, tg = ctx.createLinearGradient(0, by, 0, H); tg.addColorStop(0, '#8d99a4'); tg.addColorStop(0.15, '#aab5bf'); tg.addColorStop(1, '#58636d');
    ctx.fillStyle = tg; ctx.fillRect(0, by, W, H - by); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, by, W, 2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, by + 2, W, 3);
  }
  function glassPath(g, inset = 0) {
    const l = g.cx - g.gw / 2 + inset, r = g.cx + g.gw / 2 - inset, bl = g.cx - g.gw * 0.43 + inset, br = g.cx + g.gw * 0.43 - inset, y0 = g.top, y1 = g.bottom - inset;
    ctx.beginPath(); ctx.moveTo(l, y0); ctx.lineTo(bl, y1 - 10); ctx.quadraticCurveTo(bl + 2, y1, bl + 12, y1); ctx.lineTo(br - 12, y1); ctx.quadraticCurveTo(br - 2, y1, br, y1 - 10); ctx.lineTo(r, y0);
  }
  function surface(g, level, amp, tt) {
    const y = g.yOf(level), half = g.halfAt(y) + 2, step = Math.max(3, half / 14); const pts = [];
    for (let x = -half; x <= half + 0.1; x += step) pts.push([g.cx + x, y + amp * Math.sin(x * 0.09 + tt * 7) * Math.min(1, 1 - Math.abs(x) / (half * 1.6)) + amp * 0.4 * Math.sin(x * 0.2 - tt * 5)]);
    return pts;
  }
  function layer(g, from, to, color, amp, tt, top) {
    if (to <= from + 0.05) return;
    ctx.save(); glassPath(g, 3); ctx.closePath(); ctx.clip();
    const yLow = g.yOf(from) + (from === 0 ? 10 : 0), pts = top ? surface(g, to, amp, tt) : [[g.cx - g.gw, g.yOf(to)], [g.cx + g.gw, g.yOf(to)]];
    ctx.beginPath(); ctx.moveTo(g.cx - g.gw, yLow); ctx.lineTo(pts[0][0] - 20, pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.lineTo(g.cx + g.gw, pts[pts.length - 1][1]); ctx.lineTo(g.cx + g.gw, yLow); ctx.closePath();
    const gr = ctx.createLinearGradient(g.cx - g.gw / 2, 0, g.cx + g.gw / 2, 0); gr.addColorStop(0, color); gr.addColorStop(0.5, color); gr.addColorStop(1, color);
    ctx.globalAlpha = 0.9; ctx.fillStyle = gr; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(g.cx - g.gw, yLow - 1, g.gw * 2, 1);
    if (top) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
    ctx.restore();
  }
  function jug(g, mouthX, mouthY, ang, color, u) {
    ctx.save(); ctx.translate(mouthX, mouthY); ctx.rotate(-ang);
    const bw = 70 * u, bh = 96 * u; // the body hangs from the mouth up and to the right when tipped
    ctx.fillStyle = '#d7dee4'; ctx.strokeStyle = '#26323c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4 * u, 0); ctx.lineTo(bw, -6 * u); ctx.quadraticCurveTo(bw + 12 * u, -bh * 0.5, bw - 6 * u, -bh); ctx.lineTo(10 * u, -bh); ctx.quadraticCurveTo(-8 * u, -bh * 0.5, -4 * u, 0); ctx.closePath();
    const bg = ctx.createLinearGradient(0, -bh, bw, 0); bg.addColorStop(0, '#f1f6f9'); bg.addColorStop(1, '#9fb0bc'); ctx.fillStyle = bg; ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(2 * u, -bh * 0.62, bw - 8 * u, bh * 0.2); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(2 * u, -bh * 0.62, bw - 8 * u, 3);
    ctx.strokeStyle = '#26323c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bw + 6 * u, -bh * 0.5, 16 * u, -1.3, 1.3); ctx.stroke(); // the handle
    ctx.restore();
  }

  /** One glass at geometry g: back wall, liquid layers [from, to, color], the measure marks, the target line with its bands (or a thin tick for a finished glass), the front. */
  function drawGlass(g, layers, target, amp, tt, live = false, leftLine = null) {
    const c = ctx, u = Math.min(W, H) / 400;
    c.save(); glassPath(g, 0); c.closePath(); c.fillStyle = 'rgba(190,225,240,.08)'; c.fill(); c.restore();
    for (const [from, to, color] of layers) layer(g, from, to, color, amp, tt, live);
    c.strokeStyle = 'rgba(230,245,250,.5)'; c.lineWidth = 1.5;
    for (let L = 10; L <= 90; L += 10) { const y = g.yOf(L), hw = g.halfAt(y), len = (L % 50 === 0 ? 14 : 8) * u; c.beginPath(); c.moveTo(g.cx + hw, y); c.lineTo(g.cx + hw - len, y); c.stroke(); }
    if (target) {
      const p = target, y = g.yOf(p.line), hw = g.halfAt(y);
      const yc0 = g.yOf(p.line + s.clean), yc1 = g.yOf(p.line - s.clean), yp0 = g.yOf(p.line + s.pass), yp1 = g.yOf(p.line - s.pass);
      c.fillStyle = 'rgba(255,200,87,.2)'; c.fillRect(g.cx - hw, yp0, hw * 2, yp1 - yp0); c.fillStyle = 'rgba(159,232,112,.32)'; c.fillRect(g.cx - hw, yc0, hw * 2, yc1 - yc0);
      c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.setLineDash([9 * u, 5 * u]); c.beginPath(); c.moveTo(g.cx - hw - 16 * u, y); c.lineTo(g.cx + hw + 16 * u, y); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(g.cx - hw - 18 * u, y - 7 * u); c.lineTo(g.cx - hw - 6 * u, y); c.lineTo(g.cx - hw - 18 * u, y + 7 * u); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(g.cx + hw + 18 * u, y - 7 * u); c.lineTo(g.cx + hw + 6 * u, y); c.lineTo(g.cx + hw + 18 * u, y + 7 * u); c.closePath(); c.fill();
    } else if (leftLine != null) { const y = g.yOf(leftLine), hw = g.halfAt(y); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(g.cx - hw, y); c.lineTo(g.cx + hw, y); c.stroke(); }
    c.save(); glassPath(g, 0); c.strokeStyle = 'rgba(220,240,250,.9)'; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke(); c.restore();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(g.cx - g.gw / 2 + 9 * u, g.top + 14 * u); c.lineTo(g.cx - g.gw * 0.43 + 11 * u, g.bottom - 26 * u); c.stroke();
    c.fillStyle = 'rgba(220,240,250,.9)'; c.fillRect(g.cx - g.gw / 2 - 5 * u, g.top - 3, 10 * u, 4); c.fillRect(g.cx + g.gw / 2 - 5 * u, g.top - 3, 10 * u, 4);
  }

  function draw(dt) {
    if (!W || !H) return;
    const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const calm = reducedMotion(), g = geo(), u = Math.min(W, H) / 400, tt = now() - t0;
    const sx = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0;
    c.save(); c.translate(sx, 0);
    bench(g);
    // the puddle from a spill
    if (puddle > 0.02) { c.globalAlpha = Math.min(0.75, puddle); c.fillStyle = puddleHue; c.beginPath(); c.ellipse(g.cx, g.bottom + 6 * u, g.gw * (0.45 + 0.4 * puddle), 7 * u * (0.6 + puddle * 0.5), 0, 0, TAU); c.fill(); c.globalAlpha = 1; }
    // the glass: back wall, the liquid, the lines, the front. A finished glass slides away and a fresh one slides in.
    const SL = 0.6, k = slide ? Math.min(1, slide.t / SL) : 1, ease = 1 - Math.pow(1 - k, 3);
    const gl = geo((1 - ease) * W * 0.62);
    if (slide && slide.t < SL) {
      const go = geo(-ease * W * 0.62); c.globalAlpha = 1 - ease * 0.6; drawGlass(go, [[0, slide.left.level, slide.left.color]], null, 0, tt, false, slide.left.line); c.globalAlpha = 1;
    }
    const amp = calm ? 0 : (1.2 + 5 * Math.max(slosh, streamK)) * u;
    drawGlass(gl, [[0, Math.max(0, shown), liquidOf(s).color]], s.done && s.pours.length >= s.N ? null : s.plan[Math.min(s.idx, s.N - 1)], amp, tt, true);
    const g2 = gl;
    // the jug and the stream
    const mouthX = gl.cx + 18 * u, mouthY = gl.top - gl.gh * 0.12 - 8 * u, want = s.holding ? 0.95 : 0.12;
    tilt += (want - tilt) * Math.min(1, dt * (s.holding ? 6 : 4)); streamK += ((s.holding ? 1 : 0) - streamK) * Math.min(1, dt * (s.holding ? 22 : 14));
    jug(gl, mouthX, mouthY, tilt, liquidOf(s).color, u);
    if (streamK > 0.04 && !calm || streamK > 0.04) {
      const surfaceY = gl.yOf(shown) - 1, sw = (3 + 4.5 * (rateAt(s) / s.rate)) * u * streamK, col = liquidOf(s).color;
      c.fillStyle = col; c.globalAlpha = 0.92; c.beginPath(); c.moveTo(gl.cx - sw / 2 + 4 * u, mouthY + 2); c.lineTo(gl.cx + sw / 2 + 4 * u, mouthY + 2); c.lineTo(gl.cx + sw * 0.4, surfaceY); c.lineTo(gl.cx - sw * 0.4, surfaceY); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(gl.cx - sw * 0.1 + 4 * u, mouthY + 2, Math.max(1, sw * 0.18), surfaceY - mouthY); c.globalAlpha = 1;
      if (!calm && rnd() < 0.5) splash(gl.cx + (rnd() - 0.5) * sw, surfaceY, col, 1, 0.35);
    }
    for (const r of rings) { const k = 1 - r.life / 0.6; c.globalAlpha = Math.max(0, 1 - k); c.strokeStyle = r.hue; c.lineWidth = 4; c.beginPath(); c.ellipse(r.x, r.y, gl.gw * (0.35 + 0.35 * k), 6 * u + 8 * u * k, 0, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    // a spill: the sheet running down the outside of the rim
    if (spillAnim && spillAnim.t < 0.9) { const k = Math.min(1, spillAnim.t / 0.5); c.fillStyle = spillAnim.color; c.globalAlpha = 0.85 * (1 - Math.max(0, (spillAnim.t - 0.5) / 0.4)); const hh = (g.bottom - g.top) * 0.85 * k; for (const sd of [-1, 1]) { const x = g.cx + sd * (g.gw / 2 + 3 * u); c.fillRect(Math.min(x, x + sd * 6 * u), g.top, 6 * u, hh); } c.globalAlpha = 1; }
    for (const p of drops) { c.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2)); c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, 2.4 * u, 0, TAU); c.fill(); } c.globalAlpha = 1;
    if (flash > 0) { c.globalAlpha = flash * 0.2; c.fillStyle = flashHue; c.fillRect(-10, -10, W + 20, H + 20); c.globalAlpha = 1; }
    c.restore();
  }

  function step(dt) {
    const t = now();
    pourTick(s, t);
    for (const ev of s.events.splice(0)) handle(ev);
    if (slide) { slide.t += dt; if (slide.t > 0.65) slide = null; }
    shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 2.2); nudge = Math.max(0, nudge - dt * 4); slosh = Math.max(0, slosh - dt * 1.6); puddle = Math.max(0, puddle - dt * 0.04);
    for (const r of rings) r.life -= dt; rings = rings.filter((x) => x.life > 0);
    for (const p of drops) { p.life -= dt; p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } drops = drops.filter((p) => p.life > 0);
    // the shown level: follows the real one while pouring, surges to the rim on a spill, then drains back to where the pour began
    if (spillAnim) {
      spillAnim.t += dt;
      if (spillAnim.t < 0.18) shown += (100 - shown) * Math.min(1, dt * 18);
      else { shown += (s.level - shown) * Math.min(1, dt * 5); if (spillAnim.t > 0.2 && spillAnim.t < 0.24) splash(geo().cx, geo().yOf(100), spillAnim.color, 14, 1.2); }
      if (spillAnim.t > 1.0) spillAnim = null;
    } else shown += (s.level - shown) * Math.min(1, dt * (s.holding ? 40 : 14));
    if (Math.abs(shown - s.level) < 0.05 && !spillAnim) shown = s.level;
    // gauges
    const line = lineOf(s), liq = liquidOf(s);
    if (s.idx !== shownIdx || line !== shownPour) {
      shownIdx = s.idx; shownPour = line;
      passZone.style.left = `${Math.max(0, line - s.pass)}%`; passZone.style.width = `${Math.min(100, line + s.pass) - Math.max(0, line - s.pass)}%`;
      cleanZone.style.left = `${Math.max(0, line - s.clean)}%`; cleanZone.style.width = `${Math.min(100, line + s.clean) - Math.max(0, line - s.clean)}%`;
      lineTick.style.left = `${line}%`; glassFill.style.background = liq.color;
      liquidName.textContent = s.done ? '' : liq.name;
    }
    const word = pourWord(s), gap = line - s.level;
    glassFill.style.width = `${Math.max(0, Math.min(100, shown))}%`; glassWord.textContent = word;
    glassFill.parentElement.dataset.state = s.done ? 'idle' : s.spillWait ? 'over' : s.holding ? (word === 'on the line: stop' ? 'right' : word === 'a bit much: stop' ? 'over' : word === 'nearly' ? 'near' : 'soft') : 'idle';
    void gap;
    if (shownDone !== s.pours.length || shownSpills !== s.spills) {
      shownDone = s.pours.length; shownSpills = s.spills;
      pips.replaceChildren(...s.plan.map((p, i) => h('i', { class: i < s.pours.length ? 'on' : i === s.idx && !s.done ? 'now' : '', style: i < s.pours.length ? `background:${p.color}` : null })), ...Array.from({ length: s.spills }, () => h('i', { class: 'dent' })));
    }
    // the pad: wakes when ready, pulses full while the surface is within the green, rests a moment after a pour is settled
    const rest = now() < lockUntil, ready = !s.done && !rest, glow = !ready ? 0 : s.holding ? (word === 'on the line: stop' ? 1 : 0.2) : 0.45;
    pourPad.classList.toggle('is-next', ready); pourPad.style.setProperty('--glow', glow.toFixed(3)); pourPad.classList.toggle('is-hush', nudge > 0);
    pourPad.querySelector('span').textContent = s.holding ? 'let go on the line' : s.presses > 0 ? 'hold to top up' : 'hold to pour';
    giveUp.disabled = s.done; pourPad.disabled = s.done;
    draw(dt);
  }
  const stop = loop((dt) => { step(dt); if (s.done && !ended && endAt && performance.now() - endAt > 1100) { ended = true; stop(); unhook(); finish(s.result); } });
  return promise;
}

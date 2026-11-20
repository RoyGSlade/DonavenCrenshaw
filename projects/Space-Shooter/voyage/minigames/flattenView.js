// Flatten on screen: a steel sheet with domed bubbles (a bigger dome needs a harder blow). Tap a bubble to put the hammer over it, then
// hold the big Swing pad (or Space) to charge: the hammer rises, and it LEANS from side to side. Steer against the lean (the mouse
// toward the other side on a desktop; on a phone drag the thumb sideways while you hold the pad), and let go with the power in the
// green. No number is shown: a power gauge with the right band drawn on it and a word (too soft / just right / too hard), a lean gauge
// with its limits and a word (steady / leaning left / too far right), pips for the bubbles and the dimples.
// Resolves with the pure result. The pure rules (and the clock: a time in seconds for every call) are flatten.js.
import { flattenSelect, flattenSteer, flattenCharge, flattenRelease, flattenGiveUp, powerOf, leanOf, bubbleOf, powerWord, leanWord, LEAN_LIMIT } from './flatten.js';
import { h, ensureStyle, loop, lcg } from './craftChainView.js';

const TAU = Math.PI * 2;
const now = () => performance.now() / 1000;

function makeSheet(w, h_, dpr) {
  const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h_ * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const r = lcg(41);
  const grad = g.createLinearGradient(0, 0, w, h_); grad.addColorStop(0, '#7e8a95'); grad.addColorStop(0.45, '#aeb9c2'); grad.addColorStop(1, '#68747f');
  g.fillStyle = grad; g.fillRect(0, 0, w, h_);
  for (let i = 0; i < Math.round((w * h_) / 700); i++) { const y = r() * h_, x = r() * w, len = 30 + r() * 200; g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(20,30,40,.06)'; g.lineWidth = 0.6 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 2); g.stroke(); }
  const vg = g.createRadialGradient(w / 2, h_ / 2, Math.min(w, h_) * 0.3, w / 2, h_ / 2, Math.max(w, h_) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,14,22,.5)'); g.fillStyle = vg; g.fillRect(0, 0, w, h_);
  for (const [x, y] of [[16, 16], [w - 16, 16], [16, h_ - 16], [w - 16, h_ - 16]]) { g.fillStyle = '#4c5864'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.fillStyle = '#c9d3db'; g.beginPath(); g.arc(x - 1, y - 1, 3.4, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(10,18,26,.55)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h_ - 4);
  return c;
}

export function playFlatten(root, { state, what = 'plate', reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state;
  const canvas = h('canvas', { class: 'cc-canvas cc-flatcanvas', 'aria-label': `A steel ${what} with domed bubbles. Tap a bubble, then hold Swing to charge the hammer and let go to flatten it.` });
  const ctx = canvas.getContext('2d');

  // the HUD: power with the right band drawn on it, the lean with its limits, the bubbles and the dimples as pips
  const powerFill = h('i'), powerZone = h('s', { class: 'cc-zone' }), powerTick = h('b', { class: 'cc-tick' }), powerWord_ = h('em', { text: 'pick a bubble' });
  const leanZoneL = h('u', { class: 'cc-over cc-overl' }), leanZoneR = h('u', { class: 'cc-over cc-overr' }), leanMid = h('b', { class: 'cc-mid' }), leanNeedle = h('i', { class: 'cc-needle cc-leanneedle' }), leanWord_ = h('em', { text: 'steady' });
  const pips = h('div', { class: 'cc-pips', role: 'img', 'aria-label': 'Bubbles still to flatten, and the dimples so far' });
  const hud = h('div', { class: 'cc-hud cc-hud3 cc-flathud' },
    h('div', { class: 'cc-stat cc-powerstat' }, h('span', { text: 'Power' }), h('div', { class: 'cc-meter cc-power', role: 'img', 'aria-label': 'Hammer power. The green band is the right power for the picked bubble.' }, powerZone, powerFill, powerTick), powerWord_),
    h('div', { class: 'cc-stat cc-leanstat' }, h('span', { text: 'Lean' }), h('div', { class: 'cc-meter cc-lean', role: 'img', 'aria-label': 'How far the hammer leans. The red ends are too far over: the blow would land beside the bubble.' }, leanZoneL, leanZoneR, leanMid, leanNeedle), leanWord_),
    h('div', { class: 'cc-stat cc-pipstat' }, h('span', { text: 'Bubbles' }), pips));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: 'Tap a bubble, then hold Swing to charge. If the hammer leans left, steer right (a thumb drag, or the mouse); let go with the power in the green.' });
  const giveUp = h('button', { type: 'button', class: 'ui-btn cc-done cc-giveup', text: `Give up this ${what}` });
  const swingPad = h('button', { type: 'button', class: 'primary ui-btn cc-pad cc-swing', 'aria-label': 'Swing pad. Hold to charge the hammer, slide sideways to steer, let go to swing. Space does the same.' }, h('b', { text: 'SWING' }), h('span', { text: 'hold to charge' }));
  const wrap = h('div', { class: 'cc-boardwrap cc-flatwrap' }, canvas);
  const panel = h('section', { class: 'rp-panel cc-panel cc-flatpanel mg-skin ui-panel', role: 'group', 'aria-label': `Flatten the ${what}`, 'data-game': 'flatten' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `FLATTEN · ${what.toUpperCase()}` }),
    h('div', { class: 'cc-play' }, hud, wrap, status, h('div', { class: 'cc-row cc-giverow' }, giveUp)),
    h('div', { class: 'cc-row cc-flatrow' }, swingPad),
    h('p', { class: 'rp-help', text: 'Tap a bubble, hold Swing (or Space) to charge. Too soft shrinks it, too hard leaves a dimple. The hammer leans while you hold: steer against it, and let go before it leans too far or the blow lands beside the bubble.' }));
  panel.__state = s;
  root.append(panel);

  // ---- the board: the canvas is the size of its box; bubbles live in the unit square, mapped inside a margin ----------------------------
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  let W = 0, H = 0, sheet = null;
  const M = 22;
  const fit = () => {
    const w = wrap.clientWidth, hh = wrap.clientHeight; if (!w || !hh || (w === W && hh === H)) return;
    W = w; H = hh; canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); sheet = makeSheet(w, hh, dpr);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);
  requestAnimationFrame(fit);
  const px = (u) => ({ x: M + u.x * (W - 2 * M), y: M + u.y * (H - 2 * M) });
  const unit = () => Math.min(W, H);
  const radiusOf = (need) => unit() * 0.0125 * Math.sqrt(need) + 4;
  panel.__view = () => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, w: W, h: H, at: (b) => { const p = px(b); return { x: r.left + p.x, y: r.top + p.y }; }, radius: (b) => radiusOf(b.need) }; };

  // ---- input ----------------------------------------------------------------------------------------------------------------
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  let padHold = false, padId = null, padRect = null, spaceHold = false, endAt = 0, ended = false;
  const startCharge = () => {
    if (s.done || s.charging) return false;
    if (s.selected == null && s.bubbles.length === 1) flattenSelect(s, s.bubbles[0].id);
    if (s.selected == null) { status.textContent = 'Pick a bubble first: tap one on the sheet.'; nudge = 1; return false; }
    return flattenCharge(s, now());
  };
  const letGo = () => { if (s.charging) flattenRelease(s, now()); };
  canvas.addEventListener('pointerdown', (e) => {
    if (s.done || s.charging) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, slack = e.pointerType === 'touch' ? 26 : 12;
    let best = null, bd = 1e9;
    for (const b of s.bubbles) { const p = px(b), d = Math.hypot(p.x - x, p.y - y); if (d < radiusOf(b.need) + slack && d < bd) { best = b; bd = d; } }
    if (best) { flattenSelect(s, best.id); status.textContent = 'Hammer over it. Hold Swing to charge; the green band is the right power.'; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // the mouse steers while you charge (toward the side opposite the lean); a finger steers by sliding on the Swing pad
  document.addEventListener('pointermove', onMove, true);
  function onMove(e) {
    if (s.done) return;
    if (padHold && e.pointerId === padId) { const half = Math.max(40, padRect.width * 0.42); flattenSteer(s, (e.clientX - (padRect.left + padRect.width / 2)) / half); return; }
    if (e.pointerType !== 'mouse' || padHold) return;
    const b = bubbleOf(s); if (!b) return;
    const r = canvas.getBoundingClientRect(), hx = r.left + px(b).x; flattenSteer(s, (e.clientX - hx) / Math.max(120, r.width * 0.22));
  }
  swingPad.addEventListener('pointerdown', (e) => {
    e.preventDefault(); if (padHold) return;
    swingPad.classList.add('is-down'); setTimeout(() => swingPad.classList.remove('is-down'), 140);
    if (!startCharge()) return;
    padHold = true; padId = e.pointerId; padRect = swingPad.getBoundingClientRect(); try { swingPad.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    flattenSteer(s, (e.clientX - (padRect.left + padRect.width / 2)) / Math.max(40, padRect.width * 0.42));
  });
  const padUp = (e) => { if (!padHold || e.pointerId !== padId) return; padHold = false; padId = null; letGo(); };
  swingPad.addEventListener('pointerup', padUp); swingPad.addEventListener('pointercancel', padUp); swingPad.addEventListener('lostpointercapture', padUp);
  swingPad.addEventListener('contextmenu', (e) => e.preventDefault());
  swingPad.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
  giveUp.addEventListener('click', () => { if (!s.done) flattenGiveUp(s); });
  const onKey = (e) => { if (s.done || e.ctrlKey || e.metaKey || e.altKey || e.key !== ' ') return; e.preventDefault(); if (e.repeat || spaceHold) return; spaceHold = true; if (!startCharge()) spaceHold = false; };
  const onKeyUp = (e) => { if (e.key !== ' ' || !spaceHold) return; spaceHold = false; letGo(); };
  document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
  const unhook = () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); document.removeEventListener('pointermove', onMove, true); };

  // ---- the picture ------------------------------------------------------------------------------------------------------------------
  const rnd = lcg(77);
  const view = new Map(); // bubble id -> drawn radius (eases toward the real one: shrinks when hit soft, grows in when new)
  let ghosts = [], sparks = [], rings = [], hit = null, shake = 0, flash = 0, flashHue = '#9fe870', nudge = 0, drawnLean = 0, shownSel = null, shownNeed = null, shownLeft = -1, shownDim = -1;
  const say = (t) => { status.textContent = t; };
  const burst = (x, y, n, hot) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = 60 + 200 * rnd() * hot; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.3 + 0.4 * rnd() }); } };

  function handle(ev) {
    const at = (x, y) => px({ x, y });
    if (ev.type === 'flat' || ev.type === 'hard') {
      const p = at(ev.x, ev.y), r = view.get(ev.id) || 20;
      ghosts.push({ x: p.x, y: p.y, r, life: 0.38, hard: ev.type === 'hard' }); rings.push({ x: p.x, y: p.y, life: 0.5, hue: ev.type === 'flat' ? '#9fe870' : '#ff6b5a' });
      burst(p.x, p.y, ev.type === 'flat' ? 10 : 22, ev.type === 'flat' ? 0.8 : 1.4); hit = { x: p.x, y: p.y, t: 0.3 }; shake = ev.type === 'flat' ? 3 : 9; flash = ev.type === 'flat' ? 0.4 : 0.9; flashHue = ev.type === 'flat' ? '#9fe870' : '#ff6b5a';
      say(ev.type === 'flat' ? (s.bubbles.length ? 'Flat. Pick the next bubble.' : 'Flat.') : 'Too hard: a dimple, and it stays (-8). Pick the next bubble.');
    } else if (ev.type === 'soft') {
      const p = at(ev.x, ev.y); rings.push({ x: p.x, y: p.y, life: 0.4, hue: '#ffc857' }); burst(p.x, p.y, 6, 0.6); hit = { x: p.x, y: p.y, t: 0.25 }; shake = 2;
      say('Too soft: the bubble shrank but it is still there. Hit it again, a little harder.');
    } else if (ev.type === 'miss-soft' || ev.type === 'miss-hard') {
      const dir = ev.lean < 0 ? -1 : 1, p = at(ev.x + dir * 0.07, ev.y + 0.05); rings.push({ x: p.x, y: p.y, life: 0.5, hue: '#ff6b5a' }); burst(p.x, p.y, 16, 1.1); hit = { x: p.x, y: p.y, t: 0.3 }; shake = 8; flash = 0.7; flashHue = '#ff6b5a';
      say(ev.type === 'miss-hard' ? 'The hammer leaned too far: it landed beside the bubble and left a dimple (-8).' : 'The hammer leaned too far: it landed beside the bubble and made a small new one.');
    } else if (ev.type === 'done') {
      say(ev.how === 'gave-up' ? 'Given up.' : ev.success ? 'Flat.' : 'Too rough.'); endAt = performance.now();
    }
  }

  function dome(g, x, y, r, tone = 1) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = r * 0.5; g.shadowOffsetY = r * 0.18;
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, `rgba(${Math.round(240 * tone)},${Math.round(246 * tone)},255,1)`); gr.addColorStop(0.55, '#a9b6c1'); gr.addColorStop(1, '#6a7782');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(20,30,40,.55)'; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  function dimple(g, x, y, r) {
    const gr = g.createRadialGradient(x + r * 0.25, y + r * 0.3, r * 0.05, x, y, r); gr.addColorStop(0, 'rgba(10,16,22,.75)'); gr.addColorStop(0.7, 'rgba(25,34,44,.55)'); gr.addColorStop(1, 'rgba(25,34,44,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r * 0.78, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x, y, r * 0.78, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  }
  function hammer(g, x, y, lift, lean, danger, strike) {
    g.save(); g.translate(x, y - lift); g.rotate(lean * 0.75);
    if (danger) { g.shadowColor = '#ff5a45'; g.shadowBlur = 18; }
    const u = unit() / 340;
    g.fillStyle = '#5b3a24'; g.strokeStyle = '#2a1a10'; g.lineWidth = 2; g.beginPath(); g.roundRect(-5 * u, -150 * u, 10 * u, 150 * u, 4); g.fill(); g.stroke(); // the handle, hanging below the head's pivot
    const hg = g.createLinearGradient(0, -34 * u, 0, 6 * u); hg.addColorStop(0, '#c7d2da'); hg.addColorStop(1, '#6c7a85');
    g.fillStyle = hg; g.strokeStyle = '#27323b'; g.beginPath(); g.roundRect(-34 * u, -20 * u, 68 * u, 34 * u, 6); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-30 * u, -17 * u, 60 * u, 4 * u);
    g.restore(); void strike;
  }

  function draw(dt) {
    if (!W || !H) return;
    const g = ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const calm = reducedMotion(), sx = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0, sy = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0;
    g.save(); g.translate(sx, sy); g.drawImage(sheet, 0, 0, W, H);
    for (const d of s.dimples) { const p = px(d); dimple(g, p.x, p.y, unit() * 0.045 + 6); }
    for (const b of s.bubbles) {
      const p = px(b), want = radiusOf(b.need), cur = view.has(b.id) ? view.get(b.id) : (b.need === 30 && b.id > s.N ? 0 : want);
      const next = cur + (want - cur) * Math.min(1, dt * 14); view.set(b.id, next);
      dome(g, p.x, p.y, Math.max(2, next), b.id === s.selected ? 1.05 : 1);
      if (b.id === s.selected) { g.strokeStyle = s.charging ? '#fff' : '#7fe8e0'; g.lineWidth = 2.5; g.setLineDash([7, 6]); g.lineDashOffset = -now() * 20; g.beginPath(); g.arc(p.x, p.y, next + 9, 0, TAU); g.stroke(); g.setLineDash([]); }
    }
    for (const gh of ghosts) { const k = gh.life / 0.38, p = { x: gh.x, y: gh.y }; g.globalAlpha = Math.max(0, k); dome(g, p.x, p.y, Math.max(1, gh.r * (0.35 + 0.65 * k)), 1); g.globalAlpha = 1; if (gh.hard) dimple(g, p.x, p.y, unit() * 0.045 + 6); }
    for (const r of rings) { const k = 1 - r.life / 0.5; g.globalAlpha = Math.max(0, 1 - k); g.strokeStyle = r.hue; g.lineWidth = 4; g.beginPath(); g.arc(r.x, r.y, 10 + k * 60, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    // the hammer: over the picked bubble, rising as it charges, leaning with the drift; it comes down at the blow
    const sel = bubbleOf(s);
    const t = now(), lean = s.charging ? leanOf(s, t) : 0; drawnLean += (lean - drawnLean) * Math.min(1, dt * 20);
    if (hit && hit.t > 0) { const k = 1 - hit.t / 0.3; hammer(g, hit.x, hit.y, 14 * (1 - Math.min(1, k * 3)), 0, false, true); }
    else if (sel) { const p = px(sel), pw = powerOf(s, t) / 100; hammer(g, p.x, p.y - radiusOf(sel.need) * 0.4, 16 + (s.charging ? 70 * pw : 6 + 4 * Math.sin(t * 4)), drawnLean, Math.abs(lean) > LEAN_LIMIT, false); }
    for (const p of sparks) { g.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5)); g.fillStyle = p.life > 0.3 ? '#fff3b0' : '#ff9a3c'; g.fillRect(p.x - 2, p.y - 2, 4, 4); } g.globalAlpha = 1;
    if (flash > 0) { g.globalAlpha = flash * 0.22; g.fillStyle = flashHue; g.fillRect(-10, -10, W + 20, H + 20); g.globalAlpha = 1; }
    g.restore();
  }

  function step(dt) {
    for (const ev of s.events.splice(0)) handle(ev);
    shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 2.2); nudge = Math.max(0, nudge - dt * 4);
    if (hit) hit.t -= dt; for (const gh of ghosts) gh.life -= dt; ghosts = ghosts.filter((x) => x.life > 0); for (const r of rings) r.life -= dt; rings = rings.filter((x) => x.life > 0);
    for (const p of sparks) { p.life -= dt; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } sparks = sparks.filter((p) => p.life > 0);
    const t = now(), sel = bubbleOf(s);
    // gauges
    if (s.selected !== shownSel || (sel && sel.need !== shownNeed)) {
      shownSel = s.selected; shownNeed = sel ? sel.need : null;
      powerZone.style.display = powerTick.style.display = sel ? '' : 'none';
      if (sel) { powerZone.style.left = `${Math.max(0, sel.need - s.band)}%`; powerZone.style.width = `${Math.min(100, sel.need + s.band) - Math.max(0, sel.need - s.band)}%`; powerTick.style.left = `${sel.need}%`; }
    }
    const pw = powerOf(s, t), word = s.done ? 'done' : !sel ? 'pick a bubble' : s.charging ? powerWord(s, t) : 'hold Swing';
    powerFill.style.width = `${pw}%`; powerWord_.textContent = word; powerFill.parentElement.dataset.state = s.charging && sel ? (word === 'just right' ? 'right' : word === 'too hard' ? 'hard' : 'soft') : 'idle';
    const lean = s.charging ? leanOf(s, t) : 0, clamped = Math.max(-1, Math.min(1, lean));
    leanNeedle.style.left = `${50 + 50 * clamped}%`; leanWord_.textContent = s.charging ? leanWord(lean) : 'steady';
    const lim = (50 * LEAN_LIMIT) / 1; leanZoneL.style.cssText = `left:0;width:${50 - lim}%`; leanZoneR.style.cssText = `right:0;width:${50 - lim}%`;
    leanNeedle.parentElement.dataset.state = s.charging ? (Math.abs(lean) > LEAN_LIMIT ? 'over' : 'ok') : 'idle';
    if (shownLeft !== s.bubbles.length || shownDim !== s.dimples.length) {
      shownLeft = s.bubbles.length; shownDim = s.dimples.length;
      pips.replaceChildren(...Array.from({ length: s.N }, (_, i) => h('i', { class: i < s.N - Math.min(s.N, s.bubbles.length) ? 'on' : '' })), ...s.dimples.map(() => h('i', { class: 'dent' })));
    }
    // the swing pad glows when a bubble is picked, and pulses full while the power is in the right band
    const ready = !s.done && sel != null, glow = !ready ? 0 : s.charging ? (word === 'just right' ? 1 : 0.2) : 0.45;
    swingPad.classList.toggle('is-next', ready); swingPad.style.setProperty('--glow', glow.toFixed(3)); swingPad.classList.toggle('is-hush', nudge > 0);
    giveUp.disabled = s.done; swingPad.disabled = s.done;
    draw(dt);
  }
  const stop = loop((dt) => { step(dt); if (s.done && !ended && endAt && performance.now() - endAt > 900) { ended = true; stop(); unhook(); finish(s.result); } });
  return promise;
}

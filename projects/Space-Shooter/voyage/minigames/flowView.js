// The foam valve on screen (opening track C, scene 1): a glass tank of foam you fill into the marked band, three hand-wheels you turn,
// and the floor below taking every drop that leaks or runs over. Wheels: press one and circle it (clockwise shuts, the other way opens);
// keyboard: focus a wheel, Right or Up shuts, Left or Down opens. No digits on screen: words, the liquid itself, and pips.
// Resolves with the rules' result ({ success, how, spilled, valveShut }).
import { createFlow, turnValve, stepFlow, shutAll, floorFill, inBand, valveWord, VALVES, VALVE_NAME, BAND, HOLD, TRAVEL } from './flow.js';
import { h, loop, ensureStyle } from './craftChainView.js';
import { ensureHandsOnStyle } from './handsOnKit.js';

const TAU = Math.PI * 2;
/** The scene's layout: wide on a landscape screen, tall on an upright phone (the tank scene fills the height between the HUD and the wheels). */
export function sceneFor(w = innerWidth, hgt = innerHeight) {
  if (hgt > w * 1.1) {
    return { tall: true, W: 420, H: 640, T: { x: 112, y: 96, w: 176, h: 330 }, fy: 566,
      feed: [[155, 8], [155, 104]], leak: [[280, 352], [372, 352], [372, 548]], drain: [[176, 426], [176, 556]],
      lbl: { feed: [168, 30], leak: [296, 332], drain: [190, 470], line: [300, 0], over: [296, 120] }, drip: [372, 548], splash: 208 };
  }
  return { tall: false, W: 640, H: 400, T: { x: 190, y: 40, w: 190, h: 270 }, fy: 336,
    feed: [[40, 78], [198, 78]], leak: [[372, 250], [520, 250], [520, 318]], drain: [[260, 310], [260, 340]],
    lbl: { feed: [44, 64], leak: [470, 232], drain: [270, 340], line: [0, 0], over: [0, 0] }, drip: [520, 318], splash: 330 };
}
const HINT = { feed: 'opens the foam in', leak: 'tighten it to stop the leak', drain: 'trims the tank down' };

export function playFlowGame(root, { state, setup = {}, title = 'Foam valve', sound = () => {}, reducedMotion = () => false } = {}) {
  ensureStyle(); ensureHandsOnStyle();
  const s = state || createFlow({ setup });
  const G = sceneFor(), { W, H, T, fy } = G;
  const canvas = h('canvas', { class: 'ho-canvas ho-flowcanvas', width: String(W), height: String(H), role: 'img', 'aria-label': 'A tank of foam with a marked fill band, a foam feed, a stuck leaking valve and a drain, and the floor under it.' });
  const ctx = canvas.getContext('2d');
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: 'The stuck valve is pouring foam on the floor. Tighten it, open the feed, and stop at the line.' });
  const floorWord = h('em', { class: 'ho-floorword', text: 'dry' });
  const holdPips = h('span', { class: 'ho-pips ho-holdpips', 'aria-label': 'Held at the line' }, ...Array.from({ length: 5 }, () => h('i')));
  const hud = h('div', { class: 'cc-hud ho-hud ho-flowhud' }, h('div', { class: 'cc-stat' }, h('span', { text: 'Floor' }), floorWord), h('div', { class: 'cc-stat' }, h('span', { text: 'Held at the line' }), holdPips));
  const wheels = {};
  const row = h('div', { class: 'ho-wheels' });
  for (const id of VALVES) {
    const rim = h('div', { class: 'ho-wheel-rim', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('b'));
    const word = h('em', { class: 'ho-wheel-word', text: valveWord(s.valves[id]) });
    const el = h('div', { class: `ho-wheel ho-wheel-${id}`, 'data-valve': id, role: 'slider', tabindex: '0', 'aria-label': `${VALVE_NAME[id]}: ${HINT[id]}. Circle it clockwise to shut, the other way to open.`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(s.valves[id] * 100)) },
      rim, h('span', { class: 'ho-wheel-name', text: VALVE_NAME[id] }), word, h('span', { class: 'ho-wheel-hint', text: HINT[id] }));
    wheels[id] = { el, rim, word, turns: 0 };
    row.append(el);
    // circle it: the angle round the wheel's centre, accumulated
    let last = null;
    const ang = (e) => { const r = rim.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    el.addEventListener('pointerdown', (e) => { if (s.done) return; e.preventDefault(); el.setPointerCapture?.(e.pointerId); last = ang(e); });
    el.addEventListener('pointermove', (e) => {
      if (last == null || s.done) return; e.preventDefault();
      const a = ang(e); let d = a - last; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; last = a;
      turnValve(s, id, d / TAU); wheels[id].turns += d / TAU;
    });
    const up = () => { last = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    const keys = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    el.addEventListener('keydown', (e) => { const k = keys[e.key]; if (!k || s.done) return; e.preventDefault(); turnValve(s, id, k * 0.15); wheels[id].turns += k * 0.15; });
  }
  const panel = h('section', { class: 'rp-panel cc-panel ho-panel ho-flow mg-skin ui-panel', role: 'group', 'aria-label': title, 'data-game': 'flow', 'data-flavor': 'foam' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `VALVES · ${title.toUpperCase()}` }), hud,
    h('div', { class: 'ho-wrap ho-flowwrap' }, canvas), row, status,
    h('p', { class: 'rp-help', text: 'Circle a wheel to turn it: clockwise shuts it, the other way opens it. Shut the stuck valve, open the feed, and keep the foam inside the marked band for a few seconds. Foam that leaks or runs over lands on the floor; a full floor floods the room.' }));
  panel.__state = s;
  root.append(panel);
  const wrapEl = panel.querySelector('.ho-flowwrap');
  const fit = () => { const aw = wrapEl.clientWidth, ah = wrapEl.clientHeight; if (!aw || !ah) return; const w = Math.floor(Math.min(aw, ah * (W / H))); canvas.style.width = `${w}px`; canvas.style.height = `${Math.floor(w * H / W)}px`; };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrapEl);
  requestAnimationFrame(fit);
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;

  let wave = 0, drips = [], splashes = [], bubbles = [], ended = false, endAt = 0, said = '';
  const say = (t) => { if (t !== said) { said = t; status.textContent = t; } };
  const levelY = (l) => T.y + T.h - l * T.h;
  const rr = (x, y, w, hh, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, hh, r); else ctx.rect(x, y, w, hh); };
  const pipe = (pts, flow, color) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.strokeStyle = '#1d2830'; ctx.lineWidth = 20; path(); ctx.stroke();
    ctx.strokeStyle = '#46596a'; ctx.lineWidth = 14; path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.save(); ctx.translate(-3, -3); path(); ctx.stroke(); ctx.restore();
    if (flow > 0.02) { ctx.strokeStyle = color; ctx.lineWidth = 3 + 8 * flow; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -wave * 46; path(); ctx.stroke(); ctx.setLineDash([]); }
  };
  const flange = ([x, y]) => { ctx.fillStyle = '#6b7c8a'; ctx.strokeStyle = '#1d2830'; ctx.lineWidth = 2; rr(x - 13, y - 13, 26, 26, 5); ctx.fill(); ctx.stroke(); };
  function draw(dt) {
    wave += dt;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#182630'); bg.addColorStop(1, '#0d151c'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // the floor plate: riveted steel with grating lines; the spill pools on it
    const fill = floorFill(s);
    const pl = ctx.createLinearGradient(0, fy, 0, H); pl.addColorStop(0, '#34424d'); pl.addColorStop(1, '#1c262e');
    ctx.fillStyle = pl; ctx.fillRect(0, fy, W, H - fy);
    ctx.fillStyle = '#586a78'; ctx.fillRect(0, fy, W, 4);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; for (let x = 20; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, fy + 6); ctx.lineTo(x - 14, H); ctx.stroke(); }
    ctx.fillStyle = '#7f909c'; for (let x = 16; x < W; x += 96) { ctx.beginPath(); ctx.arc(x, fy + 14, 3, 0, TAU); ctx.fill(); }
    if (fill > 0.005) {
      const pw = 50 + fill * (W - 70), ph = 6 + fill * Math.min(46, (H - fy) / 2 - 4), cx = G.splash, cy = fy + (H - fy) * 0.55;
      const pg = ctx.createRadialGradient(cx, cy, 4, cx, cy, pw / 2);
      pg.addColorStop(0, 'rgba(240,255,246,.96)'); pg.addColorStop(0.7, 'rgba(205,240,222,.7)'); pg.addColorStop(1, 'rgba(190,232,212,.1)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(cx, cy, pw / 2, ph, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(cx - pw * 0.12, cy - ph * 0.3, pw * 0.14, ph * 0.25, 0, 0, TAU); ctx.fill();
    }
    // pipes: the feed, the stuck valve out of the tank's side, the drain out of the bottom
    pipe(G.feed, s.valves.feed, '#e8f9ef'); pipe(G.leak, s.valves.leak, '#e8f9ef'); pipe(G.drain, s.valves.drain, '#cfe3d9');
    flange(G.feed[G.feed.length - 1]); flange(G.leak[0]); flange(G.drain[0]);
    // the leak: drips fall from the pipe's end and splash on the plate
    if (!reducedMotion()) {
      if (s.valves.leak > 0.05 && Math.random() < s.valves.leak * dt * 22) drips.push({ x: G.drip[0] + (Math.random() - 0.5) * 6, y: G.drip[1], v: 0 });
      if (s.level >= 1 && Math.random() < dt * 40) drips.push({ x: T.x + Math.random() * T.w, y: T.y, v: 0 });
      if (s.valves.drain > 0.05 && Math.random() < s.valves.drain * dt * 14) drips.push({ x: G.drain[1][0] + (Math.random() - 0.5) * 6, y: G.drain[1][1], v: 0 });
    }
    ctx.fillStyle = '#eefcf3';
    drips = drips.filter((d) => {
      d.v += 700 * dt; d.y += d.v * dt;
      if (d.y > fy + 8) { for (let k = 0; k < 4; k++) splashes.push({ x: d.x, y: fy + 8, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 90, life: 0.45 }); return false; }
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 3.5, 6, 0, 0, TAU); ctx.fill(); return true;
    });
    splashes = splashes.filter((p) => { p.life -= dt; if (p.life <= 0) return false; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = Math.min(1, p.life * 3); ctx.beginPath(); ctx.arc(p.x, Math.min(p.y, fy + 8), 2.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; return true; });
    // the tank: glass, foam with a wobbling top and rising bubbles, the fill band, glass highlights
    const ty = levelY(s.level);
    ctx.save(); rr(T.x, T.y, T.w, T.h, 14); ctx.clip();
    ctx.fillStyle = 'rgba(12,24,32,.92)'; ctx.fillRect(T.x, T.y, T.w, T.h);
    const busy = s.valves.feed > 0.05 || s.valves.leak > 0.05 || s.valves.drain > 0.05;
    const amp = busy ? 4 : 1.5;
    const g = ctx.createLinearGradient(0, ty, 0, T.y + T.h); g.addColorStop(0, 'rgba(244,255,248,.97)'); g.addColorStop(0.25, 'rgba(210,244,226,.95)'); g.addColorStop(1, 'rgba(150,208,180,.92)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(T.x, T.y + T.h);
    for (let x = 0; x <= T.w; x += 6) ctx.lineTo(T.x + x, ty + Math.sin(wave * 3.2 + x / 13) * amp + Math.sin(wave * 5.1 + x / 7) * amp * 0.5);
    ctx.lineTo(T.x + T.w, T.y + T.h); ctx.closePath(); ctx.fill();
    // foam froth on the surface
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let x = 6; x < T.w; x += 14) { const yy = ty + Math.sin(wave * 3.2 + x / 13) * amp + 1; ctx.beginPath(); ctx.arc(T.x + x, yy + 1, 5 + (x % 3), 0, TAU); ctx.fill(); }
    // bubbles rise through the foam
    if (s.level > 0.05 && !reducedMotion() && Math.random() < dt * (6 + 24 * s.valves.feed)) bubbles.push({ x: T.x + 12 + Math.random() * (T.w - 24), y: T.y + T.h - 4, r: 2 + Math.random() * 5, v: 30 + Math.random() * 50, ph: Math.random() * TAU });
    bubbles = bubbles.filter((b) => { b.y -= b.v * dt; if (b.y < ty + 6) return false; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x + Math.sin(wave * 3 + b.ph) * 3, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke(); return true; });
    // a stream of foam pours in from the feed
    if (s.valves.feed > 0.05) { ctx.strokeStyle = 'rgba(240,255,246,.9)'; ctx.lineWidth = 3 + 7 * s.valves.feed; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -wave * 60; const fe = G.feed[G.feed.length - 1]; ctx.beginPath(); ctx.moveTo(fe[0] + (G.tall ? 0 : 20), G.tall ? T.y : fe[1]); ctx.lineTo(fe[0] + (G.tall ? 0 : 20), ty); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
    // glass: rim, side glints, a top cap
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(176,222,240,.85)'; rr(T.x, T.y, T.w, T.h, 14); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.16)'; rr(T.x + 6, T.y + 6, T.w - 12, T.h - 12, 10); ctx.stroke();
    const gl = ctx.createLinearGradient(T.x, 0, T.x + T.w, 0); gl.addColorStop(0, 'rgba(255,255,255,.34)'); gl.addColorStop(0.12, 'rgba(255,255,255,0)'); gl.addColorStop(0.86, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,.18)');
    ctx.fillStyle = gl; rr(T.x + 3, T.y + 3, T.w - 6, T.h - 6, 11); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; rr(T.x + 14, T.y + 16, 7, T.h * 0.5, 4); ctx.fill(); rr(T.x + 14, T.y + 16 + T.h * 0.55, 7, 14, 4); ctx.fill();
    ctx.fillStyle = '#5b6d7b'; rr(T.x - 6, T.y - 10, T.w + 12, 14, 5); ctx.fill();
    ctx.fillStyle = '#5b6d7b'; rr(T.x - 6, T.y + T.h - 4, T.w + 12, 14, 5); ctx.fill();
    // the marked band
    const by0 = levelY(BAND[1]), by1 = levelY(BAND[0]), col = inBand(s) ? '#7be36a' : '#ffc857';
    ctx.fillStyle = inBand(s) ? 'rgba(130,240,150,.22)' : 'rgba(255,200,80,.14)'; ctx.fillRect(T.x, by0, T.w, by1 - by0);
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(T.x - 18, by0); ctx.lineTo(T.x + T.w + 18, by0); ctx.moveTo(T.x - 18, by1); ctx.lineTo(T.x + T.w + 18, by1); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.font = '700 13px Consolas, monospace'; ctx.textAlign = 'left';
    ctx.fillText('FILL LINE', T.x + T.w + 22, (by0 + by1) / 2 + 4);
    ctx.fillStyle = '#9fb7c6'; ctx.fillText('FEED', G.lbl.feed[0], G.lbl.feed[1]); ctx.fillText('STUCK VALVE', G.lbl.leak[0], G.lbl.leak[1]); ctx.fillText('DRAIN', G.lbl.drain[0], G.lbl.drain[1]);
    if (s.level >= 1) { ctx.fillStyle = '#ff6b5a'; ctx.fillText('OVER THE TOP', G.tall ? T.x : T.x + T.w + 22, G.tall ? T.y - 18 : T.y + 14); }
    if (s.done && !s.result.success && !s.shut) { ctx.fillStyle = 'rgba(255,90,70,.12)'; ctx.fillRect(0, 0, W, H); }
  }
  const stop = loop((dt) => {
    stepFlow(s, dt);
    for (const ev of s.events.splice(0)) { if (ev.type === 'leak-shut') { sound('power'); say('The stuck valve is tight. No more foam on the floor.'); } else if (ev.type === 'over') { sound('hurt'); say('Over the top! Shut the feed or open the drain.'); } }
    draw(dt);
    for (const id of VALVES) { const w = wheels[id]; w.rim.style.transform = `rotate(${(w.turns * 360).toFixed(1)}deg)`; w.word.textContent = valveWord(s.valves[id]); w.el.setAttribute('aria-valuenow', String(Math.round(s.valves[id] * 100))); w.el.classList.toggle('is-open', s.valves[id] > 0.02); }
    const f = floorFill(s);
    floorWord.textContent = `${f < 0.03 ? 'dry' : f < 0.35 ? 'damp' : f < 0.7 ? 'wet' : 'flooding!'}`;
    floorWord.classList.toggle('is-bad', f >= 0.7);
    [...holdPips.children].forEach((p, i) => p.classList.toggle('is-on', s.hold / HOLD > (i + 0.2) / 5 || s.done && s.result.success));
    if (!s.done) {
      if (inBand(s)) say('At the line. Hold it there.');
      else if (s.level < BAND[0] && s.valves.feed < 0.05) say(s.valves.leak > 0.05 ? 'Tighten the stuck valve, then open the feed.' : 'Open the feed and fill the tank to the line.');
      else if (s.level > BAND[1]) say('Past the line. Shut the feed or open the drain.');
    }
    if (s.done && !ended) {
      if (!endAt) { endAt = performance.now(); say(s.result.success ? 'Held at the line. The foam is under control.' : 'The floor is full. The room is flooded.'); }
      if (performance.now() - endAt > (reducedMotion() ? 100 : 800)) { ended = true; stop(); card(); }
    }
  });
  function card() {
    const r = s.result;
    const ok = r.success;
    const pips = ok ? '★'.repeat(r.spilled < 0.15 ? 3 : r.spilled < 0.5 ? 2 : 1) + '☆'.repeat(r.spilled < 0.15 ? 0 : r.spilled < 0.5 ? 1 : 2) : null;
    const c = h('div', { class: `rp-result ui-card ho-card ${ok ? 'is-ok' : 'is-bad'}`, role: 'status' }, h('b', { class: 'rp-stars', text: ok ? pips : 'ROOM FLOODED' }),
      h('span', { text: ok ? `${r.spilled < 0.15 ? 'Barely a drop' : r.spilled < 0.5 ? 'Some foam' : 'A lot of foam'} reached the floor.` : 'The foam is running everywhere. Shut it all off by hand, or walk away and let it run.' }));
    if (ok) { const go = h('button', { type: 'button', class: 'primary ui-btn', text: 'Continue' }); go.addEventListener('click', () => { panel.remove(); finish(r); }); c.append(go); panel.append(c); go.focus({ preventScroll: true }); return; }
    const shut = h('button', { type: 'button', class: 'primary ui-btn ho-shutall', text: 'Shut it all off' });
    const leave = h('button', { type: 'button', class: 'ui-btn', text: 'Walk away' });
    shut.addEventListener('click', () => { shutAll(s); sound('jam'); c.querySelector('.rp-stars').textContent = 'SHUT OFF'; c.querySelector('span').textContent = 'The flooding stops. The foam line stays broken.'; say('Shut off by hand.'); shut.remove(); leave.textContent = 'Continue'; leave.classList.add('primary'); leave.focus({ preventScroll: true }); });
    leave.addEventListener('click', () => { panel.remove(); finish(s.result); });
    c.append(shut, leave); panel.append(c); shut.focus({ preventScroll: true });
  }
  return promise;
}

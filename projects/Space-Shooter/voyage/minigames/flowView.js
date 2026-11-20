// The foam valve on screen (opening track C, scene 1): a glass tank of foam you fill into the marked band, three hand-wheels you turn,
// and the floor below taking every drop that leaks or runs over. Wheels: press one and circle it (clockwise shuts, the other way opens);
// keyboard: focus a wheel, Right or Up shuts, Left or Down opens. No digits on screen: words, the liquid itself, and pips.
// Resolves with the rules' result ({ success, how, spilled, valveShut }).
import { createFlow, turnValve, stepFlow, shutAll, floorFill, inBand, valveWord, VALVES, VALVE_NAME, BAND, HOLD, TRAVEL } from './flow.js';
import { h, loop, ensureStyle } from './craftChainView.js';
import { ensureHandsOnStyle } from './handsOnKit.js';

const W = 640, H = 400;
const TAU = Math.PI * 2;
const HINT = { feed: 'opens the foam in', leak: 'tighten it to stop the leak', drain: 'trims the tank down' };

export function playFlowGame(root, { state, setup = {}, title = 'Foam valve', sound = () => {}, reducedMotion = () => false } = {}) {
  ensureStyle(); ensureHandsOnStyle();
  const s = state || createFlow({ setup });
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
    h('div', { class: 'cc-boardwrap ho-wrap ho-flowwrap' }, canvas), row, status,
    h('p', { class: 'rp-help', text: 'Circle a wheel to turn it: clockwise shuts it, the other way opens it. Shut the stuck valve, open the feed, and keep the foam inside the marked band for a few seconds. Foam that leaks or runs over lands on the floor; a full floor floods the room.' }));
  panel.__state = s;
  root.append(panel);
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;

  let wave = 0, drips = [], ended = false, endAt = 0, said = '';
  const say = (t) => { if (t !== said) { said = t; status.textContent = t; } };
  const T = { x: 190, y: 40, w: 190, h: 270 };           // the tank
  const levelY = (l) => T.y + T.h - l * T.h;
  const pipe = (x0, y0, x1, y1, flow, color) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#26323c'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#3d4d59'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (flow > 0.02) { ctx.strokeStyle = color; ctx.lineWidth = 3 + 7 * flow; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -wave * 40; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); }
  };
  function draw(dt) {
    wave += dt;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#16222c'); bg.addColorStop(1, '#0d151c'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // the floor under it: a puddle that grows with the spill
    const fy = 336, fill = floorFill(s);
    ctx.fillStyle = '#1d2a34'; ctx.fillRect(0, fy, W, H - fy);
    ctx.strokeStyle = '#2f4452'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
    if (fill > 0.005) {
      const pw = 40 + fill * (W - 80), ph = 8 + fill * 44;
      const pg = ctx.createRadialGradient(330, fy + 26, 4, 330, fy + 26, pw / 2);
      pg.addColorStop(0, 'rgba(236,252,242,.95)'); pg.addColorStop(1, 'rgba(190,232,212,.15)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(330, fy + 28, pw / 2, ph, 0, 0, TAU); ctx.fill();
    }
    // pipes: feed in at the top left, stuck valve out of the tank's right side, drain out of the bottom
    pipe(40, 78, T.x + 8, 78, s.valves.feed, '#e8f9ef');
    pipe(T.x + T.w - 8, 250, 520, 250, s.valves.leak, '#e8f9ef');
    pipe(520, 250, 520, 318, s.valves.leak, '#e8f9ef');
    pipe(T.x + 70, T.y + T.h, T.x + 70, 340, s.valves.drain, '#cfe3d9');
    ctx.fillStyle = '#e8f9ef';
    // drips off the leak onto the floor
    if (s.valves.leak > 0.05 && !reducedMotion()) { if (Math.random() < s.valves.leak * dt * 18) drips.push({ x: 520 + (Math.random() - 0.5) * 8, y: 318, v: 0 }); }
    drips = drips.filter((d) => { d.v += 520 * dt; d.y += d.v * dt; if (d.y > fy + 10) return false; ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, TAU); ctx.fill(); return true; });
    // the tank: glass, foam with a wavy top, the fill band
    const ty = levelY(s.level);
    ctx.save(); ctx.beginPath(); ctx.roundRect?.(T.x, T.y, T.w, T.h, 12); if (!ctx.roundRect) ctx.rect(T.x, T.y, T.w, T.h); ctx.clip();
    ctx.fillStyle = 'rgba(14,26,34,.9)'; ctx.fillRect(T.x, T.y, T.w, T.h);
    const g = ctx.createLinearGradient(0, ty, 0, T.y + T.h); g.addColorStop(0, 'rgba(240,255,246,.95)'); g.addColorStop(1, 'rgba(170,222,196,.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(T.x, T.y + T.h);
    for (let x = 0; x <= T.w; x += 8) ctx.lineTo(T.x + x, ty + Math.sin(wave * 3 + x / 14) * (s.valves.feed > 0.05 || s.valves.leak > 0.05 ? 3 : 1));
    ctx.lineTo(T.x + T.w, T.y + T.h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 9; i++) { const bx = T.x + 14 + ((i * 53 + wave * 12) % (T.w - 28)), by = T.y + T.h - ((i * 37 + wave * 20) % Math.max(20, T.h * s.level)); ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(170,215,235,.8)'; ctx.beginPath(); ctx.roundRect?.(T.x, T.y, T.w, T.h, 12); if (!ctx.roundRect) ctx.rect(T.x, T.y, T.w, T.h); ctx.stroke();
    // the marked band
    const by0 = levelY(BAND[1]), by1 = levelY(BAND[0]);
    ctx.fillStyle = inBand(s) ? 'rgba(130,240,150,.22)' : 'rgba(255,200,80,.14)'; ctx.fillRect(T.x, by0, T.w, by1 - by0);
    ctx.strokeStyle = inBand(s) ? '#7be36a' : '#ffc857'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(T.x - 18, by0); ctx.lineTo(T.x + T.w + 18, by0); ctx.moveTo(T.x - 18, by1); ctx.lineTo(T.x + T.w + 18, by1); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = inBand(s) ? '#7be36a' : '#ffc857'; ctx.font = '700 13px Consolas, monospace'; ctx.textAlign = 'left'; ctx.fillText('FILL LINE', T.x + T.w + 24, (by0 + by1) / 2 + 4);
    if (s.level >= 1) { ctx.fillStyle = '#ff6b5a'; ctx.fillText('OVER THE TOP', T.x + T.w + 24, T.y + 14); }
    ctx.fillStyle = '#9fb7c6'; ctx.fillText('FEED', 44, 64); ctx.fillText('STUCK VALVE', 470, 232); ctx.fillText('DRAIN', T.x + 80, 340);
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

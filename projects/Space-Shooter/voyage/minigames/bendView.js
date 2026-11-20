// Bend on screen: a bar clamped in a vice with a ghost line at the target angle. Press A and D in turn (or the two big thumb pads),
// each time the beat ring is in the green; the bar flexes up a little each good press, creaks and glows as the strain rises, throws
// sparks on a rushed press and snaps straight with a shake when it kinks. Stop on the ghost line and Set (Space, or the Set button).
// No number is shown: a gauge for the gap to the line (with a word), a gauge for strain, pips for the bends. Canvas 800 x 520 units;
// resolves with the pure result. The pure rules (and the clock: a time in seconds for every press) are bend.js.
import { bendPress, bendSet, bendGiveUp, bendTick, targetOf, nextKey, word, quality, since } from './bend.js';
import { h, ensureStyle, loop, lcg } from './craftChainView.js';

const BW = 800, BH = 520, K = 1.5, TAU = Math.PI * 2;
const P = { x: 300, y: 380 }, L = 300, RING = { x: 690, y: 125, r: 66 };
const rad = (d) => (d * Math.PI) / 180;
const now = () => performance.now() / 1000;

// The picture is drawn in a 800 x 520 scene that is centred in whatever box the screen gives it: a taller box (a phone) adds
// workshop wall above the bar, a wider one (desktop) adds bench to the sides. So spare height goes into the board, never into a gap.
function makeBench(v) {
  const { W, H, dx, dy } = v;
  const c = document.createElement('canvas'); c.width = Math.round(W * K); c.height = Math.round(H * K);
  const g = c.getContext('2d'); g.scale(K, K);
  const r = lcg(23);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#26323d'); bg.addColorStop(1, '#141c24'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < Math.round(260 * (W * H) / (BW * BH)); i++) { const y = r() * H, x = r() * W; g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.12)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + r() * 160, y); g.stroke(); }
  const vg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, Math.max(W, H) * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // the vice: a heavy block under the bar and a clamp plate over its fixed end
  const top = P.y + dy + 16, right = P.x + dx + 14;
  const blk = g.createLinearGradient(0, top, 0, H); blk.addColorStop(0, '#6a7681'); blk.addColorStop(0.15, '#4a555f'); blk.addColorStop(1, '#2b343c');
  g.fillStyle = blk; g.fillRect(0, top, right, H - top);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, top, right, 3);
  for (const x of [250, 180, 110]) { const bx = x + dx, by = P.y + dy + 60; g.fillStyle = '#20292f'; g.beginPath(); g.arc(bx, by, 11, 0, TAU); g.fill(); g.fillStyle = '#7d8993'; g.beginPath(); g.arc(bx - 1.5, by - 1.5, 6, 0, TAU); g.fill(); }
  return c;
}

export function playBend(root, { state, what = 'bracket', reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state;
  let view = { W: BW, H: BH, dx: 0, dy: 0 };
  let bench = makeBench(view);
  const canvas = h('canvas', { class: 'cc-canvas cc-bendcanvas', width: String(BW * K), height: String(BH * K), 'aria-label': `A metal bar clamped in a vice with a dotted ghost line where the ${what} must end up. Press A and D in turn, in time with the ring, then Set.` });
  const ctx = canvas.getContext('2d');

  // the HUD: strain, the gap to the line (with a plain word), the bends as pips
  const strainFill = h('i'), strainWord = h('em', { text: 'calm' });
  const gapFill = h('i'), gapZone = h('s', { class: 'cc-zone' }), gapOver = h('u', { class: 'cc-over' }), gapTick = h('b', { class: 'cc-tick' }), gapWord = h('em', { text: 'keep going' });
  const pips = h('div', { class: 'cc-pips', role: 'img', 'aria-label': 'Bends: filled ones are set' });
  const hud = h('div', { class: 'cc-hud cc-hud3 cc-bendhud' },
    h('div', { class: 'cc-stat cc-strainstat' }, h('span', { text: 'Strain' }), h('div', { class: 'cc-meter cc-strain', role: 'img', 'aria-label': 'Strain on the bar. Full means it kinks.' }, strainFill), strainWord),
    h('div', { class: 'cc-stat cc-gapstat' }, h('span', { text: 'Gap to the line' }), h('div', { class: 'cc-meter cc-gap', role: 'img', 'aria-label': 'How far the bar is bent toward the ghost line' }, gapFill, gapZone, gapOver, gapTick), gapWord),
    h('div', { class: 'cc-stat cc-pipstat' }, h('span', { text: s.bends > 1 ? 'Bends' : 'Bend' }), pips));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: `Press A and D in turn, each time the ring is in the green. Stop on the dotted line and hit Set.` });
  const giveUp = h('button', { type: 'button', class: 'ui-btn cc-done cc-giveup', text: `Give up this ${what}` });
  const padA = h('button', { type: 'button', class: 'primary ui-btn cc-pad cc-pad-a', 'data-key': 'a', 'aria-label': 'Left pad, the A key' }, h('b', { text: 'A' }), h('span', { text: 'press' }));
  const padD = h('button', { type: 'button', class: 'primary ui-btn cc-pad cc-pad-d', 'data-key': 'd', 'aria-label': 'Right pad, the D key' }, h('b', { text: 'D' }), h('span', { text: 'press' }));
  const setBtn = h('button', { type: 'button', class: 'primary ui-btn cc-pad cc-set', 'aria-label': 'Set the bend (Space)' }, h('b', { text: 'SET' }), h('span', { text: 'Space' }));
  const actions = h('div', { class: 'cc-row cc-bendrow' }, padA, setBtn, padD);
  const wrap = h('div', { class: 'cc-boardwrap cc-bendwrap' }, canvas);
  const panel = h('section', { class: 'rp-panel cc-panel cc-bendpanel mg-skin ui-panel', role: 'group', 'aria-label': `Bend the ${what}`, 'data-game': 'bend' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `BEND · ${what.toUpperCase()}` }),
    h('div', { class: 'cc-play' }, hud, wrap, status, h('div', { class: 'cc-row cc-giverow' }, giveUp)),
    actions, h('p', { class: 'rp-help', text: 'A and D in turn, when the ring is green: each good press bends the bar a little. Too soon strains it, too late does nothing, the same key twice does nothing. Space sets it. Over the line cannot be saved.' }));
  panel.__state = s;
  root.append(panel);
  // Fit the canvas to its box: scene centred, the rest of the box is bench (wider) or wall above the bar (taller). Falls back to the plain 800 x 520.
  const fitView = () => {
    const bw = wrap.clientWidth, bh = wrap.clientHeight;
    let v = { W: BW, H: BH, dx: 0, dy: 0 };
    if (wrap.closest('.wb-full') && bw > 40 && bh > 40) {
      // the scene's content is x 150..770 (the vice runs off the left edge) and y 40..520: scale it to the box, so a tall phone board
      // shows the bar big instead of a small scene under a wall. Extra width becomes bench at the sides, extra height wall above.
      const a = bw / bh, W = Math.round(Math.max(620, 480 * a)), H = Math.min(1500, Math.round(W / a));
      v = { W, H, dx: Math.round(W / 2 - 460), dy: H - BH };
    }
    if (v.W === view.W && v.H === view.H) return;
    view = v; canvas.width = Math.round(v.W * K); canvas.height = Math.round(v.H * K); bench = makeBench(v);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitView).observe(wrap);
  requestAnimationFrame(fitView);

  const layoutGauge = () => {
    const T = targetOf(s), span = T + s.over + 4;
    gapZone.style.left = `${(100 * Math.max(0, T - s.stop)) / span}%`; gapZone.style.width = `${(100 * Math.min(span, 2 * s.stop)) / span}%`;
    gapOver.style.left = `${(100 * (T + s.over)) / span}%`; gapOver.style.width = `${(100 * 4) / span}%`;
    gapTick.style.left = `${(100 * T) / span}%`;
    return span;
  };
  let span = layoutGauge(), shownIndex = s.index;
  const drawPips = () => pips.replaceChildren(...Array.from({ length: s.bends }, (_, i) => h('i', { class: i < s.index ? 'on' : i === s.index && !s.done ? 'now' : '' })));
  drawPips();

  // ---- input: the pads and the keys, and Set -------------------------------------------------------------------------------------
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  const press = (key) => { if (s.done) return; bendPress(s, key, now()); };
  const doSet = () => { if (s.done) return; bendSet(s, now()); };
  for (const pad of [padA, padD]) {
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.classList.add('is-down'); setTimeout(() => pad.classList.remove('is-down'), 140); press(pad.dataset.key); });
    const off = () => pad.classList.remove('is-down');
    pad.addEventListener('pointerup', off); pad.addEventListener('pointercancel', off); pad.addEventListener('pointerleave', off);
    pad.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); }); // a focused pad must not turn Space or Enter into a press
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  setBtn.addEventListener('pointerdown', () => { setBtn.classList.add('is-down'); setTimeout(() => setBtn.classList.remove('is-down'), 140); });
  setBtn.addEventListener('click', doSet);
  giveUp.addEventListener('click', () => { if (!s.done) bendGiveUp(s); });
  const onKey = (e) => {
    if (s.done || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'a' || k === 'd') { e.preventDefault(); if (!e.repeat) { press(k); (k === 'a' ? padA : padD).classList.add('is-down'); } }
    else if (k === ' ') { e.preventDefault(); if (!e.repeat) doSet(); }
  };
  const onKeyUp = (e) => { const k = e.key.toLowerCase(); if (k === 'a') padA.classList.remove('is-down'); else if (k === 'd') padD.classList.remove('is-down'); };
  document.addEventListener('keydown', onKey, true); document.addEventListener('keyup', onKeyUp, true);
  const unhook = () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); };

  // ---- the picture ---------------------------------------------------------------------------------------------------------------
  const rnd = lcg(91);
  let disp = 0, vel = 0, shake = 0, flash = 0, flashHue = '#ff5a45', sparks = [], ringFlash = 0, ringHue = '#9fe870', endAt = 0, ended = false, banner = '', bannerT = 0, hushPad = 0;
  const burst = (n, x, y, hot = 1) => { for (let i = 0; i < n; i++) { const a = -Math.PI * (0.1 + 0.8 * rnd()), v = 120 + 260 * rnd() * hot; sparks.push({ x, y, vx: Math.cos(a) * v * (rnd() > 0.5 ? 1 : -1), vy: Math.sin(a) * v, life: 0.35 + 0.4 * rnd() }); } };
  const say = (t) => { status.textContent = t; };

  function handle(ev) {
    if (ev.type === 'good') { ringFlash = 1; ringHue = '#9fe870'; vel += 55; }
    else if (ev.type === 'slow') { ringFlash = 1; ringHue = '#ffc857'; say('Too slow: not enough pressure. Keep to the beat.'); }
    else if (ev.type === 'rushed') { ringFlash = 1; ringHue = '#ff5a45'; burst(10, P.x + 8, P.y - 8); shake = Math.max(shake, 5); say('Rushed: the bar strains. Wait for the green.'); }
    else if (ev.type === 'ignored') { hushPad = 1; say('The same key twice does nothing. Use the other one.'); }
    else if (ev.type === 'kink') { shake = 22; flash = 1; flashHue = '#ff5a45'; burst(34, P.x, P.y, 1.4); banner = 'KINK'; bannerT = 1; vel -= 300; say('KINK. The bar snapped straight: bend it again (a kink costs ten points).'); }
    else if (ev.type === 'set') { flash = 0.6; flashHue = '#9fe870'; banner = 'SET'; bannerT = 1; say(s.index < s.bends ? 'Set. Next bend: a fresh bar and a new line.' : 'Set.'); }
    else if (ev.type === 'done') {
      if (ev.how === 'over') { shake = 26; flash = 1; flashHue = '#ff5a45'; burst(40, P.x, P.y, 1.6); banner = 'CRACKED'; bannerT = 1; say('Bent past the line: it cracked. That cannot be saved.'); }
      else if (ev.how === 'kinks') { shake = 26; flash = 1; burst(40, P.x, P.y, 1.6); banner = 'CRACKED'; bannerT = 1; say('Kinked three times: the metal cracked.'); }
      else if (ev.how === 'gave-up') say('Given up.');
      else say(ev.success ? 'Set.' : 'Too rough.');
      endAt = performance.now();
    }
  }

  function draw(t) {
    const g = ctx; g.setTransform(K, 0, 0, K, 0, 0);
    const calm = reducedMotion();
    const sx = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0, sy = !calm && shake > 0.2 ? (rnd() - 0.5) * shake : 0;
    g.save(); g.translate(sx, sy);
    g.drawImage(bench, 0, 0, view.W, view.H);
    g.translate(view.dx, view.dy);
    const T = targetOf(s), done = s.done;
    const live = Math.max(0, Math.min(1, s.strain / 100));
    const tgt = rad(T);
    // the stop zone (a fan round the ghost line) and the line itself
    g.save(); g.translate(P.x, P.y);
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, L + 26, -rad(T + s.stop), -rad(T - s.stop)); g.closePath();
    g.fillStyle = 'rgba(120,235,120,.13)'; g.fill();
    // the gap arc between the bar and the line
    const barA = rad(disp), lineA = tgt;
    g.lineWidth = 5; g.lineCap = 'round';
    const near = Math.abs(s.angle - T) <= s.stop;
    g.strokeStyle = s.angle > T + 0.01 ? '#ff6b5a' : near ? '#9fe870' : '#ffc857';
    g.beginPath(); g.arc(0, 0, L + 44, -Math.max(barA, lineA), -Math.min(barA, lineA)); g.stroke();
    g.setLineDash([14, 10]); g.lineWidth = 3; g.strokeStyle = s.angle === T ? '#c8ffc0' : near ? '#9fe870' : '#7fe8e0'; g.shadowColor = near ? '#9fe870' : '#38d6cc'; g.shadowBlur = near ? 18 : 8;
    g.beginPath(); g.moveTo(Math.cos(-tgt) * 30, Math.sin(-tgt) * 30); g.lineTo(Math.cos(-tgt) * (L + 60), Math.sin(-tgt) * (L + 60)); g.stroke();
    g.setLineDash([]); g.shadowBlur = 0;
    // where it cracks: a short red tick past the line
    g.strokeStyle = 'rgba(255,90,70,.55)'; g.lineWidth = 3; const ov = -rad(T + s.over);
    g.beginPath(); g.moveTo(Math.cos(ov) * (L + 30), Math.sin(ov) * (L + 30)); g.lineTo(Math.cos(ov) * (L + 58), Math.sin(ov) * (L + 58)); g.stroke();
    g.restore();
    // the clamp plate over the fixed end, then the bar: fixed arm, a rounded corner at the vice jaw, the free arm
    const a = barA;
    const tip = { x: P.x + L * Math.cos(a), y: P.y - L * Math.sin(a) };
    const heat = live * live, wob = !calm && live > 0.5 ? Math.sin(t * 60) * (live - 0.5) * 2.4 : 0;
    const col = `rgb(${Math.round(168 + 80 * heat)},${Math.round(182 - 70 * heat)},${Math.round(194 - 120 * heat)})`;
    g.save(); g.translate(0, wob * 0.5);
    if (live > 0.35 && !calm) { g.shadowColor = `rgba(255,${Math.round(150 - 90 * live)},60,${0.35 + 0.5 * live})`; g.shadowBlur = 8 + 26 * live; }
    const path = () => { g.beginPath(); g.moveTo(-view.dx - 20, P.y); g.arcTo(P.x, P.y, tip.x + wob, tip.y, 26 + 20 * Math.min(1, a)); g.lineTo(tip.x + wob, tip.y); };
    g.lineJoin = 'round'; g.lineCap = 'butt';
    g.strokeStyle = '#1f2a33'; g.lineWidth = 34; path(); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = col; g.lineWidth = 27; path(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 5; g.beginPath(); g.moveTo(-view.dx, P.y - 7); g.lineTo(P.x - 4, P.y - 7); g.stroke();
    { const dx = Math.cos(a), dy = -Math.sin(a), nx = dy, ny = -dx; g.beginPath(); g.moveTo(P.x + 7 * nx + 14 * dx, P.y + 7 * ny + 14 * dy); g.lineTo(tip.x + 7 * nx - 8 * dx, tip.y + 7 * ny - 8 * dy); g.stroke(); }
    g.fillStyle = '#1f2a33'; g.beginPath(); g.arc(tip.x, tip.y, 6, 0, TAU); g.fill();
    g.restore();
    // hairline cracks at the bend as the strain gets high
    if (live > 0.6) { g.strokeStyle = `rgba(30,12,8,${0.35 + 0.5 * live})`; g.lineWidth = 1.6; for (let i = 0; i < 4; i++) { const o = -10 + i * 7; g.beginPath(); g.moveTo(P.x + o, P.y - 13); g.lineTo(P.x + o + 3 + live * 4, P.y - 3); g.lineTo(P.x + o - 2, P.y + 4); g.stroke(); } }
    // the clamp plate
    const pl = g.createLinearGradient(0, P.y - 40, 0, P.y - 14); pl.addColorStop(0, '#8b97a1'); pl.addColorStop(1, '#4a555f');
    g.fillStyle = pl; g.fillRect(-view.dx, P.y - 40, P.x - 20 + view.dx, 26); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(-view.dx, P.y - 40, P.x - 20 + view.dx, 3);
    g.fillStyle = '#20292f'; g.fillRect(P.x - 20, P.y - 40, 6, 26);
    // sparks
    for (const p of sparks) { g.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2)); g.fillStyle = p.life > 0.3 ? '#fff3b0' : '#ff9a3c'; g.fillRect(p.x - 2, p.y - 2, 4, 4); }
    g.globalAlpha = 1;
    // the beat ring: the 0.18 to 0.45 s window as a green arc the hand sweeps through
    const R = RING, since_ = s.lastAt == null ? null : now() - s.lastAt, turn = s.hi * 1.45;
    const at = (sec) => -Math.PI / 2 + (Math.min(sec, turn) / turn) * TAU;
    g.save(); g.translate(R.x, R.y);
    g.fillStyle = 'rgba(6,14,22,.72)'; g.beginPath(); g.arc(0, 0, R.r + 12, 0, TAU); g.fill();
    g.lineWidth = 12; g.lineCap = 'butt';
    const arc = (a0, a1, c) => { g.strokeStyle = c; g.beginPath(); g.arc(0, 0, R.r, a0, a1); g.stroke(); };
    const ready = since_ == null;
    arc(at(0), at(s.lo), ready ? 'rgba(90,110,125,.45)' : 'rgba(255,90,70,.7)');
    arc(at(s.lo), at(s.hi), ready ? 'rgba(120,235,120,.85)' : since_ >= s.lo && since_ <= s.hi ? '#b8ff9c' : 'rgba(120,235,120,.85)');
    arc(at(s.hi), at(turn), 'rgba(255,200,87,.35)');
    if (since_ != null && since_ >= s.lo && since_ <= s.hi) { g.shadowColor = '#9fe870'; g.shadowBlur = 20; arc(at(s.lo), at(s.hi), '#b8ff9c'); g.shadowBlur = 0; }
    if (ringFlash > 0) { g.lineWidth = 6; g.strokeStyle = ringHue; g.globalAlpha = ringFlash; g.beginPath(); g.arc(0, 0, R.r + 18 * (1 - ringFlash) + 6, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    if (!ready) { const ha = at(since_ || 0); g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(Math.cos(ha) * (R.r - 22), Math.sin(ha) * (R.r - 22)); g.lineTo(Math.cos(ha) * (R.r + 10), Math.sin(ha) * (R.r + 10)); g.stroke(); }
    const nk = nextKey(s);
    g.fillStyle = '#eaf4f5'; g.font = '800 40px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(done ? '' : nk ? nk.toUpperCase() : 'A / D', 0, 2);
    g.restore();
    // banner and flash
    if (bannerT > 0) { g.globalAlpha = Math.min(1, bannerT * 1.6); g.fillStyle = banner === 'SET' ? '#9fe870' : '#ff6b5a'; g.font = '800 54px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(banner, view.W / 2 - view.dx, 96 + 18 * (1 - bannerT)); g.globalAlpha = 1; }
    if (flash > 0) { g.globalAlpha = flash * 0.28; g.fillStyle = flashHue; g.fillRect(-view.dx, -view.dy, view.W, view.H); g.globalAlpha = 1; }
    g.restore();
  }

  function step(dt, t) {
    bendTick(s, now());
    for (const ev of s.events.splice(0)) handle(ev);
    if (s.index !== shownIndex) { shownIndex = s.index; if (!s.done) { span = layoutGauge(); } drawPips(); }
    if (s.done) drawPips();
    // the flexing metal: a spring with a little overshoot
    const k = 420, c = 24; vel += (k * (s.angle - disp) - c * vel) * dt; disp += vel * dt; if (Math.abs(disp - s.angle) < 0.01 && Math.abs(vel) < 0.1) { disp = s.angle; vel = 0; }
    shake = Math.max(0, shake - dt * 60); flash = Math.max(0, flash - dt * 2.4); ringFlash = Math.max(0, ringFlash - dt * 3.2); bannerT = Math.max(0, bannerT - dt * 0.8); hushPad = Math.max(0, hushPad - dt * 4);
    for (const p of sparks) { p.life -= dt; p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } sparks = sparks.filter((p) => p.life > 0);
    // the gauges
    const live = Math.max(0, Math.min(1, s.strain / 100));
    strainFill.style.width = `${100 * live}%`;
    strainFill.className = live > 0.8 ? 'is-hot' : live > 0.5 ? 'is-warm' : '';
    strainWord.textContent = live < 0.12 ? 'calm' : live < 0.45 ? 'warming' : live < 0.8 ? 'creaking' : 'about to kink';
    gapFill.style.width = `${Math.min(100, (100 * s.angle) / span)}%`;
    const gw = s.done ? (s.result.how === 'set' ? 'set' : 'cracked') : word(s);
    gapWord.textContent = gw;
    gapFill.parentElement.dataset.state = s.angle > targetOf(s) ? 'over' : Math.abs(s.angle - targetOf(s)) <= s.stop ? 'near' : 'short';
    const nk = nextKey(s);
    // the cue where the thumb is: the next pad's glow follows the ring (dim while too soon, full in the green window, fading after it)
    const sn = s.lastAt == null ? null : now() - s.lastAt;
    const glow = s.done ? 0 : sn == null ? 0.7 : sn < s.lo ? 0.15 + 0.2 * (sn / s.lo) : sn <= s.hi ? 1 : Math.max(0.15, 1 - (sn - s.hi) * 3);
    for (const pad of [padA, padD]) { const on = nk == null ? !s.done : nk === pad.dataset.key; pad.classList.toggle('is-next', on); pad.style.setProperty('--glow', on ? glow.toFixed(3) : '0'); }
    for (const pad of [padA, padD]) pad.classList.toggle('is-hush', hushPad > 0 && pad.dataset.key === s.lastKey);
    giveUp.disabled = s.done; setBtn.disabled = s.done; padA.disabled = padD.disabled = s.done;
    if (!reducedMotion()) panel.classList.toggle('is-creaking', live > 0.55);
    void quality; void since;
    draw(t);
  }
  const stop = loop((dt) => { step(dt, now()); if (s.done && !ended && endAt && performance.now() - endAt > 900) { ended = true; stop(); unhook(); finish(s.result); } });
  return promise;
}

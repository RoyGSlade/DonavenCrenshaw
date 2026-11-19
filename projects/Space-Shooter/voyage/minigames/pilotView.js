// Touchdown on screen: a side view (SVG) of the ship falling toward a lit landing pad, a drawn descent gauge (a marked safe zone and a
// needle, with a word: gentle, safe, too fast), a fuel bar that drains and turns amber then red, a crosswind (streaks in the sky plus a
// word), and the controls: Left and Right and Thrust (hold), Brake (tap). Keys: arrows or A/D steer, Space or Up/W thrust, B brake.
// The view's height follows the box it is in, so on a phone it fills the free height. Fixed 60 Hz steps. DOM and SVG only, no art.
// No raw numbers on the screen. Resolves with the rules' result.
import { stepPilot, brake, windAt, onPad, PILOT_DT } from './pilot.js';
import { speedFill, speedWord, speedTone, safeMark, fuelLevel, fuelWord, windRead, endWords } from './pilotWords.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
const WORDS = { landed: 'TOUCHDOWN', crashed: 'CRASHED: TOO FAST', missed: 'MISSED THE PAD' };
const K = 1.4;                                       // the ship is drawn this many times its base size, so it reads at a glance on a phone
const SHIP_TOP = 4.2 * K, SHIP_BOT = 4.3 * K;        // hull tip and leg bottom, in view units
const GROUND_H = 8;                                  // the ground band, in view units (the view is 100 wide, `vh` high)

export function playPilot(root, { state, where = 'the hangar pad', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  let vh = 64;                                       // view height in units: follows the box (100 * height / width)
  let ground = vh - GROUND_H;
  const sy = (y) => ground - 1.2 - SHIP_BOT - (y / 100) * (ground - 1.2 - SHIP_BOT - SHIP_TOP - 2); // ship origin; altitude 100 -> just under the top
  // Stars (fixed, from the pad so they differ a little per flight), wind streaks, the pad, the ship.
  const stars = Array.from({ length: 26 }, (_, i) => { const a = Math.sin((s.padX + 1) * (i + 3) * 12.9898) * 43758.5453; const u = a - Math.floor(a); const b = Math.sin((i + 5) * 78.233) * 12345.6789; const v = b - Math.floor(b); return { x: u * 100, y: v, r: 0.18 + (i % 3) * 0.1 }; });
  const starEls = stars.map((q) => sv('circle', { class: 'pl-star', cx: q.x.toFixed(1), cy: 0, r: q.r }));
  const streaks = Array.from({ length: 8 }, (_, i) => ({ x: (i * 37) % 100, y: 0.1 + ((i * 53) % 70) / 100, len: 5 + (i % 4) * 2.5, sp: 0.7 + (i % 3) * 0.3, el: sv('line', { class: 'pl-streak' }) }));
  const skyEl = sv('rect', { class: 'pl-sky', x: 0, y: 0, width: 100, height: vh }), groundEl = sv('rect', { class: 'pl-ground', x: 0, width: 100 });
  const padEl = sv('rect', { class: 'pl-pad', x: s.padX - s.pad / 2, width: s.pad, height: 2.4, rx: 0.8 });
  const padGlow = sv('ellipse', { class: 'pl-padglow', cx: s.padX, rx: s.pad * 0.7, ry: 2.2 });
  const lineEl = sv('line', { class: 'pl-line', x1: s.padX, x2: s.padX });
  const flame = sv('path', { class: 'pl-flame', d: 'M-1.6 3.4 L0 9 L1.6 3.4 Z' });
  const flameCore = sv('path', { class: 'pl-flame-core', d: 'M-0.8 3.4 L0 6.6 L0.8 3.4 Z' });
  const hull = sv('path', { class: 'pl-hull', d: 'M0 -4.2 L2.6 3.4 L-2.6 3.4 Z' });
  const ship = sv('g', { class: 'pl-ship' }, flame, flameCore, hull, sv('circle', { class: 'pl-window', cx: 0, cy: 0.2, r: 0.9 }), sv('rect', { class: 'pl-leg', x: -3.3, y: 3.4, width: 6.6, height: 0.9, rx: 0.4 }));
  const fx = sv('g', { class: 'pl-fx' });
  const svg = sv('svg', { class: 'pl-view', viewBox: `0 0 100 ${vh}`, role: 'img', 'aria-label': 'Side view of the ship above the pad', preserveAspectRatio: 'xMidYMid meet' },
    sv('defs', {}, sv('linearGradient', { id: 'plSky', x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: '0', 'stop-color': '#060d17' }), sv('stop', { offset: '1', 'stop-color': '#14283a' }))),
    skyEl, ...starEls, ...streaks.map((k) => k.el), groundEl, padGlow, padEl, lineEl, fx, ship);
  const field = h('div', { class: 'pl-field' }, svg);
  const layout = () => {
    ground = vh - GROUND_H;
    svg.setAttribute('viewBox', `0 0 100 ${vh.toFixed(2)}`); skyEl.setAttribute('height', vh.toFixed(2));
    groundEl.setAttribute('y', ground); groundEl.setAttribute('height', GROUND_H);
    padEl.setAttribute('y', ground - 1.2); padGlow.setAttribute('cy', ground - 0.6);
    lineEl.setAttribute('y1', ground - 1.2); lineEl.setAttribute('y2', 3);
    starEls.forEach((el, i) => el.setAttribute('cy', (stars[i].y * (ground - 4) + 1).toFixed(1)));
  };
  layout();
  const resize = () => { const w = field.clientWidth, hh = field.clientHeight; if (w > 40 && hh > 40) { const nv = Math.max(46, Math.min(220, (100 * hh) / w)); if (Math.abs(nv - vh) > 0.05) { vh = nv; layout(); paint(); } } };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(field);

  // HUD: the descent gauge (safe zone marked, a needle, a word), the wind, the fuel bar, the brake pips. Words and drawn bars only.
  const gNeedle = h('i', { class: 'pl-gneedle' }), gFill = h('u', { class: 'pl-gfill' }), gWord = h('b', { class: 'pl-gword', text: 'gentle' });
  const gTrack = h('div', { class: 'pl-gtrack', role: 'img', 'aria-label': 'Descent speed' }, h('s', { class: 'pl-gsafe', style: `width:${(100 * safeMark()).toFixed(2)}%` }), gFill, gNeedle);
  const speedEl = h('div', { class: 'pl-speed' }, h('span', { class: 'pl-lab', text: 'Descent' }), gWord, gTrack);
  const windEl = h('p', { class: 'pl-wind', text: '' });
  const fuelBar = h('div', { class: 'pl-fuel' }, h('span', { class: 'pl-lab', text: 'Fuel' }), h('i', {}, h('u')), h('b', { text: '' }));
  const brakesEl = h('p', { class: 'pl-brakes', 'aria-label': 'Brakes left' });
  const hud = h('div', { class: 'pl-hud' }, speedEl, windEl, fuelBar, brakesEl);
  const btn = (cls, text, label) => h('button', { type: 'button', class: `pl-btn ui-btn ${cls}`, 'aria-label': label, text });
  const bL = btn('pl-left', '◀', 'Drift left'), bR = btn('pl-right', '▶', 'Drift right'), bT = btn('pl-thrust primary', 'Thrust', 'Thrust (hold)'), bB = btn('pl-brake', 'Brake', 'Emergency brake');
  const pad = h('div', { class: 'pl-controls' }, bL, bT, bR, bB);
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Bring the ship down on ${where}. Hold Thrust to slow the fall, Left and Right to drift.` });
  const panel = h('section', { class: 'rp-panel pl-panel mg-skin ui-panel', role: 'group', 'aria-label': 'Landing' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `TOUCHDOWN · ${where.toUpperCase()}` }), hud, field, pad, status,
    h('p', { class: 'rp-help', text: 'Land on the lit pad slower than the safe speed. Thrust burns fuel; a brake cancels most of your fall once.' }));
  panel.__state = s;
  const input = { left: false, right: false, thrust: false };
  panel.__input = input;
  root.append(panel);
  let raf = 0, last = 0, acc = 0, finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  const hold = (el, key) => {
    const on = (e) => { e.preventDefault(); input[key] = true; el.classList.add('is-held'); try { el.setPointerCapture?.(e.pointerId); } catch {} };
    const off = () => { input[key] = false; el.classList.remove('is-held'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  hold(bL, 'left'); hold(bR, 'right'); hold(bT, 'thrust');
  const doBrake = () => { if (brake(s)) { sound('power'); status.textContent = 'Brake! The fall slows.'; } else sound('hurt'); };
  bB.addEventListener('pointerdown', (e) => { e.preventDefault(); doBrake(); });
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'thrust', KeyW: 'thrust', Space: 'thrust' };
  const kd = (e) => { if (e.code === 'KeyB' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) doBrake(); return; } const k = KEYS[e.code]; if (k) { e.preventDefault(); input[k] = true; } };
  const ku = (e) => { const k = KEYS[e.code]; if (k) input[k] = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);

  const motion = () => !reducedMotion();
  let fl = 0, lastPaint = 0;
  function paint(now = 0) {
    const dt = lastPaint && now ? Math.max(0, Math.min(0.1, (now - lastPaint) / 1000)) : 0; if (now) lastPaint = now;
    const tilt = Math.max(-14, Math.min(14, s.vx * 1.1));
    ship.setAttribute('transform', `translate(${s.x.toFixed(2)} ${sy(s.y).toFixed(2)}) rotate(${(s.crashedAt ? 0 : tilt).toFixed(1)} 0 0) scale(${K})`);
    fl += dt;
    const on = s.thrusting && !s.done;
    flame.style.display = on ? 'block' : 'none'; flameCore.style.display = on ? 'block' : 'none';
    if (on) { const f = 0.85 + 0.3 * Math.abs(Math.sin(fl * 38)); flame.setAttribute('transform', `scale(${(0.9 + 0.2 * Math.abs(Math.sin(fl * 31))).toFixed(2)} ${f.toFixed(2)})`); flameCore.setAttribute('transform', `scale(1 ${f.toFixed(2)})`); }
    const over = onPad(s);
    padEl.classList.toggle('is-over', over); padGlow.classList.toggle('is-over', over);
    // Descent gauge: fill and needle against the marked safe zone, and one word.
    const fill = speedFill(s.vy, s.safe), tone = speedTone(s.vy, s.safe);
    gFill.style.width = `${(100 * fill).toFixed(1)}%`; gNeedle.style.left = `${(100 * fill).toFixed(1)}%`;
    gTrack.dataset.tone = tone; gWord.className = `pl-gword is-${tone}`; gWord.textContent = speedWord(s.vy, s.safe);
    // Fuel: drains with no seconds shown; amber, then red, and the word when low.
    const lvl = fuelLevel(s.fuel, s.fuelMax);
    fuelBar.querySelector('u').style.width = `${(100 * s.fuel) / s.fuelMax}%`; fuelBar.querySelector('b').textContent = fuelWord(lvl);
    fuelBar.dataset.level = lvl; fuelBar.classList.toggle('is-low', lvl === 'low' || lvl === 'empty');
    // Wind: the word, an arrow that nudges, and streaks in the sky that run with it.
    const wr = windRead(windAt(s), s.wind);
    windEl.textContent = wr.dir === 0 ? 'Wind: calm' : `Wind: ${wr.dir > 0 ? 'blowing right' : 'blowing left'}`;
    windEl.dataset.dir = wr.dir; windEl.className = `pl-wind${wr.dir ? (wr.dir > 0 ? ' is-right' : ' is-left') : ''}`;
    for (const k of streaks) {
      if (wr.dir && motion()) k.x += wr.dir * (6 + 26 * wr.strength) * k.sp * dt;
      if (k.x > 104) k.x -= 112; else if (k.x < -8) k.x += 112;
      k.el.setAttribute('x1', k.x.toFixed(1)); k.el.setAttribute('x2', (k.x + k.len * (wr.dir || 1)).toFixed(1));
      const yy = (3 + k.y * (ground - 10)).toFixed(1); k.el.setAttribute('y1', yy); k.el.setAttribute('y2', yy);
      k.el.style.opacity = wr.dir ? (0.18 + 0.5 * wr.strength).toFixed(2) : '0';
    }
    // Brakes left as drawn pips.
    brakesEl.hidden = !s.brakesMax;
    if (s.brakesMax) { if (brakesEl.children.length !== s.brakesMax) { brakesEl.replaceChildren(h('span', { class: 'pl-lab', text: 'Brake' }), ...Array.from({ length: s.brakesMax }, () => h('i'))); } [...brakesEl.querySelectorAll('i')].forEach((d, i) => d.classList.toggle('is-used', i >= s.brakes)); }
    bB.disabled = s.brakes <= 0 || s.done; bB.hidden = !s.brakesMax;
  }
  // Touchdown feel: dust at the pad on a landing, sparks and a shake on a crash. CSS animates them; reduced motion skips them.
  function puff(n, x, y, cls, spread) {
    for (let i = 0; i < n; i++) {
      const c = sv('circle', { class: cls, cx: (x + (i - (n - 1) / 2) * 1.6).toFixed(1), cy: y.toFixed(1), r: (0.7 + (i % 3) * 0.35).toFixed(2) });
      c.style.setProperty('--dx', `${((i - (n - 1) / 2) * spread).toFixed(1)}px`); c.style.animationDelay = `${(i % 4) * 40}ms`;
      fx.append(c);
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    acc = Math.min(0.1, acc + Math.min(0.05, (now - last) / 1000 || 0)); last = now;
    while (acc >= PILOT_DT && !s.done) { stepPilot(s, PILOT_DT, input); acc -= PILOT_DT; }
    paint(now);
    if (s.done) end();
  }
  function end() {
    cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    Object.keys(input).forEach((k) => { input[k] = false; });
    [bL, bR, bT, bB].forEach((b) => { b.disabled = true; });
    paint();
    const r = s.result;
    if (r.outcome === 'landed') { panel.dataset.end = 'landed'; if (motion()) puff(9, s.x, ground - 1.2, 'pl-puff', 2.6); }
    else { panel.dataset.end = r.outcome; hull.classList.add('is-wreck'); if (motion()) { field.classList.add('is-shake'); puff(7, s.x, ground - 1.2, 'pl-spark', 3); } }
    status.textContent = endWords(r);
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.outcome },
      h('b', { class: 'rp-stars', text: r.success ? stars : WORDS[r.outcome] }),
      h('span', { text: r.success ? `${r.soft ? 'A soft touch' : 'Safe landing'} · ${r.fuelLeft < s.fuelMax * 0.2 ? 'the tank nearly dry' : r.fuelLeft > s.fuelMax * 0.5 ? 'plenty of fuel left' : 'fuel to spare'} · +${r.xp} Piloting XP` : `${WORDS[r.outcome].toLowerCase()} · No XP` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

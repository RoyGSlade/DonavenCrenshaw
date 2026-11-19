// Touchdown on screen: a side view (SVG) of the ship falling toward a lit landing pad, a speed
// read-out against the safe speed, a fuel bar, a crosswind arrow, and four big controls: Left and
// Right and Thrust (hold), Brake (tap). Keys: arrows or A/D steer, Space or Up/W thrust, B brake.
// Fixed 60 Hz steps. DOM and SVG only, no art. Resolves with the rules' result.
import { stepPilot, brake, windAt, onPad, PILOT_DT } from './pilot.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
const WORDS = { landed: 'TOUCHDOWN', crashed: 'CRASHED: TOO FAST', missed: 'MISSED THE PAD' };
const GROUND = 56;                                  // screen y of the ground line (the view is 100 wide, 64 high)
const sy = (y) => GROUND - (y / 100) * (GROUND - 5); // altitude 100 -> near the top

export function playPilot(root, { state, where = 'the hangar pad', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  const padEl = sv('rect', { class: 'pl-pad', x: s.padX - s.pad / 2, y: GROUND - 1.2, width: s.pad, height: 2.4, rx: 0.8 });
  const flame = sv('path', { class: 'pl-flame', d: 'M-1.6 3.4 L0 8.5 L1.6 3.4 Z' });
  const ship = sv('g', { class: 'pl-ship' }, flame, sv('path', { class: 'pl-hull', d: 'M0 -4.2 L2.6 3.4 L-2.6 3.4 Z' }), sv('rect', { class: 'pl-leg', x: -3.3, y: 3.4, width: 6.6, height: 0.9, rx: 0.4 }));
  const svg = sv('svg', { class: 'pl-view', viewBox: '0 0 100 64', role: 'img', 'aria-label': 'Side view of the ship above the pad', preserveAspectRatio: 'xMidYMid meet' },
    sv('rect', { class: 'pl-sky', x: 0, y: 0, width: 100, height: 64 }), sv('rect', { class: 'pl-ground', x: 0, y: GROUND, width: 100, height: 64 - GROUND }), padEl,
    sv('line', { class: 'pl-line', x1: s.padX, x2: s.padX, y1: GROUND - 1.2, y2: 6 }), ship);
  const speedEl = h('b', { text: '' }), fuelBar = h('div', { class: 'nv-bar is-fuel pl-fuel' }, h('span', { text: 'Fuel' }), h('i', {}, h('u')), h('b', { text: '' }));
  const hud = h('div', { class: 'pl-hud' }, h('p', { class: 'pl-speed' }, h('span', { text: 'Speed ' }), speedEl, h('small', { text: ` (safe: ${Math.round(s.safe * 10) / 10})` })),
    h('p', { class: 'pl-wind', text: '' }), h('p', { class: 'pl-brakes', text: '' }));
  const btn = (cls, text, label) => h('button', { type: 'button', class: `pl-btn ${cls}`, 'aria-label': label, text });
  const bL = btn('pl-left', '◀', 'Drift left'), bR = btn('pl-right', '▶', 'Drift right'), bT = btn('pl-thrust primary', 'Thrust', 'Thrust (hold)'), bB = btn('pl-brake', 'Brake', 'Emergency brake');
  const pad = h('div', { class: 'pl-controls' }, bL, bT, bR, bB);
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Bring the ship down on ${where}. Hold Thrust to slow the fall, Left and Right to drift.` });
  const panel = h('section', { class: 'rp-panel pl-panel', role: 'group', 'aria-label': 'Landing' },
    h('p', { class: 'rp-eyebrow', text: `TOUCHDOWN · ${where.toUpperCase()}` }), hud, fuelBar, svg, pad, status,
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

  function paint() {
    ship.setAttribute('transform', `translate(${s.x.toFixed(2)} ${(sy(s.y) - 1).toFixed(2)})`);
    flame.style.display = s.thrusting ? 'block' : 'none';
    padEl.classList.toggle('is-over', onPad(s));
    const sp = Math.max(0, s.vy);
    speedEl.textContent = (Math.round(sp * 10) / 10).toFixed(1);
    speedEl.className = sp <= s.safe ? 'is-ok' : sp <= s.safe * 2 ? 'is-warn' : 'is-bad';
    fuelBar.querySelector('u').style.width = `${(100 * s.fuel) / s.fuelMax}%`; fuelBar.querySelector('b').textContent = `${Math.round(s.fuel)} s`;
    fuelBar.classList.toggle('is-low', s.fuel < s.fuelMax * 0.2);
    const w = windAt(s);
    hud.querySelector('.pl-wind').textContent = Math.abs(w) < 0.4 ? 'Wind: calm' : `Wind: ${w > 0 ? 'blowing right ▶' : '◀ blowing left'}`;
    hud.querySelector('.pl-brakes').textContent = s.brakesMax ? `Brakes: ${s.brakes} of ${s.brakesMax}` : '';
    hud.querySelector('.pl-brakes').hidden = !s.brakesMax;
    bB.disabled = s.brakes <= 0 || s.done; bB.hidden = !s.brakesMax;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    acc = Math.min(0.1, acc + Math.min(0.05, (now - last) / 1000 || 0)); last = now;
    while (acc >= PILOT_DT && !s.done) { stepPilot(s, PILOT_DT, input); acc -= PILOT_DT; }
    paint();
    if (s.done) end();
  }
  function end() {
    cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    Object.keys(input).forEach((k) => { input[k] = false; });
    [bL, bR, bT, bB].forEach((b) => { b.disabled = true; });
    paint();
    const r = s.result;
    status.textContent = r.outcome === 'landed' ? `Down on the pad at ${r.speed.toFixed(1)} (safe ${r.safe.toFixed(1)}).` : r.outcome === 'crashed' ? `You hit at ${r.speed.toFixed(1)}: the safe speed is ${r.safe.toFixed(1)}.` : `You came down ${Math.round(r.off)} off the pad.`;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const go = h('button', { type: 'button', class: 'primary', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.outcome },
      h('b', { class: 'rp-stars', text: r.success ? stars : WORDS[r.outcome] }),
      h('span', { text: r.success ? `${r.speed.toFixed(1)} speed · ${Math.round(r.fuelLeft)} s of fuel left · ${r.seconds} s${r.soft ? ' · soft touch' : ''} · +${r.xp} Piloting XP` : `${WORDS[r.outcome].toLowerCase()} · No XP` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

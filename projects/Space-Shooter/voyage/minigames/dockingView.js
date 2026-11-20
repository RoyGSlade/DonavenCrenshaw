// Docking on screen: a top-down canvas. A big base turns slowly in the faction colours, a lit corridor runs out from a berth on its
// rim (so the corridor sweeps), and the ship comes in from open space. HUD: drawn bars and words only (the lane word, the closing
// speed against its safe mark, the hull, and the warning that fills while you scrape the wall); no numbers while you fly.
// Controls: drag on the board to aim (the ship swings to face your finger) and hold the Thrust pad; on a desktop move the mouse to
// aim and hold the button or Space to thrust, or press W A S D / the arrow keys to burn in that direction. Fixed 60 Hz steps.
// Resolves with the rules' result ({ success, clean, grade, hullLost, timeS, xp, ... }).
import { stepDocking, frameOf, dockingWord, warnFill, DOCKING_DT, RB, DM, SHIP_R, OUTCOMES, PASS } from './docking.js';
import { speedFill, speedWord, speedTone, safeMark } from './pilotWords.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); }
  el.append(...kids.filter(Boolean));
  return el;
};
function ensureStyle() {
  if (typeof document === 'undefined' || document.querySelector('link[data-docking]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./docking.css', import.meta.url).href; link.dataset.docking = '';
  document.head.append(link);
}

const TEAL = '#38d6cc', AMBER = '#ffad72', TAU = Math.PI * 2;
// the world the board always shows: x -100..100, y -48..142 (the base's top to the ship's start), centred in whatever box it gets; a wider box shows more space to the sides
const WW = 200, WH = 190, CY = 47;
const lcg = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const WORD_TONE = { 'find the corridor': 'warn', 'clamped': 'ok', 'lined up': 'ok', 'in the corridor': '', 'too fast': 'warn', 'drifting wide': 'bad', 'scrape': 'bad', 'waved off': 'bad' };

const hullLevel = (lost) => (lost <= 0 ? 'sound' : lost < 25 ? 'scuffed' : 'damaged');
const hullWord = (lost) => ({ sound: 'sound', scuffed: 'scuffed', damaged: 'damaged' })[hullLevel(lost)];

export function endWords(r) {
  if (r.outcome === OUTCOMES.docked) return r.clean ? 'Clamped. A clean dock.' : r.hullLost >= 25 ? 'Clamped, but the hull took a beating.' : 'Clamped, with a few scrapes on the hull.';
  return 'The base turned away: you were waved off.';
}
export function tryWords(r) {
  if (r.outcome === OUTCOMES.wavedOff) return 'Get into the lit corridor sooner, and follow it round';
  if (r.hullLost > 0) return 'Stay inside the lit walls and ease off before the berth';
  return '';
}
export const gradeWord = (r) => (r.outcome !== OUTCOMES.docked ? 'waved off' : r.grade >= 95 && r.clean ? 'perfect dock' : r.clean ? 'clean dock' : r.success ? 'scraped in' : 'rough dock');

export function playDocking(root, { state, where = 'the star base', sound = () => {}, reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state;
  const calm = () => reducedMotion();

  // ---- the HUD ----------------------------------------------------------------------------------------------------------------
  const laneWord = h('em', { text: 'in the corridor' });
  const gFill = h('i'), gSafe = h('s', { class: 'dk-safe', style: `width:${(100 * safeMark()).toFixed(2)}%` }), gWord = h('em', { text: 'gentle' });
  const gTrack = h('div', { class: 'dk-meter dk-speed', role: 'img', 'aria-label': 'Closing speed against the berth. The green part is safe.' }, gSafe, gFill);
  const hullFill = h('i'), hullWordEl = h('em', { text: 'sound' });
  const hullTrack = h('div', { class: 'dk-meter dk-hull', role: 'img', 'aria-label': 'Hull' }, hullFill);
  const warnFillEl = h('i'), warnWord = h('em', { text: 'clear' });
  const warnTrack = h('div', { class: 'dk-meter dk-warn', role: 'img', 'aria-label': 'Warning before the wall scrapes' }, warnFillEl);
  const stLane = h('div', { class: 'dk-stat dk-lane' }, h('span', { text: 'Lane' }), laneWord);
  const stSpeed = h('div', { class: 'dk-stat dk-speedstat' }, h('span', { text: 'Closing' }), gTrack, gWord);
  const stHull = h('div', { class: 'dk-stat dk-hullstat' }, h('span', { text: 'Hull' }), hullTrack, hullWordEl);
  const stWarn = h('div', { class: 'dk-stat dk-warnstat' }, h('span', { text: 'Warning' }), warnTrack, warnWord);
  const hud = h('div', { class: 'dk-hud' }, stLane, stSpeed, stHull, stWarn);

  const canvas = h('canvas', { class: 'dk-canvas', 'aria-label': `A turning space base with a lit corridor running out from its berth, and your ship coming in. Drag to aim, hold Thrust, line up in the corridor and come in slowly.` });
  const wrap = h('div', { class: 'dk-wrap' }, canvas);
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Line up in the lit corridor, follow its sweep, and come in slowly. Drag to aim, hold Thrust.` });
  const pad = h('button', { type: 'button', class: 'primary ui-btn dk-pad', 'aria-label': 'Thrust (hold)' }, h('b', { text: 'THRUST' }), h('span', { text: 'hold · or Space' }));
  const row = h('div', { class: 'dk-row' }, pad);
  const panel = h('section', { class: 'rp-panel dk-panel mg-skin ui-panel', role: 'group', 'aria-label': 'Docking', 'data-game': 'docking' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `DOCKING · ${where.toUpperCase()}` }), hud, wrap, status, row,
    h('p', { class: 'rp-help', text: 'Fly into the lit corridor, match its sweep, and reach the berth slower than the safe speed. Touch the walls too long, or arrive too fast, and you scrape and bounce off. Drag to aim, hold Thrust.' }));
  panel.__state = s;
  const input = { aim: null, thrust: 0 };
  panel.__input = input;
  root.append(panel);

  // ---- the board: a canvas that fills its box --------------------------------------------------------------------------------
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1, sc = 1, ox = 0, oy = 0, stars = null;
  const view = () => ({ sc, ox, oy, w: cw, h: ch, shipX: ox + s.x * sc, shipY: oy + s.y * sc });
  panel.__view = view;
  const resize = () => {
    const r = wrap.getBoundingClientRect(); const w = Math.round(r.width), hh = Math.round(r.height);
    if (w < 40 || hh < 40) return;
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (w === cw && hh === ch && canvas.width === Math.round(w * dpr)) return;
    cw = w; ch = hh; canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
    sc = Math.min(cw / WW, ch / WH); ox = cw / 2; oy = ch / 2 - CY * sc;
    stars = null;
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(wrap);
  requestAnimationFrame(resize); resize();
  const makeStars = () => {
    const c = document.createElement('canvas'); c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const bg = g.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, '#0a1626'); bg.addColorStop(1, '#04070c'); g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    const neb = g.createRadialGradient(cw * 0.25, ch * 0.75, 10, cw * 0.25, ch * 0.75, Math.max(cw, ch) * 0.6); neb.addColorStop(0, 'rgba(56,214,204,.10)'); neb.addColorStop(1, 'rgba(56,214,204,0)'); g.fillStyle = neb; g.fillRect(0, 0, cw, ch);
    const r = lcg(s.seed * 7 + 11), n = Math.round((cw * ch) / 3200);
    for (let i = 0; i < n; i++) { const x = r() * cw, y = r() * ch, k = r(); g.fillStyle = k > 0.9 ? '#ffd9b8' : k > 0.8 ? '#bfeaff' : 'rgba(220,235,245,.7)'; g.globalAlpha = 0.25 + 0.6 * r(); g.fillRect(x, y, k > 0.95 ? 2.2 : 1.2, k > 0.95 ? 2.2 : 1.2); }
    g.globalAlpha = 1; return c;
  };

  // ---- input -----------------------------------------------------------------------------------------------------------------
  let padHeld = false, mouseHeld = false, spaceHeld = false, aimPointer = null;
  const keys = new Set();
  const keyVec = () => { let x = 0, y = 0; for (const k of keys) { if (k === 'up') y -= 1; else if (k === 'down') y += 1; else if (k === 'left') x -= 1; else x += 1; } return { x, y }; };
  const KEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const aimAt = (e) => { const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const v = view(); const dx = px - v.shipX, dy = py - v.shipY; if (Math.hypot(dx, dy) > 4) input.aim = Math.atan2(dy, dx); };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerType === 'mouse') { mouseHeld = true; aimAt(e); } else { aimPointer = e.pointerId; aimAt(e); }
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || aimPointer === e.pointerId) aimAt(e); });
  const aimOff = (e) => { if (e.pointerType === 'mouse') mouseHeld = false; else if (aimPointer === e.pointerId) aimPointer = null; };
  canvas.addEventListener('pointerup', aimOff); canvas.addEventListener('pointercancel', aimOff); canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); padHeld = true; pad.classList.add('is-held'); try { pad.setPointerCapture(e.pointerId); } catch {} });
  const padOff = () => { padHeld = false; pad.classList.remove('is-held'); };
  pad.addEventListener('pointerup', padOff); pad.addEventListener('pointercancel', padOff); pad.addEventListener('lostpointercapture', padOff); pad.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); });
  const kd = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || s.done) return;
    if (KEY[e.code]) { e.preventDefault(); keys.add(KEY[e.code]); } else if (e.code === 'Space') { e.preventDefault(); spaceHeld = true; }
  };
  const ku = (e) => { if (KEY[e.code]) keys.delete(KEY[e.code]); else if (e.code === 'Space') spaceHeld = false; };
  document.addEventListener('keydown', kd, true); document.addEventListener('keyup', ku, true);
  const frameInput = () => {
    const kv = keyVec(), keyed = kv.x !== 0 || kv.y !== 0;
    if (keyed) input.aim = Math.atan2(kv.y, kv.x);
    input.thrust = keyed || padHeld || mouseHeld || spaceHeld ? 1 : 0;
    return input;
  };

  // ---- the picture -----------------------------------------------------------------------------------------------------------
  const rnd = lcg(31);
  let sparks = [], shake = 0, flashA = 0, vt = 0, banner = '', bannerT = 0, clampT = 0, cardAt = 0, cardUp = false, lastDone = false, dust = [];
  const burst = (n, x, y, hot = 1) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (14 + 40 * rnd()) * hot; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + 0.5 * rnd() }); } };
  const say = (t) => { status.textContent = t; };
  let warnSaid = false;

  function drawBase(g, f, t) {
    g.save(); g.rotate(Math.PI / 2 - f.th);               // the berth is on the +x side while drawing
    const R = RB;
    const body = g.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R); body.addColorStop(0, '#46596a'); body.addColorStop(0.6, '#26343f'); body.addColorStop(1, '#141d26');
    g.fillStyle = body; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(160,190,210,.25)';
    for (const k of [0.72, 0.46, 0.22]) { g.beginPath(); g.arc(0, 0, R * k, 0, TAU); g.stroke(); }
    g.strokeStyle = 'rgba(160,190,210,.22)'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22); g.lineTo(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93); g.stroke(); }
    // the rim in the faction colours: teal and amber segments
    g.lineWidth = 4.5; g.lineCap = 'butt';
    for (let i = 0; i < 16; i++) { const a0 = (i / 16) * TAU + 0.03, a1 = ((i + 1) / 16) * TAU - 0.03; g.strokeStyle = i % 4 === 0 ? AMBER : i % 2 ? '#1c8f8a' : TEAL; g.globalAlpha = 0.9; g.beginPath(); g.arc(0, 0, R - 2.5, a0, a1); g.stroke(); }
    g.globalAlpha = 1;
    // windows on the second ring, some lit
    for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU, lit = ((i * 7 + Math.floor(t * 0.7)) % 5) !== 0; g.fillStyle = lit ? (i % 6 === 0 ? '#ffd9a8' : '#bff6f2') : '#0e161d'; g.globalAlpha = lit ? 0.85 : 0.6; g.fillRect(Math.cos(a) * R * 0.82 - 0.9, Math.sin(a) * R * 0.82 - 0.9, 1.8, 1.8); }
    g.globalAlpha = 1;
    // the hub
    const hub = g.createRadialGradient(0, 0, 1, 0, 0, R * 0.2); hub.addColorStop(0, '#9fe8e2'); hub.addColorStop(1, '#1d5a57'); g.fillStyle = hub; g.beginPath(); g.arc(0, 0, R * 0.2, 0, TAU); g.fill();
    // the berth bay and its two clamp arms (open while you fly, closed on the ship when you dock)
    const w = s.berth + 4, close = clampT;                  // 0 open .. 1 closed
    g.fillStyle = '#10181f'; g.fillRect(R - 6, -w - 3, 8, 2 * w + 6);
    g.strokeStyle = TEAL; g.lineWidth = 1.4; g.strokeRect(R - 6, -w - 3, 8, 2 * w + 6);
    for (const side of [-1, 1]) {
      g.save(); g.translate(R, side * (w + 1)); g.rotate(-side * (0.05 + 0.75 * close));
      g.fillStyle = '#6d8394'; g.strokeStyle = AMBER; g.lineWidth = 1.2; g.beginPath(); g.rect(0, side < 0 ? -2 : -1, 15, 3); g.fill(); g.stroke();
      g.fillStyle = AMBER; g.fillRect(12, side < 0 ? -2.4 : -1.6, 4, 3.4);
      g.restore();
    }
    g.restore();
  }

  function drawLane(g, f, t) {
    const { B, u, n } = f; const w0 = s.berth, w1 = s.mouth;
    const P = (d, l) => [B.x + u.x * d + n.x * l, B.y + u.y * d + n.y * l];
    const a = P(0, -w0), b = P(DM, -w1), c = P(DM, w1), d2 = P(0, w0);
    const e0 = P(0, 0), e1 = P(DM, 0);
    const fl = g.createLinearGradient(e0[0], e0[1], e1[0], e1[1]); fl.addColorStop(0, 'rgba(56,214,204,.34)'); fl.addColorStop(1, 'rgba(56,214,204,.05)');
    g.fillStyle = fl; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d2); g.closePath(); g.fill();
    const out = s.outside && !s.done, rel = Math.min(1, Math.abs(f.l) / Math.max(f.half, 1));
    const edge = s.flash > 0 || out ? '#ff6b5a' : rel > 0.82 ? '#ffc857' : TEAL;
    g.lineWidth = 1.6; g.strokeStyle = edge; g.shadowColor = edge; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.moveTo(...d2); g.lineTo(...c); g.stroke(); g.shadowBlur = 0;
    // running lights: pulses that travel toward the berth along both edges, and a dotted centre line
    for (const side of [-1, 1]) for (let k = 0; k < 8; k++) { const d = ((k * DM) / 8 + (calm() ? 0 : t * 16)) % DM; const half = w0 + ((w1 - w0) * (DM - d)) / DM; const [px, py] = P(DM - d, side * half); g.fillStyle = edge; g.globalAlpha = 0.35 + 0.55 * (1 - d / DM); g.beginPath(); g.arc(px, py, 0.9, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    g.setLineDash([1.5, 3.5]); g.lineWidth = 0.8; g.strokeStyle = 'rgba(200,255,250,.4)'; g.beginPath(); g.moveTo(...e0); g.lineTo(...e1); g.stroke(); g.setLineDash([]);
    // chevrons that point at the berth, brightest nearest it
    g.strokeStyle = 'rgba(200,255,250,.5)'; g.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { const d = k * 17; const half = w0 + ((w1 - w0) * d) / DM; const [cx, cy] = P(d, 0); const [lx, ly] = P(d + 5, -half * 0.45), [rx, ry] = P(d + 5, half * 0.45); g.globalAlpha = 0.7 - k * 0.12; g.beginPath(); g.moveTo(lx, ly); g.lineTo(cx, cy); g.lineTo(rx, ry); g.stroke(); }
    g.globalAlpha = 1;
  }

  function drawShip(g, x, y, ang, t, thrust, tint) {
    g.save(); g.translate(x, y); g.rotate(ang);
    if (thrust) { const L = 6 + 4 * Math.abs(Math.sin(t * 40)); g.fillStyle = '#ffb069'; g.beginPath(); g.moveTo(-3.4, -1.8); g.lineTo(-3.4 - L, 0); g.lineTo(-3.4, 1.8); g.closePath(); g.fill(); g.fillStyle = '#fff2c4'; g.beginPath(); g.moveTo(-3.4, -0.9); g.lineTo(-3.4 - L * 0.55, 0); g.lineTo(-3.4, 0.9); g.closePath(); g.fill(); }
    g.shadowColor = tint || '#81e6df'; g.shadowBlur = 7;
    g.fillStyle = tint || '#d3e6ef'; g.strokeStyle = '#81e6df'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-4.2, 4.6); g.lineTo(-2.4, 0); g.lineTo(-4.2, -4.6); g.closePath(); g.fill(); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = '#0d2531'; g.beginPath(); g.ellipse(1.6, 0, 1.9, 1.2, 0, 0, TAU); g.fill();
    g.restore();
  }

  function draw(dt, t) {
    resize();
    if (!cw) return;
    if (!stars) stars = makeStars();
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(stars, 0, 0, canvas.width, canvas.height);
    const sx = !calm() && shake > 0.2 ? (rnd() - 0.5) * shake : 0, sy = !calm() && shake > 0.2 ? (rnd() - 0.5) * shake : 0;
    g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox + sx), dpr * (oy + sy));
    // the visual clock: the sim's while flying, and it keeps turning after the run so the clamped ship rides the berth round
    const f = frameOf(s, vt);
    drawBase(g, f, vt);
    drawLane(g, f, vt);
    // the ship
    let x = s.x, y = s.y, ang = s.h;
    if (s.done && s.result.outcome === OUTCOMES.docked) { x = f.B.x + f.u.x * (SHIP_R + 0.6); y = f.B.y + f.u.y * (SHIP_R + 0.6); ang = Math.atan2(-f.u.y, -f.u.x); }
    else if (!s.done) {
      // where you are heading against the berth: a faint line, green when safe
      const sp = f.speed, tone = sp <= s.safe ? '#9fe870' : sp <= s.safe * 2 ? '#ffc857' : '#ff6b5a';
      g.strokeStyle = tone; g.globalAlpha = 0.55; g.lineWidth = 0.9; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(x, y); g.lineTo(x + f.vrel.x * 1.6, y + f.vrel.y * 1.6); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
    const ringHot = s.flash > 0 ? '#ff9a8a' : null;
    drawShip(g, x, y, ang, t, s.thrusting && !s.done, ringHot);
    // sparks
    for (const p of sparks) { g.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); g.fillStyle = p.life > 0.35 ? '#fff3b0' : '#ff9a3c'; g.fillRect(p.x - 0.5, p.y - 0.5, 1.1, 1.1); }
    g.globalAlpha = 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (flashA > 0) { g.globalAlpha = flashA * 0.3; g.fillStyle = banner === 'CLAMPED' ? '#9fe870' : '#ff5a45'; g.fillRect(0, 0, cw, ch); g.globalAlpha = 1; }
    if (bannerT > 0) { g.globalAlpha = Math.min(1, bannerT * 1.6); g.fillStyle = banner === 'CLAMPED' ? '#9fe870' : '#ff8a70'; g.font = `800 ${Math.round(Math.min(cw, ch) / 9)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(banner, cw / 2, ch * 0.42 - 12 * (1 - bannerT)); g.globalAlpha = 1; }
  }

  function handle(ev) {
    if (ev.type === 'scrape') {
      flashA = 1; shake = ev.kind === 'wall' ? 7 : 12; panel.classList.add('is-shake'); setTimeout(() => panel.classList.remove('is-shake'), 300);
      burst(ev.kind === 'wall' ? 12 : 22, s.x, s.y, ev.kind === 'wall' ? 1 : 1.4); bannerT = 0.8; banner = 'SCRAPE'; sound('hurt');
      say(ev.kind === 'wall' ? 'Scraped the wall: stay inside the lit lane.' : ev.kind === 'fast' ? 'Too fast at the berth: the clamps would not take you. Ease off and come round again.' : ev.kind === 'face' ? 'You hit the hull beside the berth. Line up first.' : 'Too fast and off the berth. Line up, and ease off.');
      warnSaid = false;
    } else if (ev.type === 'done') {
      if (ev.outcome === OUTCOMES.docked) { flashA = 0.9; banner = 'CLAMPED'; bannerT = 1.2; burst(18, s.x, s.y, 0.8); sound('power'); }
      else { banner = 'WAVED OFF'; bannerT = 1.2; }
      say(endWords(ev)); cardAt = performance.now() + (ev.outcome === OUTCOMES.docked ? 1100 : 700);
    }
  }

  // ---- the loop --------------------------------------------------------------------------------------------------------------
  let raf = 0, last = 0, acc = 0, finish, tClock = 0;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function hudTick() {
    const f = frameOf(s);
    const word = dockingWord(s);
    if (laneWord.textContent !== word) { laneWord.textContent = word; stLane.dataset.tone = WORD_TONE[word] || ''; }
    const fill = speedFill(f.speed, s.safe), tone = speedTone(f.speed, s.safe);
    gFill.style.width = `${(100 * fill).toFixed(1)}%`; gTrack.dataset.tone = tone; stSpeed.dataset.tone = tone === 'ok' ? 'ok' : tone;
    const sw = speedWord(f.speed, s.safe); if (gWord.textContent !== sw) gWord.textContent = sw;
    const lvl = hullLevel(s.hullLost);
    hullFill.style.width = `${100 - s.hullLost}%`; hullTrack.dataset.level = lvl; const hw = hullWord(s.hullLost); if (hullWordEl.textContent !== hw) hullWordEl.textContent = hw;
    const wf = 1 - warnFill(s);
    warnFillEl.style.width = `${(100 * wf).toFixed(1)}%`; warnTrack.dataset.tone = wf > 0.55 ? 'bad' : '';
    const ww = s.outside && !s.done ? 'steer back' : 'clear'; if (warnWord.textContent !== ww) warnWord.textContent = ww;
    stWarn.dataset.tone = s.outside && !s.done ? 'bad' : '';
    if (s.outside && !s.done && !warnSaid && s.flash <= 0) { say('Drifting wide: steer back into the lit corridor before the wall scrapes.'); warnSaid = true; }
    if (!s.outside) warnSaid = false;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    tClock += dt;
    acc = Math.min(0.1, acc + dt);
    while (acc >= DOCKING_DT && !s.done) {
      stepDocking(s, DOCKING_DT, frameInput());
      for (const ev of s.events) handle(ev);
      acc -= DOCKING_DT;
    }
    if (s.done) { acc = 0; if (!lastDone) { lastDone = true; padOff(); Object.assign(input, { aim: null, thrust: 0 }); } }
    vt = s.done ? vt + dt : s.t;
    if (s.done && s.result.outcome === OUTCOMES.docked) clampT = Math.min(1, clampT + dt * 2.2);
    shake = Math.max(0, shake - dt * 40); flashA = Math.max(0, flashA - dt * 2.2); bannerT = Math.max(0, bannerT - dt * 0.7);
    for (const p of sparks) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; } sparks = sparks.filter((p) => p.life > 0);
    hudTick();
    draw(dt, tClock);
    if (s.done && !cardUp && cardAt && performance.now() >= cardAt) { cardUp = true; showCard(); }
  }

  function showCard() {
    const r = s.result;
    const meter = (cls, pct, tone) => h('div', { class: `dk-meter ${cls}`, 'data-tone': tone || '' }, h('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));
    const grade = meter('dk-gradebar', r.grade, r.grade >= PASS ? '' : 'bad');
    const hull = meter('dk-hull', 100 - r.hullLost, ''); hull.dataset.level = hullLevel(r.hullLost);
    const go = h('button', { type: 'button', class: 'primary ui-btn dk-go', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: 'dk-card rp-result ui-card', role: 'status', 'data-ok': r.success ? '1' : '0', 'data-outcome': r.outcome, 'data-grade': String(r.grade) },
      h('b', { text: gradeWord(r).toUpperCase() }),
      r.outcome === OUTCOMES.docked ? h('div', { class: 'dk-bars' }, h('div', {}, h('span', { text: 'Clean' }), grade), h('div', {}, h('span', { text: 'Hull' }), hull)) : null,
      h('p', { class: 'dk-line', text: r.outcome === OUTCOMES.docked ? `${r.scrapes ? `${r.scrapes} scrape${r.scrapes === 1 ? '' : 's'}` : 'No scrapes'} · docked in ${r.timeS} s · ${r.success ? `+${r.xp} Piloting XP` : 'no XP'}` : `${tryWords(r)} · No XP` }),
      go);
    go.addEventListener('click', () => { finishUp(); finish(r); });
    wrap.append(card); go.focus({ preventScroll: true });
  }
  function finishUp() { cancelAnimationFrame(raf); document.removeEventListener('keydown', kd, true); document.removeEventListener('keyup', ku, true); panel.remove(); }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

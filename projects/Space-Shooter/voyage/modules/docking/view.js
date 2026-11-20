// Docking on screen: full screen, phone first. A canvas draws the turning base, its lit corridor (with approach lights that go out one
// by one), the other ships already at their berths, your courier and its exhaust. The HUD is drawn bars, lamps and plain words (no raw
// numbers while you fly): the lane word, the closing speed against its safe mark, the hull, the warning that fills while you scrape the
// wall, and the six approach lights. The result card draws your own flight line against the corridor.
//
// Hand: drag on the board to aim (the ship swings to face your finger) and hold the Thrust pad. On a desktop move the mouse to aim and
// hold the mouse button or Space to burn, or press WASD / the arrows to aim and burn in that direction. Fixed 60 Hz steps. The first
// burn starts the run: until then the lights wait, so there is time to look.
import { stepDocking, frameOf, dockingWord, warnFill, wallNear, lightsLeft, halfAt, safeAt, DOCKING_DT, RB, DM, SHIP_R, OUTCOMES, PASS } from './model.js';
import { LINES, endLine, endWords, tryWords, gradeWord, scrapeWords, hullLevel, speedFill, speedWord, speedTone, safeMark } from './words.js';
import { createAudio } from './audio.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); }
  el.append(...kids.filter(Boolean));
  return el;
};
const TAU = Math.PI * 2, TEAL = '#38d6cc', AMBER = '#ffad72', GREEN = '#8cf29a', RED = '#ff6b5a';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lcg = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const hashStr = (str) => { let x = 2166136261; for (const c of String(str)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x >>> 0; };
// the world the board always shows: x -85..85, y -52..152 (the base's top to the ship's start), centred in whatever box it gets
const WW = 170, WH = 204, CY = 50;
const ART = (name) => new URL(`./art/${name}`, import.meta.url).href;
const WORD_TONE = { 'find the corridor': 'warn', clamped: 'ok', 'lined up': 'ok', 'in the corridor': '', 'too fast': 'bad', 'ease off': 'warn', 'drifting wide': 'bad', scrape: 'bad', 'waved off': 'bad' };

export function loadStyle() {
  if (typeof document === 'undefined') return Promise.resolve();
  const have = document.querySelector('link[data-m-docking]');
  if (have) return have.__ready || Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./style.css', import.meta.url).href; link.dataset.mDocking = '';
  link.__ready = new Promise((r) => { link.onload = link.onerror = () => r(); setTimeout(r, 2500); });
  document.head.append(link);
  return link.__ready;
}
const loadImg = (name) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = ART(name); });

/**
 * Mount the game in `stage` and resolve with the rules' result when the player presses Continue on the card.
 * state: the model state. base: { name, colour, berths, berth, docked: [{ ship, berth }] }. ship: { name }.
 */
export function mountDocking(stage, { state, base, ship, sound = () => {}, reducedMotion = () => false, onClose = () => {} }) {
  const s = state;
  const calm = () => reducedMotion();
  const colour = /^#[0-9a-f]{6}$/i.test(base.colour || '') ? base.colour : TEAL;
  const berths = Math.max(1, Math.trunc(base.berths) || 4), berthNo = s.berthNo;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // ---- the HUD ---------------------------------------------------------------------------------------------------------------
  const stat = (cls, label, ...kids) => h('div', { class: `dk-stat ${cls}` }, h('span', { text: label }), ...kids);
  const laneWord = h('em', { text: 'find the corridor' });
  const lamps = Array.from({ length: s.lights }, () => h('i'));
  const lampRow = h('div', { class: 'dk-lamps', role: 'img', 'aria-label': 'Approach lights. When the last one goes out, a tug brings you in.' }, ...lamps);
  const gSafe = h('s', { class: 'dk-safe', style: `width:${(100 * safeMark()).toFixed(2)}%` }), gFill = h('i'), gWord = h('em', { text: 'gentle' });
  const gTrack = h('div', { class: 'dk-meter dk-speed', role: 'img', 'aria-label': 'Closing speed against the berth. The green part is safe.' }, gSafe, gFill);
  const hullFill = h('i'), hullWordEl = h('em', { text: 'sound' });
  const hullTrack = h('div', { class: 'dk-meter dk-hull', role: 'img', 'aria-label': 'Hull' }, hullFill);
  const warnFillEl = h('i'), warnWord = h('em', { text: 'clear' });
  const warnTrack = h('div', { class: 'dk-meter dk-warn', role: 'img', 'aria-label': 'Warning before the wall scrapes' }, warnFillEl);
  const stLane = stat('dk-lane', 'Lane', laneWord), stLamps = stat('dk-lights', 'Approach lights', lampRow);
  const stSpeed = stat('dk-closing', 'Closing', gTrack, gWord), stHull = stat('dk-hullstat', 'Hull', hullTrack, hullWordEl), stWarn = stat('dk-warnstat', 'Wall', warnTrack, warnWord);
  const hud = h('div', { class: 'dk-hud' }, stLane, stLamps, stSpeed, stHull, stWarn);
  const head = h('p', { class: 'dk-eyebrow', text: `DOCKING · ${String(base.name || 'the base').toUpperCase()}` });

  const canvas = h('canvas', { class: 'dk-canvas', 'aria-label': 'A turning space base with a lit corridor running out from its berth, and your ship coming in. Drag to aim, hold Thrust, line up in the corridor and come in slowly.' });
  const hint = h('p', { class: 'dk-start', text: touch ? 'Drag on the board to aim · hold THRUST to burn' : 'Move the mouse to aim · hold Space or the button to burn · or use WASD' });
  const board = h('div', { class: 'dk-board' }, canvas, hint);
  const sayWho = h('b', { text: LINES.approach.who }), sayText = h('span', { text: LINES.approach.text(berthNo) });
  const say = h('p', { class: 'dk-say', role: 'status', 'aria-live': 'polite' }, sayWho, sayText);
  const tip = h('p', { class: 'dk-tip', text: 'Line up in the lit corridor, follow its sweep, and come in slowly.' });
  const pad = h('button', { type: 'button', class: 'dk-pad', 'aria-label': 'Thrust (hold)' }, h('b', { text: 'THRUST' }), h('span', { text: touch ? 'hold to burn' : 'hold · or Space' }));
  const row = h('div', { class: 'dk-row' }, pad);
  const root = h('section', { class: 'm-docking', role: 'group', 'aria-label': 'Docking', 'data-game': 'docking' }, head, hud, board, say, tip, row);
  const input = { aim: null, thrust: 0 };
  root.__state = s; root.__input = input; root.__audio = () => !!audio?.live;
  stage.append(root);
  sound('music:duck');
  sound(`line:${LINES.approach.id}`);

  // ---- art ------------------------------------------------------------------------------------------------------------------------
  let baseImg = null, shipImg = null;
  loadImg('base-drift-station.webp').then((i) => { if (i) baseImg = tint(i); });
  let shipHot = null; const shipTints = new Map();
  const tintedSprite = (img, css) => {     // the sprite and nothing else, washed with a colour (tinting on the main canvas would paint the whole square)
    const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; const g = c.getContext('2d');
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = css; g.fillRect(0, 0, c.width, c.height); return c;
  };
  loadImg('ship-courier.webp').then((i) => { shipImg = i; if (i) shipHot = tintedSprite(i, 'rgba(255,90,70,.4)'); });
  const dockedSprite = (name) => { if (!shipImg) return null; if (!shipTints.has(name)) shipTints.set(name, tintedSprite(shipImg, `hsla(${hashStr(name) % 360},65%,55%,.45)`)); return shipTints.get(name); };
  function tint(img) {   // the hull wears the faction's colour: a soft wash over the base picture, cached once
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 512, 512); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.3; g.fillStyle = colour; g.fillRect(0, 0, 512, 512);
    return c;
  }

  // ---- the board ------------------------------------------------------------------------------------------------------------------------
  const ctx2 = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1, sc = 1, ox = 0, oy = 0, stars = null, camX = null;
  const camTarget = (f) => clamp((s.x + f.B.x) / 2, -55, 55);   // the camera keeps you and the berth on the board: on a narrow phone the base slides across as the lane sweeps
  const view = () => ({ sc, ox, oy, w: cw, h: ch, shipX: ox + s.x * sc, shipY: oy + s.y * sc });
  root.__view = view;
  const resize = () => {
    const r = board.getBoundingClientRect(); const w = Math.round(r.width), hh = Math.round(r.height);
    if (w < 40 || hh < 40) return;
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (w === cw && hh === ch && canvas.width === Math.round(w * dpr)) return;
    cw = w; ch = hh; canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
    sc = Math.min(cw / WW, ch / WH); ox = cw / 2 - (camX ?? 0) * sc; oy = ch / 2 - CY * sc; stars = null;
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(board);
  requestAnimationFrame(resize); resize();
  const makeStars = () => {
    const c = document.createElement('canvas'); c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const bg = g.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, '#0a1626'); bg.addColorStop(1, '#04070c'); g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    const neb = g.createRadialGradient(cw * 0.25, ch * 0.78, 10, cw * 0.25, ch * 0.78, Math.max(cw, ch) * 0.6); neb.addColorStop(0, 'rgba(56,214,204,.10)'); neb.addColorStop(1, 'rgba(56,214,204,0)'); g.fillStyle = neb; g.fillRect(0, 0, cw, ch);
    const r = lcg(s.seed * 7 + 11), n = Math.round((cw * ch) / 3200);
    for (let i = 0; i < n; i++) { const x = r() * cw, y = r() * ch, k = r(); g.fillStyle = k > 0.9 ? '#ffd9b8' : k > 0.8 ? '#bfeaff' : 'rgba(220,235,245,.7)'; g.globalAlpha = 0.25 + 0.6 * r(); g.fillRect(x, y, k > 0.95 ? 2.2 : 1.2, k > 0.95 ? 2.2 : 1.2); }
    g.globalAlpha = 1; return c;
  };

  // ---- input -----------------------------------------------------------------------------------------------------------------------
  let padHeld = false, mouseHeld = false, spaceHeld = false, aimPointer = null, started = false, audio = null;
  const keys = new Set();
  const KEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const keyVec = () => { let x = 0, y = 0; for (const k of keys) { if (k === 'up') y -= 1; else if (k === 'down') y += 1; else if (k === 'left') x -= 1; else x += 1; } return { x, y }; };
  const wake = () => { if (!audio) audio = createAudio(); audio.unlock(); };
  const aimAt = (e) => { const r = canvas.getBoundingClientRect(); const v = view(); const dx = e.clientX - r.left - v.shipX, dy = e.clientY - r.top - v.shipY; if (Math.hypot(dx, dy) > 4) input.aim = Math.atan2(dy, dx); };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault(); wake();
    if (e.pointerType === 'mouse') { mouseHeld = true; aimAt(e); } else { aimPointer = e.pointerId; aimAt(e); }
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || aimPointer === e.pointerId) aimAt(e); });
  const aimOff = (e) => { if (e.pointerType === 'mouse') mouseHeld = false; else if (aimPointer === e.pointerId) aimPointer = null; };
  canvas.addEventListener('pointerup', aimOff); canvas.addEventListener('pointercancel', aimOff); canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); wake(); padHeld = true; pad.classList.add('is-held'); try { pad.setPointerCapture(e.pointerId); } catch {} });
  const padOff = () => { padHeld = false; pad.classList.remove('is-held'); };
  pad.addEventListener('pointerup', padOff); pad.addEventListener('pointercancel', padOff); pad.addEventListener('lostpointercapture', padOff); pad.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault(); });
  const kd = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || s.done || !root.isConnected) return;
    if (e.target?.closest?.('input,select,textarea')) return;
    wake();
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

  // ---- the picture -----------------------------------------------------------------------------------------------------------------------
  const rnd = lcg(31);
  let sparks = [], shake = 0, flashA = 0, vt = 0, banner = '', bannerT = 0, clampT = 0, thump = 0, lastDone = false, cardUp = false, cardAt = 0;
  let trail = [], trailAt = 0, chase = 0, lampWarn = 0, warnSaid = false, firstScrapeSaid = false, tug = null;
  const dust = Array.from({ length: 70 }, () => ({ d: rnd() * (DM + 10), l: (rnd() * 2 - 1) * 1.25, v: 3 + 5 * rnd(), r: 0.35 + 0.5 * rnd(), a: 0.2 + 0.5 * rnd() }));
  const burst = (n, x, y, hot = 1) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (14 + 40 * rnd()) * hot; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + 0.5 * rnd() }); } };
  const setSay = (line, text) => { sayWho.textContent = line.who; sayText.textContent = text; sound(`line:${line.id}`); };
  const lampD = (k) => DM - 4 - (k * (DM - 14)) / Math.max(1, s.lights - 1);   // lamp 0 is out at the mouth, the last one is by the berth

  function drawBase(g, f, t) {
    g.save(); g.rotate(Math.PI / 2 - f.th);                  // the berth is on the +x side while drawing
    const R = RB;
    if (baseImg) { const half = R / 0.94; g.drawImage(baseImg, -half, -half, 2 * half, 2 * half); }
    else {
      const body = g.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R); body.addColorStop(0, '#46596a'); body.addColorStop(0.6, '#26343f'); body.addColorStop(1, '#141d26');
      g.fillStyle = body; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      g.lineWidth = 4.5; for (let i = 0; i < 16; i++) { g.strokeStyle = i % 4 === 0 ? AMBER : i % 2 ? '#1c8f8a' : colour; g.beginPath(); g.arc(0, 0, R - 2.5, (i / 16) * TAU + 0.03, ((i + 1) / 16) * TAU - 0.03); g.stroke(); }
    }
    // berth lights at every arm tip in the faction colour, steady on the busy ones
    for (let i = 1; i <= berths; i++) {
      const a = ((i - berthNo) / berths) * TAU, occupied = base.docked?.some((d) => d.berth === i) || i === berthNo;
      g.save(); g.rotate(a);
      g.fillStyle = colour; g.shadowColor = colour; g.shadowBlur = 5; g.globalAlpha = occupied ? 0.95 : 0.55; for (const side of [-1, 1]) { g.beginPath(); g.arc(R - 1.5, side * 7.5, 0.9, 0, TAU); g.fill(); }
      g.restore();
    }
    g.shadowBlur = 0; g.globalAlpha = 1;
    // the active berth: the bay and its two clamp arms (open while you fly, closed on the ship when you dock)
    const w = s.berth + 3, close = clampT;                   // 0 open .. 1 closed
    g.fillStyle = '#0b1218'; g.fillRect(R - 6, -w - 2, 8, 2 * w + 4);
    g.strokeStyle = colour; g.lineWidth = 1.2; g.strokeRect(R - 6, -w - 2, 8, 2 * w + 4);
    for (const side of [-1, 1]) {
      g.save(); g.translate(R, side * (w + 0.5)); g.rotate(-side * (0.05 + 0.8 * close));
      g.fillStyle = '#6d8394'; g.strokeStyle = AMBER; g.lineWidth = 1.1; g.beginPath(); g.rect(0, side < 0 ? -2 : -1, 14, 3); g.fill(); g.stroke();
      g.fillStyle = AMBER; g.fillRect(11, side < 0 ? -2.4 : -1.6, 4, 3.4);
      g.restore();
    }
    g.restore();
    // the other ships already home at their berths, riding the rim with the base
    for (const d of base.docked || []) {
      if (!d.ship || d.berth === berthNo || d.berth < 1 || d.berth > berths) continue;
      const ang = Math.PI / 2 - f.th + ((d.berth - berthNo) / berths) * TAU;   // the arm's direction in the world
      const px = Math.cos(ang) * (RB - 2.5), py = Math.sin(ang) * (RB - 2.5);
      g.save(); g.translate(px, py); g.rotate(ang + Math.PI + Math.PI / 2); g.globalAlpha = 0.92;
      const sprite = dockedSprite(d.ship);
      if (sprite) { g.drawImage(sprite, -3.2, -3.5, 6.4, 7); }
      else { g.fillStyle = `hsl(${hashStr(d.ship) % 360},35%,70%)`; g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill(); }
      g.restore();
      if (sc >= 2.2) { g.save(); g.translate(Math.cos(ang) * (RB + 8), Math.sin(ang) * (RB + 8)); g.fillStyle = 'rgba(200,230,236,.55)'; g.font = `${Math.max(2.8, 9 / sc)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.ship, 0, 0); g.restore(); }
    }
  }

  function drawLane(g, f, t) {
    const { B, u, n } = f; const w0 = s.berth, w1 = s.mouth;
    const P = (d, l) => [B.x + u.x * d + n.x * l, B.y + u.y * d + n.y * l];
    const a = P(0, -w0), b = P(DM, -w1), c = P(DM, w1), d2 = P(0, w0), e0 = P(0, 0), e1 = P(DM, 0);
    const docked = s.done && s.result.outcome === OUTCOMES.docked;
    const fl = g.createLinearGradient(e0[0], e0[1], e1[0], e1[1]); fl.addColorStop(0, docked ? 'rgba(140,242,154,.40)' : 'rgba(56,214,204,.34)'); fl.addColorStop(1, 'rgba(56,214,204,.05)');
    g.fillStyle = fl; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d2); g.closePath(); g.fill();
    // dust drifting through the corridor light, toward the berth
    for (const m of dust) {
      const d = ((m.d - (calm() ? 0 : t * m.v)) % (DM + 10) + DM + 10) % (DM + 10), half = halfAt(s, d) * 1.1;
      const [px, py] = P(d, m.l * half); g.globalAlpha = m.a * (Math.abs(m.l) < 0.9 ? 0.9 : 0.4); g.fillStyle = '#d8fffb'; g.beginPath(); g.arc(px, py, m.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // the walls: each edge flares as you near it, amber then red; a longer warning (Pursuit) lights it from further out
    const near = s.done ? 0 : wallNear(s, f), side = f.l < 0 ? -1 : 1, out = s.outside && !s.done;
    for (const sd of [-1, 1]) {
      const k = sd === side ? near : 0, hot = s.flash > 0 || (out && sd === side);
      const col = hot ? RED : k > 0.01 ? (k > 0.75 ? '#ff9a4a' : '#ffc857') : docked ? GREEN : colour;
      g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 5 + 14 * k + (hot ? 8 : 0); g.lineWidth = 1.5 + 1.8 * k;
      g.beginPath(); const [x0, y0] = P(0, sd * w0), [x1, y1] = P(DM, sd * w1); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.shadowBlur = 0;
    g.setLineDash([1.5, 3.5]); g.lineWidth = 0.8; g.strokeStyle = 'rgba(200,255,250,.4)'; g.beginPath(); g.moveTo(...e0); g.lineTo(...e1); g.stroke(); g.setLineDash([]);
    // chevrons that point at the berth, brightest nearest it
    g.strokeStyle = 'rgba(200,255,250,.5)'; g.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { const d = k * 17 - 6, half = w0 + ((w1 - w0) * d) / DM; const [cx, cy] = P(d, 0); const [lx, ly] = P(d + 5, -half * 0.45), [rx, ry] = P(d + 5, half * 0.45); g.globalAlpha = 0.7 - k * 0.12; g.beginPath(); g.moveTo(lx, ly); g.lineTo(cx, cy); g.lineTo(rx, ry); g.stroke(); }
    g.globalAlpha = 1;
    // the approach lights: the limit, drawn in the world. Lit ones glow green; the next to go flickers amber; out ones are dark glass
    for (let k = 0; k < s.lights; k++) {
      const d = lampD(k), half = halfAt(s, d) + 1.7, lit = k >= s.lightsOut;
      let colL = GREEN, glow = 7, alpha = 1;
      if (docked) { const ph = (chase * 9 - (DM - d) / 9) % 3; colL = GREEN; glow = ph >= 0 && ph < 1 ? 14 : 6; }
      else if (!lit) { colL = '#243038'; glow = 0; alpha = 0.9; }
      else if (k === s.lightsOut && !s.done && started) { const left = (s.lightsOut + 1) * (s.tmax / s.lights) - s.t; if (left < 1.6) { colL = Math.sin(t * 22) > 0 ? '#ffc857' : '#7a5a22'; glow = 8; } }
      for (const sd of [-1, 1]) { const [px, py] = P(d, sd * half); g.globalAlpha = alpha; g.fillStyle = colL; g.shadowColor = colL; g.shadowBlur = glow; g.beginPath(); g.arc(px, py, 1.7, 0, TAU); g.fill(); g.shadowBlur = 0; g.strokeStyle = 'rgba(10,16,22,.8)'; g.lineWidth = 0.5; g.stroke(); }
    }
    g.globalAlpha = 1;
  }

  function drawShip(g, x, y, ang, t, thrust, tintHot, scale = 1) {
    g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2); g.scale(scale, scale);       // the picture's nose is up
    if (thrust) { const L = 3.4 + 2.6 * Math.abs(Math.sin(t * 40)); for (const sx of [-1.5, 1.5]) { g.fillStyle = '#ffb069'; g.beginPath(); g.moveTo(sx - 0.8, 3.1); g.lineTo(sx, 3.1 + L); g.lineTo(sx + 0.8, 3.1); g.closePath(); g.fill(); g.fillStyle = '#fff2c4'; g.beginPath(); g.moveTo(sx - 0.4, 3.1); g.lineTo(sx, 3.1 + L * 0.55); g.lineTo(sx + 0.4, 3.1); g.closePath(); g.fill(); } }
    g.shadowColor = tintHot || '#81e6df'; g.shadowBlur = 6;
    if (shipImg) { g.drawImage(tintHot && shipHot ? shipHot : shipImg, -3.75, -4.1, 7.5, 8.2); }
    else { g.fillStyle = '#d3e6ef'; g.strokeStyle = '#81e6df'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -7); g.lineTo(4.6, 4.2); g.lineTo(0, 2.4); g.lineTo(-4.6, 4.2); g.closePath(); g.fill(); g.stroke(); }
    g.shadowBlur = 0;
    g.restore();
  }

  function drawTug(g, x, y, ang, t) {    // a stubby yard tug: it pushes you in when the lights are out
    g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2);
    g.shadowColor = AMBER; g.shadowBlur = 5; g.fillStyle = '#c99a3b'; g.strokeStyle = '#3a2a0c'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(-3.2, 4); g.lineTo(-3.8, -2); g.lineTo(-1.6, -4.2); g.lineTo(1.6, -4.2); g.lineTo(3.8, -2); g.lineTo(3.2, 4); g.closePath(); g.fill(); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = '#31424f'; g.fillRect(-2, -2.8, 4, 2.4); g.fillStyle = Math.sin(t * 9) > 0 ? '#ffd27a' : '#7a5a22'; g.beginPath(); g.arc(0, 1.6, 0.9, 0, TAU); g.fill();
    g.fillStyle = '#ffb069'; g.beginPath(); g.moveTo(-1.8, 4); g.lineTo(0, 4 + 3 + 2 * Math.sin(t * 40), 0); g.lineTo(1.8, 4); g.closePath(); g.fill();
    g.restore();
  }

  function shipPose(f) {
    const dockedAt = () => ({ x: f.B.x + f.u.x * (SHIP_R + 0.6), y: f.B.y + f.u.y * (SHIP_R + 0.6), ang: Math.atan2(-f.u.y, -f.u.x) });
    if (s.done && s.result.outcome === OUTCOMES.docked) return dockedAt();
    if (s.done && tug) {                     // waved off: the tug pushes you to the berth
      const p = clamp((tug.t - 1.1) / 2.4, 0, 1), e = p * p * (3 - 2 * p), b = dockedAt();
      return { x: tug.from.x + (b.x - tug.from.x) * e, y: tug.from.y + (b.y - tug.from.y) * e, ang: tug.ang0 + (wrapA(b.ang - tug.ang0)) * e };
    }
    return { x: s.x, y: s.y, ang: s.h };
  }
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  function draw(dt, t) {
    resize();
    if (!cw) return;
    if (!stars) stars = makeStars();
    const g = ctx2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const par = (((-(camX ?? 0) * sc * 0.25 * dpr) % canvas.width) + canvas.width) % canvas.width;
    g.drawImage(stars, par, 0, canvas.width, canvas.height); g.drawImage(stars, par - canvas.width, 0, canvas.width, canvas.height);
    const sx = !calm() && shake > 0.2 ? (rnd() - 0.5) * shake : 0, sy = !calm() && shake > 0.2 ? (rnd() - 0.5) * shake : 0;
    g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox + sx), dpr * (oy + sy));
    const f = frameOf(s, vt);
    const want = camTarget(f); camX = camX == null ? want : camX + (want - camX) * Math.min(1, dt * 2.4); ox = cw / 2 - camX * sc;
    g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox + sx), dpr * (oy + sy));
    drawBase(g, f, vt); drawLane(g, f, vt);
    // the wake
    for (let i = 0; i < trail.length; i++) { const p = trail[i]; g.globalAlpha = (i / trail.length) * 0.28; g.fillStyle = '#9fe8e2'; g.beginPath(); g.arc(p[0], p[1], 0.6, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    const pose = shipPose(f);
    if (!s.done) {
      // where you are heading against the berth: a faint line, green when safe
      const sp = f.speed, okv = safeAt(s, f.d), tone = sp <= okv ? '#9fe870' : sp <= okv * 2 ? '#ffc857' : '#ff6b5a';
      g.strokeStyle = tone; g.globalAlpha = 0.55; g.lineWidth = 0.9; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(pose.x, pose.y); g.lineTo(pose.x + f.vrel.x * 1.6, pose.y + f.vrel.y * 1.6); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      if (!started) { const k = 0.5 + 0.5 * Math.sin(t * 4); g.strokeStyle = colour; g.globalAlpha = 0.35 + 0.4 * k; g.lineWidth = 1; g.beginPath(); g.arc(pose.x, pose.y, 9 + 3 * k, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    }
    drawShip(g, pose.x, pose.y, pose.ang, t, s.thrusting && !s.done, s.flash > 0 ? '#ff9a8a' : null);
    if (s.done && tug) {
      const a = clamp(tug.t / 1.1, 0, 1), e = 1 - (1 - a) * (1 - a);
      const dirx = pose.x - f.B.x, diry = pose.y - f.B.y, dl = Math.hypot(dirx, diry) || 1;
      const tx = pose.x + (dirx / dl) * 8.2, ty = pose.y + (diry / dl) * 8.2;
      const fx = tx + tug.side * 80, fy = ty + 30;
      const px = fx + (tx - fx) * e, py = fy + (ty - fy) * e;
      const pushing = tug.t > 1.1 && tug.t < 3.5;
      if (pushing) { g.strokeStyle = 'rgba(255,200,120,.55)'; g.lineWidth = 0.8; g.setLineDash([1.2, 1.2]); g.beginPath(); g.moveTo(px, py); g.lineTo(pose.x, pose.y); g.stroke(); g.setLineDash([]); }
      drawTug(g, px, py, Math.atan2(-diry, -dirx), t);
    }
    for (const p of sparks) { g.globalAlpha = clamp(p.life * 2, 0, 1); g.fillStyle = p.life > 0.35 ? '#fff3b0' : '#ff9a3c'; g.fillRect(p.x - 0.5, p.y - 0.5, 1.1, 1.1); }
    g.globalAlpha = 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (flashA > 0) { g.globalAlpha = flashA * 0.3; g.fillStyle = banner === 'CLAMPED' ? '#9fe870' : '#ff5a45'; g.fillRect(0, 0, cw, ch); g.globalAlpha = 1; }
    if (bannerT > 0) { g.globalAlpha = Math.min(1, bannerT * 1.6); g.fillStyle = banner === 'CLAMPED' ? '#9fe870' : '#ff8a70'; g.font = `800 ${Math.round(Math.min(cw, ch) / 9)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(banner, cw / 2, ch * 0.42 - 12 * (1 - bannerT)); g.globalAlpha = 1; }
  }

  function handle(ev) {
    if (ev.type === 'scrape') {
      flashA = 1; shake = ev.kind === 'wall' ? 7 : 12; root.classList.add('is-shake'); setTimeout(() => root.classList.remove('is-shake'), 300);
      burst(ev.kind === 'wall' ? 12 : 22, s.x, s.y, ev.kind === 'wall' ? 1 : 1.4); bannerT = 0.8; banner = 'SCRAPE'; sound('hurt'); audio?.scrape(ev.kind);
      tip.textContent = scrapeWords(ev.kind); warnSaid = false;
      if (!firstScrapeSaid) { firstScrapeSaid = true; setSay(LINES.scrape, LINES.scrape.text()); }
    } else if (ev.type === 'light') {
      lampWarn = 0.5; audio?.lightOut();
      if (ev.left === 1) tip.textContent = 'The last light is about to go out. Get in.';
    } else if (ev.type === 'done') {
      const L = endLine(ev), docked = ev.outcome === OUTCOMES.docked;
      setSay(L, L.text(berthNo)); tip.textContent = endWords(ev);
      if (docked) { flashA = 0.9; banner = 'CLAMPED'; bannerT = 1.2; burst(18, s.x, s.y, 0.8); sound('power'); audio?.clamp(); cardAt = performance.now() + 1500; }
      else { banner = 'WAVED OFF'; bannerT = 1.2; audio?.tug(); tug = { t: 0, from: { x: s.x, y: s.y }, ang0: s.h, side: s.x < 0 ? 1 : -1 }; cardAt = performance.now() + 4300; }
    }
  }

  // ---- the loop -----------------------------------------------------------------------------------------------------------------------------
  let raf = 0, last = 0, acc = 0, finish, tClock = 0, closed = false;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function hudTick() {
    const f = frameOf(s);
    const word = dockingWord(s);
    if (laneWord.textContent !== word) { laneWord.textContent = word; stLane.dataset.tone = WORD_TONE[word] || ''; }
    const ok = safeAt(s, f.d), fill = speedFill(f.speed, ok), tone = speedTone(f.speed, ok);
    gFill.style.width = `${(100 * fill).toFixed(1)}%`; gTrack.dataset.tone = tone; stSpeed.dataset.tone = tone === 'ok' ? 'ok' : tone;
    const sw = speedWord(f.speed, ok); if (gWord.textContent !== sw) gWord.textContent = sw;
    const lvl = hullLevel(s.hullLost);
    hullFill.style.width = `${100 - s.hullLost}%`; hullTrack.dataset.level = lvl; if (hullWordEl.textContent !== lvl) hullWordEl.textContent = lvl;
    const near = s.done ? 0 : wallNear(s, f), wf = s.outside && !s.done ? 1 - warnFill(s) : 0;
    warnFillEl.style.width = `${(100 * Math.max(wf, near * 0.4)).toFixed(1)}%`; warnTrack.dataset.tone = wf > 0.55 ? 'bad' : near > 0 ? 'warn' : '';
    const ww = s.outside && !s.done ? 'steer back' : near > 0.2 ? 'close' : 'clear'; if (warnWord.textContent !== ww) warnWord.textContent = ww;
    stWarn.dataset.tone = s.outside && !s.done ? 'bad' : near > 0.2 ? 'warn' : '';
    for (let k = 0; k < lamps.length; k++) {
      const lit = k >= s.lightsOut, next = k === s.lightsOut && !s.done && started && (s.lightsOut + 1) * (s.tmax / s.lights) - s.t < 1.6;
      lamps[k].className = lit ? (next ? 'is-last' : 'is-on') : 'is-out';
    }
    stLamps.dataset.tone = s.lightsOut >= s.lights - 1 && !s.done ? 'bad' : s.lightsOut >= s.lights - 3 ? 'warn' : '';
    if (s.outside && !s.done && !warnSaid && s.flash <= 0) { tip.textContent = 'Drifting wide: steer back into the lit corridor before the wall scrapes.'; warnSaid = true; }
    if (!s.outside) warnSaid = false;
  }

  function frame(now) {
    if (closed) return;
    raf = requestAnimationFrame(frame);
    if (!root.isConnected) { close(); return; }              // the host closed the stage: let go of the keys and the sound
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    tClock += dt; acc = Math.min(0.1, acc + dt);
    const inp = frameInput();
    if (!started && !s.done && inp.thrust > 0) { started = true; hint.classList.add('is-gone'); }
    if (started) {
      while (acc >= DOCKING_DT && !s.done) {
        stepDocking(s, DOCKING_DT, inp);
        for (const ev of s.events) handle(ev);
        acc -= DOCKING_DT;
      }
    } else acc = 0;
    if (s.done) { acc = 0; if (!lastDone) { lastDone = true; padOff(); pad.classList.add('is-off'); Object.assign(input, { aim: null, thrust: 0 }); } }
    vt = s.done ? vt + dt : s.t;
    if (s.done && s.result.outcome === OUTCOMES.docked) { const was = clampT; clampT = Math.min(1, clampT + dt * 2.2); if (was < 1 && clampT >= 1) { shake = 6; thump = 0.4; chase = 0; } chase += dt; }
    if (s.done && tug) { tug.t += dt; if (tug.t > 3.5 && clampT < 1) { const was = clampT; clampT = Math.min(1, clampT + dt * 2.2); if (was < 1 && clampT >= 1) { shake = 6; audio?.clamp(); } } }
    if (!s.done && started && s.thrusting && trailAt-- <= 0) { trail.push([s.x, s.y]); if (trail.length > 38) trail.shift(); trailAt = 2; }
    shake = Math.max(0, shake - dt * 40); flashA = Math.max(0, flashA - dt * 2.2); bannerT = Math.max(0, bannerT - dt * 0.7); lampWarn = Math.max(0, lampWarn - dt); thump = Math.max(0, thump - dt);
    for (const p of sparks) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; } sparks = sparks.filter((p) => p.life > 0);
    hudTick();
    if (audio) {
      const f = frameOf(s), inCorr = !s.done && started && f.d < DM + 12 && Math.abs(f.l) <= f.half;
      audio.update({ thrust: s.thrusting && !s.done ? 1 : 0, centred: inCorr ? clamp(1 - Math.abs(f.l) / Math.max(f.half, 0.5), 0, 1) : null, wall: s.done || !started ? 0 : wallNear(s, f), t: tClock });
    }
    draw(dt, tClock);
    if (s.done && !cardUp && cardAt && performance.now() >= cardAt) { cardUp = true; showCard(); }
  }

  // ---- the result card ---------------------------------------------------------------------------------------------------------------------
  function flightLine(r) {
    const W = 220, H = 150, c = h('canvas', { class: 'dk-flight', width: W * 2, height: H * 2, 'aria-label': 'Your approach drawn against the corridor' });
    c.style.width = `${W}px`; c.style.height = `${H}px`;
    const g = c.getContext('2d'); g.scale(2, 2);
    const reach = Math.max(0, ...(r.path || []).map((q) => Math.abs(q[1])), ...(r.marks || []).map((q) => Math.abs(q[1]))), half = clamp(Math.max(s.mouth * 1.9, reach * 1.12), s.mouth * 1.9, s.mouth * 5), dMax = DM + 16, X = (l) => W / 2 + (l / half) * (W / 2 - 8), Y = (d) => 12 + (d / dMax) * (H - 20);   // berth at the top, the mouth at the bottom
    g.fillStyle = '#06101a'; g.fillRect(0, 0, W, H);
    const fl = g.createLinearGradient(0, Y(0), 0, Y(DM)); fl.addColorStop(0, 'rgba(56,214,204,.34)'); fl.addColorStop(1, 'rgba(56,214,204,.06)');
    g.fillStyle = fl; g.beginPath(); g.moveTo(X(-s.berth), Y(0)); g.lineTo(X(-s.mouth), Y(DM)); g.lineTo(X(s.mouth), Y(DM)); g.lineTo(X(s.berth), Y(0)); g.closePath(); g.fill();
    g.strokeStyle = TEAL; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(-s.berth), Y(0)); g.lineTo(X(-s.mouth), Y(DM)); g.moveTo(X(s.berth), Y(0)); g.lineTo(X(s.mouth), Y(DM)); g.stroke();
    g.fillStyle = '#0b1218'; g.strokeStyle = colour; g.fillRect(X(-s.berth) - 3, Y(0) - 9, X(s.berth) - X(-s.berth) + 6, 9); g.strokeRect(X(-s.berth) - 3, Y(0) - 9, X(s.berth) - X(-s.berth) + 6, 9);
    g.setLineDash([2, 4]); g.strokeStyle = 'rgba(200,255,250,.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(0), Y(DM)); g.stroke(); g.setLineDash([]);
    const p = r.path || [];
    if (p.length > 1) {
      for (let i = 1; i < p.length; i++) { const k = i / p.length; g.strokeStyle = `hsl(${175 - 120 * k},85%,62%)`; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(p[i - 1][1]), Y(Math.min(p[i - 1][0], dMax))); g.lineTo(X(p[i][1]), Y(Math.min(p[i][0], dMax))); g.stroke(); }
      const st = p[0]; g.fillStyle = '#d8fffb'; g.beginPath(); g.arc(X(st[1]), Y(Math.min(st[0], dMax)), 2.6, 0, TAU); g.fill();
    }
    for (const m of r.marks || []) { g.strokeStyle = RED; g.fillStyle = 'rgba(255,90,70,.35)'; g.lineWidth = 1.6; g.beginPath(); g.arc(X(m[1]), Y(Math.min(m[0], dMax)), 5, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(X(m[1]) - 3, Y(m[0]) - 3); g.lineTo(X(m[1]) + 3, Y(m[0]) + 3); g.moveTo(X(m[1]) + 3, Y(m[0]) - 3); g.lineTo(X(m[1]) - 3, Y(m[0]) + 3); g.stroke(); }
    return c;
  }
  function meter(cls, pct, tone) { return h('div', { class: `dk-meter ${cls}`, 'data-tone': tone || '' }, h('i', { style: `width:${clamp(pct, 0, 100)}%` })); }
  function showCard() {
    const r = s.result, docked = r.outcome === OUTCOMES.docked;
    const hull = meter('dk-hull', 100 - r.hullLost, ''); hull.dataset.level = hullLevel(r.hullLost);
    const go = h('button', { type: 'button', class: 'dk-pad dk-go', text: docked ? 'Continue' : 'Step back' });
    const line = docked
      ? `${r.scrapes ? `${r.scrapes} scrape${r.scrapes === 1 ? '' : 's'}` : 'No scrapes'} · ${r.xp ? `+${r.xp} Handling XP` : 'no XP'}`
      : `${tryWords(r)} · No XP · Tug fee −${r.fee}`;
    const card = h('div', { class: 'dk-card', role: 'status', 'data-ok': r.success ? '1' : '0', 'data-outcome': r.outcome, 'data-grade': String(r.grade) },
      h('b', { class: 'dk-title', text: gradeWord(r).toUpperCase() }),
      flightLine(r),
      h('p', { class: 'dk-legend', text: r.marks?.length ? 'Your approach: the red marks are scrapes' : 'Your approach, from out in the dark to the berth' }),
      docked ? h('div', { class: 'dk-bars' }, h('div', {}, h('span', { text: 'Grade' }), meter('dk-gradebar', r.grade, r.grade >= PASS ? '' : 'bad')), h('div', {}, h('span', { text: 'Hull' }), hull)) : h('div', { class: 'dk-bars' }, h('div', {}, h('span', { text: 'Hull' }), hull)),
      h('p', { class: 'dk-line', text: line }), go);
    go.addEventListener('click', () => { close(); finish(r); });
    board.append(card); go.focus({ preventScroll: true });
  }
  function close() {
    if (closed) return; closed = true;
    cancelAnimationFrame(raf); ro?.disconnect(); document.removeEventListener('keydown', kd, true); document.removeEventListener('keyup', ku, true);
    audio?.close(); root.remove(); onClose();
  }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  promise.close = close;
  return promise;
}
